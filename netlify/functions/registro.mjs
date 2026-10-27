// /api/registro — el form de la landing. Paso 1 (sin `paso`): el alta con los datos de contacto. Paso 2
// (`paso:'respuestas'`): las respuestas de calificación. Público y sin sesión. El navegador solo mira el
// status: todo error va con status no 2xx y un código corto en `error` (nombre, email, whatsapp…).
import { createHash, randomUUID } from 'node:crypto';
import { manejar, json, error, leerJSON, ipDe } from '../lib/http.mjs';
import { negocio, env } from '../lib/config.mjs';
import { obtener, listar, guardar, fusionarSi, incrementar } from '../lib/almacen.mjs';
import { firmar, verificarFirma } from '../lib/sesion.mjs';
import { normalizar, esPais } from '../lib/telefono.mjs';
import { email as normEmail, texto, tel8, nuevoId } from '../lib/normalizar.mjs';
import { diaLocal } from '../lib/fechas.mjs';
import { obtenerWebinar, terminado } from '../lib/webinars.mjs';
import { calificar, limpiarUtm, preguntasDe, webinarEnLanding } from '../lib/registros.mjs';
import { despacharRegistro } from '../lib/envios.mjs';

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_EVENTO = /^[\w-]{8,64}$/;
// alta doble a la vez (doble clic, dos pestañas): la segunda espera a que aparezca la primera
const ESPERA_PREVIO = 2000, PASO_PREVIO = 150;

const lleno = (v) => (typeof v === 'string' ? v.trim() !== '' : v != null && v !== false);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// en el id del candado no va el email ni el teléfono en claro (y un email largo pasaría los 200 del id)
const huella = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 32);

// los efectos corren después de responder; sin waitUntil (otro runtime) se esperan acá
function despues(context, p) {
  if (typeof context?.waitUntil === 'function') context.waitUntil(p);
  else return p;
}

// el registro se cierra a inicio + duracionMin; un webinar con fecha u hora rota también queda cerrado
function cerrado(w, neg) {
  try {
    return terminado(w, neg, Date.now());
  } catch {
    return true;
  }
}

// ya estaba anotado en este webinar (mismo email o mismo WhatsApp)
async function previoDe(w, mail, e164) {
  const [porMail, porTel] = await Promise.all([
    listar('registros', { donde: { w, email: mail } }),
    listar('registros', { donde: { w, whatsapp: e164 } }),
  ]);
  return porMail[0] || porTel[0] || null;
}

// el duplicado no cambia nada y no devuelve ref ni firma: con el email de otro no se contesta su paso 2
// (el navegador solo los usa con nuevo:true)
const yaAnotado = (previo, eventId) => json({ ok: true, nuevo: false, eventId: previo.eventId || eventId, preguntas: false, ref: '', firma: '' });

async function alta(c, req, context) {
  const eventId = typeof c.eventId === 'string' && RE_EVENTO.test(c.eventId) ? c.eventId : randomUUID();
  // 1 · honeypot: éxito para el bot, sin guardar ni mandar nada
  if (lleno(c.hp)) return json({ ok: true, nuevo: false, eventId, preguntas: false, ref: '', firma: '' });

  // la firma antes de cualquier efecto: sin SESION_SECRETO tira acá (500) sin haber guardado ni mandado nada
  const id = nuevoId('r_');
  const firma = firmar('registro', id);

  // 2 · límite por IP y por hora (UTC)
  const ip = texto(ipDe(req, context), 64);
  const limite = Number.parseInt(env('REGISTRO_LIMITE_HORA', '20'), 10) || 20;
  const hora = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  if ((await incrementar('limites', `reg:${ip}:${hora}`)) > limite) return error(429, 'demasiados');

  // 3 · webinar activo y abierto
  const [neg, w] = await Promise.all([negocio(), webinarEnLanding()]);
  if (!w || cerrado(w, neg)) return error(410, 'cerrado');

  // 4 a 6 · datos de contacto
  const nombre = texto(typeof c.nombre === 'string' ? c.nombre : '', 200).replace(/\s+/g, ' ');
  if (nombre.length < 2 || nombre.length > 80) return error(400, 'nombre');
  const mail = normEmail(typeof c.email === 'string' ? c.email : '');
  if (mail.length > 254 || !RE_EMAIL.test(mail)) return error(400, 'email');
  const pais = esPais(c.pais) ? String(c.pais).toUpperCase() : neg.pais;
  const tel = normalizar(pais, typeof c.whatsapp === 'string' || typeof c.whatsapp === 'number' ? texto(c.whatsapp, 40) : '');
  if (!tel) return error(400, 'whatsapp');

  // dedupe: no se toca nada del que ya estaba
  const previo = await previoDe(w.id, mail, tel.e164);
  if (previo) return yaAnotado(previo, eventId);

  // candado atómico por email y por WhatsApp: si otra alta igual llegó antes, se espera su registro.
  // Si no aparece (esa falló o el registro se borró), se sigue: mejor un registro de más que una persona trabada.
  // Los candados se limpian con los límites (48 h); el dedupe de arriba cubre lo que venga después.
  const turnos = await Promise.all([`alta:${w.id}:${huella(mail)}`, `alta:${w.id}:${huella(tel.e164)}`].map((k) => incrementar('limites', k)));
  if (turnos.some((n) => n > 1)) {
    for (let t = 0; t < ESPERA_PREVIO; t += PASO_PREVIO) {
      await dormir(PASO_PREVIO);
      const p = await previoDe(w.id, mail, tel.e164);
      if (p) return yaAnotado(p, eventId);
    }
  }

  const reg = await guardar('registros', {
    id, w: w.id, dia: diaLocal(new Date(), neg.zona), nombre, email: mail, pais, whatsapp: tel.e164, tel8: tel8(tel.e164),
    utm: limpiarUtm(c.utm), eventId, eventIdCR: null,
    fbp: texto(typeof c.fbp === 'string' ? c.fbp : '', 500), fbc: texto(typeof c.fbc === 'string' ? c.fbc : '', 500),
    url: texto(typeof c.url === 'string' ? c.url : '', 500), referrer: texto(typeof c.ref === 'string' ? c.ref : '', 500),
    ip, ua: texto(req.headers.get('user-agent'), 300), paisGeo: texto(context?.geo?.country?.code, 8),
    respuestas: {}, respondio: false, calificado: null, ac: null, meta: null, metaCR: null,
  });

  await despues(context, despacharRegistro(reg, { evento: 'Lead' }));
  return json({ ok: true, nuevo: true, eventId, preguntas: preguntasDe(w.landing).length > 0, ref: reg.id, firma });
}

async function respuestas(c, context) {
  const ref = typeof c.ref === 'string' ? c.ref : '';
  if (!ref || !verificarFirma('registro', ref, c.firma)) return error(403, 'firma');
  const reg = await obtener('registros', ref);
  if (!reg) return error(404, 'otro');
  if (reg.respondio === true) return error(409, 'otro');   // se acepta una sola vez
  // dos pedidos a la vez (la landing vuelve a mandar con cada toque hasta irse): pasa solo el primero.
  // Si se limpia el contador (48 h), queda el chequeo de respondio.
  const candado = `p2:${reg.id}`;
  if ((await incrementar('limites', candado)) > 1) return error(409, 'otro');

  let nuevo, calificado, eventIdCR;
  try {
    // solo las respuestas a preguntas actuales del webinar del registro y con una opción que existe
    const w = reg.w ? await obtenerWebinar(reg.w) : null;
    const preguntas = preguntasDe(w?.landing);
    const dadas = objeto(c.respuestas);
    const validas = {};
    for (const p of preguntas) {
      const v = Object.hasOwn(dadas, p.id) ? dadas[p.id] : null;
      if (typeof v === 'string' && p.opciones.includes(v)) validas[p.id] = v;
    }
    calificado = calificar(preguntas, validas);
    eventIdCR = calificado === true ? `${reg.eventId || reg.id}-cr` : null;
    // fusionarSi: si el registro se borró después del obtener, no se vuelve a crear con solo las respuestas
    nuevo = await fusionarSi('registros', reg.id, { respuestas: validas, respondio: true, calificado, eventIdCR });
  } catch (e) {
    await incrementar('limites', candado, 'n', -1).catch(() => {});   // no se guardó: que pueda volver a intentar
    throw e;
  }
  if (!nuevo) {
    await incrementar('limites', candado, 'n', -1).catch(() => {});
    return error(404, 'otro');
  }
  if (calificado === true) await despues(context, despacharRegistro(nuevo, { evento: 'CompleteRegistration' }));
  return json({ ok: true, calificado, eventId: eventIdCR });
}

export default manejar(async (req, context) => {
  if (req.method !== 'POST') return error(405, 'Método no permitido');
  const c = await leerJSON(req, { max: 8 * 1024 });
  return c.paso === 'respuestas' ? respuestas(c, context) : alta(c, req, context);
});

export const config = { path: '/api/registro' };
