// Registros de la landing: cargarlos, calificarlos, resumirlos (por día, por fuente, envíos) y el cruce con
// las agendas. Lo usan /api/registro, /api/tablero, la pantalla Registros y los paquetes de agendas, ads e ICP.
import { listar } from './almacen.mjs';
import { webinarActivoId } from './config.mjs';
import { diaLocal, esFecha } from './fechas.mjs';
import { normUtm, texto, idSeguro } from './normalizar.mjs';
import { obtenerWebinar } from './webinars.mjs';

export const UTM_CLAVES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
export const SIN_UTM = '(sin UTM)';

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const valorUtm = (v) => (typeof v === 'string' || typeof v === 'number' ? v : '');

// Las 5 claves siempre presentes, '' cuando faltan (lo que sale hacia el navegador)
export const utmCompleta = (u) => Object.fromEntries(UTM_CLAVES.map((k) => [k, typeof objeto(u)[k] === 'string' ? u[k] : '']));

// Lo que llega del form: solo las 5 claves, hasta 300 caracteres y con normUtm (igual que utms.js)
export const limpiarUtm = (u) => Object.fromEntries(UTM_CLAVES.map((k) => [k, normUtm(texto(valorUtm(objeto(u)[k]), 300))]));

// El webinar que está "en la landing" (ajustes/estado.webinarActivo), o null
export async function webinarEnLanding() {
  const id = await webinarActivoId();
  return id ? obtenerWebinar(id) : null;
}

// Las preguntas que se pueden contestar (las usan /api/publico y los dos pasos de /api/registro): con id seguro
// y único y al menos una opción (una sin opciones dejaría trabado el paso 2). Máx. 8 opciones (A–H).
export function preguntasDe(landing) {
  const ps = Array.isArray(objeto(landing).preguntas) ? landing.preguntas : [];
  const vistos = new Set();
  const r = [];
  for (const p of ps) {
    if (!p || typeof p !== 'object') continue;
    const id = idSeguro(p.id) ? p.id : '';
    const opciones = (Array.isArray(p.opciones) ? p.opciones : []).filter((o) => typeof o === 'string' && o.trim()).slice(0, 8);
    if (!id || vistos.has(id) || !opciones.length) continue;
    vistos.add(id);
    const calificadas = (Array.isArray(p.calificadas) ? p.calificadas : []).filter((o) => opciones.includes(o));
    r.push({ id, texto: String(p.texto || ''), opciones, calificadas });
  }
  return r;
}

export async function cargarRegistros(filtro = {}) {
  const w = filtro && filtro.w != null && filtro.w !== '' ? String(filtro.w) : '';
  return listar('registros', w ? { donde: { w } } : {});
}

// Cuentan las preguntas con opciones marcadas. Ninguna → null. Si no, true solo si en cada una eligió una marcada.
export function calificar(preguntas, respuestas) {
  const cuentan = (Array.isArray(preguntas) ? preguntas : []).filter((p) => Array.isArray(p?.calificadas) && p.calificadas.length);
  if (!cuentan.length) return null;
  const rs = objeto(respuestas);
  return cuentan.every((p) => Object.hasOwn(rs, p.id) && p.calificadas.includes(rs[p.id]));
}

const respondio = (r) => r.respondio === true || (r.respondio == null && Object.keys(objeto(r.respuestas)).length > 0);
const diaDe = (r, zona) => (esFecha(r.dia) ? r.dia : r.creado && !Number.isNaN(Date.parse(r.creado)) ? diaLocal(r.creado, zona) : '');
const fuenteDe = (r) => (typeof r.utm?.utm_source === 'string' && r.utm.utm_source.trim()) || SIN_UTM;

// Agregados de una lista de registros. Con Map + fromEntries: una utm_source "__proto__" no rompe nada.
export function resumen(regs, zona) {
  const porDia = new Map(), porFuente = new Map();
  const envios = { ac: { ok: 0, mal: 0 }, meta: { ok: 0, mal: 0 } };
  let total = 0, calificados = 0, respondieron = 0;
  for (const r of Array.isArray(regs) ? regs : []) {
    if (!r) continue;
    const cal = r.calificado === true ? 1 : 0, resp = respondio(r) ? 1 : 0;
    total++; calificados += cal; respondieron += resp;
    const dia = diaDe(r, zona);
    if (dia) {
      const d = porDia.get(dia) || { n: 0, cal: 0 };
      d.n++; d.cal += cal;
      porDia.set(dia, d);
    }
    const src = fuenteDe(r);
    const f = porFuente.get(src) || { n: 0, cal: 0, resp: 0 };
    f.n++; f.cal += cal; f.resp += resp;
    porFuente.set(src, f);
    for (const k of ['ac', 'meta']) {
      if (r[k]?.ok === true) envios[k].ok++;
      else if (r[k] && r[k].ok === false) envios[k].mal++;
    }
  }
  const dias = [...porDia].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    total, calificados, respondieron,
    porDia: Object.fromEntries(dias.map(([k, v]) => [k, v.n])),
    porDiaCal: Object.fromEntries(dias.map(([k, v]) => [k, { n: v.n, cal: v.cal }])),
    porFuente: Object.fromEntries([...porFuente].map(([k, v]) => [k, v.n])),
    porFuenteDet: Object.fromEntries([...porFuente].map(([k, v]) => [k, { ...v }])),
    envios,
  };
}

// Lo que va en _registro de cada fila del pipeline: sin datos personales
export const cruceDe = (reg) => ({
  w: reg?.w || '',
  utm: utmCompleta(reg?.utm),
  respuestas: { ...objeto(reg?.respuestas) },
  calificado: reg?.calificado === true ? true : reg?.calificado === false ? false : null,
  creado: reg?.creado || '',
});
