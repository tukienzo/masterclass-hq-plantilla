// /.netlify/functions/salud — la tarjeta "N conexiones" del menú (SPEC §7.14). Sin config.path (D11): el frontend
// la pide por la ruta por defecto. Sin llamadas externas: lee lo guardado (integraciones, último sync y cola).
// La piden shell.js a los 1,2 s (a veces antes de entrar: 401 limpio) y base.js después de route().
import { manejar, json, metodo } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { obtener, listar, driver } from '../lib/almacen.mjs';
import { negocio, enNetlify, INTEGRACIONES } from '../lib/config.mjs';
import { leerIntegracion, estadoPublico } from '../lib/integraciones/estado.mjs';
import { diaLocal, horaLocal } from '../lib/fechas.mjs';

const NOMBRE = { meta: 'Meta Ads', calendly: 'Calendly', iclosed: 'iClosed', fathom: 'Fathom', ia: 'IA (Claude)', ac: 'ActiveCampaign' };
const DE_ESTADO = { ok: 'ok', incompleta: 'pendiente', error: 'mal' };
const HORA = 3600000;

function hace(ms) {
  const min = Math.max(1, Math.round((Date.now() - ms) / 60000));
  return min < 120 ? `hace ${min} min` : min < 2880 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
}

export default manejar(async (req) => {
  metodo(req, ['GET']);
  await requerir(req, ['equipo', 'cliente']);   // el header x-hub-key se ignora: alcanza la cookie

  let zona = 'America/Argentina/Buenos_Aires';
  try { zona = (await negocio()).zona; } catch { /* se informa abajo, en Base de datos */ }
  const fmt = (iso) => {
    const t = iso ? new Date(iso) : null;
    if (!t || Number.isNaN(t.getTime())) return '';
    const d = diaLocal(t, zona);
    return `${d.slice(8, 10)}/${d.slice(5, 7)} ${horaLocal(t, zona)}`;
  };
  const cuando = fmt(new Date());
  const servicios = [];
  const sumar = (nombre, estado, detalle, t = cuando) => servicios.push({ nombre, estado, detalle: detalle || '', cuando: t });

  // siempre: la base y las sesiones (con nada conectado la tarjeta dice "2 conexiones, todas bien")
  let baseAnda = true;
  try { await obtener('ajustes', 'estado'); } catch { baseAnda = false; }
  if (!baseAnda) sumar('Base de datos', 'mal', driver() === 'supabase' ? 'No pude leer los datos: revisá SUPABASE_URL y la clave' : 'No pude leer la carpeta de datos');
  else if (driver() === 'supabase') sumar('Base de datos', 'ok', 'Supabase');
  else if (enNetlify()) sumar('Base de datos', 'mal', 'Los datos se pierden: configurá Supabase');
  else sumar('Base de datos', 'ok', 'Archivos locales (solo para probar)');
  const secreto = process.env.SESION_SECRETO || '';
  if (secreto.length >= 32) sumar('Sesiones', 'ok', 'Cookie firmada');
  else sumar('Sesiones', 'mal', 'Falta SESION_SECRETO (32 caracteres o más)');
  if (!baseAnda) return json({ ok: true, cuando, servicios });

  // cada integración conectada (las que no tienen clave no se listan)
  const I = {}, E = {};
  await Promise.all(INTEGRACIONES.map(async (c) => { [I[c], E[c]] = await Promise.all([leerIntegracion(c), estadoPublico(c)]); }));
  for (const c of INTEGRACIONES) {
    const e = E[c], i = I[c];
    if (e.estado === 'sin') continue;
    const t = fmt(i.doc?.probado);
    if (e.estado === 'error') { sumar(NOMBRE[c], 'mal', e.error, t); continue; }
    if (c === 'meta') {
      if (i.origen === 'demo') { sumar(NOMBRE.meta, 'ok', 'Modo demo: datos de ejemplo'); continue; }
      const env = i.origen === 'env' ? ' (variable de entorno)' : '';
      if (!i.cuenta) sumar(NOMBRE.meta, 'pendiente', 'Falta elegir la cuenta publicitaria' + env, t);
      else sumar(NOMBRE.meta, 'ok', `Cuenta ${i.cuentaNombre || i.cuenta}${i.moneda ? ' · ' + i.moneda : ''}${env}`, t);
      if (!i.pixel) sumar('Píxel de Meta', 'pendiente', 'Falta elegir el píxel', t);
      else if (i.testCode) sumar('Píxel de Meta', 'pendiente', `Modo prueba activo (${i.testCode})`, t);
      else sumar('Píxel de Meta', 'ok', `Píxel ${i.pixelNombre || i.pixel}`, t);
      continue;
    }
    sumar(NOMBRE[c], DE_ESTADO[e.estado] || 'pendiente', e.estado === 'incompleta' ? `Falta elegir ${e.falta.join(' y ')}` : e.detalle, t);
  }

  // calendarios: solo si iClosed o Calendly están conectadas
  const fuentes = ['iclosed', 'calendly'].filter((c) => I[c].conectada);
  if (fuentes.length) {
    const st = (await obtener('ajustes', 'sync-agendas')) || null;
    const t = st?.cuando ? Date.parse(st.cuando) : NaN;
    const errores = fuentes.filter((c) => st?.[c] && !st[c].saltado && st[c].error).map((c) => `${NOMBRE[c]}: ${st[c].error}`);
    if (errores.length) sumar('Calendarios', 'mal', errores.join(' · '), fmt(st.cuando));
    else if (!Number.isFinite(t) || fuentes.some((c) => !st[c] || st[c].saltado)) sumar('Calendarios', 'pendiente', 'Todavía no se sincronizó: se traen solas cada 15 minutos', fmt(st?.cuando));
    else if (Date.now() - t > HORA) sumar('Calendarios', 'pendiente', `La última sincronización fue ${hace(t)}: se traen solas cada 15 minutos`, fmt(st.cuando));
    else sumar('Calendarios', 'ok', `Última sincronización ${hace(t)}`, fmt(st.cuando));
  }

  // envíos de registros: solo si ActiveCampaign o el píxel de Meta están conectados
  if (I.ac.conectada || (I.meta.clave && I.meta.pixel && I.meta.origen !== 'demo')) {
    // lo de un servicio que ya no tiene clave no cuenta: envios-cron lo saca de la cola en la próxima vuelta
    const conClave = (s) => (s === 'ac' ? !!I.ac.clave : s === 'meta' || s === 'metaCR' ? !!I.meta.clave : false);
    const cola = (await listar('cola')).filter((x) => conClave(x.servicio));
    const trabados = cola.filter((x) => Number(x.intentos) >= 3);
    if (trabados.length) {
      const a = [...new Set(trabados.map((x) => (x.servicio === 'ac' ? 'ActiveCampaign' : 'Meta')))].join(' y ');
      const n = trabados.length;
      sumar('Envíos de registros', 'mal', `${n} ${n === 1 ? 'envío falló' : 'envíos fallaron'} 3 veces o más (${a}): revisá la conexión en Integraciones`);
    } else {
      sumar('Envíos de registros', 'ok', cola.length ? `${cola.length} en cola para reintentar` : 'Sin pendientes');
    }
  }

  return json({ ok: true, cuando, servicios });
});
