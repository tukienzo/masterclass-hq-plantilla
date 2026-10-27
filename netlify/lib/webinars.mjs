// Los webinars: leer, listar, el inicio como instante UTC y si la clase ya terminó. La app trabaja con fecha y hora
// de pared en la zona del negocio; la landing pública, con ISO.
import { obtener, listar } from './almacen.mjs';
import { aUTC, esFecha, esHora } from './fechas.mjs';
import { idSeguro } from './normalizar.mjs';
import { landingPublica } from './landing.mjs';

const DURACION_DEFECTO = 180;

export async function obtenerWebinar(id) {
  return idSeguro(id) ? obtener('webinars', id) : null;
}

// por fecha (y hora) ascendente
export async function listarWebinars() {
  const ws = await listar('webinars');
  return ws.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || String(a.hora || '').localeCompare(String(b.hora || '')));
}

const horaDe = (w) => (esHora(w?.hora) ? w.hora : '00:00');

// Tira Error si la fecha guardada está rota (no debería: se valida al guardar)
export function inicioISO(w, zona) {
  return aUTC(w?.fecha, horaDe(w), zona);
}

export function popupISO(w, zona) {
  const p = w?.popup;
  if (!p || !esFecha(p.fecha)) return null;
  return aUTC(p.fecha, esHora(p.hora) ? p.hora : horaDe(w), zona);
}

// La del webinar si es un número > 0 (también '90' guardado como texto); si no, la del negocio (ajustes/negocio o
// WEBINAR_DURACION_MIN, la de negocio()). Es la misma cuenta que hacen /api/publico y /api/registro.
const positivo = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
export const duracionDe = (w, neg) => positivo(w?.duracionMin) ?? positivo(neg?.duracionMin) ?? DURACION_DEFECTO;

// ahora > inicio + duracionMin. Con la fecha rota se toma como terminado (no se abre un registro sin fecha).
// El segundo argumento es la zona o el negocio entero ({zona, duracionMin}); con solo la zona, sin duración propia
// del webinar se toman 180 (registro.mjs le pasa el negocio).
export function terminado(w, zonaONeg, ahoraMs = Date.now()) {
  const neg = zonaONeg && typeof zonaONeg === 'object' ? zonaONeg : { zona: zonaONeg };
  let inicio;
  try { inicio = Date.parse(inicioISO(w, neg.zona)); } catch { return true; }
  return !Number.isFinite(inicio) || ahoraMs > inicio + duracionDe(w, neg) * 60000;
}

// Lo que publica /api/publico de un webinar (extra a §6.11; publico.mjs puede armarlo solo con las funciones de arriba)
export function vistaPublica(w, neg) {
  return {
    id: w.id, formato: w.formato || '', zona: neg.zona, inicio: inicioISO(w, neg.zona), popup: popupISO(w, neg.zona),
    duracionMin: duracionDe(w, neg), pais: neg.pais, landing: landingPublica(w.landing),
  };
}
