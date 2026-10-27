// Los efectos de un registro (ActiveCampaign y Meta CAPI) y la cola de reintentos que vacía envios-cron.
// El estado de cada envío queda en el registro (ac, meta, metaCR); cada falla deja cola/<registro>:<servicio>.
import { obtener, listar, guardar, fusionarSi, borrar } from './almacen.mjs';
import { leerIntegracion } from './integraciones/estado.mjs';
import { obtenerWebinar } from './webinars.mjs';
import * as capi from './integraciones/meta-capi.mjs';
import * as ac from './integraciones/activecampaign.mjs';

export const MAX_INTENTOS = 5;
const ESPERAS = [10, 30, 120, 360].map((m) => m * 60000);   // después del intento 1, 2, 3 y 4
const SIETE_DIAS = 7 * 86400000;                            // Meta no acepta eventos más viejos
const SERVICIOS = ['ac', 'meta', 'metaCR'];
const NOMBRE = { ac: 'ActiveCampaign', meta: 'Meta', metaCR: 'Meta' };

const ahoraISO = () => new Date().toISOString();
// la CAPI necesita token y píxel; en modo demo capi.enviar contesta {ok:true, demo:true} sin salir a la red
const metaLista = (m) => !!m && (m.origen === 'demo' || !!(m.clave && m.pixel));
const fallo = (e) => ({ ok: false, error: String(e?.message || 'Algo falló: se vuelve a intentar'), t: ahoraISO() });
const seguro = (campo, p) => Promise.resolve().then(p).then((r) => [campo, r], (e) => [campo, fallo(e)]);

const encolar = (reg, servicio, error) => guardar('cola', {
  id: `${reg.id}:${servicio}`, registro: reg.id, servicio, intentos: 1, proximo: Date.now() + ESPERAS[0], error: String(error || ''),
});

// evento 'Lead' → AC (si está conectada) + Meta Lead (si hay píxel); 'CompleteRegistration' → solo Meta.
// Lo que no está conectado no se toca (queda null). Nunca tira: lo corre context.waitUntil.
export async function despacharRegistro(reg, { evento = 'Lead' } = {}) {
  try {
    if (!reg?.id) return;
    const tareas = [];
    if (evento === 'CompleteRegistration') {
      const meta = await leerIntegracion('meta');
      if (metaLista(meta)) tareas.push(seguro('metaCR', () => capi.enviar('CompleteRegistration', reg, meta)));
    } else {
      const [integAc, meta] = await Promise.all([leerIntegracion('ac'), leerIntegracion('meta')]);
      if (integAc.conectada) tareas.push(seguro('ac', async () => ac.sincronizar(reg, reg.w ? await obtenerWebinar(reg.w) : null, integAc)));
      if (metaLista(meta)) tareas.push(seguro('meta', () => capi.enviar('Lead', reg, meta)));
    }
    if (!tareas.length) return;
    const cambios = {};
    for (const [campo, r] of await Promise.all(tareas)) {
      cambios[campo] = r;
      if (!r.ok) await encolar(reg, campo, r.error).catch((e) => console.error('envíos: no se pudo encolar', e?.message));
    }
    // si el registro se borró mientras tanto, no se lo vuelve a crear
    await fusionarSi('registros', reg.id, cambios);
  } catch (e) {
    console.error('despacharRegistro:', e?.message || e);
  }
}

// Reintenta lo que venció (proximo <= ahora), de lo más viejo a lo más nuevo, hasta `max` o hasta agotar el
// presupuesto de tiempo (el cron tiene 30 s). Anda → borra de la cola y marca ok. Falla → intentos+1 y espera
// más; con 5 intentos queda en la cola sin próximo (salud lo marca) y el registro sigue ok:false.
// Servicio sin clave (se desconectó) → sus envíos salen de la cola: no hay a dónde mandarlos y salud no tiene que
// pedir que se arregle algo que ya no está. Con clave pero incompleto (p. ej. falta la lista) → esperan sin
// ocupar los `max` lugares y, al completarlo, siguen.
export async function procesarCola({ max = 40, presupuestoMs = 25000 } = {}) {
  const t0 = Date.now();
  const hasta = t0 + presupuestoMs;
  let procesados = 0, errores = 0, descartados = 0;
  const [integAc, meta] = await Promise.all([leerIntegracion('ac'), leerIntegracion('meta')]);
  const integDe = (s) => (s === 'ac' ? integAc : meta);
  const listo = (s) => (s === 'ac' ? integAc.conectada : metaLista(meta));
  const cola = await listar('cola');

  for (const c of cola.filter((x) => SERVICIOS.includes(x.servicio) && !integDe(x.servicio).clave)) {
    if (Date.now() > hasta - 2000) break;
    try {
      await borrar('cola', c.id);
      descartados++;
      // los que ya se habían dejado de reintentar conservan su error
      if (Number(c.intentos) < MAX_INTENTOS && c.registro) {
        await fusionarSi('registros', c.registro, { [c.servicio]: { ok: false, error: `Se dejó de reintentar: ${NOMBRE[c.servicio]} se desconectó`, t: ahoraISO() } });
      }
    } catch (e) {
      errores++;
      console.error('procesarCola:', c.id, e?.message || e);
    }
  }

  // lo de un servicio desconocido entra igual, para sacarlo de la cola
  const vencidos = cola
    .filter((c) => Number(c.intentos) < MAX_INTENTOS && c.proximo != null && Number(c.proximo) <= t0)
    .filter((c) => !SERVICIOS.includes(c.servicio) || listo(c.servicio))
    .sort((a, b) => Number(a.proximo) - Number(b.proximo))
    .slice(0, Math.max(0, Number(max) || 0));
  const webinars = new Map();
  const webinarDe = async (w) => { if (!webinars.has(w)) webinars.set(w, w ? await obtenerWebinar(w) : null); return webinars.get(w); };

  for (const c of vencidos) {
    if (Date.now() > hasta - 2000) break;
    try {
      const reg = c.registro ? await obtener('registros', c.registro) : null;
      // registro borrado, servicio desconocido, o un CompleteRegistration de alguien que no quedó calificado
      if (!reg || !SERVICIOS.includes(c.servicio) || (c.servicio === 'metaCR' && reg.calificado !== true)) {
        await borrar('cola', c.id);
        continue;
      }
      let r;
      if (c.servicio === 'ac') {
        r = await ac.sincronizar(reg, await webinarDe(reg.w), integAc, { hasta });
      } else {
        if (Date.now() - Date.parse(reg.creado) > SIETE_DIAS - 60000) {
          await borrar('cola', c.id);
          await fusionarSi('registros', reg.id, { [c.servicio]: { ok: false, error: 'Se dejó de reintentar: Meta no acepta eventos de más de 7 días', t: ahoraISO() } });
          continue;
        }
        r = await capi.enviar(c.servicio === 'metaCR' ? 'CompleteRegistration' : 'Lead', reg, meta, { hasta });
      }
      procesados++;
      if (r.ok) {
        await borrar('cola', c.id);
      } else {
        errores++;
        const intentos = Number(c.intentos) + 1;
        await fusionarSi('cola', c.id, { intentos, proximo: intentos < MAX_INTENTOS ? Date.now() + ESPERAS[intentos - 1] : null, error: r.error });
      }
      await fusionarSi('registros', reg.id, { [c.servicio]: r });   // solo si sigue existiendo
    } catch (e) {
      errores++;
      console.error('procesarCola:', c.id, e?.message || e);
    }
  }
  return { procesados, errores, descartados };
}
