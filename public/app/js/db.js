/* Cliente de la base genérica (netlify/functions/db.mjs). Copiado del db.js del hub original:
 * la única diferencia es que acá no viaja ninguna clave: la sesión va en la cookie.
 *   const tareas = await dbLista('tareas');          // [{id, ...}]
 *   const t = await dbGuardar('tareas', {titulo:'x'}); // crea o actualiza (si trae id)
 *   await dbGuardarVarios('tareas', [{id, orden:1}, …]);
 *   await dbBorrar('tareas', id);
 * Un caché corto por colección evita pedir lo mismo dos veces al repintar una pantalla. */
const DB_CACHE = {};
async function dbPedir(metodo, qs, cuerpo) {
  const r = await fetch('/api/db' + (qs ? '?' + qs : ''), {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
async function dbLista(col, fresco) {
  const c = DB_CACHE[col];
  if (!fresco && c && Date.now() - c.t < 20000) return c.docs;
  const j = await dbPedir('GET', 'col=' + encodeURIComponent(col));
  DB_CACHE[col] = { t: Date.now(), docs: j.docs || [] };
  return DB_CACHE[col].docs;
}
async function dbGuardar(col, doc) {
  const j = await dbPedir('POST', '', { col, doc });
  delete DB_CACHE[col];
  return j.doc;
}
async function dbGuardarVarios(col, docs) {
  const j = await dbPedir('POST', '', { col, docs });
  delete DB_CACHE[col];
  return j.docs;
}
async function dbBorrar(col, id) {
  await dbPedir('DELETE', 'col=' + encodeURIComponent(col) + '&id=' + encodeURIComponent(id));
  delete DB_CACHE[col];
}
