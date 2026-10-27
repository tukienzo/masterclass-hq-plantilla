// iClosed (§8.5): probar la API key y traer las llamadas para el sync de agendas (§7.5.4).
// GET https://public.api.iclosed.io/v1/eventCalls?eventType=UPCOMING|PAST&limit=50&page=N (la página 0 es lo más
// nuevo), Bearer <key>. Con ráfagas devuelve 429: una espera de 2 s y un reintento; si vuelve, se corta.
// Cómo marca iClosed una llamada cancelada no está documentado (§13 #40): se busca "cancel" en status/callStatus/outcome.
// Los Error que tira llevan legible: true (el mensaje es para la persona); el sync muestra solo esos.
import { aUTC, esFecha } from '../fechas.mjs';

const BASE = 'https://public.api.iclosed.io/v1';
const NO_RESPONDE = 'El servicio no respondió: probá de nuevo';
const POR_PAGINA = 50;
const MAX_PAGINAS = 60;   // tope de seguridad para UPCOMING (3.000 llamadas por delante)
const PAGINAS_PASADAS = 3;
const MAX_TIMEOUT = 15000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const legible = (mensaje) => Object.assign(new Error(mensaje), { legible: true });

// GET con presupuesto: {datos} | {corte:true} (se acabó el tiempo o un 429 que se repitió). Errores → Error legible.
async function pedir(url, clave, limite) {
  for (let intento = 0; ; intento++) {
    const resta = limite - Date.now();
    if (resta < 800) return { corte: true };
    let r;
    try {
      r = await fetch(url, {
        headers: { Authorization: 'Bearer ' + clave, Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.min(MAX_TIMEOUT, resta)),
      });
    } catch {
      if (Date.now() >= limite - 100) return { corte: true };
      throw legible(NO_RESPONDE);
    }
    if (r.status === 429) {
      if (intento || Date.now() + 2000 > limite - 800) return { corte: true };
      await dormir(2000);
      continue;
    }
    if (r.status === 401 || r.status === 403) throw legible('La clave no es válida');
    if (r.status >= 500) throw legible(NO_RESPONDE);
    let datos = null;
    try { datos = await r.json(); } catch { if (r.ok) throw legible(NO_RESPONDE); }
    if (!r.ok) {
      const m = String((datos && (datos.message || datos.error)) || '').slice(0, 140);
      throw legible(`iClosed rechazó el pedido (${r.status})${m ? ': ' + m : ''}`);
    }
    return { datos: datos || {} };
  }
}

const url = (tipo, pagina, limite = POR_PAGINA) => `${BASE}/eventCalls?eventType=${tipo}&limit=${limite}&page=${pagina}`;
const llamadas = (d) => {
  const x = (d && d.data && d.data.eventCalls) || (d && d.eventCalls) || (d && Array.isArray(d.data) ? d.data : null);
  return Array.isArray(x) ? x : [];
};

// cred = {clave} → {detalle}
export async function probar(cred) {
  const clave = String((cred && cred.clave) || '').trim();
  if (!clave) throw legible('Pegá la clave');
  const r = await pedir(url('UPCOMING', 0, 1), clave, Date.now() + MAX_TIMEOUT);
  if (r.corte) throw legible('iClosed está limitando los pedidos: probá en un minuto');
  return { detalle: 'Conectada' };
}

const str = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());

// el primer answer|value|label|text no vacío, buscando en profundidad (también en sus plurales; las listas se
// unen con coma). La pregunta (statement, question) no se mira: si no, su texto saldría como respuesta.
function valor(x, hondo = 0) {
  if (x == null || hondo > 5) return '';
  if (typeof x !== 'object') return str(x);
  if (Array.isArray(x)) return x.map((y) => valor(y, hondo + 1)).filter(Boolean).join(', ');
  for (const k of ['answer', 'answers', 'value', 'values', 'label', 'text']) {
    const v = valor(x[k], hondo + 1);
    if (v) return v;
  }
  return '';
}
const pregunta = (q) => (q && typeof q === 'object' ? str(q.statement) || str(q.question) || str(q.text) || str(q.label) : str(q));

function respuestas(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map((x) => ({ pregunta: x && typeof x === 'object' ? str(x.statement) || pregunta(x.question) : '', respuesta: valor(x) }))
    .filter((x) => x.pregunta && x.respuesta);
}

const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
function utmDe(u) {
  const out = Object.fromEntries(UTMS.map((k) => [k, '']));
  const pares = Array.isArray(u) ? u.map((x) => [x && x.utmKey, x && x.utmValue]) : u && typeof u === 'object' ? Object.entries(u) : [];
  for (const [k, v] of pares) {
    let c = str(k).toLowerCase();
    if (c && !c.startsWith('utm_')) c = 'utm_' + c;
    if (UTMS.includes(c) && !out[c]) out[c] = str(v);
  }
  return out;
}

// Un instante ISO. dateTimeUTC (sin zona = UTC); si falta, dateTime como hora de pared de la zona del negocio.
function inicioDe(c, zona) {
  const enUTC = (s) => {
    if (typeof s === 'number') return Number.isFinite(s) ? new Date(s).toISOString() : '';
    const t = str(s);
    if (!t) return '';
    const sinZona = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t);
    const n = Date.parse(sinZona ? t.replace(' ', 'T') + 'Z' : t);
    return Number.isFinite(n) ? new Date(n).toISOString() : '';
  };
  const u = enUTC(c.dateTimeUTC);
  if (u) return u;
  const t = str(c.dateTime);
  if (!t) return '';
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(t)) return enUTC(t);
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m || !esFecha(m[1])) return '';
  try { return aUTC(m[1], `${m[2]}:${m[3]}`, zona); } catch { return ''; }
}

function aReserva(c, zona) {
  if (!c || typeof c !== 'object') return null;
  const id = str(c.id) || str(c.callId);
  const inicio = inicioDe(c, zona);
  if (!id || !inicio) return null;
  const contacto = c.contact && typeof c.contact === 'object' ? c.contact : {};
  const user = c.user && typeof c.user === 'object' ? c.user : {};
  return {
    fuenteId: 'iclosed:' + id,
    CalendlyID: id,
    Nombre: str(c.inviteeName) || [str(contacto.firstName), str(contacto.lastName)].filter(Boolean).join(' '),
    Email: str(c.inviteeEmail) || str(contacto.email),
    WhatsApp: str(c.phoneNumber) || str(contacto.phone),
    inicio,
    Evento: str(c.event && c.event.name) || str(c.eventType),
    Closer: [str(user.firstName), str(user.lastName)].join(' ').trim(),
    Timestamp: str(c.createdAt),
    cancelada: ['status', 'callStatus', 'outcome'].some((k) => /cancel/i.test(str(c[k]))),
    respuestas: respuestas(c.secondaryAnswers || c.questions),
    utm: utmDe(c.utm),
  };
}

// opciones = {presupuestoMs} → {reservas, parcial}: UPCOMING hasta una página corta y PAST hasta 3 páginas.
// Si algo falla tira Error(mensaje) con e.reservas = lo que ya había llegado.
export async function traer({ presupuestoMs = 20000 } = {}, integ, negocio) {
  const limite = Date.now() + presupuestoMs;
  const zona = (negocio && negocio.zona) || 'UTC';
  const reservas = new Map();
  let parcial = false;
  try {
    tipos: for (const [tipo, max] of [['UPCOMING', MAX_PAGINAS], ['PAST', PAGINAS_PASADAS]]) {
      for (let p = 0; p < max; p++) {
        const r = await pedir(url(tipo, p), integ.clave, limite);
        if (r.corte) { parcial = true; break tipos; }
        const calls = llamadas(r.datos);
        for (const c of calls) { const x = aReserva(c, zona); if (x) reservas.set(x.fuenteId, x); }
        if (calls.length < POR_PAGINA) break;
        if (tipo === 'UPCOMING' && p === max - 1) parcial = true;   // quedan más de las que entran en el tope
      }
    }
  } catch (e) {
    e.reservas = [...reservas.values()];
    throw e;
  }
  return { reservas: [...reservas.values()], parcial };
}
