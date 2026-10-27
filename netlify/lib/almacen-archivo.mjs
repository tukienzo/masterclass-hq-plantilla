// Driver local: un JSON por colección en DATOS_DIR (por defecto .datos/ en la raíz del repo).
// Solo para desarrollo y pruebas: en Netlify el disco no persiste (D14).
// Caché en memoria por colección (se recarga si otro proceso tocó el archivo, p. ej. la semilla con el dev
// corriendo), escrituras en fila por colección y atómicas (.tmp + rename). Recibe data ya limpia de la fachada.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = (() => {
  try { return fileURLToPath(new URL('../../', import.meta.url)); } catch { return process.cwd(); }
})();
const archivo = (col) => path.join(path.resolve(RAIZ, process.env.DATOS_DIR || '.datos'), col + '.json');

const cache = new Map();   // archivo → {mtime, size, docs: Map id → {data, creado, actualizado}}
const filas = new Map();   // archivo → promesa de la última escritura

async function cargar(f) {
  let st;
  try {
    st = await fs.stat(f);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    cache.delete(f);
    return new Map();
  }
  const c = cache.get(f);
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.docs;
  const txt = await fs.readFile(f, 'utf8');
  const docs = new Map(Object.entries(txt.trim() ? JSON.parse(txt) : {}));
  cache.set(f, { mtime: st.mtimeMs, size: st.size, docs });
  return docs;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function renombrar(de, a) {
  for (let i = 0; ; i++) {
    try { return await fs.rename(de, a); } catch (e) {
      // Windows: un antivirus o un lector puede tener el archivo abierto un instante
      if (i >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await esperar(25 * (i + 1));
    }
  }
}

// un doc por renglón: se puede mirar a ojo y sigue siendo JSON válido
const serializar = (docs) => '{\n' + [...docs].map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}\n';

async function escribir(f, docs) {
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  await fs.writeFile(tmp, serializar(docs), 'utf8');
  await renombrar(tmp, f);
  const st = await fs.stat(f);
  cache.set(f, { mtime: st.mtimeMs, size: st.size, docs });
}

// cambiar(docs, ahora) toca una copia del Map y devuelve {valor, sinCambios?}; sinCambios evita escribir
function enFila(col, cambiar) {
  const f = archivo(col);
  const tarea = async () => {
    const docs = new Map(await cargar(f));
    const r = cambiar(docs, new Date().toISOString());
    if (!r.sinCambios) await escribir(f, docs);
    return r.valor;
  };
  const p = (filas.get(f) || Promise.resolve()).then(tarea, tarea);
  filas.set(f, p.catch(() => {}));
  return p;
}

const aDoc = (id, e) => ({ ...structuredClone(e.data), id, creado: e.creado, actualizado: e.actualizado });

// mismas reglas que data->>campo = valor en Postgres (null = la clave falta o es null)
const comoTexto = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
function cumple(data, donde) {
  for (const [k, v] of Object.entries(donde)) {
    const x = data[k];
    if (v == null) { if (x != null) return false; continue; }
    if (x == null || comoTexto(x) !== String(v)) return false;
  }
  return true;
}
const porCreado = (a, b) => (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// merge superficial como jsonb ||: lo nuevo pisa (null incluido), lo que no viene se conserva
function fusionarEn(docs, id, parcial, ahora) {
  const viejo = docs.get(id);
  const e = { data: { ...(viejo?.data || {}), ...parcial }, creado: viejo?.creado || ahora, actualizado: ahora };
  docs.set(id, e);
  return aDoc(id, e);
}

export async function obtener(col, id) {
  const e = (await cargar(archivo(col))).get(id);
  return e ? aDoc(id, e) : null;
}

export async function listar(col, { donde = {} } = {}) {
  const r = [];
  for (const [id, e] of await cargar(archivo(col))) if (cumple(e.data, donde)) r.push({ id, creado: e.creado, e });
  return r.sort(porCreado).map(({ id, e }) => aDoc(id, e));
}

export function guardar(col, id, data) {
  return enFila(col, (docs, ahora) => {
    const e = { data, creado: docs.get(id)?.creado || ahora, actualizado: ahora };
    docs.set(id, e);
    return { valor: aDoc(id, e) };
  });
}

export const fusionar = (col, id, parcial) => enFila(col, (docs, ahora) => ({ valor: fusionarEn(docs, id, parcial, ahora) }));

// lista = [[id, data], ...] sin ids repetidos (la fachada ya los combinó)
export function fusionarVarios(col, lista) {
  return enFila(col, (docs, ahora) => ({
    valor: lista.map(([id, parcial]) => fusionarEn(docs, id, parcial, ahora)),
    sinCambios: !lista.length,
  }));
}

// si = {clave: ['texto', ...]} (la fachada ya lo pasó a texto); '' = vacío o ausente, como coalesce(data->>k, '')
function acepta(data, si) {
  for (const [k, lista] of Object.entries(si)) {
    const x = data[k];
    if (!lista.includes(x == null || x === '' ? '' : comoTexto(x))) return false;
  }
  return true;
}

// mira y escribe dentro de la misma vuelta de la fila: nadie se mete en el medio
export function fusionarSi(col, id, parcial, si) {
  return enFila(col, (docs, ahora) => {
    const viejo = docs.get(id);
    if (!viejo || !acepta(viejo.data, si)) return { valor: null, sinCambios: true };
    return { valor: fusionarEn(docs, id, parcial, ahora) };
  });
}

export function fusionarVariosSiExisten(col, lista) {
  return enFila(col, (docs, ahora) => {
    const valor = lista.filter(([id]) => docs.has(id)).map(([id, parcial]) => fusionarEn(docs, id, parcial, ahora));
    return { valor, sinCambios: !valor.length };
  });
}

export function borrar(col, id) {
  return enFila(col, (docs) => (docs.delete(id) ? { valor: true } : { valor: false, sinCambios: true }));
}

export function reemplazarSiVersion(col, id, data, vEsperada) {
  return enFila(col, (docs, ahora) => {
    const viejo = docs.get(id);
    const v = viejo?.data?.v == null ? 0 : Number(viejo.data.v);
    if (!viejo || v !== Number(vEsperada)) return { valor: null, sinCambios: true };
    const e = { data, creado: viejo.creado, actualizado: ahora };
    docs.set(id, e);
    return { valor: aDoc(id, e) };
  });
}

export function incrementar(col, id, campo, n) {
  return enFila(col, (docs, ahora) => {
    const total = (Number(docs.get(id)?.data?.[campo]) || 0) + Number(n);
    fusionarEn(docs, id, { [campo]: total }, ahora);
    return { valor: total };
  });
}

export function borrarViejos(col, antesISO) {
  const antes = new Date(antesISO).getTime();
  return enFila(col, (docs) => {
    let n = 0;
    for (const [id, e] of docs) if (new Date(e.actualizado).getTime() < antes) { docs.delete(id); n++; }
    return { valor: n, sinCambios: n === 0 };
  });
}
