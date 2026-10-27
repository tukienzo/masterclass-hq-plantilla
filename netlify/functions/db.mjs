// /api/db — colecciones genéricas de documentos (SPEC §7.8), las de db.js: dbLista, dbGuardar, dbGuardarVarios y
// dbBorrar. Toda escritura con id es merge superficial (null pisa); las colecciones internas no se tocan desde acá.
// db.js no abre el gate en 401: los errores van legibles y nunca un 200 con `error`.
import { manejar, json, leerJSON, metodo, query, HttpError } from '../lib/http.mjs';
import { requerir, ROLES } from '../lib/sesion.mjs';
import { listar, fusionar, fusionarVarios, borrar } from '../lib/almacen.mjs';
import { idSeguro, nuevoId, monto, norm, texto } from '../lib/normalizar.mjs';

const EC = ['equipo', 'cliente'];
const RESERVADAS = new Set(['personas', 'webinars', 'ajustes', 'registros', 'agendas', 'crm', 'crm-borrados',
  'integraciones', 'icp-ia', 'cache', 'limites', 'cola']);
const LECTURA_TODOS = new Set(['ag-evaluaciones', 'ag-config']);   // el closer las lee en Agendas
const MAX_DOCS = 200;
const MAX_DOC = 64 * 1024;
// el GET devuelve la colección entera y Netlify corta las respuestas de más de 6 MB (§1.2)
const MAX_COL = 5 * 1024 * 1024;
const MAX_RESPUESTA = 5.5 * 1024 * 1024;

const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
const dataDe = ({ id, creado, actualizado, ...data }) => data;

function coleccion(col) {
  if (typeof col !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(col)) throw new HttpError(400, 'Colección inválida');
  if (RESERVADAS.has(col)) throw new HttpError(403, 'Esa colección no se puede tocar desde acá');
  return col;
}
const prefijoDe = (col) => (col === 'programas' ? 'pr_' : col[0] + '_');
function permitir(yo, roles) {
  if (!roles.includes(yo.rol)) throw new HttpError(403, 'No tenés acceso a esto');
}

// {id, data}: sin id/creado/actualizado en data; id validado ('' = nuevo)
function preparar(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new HttpError(400, 'Pedido inválido');
  const { id: crudo, creado, actualizado, ...data } = doc;
  let id = '';
  if (crudo != null && crudo !== '') {
    id = Number.isInteger(crudo) ? String(crudo) : crudo;
    if (!idSeguro(id)) throw new HttpError(400, 'Id inválido');
  }
  if (bytes(data) > MAX_DOC) throw new HttpError(400, 'El documento es demasiado grande (máximo 64 KB)');
  return { id, data };
}

// número de 0 a 10, '' (o blancos) o null → null; si no, 400
function puntaje(v) {
  if (v === null || (typeof v === 'string' && !v.trim())) return null;
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10) throw new HttpError(400, 'Los puntajes van de 0 a 10');
  return n;
}

// texto (o número): un objeto o un array no se guarda como '[object Object]'
function soloTexto(v, max, mensaje) {
  if (v == null) return '';
  if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return texto(v, max);
  throw new HttpError(400, mensaje);
}

// Normalización por colección: (data, doc guardado | undefined, yo) → toca data en el lugar o tira 400
const REGLAS = {
  programas(d, previo) {
    if ('nombre' in d || !previo) {
      d.nombre = soloTexto(d.nombre, 120, 'Falta el nombre del programa');
      if (!d.nombre) throw new HttpError(400, 'Falta el nombre del programa');
    }
    if ('precio' in d || !previo) {
      const v = d.precio;
      if (typeof v === 'boolean' || (v !== null && typeof v === 'object') || (typeof v === 'number' && !Number.isFinite(v))) {
        throw new HttpError(400, 'El precio tiene que ser un número');
      }
      d.precio = monto(v) ?? 0;
      if (d.precio < 0) throw new HttpError(400, 'El precio tiene que ser 0 o más');
    }
    if ('orden' in d || !previo) {
      const n = Number(d.orden);
      d.orden = Number.isFinite(n) ? Math.round(n) : 0;
    }
  },
  'webinar-asistencia'(d) {
    if (!('asistentes' in d)) return;
    const v = d.asistentes;
    if (v === null || v === '') { d.asistentes = null; return; }
    const n = typeof v === 'string' ? Number(v.trim()) : v;
    if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'Los asistentes van como un número entero desde 0 (o vacío)');
    d.asistentes = n;
  },
  'ag-evaluaciones'(d, previo, yo) {
    for (const k of ['score', 'lead', 'interes', 'urgencia']) if (k in d) d[k] = puntaje(d[k]);
    if ('por' in d || !previo) d.por = soloTexto(d.por, 120, 'Quién evalúa va como texto') || yo.nombre;
  },
  'anun-audiencias'(d) {
    if ('ratio' in d) {
      const r = Number(d.ratio);
      if (![0.01, 0.03, 0.05].includes(r)) throw new HttpError(400, 'El tamaño del público va de 1 %, 3 % o 5 %');
      d.ratio = r;
    }
    if ('paises' in d) {
      if (!Array.isArray(d.paises)) throw new HttpError(400, 'Elegí hasta 5 países');
      const ps = [...new Set(d.paises.map((p) => String(p ?? '').trim().toUpperCase()))];
      if (ps.some((p) => !/^[A-Z]{2}$/.test(p))) throw new HttpError(400, 'Cada país va con su código de 2 letras (AR, MX…)');
      if (ps.length > 5) throw new HttpError(400, 'Elegí hasta 5 países');
      d.paises = ps;
    }
  },
};

// R-07: el nombre de un programa es único (por norm) sobre el resultado: los del pedido + los guardados que no toca.
// Solo frena lo que el pedido nombra o renombra: un duplicado viejo no bloquea otros cambios.
function nombresUnicos(entradas, previos) {
  const finales = new Map([...previos].map(([id, p]) => [id, norm(p.nombre)]));
  const propios = [];
  entradas.forEach((e, i) => {
    if (!('nombre' in e.data)) return;
    const k = norm(e.data.nombre), previo = previos.get(e.id);
    finales.set(e.id || `nuevo:${i}`, k);
    if (k && (!previo || k !== norm(previo.nombre))) propios.push(k);
  });
  const veces = new Map();
  for (const k of finales.values()) veces.set(k, (veces.get(k) || 0) + 1);
  if (propios.some((k) => veces.get(k) > 1)) throw new HttpError(409, 'Ya hay un programa con ese nombre');
}

// Dos altas iguales a la vez (doble clic en Guardar) pasan las dos el chequeo: después de escribir, el nombre es del
// programa guardado primero (creado, id); si el de este pedido llegó segundo, se borran sus altas y va el 409.
async function sinDobleAlta(creados) {
  if (!creados.length) return;
  const dueno = new Map();
  for (const d of await listar('programas')) {
    const k = norm(d.nombre);
    if (k && !dueno.has(k)) dueno.set(k, d.id);
  }
  if (creados.every((d) => { const k = norm(d.nombre); return !k || dueno.get(k) === d.id; })) return;
  await Promise.all(creados.map((d) => borrar('programas', d.id)));
  throw new HttpError(409, 'Ya hay un programa con ese nombre');
}

// §7.8: los 64 KB son del doc que queda después del merge, y la colección tiene que seguir entrando en un GET.
// Lo que ya se pasó se puede achicar (si no, no habría cómo arreglarlo desde la pantalla).
function medir(entradas, previos, guardados) {
  const antes = guardados.reduce((s, d) => s + bytes(d), 0);
  let total = antes;
  for (const e of entradas) {
    const p = previos.get(e.id);
    const viejo = p ? bytes(dataDe(p)) : 0;
    const nuevo = bytes(p ? { ...dataDe(p), ...e.data } : e.data);
    if (nuevo > MAX_DOC && nuevo > viejo) throw new HttpError(400, 'El documento es demasiado grande (máximo 64 KB)');
    total += nuevo - viejo;
  }
  if (total > MAX_COL && total > antes) throw new HttpError(400, 'Esta colección ya ocupa demasiado (máximo 5 MB): borrá lo que no uses');
}

async function escribir(col, cuerpo, yo) {
  const varios = Array.isArray(cuerpo.docs);
  if (!varios && (!cuerpo.doc || typeof cuerpo.doc !== 'object' || Array.isArray(cuerpo.doc))) throw new HttpError(400, 'Pedido inválido');
  const lista = varios ? cuerpo.docs : [cuerpo.doc];
  if (lista.length > MAX_DOCS) throw new HttpError(400, 'Demasiados documentos');

  // ids repetidos se combinan antes (el último pisa), igual que fusionarVarios
  const entradas = [], porId = new Map();
  for (const doc of lista) {
    const e = preparar(doc);
    const mismo = e.id && porId.get(e.id);
    if (mismo) mismo.data = { ...mismo.data, ...e.data };
    else { entradas.push(e); if (e.id) porId.set(e.id, e); }
  }

  // todo o nada: se valida todo antes de escribir, contra lo guardado (una sola lectura de la colección)
  const guardados = await listar(col);
  const previos = new Map(guardados.map((d) => [d.id, d]));
  const regla = REGLAS[col];
  if (regla) for (const e of entradas) regla(e.data, previos.get(e.id), yo);
  if (col === 'programas') nombresUnicos(entradas, previos);
  medir(entradas, previos, guardados);

  const prefijo = prefijoDe(col);
  const docs = varios
    ? await fusionarVarios(col, entradas.map((e) => ({ ...e.data, id: e.id })), { prefijo })
    : [await fusionar(col, entradas[0].id || nuevoId(prefijo), entradas[0].data)];
  if (col === 'programas') await sinDobleAlta(docs.filter((d) => !previos.has(d.id)));
  return varios ? { docs } : { doc: docs[0] };
}

export default manejar(async (req) => {
  metodo(req, ['GET', 'POST', 'DELETE']);
  const yo = await requerir(req);   // sin sesión: 401 antes de mirar nada

  if (req.method === 'GET') {
    const col = coleccion(query(req).get('col'));
    permitir(yo, LECTURA_TODOS.has(col) ? ROLES : EC);
    const r = { ok: true, docs: await listar(col) };
    if (bytes(r) > MAX_RESPUESTA) throw new HttpError(400, 'Esta colección es demasiado grande para traerla entera: borrá documentos que no uses');
    return json(r);
  }

  permitir(yo, EC);
  if (req.method === 'DELETE') {
    const q = query(req);
    const col = coleccion(q.get('col'));
    const id = q.get('id');
    if (!idSeguro(id)) throw new HttpError(400, 'Id inválido');
    await borrar(col, id);   // aunque no existiera
    return json({ ok: true });
  }

  const cuerpo = await leerJSON(req, { max: 1024 * 1024 });
  const col = coleccion(cuerpo.col);
  return json({ ok: true, ...(await escribir(col, cuerpo, yo)) });
});

export const config = { path: '/api/db', method: ['GET', 'POST', 'DELETE'] };
