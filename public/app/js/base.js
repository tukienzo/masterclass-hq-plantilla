/* Masterclass HQ — el núcleo de la app, con la forma del hub original: sesión,
 * perfiles por rol, router, menú plegable y el pipeline (DATA). Las pantallas portadas del hub esperan estos
 * mismos nombres globales: DATA, api(), flash(), esc(), route(), vistasDe(), perfilEfectivo(), PANTALLAS.
 *
 * Diferencias con el hub original, a propósito:
 *   · Se entra con el código personal (o el link /app/#k=<código>) y la sesión va en una cookie HttpOnly. No hay clave en el
 *     navegador: KEY existe vacía solo para que el código portado que la nombra no se rompa.
 *   · El rol sale del servidor (/api/acceso → yo), no del localStorage.
 *   · Esconder no es seguridad: cada función del servidor vuelve a chequear el rol (lib/sesion.mjs).
 */
let DATA = { rows: [], estados: [] };   // el pipeline: una fila por agenda (/api/panel), igual que en el hub original
let YO = null;                          // {uid, nombre, rol, pantallas} de la sesión
const KEY = '';                         // compat con el código portado que manda x-hub-key (acá no se usa)
window.PANTALLAS = window.PANTALLAS || {};

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function flash(msg, err) {
  const el = document.getElementById('pstatus');
  if (!el) return;
  el.textContent = msg; el.classList.toggle('err', !!err); el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), err ? 5000 : 1600);
}

/* ── llamadas al servidor ── */
async function pedirJSON(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { if (YO) mostrarGate('Tu sesión se cerró: entrá de nuevo con tu link.'); throw new Error('sesion'); }
  if (!r.ok || (j && (j.error || j.ok === false))) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j;
}
// el api() del hub: GET trae el pipeline; POST {row, field, value} edita; POST {action, …} el resto
async function api(method, body) {
  return pedirJSON('/api/panel', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
// las acciones de la app de masterclass (webinar, registros, landing, conexiones, equipo)
async function apiApp(accion, datos = {}) {
  return pedirJSON('/api/app', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, ...datos }) });
}
async function apiAcceso(accion, datos = {}) {
  const r = await fetch('/api/acceso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, ...datos }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
async function cargarDatos() {
  DATA = await api('GET');
  document.dispatchEvent(new CustomEvent('mhq:datos'));
  return DATA;
}

/* ── perfiles: qué pantallas ve cada rol (la "matriz de vistas" del hub, con los roles de masterclass) ── */
const VISTAS_TODAS = ['ceo', 'anuncios', 'utms', 'traza', 'icp', 'registros', 'landing', 'embudos', 'closers', 'central', 'analisis',
  'pipeline', 'llamadas', 'precall', 'crm', 'finanzas', 'kpis', 'webinar', 'conexiones', 'equipo'];
const PERFILVIEWS = {
  equipo: VISTAS_TODAS,
  cliente: VISTAS_TODAS,
  closer: ['closers', 'central', 'analisis', 'pipeline', 'llamadas', 'precall', 'crm', 'webinar'],
};
const ROLDEF = { equipo: '#ceo', cliente: '#ceo', closer: '#central' };
const PERFIL_ROL_DESC = { equipo: 'Equipo', cliente: 'Cliente', closer: 'Closer' };
function perfilActual() { return (YO && YO.rol) || ''; }
function perfilEfectivo() { return perfilActual(); }
function vistasDe(rol) { return PERFILVIEWS[rol] || []; }

function aplicarPerfil() {
  if (typeof familiasNav === 'function') familiasNav();
  const views = vistasDe(perfilEfectivo());
  document.querySelectorAll('#nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    a.style.display = href.startsWith('#') && views.includes(href.slice(1)) ? '' : 'none';
  });
  // un grupo sin ningún ítem visible se esconde
  document.querySelectorAll('#nav .group').forEach((g) => {
    g.style.display = navItems(g).some((a) => a.style.display !== 'none') ? '' : 'none';
  });
}

/* ── router (el route() del hub) ── */
let views = [], links = [];
function route() {
  const p = perfilEfectivo();
  const permitidas = vistasDe(p);
  const def = ROLDEF[p] || '#webinar';
  let id = (location.hash || def).slice(1);
  if (id.startsWith('k=')) id = def.slice(1);
  const pedida = id;
  if (!document.getElementById(id) || !permitidas.includes(id)) id = def.slice(1);
  // el hash siempre dice qué pantalla está abierta (también al entrar con el link, que llega sin hash): shell.js y
  // las pantallas (PANTALLAS[id]) lo leen para saber qué pintar
  if ((location.hash || '').slice(1) !== id) { try { history.replaceState(null, '', '#' + id); } catch (e) {} }
  views.forEach((v) => v.classList.toggle('on', v.id === id));
  links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + id));
  const t = document.getElementById('viewtitle');
  if (t) t.textContent = (document.getElementById(id) || {}).dataset?.title || '';
  navAbrirActivo(id);
  navAplicar();
  const panel = document.getElementById('mainScroll');
  if (panel) panel.scrollTop = 0;
}
// un link /app/#k=… pegado en una pestaña que ya tenía la app abierta solo cambia el hash: se recarga para que boot()
// entre con ese código (sin esto seguía la pantalla del código, o la persona anterior en #ceo)
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).get('k')) { location.reload(); return; }
  if (YO) route();
});

/* ── grupos plegables del menú (los del hub) ── */
function navItems(grupo) {
  const out = [];
  let sib = grupo.nextElementSibling;
  while (sib && !sib.classList.contains('group')) { out.push(sib); sib = sib.nextElementSibling; }
  return out;
}
function navCubre(a, id) {
  if (a.getAttribute('href') === '#' + id) return true;
  const f = typeof familiaDe === 'function' ? familiaDe(id) : null;
  return !!(f && a.dataset && a.dataset.fam === f.id);
}
function navCerrados() {
  try { const g = localStorage.getItem('mhqnavcerrados'); if (g) return new Set(JSON.parse(g)); } catch (e) {}
  const activa = (location.hash || '').slice(1);
  const out = new Set();
  document.querySelectorAll('#nav .group').forEach((g) => { if (!navItems(g).some((a) => navCubre(a, activa))) out.add(g.dataset.g || ''); });
  return out;
}
function navGuardar(set) { try { localStorage.setItem('mhqnavcerrados', JSON.stringify([...set])); } catch (e) {} }
function navAbrirActivo(id) {
  let guardado = null;
  try { guardado = localStorage.getItem('mhqnavcerrados'); } catch (e) {}
  if (!guardado) return;
  const cerrados = navCerrados();
  document.querySelectorAll('#nav .group').forEach((g) => { if (navItems(g).some((a) => navCubre(a, id))) cerrados.delete(g.dataset.g || ''); });
  navGuardar(cerrados);
}
function navAplicar() {
  const cerrados = navCerrados();
  const activa = (location.hash || '').slice(1);
  document.querySelectorAll('#nav .group').forEach((g) => {
    const items = navItems(g);
    const cerrado = cerrados.has(g.dataset.g || '');
    g.classList.toggle('cerrado', cerrado);
    g.classList.toggle('activo', items.some((a) => navCubre(a, activa)));
    items.forEach((a) => a.classList.toggle('grupo-cerrado', cerrado));
  });
}
function navEnganchar() {
  document.querySelectorAll('#nav .group').forEach((g) => g.addEventListener('click', () => {
    const cerrados = navCerrados();
    const n = g.dataset.g || '';
    if (cerrados.has(n)) cerrados.delete(n); else cerrados.add(n);
    navGuardar(cerrados);
    navAplicar();
  }));
}

/* ── ingreso con el código personal (o el link de antes) ── */
function mostrarGate(msg = '') {
  YO = null;
  document.getElementById('app').style.visibility = 'hidden';
  document.getElementById('gate').style.display = '';
  document.getElementById('gateerr').textContent = msg;
}
async function entrarConClave(clave) {
  const j = await apiAcceso('entrar', { clave });
  return j.yo;
}
document.addEventListener('DOMContentLoaded', () => {
  const f = document.getElementById('gateForm');
  if (f) f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = document.getElementById('gatepass').value.trim();
    const clave = (v.match(/[#&?]k=([\w-]+)/) || [])[1] || v;
    const b = document.getElementById('gatebtn');
    b.disabled = true; b.textContent = 'Entrando…';
    try { await entrarConClave(clave); await boot(); }
    catch (err) { document.getElementById('gateerr').textContent = err.message; }
    finally { b.disabled = false; b.textContent = 'Entrar'; }
  });
});

function pintarPie() {
  const pie = document.getElementById('sidebarFoot');
  if (!pie || !YO) return;
  // el pie del hub: avatar, nombre, rol y salir (clases de atlas.css)
  pie.innerHTML = `<span class="avatar">${esc((YO.nombre || '?').trim().charAt(0).toUpperCase())}</span>
    <div><div class="sf-name">${esc(YO.nombre)}</div><div class="sf-sub">${esc((window.MHQ && MHQ.cliente.nombre) || 'Masterclass HQ')}</div></div>
    <span class="rol-chip">${esc(PERFIL_ROL_DESC[YO.rol] || YO.rol)}</span>
    <button class="btn-salir" id="salir" title="Salir" aria-label="Salir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`;
  document.getElementById('salir').addEventListener('click', async (e) => {
    e.preventDefault();
    try { await apiAcceso('salir'); } catch (err) {}
    location.reload();
  });
}

async function boot() {
  const k = new URLSearchParams(location.hash.slice(1)).get('k');
  if (k) {
    history.replaceState(null, '', location.pathname);
    try { await entrarConClave(k); } catch (e) { mostrarGate(e.message); return; }
  }
  try { YO = (await apiAcceso('yo')).yo; } catch (e) { mostrarGate(); return; }
  try {
    const ini = await apiApp('inicio');
    window.MHQ = ini;   // cliente, webinars, webinar activo, opciones (lo usan las pantallas de masterclass)
    const logo = document.getElementById('logoCliente');
    if (logo) logo.textContent = ini.cliente.nombre;
    const letra = document.getElementById('logoLetra');
    if (letra) letra.textContent = (ini.cliente.nombre || 'M').trim().charAt(0).toUpperCase();
    const g = document.getElementById('gateTitulo');
    if (g) g.textContent = ini.cliente.nombre;
  } catch (e) { if (e.message === 'sesion') return; }
  document.getElementById('gate').style.display = 'none';
  views = [...document.querySelectorAll('.view')];
  links = [...document.querySelectorAll('#nav a')];
  aplicarPerfil();
  pintarPie();
  document.getElementById('app').style.visibility = 'visible';
  try { await cargarDatos(); } catch (e) { if (e.message !== 'sesion') flash('No pude traer el pipeline: ' + e.message, true); }
  route();
  if (typeof revisarSalud === 'function') revisarSalud();
}
document.addEventListener('DOMContentLoaded', () => { navEnganchar(); boot(); });
