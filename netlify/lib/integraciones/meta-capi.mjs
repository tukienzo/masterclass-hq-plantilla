// Meta Conversions API: el Lead de cada registro, el CompleteRegistration de los calificados y el evento de
// prueba del modo prueba. integ = leerIntegracion('meta'). El token va solo en la URL del pedido: nunca se loguea.
import { createHash, randomUUID } from 'node:crypto';
import { digitos } from '../normalizar.mjs';

const ESPERA = 15000;
const UA_PRUEBA = 'Mozilla/5.0 (Masterclass HQ; evento de prueba)';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const limpio = (s) => String(s == null ? '' : s).trim().toLowerCase();
const ahoraISO = () => new Date().toISOString();
// hasta = instante (ms) en el que hay que cortar sí o sí (el cron tiene 30 s)
const senal = (hasta) => AbortSignal.timeout(Math.max(1000, Math.min(ESPERA, hasta ? hasta - Date.now() : ESPERA)));

// suma un campo de user_data con hash, solo si hay algo
function conHash(ud, clave, valor) {
  const v = limpio(valor);
  if (v) ud[clave] = [sha(v)];
}

function userData(reg) {
  const ud = {};
  const [nombre, ...resto] = limpio(reg.nombre).split(/\s+/);
  conHash(ud, 'em', reg.email);
  conHash(ud, 'ph', digitos(reg.whatsapp));
  conHash(ud, 'fn', nombre);
  conHash(ud, 'ln', resto.join(' '));
  conHash(ud, 'country', reg.pais);
  conHash(ud, 'external_id', reg.id);
  const ip = String(reg.ip || '').trim();
  if (ip && ip !== '0.0.0.0') ud.client_ip_address = ip;
  if (reg.ua) ud.client_user_agent = String(reg.ua);
  if (reg.fbp) ud.fbp = String(reg.fbp);
  if (reg.fbc) ud.fbc = String(reg.fbc);
  return ud;
}

function armarEvento(nombre, reg) {
  const t = Date.parse(reg.creado);
  const e = {
    event_name: nombre,
    event_time: Math.floor((Number.isNaN(t) ? Date.now() : t) / 1000),
    event_id: nombre === 'CompleteRegistration' ? reg.eventIdCR || `${reg.eventId || reg.id}-cr` : reg.eventId || reg.id,
    action_source: 'website',
    user_data: userData(reg),
  };
  if (reg.url) e.event_source_url = String(reg.url);
  return e;
}

// red o 5xx: los envíos de registros se reintentan solos (cola); el evento de prueba no, lo vuelve a mandar la persona
const SIN_RESPUESTA = { enviar: 'Meta no respondió: se vuelve a intentar', probar: 'Meta no respondió: probá de nuevo' };

function mensajeDeMeta(status, j, modo) {
  const m = j?.error?.message;
  if (m) return String(m).slice(0, 300);
  if (status === 401 || status === 403) return 'El token de Meta no es válido';
  return status >= 500 ? SIN_RESPUESTA[modo] : `Meta rechazó el evento (${status})`;
}

// Manda los eventos al píxel. Tira Error con un mensaje legible si Meta no los recibió.
async function mandar(integ, eventos, { testCode = '', hasta, modo = 'enviar' } = {}) {
  const pixel = String(integ?.pixel || '');
  const token = integ?.capiToken || integ?.clave || '';
  if (!/^\d{5,20}$/.test(pixel)) throw new Error(pixel ? 'El píxel de Meta no es válido' : 'Primero elegí el píxel');
  if (!token) throw new Error('Falta el token de Meta');
  const version = /^v\d+\.\d+$/.test(integ.version || '') ? integ.version : 'v26.0';
  const cuerpo = { data: eventos };
  if (testCode) cuerpo.test_event_code = String(testCode);
  let r;
  try {
    r = await fetch(`https://graph.facebook.com/${version}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo), signal: senal(hasta),
    });
  } catch {
    throw new Error(SIN_RESPUESTA[modo]);
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok && Number(j?.events_received) >= 1) return j;
  throw new Error(r.ok ? 'Meta no confirmó el evento' : mensajeDeMeta(r.status, j, modo));
}

// evento: 'Lead' | 'CompleteRegistration'. Nunca tira: {ok:true, t} | {ok:false, error, t}
export async function enviar(evento, reg, integ, { hasta } = {}) {
  if (integ?.origen === 'demo') return { ok: true, t: ahoraISO(), demo: true };   // modo demo: no sale nada
  try {
    if (!reg?.id) throw new Error('Registro inválido');
    const nombre = evento === 'CompleteRegistration' ? 'CompleteRegistration' : 'Lead';
    await mandar(integ, [armarEvento(nombre, reg)], { testCode: integ?.testCode || '', hasta });
    return { ok: true, t: ahoraISO() };
  } catch (e) {
    return { ok: false, error: String(e?.message || 'No se pudo mandar el evento a Meta'), t: ahoraISO() };
  }
}

// Un PageView de prueba con test_event_code. Tira Error con el mensaje de Meta si lo rechaza.
export async function eventoPrueba(testCode, integ) {
  if (integ?.origen === 'demo') return;
  if (!/^[A-Za-z0-9]{4,30}$/.test(String(testCode || ''))) throw new Error('Pegá el código de Eventos de prueba (letras y números)');
  if (!integ?.clave || !integ?.pixel) throw new Error('Primero elegí el píxel');
  const ud = { em: [sha('prueba@example.com')], client_ip_address: '127.0.0.1', client_user_agent: UA_PRUEBA };
  await mandar(integ, [{
    event_name: 'PageView', event_time: Math.floor(Date.now() / 1000), event_id: 'prueba-' + randomUUID(),
    action_source: 'website', user_data: ud,
  }], { testCode, modo: 'probar' });
}
