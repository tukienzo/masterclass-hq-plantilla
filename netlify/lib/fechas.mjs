// Fechas en la zona del negocio. Días 'YYYY-MM-DD', horas 'HH:MM' (24 h), instantes ISO UTC con Z.
// Con datos que no se entienden (no-string, fecha rota) las funciones devuelven false o null, nunca tiran; la única
// que tira a propósito es aUTC (sus llamadores validan antes o la envuelven).

const formatos = new Map();
function partes(ms, zona) {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatos.set(zona, f);
  }
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = value;
  if (p.hour === '24') p.hour = '00';
  return p;
}
const dia = (p) => `${p.year}-${p.month}-${p.day}`;
// Date, ISO o ms; cualquier otra cosa (null incluido, que new Date volvería 1970) → NaN
const aMs = (iso) => (iso instanceof Date ? iso.getTime()
  : typeof iso === 'string' || typeof iso === 'number' ? new Date(iso).getTime() : NaN);

export const hoyLocal = (zona) => dia(partes(Date.now(), zona));
export const mesLocal = (zona) => hoyLocal(zona).slice(0, 7);
// null si el instante no es válido
export function diaLocal(iso, zona) {
  const ms = aMs(iso);
  return Number.isFinite(ms) ? dia(partes(ms, zona)) : null;
}
export function horaLocal(iso, zona) {
  const ms = aMs(iso);
  if (!Number.isFinite(ms)) return null;
  const p = partes(ms, zona);
  return `${p.hour}:${p.minute}`;
}

// cuánto adelanta la zona respecto de UTC en ese instante (ms)
function desfase(ms, zona) {
  const p = partes(ms, zona);
  const pared = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return pared - Math.floor(ms / 1000) * 1000;
}

// Fecha y hora de pared en `zona` → instante UTC. Dos pasadas para respetar el horario de verano.
export function aUTC(fecha, hora, zona) {
  const ver = (v) => (typeof v === 'string' ? v.slice(0, 40) : typeof v);   // sin String() de lo que llegó
  if (!esFecha(fecha) || !esHora(hora)) throw new Error(`aUTC: fecha u hora inválida (${ver(fecha)} ${ver(hora)})`);
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const pared = Date.UTC(y, m - 1, d, hh, mm);
  let t = pared - desfase(pared, zona);
  t = pared - desfase(t, zona);
  return new Date(t).toISOString();
}

// 'YYYY-MM-DD' → ms UTC de ese día; NaN si no es un string con esa forma
const utc = (fecha) => {
  if (typeof fecha !== 'string') return NaN;
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
// fuera del rango de Date (±8,64e15 ms) toISOString tiraría RangeError: null, como el resto
const isoDe = (ms, largo) => (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString().slice(0, largo) : null);

// null si la fecha o n no se entienden
export const sumarDias = (fecha, n) => isoDe(utc(fecha) + Number(n) * 86400000, 10);
export function difDias(a, b) {
  const x = (utc(b) - utc(a)) / 86400000;
  return Number.isFinite(x) ? Math.round(x) : null;
}
export function mesSig(mes, n) {
  if (typeof mes !== 'string') return null;
  const [y, m] = mes.split('-').map(Number);
  return isoDe(Date.UTC(y, m - 1 + Number(n), 1), 7);
}

export function esFecha(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = utc(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
export const esHora = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
