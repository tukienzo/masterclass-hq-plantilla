// Los 20 países del form de la landing y la normalización a E.164 (tabla liviana de largos, sin libphonenumber).
import { digitos } from './normalizar.mjs';

// [iso, nombre, prefijo, largoMin, largoMax] — largo nacional después de sacar el 0 inicial
export const PAISES = [
  ['AR', 'Argentina', '54', 10, 11], ['BO', 'Bolivia', '591', 8, 8], ['CL', 'Chile', '56', 9, 9], ['CO', 'Colombia', '57', 10, 10],
  ['CR', 'Costa Rica', '506', 8, 8], ['DO', 'Rep. Dominicana', '1', 10, 10], ['EC', 'Ecuador', '593', 9, 9], ['ES', 'España', '34', 9, 9],
  ['GT', 'Guatemala', '502', 8, 8], ['HN', 'Honduras', '504', 8, 8], ['MX', 'México', '52', 10, 10], ['NI', 'Nicaragua', '505', 8, 8],
  ['PA', 'Panamá', '507', 8, 8], ['PE', 'Perú', '51', 9, 9], ['PR', 'Puerto Rico', '1', 10, 10], ['PY', 'Paraguay', '595', 9, 9],
  ['SV', 'El Salvador', '503', 8, 8], ['US', 'Estados Unidos', '1', 10, 10], ['UY', 'Uruguay', '598', 8, 8], ['VE', 'Venezuela', '58', 10, 10],
];
const POR_ISO = new Map(PAISES.map((p) => [p[0], p]));

export const esPais = (iso) => POR_ISO.has(String(iso || '').toUpperCase());

const listo = (e164) => ({ e164, digitos: e164.slice(1) });

// Número como lo tipea la persona (con o sin código de país, con 0 o 15) → E.164. null si no valida.
export function normalizar(pais, numero) {
  const p = POR_ISO.get(String(pais || '').toUpperCase());
  if (!p) return null;
  const [iso, , pref, min, max] = p;
  let d = digitos(numero);
  if (d.startsWith('00')) d = d.slice(2);                         // 00 = salida internacional
  if (d.startsWith(pref) && d.length - pref.length >= min && d.length > max) d = d.slice(pref.length);
  if (d.startsWith('0')) d = d.slice(1);
  if (iso === 'AR') {
    // 011 15 5555-1234 → el 15 de celular va después del código de área (2 a 4 dígitos)
    if (d.length === 12) for (const i of [2, 3, 4]) if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break; }
    if (d.length === 10) return listo('+549' + d);                 // wa.me necesita el 9 de móvil
    if (d.length === 11 && d[0] === '9') return listo('+54' + d);
    return null;
  }
  if (iso === 'MX') {
    if (d.length === 11 && d[0] === '1') d = d.slice(1);           // el 1 de móvil del formato viejo
    return d.length === 10 ? listo('+52' + d) : null;
  }
  return d.length >= min && d.length <= max ? listo('+' + pref + d) : null;
}

// Para teléfonos de calendarios u otras fuentes: con '+' o '00' se toman los dígitos tal cual; si no, se intenta
// con el país por defecto y después con el país cuyo prefijo aparece adelante. Si nada sirve, ''.
export function normalizarLibre(s, paisPorDefecto) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return '';
  if (t.startsWith('+') || t.startsWith('00')) {
    let d = digitos(t);
    if (t.startsWith('00')) d = d.slice(2);
    return d.length >= 8 && d.length <= 15 ? '+' + d : '';
  }
  const r = normalizar(paisPorDefecto, t);
  if (r) return r.e164;
  const d = digitos(t);
  for (const [iso, , pref, , max] of PAISES) {
    if (d.startsWith(pref) && d.length > max) {
      const x = normalizar(iso, d);
      if (x) return x.e164;
    }
  }
  return '';
}
