/* Copiado del shell.js del hub original. Cambian solo FAMILIAS (las de masterclass) y la llave
 * del menú plegado. El shell del hub: migas de pan, plegado del menú y el aviso de conexiones caídas.
 *
 * Va DESPUÉS de hub.js a propósito: engancha arriba del router que ya existe en vez de
 * reemplazarlo. Si mañana se borra este archivo, el hub sigue andando igual — solo pierde las
 * migas y el aviso. Esa es la idea: que la capa nueva no sea un requisito de la vieja.
 */

/* ── migas de pan ──
   Salen del propio menú: para el <a> activo se camina hacia atrás hasta el .group más cercano y
   se lee su data-g. Así no hay una segunda tabla de secciones que se desincronice con el menú. */
function grupoDe(enlace) {
  const g = grupoNodo(enlace);
  return g ? (g.dataset.g || '') : '';
}
function grupoNodo(enlace) {
  let n = enlace && enlace.previousElementSibling;
  while (n) {
    if (n.classList && n.classList.contains('group')) return n;
    n = n.previousElementSibling;
  }
  return null;
}

function pintarMigas() {
  const caja = document.getElementById('migas');
  if (!caja) return;
  const activo = document.querySelector('#nav a.active');
  // El nombre de la sección sale del data-title de la vista (o de la familia), no del <h1>: el
  // Inicio pone un saludo como título y la miga tiene que seguir diciendo "Inicio".
  const vista = document.querySelector('.view.on');
  const fam = vista && typeof familiaDe === 'function' ? familiaDe(vista.id) : null;
  const titulo = fam ? fam.titulo : ((vista && vista.dataset.title) || (document.getElementById('viewtitle') || {}).textContent || '');
  const grupo = grupoDe(activo);
  // Como la referencia de diseño: el ícono del grupo adelante (o el de la pantalla si va suelta, como Inicio).
  const gNodo = grupoNodo(activo);
  const icoSrc = (gNodo || activo) && (gNodo || activo).querySelector('svg.navicon');
  const ico = icoSrc ? `<span class="miga-ico">${icoSrc.outerHTML.replace('class="navicon"', '')}</span>` : '';
  // "Finanzas › Finanzas" no le dice nada a nadie: cuando el grupo se llama igual que la
  // pantalla, se muestra la pantalla sola.
  const norm = (t) => String(t || '').trim().toLowerCase();
  caja.innerHTML = (grupo && norm(grupo) !== norm(titulo))
    ? `${ico}<span>${grupo}</span><i>›</i><b>${titulo}</b>`
    : `<b>${titulo}</b>`;
}

/* ── plegar el menú ──
   Se recuerda en el navegador: quien trabaja en una pantalla angosta no quiere volver a
   plegarlo en cada carga. Es una preferencia de cada uno, por eso va en localStorage y no
   en el servidor. */
function plegarMenu() {
  const plegado = document.body.classList.toggle('menu-plegado');
  try { localStorage.setItem('mhqmenu', plegado ? 'off' : 'on'); } catch (e) {}
  if (typeof navFlyCerrar === 'function') navFlyCerrar();
}
/* Con el menú plegado solo quedan los íconos de los grupos: al pasar el mouse (o tocar) uno, sus pantallas
   aparecen en un menú flotante al lado del riel. Los ítems se copian del propio menú, así respetan lo que el
   perfil puede ver (aplicarPerfil los esconde con display:none). */
(function navFlotante() {
  const fly = document.createElement('div');
  fly.className = 'nav-fly'; fly.id = 'navFly'; fly.setAttribute('role', 'menu');
  document.body.appendChild(fly);
  let actual = null, tCerrar = 0;
  const plegado = () => document.body.classList.contains('menu-plegado');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function cerrar() {
    clearTimeout(tCerrar);
    fly.classList.remove('open');
    if (actual) actual.classList.remove('fly-on');
    actual = null;
  }
  window.navFlyCerrar = cerrar;
  const fila = (a) => { const svg = a.querySelector('svg'); return `<a href="${esc(a.getAttribute('href'))}"${a.classList.contains('active') ? ' class="active"' : ''}>${svg ? svg.outerHTML : ''}<span>${esc(a.textContent.trim())}</span></a>`; };
  function abrir(el) {
    if (!plegado()) return;
    clearTimeout(tCerrar);
    if (actual === el && fly.classList.contains('open')) return;
    if (actual) actual.classList.remove('fly-on');
    actual = el; el.classList.add('fly-on');
    if (el.classList.contains('group')) {
      const items = (typeof navItems === 'function' ? navItems(el) : []).filter(a => a.tagName === 'A' && a.style.display !== 'none');
      fly.innerHTML = `<div class="nav-fly-t">${esc((el.dataset.g || el.textContent || '').trim())}</div>${items.map(fila).join('')}`;
    } else fly.innerHTML = fila(el);
    const r = el.getBoundingClientRect(), riel = (el.closest('aside') || el).getBoundingClientRect();
    fly.style.left = Math.round(riel.right + 8) + 'px';
    fly.style.top = '0px';
    fly.classList.add('open');
    fly.style.top = Math.round(Math.max(8, Math.min(r.top - 6, innerHeight - fly.offsetHeight - 8))) + 'px';
  }
  const programarCierre = () => { clearTimeout(tCerrar); tCerrar = setTimeout(cerrar, 180); };
  document.querySelectorAll('#nav .group, #nav a.suelto').forEach(el => {
    el.addEventListener('mouseenter', () => abrir(el));
    el.addEventListener('mouseleave', programarCierre);
  });
  // plegado, el clic en un grupo no lo abre ni lo cierra en el menú (no se vería): abre o cierra el flotante
  document.querySelectorAll('#nav .group').forEach(g => g.addEventListener('click', (e) => {
    if (!plegado()) return;
    e.stopImmediatePropagation();
    if (actual === g && fly.classList.contains('open')) cerrar(); else abrir(g);
  }, true));
  fly.addEventListener('mouseenter', () => clearTimeout(tCerrar));
  fly.addEventListener('mouseleave', programarCierre);
  fly.addEventListener('click', (e) => { if (e.target.closest('a')) cerrar(); });
  window.addEventListener('hashchange', cerrar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#navFly, #nav')) cerrar(); });
})();
(function recordarMenu() {
  try { if (localStorage.getItem('mhqmenu') === 'off') document.body.classList.add('menu-plegado'); } catch (e) {}
})();

/* ── aviso de conexiones ──
   La referencia de diseño tiene un "1 conexión con problemas" arriba de todo, y es de las cosas más útiles que
   tiene: te enterás de que algo se cayó al entrar, no cuando un número sale mal tres días
   después. Acá sale de probar las integraciones de verdad (función salud).
   Si la función todavía no existe o falla, la tarjeta NO se muestra: mejor no decir nada que
   decir "todo bien" sin haberlo chequeado. */
async function revisarSalud() {
  if (typeof YO === 'undefined' || !YO || YO.rol === 'closer') return;   // sin sesión da 401 y al closer no se le muestra (403): no se pide
  const card = document.getElementById('sideSalud');
  const txt = document.getElementById('sideSaludTxt');
  if (!card || !txt) return;
  card.classList.add('probando');
  try {
    const r = await fetch('/.netlify/functions/salud');
    if (!r.ok) return;                       // sin chequeo no se afirma nada
    const j = await r.json();
    const mal = (j.servicios || []).filter(s => s.estado === 'mal');
    window.__salud = j;
    card.hidden = false;
    card.classList.remove('probando');
    if (mal.length) {
      card.classList.remove('ok');
      txt.textContent = mal.length === 1
        ? `1 conexión con problemas: ${mal[0].nombre}`
        : `${mal.length} conexiones con problemas`;
    } else {
      card.classList.add('ok');
      // "pendiente" (falta un paso, por ejemplo la App Review de Meta) no es un problema, pero tampoco "todas bien"
      const pend = (j.servicios || []).filter(s => s.estado === 'pendiente').length;
      txt.textContent = pend
        ? `${(j.servicios || []).length} conexiones · ${pend} pendiente${pend === 1 ? '' : 's'}`
        : `${(j.servicios || []).length} conexiones, todas bien`;
    }
  } catch (e) { /* sin red: la tarjeta queda oculta */ }
}

function irASalud() {
  const j = window.__salud;
  if (!j) return;
  const linea = s => `${s.estado === 'ok' ? '✓' : s.estado === 'mal' ? '✗' : '·'}  ${s.nombre} — ${s.detalle || ''}`;
  alert('Conexiones\n\n' + (j.servicios || []).map(linea).join('\n') +
    `\n\nChequeado: ${j.cuando || 'recién'}`);
}

/* ── enganche ──
   El router del hub cambia el hash y repinta el título; esto se cuelga de los mismos eventos en
   vez de tocarlo. El setTimeout de 0 es para leer el título DESPUÉS de que el router lo escriba. */
/* Registro de pantallas nuevas.
   El router de hub.js despacha con `if (id === 'x')` escritos a mano. En vez de meterle más
   líneas ahí, las pantallas que se van escribiendo como archivo propio se anotan en
   window.PANTALLAS y se las llama desde acá. Si mañana se reescribe el router, esto se cae solo
   sin arrastrar nada. */
function pantallaActual() {
  if (typeof YO !== 'undefined' && !YO) return;   // antes del ingreso todo da 401: boot() → route() la vuelve a llamar con la sesión
  const id = (location.hash || '').slice(1);
  const fn = (window.PANTALLAS || {})[id];
  if (fn) { try { fn(); } catch (e) { console.warn('[pantalla ' + id + ']', e); } }
}

/* Todo lo que pasa al cambiar de pantalla, en orden: limpiar los controles que la pantalla
   anterior puso en la cabecera, aplicar la familia (título + pestañas), migas, la pantalla nueva. */
function alCambiarPantalla() {
  const extra = document.getElementById('pageExtra');
  if (extra) extra.innerHTML = '';
  if (typeof aplicarFamilia === 'function') aplicarFamilia();
  const v = document.querySelector('.view.on');
  if (v) document.body.dataset.vista = v.id;   // para estilos por pantalla (body[data-vista="ceo"] …)
  pintarMigas();
  pantallaActual();
  // "Links de agenda" es de quien agenda: va en Agendas y Setter, no en todas las pantallas
  const vista = document.querySelector('.view.on');
  const fam = vista && typeof familiaDe === 'function' ? familiaDe(vista.id) : null;
  const ag = document.getElementById('aglinks');
  if (ag) ag.style.display = (fam && (fam.id === 'agendas' || fam.id === 'setter')) ? '' : 'none';
}
addEventListener('hashchange', () => setTimeout(alCambiarPantalla, 0));
addEventListener('DOMContentLoaded', () => {
  setTimeout(alCambiarPantalla, 0);
  // la tarjeta de salud la pide boot() después del ingreso: desde acá salía sin sesión (401) y repetía el pedido
});
setTimeout(pintarMigas, 300);         // por si el router ya corrió antes de este archivo

/* ── notas de "cómo se calcula" ──
   Las notas largas al pie de las tablas (.tfoot) arrancan cerradas para que la pantalla quede
   limpia como la referencia; un clic las abre y otro las cierra. */
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.tfoot');
  if (t && !e.target.closest('a,button,input,select')) t.classList.toggle('abierto');
});

/* ── familias: el menú con la forma exacta de la referencia ─────────────────────────────────────
   En la referencia cada entrada del menú es UNA pantalla con pestañas adentro (Agendas = Métricas ·
   Llamadas · Análisis; Setter = Métricas · … · Setter IA; Orgánico = Resumen · Historias · …).
   El hub original tenía cada una de esas cosas como entrada suelta del menú. En vez de fusionar el código de
   pantallas que ya andan, se agrupan: el menú muestra una sola entrada por familia y arriba de
   la pantalla aparece la tira de pestañas. Cada pestaña sigue siendo la misma vista de siempre
   (mismo hash, mismo render), así que los links viejos y los favoritos siguen andando.
   Las pestañas se filtran por perfil: un setter no ve la pestaña de Closers. */
const FAMILIAS = [
  { id: 'utms',    titulo: "UTM's",    tabs: [['utms', "UTM's"], ['traza', 'Trazabilidad']] },
  { id: 'agendas', titulo: 'Llamadas', tabs: [['closers', 'Métricas'], ['central', 'Agendas'], ['analisis', 'Análisis'], ['pipeline', 'Pipeline'], ['llamadas', 'Llamadas'], ['precall', 'Pre-call']] },
];
function familiaDe(id) { return FAMILIAS.find(f => f.tabs.some(t => t[0] === id)) || null; }
function vistasPermitidas() {
  // vistasDe (hub.js): un rol que no figura ve solo las vistas comunes, nunca la lista de 'equipo'
  try { return vistasDe(perfilEfectivo()); } catch (e) { return null; }
}
/* El link del menú de cada familia apunta a la primera pestaña que ese perfil puede ver. Se llama
   desde aplicarPerfil ANTES de decidir qué se ve, porque la visibilidad sale del href. */
function familiasNav() {
  const ok = vistasPermitidas();
  document.querySelectorAll('#nav a[data-fam]').forEach(a => {
    const f = FAMILIAS.find(x => x.id === a.dataset.fam);
    if (!f) return;
    const primera = f.tabs.find(t => !ok || ok.includes(t[0]));
    a.setAttribute('href', '#' + (primera ? primera[0] : f.tabs[0][0]));
    if (!primera) a.dataset.sinPermiso = '1'; else delete a.dataset.sinPermiso;
  });
}
function aplicarFamilia() {
  const vista = document.querySelector('.view.on');
  const caja = document.getElementById('subtabs');
  if (!vista || !caja) return;
  const f = familiaDe(vista.id);
  if (!f) { caja.innerHTML = ''; caja.hidden = true; return; }
  const ok = vistasPermitidas();
  const tabs = f.tabs.filter(t => !ok || ok.includes(t[0]));
  const titulo = document.getElementById('viewtitle');
  if (titulo) titulo.textContent = f.titulo;
  const link = document.querySelector(`#nav a[data-fam="${f.id}"]`);
  if (link) {
    document.querySelectorAll('#nav a.active').forEach(a => { if (a !== link) a.classList.remove('active'); });
    link.classList.add('active');
  }
  caja.hidden = tabs.length < 2;
  caja.innerHTML = tabs.map(([id, nombre]) =>
    `<a class="subtab${id === vista.id ? ' on' : ''}" href="#${id}">${nombre}</a>`).join('');
}
/* route() lo llama también boot(); envolviéndolo, las familias se aplican en el primer pintado y
   en cada cambio de pantalla, sin tocar el router. */
if (typeof route === 'function') {
  const _routeOriginal = route;
  route = function () { _routeOriginal.apply(this, arguments); alCambiarPantalla(); };
}
