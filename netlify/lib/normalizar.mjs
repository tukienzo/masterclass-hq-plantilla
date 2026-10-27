// Normalizaciones chicas que usan todos los paquetes. Las que tienen gemela en el frontend son idénticas a esa.
import { randomInt } from 'node:crypto';

// Lo que viene del pedido puede ser cualquier cosa: solo string, number y boolean se pasan a texto. Un objeto daría
// '[object Object]' y un array muy anidado tira RangeError con String().
const simple = (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const aTexto = (v) => (simple(v) ? String(v) : '');

// Igual a crm.js / finanzas.js: minúsculas, sin tildes, solo [a-z0-9 ] y espacios simples (lo que no es simple → '')
export const norm = (s) => aTexto(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Igual a utms.js: las macros de Meta ({{ad.name}}) quedan tal cual; el resto en minúsculas y con guiones
const esMacro = (v) => /^\{\{[\w.]+\}\}$/.test(v);
export function normUtm(v) {
  const s = aTexto(v).trim();
  return esMacro(s) ? s : s.toLowerCase().replace(/\s+/g, '-');
}

export function slug(s) {
  return norm(s).replace(/ /g, '-').slice(0, 60).replace(/-+$/, '');
}

// La lógica de num() de ads.js ("1.500" = 1500, "1,5" = 1.5, "US$ 2.300,50" = 2300.5), pero lo vacío es null
// (y lo que no es string ni number también)
export function monto(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = (s.split(',').length > 2 || s.length - lc - 1 === 3) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (ld > -1) s = (s.split('.').length > 2 || s.length - ld - 1 === 3) ? s.replace(/\./g, '') : s;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export const email = (s) => aTexto(s).trim().toLowerCase();
export const digitos = (s) => aTexto(s).replace(/\D/g, '');
export function tel8(s) {
  const d = digitos(s);
  return d.length >= 8 ? d.slice(-8) : '';
}

export const idSeguro = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);

const ALFA = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function azar(n, alfabeto = ALFA) {
  let s = '';
  for (let i = 0; i < n; i++) s += alfabeto[randomInt(alfabeto.length)];
  return s;
}
export const nuevoId = (prefijo = '') => prefijo + Date.now().toString(36) + azar(6);

export const texto = (s, max = 2000) => aTexto(s).trim().slice(0, max);

// '' → ''; https:// válida → la URL (recortada); cualquier otra cosa → null
export function httpsUrl(s) {
  const t = aTexto(s).trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    return u.protocol === 'https:' && u.hostname ? t : null;
  } catch {
    return null;
  }
}
