// La proyección de un webinar: "la cuenta al revés" desde el presupuesto y las tasas (§7.3.3).
// Lo cargado pisa a la vara (los valores de referencia de opciones().vara). Todo number | null, nunca NaN.
import { monto } from './normalizar.mjs';

// porcentajes de 0 a 100
export const CLAVES_PROY = ['presupuesto', 'registros', 'pctCalificados', 'pctAsistencia', 'pctAgenda', 'pctShow',
  'pctCierre', 'ticket', 'roasObjetivo', 'llamadasPorCloser', 'diasLlamadas'];

// Las de plata y cantidad leen el punto de miles ('1.500' = 1500); las tasas no tienen miles: el último ',' o '.'
// es siempre el decimal ('1,125' = 1.125, y el 1234.567 que repinta el input vuelve igual)
const MONTOS = new Set(['presupuesto', 'registros', 'ticket']);
function tasa(s) {
  const t = s.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(t)) return null;
  const i = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  return parseFloat(i < 0 ? t : t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1));
}

// '1.500', '22,5', 30 → number ≥ 0; '', lo que no es número o no es texto (objeto, array) → null
function numero(v, k) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = typeof v === 'string' && !MONTOS.has(k) ? tasa(v) : monto(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Lo que manda el form (las 11 claves como strings) → solo las cargadas, como number. Vacío = se omite (usa la vara).
export function parsearEntrada(obj) {
  const r = {};
  if (!obj || typeof obj !== 'object') return r;
  for (const k of CLAVES_PROY) {
    const n = numero(obj[k], k);
    if (n != null) r[k] = n;
  }
  return r;
}

const fin = (x) => (Number.isFinite(x) ? x : null);
const por = (...xs) => (xs.some((x) => x == null) ? null : fin(xs.reduce((a, b) => a * b, 1)));
const div = (a, b) => (a == null || b == null || b === 0 ? null : fin(a / b));
const pct = (base, p) => (base == null || p == null ? null : fin((base * p) / 100));
// ceil sin el +1 falso de la coma flotante (4500 / 900 = 5.000000000001)
const techo = (x) => (x == null ? null : Math.ceil(x - 1e-9));
// personas, agendas, llamadas y ventas van enteras, y cada paso sale del anterior ya redondeado: así las cuentas
// cierran con lo que muestra la pantalla (Cash = las ventas que se ven × ticket; sin esto, 1,56 ventas se veían como 2)
const cant = (x) => (x == null ? null : Math.round(x));

// Proyeccion = {entrada (las 11), cpl, calificados, cplCalificado, asistentes, agendas, costoAgenda, llamadas, ventas,
//   cash, roas, cashObjetivo, ventasParaObjetivo, closers}
export function calcular(guardada, vara) {
  const E = {};
  for (const k of CLAVES_PROY) {
    const g = numero(guardada?.[k], k);
    E[k] = g != null ? g : numero(vara?.[k], k);
  }
  const calificados = cant(pct(E.registros, E.pctCalificados));
  const agendas = cant(pct(E.registros, E.pctAgenda));
  const llamadas = cant(pct(agendas, E.pctShow));
  const ventas = cant(pct(llamadas, E.pctCierre));
  const cash = por(ventas, E.ticket);
  const cashObjetivo = por(E.presupuesto, E.roasObjetivo);
  return {
    entrada: E,
    cpl: div(E.presupuesto, E.registros),
    calificados,
    cplCalificado: div(E.presupuesto, calificados),
    asistentes: cant(pct(E.registros, E.pctAsistencia)),
    agendas,
    costoAgenda: div(E.presupuesto, agendas),
    llamadas,
    ventas,
    cash,
    roas: div(cash, E.presupuesto),
    cashObjetivo,
    ventasParaObjetivo: techo(div(cashObjetivo, E.ticket)),
    closers: techo(div(agendas, por(E.llamadasPorCloser, E.diasLlamadas))),
  };
}
