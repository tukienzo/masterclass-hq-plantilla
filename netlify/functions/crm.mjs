// /api/crm — el CRM de ventas: ventas y cuotas por mes (colección `crm` con campo `mes`).
// GET ?mes=YYYY-MM = el mes con su leaderboard; POST {accion} = guardar · borrar · cierre · metas.
// crm.js usa su propio fetch: todo error lleva `error` (lo pone http.error).
import { manejar, json, leerJSON, metodo, query, HttpError } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { obtener, listar, guardar, borrar, reemplazarSiVersion, fusionar, fusionarVarios } from '../lib/almacen.mjs';
import { negocio, opciones } from '../lib/config.mjs';
import { mesLocal, mesSig } from '../lib/fechas.mjs';
import { norm, monto, texto, nuevoId, idSeguro } from '../lib/normalizar.mjs';
import { leaderboard, armarCierre, agregarHist, n0, esPlano, TECHO, idFijo, nombresCloser, canonico } from '../lib/crm-core.mjs';

const TIPOS = ['venta', 'cuota'];
const EC = ['equipo', 'cliente'];
const esMes = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

// lista blanca de lo que se puede escribir desde la pantalla: [campo, 'texto' | 'numero' | 'siNo', largo]
const COMUNES = [['nombre', 'texto', 200], ['telefono', 'texto', 60], ['mail', 'texto', 200], ['instagram', 'texto', 100],
  ['fecha', 'texto', 30], ['closer', 'texto', 100], ['notas', 'texto', 5000], ['situacion', 'texto', 100], ['de', 'texto', 100]];
const CAMPOS = {
  venta: [...COMUNES, ['presento', 'siNo'], ['califica', 'siNo'], ['dia1', 'numero'], ['seguimiento', 'numero'],
    ['fuente', 'texto', 100], ['setter', 'texto', 100], ['agenda', 'texto', 100]],
  cuota: [...COMUNES, ['cuota', 'texto', 100], ['porCobrar', 'numero'], ['cobrado', 'numero']],
};
// para los 400 de un campo que no vino como texto
const ETIQ = { nombre: 'el nombre', telefono: 'el teléfono', mail: 'el mail', instagram: 'el Instagram', fecha: 'la fecha',
  closer: 'el closer', notas: 'las notas', situacion: 'la situación', de: 'de qué registro es copia', fuente: 'el origen',
  setter: 'el setter', agenda: 'la agenda', cuota: 'la cuota' };
// cómo arranca un registro nuevo: todos los campos presentes
const VACIO = {
  venta: () => ({ nombre: '', telefono: '', mail: '', instagram: '', fecha: '', closer: '', presento: '', califica: '',
    situacion: '', dia1: 0, seguimiento: 0, notas: '', fuente: '', setter: '', agenda: '', de: '' }),
  cuota: () => ({ nombre: '', telefono: '', mail: '', instagram: '', fecha: '', closer: '', cuota: '', porCobrar: 0,
    cobrado: 0, situacion: '', notas: '', de: '', venta: '' }),
};

const MAL_SI_NO = '«Se presentó» y «Calificaba» van con Sí o No';
const MAL_MONTO = 'Los montos van con números de 0 para arriba';
function siNo(v) {
  if (v != null && typeof v !== 'string') throw new HttpError(400, MAL_SI_NO);
  const n = norm(v);
  if (!n) return '';
  if (n === 'si') return 'Sí';
  if (n === 'no') return 'No';
  throw new HttpError(400, MAL_SI_NO);
}
// vacío = 0; si no, un número de 0 al techo (un texto sin número también es 0, como monto())
function numero(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? n0(v) : NaN;
  if (!(n >= 0 && n <= TECHO)) throw new HttpError(400, MAL_MONTO);
  return n;
}
// solo los campos permitidos que vinieron, ya normalizados
function camposDe(registro, tipo) {
  const out = {};
  for (const [k, clase, largo] of CAMPOS[tipo]) {
    if (!Object.hasOwn(registro, k)) continue;
    const v = registro[k];
    if (clase === 'texto' && !esPlano(v)) throw new HttpError(400, `Revisá ${ETIQ[k]}`);
    out[k] = clase === 'numero' ? numero(v) : clase === 'siNo' ? siNo(v) : texto(v, largo);
  }
  return out;
}
const igual = (a, b) => (typeof b === 'number' ? n0(a) === b : String(a ?? '') === String(b ?? ''));
// en el historial alcanza con el principio de cada valor (la pantalla muestra 60 caracteres): unas notas largas
// editadas muchas veces no inflan el registro
const corto = (x) => (typeof x === 'string' && x.length > 200 ? x.slice(0, 200) : x);
// lo que sale hacia la pantalla (sin la marca interna de la base)
function publico(doc) {
  const r = { ...doc };
  delete r.actualizado;
  return r;
}
// un doc de ajustes sin lo que pone la base
function datos(doc) {
  if (!doc) return null;
  const r = publico(doc);
  delete r.id; delete r.creado;
  return r;
}

// §5.5: un closer solo toca lo suyo y en los meses que no están liquidados (anterior, actual y siguiente)
const enRango = (mes, hoy) => mes >= mesSig(hoy, -1) && mes <= mesSig(hoy, 1);
function permisoCloser(doc, yo, hoy) {
  if (yo.rol !== 'closer') return;
  if (norm(doc.closer) !== norm(yo.closer)) throw new HttpError(403, 'Ese registro es de otro closer');
  if (!enRango(doc.mes, hoy)) throw new HttpError(403, 'Ese mes ya está liquidado');
}
// ...y lo que engancha también es suyo: la agenda (la de otro closer no; la que no tiene closer sí, como en el
// pipeline) y el registro del que es copia. Si no, crmsync o "traer la cuota" moverían lo de otro.
async function alcanceCloser(campos, yo, antes = {}) {
  if (yo.rol !== 'closer') return;
  if (campos.agenda && campos.agenda !== antes.agenda) {
    const ag = await obtener('agendas', campos.agenda);
    if (ag && norm(ag.Closer) && norm(ag.Closer) !== norm(yo.closer)) throw new HttpError(403, 'Esa agenda es de otro closer');
  }
  if (campos.de && campos.de !== antes.de) {
    const origen = await obtener('crm', campos.de);
    if (origen && norm(origen.closer) !== norm(yo.closer)) throw new HttpError(403, 'Ese registro es de otro closer');
  }
}
// el closer que escribe el equipo, con el nombre de la persona si es una (lo que vino de una agenda puede venir
// sin tildes o en minúsculas, y la pantalla compara el texto exacto)
async function closerDeEquipo(nombre) {
  if (!nombre) return '';
  return canonico(nombresCloser(await listar('personas', { donde: { rol: 'closer' } })), nombre);
}
const conflicto = (actual) => new HttpError(409, 'Alguien lo cambió mientras lo editabas: te muestro lo último', { registro: publico(actual) });
const noEsta = () => new HttpError(404, 'No encontré ese registro: recargá la pantalla');

/* ════════ GET: el mes ════════ */
async function verMes(req, yo) {
  const neg = await negocio();
  const hoy = mesLocal(neg.zona);
  const pedido = query(req).get('mes');
  const mes = esMes(pedido) ? pedido : hoy;
  const [delMes, closersEquipo, progs, metasDoc, ops] = await Promise.all([
    listar('crm', { donde: { mes } }), listar('personas', { donde: { rol: 'closer' } }), listar('programas'),
    obtener('ajustes', 'metas'), opciones(),
  ]);
  // cada closer con un solo nombre (el de la persona o el primero que aparece): los registros guardados con otra
  // forma de escribirlo salen igual, así coinciden el filtro de la pantalla, los chips y el leaderboard
  const crudos = delMes.filter((r) => TIPOS.includes(r.tipo));
  const nombres = nombresCloser(closersEquipo, crudos.map((r) => r.closer));
  const regs = crudos.map((r) => (r.closer ? { ...r, closer: canonico(nombres, r.closer) } : r));
  const ventas = regs.filter((r) => r.tipo === 'venta'), cuotas = regs.filter((r) => r.tipo === 'cuota');
  const propios = yo.rol === 'closer' ? regs.filter((r) => norm(r.closer) === norm(yo.closer)) : regs;

  // las personas activas con rol closer y los closers que aparecen en el mes, sin repetir (por norm)
  const claves = new Set([...closersEquipo.filter((p) => p.activo !== false).map((p) => norm(p.nombre)), ...regs.map((r) => norm(r.closer))]);
  const closers = [...claves].map((k) => k && nombres.get(k)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));

  const programas = progs.filter((p) => String(p.nombre || '').trim())
    .map((p) => ({ id: p.id, nombre: String(p.nombre).trim(), precio: n0(p.precio), orden: Number(p.orden) || 0 }))
    .sort((a, b) => a.orden - b.orden);
  const metas = datos(metasDoc) || {};

  return json({
    ok: true, mes, hoy,
    yo: { rol: yo.rol, closer: yo.closer || '' },
    registros: propios.map(publico),
    listas: ops.listas,
    closers,
    programas,
    leaderboard: leaderboard(ventas, cuotas, metas),
    metas,
  });
}

/* ════════ POST guardar ════════ */
async function guardarRegistro({ cuerpo, yo }) {
  const r = cuerpo.registro;
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new HttpError(400, 'Pedido inválido');
  const neg = await negocio();
  const hoy = mesLocal(neg.zona), ahora = new Date().toISOString();
  return r.id == null || r.id === '' ? crear(r, yo, hoy, ahora) : editar(r, cuerpo.base, yo, hoy, ahora);
}

// una copia que ya estaba: se devuelve, si quien pregunta la puede ver
function copiaExistente(doc, yo, hoy) {
  permisoCloser(doc, yo, hoy);
  return { registro: publico(doc) };
}

async function crear(r, yo, hoy, ahora) {
  const tipo = r.tipo, mes = r.mes;
  if (!TIPOS.includes(tipo)) throw new HttpError(400, 'Falta el tipo de registro (venta o cuota)');
  if (!esMes(mes)) throw new HttpError(400, 'Falta el mes del registro');
  const campos = camposDe(r, tipo);
  if (yo.rol === 'closer') {
    campos.closer = yo.closer;
    if (!enRango(mes, hoy)) throw new HttpError(403, 'Ese mes ya está liquidado');
  }
  if (tipo === 'venta' && !campos.nombre) throw new HttpError(400, 'Falta el nombre');
  if (tipo === 'venta' && yo.rol !== 'closer' && !campos.closer) throw new HttpError(400, 'Elegí el closer');
  if (yo.rol !== 'closer') campos.closer = await closerDeEquipo(campos.closer);
  await alcanceCloser(campos, yo);
  const pre = tipo === 'venta' ? 'v_' : 'c_';
  const nuevo = {
    ...VACIO[tipo](), ...campos, tipo, mes, v: 1,
    historial: [{ t: ahora, q: yo.nombre, c: 'Creó el registro' }], creadoPor: yo.nombre,
  };
  if (!campos.de) return { registro: publico(await guardar('crm', { ...nuevo, id: nuevoId(pre) })) };

  // una copia de otro mes (cuota traída, venta pasada al mes en curso): una sola por tipo, mes y origen.
  // Si ya está (doble toque u otra persona) se devuelve la que está.
  const ya = await listar('crm', { donde: { tipo, mes, de: campos.de } });
  if (ya.length) return copiaExistente(ya[0], yo, hoy);
  // dos altas a la vez: el id sale de (tipo, mes, de) y se reserva con la versión. El doc se crea vacío si no
  // estaba (fusionar no pisa nada) y solo uno lo reemplaza con v 0 → 1; el otro recibe ese.
  const id = idFijo(pre, 'copia', tipo, mes, campos.de);
  await fusionar('crm', id, {});
  const g = await reemplazarSiVersion('crm', id, nuevo, 0);
  if (g) return { registro: publico(g) };
  const actual = await obtener('crm', id);
  if (!actual || actual.tipo !== tipo) throw noEsta();
  return copiaExistente(actual, yo, hoy);
}

async function editar(r, base, yo, hoy, ahora) {
  const id = typeof r.id === 'string' ? r.id : '';
  const doc = idSeguro(id) ? await obtener('crm', id) : null;
  if (!doc || !TIPOS.includes(doc.tipo) || (r.tipo && r.tipo !== doc.tipo)) throw noEsta();
  permisoCloser(doc, yo, hoy);
  const v = Number(doc.v) || 0;
  // con `base` (también null) se compara contra la versión guardada (§7.6.2)
  if (base !== undefined) {
    if (base !== null && typeof base !== 'number' && typeof base !== 'string') throw new HttpError(400, 'Pedido inválido');
    if (Number(base) !== v) throw conflicto(doc);
  }
  const campos = camposDe(r, doc.tipo);   // el mes nunca se mueve: no está en la lista blanca
  if ('closer' in campos) campos.closer = yo.rol === 'closer' ? yo.closer : await closerDeEquipo(campos.closer);
  await alcanceCloser(campos, yo, doc);
  const cambios = {}, nuevos = {};
  for (const [k, val] of Object.entries(campos)) {
    if (igual(doc[k], val)) continue;
    cambios[k] = [corto(doc[k] ?? ''), corto(val)];
    nuevos[k] = val;
  }
  if (!Object.keys(cambios).length) return { registro: publico(doc) };
  const nuevo = { ...doc, ...nuevos, v: v + 1, historial: agregarHist(doc.historial, { t: ahora, q: yo.nombre, c: cambios }) };
  const g = await reemplazarSiVersion('crm', id, nuevo, v);
  if (!g) {
    const actual = await obtener('crm', id);
    throw actual ? conflicto(actual) : noEsta();
  }
  return { registro: publico(g) };
}

const idDe = (cuerpo) => (typeof cuerpo.id === 'string' ? cuerpo.id : '');

/* ════════ POST borrar (queda una copia en crm-borrados) ════════ */
async function borrarRegistro({ cuerpo, yo }) {
  const id = idDe(cuerpo);
  const doc = idSeguro(id) ? await obtener('crm', id) : null;
  if (!doc) throw noEsta();
  const t = new Date().toISOString();
  await guardar('crm-borrados', { id: `${id}-${Date.now()}`, original: doc, por: yo.nombre, t });
  await borrar('crm', id);
  return {};
}

/* ════════ POST cierre: el plan de pagos ════════ */
async function cargarCierre({ cuerpo, yo }) {
  const id = idDe(cuerpo);
  const doc = idSeguro(id) ? await obtener('crm', id) : null;
  if (!doc || doc.tipo !== 'venta') throw new HttpError(404, 'No encontré esa venta: recargá la pantalla');
  const neg = await negocio();
  permisoCloser(doc, yo, mesLocal(neg.zona));
  const { venta, cuotas } = armarCierre(doc, cuerpo.plan, yo, neg);
  // la venta primero (con su versión: dos cierres a la vez → uno solo pasa); las cuotas después
  const g = await reemplazarSiVersion('crm', id, venta, Number(doc.v) || 0);
  if (!g) {
    const actual = await obtener('crm', id);
    if (!actual) throw new HttpError(404, 'No encontré esa venta: recargá la pantalla');
    if (actual.plan) throw new HttpError(409, 'Esta venta ya tiene su cierre cargado');
    throw conflicto(actual);
  }
  if (cuotas.length) {
    try {
      await fusionarVarios('crm', cuotas);
    } catch (e) {
      // sin sus cuotas el cierre no está: la venta vuelve a como estaba, así el "probá de nuevo" funciona (las cuotas
      // tienen id fijo: si alguna llegó a escribirse, el reintento la pisa en vez de duplicarla)
      await reemplazarSiVersion('crm', id, doc, g.v).catch((e2) => console.error('[crm] no pude deshacer el cierre de ' + id, e2));
      throw e;
    }
  }
  return { registro: publico(g) };
}

/* ════════ POST metas: reemplaza los mínimos (globales) ════════ */
const CLAVES_METAS = ['agendas', 'presentadas', 'calificadas', 'unidades', 'cierreGral', 'cierreEf', 'showUp', 'aovTrato',
  'cash', 'cuotas', 'total', 'objetivoMes'];
const TASAS = ['cierreGral', 'cierreEf', 'showUp'];
async function guardarMetas({ cuerpo }) {
  const m = cuerpo.metas;
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new HttpError(400, 'Pedido inválido');
  const out = {};
  for (const k of CLAVES_METAS) {
    if (!Object.hasOwn(m, k) || m[k] == null || m[k] === '') continue;
    const n = typeof m[k] === 'number' ? (Number.isFinite(m[k]) ? m[k] : null) : typeof m[k] === 'string' ? monto(m[k]) : null;
    if (n == null || n < 0) throw new HttpError(400, 'Los mínimos van con números de 0 para arriba');
    if (TASAS.includes(k) && n > 1) throw new HttpError(400, 'Las tasas van de 0 a 1 (0,3 es 30 %)');
    out[k] = n;
  }
  await guardar('ajustes', { id: 'metas', ...out });
  return {};
}

const ACCIONES = {
  guardar: { roles: ['equipo', 'cliente', 'closer'], fn: guardarRegistro },
  cierre: { roles: ['equipo', 'cliente', 'closer'], fn: cargarCierre },
  borrar: { roles: EC, fn: borrarRegistro, prohibido: 'Solo el equipo puede borrar registros' },
  metas: { roles: EC, fn: guardarMetas, prohibido: 'Solo el equipo puede cambiar los mínimos' },
};

export default manejar(async (req) => {
  metodo(req, ['GET', 'POST']);
  if (req.method === 'GET') return verMes(req, await requerir(req));
  const cuerpo = await leerJSON(req);
  const nombre = typeof cuerpo.accion === 'string' ? cuerpo.accion : '';
  const a = nombre && Object.hasOwn(ACCIONES, nombre) ? ACCIONES[nombre] : null;
  if (!a) throw new HttpError(400, 'Acción desconocida');
  const yo = await requerir(req);
  if (!a.roles.includes(yo.rol)) throw new HttpError(403, a.prohibido || 'No tenés acceso a esto');
  return json({ ...(await a.fn({ cuerpo, yo })), ok: true });
});

export const config = { path: '/api/crm', method: ['GET', 'POST'] };
