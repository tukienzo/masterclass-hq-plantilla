// El núcleo del CRM de ventas: las fórmulas del Leaderboard, el armado del cierre (plan de pagos → venta + cuotas)
// y la conciliación del pipeline (crmsync). kpis, leaderboard y armarCierre son puras (la semilla usa armarCierre).
import { createHash } from 'node:crypto';
import { listar, fusionarVariosSiExisten, fusionarSi } from './almacen.mjs';
import { negocio } from './config.mjs';
import { cargarAgendas, enParalelo } from './pipeline.mjs';
import { hoyLocal, mesSig, esFecha } from './fechas.mjs';
import { norm, monto, texto, tel8, nuevoId } from './normalizar.mjs';
import { HttpError } from './http.mjs';

export const SI = (x) => norm(x) === 'si';
export const NO = (x) => norm(x) === 'no';
export const n0 = (v) => monto(v) ?? 0;
export const r2 = (n) => Math.round(n0(n) * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

// lo que llega del pedido para un campo de texto o número: un valor suelto (un objeto o un array no)
export const esPlano = (v) => v == null || typeof v === 'string' || typeof v === 'number';
// el techo de cualquier monto: más que esto es un error de tipeo (y más arriba las cuentas desbordan)
export const TECHO = 1e12;
// un id que sale siempre igual de las mismas partes (copias y cuotas del cierre: dos altas a la vez caen en el mismo)
export const idFijo = (prefijo, ...partes) => prefijo + createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 20);

// norm(nombre) → el nombre con que se muestra un closer: el de la persona (activas primero), si no el primero que aparece.
// Así "laura gomez" de una agenda y "Laura Gómez" de Equipo son la misma columna, el mismo chip y el mismo filtro.
export function nombresCloser(personas = [], otros = []) {
  const m = new Map();
  const anotar = (n) => { const t = typeof n === 'string' ? n.trim() : '', k = norm(t); if (k && !m.has(k)) m.set(k, t); };
  const ps = (personas || []).filter((p) => p && p.rol === 'closer');
  ps.filter((p) => p.activo !== false).forEach((p) => anotar(p.nombre));
  ps.filter((p) => p.activo === false).forEach((p) => anotar(p.nombre));
  (otros || []).forEach(anotar);
  return m;
}
export const canonico = (mapa, n) => mapa.get(norm(n)) ?? (typeof n === 'string' ? n.trim() : '');

// las situaciones que cuentan como unidad cerrada (comparadas con norm)
export const UNIDADES = ['adentro en llamada', 'adentro en seguimiento', 'cerrado en 2 llamadas'];
export const esUnidad = (v) => UNIDADES.includes(norm(v && v.situacion));
export const cashDe = (v) => n0(v.dia1) + n0(v.seguimiento);

export const MAX_HIST = 100;
// suma una entrada al historial y descarta las más viejas
export function agregarHist(historial, entrada) {
  const h = Array.isArray(historial) ? historial.slice() : [];
  h.push(entrada);
  return h.length > MAX_HIST ? h.slice(-MAX_HIST) : h;
}

/* ════════ KPIs (las mismas fórmulas que kpisDe de crm.js) ════════ */

// K = {agendas, presentadas, calificadas, cierreGral, cierreEf, showUp, aovD1, aovTrato, uSeg, uLlam, u2, unidades,
//      cashD1, cashTrato, cashSeg, cash}. Tasas 0–1 (4 decimales) o null si el divisor es 0.
export function kpis(ventas = []) {
  let agendas = 0, presentadas = 0, calificadas = 0, uLlam = 0, uSeg = 0, u2 = 0, fees = 0;
  let cashD1 = 0, cashSeg = 0, cashTrato = 0;
  for (const v of ventas || []) {
    if (SI(v.presento) || NO(v.presento)) agendas++;
    if (SI(v.presento)) {
      presentadas++;
      if (SI(v.califica)) calificadas++;
    }
    const s = norm(v.situacion);
    if (s === 'adentro en llamada') uLlam++;
    else if (s === 'adentro en seguimiento') uSeg++;
    else if (s === 'cerrado en 2 llamadas') u2++;
    else if (s === 'fee') fees++;
    const d1 = n0(v.dia1), sg = n0(v.seguimiento);
    cashD1 += d1;
    cashSeg += sg;
    if (UNIDADES.includes(s)) cashTrato += d1 + sg;
  }
  const unidades = uLlam + uSeg + u2;
  const tasa = (a, b) => (b ? r4(a / b) : null);
  const prom = (a, b) => (b ? r2(a / b) : null);
  return {
    agendas, presentadas, calificadas,
    cierreGral: tasa(unidades, presentadas), cierreEf: tasa(unidades, calificadas), showUp: tasa(presentadas, agendas),
    aovD1: prom(cashD1, unidades + fees), aovTrato: prom(cashTrato, unidades),
    uSeg, uLlam, u2, unidades,
    cashD1: r2(cashD1), cashTrato: r2(cashTrato), cashSeg: r2(cashSeg), cash: r2(cashD1 + cashSeg),
  };
}

// Sobre TODAS las ventas y cuotas del mes, aunque pregunte un closer. Las tasas del equipo salen del total.
export function leaderboard(ventas = [], cuotas = [], metas = {}) {
  const grupos = new Map();   // norm(closer) → {nombre, ventas}
  for (const v of ventas || []) {
    const nombre = String(v.closer || '').trim(), k = norm(nombre);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, { nombre, ventas: [] });
    grupos.get(k).ventas.push(v);
  }
  const closers = [...grupos.values()].map((g) => ({ closer: g.nombre, k: kpis(g.ventas) }))
    .sort((a, b) => b.k.cash - a.k.cash || a.closer.localeCompare(b.closer, 'es'));
  const equipo = ventas && ventas.length ? kpis(ventas) : {};
  const deCuotas = r2((cuotas || []).reduce((s, c) => s + n0(c.cobrado), 0));
  return { closers, equipo, metas: metas || {}, cuotas: deCuotas, total: r2((equipo.cash || 0) + deCuotas) };
}

/* ════════ Cierre: el plan de pagos arma la venta y las cuotas ════════ */

const CONCEPTOS_VENTA = ['Adentro en Llamada', 'Adentro en Seguimiento', 'Fee'];

function formatoNumero(locale) {
  try { return new Intl.NumberFormat(locale || 'es-AR', { maximumFractionDigits: 2 }); } catch { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }); }
}
const ddmm = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

// venta = el doc guardado; plan = {programa, total, filas:[{concepto, monto, fecha, pagado, medio}]};
// yo = {nombre}; neg = negocio() (moneda, locale). Devuelve la venta lista para guardar (v + 1) y las cuotas nuevas
// (con id). Tira HttpError 400 si el plan está mal y 409 si la venta ya tiene su cierre.
// `ahora` (opcional, extra a §6.11) deja a la semilla fijar el instante.
export function armarCierre(venta, plan, yo, neg, { ahora = new Date().toISOString() } = {}) {
  if (!venta || venta.tipo !== 'venta') throw new HttpError(404, 'No encontré esa venta: recargá la pantalla');
  const p = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
  const programa = esPlano(p.programa) ? texto(p.programa, 200) : '';
  if (!programa) throw new HttpError(400, 'Elegí el programa');
  const total = esPlano(p.total) ? monto(p.total) : null;
  if (!(total > 0 && total <= TECHO)) throw new HttpError(400, 'Poné el precio total');
  if (!Array.isArray(p.filas) || p.filas.length < 1 || p.filas.length > 8) throw new HttpError(400, 'El plan tiene que tener de 1 a 8 pagos');
  const crudas = p.filas.map((f) => (f && typeof f === 'object' && !Array.isArray(f) ? f : {}));
  const montos = crudas.map((f) => (esPlano(f.monto) ? monto(f.monto) : null));
  if (montos.some((m) => m == null || m < 0 || m > TECHO)) throw new HttpError(400, 'Revisá el monto de cada pago');
  if (crudas.some((f) => typeof f.fecha !== 'string' || !esFecha(f.fecha))) throw new HttpError(400, 'Revisá la fecha de cada pago');
  if (venta.plan) throw new HttpError(409, 'Esta venta ya tiene su cierre cargado');

  const suelto = (v, max) => (esPlano(v) ? texto(v, max) : '');
  const filas = crudas.map((f, i) => {
    const pagado = i === 0 || f.pagado === true;   // la primera siempre está pagada
    return {
      concepto: suelto(f.concepto, 80) || (i === 0 ? 'Adentro en Llamada' : `Cuota ${i + 1}`),
      monto: r2(montos[i]), fecha: f.fecha, pagado, medio: pagado ? suelto(f.medio, 60) : '',
    };
  });

  // la situación sale del concepto de la primera fila; la plata se suma a lo que ya tuviera
  const c0 = norm(filas[0].concepto);
  const situacion = CONCEPTOS_VENTA.find((c) => norm(c) === c0) || 'Adentro en Llamada';
  let dia1 = 0, seguimiento = 0;
  if (c0 === 'adentro en seguimiento') seguimiento += filas[0].monto; else dia1 += filas[0].monto;
  filas.slice(1).forEach((f) => { if (f.pagado) seguimiento += f.monto; });

  const quien = (yo && yo.nombre) || '';
  const moneda = (neg && neg.moneda) || 'USD';
  const fmt = formatoNumero(neg && neg.locale);
  const plata = (n) => `${moneda} ${fmt.format(n)}`;

  // el id de cada cuota sale de la venta y de la fila: si se reintenta un cierre que falló a mitad, no se duplica
  const cuotas = filas.map((f, i) => ({ f, i })).filter(({ f, i }) => i > 0 && !f.pagado).map(({ f, i }) => ({
    id: venta.id ? idFijo('c_', 'cierre', venta.id, i) : nuevoId('c_'), tipo: 'cuota', mes: f.fecha.slice(0, 7), v: 1,
    nombre: venta.nombre || '', telefono: venta.telefono || '', mail: venta.mail || '', instagram: venta.instagram || '',
    closer: venta.closer || '', cuota: f.concepto, fecha: f.fecha, porCobrar: f.monto, cobrado: 0,
    situacion: 'Por Cobrar', notas: '', de: '', venta: venta.id,
    historial: [{ t: ahora, q: quien, c: `Salió del cierre de ${venta.nombre || 'la venta'}: ${programa}` }],
    creadoPor: quien,
  }));

  // el texto para pegar en el grupo del equipo
  const otros = filas.slice(1).filter((f) => f.pagado);
  const lineas = [
    `✅ Nueva venta: ${venta.nombre || 'sin nombre'}`,
    `Programa: ${programa} · Total ${plata(total)}`,
    `Closer: ${venta.closer || '—'}${venta.setter ? ` · Setter: ${venta.setter}` : ''}`,
    `Pagó hoy: ${plata(filas[0].monto)}${filas[0].medio ? ` (${filas[0].medio})` : ''}`,
  ];
  if (otros.length) lineas.push('Otros pagos ya hechos: ' + otros.map((f) => `${plata(f.monto)} el ${ddmm(f.fecha)}${f.medio ? ` (${f.medio})` : ''}`).join(' · '));
  if (cuotas.length) lineas.push('Cuotas a cobrar:', ...cuotas.map((c) => `· ${c.cuota}: ${plata(c.porCobrar)} el ${ddmm(c.fecha)}`));
  else lineas.push('Cuotas a cobrar: ninguna');

  const nuevoPlan = { programa, total, filas, por: quien, t: ahora, mensaje: lineas.join('\n') };
  const diferencia = r2(total - filas.reduce((s, f) => s + f.monto, 0));
  if (diferencia !== 0) nuevoPlan.diferencia = diferencia;

  return {
    venta: {
      ...venta,
      situacion,
      dia1: r2(n0(venta.dia1) + dia1),
      seguimiento: r2(n0(venta.seguimiento) + seguimiento),
      plan: nuevoPlan, programa, total,
      v: (Number(venta.v) || 0) + 1,
      historial: agregarHist(venta.historial, { t: ahora, q: quien, c: `Cargó el cierre: ${programa}, ${plata(total)}` }),
    },
    cuotas,
  };
}

/* ════════ crmsync: el pipeline se pone al día con el CRM ════════ */

function agrupar(lista, clave) {
  const m = new Map();
  for (const x of lista) {
    const k = clave(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// Ventas del mes actual (y del anterior si `previo` o si hoy es día ≤ 10) → Estado, Monto, Programa y Fecha cierre
// de su fila del pipeline. Solo escribe lo que cambia. `yo` no se usa: la conciliación es la misma para todos.
export async function crmsync({ previo = false } = {}, yo = null) {
  const neg = await negocio();
  const hoy = hoyLocal(neg.zona), mes = hoy.slice(0, 7);
  const meses = new Set([mes]);
  if (previo === true || Number(hoy.slice(8, 10)) <= 10) meses.add(mesSig(mes, -1));

  const ventas = await listar('crm', { donde: { tipo: 'venta' } });
  const mirar = ventas.filter((v) => meses.has(v.mes));
  if (!mirar.length) return { actualizados: 0 };
  // las agendas guardadas (no la fila armada para la pantalla): se compara contra lo que está escrito
  const filas = await cargarAgendas();
  if (!filas.length) return { actualizados: 0 };

  const porId = new Map(filas.map((f) => [f.id, f]));
  const porNombre = agrupar(filas, (f) => (norm(f.Nombre) && f['Fecha call'] ? `${norm(f.Nombre)}|${f['Fecha call']}` : ''));
  const porTel = agrupar(filas, (f) => tel8(f.WhatsApp));
  // §5.5: por nombre o teléfono, una venta solo cae en una fila de su closer o sin closer (si no, una venta de un
  // closer movería la agenda de otro). El vínculo explícito (`agenda`) se chequea al guardarlo.
  const deSuCloser = (lista, v) => (lista || []).filter((f) => !norm(f.Closer) || norm(f.Closer) === norm(v.closer));
  const filaDe = (v) => {
    if (v.agenda && porId.has(v.agenda)) return porId.get(v.agenda);
    const n = norm(v.nombre);
    const xNombre = n && v.fecha ? deSuCloser(porNombre.get(`${n}|${v.fecha}`), v) : [];
    if (xNombre.length === 1) return xNombre[0];
    const t = tel8(v.telefono);
    const xTel = t ? deSuCloser(porTel.get(t), v) : [];
    return xTel.length === 1 ? xTel[0] : null;
  };

  // familia = la venta original y sus copias (`de`) en otros meses: el Monto es el cash de toda la familia
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]));
  const raiz = (v) => {
    let r = v;
    const vistos = new Set([r.id]);
    while (r.de && ventaPorId.has(r.de) && !vistos.has(r.de)) { r = ventaPorId.get(r.de); vistos.add(r.id); }
    return r.id;
  };
  const familias = new Map();   // id raíz → {cash, programa}
  for (const v of ventas) {
    const k = raiz(v);
    const f = familias.get(k) || { cash: 0, programa: '' };
    f.cash += cashDe(v);
    if (!f.programa) f.programa = (v.plan && v.plan.programa) || '';
    familias.set(k, f);
  }

  const cambios = new Map();   // id de fila → {campo: valor}
  for (const v of mirar) {
    const fila = filaDe(v);
    if (!fila) continue;
    const actual = { ...fila, ...(cambios.get(fila.id) || {}) };
    const set = {};
    if (esUnidad(v)) {
      const fam = familias.get(raiz(v));
      const m = r2(fam.cash);
      if (actual.Estado !== 'Cerrada') set.Estado = 'Cerrada';
      if (monto(actual.Monto) !== m) set.Monto = m;
      const prog = (v.plan && v.plan.programa) || fam.programa;
      if (prog && actual.Programa !== prog) set.Programa = prog;
      if (!actual['Fecha cierre']) set['Fecha cierre'] = esFecha(v.fecha) ? v.fecha : hoy;
    } else if (SI(v.presento)) {
      if (actual.Estado !== 'Cerrada' && actual.Estado !== 'Presentada') set.Estado = 'Presentada';
    } else if (NO(v.presento)) {
      if (!['Cerrada', 'Presentada', 'No-show'].includes(actual.Estado)) set.Estado = 'No-show';
    }
    if (Object.keys(set).length) cambios.set(fila.id, { ...(cambios.get(fila.id) || {}), ...set });
  }

  // fuera lo que terminó igual a lo guardado (dos ventas sobre la misma fila)
  const escribir = [];
  for (const [id, c] of cambios) {
    const fila = porId.get(id);
    const real = Object.fromEntries(Object.entries(c).filter(([k, val]) => (k === 'Monto' ? monto(fila.Monto) !== val : fila[k] !== val)));
    if (Object.keys(real).length) escribir.push({ id, ...real });
  }
  if (!escribir.length) return { actualizados: 0 };
  // Solo agendas que siguen existiendo: una borrada mientras tanto no vuelve como fila sin nombre. Lo que depende de
  // lo leído va con condición (fusionarSi): Presentada o No-show solo si el Estado sigue siendo el que se leyó, y
  // Fecha cierre solo si sigue vacía. Así un 'Cerrada' o una fecha puestos a mano en el medio no se pisan; la próxima
  // conciliación lo vuelve a mirar. El Cerrada de una venta que es unidad manda y va directo.
  const crudo = (v) => (v == null ? '' : String(v));
  const condicion = (c) => {
    const fila = porId.get(c.id), si = {};
    if (c.Estado !== undefined && c.Estado !== 'Cerrada') si.Estado = [crudo(fila.Estado)];
    if (c['Fecha cierre'] !== undefined) si['Fecha cierre'] = ['', crudo(fila['Fecha cierre'])];
    return Object.keys(si).length ? si : null;
  };
  const directas = escribir.filter((c) => !condicion(c)), condicionadas = escribir.filter((c) => condicion(c));
  let actualizados = directas.length ? (await fusionarVariosSiExisten('agendas', directas)).length : 0;
  await enParalelo(condicionadas, 8, async (c) => { if (await fusionarSi('agendas', c.id, c, condicion(c))) actualizados++; });
  return { actualizados };
}
