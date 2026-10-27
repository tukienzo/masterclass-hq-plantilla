// Driver de producción: Supabase Postgres por PostgREST, con fetch y la clave secreta (solo en funciones).
// Claves nuevas (sb_secret_…) van solo en `apikey`; la service_role vieja (JWT) además en Authorization.
// Recibe data ya limpia de la fachada.
import { HttpError } from './http.mjs';

const PAGINA = 1000;
const LOTE = 500;
const enc = encodeURIComponent;

function base() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const clave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  // HttpError: que la persona vea qué falta y no un 500 genérico
  if (!url || !clave) throw new HttpError(500, 'Falta configurar Supabase: cargá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  return { url: url + '/rest/v1', clave };
}

async function pedir(metodo, ruta, cuerpo, prefer = 'return=representation') {
  const { url, clave } = base();
  const headers = { apikey: clave, 'Content-Type': 'application/json', Prefer: prefer };
  if (!clave.startsWith('sb_')) headers.Authorization = 'Bearer ' + clave;
  const r = await fetch(url + ruta, {
    method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });
  const txt = await r.text();
  if (r.status >= 400) {
    let mensaje = txt.slice(0, 300);
    try { const j = JSON.parse(txt); mensaje = j.message || j.error || j.hint || mensaje; } catch { /* texto plano */ }
    throw new Error('Base: ' + r.status + ' ' + mensaje);
  }
  return txt ? JSON.parse(txt) : null;
}

const iso = (t) => (t ? new Date(t).toISOString() : t);
const aDoc = (f) => ({ ...(f.data || {}), id: f.id, creado: iso(f.creado), actualizado: iso(f.actualizado) });
const primero = (filas) => (Array.isArray(filas) && filas.length ? aDoc(filas[0]) : null);
const filtroBase = (col, id) => `col=eq.${enc(col)}&id=eq.${enc(id)}`;
const SELECT = 'select=id,data,creado,actualizado';

export async function obtener(col, id) {
  return primero(await pedir('GET', `/mhq_docs?${filtroBase(col, id)}&${SELECT}`));
}

export async function listar(col, { donde = {} } = {}) {
  // claves raras (espacios, acentos) no van en la URL: se filtran acá
  const enUrl = [], aMano = {};
  for (const [k, v] of Object.entries(donde)) {
    if (!/^[A-Za-z0-9_]+$/.test(k)) aMano[k] = v;
    else enUrl.push(v == null ? `data->>${k}=is.null` : `data->>${k}=eq.${enc(String(v))}`);
  }
  const filtros = [`col=eq.${enc(col)}`, ...enUrl].join('&');
  const r = [];
  for (let offset = 0; ; offset += PAGINA) {
    const pagina = await pedir('GET', `/mhq_docs?${filtros}&${SELECT}&order=creado.asc,id.asc&limit=${PAGINA}&offset=${offset}`);
    r.push(...pagina.map(aDoc));
    if (pagina.length < PAGINA) break;
  }
  const claves = Object.entries(aMano);
  if (!claves.length) return r;
  const texto = (x) => (x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x));
  return r.filter((d) => claves.every(([k, v]) => (v == null ? d[k] == null : d[k] != null && texto(d[k]) === String(v))));
}

export async function guardar(col, id, data) {
  return primero(await pedir('POST', '/mhq_docs?on_conflict=col,id',
    { col, id, data, actualizado: new Date().toISOString() }, 'resolution=merge-duplicates,return=representation'));
}

export async function fusionar(col, id, parcial) {
  return primero(await pedir('POST', '/rpc/mhq_fusionar', { p_col: col, p_id: id, p_data: parcial }));
}

// lista = [[id, data], ...] sin ids repetidos, de a LOTE por RPC; devuelve en el orden de la lista (sin los que faltan)
async function porLotes(rpc, col, lista) {
  const porId = new Map();
  for (let i = 0; i < lista.length; i += LOTE) {
    const p_docs = lista.slice(i, i + LOTE).map(([id, data]) => ({ ...data, id }));
    for (const f of (await pedir('POST', '/rpc/' + rpc, { p_col: col, p_docs })) || []) porId.set(f.id, aDoc(f));
  }
  return lista.map(([id]) => porId.get(id)).filter(Boolean);
}

export const fusionarVarios = (col, lista) => porLotes('mhq_fusionar_varios', col, lista);

// UPDATE condicional en la base (sin insert): [] = no existe o no cumplió `si`
export async function fusionarSi(col, id, parcial, si) {
  return primero(await pedir('POST', '/rpc/mhq_fusionar_si', { p_col: col, p_id: id, p_data: parcial, p_si: si }));
}

export const fusionarVariosSiExisten = (col, lista) => porLotes('mhq_fusionar_varios_si_existen', col, lista);

export async function borrar(col, id) {
  const filas = await pedir('DELETE', `/mhq_docs?${filtroBase(col, id)}`);
  return Array.isArray(filas) && filas.length > 0;
}

export async function reemplazarSiVersion(col, id, data, vEsperada) {
  return primero(await pedir('POST', '/rpc/mhq_reemplazar_si', { p_col: col, p_id: id, p_data: data, p_v: vEsperada }));
}

export async function incrementar(col, id, campo, n) {
  return Number(await pedir('POST', '/rpc/mhq_incrementar', { p_col: col, p_id: id, p_campo: campo, p_n: n }));
}

export async function borrarViejos(col, antesISO) {
  return Number(await pedir('POST', '/rpc/mhq_borrar_viejos', { p_col: col, p_antes: antesISO })) || 0;
}
