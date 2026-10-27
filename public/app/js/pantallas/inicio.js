/* Inicio — portado del Inicio del hub original (inicio.js, el Tablero de inicio-tablero.js y
 * la pantalla "Hoy" de hub.js), solo para masterclass.
 *
 * Arriba: el saludo como título y el webinar (en el hub original va la barra de período; acá el período es el webinar).
 * Debajo, como el Inicio de la referencia de diseño:
 *  - Salud del webinar: las cinco áreas con semáforo (Registros · Anuncios · Agendas · Closing · Cash), cada una contra
 *    lo que proyectó el webinar y contra el ritmo (lo que ya debería haber a hoy).
 *  - Hoy: lo que se está cayendo hoy y alguien tiene que agarrar (el "Hoy" del hub original): llamadas sin closer, sin confirmar,
 *    no-shows sin re-agendar y ventas cerradas sin monto.
 *  - Proyección contra lo real: cada número de la proyección del webinar al lado del real.
 *  - Tablero: los KPIs fijados con la chincheta en KPIs (kpis.js → kpiFijadosHtml).
 *
 * Este archivo trae además el núcleo que comparten Inicio, Funnel y KPIs (window.TAB): de qué webinar es cada agenda,
 * las cuentas sobre las agendas, el embudo y la carga de /api/tablero, la asistencia (a mano) y el gasto de Meta.
 * Sin Instagram ni el CRM del hub original: Contenido no existe acá y el cash sale del Monto de las agendas Cerradas.
 */
(function () {
  'use strict';

  /* ════════════════════════ núcleo (window.TAB) ════════════════════════ */
  const CAIDAS = ['Cancelada', 'No-show', 'Descalificada'];
  const asistio = (r) => r.Estado === 'Presentada' || r.Estado === 'Cerrada';
  const fechaCall = (r) => String(r['Fecha call'] || '').slice(0, 10);
  const horaCall = (r) => {
    const m = String(r['Fecha call'] || '').slice(11).match(/^(\d{1,2}):(\d{2})/) || String(r.Hora || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
  };
  const monto = (r) => parseFloat(r.Monto) || 0;
  // la llamada es hoy o más adelante y nadie la canceló: todavía no es caída
  const porVenir = (r, h) => !asistio(r) && !CAIDAS.includes(r.Estado) && fechaCall(r) >= h;
  const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const difDias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const finVentana = (w) => sumarDias(w.fecha, Number(w.ventana) || 10);
  const SIN_UTM = '(sin UTM)', SIN_REG = '(sin registro)';
  // la fuente de una agenda es la utm_source de su registro en la landing (el cruce lo hace /api/panel)
  const fuenteDe = (r) => (r._registro ? (r._registro.utm && r._registro.utm.utm_source) || SIN_UTM : SIN_REG);

  // la zona del cliente: uiHoyAR del hub piensa siempre en Argentina
  const zona = () => (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires';
  const monedaCliente = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';
  const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: zona() }).format(new Date());
  const ahora = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona() }).format(new Date());
  let FMT = null;
  function diaZona(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    if (!FMT || FMT.z !== zona()) FMT = { z: zona(), f: new Intl.DateTimeFormat('en-CA', { timeZone: zona() }) };
    return FMT.f.format(d);
  }
  // el día en que agendó, en la zona del cliente: el Timestamp viene en UTC y una agenda de las 22 h (justo después
  // del vivo) caía al día siguiente
  const fechaAlta = (r) => { const t = String(r.Timestamp || ''); return /T\d/.test(t) ? diaZona(t) : (t || String(r['Fecha call'] || '')).slice(0, 10); };

  /* De qué webinar es cada agenda: la del registro en la landing (mismo mail o WhatsApp) y, si no se registró, la
     fecha en que agendó. Cada webinar se queda con lo que entra hasta el final de su ventana de cierre, desde que
     cerró la ventana del anterior. Lo que entra después del último queda sin webinar. ws: del más viejo al más nuevo. */
  function webinarDeFila(r, ws) {
    const w = r._registro && r._registro.w;
    if (w && ws.some((x) => x.id === w)) return w;
    const f = fechaAlta(r);
    const x = f ? ws.find((x) => f <= finVentana(x)) : null;
    return x ? x.id : null;
  }

  // Las cuentas sobre las agendas, con los criterios del hub original: show-up sobre las llamadas con resultado (presentadas +
  // no-show), cierre sobre las presentadas, y "por venir" lo que tiene la llamada hoy o más adelante.
  function metricas(rows, h) {
    const n = (e) => rows.filter((r) => r.Estado === e).length;
    const asis = rows.filter(asistio).length, ns = n('No-show');
    const cerr = rows.filter((r) => r.Estado === 'Cerrada');
    // shortcut: el cash es el Monto de las agendas Cerradas (como el hub original antes del CRM); cuando el módulo Ventas tenga su
    // CRM, tomar de ahí el cash cobrado del webinar (y las cuotas por cobrar para la alerta de ventas sin cobrar)
    const cash = cerr.reduce((s, r) => s + monto(r), 0);
    const conMonto = cerr.filter((r) => monto(r) > 0).length;
    const vivas = rows.filter((r) => r.Estado !== 'Cancelada' && r.Estado !== 'Descalificada');
    return {
      agendas: rows.length, asis, ns, canceladas: n('Cancelada'),
      show: asis + ns ? 100 * asis / (asis + ns) : null,
      cierres: cerr.length, cierrePct: asis ? 100 * cerr.length / asis : null,
      cash, conMonto, ticket: conMonto ? cash / conMonto : null,
      porVenir: rows.filter((r) => porVenir(r, h)).length,
      closers: new Set(vivas.map((r) => String(r.Closer || '').trim()).filter(Boolean)).size,
    };
  }

  /* El desglose de un webinar (o de una de sus fuentes): gasto → registros → calificados → asistentes → agendas →
     presentadas → cierres → cash. Cada paso se mide contra la misma base que usa la proyección (lib/proyeccion.mjs):
     calificados, asistentes y agendas sobre los registros; presentadas sobre las llamadas con resultado (show-up);
     cierres sobre las presentadas. El cuello de botella es el paso que quedó más lejos de su tasa proyectada.
     o = {w (de /api/tablero), rows (sus agendas), asistentes, gasto (normGasto), fuente?, hoy} */
  function embudo(o) {
    const w = o.w, P = w.proyeccion || {}, e = P.entrada || {};
    const R = w.registros || { total: 0, calificados: 0, respondieron: 0, porFuente: {} };
    const f = o.fuente || null;
    const reg = f ? (R.porFuente[f] || { n: 0, cal: 0, resp: 0 }) : { n: R.total, cal: R.calificados, resp: R.respondieron };
    const rows = f ? o.rows.filter((r) => fuenteDe(r) === f) : o.rows;
    const m = metricas(rows, o.hoy);
    // la asistencia es un número por webinar y el gasto es de toda la cuenta: ninguno de los dos se abre por fuente
    const asis = f || o.asistentes == null ? null : Number(o.asistentes);
    const g = !f && o.gasto && o.gasto.comparable ? o.gasto.gasto : null;
    const tasa = (a, b) => (b ? 100 * a / b : null);
    const pr = (v) => (f || v == null ? null : v);
    const pasos = [
      { k: 'registros', nom: 'Registros', uno: 'registro', n: reg.n, proy: pr(e.registros) },
      { k: 'calificados', nom: 'Calificados', uno: 'calificado', n: reg.cal, proy: pr(P.calificados), conv: reg.resp ? tasa(reg.cal, reg.n) : null, convProy: e.pctCalificados, base: 'de los registros', caida: reg.n - reg.cal, perdida: 'no calificaron o no contestaron' },
      { k: 'asistentes', nom: 'Asistentes al vivo', uno: 'asistente', n: asis, proy: pr(P.asistentes), conv: asis == null ? null : tasa(asis, reg.n), convProy: e.pctAsistencia, base: 'de los registros', aMano: true },
      { k: 'agendas', nom: 'Agendas', uno: 'agenda', n: m.agendas, proy: pr(P.agendas), conv: tasa(m.agendas, reg.n), convProy: e.pctAgenda, base: 'de los registros', deAsistentes: asis ? tasa(m.agendas, asis) : null },
      { k: 'presentadas', nom: 'Presentadas', uno: 'presentada', n: m.asis, proy: pr(P.llamadas), conv: m.show, convProy: e.pctShow, base: 'show-up', caida: m.agendas - m.asis - m.porVenir, porVenir: m.porVenir, perdida: 'no-show, canceladas o sin resultado' },
      { k: 'cierres', nom: 'Cierres', uno: 'cierre', n: m.cierres, proy: pr(P.ventas), conv: m.cierrePct, convProy: e.pctCierre, base: 'de las presentadas', caida: m.asis - m.cierres, perdida: 'escucharon la oferta y no cerraron' },
    ];
    let cuello = null;
    pasos.forEach((p) => {
      if (p.conv != null && p.convProy) { p.ratio = p.conv / p.convProy; if (p.ratio < 1 && (!cuello || p.ratio < cuello.ratio)) cuello = p; }
      if (g != null && p.n) p.costo = g / p.n;
    });
    if (cuello) cuello.esCuello = true;
    return { pasos, m, reg, fuente: f, gasto: g, cpl: g != null && reg.n ? g / reg.n : null, cash: m.cash, ticket: m.ticket, roas: g ? m.cash / g : null, cuello };
  }

  /* El "Hoy" del hub original (hub.js → hoyCalcular), con lo que aplica a masterclass. Solo lo accionable: cada alerta trae
     cuántos, quiénes y a dónde ir. rojo = plata o un lead que se cae hoy · ámbar = se cae si nadie lo toca. */
  function alertas(rows, h, hm) {
    const A = [];
    const add = (sev, titulo, xs, ir, detalle) => { if (xs.length) A.push({ sev, titulo, items: xs, ir, detalle }); };
    const nombre = (r) => String(r.Nombre || '').trim() || 'sin nombre';
    const conHora = (r) => `${horaCall(r) ? horaCall(r) + ' · ' : ''}${nombre(r)}`;
    const vivas = rows.filter((r) => r.Estado !== 'Cancelada' && r.Estado !== 'Descalificada');
    const man = sumarDias(h, 1);
    add('rojo', 'Llamadas de hoy sin closer asignado', vivas.filter((r) => fechaCall(r) === h && !String(r.Closer || '').trim()).map(conHora),
      '#central', 'Si nadie las toma, el lead entra a una sala vacía.');
    add('ambar', 'Llamadas de hoy y mañana sin confirmar',
      rows.filter((r) => r.Estado === 'Pendiente' && ((fechaCall(r) === h && (!horaCall(r) || horaCall(r) >= hm)) || fechaCall(r) === man))
        .map((r) => `${fechaCall(r) === man ? 'mañana ' : ''}${conHora(r)}`),
      '#central', 'Confirmarlas la noche anterior y 2 horas antes es lo que sube el show-up.');
    // re-agendó = la misma persona (mail o WhatsApp) tiene otra llamada después de la que faltó
    const quien = (r) => String(r.Email || '').trim().toLowerCase() || String(r.WhatsApp || '').replace(/\D/g, '').slice(-10);
    const ultima = new Map();
    rows.forEach((r) => { const k = quien(r); if (k && fechaCall(r) > (ultima.get(k) || '')) ultima.set(k, fechaCall(r)); });
    const desde = sumarDias(h, -14);
    add('ambar', 'No-shows sin re-agendar',
      rows.filter((r) => r.Estado === 'No-show' && fechaCall(r) >= desde && fechaCall(r) <= h && !(quien(r) && ultima.get(quien(r)) > fechaCall(r)))
        .map((r) => `${nombre(r)} · ${r.Closer || 'sin closer'}`),
      '#llamadas', 'Faltaron en los últimos 14 días y no tienen otra llamada: escribirles hoy para re-agendar.');
    add('rojo', 'Ventas cerradas sin monto cargado', rows.filter((r) => r.Estado === 'Cerrada' && !(monto(r) > 0)).map((r) => `${nombre(r)} · ${r.Closer || 'sin closer'}`),
      '#llamadas', 'Sin el monto no suman al cash ni al ROAS: cargá cuánto se cobró.');
    const orden = { rojo: 0, ambar: 1, azul: 2 };
    return A.sort((a, b) => orden[a.sev] - orden[b.sev] || b.items.length - a.items.length);
  }

  // /api/meta-ads?resumen=1 (módulo Ads) → {gasto, moneda, dias:[{fecha, gasto}]}, o null si no está conectado o no
  // responde. Acepta también la forma del meta-ads del hub original ({cuentas:[{gasto, moneda, porDia}]}).
  function normGasto(j, r) {
    if (!j || j.error || j.ok === false || j.configurado === false) return null;
    const cs = Array.isArray(j.cuentas) ? j.cuentas.filter((c) => c && !c.error) : [j.resumen || j];
    const vale = (v) => v != null && v !== '' && isFinite(v);
    if (!cs.some((c) => vale(c.gasto))) return null;
    const moneda = String((cs.find((c) => c.moneda) || j).moneda || '');
    return {
      gasto: cs.reduce((s, c) => s + (Number(c.gasto) || 0), 0), moneda, comparable: !moneda || moneda.toUpperCase() === monedaCliente().toUpperCase(),
      dias: cs.flatMap((c) => c.porDia || c.dias || []).map((x) => ({ fecha: String(x.fecha || x.dia || '').slice(0, 10), gasto: Number(x.gasto) || 0 })),
      desde: r && r.desde, hasta: r && r.hasta,
    };
  }

  /* ── carga ── */
  const D = { t: null, cuando: 0, asis: {}, gasto: {}, pend: null };
  function cargar(force) {
    if (!force && D.t && Date.now() - D.cuando < 60e3) return Promise.resolve();
    if (D.pend) return D.pend;
    if (force) D.gasto = {};
    D.pend = Promise.all([
      pedirJSON('/api/tablero').then((j) => { D.t = j; D.cuando = Date.now(); }),
      dbLista('webinar-asistencia', !!force).then((ds) => { D.asis = {}; ds.forEach((d) => { D.asis[d.id] = d; }); }).catch(() => { }),
      force ? cargarDatos() : null,
    ]).finally(() => { D.pend = null; });
    return D.pend;
  }
  const webinars = () => (D.t && D.t.webinars) || [];
  const LS_W = 'mhqtab:w';
  function wid() {
    const ws = webinars();
    if (!ws.length) return null;
    let id = null;
    try { id = sessionStorage.getItem(LS_W); } catch (e) { }
    if (ws.some((w) => w.id === id)) return id;
    const act = D.t.webinarActivo;
    return ws.some((w) => w.id === act) ? act : ws[ws.length - 1].id;
  }
  const web = (id = wid()) => webinars().find((w) => w.id === id) || null;
  // las agendas de cada webinar, recalculadas solo cuando cambia el pipeline (DATA) o el tablero
  let ASIG = { rows: null, t: null, m: new Map() };
  function filas(id = wid()) {
    const rows = (typeof DATA !== 'undefined' && DATA && DATA.rows) || [];
    if (ASIG.rows !== rows || ASIG.t !== D.t) {
      const ws = webinars(), m = new Map();
      rows.forEach((r) => { const k = webinarDeFila(r, ws); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
      ASIG = { rows, t: D.t, m };
    }
    return ASIG.m.get(id) || [];
  }
  const asistentes = (id = wid()) => { const d = D.asis[id]; return d && d.asistentes != null && d.asistentes !== '' ? Number(d.asistentes) : null; };
  // el gasto se mide desde el primer registro hasta el vivo (o el pop-up): la captación del webinar
  const primerDia = (w) => Object.keys((w.registros || {}).porDia || {}).sort()[0] || sumarDias(w.fecha, -21);
  function rangoAds(w) {
    const fin = w.popup && w.popup.fecha > w.fecha ? w.popup.fecha : w.fecha, h = hoy();
    const r = { desde: primerDia(w), hasta: fin < h ? fin : h };
    return r.desde <= r.hasta ? r : null;
  }
  // undefined = todavía no llegó · null = sin conexión, sin respuesta o el webinar no arrancó
  function gastoYa(w) {
    const r = w && rangoAds(w);
    if (!r) return null;
    const c = D.gasto[r.desde + r.hasta];
    return c ? c.v : undefined;
  }
  function gasto(w) {
    const r = w && rangoAds(w);
    if (!r) return Promise.resolve(null);
    const k = r.desde + r.hasta, c = D.gasto[k];
    if (c && (c.p || Date.now() - c.t < 10 * 60e3)) return c.p || Promise.resolve(c.v);
    const p = fetch(`/api/meta-ads?resumen=1&desde=${r.desde}&hasta=${r.hasta}`, { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined })
      .then((x) => (x.ok ? x.json() : null)).catch(() => null)
      .then((j) => { const v = normGasto(j, r); D.gasto[k] = { t: Date.now(), v }; return v; });
    D.gasto[k] = { t: Date.now(), p, v: undefined };
    return p;
  }
  // todo lo de un webinar, listo para pintar
  function estado(id = wid()) {
    const w = web(id);
    if (!w) return null;
    const h = hoy(), rows = filas(id), g = gastoYa(w);
    const emb = embudo({ w, rows, asistentes: asistentes(id), gasto: g, hoy: h });
    return { id, w, P: w.proyeccion || {}, e: (w.proyeccion || {}).entrada || {}, reg: w.registros, rows, m: emb.m, g, emb, h };
  }

  /* ── formato ── */
  // con es-AR el peso argentino sale como «$» a secas: ahí va el código (ARS 1.500), como en Ventas y Finanzas
  const verMoneda = (m) => (new Intl.NumberFormat('es-AR', { style: 'currency', currency: m }).formatToParts(0)
    .some((p) => p.type === 'currency' && p.value === '$') ? 'code' : 'symbol');
  const plata = (n, dec = 0, moneda) => {
    if (n == null || !isFinite(n)) return '—';
    const m = /^[A-Za-z]{3}$/.test(moneda || '') ? moneda : monedaCliente();
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: m, currencyDisplay: verMoneda(m), maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n);
  };
  const pc1 = (x) => (x == null || !isFinite(x) ? '—' : uiNum(x, x !== 0 && Math.abs(x) < 10 && x % 1 ? 1 : 0) + '%');
  const fechaTxt = (f) => (f ? uiFechaCorta(f) + (f.slice(0, 4) !== hoy().slice(0, 4) ? ' ' + f.slice(0, 4) : '') : '—');
  const nombreWeb = (w) => `${fechaTxt(w.fecha)} · ${w.nombre}`;
  const vista = () => (document.querySelector('.view.on') || {}).id || '';
  const MIAS = ['ceo', 'embudos', 'kpis'];
  // repinta la pantalla del tablero que esté abierta (cambió el webinar o la asistencia)
  const refrescar = () => { const v = vista(); if (MIAS.includes(v) && window.PANTALLAS[v]) window.PANTALLAS[v](); };
  function selector() {
    const ws = webinars(), id = wid();
    if (!ws.length) return '';
    if (ws.length === 1) return `<span class="tb-web" title="El webinar">${uiIco('calendario', 14)}${uiEsc(nombreWeb(ws[0]))}</span>`;
    return `<label class="tb-sel">${uiIco('calendario', 14)}<select onchange="tbElegir(this.value)" aria-label="Webinar">${ws.slice().reverse().map((w) =>
      `<option value="${uiEsc(w.id)}"${w.id === id ? ' selected' : ''}>${uiEsc(nombreWeb(w))}${D.t.webinarActivo === w.id ? ' · en la landing' : ''}</option>`).join('')}</select></label>`;
  }
  const elegir = (id) => { try { sessionStorage.setItem(LS_W, id); } catch (e) { } };
  window.tbElegir = (id) => { elegir(id); refrescar(); };

  /* ── asistentes al vivo: hoy no hay de dónde leerlos, se cargan a mano (db webinar-asistencia, un doc por webinar) ── */
  window.tbAsistencia = (id) => {
    const w = web(id || wid());
    if (!w) return;
    const v = asistentes(w.id);
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    uiModalAbrir({
      titulo: 'Asistentes al vivo', sub: `${w.nombre} · todavía no hay de dónde leerlo: se carga a mano`, ancho: '480px',
      cuerpo: `<div class="ui-campos"><label class="ui-campo"><span>Personas que se conectaron al vivo</span><input id="tbAsisN" type="number" min="0" step="1" inputmode="numeric" value="${v == null ? '' : v}" placeholder="${w.proyeccion && w.proyeccion.asistentes != null ? 'proyección: ' + w.proyeccion.asistentes : ''}"></label></div>
        <p class="tb-nota">Sale de la plataforma del vivo (Zoom, StreamYard, YouTube…): personas únicas, no el pico de conectados. Vacío = sin dato.</p>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: `tbAsistenciaOk('${uiEsc(w.id)}')`, pri: true }],
    });
    setTimeout(() => { const i = document.getElementById('tbAsisN'); if (i) i.focus(); }, 30);
  };
  window.tbAsistenciaOk = async (id) => {
    const t = String((document.getElementById('tbAsisN') || {}).value || '').trim();
    const n = t === '' ? null : Number(t);
    if (n != null && !(Number.isInteger(n) && n >= 0)) { uiToast('Poné un número entero (o dejalo vacío)', 'mal'); return; }
    try {
      D.asis[id] = await dbGuardar('webinar-asistencia', { id, asistentes: n });
      uiModalCerrar(); uiToast('Asistentes guardados', 'ok'); refrescar();
    } catch (e) { uiToast('No se pudo guardar: ' + e.message, 'mal'); }
  };

  window.TAB = {
    CAIDAS, SIN_UTM, SIN_REG, asistio, porVenir, fechaAlta, fechaCall, horaCall, monto, sumarDias, difDias, finVentana, fuenteDe,
    webinarDeFila, metricas, embudo, alertas, normGasto, hoy, ahora,
    cargar, webinars, wid, elegir, web, filas, asistentes, primerDia, rangoAds, gasto, gastoYa, estado,
    plata, pc1, fechaTxt, nombreWeb, selector, vista, refrescar,
  };

  /* ════════════════════════ Inicio ════════════════════════ */
  const $ = (id) => document.getElementById(id);
  function saludo() {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: zona() }).format(new Date()));
    const parte = h >= 5 && h < 13 ? 'Buenos días' : h >= 13 && h < 20 ? 'Buenas tardes' : 'Buenas noches';
    const nombre = (typeof YO !== 'undefined' && YO && String(YO.nombre || '').trim().split(/\s+/)[0]) || '';
    return nombre ? `${parte}, ${nombre}` : parte;
  }
  const plural = (n, uno, varios) => `${uiNum(n)} ${n === 1 ? uno : (varios || uno + 's')}`;
  const pctDe = (n, tot) => (tot ? pc1(100 * n / tot) : '');
  const puedeVer = (v) => { try { return vistasDe(perfilEfectivo()).includes(v); } catch (e) { return true; } };
  const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const diaLargo = (f) => `${DIAS_C[uiF(f).getDay()]} ${fechaTxt(f)}`;
  // qué parte de un tramo ya pasó: 0 si no arrancó, null si ya terminó (se compara contra el total)
  function ritmo(r, h) {
    if (h < r.desde) return 0;
    if (h > r.hasta) return null;
    return (difDias(r.desde, h) + 1) / (difDias(r.desde, r.hasta) + 1);
  }
  // el semáforo contra el objetivo y el ritmo: verde al día · ámbar hasta 30% atrás · rojo más atrás · azul sin vara
  function semaforo(real, obj, rit) {
    if (!obj) return 'azul';
    if (real >= obj) return 'verde';
    if (rit === 0) return 'azul';
    const esperado = obj * (rit == null ? 1 : rit);
    return real >= esperado ? 'verde' : real >= 0.7 * esperado ? 'ambar' : 'rojo';
  }
  const semTasa = (v, obj) => (v == null ? 'gris' : !obj ? 'azul' : v >= obj ? 'verde' : v >= 0.6 * obj ? 'ambar' : 'rojo');

  /* ── mini-barras (las de inicio.js del hub original): un día por barra; de 63 días en adelante, semanas ── */
  function cortesMini(r, h) {
    const dias = difDias(r.desde, r.hasta) + 1, out = [];
    const paso = dias <= 62 ? 1 : 7;
    for (let f = r.desde; f <= r.hasta; f = sumarDias(f, paso)) {
      const hasta = paso === 1 ? f : (sumarDias(f, 6) < r.hasta ? sumarDias(f, 6) : r.hasta);
      out.push({ desde: f, hasta, nombre: paso === 1 ? diaLargo(f) : `${fechaTxt(f)} – ${fechaTxt(hasta)}`, fut: f > h });
    }
    return out;
  }
  function porCorte(cortes, items, diaDe, valorDe) {
    return cortes.map((c) => {
      const en = items.filter((it) => { const f = diaDe(it); return f && f >= c.desde && f <= c.hasta; });
      return { items: en, v: en.reduce((s, it) => s + (Number(valorDe(it)) || 0), 0) };
    });
  }
  function miniBarras(serie) {
    if ((serie || []).length < 2 || !serie.some((x) => x.v > 0)) return '';
    const max = Math.max(...serie.map((x) => x.v), 1);
    return `<div class="salud-mini">${serie.map((x) => `<i${x.fut ? ' class="fut"' : ''} style="height:${(x.v > 0 ? Math.max(6, x.v / max * 100) : 2).toFixed(0)}%" data-tip="${uiEsc(x.tip)}"></i>`).join('')}</div>`;
  }
  // o = {etiqueta, color, valor, sub?, mini?, ir? ('#pantalla'), tipH? (el semáforo), tipV? (de qué sale el número)}
  function tile(o) {
    const ir = o.ir && puedeVer(o.ir.slice(1)) ? o.ir : '';
    return `<div class="salud-t c-${o.color}${ir ? ' clic' : ''}"${ir ? ` role="link" tabindex="0" onclick="if(window.uiTipOcultar)uiTipOcultar();location.hash='${ir}'" onkeydown="if(event.key==='Enter')location.hash='${ir}'"` : ''}>
      <div class="salud-h"${o.tipH ? ` data-tip="${uiEsc(o.tipH)}"` : ''}><span>${uiEsc(o.etiqueta)}</span><i></i></div>
      <b${o.tipV ? ` data-tip="${uiEsc(o.tipV)}"` : ''}>${uiEsc(o.valor)}</b>
      ${o.mini || ''}
      ${o.sub ? `<small>${o.sub}</small>` : ''}
    </div>`;
  }

  function tiles(x) {
    const { w, P, e, reg, m, g, emb, h } = x;
    const cap = { desde: primerDia(w), hasta: w.fecha }, cierre = { desde: w.fecha, hasta: finVentana(w) };
    const tituloW = w.nombre;
    // Registros: contra el objetivo y el ritmo de la captación (del primer registro al vivo)
    const ritCap = ritmo(cap, h), tot = reg.total, obj = e.registros;
    const cortesR = cortesMini(cap, h);
    const serieR = porCorte(cortesR, Object.entries(reg.porDia || {}), ([d]) => d, ([, x]) => x.n).map((c, i) => {
      const cal = c.items.reduce((s, [, x]) => s + x.cal, 0), k = cortesR[i];
      return { v: c.v, fut: k.fut, tip: k.fut && !c.v ? `${k.nombre}\npor venir` : `${k.nombre}\n${plural(c.v, 'registro')}${c.v ? ` · ${plural(cal, 'calificado')}` : ''}${tot && c.v ? `\n${pctDe(c.v, tot)} de los registros` : ''}` };
    });
    const hoyN = ((reg.porDia || {})[h] || {}).n || 0;
    const tReg = {
      etiqueta: 'Registros', ir: '#registros', color: !tot ? 'gris' : semaforo(tot, obj, ritCap),
      tipH: `Registros · contra el objetivo de la proyección\nverde: al ritmo de la captación o mejor · ámbar: hasta 30% atrás · rojo: más atrás\nazul: sin objetivo cargado · gris: sin registros`,
      valor: `${uiNum(tot)} ${tot === 1 ? 'registro' : 'registros'}`,
      tipV: `Registros · ${tituloW}\n${plural(tot, 'registro')} · ${uiNum(hoyN)} hoy\n${plural(reg.calificados, 'calificado')} de ${plural(reg.respondieron, 'respuesta')}${obj ? `\nObjetivo: ${uiNum(obj)} (${pctDe(tot, obj)})` : ''}${obj && ritCap ? `\nA hoy el ritmo pide ${uiNum(Math.round(obj * ritCap))}` : ''}`,
      sub: `${obj ? `${pctDe(tot, obj)} del objetivo (${uiNum(obj)})` : 'sin objetivo en la proyección'}<br>${uiNum(reg.calificados)} calificados${tot ? ` · ${pctDe(reg.calificados, tot)}` : ''}`,
      mini: miniBarras(serieR),
    };
    // Anuncios: el gasto de Meta y el costo por registro contra el proyectado
    let tAds;
    const tipAds = `Anuncios · gasto de Meta en la captación\nverde: costo por registro igual o menor al proyectado · ámbar: hasta 30% más caro · rojo: más caro\nazul: sin costo proyectado para comparar · gris: sin gasto o sin conexión`;
    if (g === undefined) tAds = { etiqueta: 'Anuncios', color: 'gris', valor: '…', sub: 'leyendo Meta…', ir: '#anuncios', tipH: tipAds };
    else if (!g) tAds = { etiqueta: 'Anuncios', color: 'gris', valor: '—', sub: rangoAds(w) ? 'Meta Ads sin conectar o sin respuesta' : 'la captación todavía no arrancó', ir: '#anuncios', tipH: tipAds };
    else {
      const cpl = emb.cpl;
      const cortesA = cortesMini({ desde: g.desde, hasta: g.hasta }, h);
      const serieA = porCorte(cortesA, g.dias || [], (d) => d.fecha, (d) => d.gasto).map((c, i) => ({ v: c.v, fut: cortesA[i].fut,
        tip: !c.v ? `${cortesA[i].nombre}\nsin gasto` : `${cortesA[i].nombre}\n${plata(c.v, 0, g.moneda)} invertidos${g.gasto ? ` · ${pctDe(c.v, g.gasto)} del total` : ''}` }));
      tAds = {
        etiqueta: 'Anuncios', ir: '#anuncios', tipH: tipAds,
        color: !g.gasto ? 'gris' : !g.comparable || cpl == null || !P.cpl ? 'azul' : cpl <= P.cpl ? 'verde' : cpl <= 1.3 * P.cpl ? 'ambar' : 'rojo',
        valor: g.gasto ? plata(g.gasto, 0, g.moneda) : '—',
        tipV: `Inversión en Meta · ${fechaTxt(g.desde)} al ${fechaTxt(g.hasta)}\n${plata(g.gasto, 2, g.moneda)}${e.presupuesto ? ` · ${pctDe(g.gasto, e.presupuesto)} del presupuesto (${plata(e.presupuesto)})` : ''}${cpl != null ? `\nCosto por registro: ${plata(cpl, 2)}${P.cpl ? ` · proyectado ${plata(P.cpl, 2)}` : ''}` : ''}${!g.comparable ? `\nEl gasto está en ${g.moneda}: no se cruza con el cash en ${monedaCliente()}` : ''}`,
        sub: g.gasto ? `${cpl != null ? `${plata(cpl, 2)} por registro${P.cpl ? ` · proyectado ${plata(P.cpl, 2)}` : ''}` : `en ${uiEsc(g.moneda)}`}${e.presupuesto ? `<br>${pctDe(g.gasto, e.presupuesto)} del presupuesto (${plata(e.presupuesto)})` : ''}` : 'sin gasto en la captación',
        mini: miniBarras(serieA),
      };
    }
    // Agendas: qué parte de los registros agendó, contra la proyección
    const conv = tot ? 100 * m.agendas / tot : null;
    const altas = x.rows.map(fechaAlta).filter(Boolean).sort();
    const rAg = { desde: altas[0] && altas[0] < w.fecha ? altas[0] : w.fecha, hasta: finVentana(w) };
    const cortesG = cortesMini(rAg, h);
    const serieG = porCorte(cortesG, x.rows, fechaAlta, () => 1).map((c, i) => ({ v: c.v, fut: cortesG[i].fut,
      tip: cortesG[i].fut && !c.v ? `${cortesG[i].nombre}\npor venir` : `${cortesG[i].nombre}\n${plural(c.v, 'agenda')}${m.agendas && c.v ? ` · ${pctDe(c.v, m.agendas)} de las agendas` : ''}` }));
    const tAg = {
      etiqueta: 'Agendas', ir: '#central', color: !m.agendas ? 'gris' : semTasa(conv, e.pctAgenda),
      tipH: `Agendas · qué parte de los registros agendó\nverde: igual o más que lo proyectado (${e.pctAgenda}%) · ámbar: hasta 40% menos · rojo: menos\ngris: sin agendas`,
      valor: `${uiNum(m.agendas)} ${m.agendas === 1 ? 'agenda' : 'agendas'}`,
      tipV: m.agendas ? `Agendas · ${tituloW}\n${plural(m.agendas, 'agenda')}${m.porVenir ? ` · ${uiNum(m.porVenir)} con la llamada por venir` : ''}${conv != null ? `\n${pc1(conv)} de los ${plural(tot, 'registro')} (proyección ${e.pctAgenda}%)` : ''}${P.agendas ? `\nProyección: ${uiNum(P.agendas)} agendas (${pctDe(m.agendas, P.agendas)})` : ''}${m.show != null ? `\nShow-up ${pc1(m.show)} (proyección ${e.pctShow}%)` : ''}` : null,
      sub: `${conv != null ? `${pc1(conv)} de los registros · proyección ${e.pctAgenda}%` : 'sin registros para comparar'}${m.show != null ? `<br>show-up ${pc1(m.show)} · proyección ${e.pctShow}%` : m.porVenir ? `<br>${uiNum(m.porVenir)} por venir` : ''}`,
      mini: miniBarras(serieG),
    };
    // Closing: cerradas sobre presentadas, contra la tasa proyectada
    const tCl = {
      etiqueta: 'Closing', ir: '#closers', color: semTasa(m.cierrePct, e.pctCierre),
      tipH: `Closing · cerradas ÷ presentadas\nverde: igual o más que lo proyectado (${e.pctCierre}%) · ámbar: hasta 40% menos · rojo: menos\nSi la proyección no trae su % de cierre, es el supuesto por defecto (${(window.MHQ && MHQ.opciones && MHQ.opciones.vara && MHQ.opciones.vara.pctCierre) || 20}%)`,
      valor: m.cierrePct == null ? '—' : `${pc1(m.cierrePct)} cierre`,
      tipV: m.cierrePct == null ? null : `Tasa de cierre · ${tituloW}\n${plural(m.cierres, 'cierre')} de ${plural(m.asis, 'presentada')}\nProyección: ${e.pctCierre}%${P.ventas ? ` · ${uiNum(P.ventas)} ventas` : ''}`,
      sub: `${uiNum(m.asis)} presentadas · ${uiNum(m.cierres)} cierres<br>proyección ${e.pctCierre}%${P.ventas ? ` · ${uiNum(P.ventas)} ventas` : ''}`,
    };
    // Cash: contra el cash objetivo (presupuesto × ROAS objetivo) y el ritmo de la ventana de cierre
    const objC = P.cashObjetivo != null ? P.cashObjetivo : P.cash;
    const tCash = {
      etiqueta: 'Cash', ir: '#finanzas', color: !m.cash ? 'gris' : semaforo(m.cash, objC, ritmo(cierre, h)),
      tipH: `Cash · Monto de las agendas Cerradas contra el cash objetivo\nverde: al ritmo de la ventana de cierre o mejor · ámbar: hasta 30% atrás · rojo: más atrás\nazul: sin objetivo o la ventana no arrancó · gris: sin ventas`,
      valor: m.cash ? plata(m.cash) : '—',
      tipV: m.cash ? `Cash · ${tituloW}\n${plata(m.cash)} en ${plural(m.cierres, 'cierre')}${m.cierres > m.conMonto ? ` (${uiNum(m.cierres - m.conMonto)} sin monto)` : ''}${objC ? `\nObjetivo: ${plata(objC)} (${pctDe(m.cash, objC)})` : ''}${emb.roas != null ? `\nROAS x${uiNum(emb.roas, 1)}${e.roasObjetivo ? ` · objetivo x${uiNum(e.roasObjetivo, 1)}` : ''}` : ''}` : null,
      sub: `${objC ? `${pctDe(m.cash, objC)} del objetivo (${plata(objC)})` : 'sin cash objetivo en la proyección'}<br>${emb.roas != null ? `ROAS x${uiNum(emb.roas, 1)}${e.roasObjetivo ? ` · objetivo x${uiNum(e.roasObjetivo, 1)}` : ''}` : 'ROAS: falta el gasto de Meta'}`,
    };
    return [tReg, tAds, tAg, tCl, tCash].map(tile).join('');
  }

  /* ── Hoy (hub.js → renderHoy) ── */
  const SEV = { rojo: 'var(--red)', ambar: 'var(--amber)', azul: 'var(--blue)' };
  function hoyHtml() {
    const rows = (typeof DATA !== 'undefined' && DATA && DATA.rows) || [];
    const h = hoy(), A = alertas(rows, h, ahora());
    const total = A.reduce((s, x) => s + x.items.length, 0);
    const llamadas = rows.filter((r) => fechaCall(r) === h && r.Estado !== 'Cancelada' && r.Estado !== 'Descalificada').length;
    const cab = `<div class="ui-sec">Hoy <span class="der ini-hoy-res">${uiEsc(uiCap(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zona() })))} · ${plural(total, 'cosa')} para atender · ${plural(llamadas, 'llamada')} hoy</span></div>`;
    if (!A.length) {
      return cab + `<div class="card ini-al" style="--c:var(--green)"><b>No hay nada urgente.</b>
        <p>Ninguna llamada sin closer ni sin confirmar, ningún no-show sin re-agendar y ninguna venta sin monto. Aprovechá.</p></div>`;
    }
    return cab + A.map((x) => `<div class="card ini-al" style="--c:${SEV[x.sev]}">
      <h3><span class="ini-al-t"><span class="salud-dot"></span>${uiEsc(x.titulo)}<span class="chip">${x.items.length}</span></span>
        ${puedeVer(x.ir.slice(1)) ? `<button type="button" class="fchip" onclick="location.hash='${x.ir}'">Ir →</button>` : ''}</h3>
      <p>${uiEsc(x.detalle)}</p>
      <div class="ini-al-items">${x.items.slice(0, 14).map((n) => `<span class="chip">${uiEsc(n)}</span>`).join('')}${x.items.length > 14 ? `<span class="chip ini-mas">y ${x.items.length - 14} más</span>` : ''}</div>
    </div>`).join('');
  }

  /* ── proyección contra lo real ── */
  function proyHtml(x) {
    const { P, e, reg, m, g, emb, id } = x;
    const sinMeta = g === undefined ? 'Leyendo Meta…' : !g ? 'Meta Ads sin conectar o sin respuesta (Integraciones)' : !g.comparable ? `El gasto está en ${g.moneda} y el cash en ${monedaCliente()}` : '';
    const asis = asistentes(id);
    const n = (v) => uiNum(v), p2 = (v) => plata(v, 2), p0 = (v) => plata(v), xr = (v) => 'x' + uiNum(v, 1);
    const F = [
      { et: 'Inversión en ads', proy: e.presupuesto, real: emb.gasto, fmt: p0, falta: sinMeta, presu: true },
      { et: 'Registros', proy: e.registros, real: reg.total, fmt: n },
      { et: 'Costo por registro', proy: P.cpl, real: emb.cpl, fmt: p2, menos: true, falta: sinMeta },
      { et: 'Calificados', proy: P.calificados, real: reg.calificados, fmt: n, faltaProy: 'Falta el % de calificados en la proyección' },
      { et: 'CPL calificado', proy: P.cplCalificado, real: emb.gasto != null && reg.calificados ? emb.gasto / reg.calificados : null, fmt: p2, menos: true, falta: sinMeta },
      { et: 'Asistentes al vivo', proy: P.asistentes, real: asis, fmt: n, falta: 'Se carga a mano: tocá «Cargar»', cargar: true },
      { et: 'Agendas', proy: P.agendas, real: m.agendas, fmt: n },
      { et: 'Costo por agenda', proy: P.costoAgenda, real: emb.gasto != null && m.agendas ? emb.gasto / m.agendas : null, fmt: p2, menos: true, falta: sinMeta },
      { et: 'Llamadas presentadas', proy: P.llamadas, real: m.asis, fmt: n },
      { et: 'Ventas', proy: P.ventas, real: m.cierres, fmt: n },
      { et: P.cash != null ? 'Cash' : 'Cash (objetivo)', proy: P.cash != null ? P.cash : P.cashObjetivo, real: m.cash, fmt: p0, faltaProy: 'Falta el ticket o el ROAS objetivo en la proyección' },
      { et: 'ROAS', proy: P.roas != null ? P.roas : e.roasObjetivo, real: emb.roas, fmt: xr, falta: sinMeta || 'Sin cash todavía' },
      { et: 'Closers', proy: P.closers, real: m.closers, fmt: n, nota: 'Closers con llamadas en este webinar contra los necesarios para atender las agendas' },
    ];
    const cols = [
      { t: 'ETAPA', f: (f) => `<b class="ini-et"${f.nota ? ` data-tip="${uiEsc(f.et + '\n' + f.nota)}"` : ''}>${uiEsc(f.et)}</b>` },
      { t: 'PROYECTADO', al: 'der', ancho: '130px', f: (f) => (f.proy == null ? `<span class="ini-gris" data-tip="${uiEsc(f.et + '\n' + (f.faltaProy || 'Sin dato en la proyección'))}">—</span>` : uiEsc(f.fmt(f.proy))) },
      { t: 'REAL', al: 'der', ancho: '130px', f: (f) => (f.real == null
        ? `${f.cargar ? `<button type="button" class="ui-link ini-cargar" onclick="tbAsistencia('${uiEsc(id)}')">Cargar</button>` : `<span class="ini-gris" data-tip="${uiEsc(f.et + '\n' + (f.falta || 'Todavía sin dato'))}">—</span>`}`
        : `${uiEsc(f.fmt(f.real))}${f.cargar ? ` <button type="button" class="ini-lapiz" title="Cambiar" onclick="tbAsistencia('${uiEsc(id)}')">${uiIco('lapiz', 12)}</button>` : ''}`) },
      { t: 'AVANCE', ancho: '190px', f: (f) => {
        if (f.proy == null || f.real == null || !f.proy) return '<span class="ini-gris">—</span>';
        const pct = 100 * f.real / f.proy;
        const est = f.menos ? (pct <= 100 ? 'ok' : 'mal') : pct >= 100 ? (f.presu ? 'atras' : 'ok') : 'en';
        const tip = `${f.et}\n${f.fmt(f.real)} de ${f.fmt(f.proy)} proyectado · ${pc1(pct)}${f.menos ? (pct <= 100 ? '\nMás barato que lo proyectado' : '\nMás caro que lo proyectado (acá menos es mejor)') : f.presu && pct > 100 ? '\nSe pasó del presupuesto' : ''}`;
        return `<span class="ini-av" data-tip="${uiEsc(tip)}"><span class="ini-riel ${est}"><i style="width:${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct)).toFixed(0)}%"></i></span><b>${pc1(pct)}</b></span>`;
      } },
    ];
    return uiCard({ clase: 'ini-proy', cuerpo: uiTabla(cols, F) });
  }

  /* ── pintado ── */
  let PINTADA = 0;
  const INI = { pintado: false };
  function cuerpo(x) {
    if (!x) {
      return `<div class="ui-vacio2">${uiIco('calendario', 22)}<b>Todavía no hay un webinar</b><span>Crealo en Webinar y el Inicio se arma solo con su proyección.</span>${puedeVer('webinar') ? '<button type="button" class="ui-vacio-cta" onclick="location.hash=\'#webinar\'">Ir a Webinar →</button>' : ''}</div>${hoyHtml()}`;
    }
    return `<div class="ui-sec">Salud del webinar <span class="der ini-sub">${uiEsc(x.w.nombre)} · vivo ${uiEsc(diaLargo(x.w.fecha))}${x.w.hora ? ' ' + uiEsc(x.w.hora) + ' h' : ''}</span></div>
      <div class="salud-strip" id="ceoKpis">${tiles(x)}</div>
      ${hoyHtml()}
      <div class="ui-sec">Proyección contra lo real <span class="der">${puedeVer('webinar') ? '<button type="button" class="ui-link" onclick="location.hash=\'#webinar\'">Editar la proyección</button>' : ''}</span></div>
      ${proyHtml(x)}
      <div class="ui-sec">Tablero <span class="der">${puedeVer('kpis') ? `<button type="button" class="ui-link" onclick="location.hash='#kpis'">${uiIco('engranaje', 14)} Fijar KPIs</button>` : ''}</span></div>
      <div id="inicioFijados"></div>
      <button type="button" id="iniVacio" class="it-vacio" hidden onclick="location.hash='#kpis'"><span><b>Tu tablero está vacío</b><small>En KPIs, fijá con la chincheta los que quieras ver acá</small></span>${uiIco('sube', 20)}</button>`;
  }
  async function pintarFijados(p) {
    const caja = $('inicioFijados'), vac = $('iniVacio');
    if (!caja) return;
    let html = '';
    try { if (typeof window.kpiFijadosHtml === 'function') html = await window.kpiFijadosHtml(); } catch (e) { html = ''; }
    if (p !== PINTADA || !caja.isConnected) return;
    caja.innerHTML = html;
    if (vac) vac.hidden = !!html.trim();
  }
  function pintar() {
    const sec = $('ceo');
    if (!sec || vista() !== 'ceo') return;
    const p = ++PINTADA;
    const x = estado();
    sec.innerHTML = `<div class="ini">${cuerpo(x)}</div>`;
    INI.pintado = true;
    cabecera();
    if (!x) return;
    pintarFijados(p);
    // el gasto de Meta llega después: no traba lo demás
    if (x.g === undefined) gasto(x.w).then(() => { if (p === PINTADA && vista() === 'ceo') pintar(); });
  }
  function cabecera() {
    if (vista() !== 'ceo') return;
    const t = $('viewtitle');
    if (t) t.textContent = saludo();
    const ex = $('pageExtra');
    if (ex) ex.innerHTML = selector() + `<button type="button" class="ui-icobtn" title="Actualizar todo" onclick="inicioActualizar()">${uiIco('refrescar', 16)}</button>`;
  }
  async function render(force) {
    const sec = $('ceo');
    if (!sec) return;
    cabecera();
    if (!sec.querySelector('.ini')) sec.innerHTML = '<div class="ini"><div class="ui-vacio-mini">Cargando…</div></div>';
    try { await cargar(force); }
    catch (e) {
      if (e.message === 'sesion') return;
      sec.innerHTML = `<div class="ini"><div class="ui-vacio-mini">No pude armar el Inicio: ${uiEsc(e.message)}</div></div>`;
      return;
    }
    pintar();
  }
  window.inicioActualizar = async () => { uiToast('Actualizando…'); await render(true); uiToast('Actualizado', 'ok'); };
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.ceo = () => { render().catch((e) => console.warn('[inicio]', e)); };
  // Sin hash (recién entrado con el link) el router muestra el Inicio pero shell.js no llama a ninguna pantalla:
  // cuando llega el pipeline del arranque, si el Inicio está a la vista y no se pintó, se pinta.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('mhq:datos', () => setTimeout(() => { if (!INI.pintado && vista() === 'ceo') window.PANTALLAS.ceo(); }, 0));
  }
})();
