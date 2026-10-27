// Fachada del almacenamiento: una tabla de documentos (col, id) → data. Elige el driver con ALMACEN.
// Lo que ve el código es siempre doc = {...data, id, creado, actualizado}.
import * as supabase from './almacen-supabase.mjs';
import * as archivo from './almacen-archivo.mjs';
import { nuevoId } from './normalizar.mjs';
import { HttpError } from './http.mjs';
import { enNetlify } from './config.mjs';   // ciclo con config.mjs: solo se usa adentro de funciones

export function driver() {
  const a = (process.env.ALMACEN || '').trim().toLowerCase();
  if (a === 'supabase' || a === 'archivo') return a;
  return (process.env.SUPABASE_URL || '').trim() ? 'supabase' : 'archivo';
}
// En Netlify el disco es de solo lectura y no persiste (D14): con 'archivo' se corta con un mensaje que diga qué hacer
function d() {
  if (driver() === 'supabase') return supabase;
  if (enNetlify()) throw new HttpError(500, 'Falta configurar Supabase: cargá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Netlify y no uses ALMACEN=archivo');
  return archivo;
}

const RE_COL = /^[a-z0-9][a-z0-9-]{0,63}$/;
function col_(col) {
  if (typeof col !== 'string' || !RE_COL.test(col)) throw new Error('Colección inválida: ' + col);
  return col;
}
function id_(id) {
  const s = id == null ? '' : String(id);
  if (!s || s.length > 200) throw new Error('Id inválido: ' + s.slice(0, 40));
  return s;
}

// Como viaja por JSON: sin undefined, Date → ISO; id, creado y actualizado los pone la base
function limpiar(data) {
  const o = data == null ? {} : JSON.parse(JSON.stringify(data));
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('El documento tiene que ser un objeto');
  delete o.id; delete o.creado; delete o.actualizado;
  return o;
}

export async function obtener(col, id) {
  if (id == null || id === '') return null;
  return d().obtener(col_(col), id_(id));
}

// donde: igualdad sobre claves de primer nivel (se comparan como texto). Todos, por creado ascendente.
export async function listar(col, { donde = {} } = {}) {
  return d().listar(col_(col), { donde: donde || {} });
}

export async function guardar(col, doc, { prefijo = '' } = {}) {
  const id = doc?.id != null && doc.id !== '' ? id_(doc.id) : nuevoId(prefijo);
  return d().guardar(col_(col), id, limpiar(doc));
}

export async function fusionar(col, id, parcial) {
  return d().fusionar(col_(col), id_(id), limpiar(parcial));
}

// Ids repetidos en la lista se combinan antes (el último pisa), en el orden en que aparecen por primera vez
export async function fusionarVarios(col, docs, { prefijo = '' } = {}) {
  const porId = new Map();
  for (const doc of docs || []) {
    const id = doc?.id != null && doc.id !== '' ? id_(doc.id) : nuevoId(prefijo);
    porId.set(id, { ...(porId.get(id) || {}), ...limpiar(doc) });
  }
  if (!porId.size) return [];
  return d().fusionarVarios(col_(col), [...porId]);
}

// Como fusionar, pero solo si el documento ya existe (nunca crea) y, si viene `si`, solo si para cada clave k el valor
// actual de data[k] está en la lista si[k]. Se compara como texto exacto (sin norm), pensado para valores simples;
// '' = vacío o ausente: {Closer: ['', 'Ana']} = «Closer vacío o igual a Ana». Si no se cumple: null y no escribe.
// Atómico: entre mirar la condición y escribir no se mete nadie (sirve de compare-and-set).
export async function fusionarSi(col, id, parcial, si = null) {
  col_(col);
  if (id == null || id === '') return null;
  return d().fusionarSi(col, id_(id), limpiar(parcial), condicion(si));
}

// si → {clave: ['texto', ...]} como lo comparan los drivers (null/undefined → '')
function condicion(si) {
  if (si == null) return {};
  if (typeof si !== 'object' || Array.isArray(si)) throw new Error('fusionarSi: la condición tiene que ser un objeto');
  const o = {};
  for (const [k, lista] of Object.entries(si)) {
    o[k] = [].concat(lista).map((v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)));
  }
  return o;
}

// Como fusionarVarios, pero solo actualiza los que ya existen (los que no, se saltean; los sin id también).
// Ids repetidos se combinan antes. Devuelve los actualizados, en el orden en que aparecen por primera vez.
export async function fusionarVariosSiExisten(col, docs) {
  col_(col);
  const porId = new Map();
  for (const doc of docs || []) {
    if (doc?.id == null || doc.id === '') continue;
    const id = id_(doc.id);
    porId.set(id, { ...(porId.get(id) || {}), ...limpiar(doc) });
  }
  if (!porId.size) return [];
  return d().fusionarVariosSiExisten(col, [...porId]);
}

export async function borrar(col, id) {
  return d().borrar(col_(col), id_(id));
}

// Reemplaza solo si data.v === vEsperada (0 si no tiene v). null si no coincidió o no existe.
export async function reemplazarSiVersion(col, id, data, vEsperada) {
  return d().reemplazarSiVersion(col_(col), id_(id), limpiar(data), Number(vEsperada) || 0);
}

export async function incrementar(col, id, campo = 'n', n = 1) {
  return d().incrementar(col_(col), id_(id), String(campo), Number(n));
}

export async function borrarViejos(col, antesISO) {
  const t = new Date(antesISO);
  if (Number.isNaN(t.getTime())) throw new Error('borrarViejos: fecha inválida');
  return d().borrarViejos(col_(col), t.toISOString());
}
