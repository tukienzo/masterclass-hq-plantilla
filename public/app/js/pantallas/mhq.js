/* Las pantallas propias de masterclass (Webinar, Registros, Landing, Integraciones y Equipo), enganchadas como pantallas
 * del hub original: window.PANTALLAS['<id>'] las pinta adentro de su <section> (ver base.js y shell.js). Todo va en una
 * IIFE para no chocar con los globales de la base (esc, api, flash…). El HTML se arma con html`` y cada valor se
 * escapa; lo único que entra sin escapar es lo que pasa por raw(). */
(function () {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
class Raw { constructor(s) { this.s = s; } }
const raw = (s) => new Raw(String(s));
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v === false || v == null ? '' : esc(v));
const html = (partes, ...vals) => raw(partes.reduce((o, p, i) => o + p + (i < vals.length ? val(vals[i]) : ''), ''));
const pintar = (nodo, h) => { nodo.innerHTML = h.s; };

const E = { inicio: null, wid: null, ficha: null, regs: null, creando: false, integ: null, opcInteg: {}, codigoPend: null };
const puedeEditar = () => ['equipo', 'cliente'].includes(E.inicio?.yo.rol);

const api = (accion, datos = {}) => apiApp(accion, datos);       // base.js: /api/app con la sesión
const toast = (msg, tipo = '') => flash(msg, tipo === 'mal');     // base.js: el aviso de abajo (#pstatus)
async function con(boton, fn) {
  if (boton) boton.disabled = true;
  try { return await fn(); } catch (e) { if (e.message !== 'sesion') toast(e.message, 'mal'); } finally { if (boton) boton.disabled = false; }
}
// los campos de un form → objeto; "popup.fecha" arma {popup: {fecha}}
function leer(form) {
  const o = {};
  for (const i of $$('[name]', form)) {
    const ks = i.name.split('.');
    let x = o;
    ks.slice(0, -1).forEach((k) => (x = x[k] ||= {}));
    x[ks.at(-1)] = i.type === 'checkbox' ? i.checked : i.value;
  }
  return o;
}

/* ── formatos ── */
const nf = (d) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d });
const num = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—' : nf(d).format(n));
// con es-AR el peso argentino sale como «$» a secas: ahí va el código (ARS 1.500), como en Ventas y Finanzas
const verMoneda = (m) => (new Intl.NumberFormat('es-AR', { style: 'currency', currency: m }).formatToParts(0)
  .some((p) => p.type === 'currency' && p.value === '$') ? 'code' : 'symbol');
const plata = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—'
  : new Intl.NumberFormat('es-AR', { style: 'currency', currency: E.inicio.cliente.moneda, currencyDisplay: verMoneda(E.inicio.cliente.moneda), maximumFractionDigits: d, minimumFractionDigits: d }).format(n));
// un porcentaje chico lleva un decimal (0,3%), como en el Inicio
const pctTxt = (x) => num(x, x !== 0 && Math.abs(x) < 10 && x % 1 ? 1 : 0) + '%';
const dia = (f) => new Date(f + 'T12:00:00Z');
const fCorta = (f) => (f ? new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(dia(f)) : '—');
const fLarga = (f) => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dia(f));
const hoyCliente = () => new Intl.DateTimeFormat('en-CA', { timeZone: E.inicio.cliente.zona }).format(new Date());
const fechaHora = (iso) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: E.inicio.cliente.zona }).format(new Date(iso));
const zonaCorta = () => E.inicio.cliente.zona.split('/').pop().replace(/_/g, ' ');
const faltan = (f) => Math.round((dia(f) - dia(hoyCliente())) / 864e5);

function aplicarAcento(c) {
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const s = document.documentElement.style;
  s.setProperty('--acento', c);
  s.setProperty('--acento-dim', `rgba(${r},${g},${b},.12)`);
  s.setProperty('--acento-ink', (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#0a0a0a' : '#ffffff');
}

/* ── piezas de formulario ── */
const campo = (name, titulo, valor = '', ph = '', clase = '', ayuda = '') => html`<label class="campo ${clase}"><span>${titulo}</span><input name="${name}" value="${valor ?? ''}" placeholder="${ph}">${ayuda ? html`<small class="ayuda">${ayuda}</small>` : ''}</label>`;
const area = (name, titulo, valor = '', ph = '', ayuda = '') => html`<label class="campo ancho"><span>${titulo}</span><textarea name="${name}" placeholder="${ph}">${valor ?? ''}</textarea>${ayuda ? html`<small class="ayuda">${ayuda}</small>` : ''}</label>`;
const opciones = (xs, actual) => xs.map(([v, t]) => html`<option value="${v}"${raw(v === actual ? ' selected' : '')}>${t}</option>`);
const kpi = (t, v, s = '', fuerte = false) => html`<div class="kpi${raw(fuerte ? ' fuerte' : '')}"><span>${t}</span><b>${v}</b>${s ? html`<small>${s}</small>` : ''}</div>`;
const barras = (filas) => {
  if (!filas.length) return html`<p class="vacio">Todavía no hay datos.</p>`;
  const max = Math.max(...filas.map((f) => f[1]));
  return html`<div class="barras">${filas.map(([t, n]) => html`<div class="barra"><span>${t}</span><i style="width:${Math.max(1, Math.round((100 * n) / max))}%"></i><span>${num(n)}</span></div>`)}</div>`;
};

/* ── enganche con la app (base.js + shell.js) ── */
const VISTAS = { webinar: vistaWebinar, registros: vistaRegistros, landing: vistaLanding, conexiones: vistaIntegraciones, equipo: vistaEquipo };
let actual = null, enCurso = '', tEnCurso = 0;
async function recargarInicio() {
  E.inicio = await api('inicio');
  window.MHQ = E.inicio;
  const ids = E.inicio.webinars.map((w) => w.id);
  if (!ids.includes(E.wid)) E.wid = E.inicio.webinarActivo || ids[0] || null;
  aplicarAcento(E.inicio.cliente.color);
  const logo = document.getElementById('logoCliente');
  if (logo) logo.textContent = E.inicio.cliente.nombre;
}
async function ir(v) {
  if (typeof YO !== 'undefined' && !YO) return;   // todavía no hay sesión: boot() la vuelve a llamar (sin el 401 de inicio)
  // shell.js llama a la pantalla dos veces por cambio (route envuelto + hashchange): la segunda se ignora
  if (enCurso === v && Date.now() - tEnCurso < 500) return;
  enCurso = v; tEnCurso = Date.now(); actual = v;
  const sec = document.getElementById(v);
  if (!sec) return;
  let main = sec.querySelector(':scope > .mhq');
  if (!main) { main = document.createElement('div'); main.className = 'mhq'; sec.replaceChildren(main); }
  pintar(main, html`<p class="vacio">Cargando…</p>`);
  try { if (!E.inicio) await recargarInicio(); await VISTAS[v](main); }
  catch (e) { if (e.message !== 'sesion') pintar(main, html`<p class="vacio">No se pudo cargar: ${e.message}</p>`); }
}
const recargar = () => { enCurso = ''; if (actual) ir(actual); };
for (const v of Object.keys(VISTAS)) window.PANTALLAS[v] = () => ir(v);
async function fichaActual() {
  if (E.ficha?.webinar.id !== E.wid) E.ficha = await api('webinar', { id: E.wid });
  return E.ficha;
}

function selectorWebinar() {
  return html`<select data-cambio="elegirWebinar" aria-label="Elegir webinar">
    ${E.inicio.webinars.map((w) => html`<option value="${w.id}"${raw(w.id === E.wid ? ' selected' : '')}>${fCorta(w.fecha)} · ${w.nombre}</option>`)}
    ${puedeEditar() ? html`<option value="__nuevo">＋ Nuevo webinar</option>` : ''}</select>`;
}
const sinWebinar = (main) => pintar(main, html`<p class="vacio">Todavía no hay un webinar. Crealo desde "Webinar".</p>`);

/* ── vista: webinar (datos, proyección y checklist) ── */
const PROY = [
  ['presupuesto', 'Presupuesto de ads'], ['registros', 'Registros objetivo'], ['pctCalificados', '% calificados'],
  ['pctAsistencia', '% que se conecta al vivo'], ['pctAgenda', '% de registros que agenda'], ['pctShow', '% show-up'],
  ['pctCierre', '% de cierre'], ['ticket', 'Ticket (cash por venta)'], ['roasObjetivo', 'ROAS objetivo'],
  ['llamadasPorCloser', 'Llamadas por closer por día'], ['diasLlamadas', 'Días de llamadas'],
];

function formNuevo() {
  return html`<form class="card" data-form="crearWebinar" style="max-width:680px"><h2>Nuevo webinar</h2><div class="campos">
    ${campo('nombre', 'Nombre interno', '', 'Ej.: Clase en vivo · noviembre', 'ancho')}
    <label class="campo"><span>Fecha del vivo</span><input type="date" name="fecha" required></label>
    <label class="campo"><span>Hora (${zonaCorta()})</span><input type="time" name="hora" value="${E.inicio.cliente.horaPorDefecto || '20:00'}"></label>
    <label class="campo"><span>Pop-up: fecha (opcional)</span><input type="date" name="popupFecha"></label>
    <label class="campo"><span>Pop-up: hora</span><input type="time" name="popupHora" value="${E.inicio.cliente.horaPorDefecto || '20:00'}"></label>
    </div><p class="ayuda">Se crea con la checklist del webinar (fases 0 a 7) y los vencimientos contados desde el vivo.</p>
    <div class="acciones"><button class="b pri">Crear webinar</button>${E.inicio.webinars.length ? html`<button type="button" class="b" data-acc="cancelarNuevo">Cancelar</button>` : ''}</div></form>`;
}

function cabeceraWebinar(w, activo) {
  const d = faltan(w.fecha);
  const cuando = d > 1 ? `faltan ${d} días` : d === 1 ? 'es mañana' : d === 0 ? 'es hoy' : `fue hace ${-d} días`;
  return html`<div class="cab"><div><h1>${w.nombre}</h1>
      <p>${fLarga(w.fecha)} · ${w.hora} h (${zonaCorta()}) · ${cuando}${w.popup ? ` · pop-up ${fCorta(w.popup.fecha)} ${w.popup.hora} h` : ''}</p></div>
    <div class="der">${activo ? html`<span class="chip ac">En la landing</span>` : puedeEditar() ? html`<button class="b" data-acc="activar">Usar en la landing</button>` : ''}${selectorWebinar()}</div></div>`;
}

function cardDatos(w, editar) {
  const o = E.inicio.opciones;
  return html`<form class="card" data-form="guardarDatos"><h2>Datos del webinar</h2>
    <fieldset${raw(editar ? '' : ' disabled')} style="border:0"><div class="campos">
      ${campo('nombre', 'Nombre interno', w.nombre, '', 'ancho')}
      <label class="campo"><span>Fecha del vivo</span><input type="date" name="fecha" value="${w.fecha}" required></label>
      <label class="campo"><span>Hora (${zonaCorta()})</span><input type="time" name="hora" value="${w.hora}"></label>
      <label class="campo"><span>Pop-up: fecha</span><input type="date" name="popup.fecha" value="${w.popup?.fecha || ''}"></label>
      <label class="campo"><span>Pop-up: hora</span><input type="time" name="popup.hora" value="${w.popup?.hora || ''}"></label>
      <label class="campo"><span>Formato</span><select name="formato">${opciones(o.formatos.map((x) => [x, x]), w.formato)}</select></label>
      <label class="campo"><span>Cierre</span><select name="cierre">${opciones(o.cierres.map((x) => [x, x]), w.cierre)}</select></label>
      <label class="campo"><span>Ventana de cierre (días)</span><input type="number" name="ventana" min="1" max="60" value="${w.ventana}"></label>
      ${campo('etiqueta', 'Etiqueta en ActiveCampaign', w.etiqueta)}
    </div></fieldset>
    <p class="ayuda">Si se mueve la fecha del vivo, los vencimientos de la checklist se corren con ella.</p>
    ${editar ? html`<div class="acciones"><button class="b pri">Guardar</button><button type="button" class="b peligro" data-acc="borrarWebinar">Borrar webinar</button></div>` : ''}
  </form>`;
}

function kpisProy(p) {
  const e = p.entrada;
  return html`<div class="kpis">
    ${kpi('Costo por registro', plata(p.cpl, 2))}
    ${kpi('CPL calificado', plata(p.cplCalificado, 2), p.calificados != null ? `${num(p.calificados)} calificados` : 'falta el % calificados')}
    ${kpi('Asistentes al vivo', num(p.asistentes))}
    ${kpi('Agendas', num(p.agendas), p.costoAgenda != null ? `${plata(p.costoAgenda, 2)} por agenda` : '')}
    ${kpi('Llamadas presentadas', num(p.llamadas))}
    ${kpi('Ventas', num(p.ventas))}
    ${kpi('Cash', plata(p.cash), p.roas != null ? `ROAS x${num(p.roas, 1)}` : 'falta el ticket')}
    ${kpi('Cash objetivo', plata(p.cashObjetivo), p.ventasParaObjetivo != null ? `${num(p.ventasParaObjetivo)} ventas para llegar` : '')}
    ${kpi('Closers necesarios', num(p.closers), p.agendas != null ? `${num(p.agendas)} agendas ÷ (${e.llamadasPorCloser} llamadas × ${e.diasLlamadas} días)` : '', true)}
  </div>`;
}

function cardProyeccion(w, p, editar) {
  const vara = E.inicio.opciones.vara;
  return html`<form class="card" data-form="guardarProy"><h2>Proyección <small>la cuenta al revés</small></h2>
    <fieldset${raw(editar ? '' : ' disabled')} style="border:0"><div class="campos">
      ${PROY.map(([k, t]) => html`<label class="campo"><span>${t}</span><input name="${k}" inputmode="decimal" data-proy value="${w.proyeccion?.[k] ?? ''}" placeholder="${vara[k] != null ? `${vara[k]} (referencia)` : ''}"></label>`)}
    </div></fieldset>
    <div id="kpisProy" style="margin-top:14px">${kpisProy(p)}</div>
    ${editar ? html`<div class="acciones"><button class="b pri">Guardar proyección</button><span class="ayuda">Vacío = el valor de referencia de la configuración. El % de cierre es un supuesto.</span></div>` : ''}
  </form>`;
}

function cardChecklist(w, pr, editar) {
  const hoy = hoyCliente();
  const bloques = [];
  for (const t of w.tareas) {
    let b = bloques.find((x) => x.n === t.bloque);
    if (!b) bloques.push((b = { n: t.bloque, ts: [] }));
    b.ts.push(t);
  }
  bloques.forEach((b) => b.ts.sort((a, c) => a.vence.localeCompare(c.vence)));
  return html`<section class="card" id="cardChk"><h2>Checklist del webinar <small>${pr.hechas}/${pr.total} hechas${pr.vencidas ? ` · ${pr.vencidas} vencidas` : ''}</small></h2>
    <div class="prog"><i style="width:${pr.pct || 0}%"></i></div>
    ${bloques.map((b) => html`<div class="bloque-t"><b><span>${b.n}</span><span>${b.ts.filter((t) => t.hecha).length}/${b.ts.length}</span></b>
      ${b.ts.map((t) => html`<div class="tarea${raw(t.hecha ? ' hecha' : !t.hecha && t.vence < hoy ? ' vencida' : '')}">
        <label><input type="checkbox" data-cambio="tarea" data-id="${t.id}"${raw(t.hecha ? ' checked' : '')}${raw(editar ? '' : ' disabled')}><span>${t.texto}</span></label>
        <small>${fCorta(t.vence)}</small>
        ${editar ? html`<button type="button" data-acc="borrarTarea" data-id="${t.id}" aria-label="Sacar la tarea">×</button>` : html`<span></span>`}
      </div>`)}</div>`)}
    ${editar ? html`<form class="nueva" data-form="nuevaTarea"><input name="texto" placeholder="Nueva tarea…" required aria-label="Nueva tarea">
      <select name="bloque" aria-label="Fase">${[...new Set(w.tareas.map((t) => t.bloque))].map((b) => html`<option>${b}</option>`)}</select>
      <input type="date" name="vence" value="${w.fecha}" aria-label="Vence"><button class="b">Agregar</button></form>` : ''}
  </section>`;
}

async function vistaWebinar(main) {
  if (E.creando || !E.inicio.webinars.length) {
    pintar(main, html`<div class="cab"><div><h1>${E.inicio.webinars.length ? 'Nuevo webinar' : 'El primer webinar'}</h1>
      <p>Con la fecha del vivo se arma sola la checklist del webinar.</p></div></div>
      ${puedeEditar() ? formNuevo() : html`<p class="vacio">Todavía no hay webinars.</p>`}`);
    return;
  }
  const { webinar: w, proyeccion: p, progreso: pr, activo } = await fichaActual();
  const editar = puedeEditar();
  pintar(main, html`${cabeceraWebinar(w, activo)}
    ${E.inicio.metaPrueba ? html`<p class="alerta">Meta está en modo prueba (hay un código de prueba cargado): los registros no cuentan para las campañas. Se saca en Integraciones → Meta antes de prender los ads.</p>` : ''}
    <div class="grid dos">${cardDatos(w, editar)}${cardProyeccion(w, p, editar)}</div>
    <div class="grid" style="margin-top:14px">${cardChecklist(w, pr, editar)}</div>`);
}

let tProy;
function proyectarEnVivo() {
  clearTimeout(tProy);
  tProy = setTimeout(async () => {
    const f = $('[data-form=guardarProy]');
    if (!f) return;
    try { pintar($('#kpisProy'), kpisProy((await api('proyectar', { proyeccion: leer(f) })).proyeccion)); } catch { /* el próximo tecleo lo reintenta */ }
  }, 300);
}

/* ── vista: registros ── */
const envio = (x) => (!x ? html`<span class="chip" title="Todavía no salió, o no está conectado">—</span>` : x.ok ? html`<span class="chip ok">✓</span>` : html`<span class="chip" title="${x.error}">✗</span>`);

function tablaRegistros(q = '', n = 100) {
  const t = q.toLowerCase();
  const filas = E.regs.filas.filter((f) => !t || `${f.nombre} ${f.email} ${f.whatsapp}`.toLowerCase().includes(t));
  if (!filas.length) return html`<p class="vacio">${q ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay registros.'}</p>`;
  return html`<div class="tabla-w"><table><thead><tr><th>Cuándo</th><th>Nombre</th><th>Email</th><th>WhatsApp</th><th>Fuente</th><th>Calificado</th><th>AC</th><th>Meta</th></tr></thead><tbody>
    ${filas.slice(0, n).map((f) => html`<tr><td>${fechaHora(f.creado)}</td><td>${f.nombre}</td><td>${f.email}</td>
      <td><a href="https://wa.me/${f.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">${f.whatsapp}</a></td>
      <td>${[f.utm?.utm_source, f.utm?.utm_campaign].filter(Boolean).join(' · ') || '—'}</td>
      <td>${f.calificado === true ? 'Sí' : f.calificado === false ? 'No' : '—'}</td><td>${envio(f.ac)}</td><td>${envio(f.meta)}</td></tr>`)}
    </tbody></table></div>
    ${filas.length > n ? html`<div class="acciones"><button type="button" class="b" data-acc="masRegistros" data-n="${n + 300}">Mostrar más (${num(filas.length - n)})</button></div>` : ''}`;
}

async function vistaRegistros(main) {
  if (!E.wid) return sinWebinar(main);
  const [r, f] = await Promise.all([api('registros', { id: E.wid }), fichaActual()]);
  E.regs = r;
  const obj = f.webinar.proyeccion?.registros;
  pintar(main, html`<div class="cab"><div><p>${f.webinar.nombre} · ${fLarga(f.webinar.fecha)}</p></div><div class="der">
      <button class="b" data-acc="recargar">Actualizar</button>${selectorWebinar()}</div></div>
    <div class="kpis">
      ${kpi('Registros', num(r.total), obj ? `${pctTxt((100 * r.total) / obj)} del objetivo (${num(obj)})` : 'sin objetivo en la proyección', true)}
      ${kpi('Hoy', num(r.porDia[hoyCliente()] || 0))}
      ${kpi('Calificados', num(r.calificados), r.respondieron ? `${Math.round((100 * r.calificados) / r.respondieron)}% de los que respondieron` : 'nadie respondió todavía')}
      ${kpi('ActiveCampaign', num(r.envios.ac.ok), r.envios.ac.mal ? `${num(r.envios.ac.mal)} con error (se reintentan)` : 'sin errores')}
      ${kpi('Meta (API)', num(r.envios.meta.ok), r.envios.meta.mal ? `${num(r.envios.meta.mal)} con error (se reintentan)` : 'sin errores')}
    </div>
    <div class="grid dos" style="margin-top:14px">
      <section class="card"><h2>Por día</h2>${barras(Object.entries(r.porDia).sort().slice(-21).map(([d, n]) => [fCorta(d), n]))}</section>
      <section class="card"><h2>Por fuente <small>utm_source</small></h2>${barras(Object.entries(r.porFuente).sort((a, b) => b[1] - a[1]).slice(0, 12))}</section>
    </div>
    <section class="card" style="margin-top:14px"><h2>Personas <small>${num(r.total)}</small></h2>
      <input type="search" data-buscar placeholder="Buscar por nombre, mail o WhatsApp" aria-label="Buscar registros">
      <div id="tablaRegs">${tablaRegistros()}</div></section>`);
}

/* ── vista: landing ── */
async function vistaLanding(main) {
  if (!E.wid) return sinWebinar(main);
  const { webinar: w, activo } = await fichaActual();
  const L = w.landing || {};
  const lineas = (xs) => (xs || []).join('\n');
  const pares = (xs) => (xs || []).map((p) => (p.texto ? `${p.titulo} | ${p.texto}` : p.titulo)).join('\n');
  const pregs = [...(L.preguntas || [])];
  while (pregs.length < 3) pregs.push({ texto: '', opciones: [], calificadas: [] });
  pintar(main, html`<div class="cab"><div><p>${activo ? 'Este webinar es el que muestra la landing.' : 'Ojo: la landing está mostrando otro webinar.'} Los cambios aparecen en menos de un minuto.</p></div>
    <div class="der"><a class="b" href="/" target="_blank" rel="noopener">Ver landing</a><a class="b" href="/gracias" target="_blank" rel="noopener">Ver gracias</a>${selectorWebinar()}</div></div>
  <form data-form="guardarLanding">
  <div class="grid dos">
    <section class="card"><h2>Arriba de todo</h2><div class="campos">
      ${campo('eyebrow', 'Etiqueta', L.eyebrow, 'Clase gratuita en vivo')}
      ${campo('cta', 'Texto de los botones', L.cta, 'Reservar mi lugar gratis')}
      ${area('titulo', 'Titular', L.titulo, '', 'Lo que va entre *asteriscos* sale en el color de la marca.')}
      ${area('subtitulo', 'Bajada', L.subtitulo)}
      ${campo('microcopy', 'Debajo del botón', L.microcopy, 'El acceso al directo te llega por WhatsApp.', 'ancho')}
    </div></section>
    <section class="card"><h2>Lo que van a ver</h2><div class="campos">
      ${campo('piezasTitulo', 'Título de la sección', L.piezasTitulo, 'Lo que vas a ver en la clase', 'ancho')}
      ${area('piezas', 'Piezas (hasta 4)', pares(L.piezas), 'Tema 1 | Qué se lleva la persona de esta parte', 'Una por línea: título | texto.')}
      ${campo('regalo.titulo', 'Regalo solo en vivo: título', L.regalo?.titulo, '', 'ancho')}
      ${area('regalo.texto', 'Regalo: texto', L.regalo?.texto)}
    </div></section>
    <section class="card"><h2>Para quién</h2><div class="campos">
      ${area('paraQuien', 'Le sirve a quien…', lineas(L.paraQuien), '', 'Uno por línea.')}
      ${area('noParaQuien', 'No le sirve a quien…', lineas(L.noParaQuien), '', 'Uno por línea.')}
    </div></section>
    <section class="card"><h2>Quién da la clase</h2><div class="campos">
      ${campo('presentador.nombre', 'Nombre', L.presentador?.nombre)}
      ${campo('presentador.foto', 'Foto (link https)', L.presentador?.foto, 'https://…')}
      ${area('presentador.bio', 'Historia', L.presentador?.bio)}
      ${area('presentador.numeros', 'Números (hasta 4)', lineas(L.presentador?.numeros), '+10 años enseñando', 'Uno por línea. Solo números reales y comprobables.')}
    </div></section>
    <section class="card"><h2>Preguntas frecuentes y cierre</h2><div class="campos">
      ${area('faq', 'Preguntas (hasta 8)', pares(L.faq), '¿Necesito experiencia previa? | No…', 'Una por línea: pregunta | respuesta. "¿A qué hora es en mi país?" se agrega sola.')}
      ${campo('cierre', 'Título del cierre', L.cierre, 'Una clase. En vivo. Una sola vez.', 'ancho')}
      ${area('disclaimer', 'Aviso legal de resultados', L.disclaimer, 'Los resultados dependen del trabajo de cada persona…')}
    </div></section>
    <section class="card"><h2>Página de gracias</h2><div class="campos">
      ${campo('whatsapp', 'Link del grupo de WhatsApp', L.whatsapp, 'https://chat.whatsapp.com/…', 'ancho', 'Cuando un grupo se llena (1024), se cambia acá por el siguiente.')}
      ${campo('video', 'Video (YouTube, Vimeo, Wistia, Loom o .mp4)', L.video, 'https://…', 'ancho')}
      ${campo('pasoMail', 'Paso del mail (opcional)', L.pasoMail, 'Respondé «confirmo» al mail que te mandamos', 'ancho')}
    </div></section>
  </div>
  <section class="card" style="margin-top:14px"><h2>Preguntas de calificación <small>paso 2 del form, un toque cada una</small></h2>
    <div class="grid dos">${pregs.map((p, i) => html`<div class="campos">
      ${campo(`p${i}.texto`, `Pregunta ${i + 1}`, p.texto, i === 0 ? '¿Cuánto podés invertir en tu formación?' : '', 'ancho')}
      ${area(`p${i}.opciones`, 'Opciones', p.opciones.map((o) => (p.calificadas.includes(o) ? '* ' : '') + o).join('\n'), i === 0 ? 'Nada por ahora\nMenos de 500\n* 500 a 1.000\n* Más de 1.000' : '', 'Una por línea. Con * adelante, la opción califica.')}
    </div>`)}</div>
    <p class="ayuda">Calificado = en cada pregunta con opciones marcadas eligió una marcada. A esos se les manda a Meta un evento aparte (CompleteRegistration) para optimizar los ads.</p>
    <div class="acciones"><button class="b pri">Guardar landing</button></div>
  </section></form>`);
}

/* ── vista: integraciones ── */
// cada servicio: para qué sirve, dónde se saca la clave (con el link directo) y cómo se llama el campo
const INTEG = [
  { k: 'meta', nombre: 'Meta', ico: 'megafono', para: 'El gasto de los anuncios (CPL y CPL calificado) y los registros que optimizan las campañas.', campo: 'Token del usuario del sistema',
    link: ['Abrir usuarios del sistema', 'https://business.facebook.com/settings/system-users'],
    pasos: ['En Configuración del negocio → Usuarios del sistema, creá uno con rol Administrador.', 'Asignale la cuenta publicitaria y el píxel (conjunto de datos).', 'Tocá "Generar token", marcá ads_read y copialo. Si te pide una app, elegí la del negocio.'] },
  { k: 'calendly', nombre: 'Calendly', ico: 'calendario', para: 'Trae solas las llamadas agendadas, cada 15 minutos.', campo: 'Token personal de acceso',
    link: ['Abrir la API de Calendly', 'https://calendly.com/integrations/api_webhooks'],
    pasos: ['Entrá con la cuenta de un admin de la organización: así ve las agendas de todos los closers.', 'Integraciones → API y webhooks → "Generar token".', 'Copialo y pegalo acá abajo.'] },
  { k: 'iclosed', nombre: 'iClosed', ico: 'telefono', para: 'Trae solas las llamadas agendadas, cada 15 minutos.', campo: 'API key',
    link: ['Abrir iClosed', 'https://app.iclosed.io'],
    pasos: ['Entrá con la cuenta admin.', 'Settings → Developer → API Keys → creá una (se muestra una sola vez).', 'Copiala y pegala acá abajo.'] },
  { k: 'fathom', nombre: 'Fathom', ico: 'video', para: 'Las grabaciones de las llamadas de venta de los closers.', campo: 'API key',
    link: ['Abrir Fathom', 'https://fathom.video'],
    pasos: ['Entrá con la cuenta de un admin del equipo de ventas: la clave ve lo que graba ese equipo.', 'Settings → API Access → generá una key.', 'Pegala acá abajo y elegí el equipo de los closers.'] },
  { k: 'ia', nombre: 'IA (Claude)', ico: 'destellos', para: 'Arma los perfiles del ICP con los registros y las llamadas.', campo: 'API key de Anthropic',
    link: ['Abrir la consola de Anthropic', 'https://console.anthropic.com/settings/keys'],
    pasos: ['En la consola de Anthropic → API Keys → "Create Key".', 'Ponele un nombre que la identifique y copiala.', 'Pegala acá abajo. Solo se usa cuando alguien pide el ICP con IA.'] },
  { k: 'ac', nombre: 'ActiveCampaign', ico: 'enviar', para: 'Cada registro entra a la lista con la etiqueta del webinar y arranca la secuencia de mails.', campo: 'API key',
    link: null,
    pasos: ['En ActiveCampaign → Configuración → Desarrollador.', 'Copiá la URL de la API y la key.', 'Pegalas acá abajo y elegí la lista.'] },
];
const ESTADO_INTEG = { ok: ['Conectada', 'verde'], incompleta: ['Falta un paso', 'ambar'], error: ['Con error', 'rojo'], sin: ['Sin conectar', 'gris'] };
const lineaInteg = (s) => (s.estado === 'error' ? s.error : s.estado === 'incompleta' && s.falta.length ? `Falta elegir ${s.falta.join(' y ')}` : s.detalle);
const estadoInteg = (s) => { const [t, c] = ESTADO_INTEG[s.estado], l = lineaInteg(s); return html`<div class="integ-est">${raw(uiEstado(t, c))}${l ? html`<small title="${l}">${l}</small>` : ''}</div>`; };

function tarjetaInteg(d) {
  const s = E.integ[d.k];
  return html`<section class="ui-card con-h integ">
    <header class="ui-card-h"><span class="ui-card-ico c-gold">${raw(uiIco(d.ico, 18))}</span><div class="ui-card-t"><b>${d.nombre}</b><span>${d.para}</span></div></header>
    <div class="ui-card-b">${estadoInteg(s)}<button type="button" class="btn${raw(s.estado === 'sin' ? ' primary' : '')}" data-acc="abrirInteg" data-k="${d.k}">${s.estado === 'sin' ? 'Conectar' : 'Configurar'}</button></div>
  </section>`;
}
function pintarIntegraciones(main) {
  const n = INTEG.filter((d) => E.integ[d.k].estado === 'ok').length;
  pintar(main, html`<p class="intro">${n} de ${INTEG.length} conectadas. Cada una se conecta una sola vez: pegás la clave, se prueba sola y elegís de una lista. Las claves quedan en el servidor; acá solo se ven sus últimos 4 caracteres.</p>
    ${E.integ.meta.testCode ? html`<p class="alerta">Meta está en modo prueba: mientras el código de prueba esté cargado, los registros no cuentan para las campañas. Se saca en Meta → "Salir del modo prueba".</p>` : ''}
    <div class="integs">${INTEG.map(tarjetaInteg)}</div>`);
}
async function vistaIntegraciones(main) {
  E.integ = await api('integraciones');
  pintarIntegraciones(main);
}
const refrescarTarjetas = () => { const m = $('#conexiones > .mhq'); if (m && E.integ) pintarIntegraciones(m); E.inicio.metaPrueba = !!E.integ.meta.testCode; };

// el modal de una integración: los pasos, la clave, lo que hay para elegir y cómo salió la última prueba
function modalInteg(k, res = null) {
  const d = INTEG.find((x) => x.k === k), s = E.integ[k], o = E.opcInteg[k] || {};
  const lista = (name, titulo, xs, actual) => (xs && xs.length > 1 ? html`<label class="ui-campo"><span>${titulo}</span><select name="${name}">
    <option value="">Elegí…</option>${xs.map((x) => html`<option value="${x.id}"${raw(x.id === actual ? ' selected' : '')}>${x.nombre}</option>`)}</select></label>` : '');
  const elegir = k === 'meta' ? html`${lista('cuenta', 'Cuenta publicitaria', (o.cuentas || []).map((c) => ({ id: c.id, nombre: `${c.nombre}${c.moneda ? ` · ${c.moneda}` : ''}` })), s.cuenta)}${lista('pixel', 'Píxel', o.pixeles, s.pixel)}`
    : k === 'fathom' ? lista('equipo', 'Equipo de los closers', (o.equipos || []).map((n) => ({ id: n, nombre: n })), s.equipo)
    : k === 'ac' ? lista('lista', 'Lista de los registros', o.listas, s.lista) : '';
  const cuerpo = html`<div class="mhq-m integ-modal">
    ${estadoInteg(s)}
    <ol class="pasos">${d.pasos.map((x) => html`<li>${x}</li>`)}</ol>
    ${d.link ? html`<a class="btn chico" href="${d.link[1]}" target="_blank" rel="noopener">${raw(uiIco('externo', 14))}${d.link[0]}</a>` : ''}
    <form data-form="conectar" data-k="${k}">
      ${k === 'ac' ? html`<label class="ui-campo"><span>URL de la API</span><input name="url" value="${s.url}" placeholder="https://tucuenta.api-us1.com" autocomplete="off"></label>` : ''}
      <label class="ui-campo"><span>${d.campo}</span><input name="clave" type="password" autocomplete="off" placeholder="${s.clave ? `${s.clave} · pegá otra para cambiarla` : 'Pegala acá'}"></label>
      ${elegir}
      <div class="acciones"><button class="btn primary">${s.estado === 'sin' ? 'Conectar' : 'Guardar y probar'}</button>
        ${s.estado !== 'sin' ? html`<button type="button" class="btn" data-acc="desconectar" data-k="${k}">Desconectar</button>` : ''}</div>
      <p class="estado${raw(res ? (res.ok ? ' ok' : ' mal') : '')}" id="integEstado" role="status">${res ? (res.ok ? `✓ ${res.detalle}` : `✗ ${res.error}`) : ''}</p>
    </form>
    ${k === 'meta' && s.pixel ? html`<details class="integ-prueba"${raw(s.testCode ? ' open' : '')}><summary>Probar el píxel (opcional)</summary>
      <p class="ayuda">Pegá el código de "Eventos de prueba" (Administrador de eventos → el píxel → Eventos de prueba) y mandá un registro de prueba. Mientras el código esté cargado, los registros reales no cuentan para las campañas.</p>
      <div class="fila"><input id="integTest" value="${s.testCode}" placeholder="TEST12345" aria-label="Código de prueba"><button type="button" class="btn" data-acc="eventoPrueba">Mandar evento de prueba</button>
        ${s.testCode ? html`<button type="button" class="btn" data-acc="salirPrueba">Salir del modo prueba</button>` : ''}</div></details>` : ''}
  </div>`;
  uiModalAbrir({ titulo: d.nombre, sub: d.para, ancho: '560px', cuerpo: cuerpo.s });
}
// después de cada cambio: el estado de nuevo, el modal con el resultado y las tarjetas de atrás al día
async function trasCambio(k, res) {
  E.integ = await api('integraciones');
  modalInteg(k, res);
  refrescarTarjetas();
}

/* ── vista: equipo ── */
async function vistaEquipo(main) {
  const { personas } = await api('personas');
  const { yo, opciones: o } = E.inicio;
  const puedoTocar = (p) => yo.rol === 'equipo' || p.rol !== 'equipo';
  const roles = (yo.rol === 'equipo' ? ['equipo', 'cliente', 'closer'] : ['cliente', 'closer']).map((r) => [r, o.roles[r]]);
  pintar(main, html`<p class="intro">Cada persona entra en <b>${location.host}/app</b> con su código. El código se ve una sola vez: si alguien lo pierde, le generás otro y el viejo deja de andar.</p>
  <div class="grid dos">
    <section class="card"><h2>Personas <small>${personas.filter((p) => p.activo).length} con acceso</small></h2><div class="tabla-w"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
      ${personas.map((p) => html`<tr><td>${p.nombre}${p.uid === yo.uid ? ' (vos)' : ''}</td><td>${o.roles[p.rol]}</td><td>${p.activo ? 'Activa' : 'De baja'}</td>
        <td class="num">${puedoTocar(p) ? html`<button class="b chico" data-acc="nuevoCodigo" data-uid="${p.uid}" data-nombre="${p.nombre}"${raw(p.uid === yo.uid ? ' data-propio="1"' : '')}>${p.activo ? 'Código nuevo' : 'Reactivar'}</button>
          ${p.activo && p.uid !== yo.uid ? html` <button class="b chico peligro" data-acc="baja" data-uid="${p.uid}" data-nombre="${p.nombre}">Dar de baja</button>` : ''}` : ''}</td></tr>`)}
    </tbody></table></div></section>
    <form class="card" data-form="nuevaPersona"><h2>Dar acceso</h2><div class="campos">
      ${campo('nombre', 'Nombre', '', 'Nombre y apellido')}
      <label class="campo"><span>Rol</span><select name="rol">${opciones(roles, 'closer')}</select></label>
    </div>
    <p class="ayuda">Equipo y Cliente ven todo. Closer ve Llamadas, Ventas y la ficha del webinar. El nombre de un closer tiene que ser igual al que tiene en iClosed o Calendly.</p>
    <div class="acciones"><button class="b pri">Crear y ver su código</button></div>
    <div id="codigoNuevo"></div></form>
  </div>`);
  if (E.codigoPend) { mostrarCodigo(E.codigoPend.nombre, E.codigoPend.codigo); E.codigoPend = null; }
}
function mostrarCodigo(nombre, codigo) {
  const msg = `Hola ${nombre.split(' ')[0]}, entrá a ${location.origin}/app y poné este código: ${codigo}`;
  pintar($('#codigoNuevo'), html`<div class="codigo-nuevo"><span>Código de ${nombre}</span><b>${codigo}</b>
    <p class="ayuda">Se muestra una sola vez: mandáselo por privado.</p>
    <div class="acciones"><button type="button" class="b pri" data-acc="copiarTexto" data-texto="${msg}">Copiar mensaje para WhatsApp</button>
      <button type="button" class="b" data-acc="copiarTexto" data-texto="${codigo}">Copiar solo el código</button></div></div>`);
  $('#codigoNuevo').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ── acciones (delegadas) ── */
const ACC = {
  recargar: () => recargar(),
  cancelarNuevo: () => { E.creando = false; recargar(); },
  activar: (b) => con(b, async () => { await api('activar', { id: E.wid }); E.ficha = null; await recargarInicio(); toast('Listo: la landing muestra este webinar', 'ok'); recargar(); }),
  borrarWebinar: (b) => {
    if (!confirm('¿Borrar este webinar y su checklist? No se puede deshacer.')) return;
    con(b, async () => { await api('borrarWebinar', { id: E.wid }); E.wid = null; E.ficha = null; await recargarInicio(); toast('Webinar borrado', 'ok'); recargar(); });
  },
  borrarTarea: (b) => con(b, async () => { await cambiarTareas({ borrar: b.dataset.id }); }),
  masRegistros: (b) => pintar($('#tablaRegs'), tablaRegistros($('[data-buscar]').value, Number(b.dataset.n))),
  abrirInteg: (b) => modalInteg(b.dataset.k),
  desconectar: (b) => {
    const d = INTEG.find((x) => x.k === b.dataset.k);
    if (!confirm(`¿Desconectar ${d.nombre}? Se borra la clave guardada y deja de traer datos.`)) return;
    con(b, async () => { const r = await api('desconectar', { cual: d.k }); delete E.opcInteg[d.k]; await trasCambio(d.k, { ok: true, detalle: r.detalle || 'Desconectada' }); });
  },
  eventoPrueba: (b) => con(b, async () => {
    let res;
    try { res = { ok: true, detalle: (await api('probar', { testCode: $('#integTest').value })).detalle }; } catch (err) { res = { ok: false, error: err.message }; }
    await trasCambio('meta', res);
  }),
  salirPrueba: (b) => con(b, async () => { const r = await api('probar', { salir: true }); await trasCambio('meta', { ok: true, detalle: r.detalle }); }),
  nuevoCodigo: (b) => {
    const propio = b.dataset.propio === '1', nombre = b.dataset.nombre;
    if (!confirm(propio ? 'Te genero un código nuevo: el que tenés deja de andar y se cierran tus sesiones en otros dispositivos. ¿Seguimos?'
      : `¿Generar un código nuevo para ${nombre}? El que tiene deja de andar.`)) return;
    con(b, async () => {
      const r = await api('persona', { codigo: b.dataset.uid });
      if (propio) await apiAcceso('entrar', { clave: r.clave });   // este navegador sigue adentro con el código nuevo
      E.codigoPend = { nombre, codigo: r.clave };
      recargar();
    });
  },
  baja: (b) => {
    if (!confirm(`¿Dar de baja a ${b.dataset.nombre}? Su código deja de andar.`)) return;
    con(b, async () => { await api('persona', { baja: b.dataset.uid }); toast('Dada de baja', 'ok'); recargar(); });
  },
  copiarTexto: (b) => navigator.clipboard.writeText(b.dataset.texto).then(() => toast('Copiado', 'ok'), () => toast('No se pudo copiar: copialo a mano', 'mal')),
};

async function cambiarTareas(cambio) {
  const r = await api('tarea', { id: E.wid, ...cambio });
  E.ficha.webinar.tareas = r.tareas;
  E.ficha.progreso = r.progreso;
  $('#cardChk').outerHTML = cardChecklist(E.ficha.webinar, r.progreso, puedeEditar()).s;
}

const FORMS = {
  async crearWebinar(f) {
    const d = leer(f);
    const r = await api('guardarWebinar', { webinar: { nombre: d.nombre, fecha: d.fecha, hora: d.hora, popup: d.popupFecha ? { fecha: d.popupFecha, hora: d.popupHora } : null } });
    E.creando = false;
    E.wid = r.webinar.id;
    E.ficha = r;
    await recargarInicio();
    toast('Webinar creado con la checklist del webinar', 'ok');
    location.hash = '#webinar';
    recargar();
  },
  async guardarDatos(f) {
    const d = leer(f);
    d.popup = d.popup?.fecha ? d.popup : null;
    E.ficha = await api('guardarWebinar', { webinar: { id: E.wid, ...d } });
    await recargarInicio();
    toast('Guardado', 'ok');
    recargar();
  },
  async guardarProy(f) {
    E.ficha = await api('guardarWebinar', { webinar: { id: E.wid, proyeccion: leer(f) } });
    toast('Proyección guardada', 'ok');
  },
  async nuevaTarea(f) {
    const d = leer(f);
    await cambiarTareas({ nueva: d });
  },
  async guardarLanding(f) {
    const { p0, p1, p2, ...L } = leer(f);
    L.preguntas = [p0, p1, p2].filter((p) => p?.texto?.trim());
    E.ficha = await api('guardarWebinar', { webinar: { id: E.wid, landing: L } });
    toast('Landing guardada: se ve en menos de un minuto', 'ok');
    recargar();
  },
  // prueba y guarda; el resultado (bien o mal) queda escrito en el modal, no en un aviso que se va
  async conectar(f) {
    const k = f.dataset.k, e = $('#integEstado');
    e.className = 'estado';
    e.textContent = 'Probando…';
    let res;
    try {
      const r = await api('conectar', { cual: k, ...leer(f) });
      if (r.opciones) E.opcInteg[k] = r.opciones;
      res = { ok: true, detalle: r.detalle };
    } catch (err) {
      if (err.message === 'sesion') return;
      res = { ok: false, error: err.message };
    }
    await trasCambio(k, res);
  },
  async nuevaPersona(f) {
    const r = await api('persona', { crear: leer(f) });
    E.codigoPend = { nombre: r.persona.nombre, codigo: r.clave };
    recargar();
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('.mhq [data-acc], .mhq-m [data-acc]');
  if (b && ACC[b.dataset.acc]) { e.preventDefault(); ACC[b.dataset.acc](b, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('.mhq [data-form], .mhq-m [data-form]');
  if (!f || !FORMS[f.dataset.form]) return;
  e.preventDefault();
  con(e.submitter || $('button:not([type=button])', f), () => FORMS[f.dataset.form](f));
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.closest('.mhq')) return;
  if (t.dataset.cambio === 'tarea') con(null, () => cambiarTareas({ tarea: t.dataset.id, hecha: t.checked }).catch((e) => { t.checked = !t.checked; throw e; }));
  if (t.dataset.cambio === 'elegirWebinar') {
    if (t.value === '__nuevo') { E.creando = true; location.hash = '#webinar'; recargar(); return; }
    E.wid = t.value;
    E.ficha = null;
    recargar();
  }
});
document.addEventListener('input', (e) => {
  if (!e.target.closest('.mhq')) return;
  if (e.target.matches('[data-proy]')) proyectarEnVivo();
  if (e.target.matches('[data-buscar]')) pintar($('#tablaRegs'), tablaRegistros(e.target.value));
});


})();
