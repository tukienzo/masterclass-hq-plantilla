// Acciones de finanzas en /api/panel: crmsync (conciliar el pipeline), finanzasget (todo el CRM por mes para la
// pantalla), liqpago (marcar o desmarcar la comisión pagada) y comisiones (el % de cada closer).
import { ROLES } from '../sesion.mjs';
import { listar, obtener, guardar, fusionar, reemplazarSiVersion } from '../almacen.mjs';
import { negocio } from '../config.mjs';
import { hoyLocal, esFecha } from '../fechas.mjs';
import { norm, monto, texto } from '../normalizar.mjs';
import { HttpError } from '../http.mjs';
import { crmsync, esUnidad, n0, r2, esPlano, TECHO, nombresCloser, canonico } from '../crm-core.mjs';

const EC = ['equipo', 'cliente'];
const MAX_MESES = 36;
const esMes = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
// un doc de ajustes sin lo que pone la base
function datos(doc) {
  if (!doc) return null;
  const r = { ...doc };
  delete r.id; delete r.creado; delete r.actualizado;
  return r;
}
const COMISIONES_DEFECTO = () => ({ def: 10, pct: {} });

function comisionesDe(doc) {
  const d = datos(doc);
  if (!d) return COMISIONES_DEFECTO();
  const def = Number(d.def);
  return { def: d.def != null && d.def !== '' && Number.isFinite(def) ? def : 10, pct: { ...objeto(d.pct) } };
}
// el % de un closer: el suyo (por norm), si no el de por defecto, si no 10
function pctDe(com, closer) {
  const k = Object.keys(com.pct).find((x) => norm(x) === norm(closer));
  const propio = k == null ? NaN : Number(com.pct[k]);
  return Number.isFinite(propio) ? propio : com.def ?? 10;
}

/* ── finanzasget: los últimos 36 meses con registros ── */
const ventaFin = (v) => ({
  id: v.id, nombre: v.nombre || '', closer: v.closer || '', setter: v.setter || '', situacion: v.situacion || '',
  programa: (v.plan && v.plan.programa) || v.programa || '',
  total: v.plan ? n0(v.plan.total) : esUnidad(v) ? r2(n0(v.dia1) + n0(v.seguimiento)) : 0,
  fuente: v.fuente || '', fecha: v.fecha || '', dia1: n0(v.dia1), seguimiento: n0(v.seguimiento),
});
const cuotaFin = (c) => ({
  id: c.id, v: Number(c.v) || 0, cuota: c.cuota || '', nombre: c.nombre || '', telefono: c.telefono || '',
  closer: c.closer || '', situacion: c.situacion || '', fecha: c.fecha || '', cobrado: n0(c.cobrado),
  porCobrar: n0(c.porCobrar), de: c.de || '', notas: c.notas || '',
});

async function finanzasget() {
  const [todos, metas, com, liq, closers] = await Promise.all([
    listar('crm'), obtener('ajustes', 'metas'), obtener('ajustes', 'comisiones'), obtener('ajustes', 'liq'),
    listar('personas', { donde: { rol: 'closer' } }),
  ]);
  // cada closer con un solo nombre (el de la persona o el primero que aparece), como en /api/crm: la pantalla agrupa
  // "Ventas por closer" por el texto exacto
  const regs = todos.filter((r) => esMes(r.mes) && (r.tipo === 'venta' || r.tipo === 'cuota'));
  const nombres = nombresCloser(closers, regs.map((r) => r.closer));
  const porMes = new Map();
  for (const crudo of regs) {
    const r = crudo.closer ? { ...crudo, closer: canonico(nombres, crudo.closer) } : crudo;
    if (!porMes.has(r.mes)) porMes.set(r.mes, { mes: r.mes, ventas: [], cuotas: [] });
    const m = porMes.get(r.mes);
    if (r.tipo === 'venta') m.ventas.push(ventaFin(r)); else m.cuotas.push(cuotaFin(r));
  }
  const claves = [...porMes.keys()].sort().slice(-MAX_MESES);
  const liqLimpio = {};
  for (const [mes, mapa] of Object.entries(datos(liq) || {})) if (esMes(mes) && Object.keys(objeto(mapa)).length) liqLimpio[mes] = mapa;
  return {
    meses: Object.fromEntries(claves.map((k) => [k, porMes.get(k)])),
    metas: datos(metas) || {},
    comisiones: comisionesDe(com),
    liq: liqLimpio,
  };
}

/* ── liqpago: el pct lo pone el servidor (el del momento del pago, y se conserva al actualizar) ──
   ajustes/liq es un solo documento con todos los meses: se escribe con su versión (`v`) y se reintenta si otro
   pago entró en el medio, así dos pagos a la vez de closers distintos no se pisan. */
const INTENTOS_LIQ = 5;
async function liqpago({ cuerpo, yo }) {
  const mes = cuerpo.mes;
  if (!esMes(mes)) throw new HttpError(400, 'Falta el mes de la liquidación');
  const closer = esPlano(cuerpo.closer) ? texto(cuerpo.closer, 100) : '', key = norm(closer);
  if (!key) throw new HttpError(400, 'Falta el closer');
  if (!('pago' in cuerpo)) throw new HttpError(400, 'Pedido inválido');
  const pago = cuerpo.pago;
  let nuevo = null;   // lo que va en liq[mes][key] sin el pct (null = volver a pendiente)
  if (pago !== null) {
    if (!pago || typeof pago !== 'object' || Array.isArray(pago)) throw new HttpError(400, 'Pedido inválido');
    const m = typeof pago.monto === 'number' ? (Number.isFinite(pago.monto) ? pago.monto : null) : typeof pago.monto === 'string' ? monto(pago.monto) : null;
    if (m == null || m < 0 || m > TECHO) throw new HttpError(400, 'Revisá el monto pagado');
    if (!esPlano(pago.fecha)) throw new HttpError(400, 'Revisá la fecha del pago');
    const neg = await negocio();
    const fecha = pago.fecha == null || pago.fecha === '' ? hoyLocal(neg.zona) : String(pago.fecha);
    if (!esFecha(fecha)) throw new HttpError(400, 'Revisá la fecha del pago');
    nuevo = { monto: r2(m), fecha };
  }
  let com = null;
  for (let i = 0; i < INTENTOS_LIQ; i++) {
    const doc = (await obtener('ajustes', 'liq')) || (await fusionar('ajustes', 'liq', {}));   // fusionar no pisa al que lo creó recién
    const v = Number(doc.v) || 0;
    const liq = datos(doc);
    const mapa = { ...objeto(liq[mes]) };
    if (nuevo === null) delete mapa[key];
    else {
      const existente = objeto(mapa[key]);
      if (existente.pct == null && !com) com = comisionesDe(await obtener('ajustes', 'comisiones'));
      mapa[key] = { ...nuevo, pct: existente.pct ?? pctDe(com, closer), por: yo.nombre, t: new Date().toISOString() };
    }
    const siguiente = { ...liq, v: v + 1 };
    if (Object.keys(mapa).length) siguiente[mes] = mapa; else delete siguiente[mes];
    if (await reemplazarSiVersion('ajustes', 'liq', siguiente, v)) return { liq: mapa };
  }
  throw new HttpError(409, 'Se estaban guardando otros pagos a la vez: probá de nuevo');
}

/* ── comisiones: reemplaza el objeto entero (un closer sin % propio usa el de por defecto) ── */
function porcentaje(v) {
  const n = typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' ? monto(v) : null;
  if (n == null || n < 0 || n > 100) throw new HttpError(400, 'El porcentaje va de 0 a 100');
  return n;
}
async function comisiones({ cuerpo }) {
  const c = cuerpo.comisiones;
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new HttpError(400, 'Pedido inválido');
  const def = c.def == null || c.def === '' ? 10 : porcentaje(c.def);
  const pct = {};
  for (const [crudo, v] of Object.entries(objeto(c.pct))) {
    const nombre = texto(crudo, 100);
    if (!norm(nombre) || v == null || v === '') continue;
    for (const k of Object.keys(pct)) if (norm(k) === norm(nombre)) delete pct[k];   // el mismo closer escrito distinto
    pct[nombre] = porcentaje(v);
  }
  const guardado = { def, pct };
  await guardar('ajustes', { id: 'comisiones', ...guardado });
  return { comisiones: guardado };
}

export const acciones = {
  crmsync: { roles: ROLES, fn: ({ cuerpo, yo }) => crmsync({ previo: cuerpo.previo === true }, yo) },
  finanzasget: { roles: EC, fn: finanzasget },
  liqpago: { roles: EC, fn: liqpago },
  comisiones: { roles: EC, fn: comisiones },
};
