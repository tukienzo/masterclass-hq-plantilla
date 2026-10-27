/* Ads — la pantalla Ads del hub original (calcada de Contenido › Ads de la referencia de diseño),
 * portada a Masterclass HQ. Seis pestañas, como allá: Dashboard · Feed · Calendario · Planificar · Contactos · Audiencias.
 *
 *  - Meta (gasto, gasto por día, impresiones, clics, leads, campañas) y los registros de la landing del período (CPL real,
 *    CPL calificado, registros por día y por campaña) → /api/meta-ads?desde=&hasta=&diario=1. La cuenta publicitaria y
 *    el token los carga el cliente en Integraciones; sin eso, cada pestaña que los necesita dice "Conectá tu cuenta de Meta".
 *  - Anuncio por anuncio (Feed, Calendario, detalle de campaña, alcance, permisos) → /api/meta-ads?anuncios=1.
 *  - Agendas, asistidas y cierres → DATA.rows (el pipeline). "Pauta" = las agendas cuyo Origen está en la lista de
 *    orígenes de pauta (por defecto MASTERCLASS y WEBINAR). La lista se cambia desde la pantalla y se guarda con db.js.
 *  - Facturación atribuida → Monto de las agendas de pauta cerradas. ROAS = facturación / inversión.
 *  - Objetivos (CPL, CPL calificado, ROAS) → la proyección del webinar activo (Ajustes › Webinar).
 *  - Si Meta factura en otra moneda que la del cliente, el tipo de cambio se carga a mano y queda para todo el equipo.
 *  - Planificar (kanban) y la configuración de Audiencias → db.js (colecciones anun-plan, anun-config, anun-audiencias).
 *
 * El panel NO escribe en Meta: no pausa, no cambia presupuestos, no crea públicos. Audiencias arma el CSV cifrado para
 * subirlo a mano y deja la configuración del público similar lista para copiar.
 * Quedó afuera del hub original: el cash collected (salía de su CRM), Instagram, el dólar cripto, el Tracker y el Cerebro.
 */
(function () {
  'use strict';
  const VISTA = 'anuncios';
  const PER = 'anuncios';
  const COL_PLAN = 'anun-plan', COL_CONF = 'anun-config', COL_AUD = 'anun-audiencias';
  const ORIGENES_DEF = ['MASTERCLASS', 'WEBINAR'];
  const TABS = [
    { id: 'dashboard', texto: 'Dashboard', ico: 'grilla' },
    { id: 'feed', texto: 'Feed', ico: 'grilla2' },
    { id: 'calendario', texto: 'Calendario', ico: 'calendario' },
    { id: 'planificar', texto: 'Planificar', ico: 'objetivo' },
    { id: 'contactos', texto: 'Contactos', ico: 'usuarios' },
    { id: 'audiencias', texto: 'Audiencias', ico: 'usuario' },
  ];
  const ORDENES = [
    ['cpr', 'Mejor costo por resultado'], ['gasto', 'Más inversión'], ['resultados', 'Más resultados'],
    ['fatiga', 'Más fatigado'], ['video', 'Peor retención de video'],
  ];
  const ESTADOS_PLAN = [
    { id: 'planificada', titulo: 'Planificada', color: '#8a8a93' },
    { id: 'revision', titulo: 'En Revisión', color: '#f5b83d' },
    { id: 'activa', titulo: 'Activa', color: '#34d399' },
    { id: 'pausada', titulo: 'Pausada', color: '#f87171' },
  ];
  const OBJETIVOS = {
    OUTCOME_LEADS: 'Leads', LEAD_GENERATION: 'Leads', OUTCOME_ENGAGEMENT: 'Interacción', MESSAGES: 'Mensajes',
    OUTCOME_SALES: 'Ventas', CONVERSIONS: 'Conversión', OUTCOME_TRAFFIC: 'Tráfico', LINK_CLICKS: 'Tráfico',
    OUTCOME_AWARENESS: 'Reconocimiento', REACH: 'Alcance', VIDEO_VIEWS: 'Video', OUTCOME_APP_PROMOTION: 'App',
  };

  /* ════════ íconos que no están en ui-atlas.js ════════ */
  const ICOS = {
    grilla2: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>',
    moneda: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
    monedas: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    subeDer: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    bajaDer: '<path d="m7 7 10 10"/><path d="M17 7v10H7"/>',
    escudoOk: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    copiarMas: '<line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    menos: '<path d="M5 12h14"/>',
    trofeo: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  };
  const ico = (n, t = 16, c = '') => ICOS[n]
    ? `<svg class="ui-ico ${c}" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOS[n]}</svg>`
    : uiIco(n, t, c);

  /* ════════ estado ════════ */
  const ses = (k, v) => { try { if (v === undefined) return sessionStorage.getItem('anun:' + k); sessionStorage.setItem('anun:' + k, v); } catch (e) { } return null; };
  const S = {
    tab: TABS.some(t => t.id === ses('tab')) ? ses('tab') : 'dashboard',
    orden: ORDENES.some(o => o[0] === ses('orden')) ? ses('orden') : 'cpr',
    mes: null,
    q: '', abiertas: new Set(),
    cont: { estado: 'todas', q: '' },
    seq: 0,
    meta: {}, metaVal: {}, crea: {}, creaVal: {},
    plan: null, conf: null, aud: null,
    obj: null, mundo: null, mundoPedido: null,
  };

  /* ════════ formatos ════════ */
  const esc = (t) => uiEsc(t);
  const limpiarDec = (s) => s.replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');
  const decDe = (v) => { const a = Math.abs(v); return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3; };
  const n0 = (v) => (v == null || !isFinite(Number(v))) ? '—' : uiNum(v);
  const nd = (v, d) => (v == null || !isFinite(Number(v))) ? '—' : limpiarDec(uiNum(v, d));
  const pct = (v, d = 1) => (v == null || !isFinite(Number(v))) ? '—' : uiNum(v, d) + '%';
  // la parte de un total ("19,1% del gasto") con un decimal; lo que no es cero pero redondearía a
  // 0,0% sale "<0,1%" (un anuncio de US$ 2 entre US$ 5.000 no es el 0% del gasto)
  const pctParte = (p) => (p == null || !isFinite(Number(p))) ? '—' : p === 0 ? '0%' : p > 0 && p < 0.05 ? '<0,1%' : pct(p, 1);
  // tasas y conversiones: un decimal debajo de 10%, entero arriba, y "<0,1%" en vez de un 0 falso
  const pctFino = (p) => (p == null || !isFinite(Number(p))) ? '—' : p > 0 && p < 0.05 ? '<0,1%' : pct(p, p < 10 ? 1 : 0);
  // usd() conserva el nombre del hub original, pero va en la moneda del cliente (USD para casi todos)
  const MON = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';
  const pref = () => (MON() === 'USD' ? 'US$ ' : MON() + ' ');
  const usd = (v) => (v == null || !isFinite(Number(v))) ? '—' : pref() + limpiarDec(uiNum(v, decDe(v)));
  const nombreCliente = () => (window.MHQ && MHQ.cliente && MHQ.cliente.nombre) || 'el cliente';
  const div = (a, b) => (a != null && b != null && isFinite(a) && isFinite(b) && b !== 0) ? a / b : null;
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = (s.split(',').length > 2 || s.length - lc - 1 === 3) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (ld > -1) s = (s.split('.').length > 2 || s.length - ld - 1 === 3) ? s.replace(/\./g, '') : s;
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  const nom = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const fCorta = (s) => s ? uiFechaCorta(String(s).slice(0, 10)) : '—';
  const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const fLarga = (s) => { const d = uiF(s); return `${uiCap(DIAS_L[d.getDay()])} ${d.getDate()} de ${UI_MESES[d.getMonth()]}`; };

  /* ════════ plata: Meta factura en la moneda de la cuenta; todo se muestra en la del cliente ════════
     Si la cuenta de Meta factura en otra moneda, el tipo de cambio se carga a mano (anunTc) y queda para todo el equipo. */
  const tc = () => Number(S.conf && S.conf.tc) || 0;   // 1 <moneda del cliente> = tc <moneda de la cuenta>
  const aUsd = (v, moneda) => {
    if (v == null || !isFinite(Number(v))) return null;
    if ((moneda || MON()) === MON()) return Number(v);
    const t = tc(); return t > 0 ? Number(v) / t : null;
  };
  // monto de Meta: en la moneda del cliente si se puede; si no, en la de la cuenta
  const plata = (v, moneda) => {
    if (v == null || !isFinite(Number(v))) return '—';
    const u = aUsd(v, moneda);
    return u != null ? usd(u) : `${moneda || MON()} ${limpiarDec(uiNum(v, decDe(v)))}`;
  };

  /* ════════ deltas con polaridad (en la referencia un CPM que sube sale verde: acá no) ════════ */
  function claseDelta(p, pol) {
    if (p == null || !isFinite(p)) return null;
    if (Math.abs(p) < 0.05 || pol === 'neutro') return 'neutro';
    const sube = p > 0;
    return (pol === 'sube-mal' ? !sube : sube) ? 'bien' : 'mal';
  }
  // tip: líneas del tooltip (el valor de este período, el del anterior y la variación)
  function deltaBadge(p, pol, tip) {
    const c = claseDelta(p, pol); if (!c) return '';
    return `<span class="anun-dl ${c}"${tip ? tipAttr(tip) : ''}>${ico(p >= 0 ? 'subeDer' : 'bajaDer', 12)}${uiNum(Math.abs(p), 1)}%</span>`;
  }
  function deltaTxt(p, pol, tip) {
    const c = claseDelta(p, pol); if (!c) return '';
    return `<em class="anun-dt ${c}"${tip ? tipAttr(tip) : ''}>${ico(p >= 0 ? 'subeDer' : 'bajaDer', 11)}${uiNum(Math.abs(p), 1)}%</em>`;
  }

  /* ════════ pedidos (cacheados por rango; "Actualizar" los vacía) ════════ */
  async function pedir(url) {
    const r = await fetch(url);
    if (r.status === 401 && typeof mostrarGate === 'function' && typeof YO !== 'undefined' && YO) mostrarGate('Tu sesión se cerró: entrá de nuevo con tu link.');
    let j = null; try { j = await r.json(); } catch (e) { }
    return { status: r.status, ok: r.ok, j: j || {} };
  }
  function normMeta(j) {
    const c = j.cuenta || {};
    const campanas = (c.campanas || []).map(x => ({
      ...x, moneda: c.moneda,
      leadsU: Math.max(Number(x.leads) || 0, Number(x.leadsPixel) || 0),   // el mismo lead con dos nombres
    }));
    const suma = (k) => campanas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    return {
      generado: j.generado, aMedida: typeof j.rango === 'object',
      moneda: c.moneda || MON(), cuenta: c.nombre || 'Cuenta de Meta', campanas,
      gasto: suma('gasto'), impresiones: suma('impresiones'), clics: suma('clics'), leads: suma('leadsU'),
      conversaciones: suma('conversaciones'), visitas: suma('landings'), compras: suma('compras'), facturado: suma('facturado'),
      porDia: (c.porDia || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
      // los registros de la landing: {registros, calificados, respondieron, asignados, sinAsignar, cpl, cplCalificado, porDia}
      landing: j.landing || {},
    };
  }
  // Meta limita las consultas por cuenta publicitaria ("too many calls to this ad-account"): cada
  // respuesta se guarda 10 minutos también en la sesión del navegador (sobrevive a recargar) y, si
  // Meta pide esperar, se muestra la última consulta buena con el aviso en vez de una pantalla vacía.
  const MIN10 = 10 * 60 * 1000;
  const sesGet = (k) => { try { const x = JSON.parse(sessionStorage.getItem('anun:m:' + k) || 'null'); return x && x.v ? x : null; } catch (e) { return null; } };
  const sesSet = (k, v) => { try { sessionStorage.setItem('anun:m:' + k, JSON.stringify({ t: Date.now(), v })); } catch (e) { } };
  const esLimite = (m) => /too many calls|rate limit|request limit|User request limit/i.test(String(m || ''));
  // sin cuenta o sin token de Meta → {noConf, falta}, sin guardarlo: apenas se conecte, aparece
  function metaAds(desde, hasta) {
    const k = desde + '|' + hasta;
    const c = S.meta[k];
    if (c && Date.now() - c.t < MIN10) return c.p;
    const guardado = sesGet(k);
    if (guardado && Date.now() - guardado.t < MIN10) { S.metaVal[k] = guardado.v; const p0 = Promise.resolve(guardado.v); S.meta[k] = { t: guardado.t, p: p0 }; return p0; }
    const p = pedir(`/api/meta-ads?desde=${desde}&hasta=${hasta}&diario=1`).then(({ ok, j, status }) => {
      if (j.configurado === false) { delete S.meta[k]; return { noConf: true, falta: j.falta || [] }; }
      if (!ok || j.error) {
        const msg = j.detalle || j.error || ('HTTP ' + status);
        if (esLimite(msg) && guardado) { const v = Object.assign({}, guardado.v, { viejo: guardado.tOrig || guardado.t }); S.metaVal[k] = v; return v; }
        throw new Error(esLimite(msg) ? 'Meta pidió esperar: hubo demasiadas consultas a la cuenta publicitaria en poco tiempo. Se libera sola en unos minutos; después tocá Actualizar.' : msg);
      }
      const v = normMeta(j); S.metaVal[k] = v; sesSet(k, v); return v;
    });
    S.meta[k] = { t: Date.now(), p };
    p.catch(() => { delete S.meta[k]; });
    return p;
  }
  // {falta:true, faltan} si Meta no está conectado (tampoco se guarda)
  function metaCreativos(desde, hasta) {
    const k = desde + '|' + hasta;
    const c = S.crea[k];
    if (c && Date.now() - c.t < MIN10) return c.p;
    const kc = 'c:' + k, guardado = sesGet(kc);
    if (guardado && Date.now() - guardado.t < MIN10) { S.creaVal[k] = guardado.v; const p0 = Promise.resolve(guardado.v); S.crea[k] = { t: guardado.t, p: p0 }; return p0; }
    const p = pedir(`/api/meta-ads?anuncios=1&desde=${desde}&hasta=${hasta}`).then(({ ok, j, status }) => {
      if (j.configurado === false) { delete S.crea[k]; return { falta: true, faltan: j.falta || [] }; }
      if (!ok || j.error) {
        const msg = j.detalle || j.error || ('HTTP ' + status);
        if (esLimite(msg) && guardado) return Object.assign({}, guardado.v, { viejo: guardado.tOrig || guardado.t });
        return { error: esLimite(msg) ? 'Meta pidió esperar (demasiadas consultas a la cuenta). Probá en unos minutos.' : msg };
      }
      sesSet(kc, j);
      return j;
    }).catch(e => ({ error: String(e.message || e) })).then(v => { if (!v.falta) S.creaVal[k] = v; return v; });
    S.crea[k] = { t: Date.now(), p };
    return p;
  }
  async function cargarConf() {
    if (S.conf) return S.conf;
    try { const d = await dbLista(COL_CONF); S.conf = d.find(x => x.id === 'atribucion') || {}; } catch (e) { S.conf = {}; }
    return S.conf;
  }
  // los objetivos del webinar activo (su proyección): CPL, CPL calificado y ROAS
  async function cargarObjetivos() {
    if (S.obj) return S.obj;
    const id = window.MHQ && MHQ.webinarActivo;
    try { const j = id ? await apiApp('webinar', { id }) : null; S.obj = j ? { nombre: j.webinar.nombre, p: j.proyeccion || {} } : {}; }
    catch (e) { S.obj = {}; }
    return S.obj;
  }

  /* ════════ agendas de pauta (DATA.rows) ════════ */
  const filas = () => (typeof DATA !== 'undefined' && DATA && DATA.rows) || [];
  // "hay" = ya llegó el pipeline, aunque esté vacío (base.js arranca con un DATA sin `ok`)
  const hayAgendas = () => !!(typeof DATA !== 'undefined' && DATA && DATA.ok);
  const normO = (o) => String(o || '').trim().toUpperCase();
  const origenesPauta = () => (S.conf && Array.isArray(S.conf.origenes) && S.conf.origenes.length) ? S.conf.origenes : ORIGENES_DEF;
  const esPauta = (r) => origenesPauta().includes(normO(r.Origen));
  const fechaCall = (r) => String(r['Fecha call'] || '').slice(0, 10);
  function agendas(r) {
    const todas = filas().filter(x => uiEnRango(fechaCall(x), r));
    const pauta = todas.filter(esPauta);
    const cierres = pauta.filter(x => x.Estado === 'Cerrada');
    return {
      todas, pauta, cierres,
      asis: pauta.filter(x => ['Presentada', 'Cerrada'].includes(x.Estado)),
      sinOrigen: todas.filter(x => !normO(x.Origen)),
      sinMonto: cierres.filter(x => !num(x.Monto)),
      fact: cierres.reduce((s, x) => s + num(x.Monto), 0),
    };
  }
  // Las cuentas de agendas van con las calls que YA ocurrieron (hasta hoy): es el mismo corte que el
  // gasto de Meta (se pide hasta hoy) y que el período anterior "a igual día" (1 al 14-sep si hoy es
  // 14-oct). Contar las agendadas para el resto del mes comparaba ventanas distintas y bajaba las tasas
  // de show-up y cierre con calls que todavía no pasaron. Las que vienen se informan aparte (futuras).
  const rangoHoy = (r) => ({ desde: r.desde, hasta: r.hastaHoy || r.hasta });
  const cortaHoy = (r) => !!r.hastaHoy && r.hastaHoy < r.hasta;
  function futuras(r) {
    if (!cortaHoy(r)) return [];
    return filas().filter(x => esPauta(x) && fechaCall(x) > r.hastaHoy && fechaCall(x) <= r.hasta)
      .sort((a, b) => fechaCall(a).localeCompare(fechaCall(b)));
  }
  const lineaFuturas = (F) => F.length ? `Y ${uiNum(F.length)} agenda${F.length === 1 ? '' : 's'} de pauta más con call después de hoy: entra${F.length === 1 ? '' : 'n'} cuando pase la call` : '';

  /* ════════ interacción (14-oct-2026) ════════
     Todo lo que es dato responde al mouse con el tooltip universal de ui-atlas.js (data-tip: la 1ª
     línea va en negrita) y, donde hay filas detrás del número, el clic abre el detalle en un modal.
     Los tooltips usan los mismos datos y formatos que ya muestra la pantalla: nada inventado. */
  const plano = (h) => String(h == null ? '' : h).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const tipAttr = (lineas) => {
    const t = (Array.isArray(lineas) ? lineas : [lineas]).map(l => (l == null ? '' : String(l))).filter(l => l.trim() && l.trim() !== '—').join('\n')
      .replace(/(US\$|[A-Z]{3}) (?=[\d−-])/g, '$1\u00a0');
    return t ? ` data-tip="${esc(t)}"` : '';
  };
  const signo = (p) => (p >= 0 ? '▲ +' : '▼ −') + uiNum(Math.abs(p), 1) + '%';
  const tipFuera = () => { if (typeof uiTipOcultar === 'function') uiTipOcultar(); };   // al abrir un modal
  // clic en algo que no es <button>: también con Enter / espacio
  const clicAttr = (js) => ` role="button" tabindex="0" onclick="${js}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"`;
  // "Este mes: US$ 1.200 · Mes ant. a igual día: US$ 900 · ▲ +33,3% · peor": la variación con los dos valores
  function lineasVs(r, ahora, antes, p, pol) {
    if (antes == null || antes === '—' || p == null || !isFinite(p)) return [];
    const c = claseDelta(p, pol);
    return [`${r.etiqueta}: ${ahora}`, `${uiCap(r.nombreAnt)}: ${antes}`, signo(p) + (c === 'bien' ? ' · mejor' : c === 'mal' ? ' · peor' : '')];
  }
  // eje Y de plata: abreviado (1,2M · 345k · 2.582) y con decimales si los montos son chicos, para que
  // las marcas no se repitan ("US$ 2 / US$ 2" con un máximo de 3)
  const fmtEjePlata = (valores, prefijo) => {
    const m = Math.max(0, ...(valores || []).map(Number).filter(isFinite));
    const dec = m < 4 ? 2 : m < 40 ? 1 : 0;
    return (n) => prefijo + (dec ? nd(n, dec) : uiCorto(n));
  };
  // Meta no devuelve los días sin entrega: adentro del tramo con datos se completan con 0
  function diasCompletos(porDia) {
    const l = (porDia || []).filter(d => d && d.fecha).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (l.length < 2) return l;
    const por = new Map(l.map(d => [d.fecha, d]));
    const out = [];
    for (let f = l[0].fecha, k = 0; f <= l[l.length - 1].fecha && k < 800; f = uiSumarDias(f, 1), k++) out.push(por.get(f) || { fecha: f, gasto: 0, impresiones: 0, clics: 0 });
    return out;
  }

  /* ════════ gráficos chicos ════════ */
  let gid = 0;
  const DIAS_G = {};   // id del gráfico → fechas de cada punto (el clic abre ese día)
  // sparkline de Inversión: la curva interactiva del sistema de diseño (línea vertical + punto +
  // tooltip con la fecha, el gasto y su parte del total). El clic abre el día (anunDia).
  function sparkGasto(act) {
    const dias = diasCompletos(act.porDia);
    if (dias.length < 2 || !dias.some(d => d.gasto > 0) || typeof uiSparkArea !== 'function') return '';
    const total = dias.reduce((s, d) => s + (d.gasto || 0), 0);
    const html = uiSparkArea(dias.map(d => d.gasto || 0), 'verde', {
      etiquetas: dias.map(d => fLarga(d.fecha)),
      fmt: (n) => plata(n, act.moneda) + (total > 0 ? ' · ' + pctParte(n / total * 100) + ' del total' : ''),
      nombre: 'Gasto',
    });
    const m = html.match(/data-g="([^"]+)"/);
    if (m) DIAS_G[m[1]] = dias.map(d => d.fecha);
    return html;
  }
  window.anunSparkDia = (e, el) => {
    const g = el && el.querySelector('.ui-graf'), plot = el && el.querySelector('.ui-g-plot');
    const fechas = g && DIAS_G[g.dataset.g]; if (!fechas || !plot) return;
    const r = plot.getBoundingClientRect(), n = fechas.length;
    const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / r.width * (n - 1))));
    tipFuera();
    anunDia(fechas[i]);
  };
  // la del Feed: segmentos rectos, sin relleno (como la referencia), pero enchufada al mismo motor de hover
  // que el resto (UI_GRAF de ui-atlas.js): línea vertical + punto + tooltip con fecha y valor.
  // Va con <span> porque vive adentro del <button> de la tarjeta.
  function sparkRecta(valores, o = {}) {
    const v = (valores || []).map(Number).map(n => (isFinite(n) ? n : 0));
    if (v.length < 2) return '';
    const W = 240, H = o.alto || 21, max = Math.max(...v), min = Math.min(...v);
    const ys = v.map(n => H - 2 - ((n - min) / ((max - min) || 1)) * (H - 4));
    const d = 'M' + v.map((n, i) => `${(i / (v.length - 1) * W).toFixed(1)},${ys[i].toFixed(1)}`).join(' L');
    const id = 'anunsr' + (++gid);
    const et = o.etiquetas && o.etiquetas.length === v.length ? o.etiquetas : v.map((_, i) => '#' + (i + 1));
    if (typeof UI_GRAF === 'undefined') return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="#fb7185" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
    UI_GRAF[id] = { tipo: 'spark', etiquetas: et, fmt: o.fmt || uiNum, flotante: true,
      series: [{ nombre: o.nombre || '', color: 'anunrosa', valores: v, yPct: ys.map(y => y / H * 100) }] };
    return `<span class="ui-graf ui-spk anun-sr" data-g="${id}"><span class="ui-g-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ui-g-linea" pathLength="1" d="${d}" fill="none" stroke="#fb7185" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span class="ui-g-hover"><i class="ui-g-vl"></i></span></span></span>`;
  }

  /* ════════ piezas ════════ */
  function aviso(html, tipo = 'ambar') {
    return `<div class="anun-aviso ${tipo}">${uiIco(tipo === 'azul' ? 'info' : 'alerta', 14)}<span>${html}</span></div>`;
  }
  function vacio(o) {
    return `<div class="anun-vacio">${o.ico ? ico(o.ico, 26) : ''}<b>${esc(o.titulo || '')}</b>${o.texto ? `<span>${o.texto}</span>` : ''}${o.pasos ? `<ol class="anun-pasos">${o.pasos.map(p => `<li>${p}</li>`).join('')}</ol>` : ''}${o.boton || ''}</div>`;
  }
  const FALTA_CREA = 'Conectá tu cuenta de Meta en Integraciones para ver los anuncios uno por uno.';
  // sin cuenta o sin token de Meta: qué falta y dónde se carga (falta = lo que dice /api/meta-ads: 'cuenta', 'token')
  function conectar(falta) {
    const f = falta && falta.length ? falta : ['cuenta', 'token'];
    const pasos = [];
    if (f.includes('cuenta')) pasos.push('El ID de la cuenta publicitaria: <code>act_</code> y el número que figura arriba a la izquierda en el Administrador de anuncios.');
    if (f.includes('token')) pasos.push('Un token con permiso <code>ads_read</code> (de un usuario del sistema del Business Manager). No es el token de la API de conversiones de la landing.');
    return vacio({ ico: 'link', titulo: 'Conectá tu cuenta de Meta', texto: 'Para ver el gasto, el CPL real y cada anuncio, cargá en Integraciones:', pasos,
      boton: `<button type="button" class="anun-btnpri" onclick="location.hash='#conexiones'">${uiIco('der', 14)}Ir a Integraciones</button>` });
  }
  // o.tip: líneas del tooltip del número grande · o.spark: curva interactiva (clic = abrir el día)
  function kpi(o) {
    return `<div class="anun-kpi c-${o.color}">
      <div class="anun-kpi-top"><span class="anun-kpi-ico">${ico(o.ico, 19)}</span>${o.delta || ''}</div>
      <div class="anun-kpi-t">${esc(o.titulo)}</div>
      <div class="anun-kpi-s">${esc(o.sub)}</div>
      <div class="anun-kpi-v"${o.tip ? tipAttr(o.tip) : ''}>${o.valor}</div>
      ${o.pie ? `<div class="anun-kpi-pie">${o.pie}</div>` : ''}
      ${o.spark ? `<div class="anun-kpi-spark" onclick="anunSparkDia(event,this)">${o.spark}</div>` : ''}
      ${o.extra || ''}
    </div>`;
  }
  // tooltip de la celda: etiqueta · valor · qué mide (una línea o varias) · la comparación con el
  // período anterior; o.clic: lo que abre (las filas detrás del número)
  function celda(o) {
    const tip = [o.etq, plano(o.valor), ...(Array.isArray(o.tip) ? o.tip : [o.tip]), ...(o.vs || []), o.clic ? o.clicTxt || 'Clic: ver el detalle' : ''];
    return `<div class="anun-sec-c${o.apagada ? ' apagada' : ''}${o.clic ? ' clic' : ''}"${tipAttr(tip)}${o.clic ? clicAttr(o.clic) : ''}>
      <span>${esc(o.etq)}</span><b>${o.valor}</b>${o.delta || ''}</div>`;
  }
  // uiListaB (ui-atlas.js) con dos ajustes mientras no lleguen al componente compartido: la fila bajo
  // el mouse resalta y el resto se atenúa (.anun-lb en ads.css), y el % lleva decimal debajo de 10%
  // ("0,1%", "<0,1%") en vez de redondear a entero (5 leads de 5.000 daban "0%"). Se corrige fila por
  // fila y solo donde vino un entero: con el arreglo ya hecho en el componente, el resultado es el mismo.
  function listaB(filasL, op = {}) {
    let h = uiListaB(filasL, op);
    if (!op.sinPct && filasL && filasL.length) {
      const total = op.total != null ? op.total : filasL.reduce((a, x) => a + (Number(x.valor) || 0), 0);
      const pcts = filasL.map(x => (x.pct != null ? x.pct : (total ? (Number(x.valor) || 0) / total * 100 : 0)));
      const partes = h.split(/(?=<button type="button" class="ui-lb-f|<div class="ui-lb-f")/);
      if (partes.length === filasL.length + 1) {
        h = partes.map((p, k) => (k === 0 ? p : p
          .replace(/( data-tip="[^"]*) · \d+%"/, (m, ini) => `${ini} · ${esc(pctFino(pcts[k - 1]))}"`)
          .replace(/<span class="ui-lb-p">\d+%<\/span>/, `<span class="ui-lb-p">${esc(pctFino(pcts[k - 1]))}</span>`))).join('');
      }
    }
    return `<div class="anun-lb">${h}</div>`;
  }
  const vistaActiva = () => (location.hash || '').slice(1) === VISTA;

  /* ════════ armazón: pestañas + cabecera ════════ */
  function tabsHtml() {
    return `<div class="anun-tabs" role="tablist">${TABS.map(t =>
      `<button type="button" role="tab" class="anun-tab${t.id === S.tab ? ' on' : ''}" data-tab="${t.id}" onclick="anunTab('${t.id}')">${ico(t.ico, 16)}${esc(t.texto)}</button>`).join('')}</div>`;
  }
  function cabecera() {
    if (!vistaActiva()) return;
    const ex = document.getElementById('pageExtra'); if (!ex) return;
    const act = `<button type="button" class="anun-btn2" onclick="anunActualizar()" title="Volver a pedir los datos a Meta">${uiIco('refrescar', 14)}Actualizar</button>`;
    let h = '';
    if (S.tab === 'feed') h += `<select class="anun-sel" onchange="anunOrden(this.value)" aria-label="Ordenar por">${ORDENES.map(([id, t]) => `<option value="${id}"${id === S.orden ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    if (['dashboard', 'feed', 'contactos'].includes(S.tab)) h += uiPeriodo(PER, 'anunPeriodo') + act;
    if (S.tab === 'calendario') {
      const [y, m] = mesCal().split('-').map(Number);
      const hoyM = uiHoyAR().slice(0, 7);
      h += `<div class="anun-mesnav"><button type="button" onclick="anunMes(-1)" aria-label="Mes anterior">${uiIco('izq', 16)}</button><b>${uiCap(UI_MESES[m - 1])} ${y}</b><button type="button" onclick="anunMes(1)" aria-label="Mes siguiente"${mesCal() >= hoyM ? ' disabled' : ''}>${uiIco('der', 16)}</button></div>`;
    }
    if (S.tab === 'planificar') h += `<button type="button" class="anun-btnpri" onclick="anunPlanNuevo()">${uiIco('mas', 14)}Nueva Campaña</button>`;
    if (S.tab === 'audiencias') h += act;
    ex.innerHTML = h;
  }
  function render() {
    const caja = document.getElementById(VISTA); if (!caja) return;
    if (!caja.querySelector(':scope > .anun')) caja.innerHTML = `<div class="anun">${tabsHtml()}<div id="anunCuerpo" class="anun-cuerpo"></div></div>`;
    pintarTab();
  }
  async function pintarTab() {
    const cuerpo = document.getElementById('anunCuerpo'); if (!cuerpo) return;
    const seq = ++S.seq;
    document.querySelectorAll('#' + VISTA + ' .anun-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    cabecera();
    try {
      await Promise.all([cargarConf(), cargarObjetivos()]);
      if (seq !== S.seq) return;
      const fn = { dashboard: tabDashboard, feed: tabFeed, calendario: tabCalendario, planificar: tabPlanificar, contactos: tabContactos, audiencias: tabAudiencias }[S.tab];
      await fn(cuerpo, seq);
    } catch (e) {
      console.warn('[anuncios]', e);
      if (seq === S.seq) cuerpo.innerHTML = vacio({ ico: 'alerta', titulo: 'No pude armar esta pestaña', texto: esc(e.message || e), boton: `<button type="button" class="anun-btn2" onclick="anunActualizar()">${uiIco('refrescar', 14)}Reintentar</button>` });
    }
  }
  const vivo = (seq) => seq === S.seq && vistaActiva();

  /* ═══════════════════════════════ DASHBOARD ═══════════════════════════════ */
  function esqueletoDash() {
    const t = (c, i, ti, su) => kpi({ color: c, ico: i, titulo: ti, sub: su, valor: '<span class="anun-cargando">…</span>' });
    return `<div class="anun-dash">
      <div class="anun-fila-chip"><span class="anun-moneda">Consultando Meta…</span></div>
      <div class="anun-kpis">${t('verde', 'billetera', 'Inversión', 'Total gastado en pauta')}${t('rojo', 'usuarios', 'CPL real', 'Inversión / registros de la landing')}${t('gold', 'objetivo', 'CPL calificado', 'Inversión / registros calificados')}${t('violeta', 'sube', 'ROAS', 'Facturación / Inversión')}</div>
    </div>`;
  }
  async function tabDashboard(cuerpo, seq) {
    const r = uiPerRango(PER);
    if (!cuerpo.querySelector('.anun-dash')) cuerpo.innerHTML = esqueletoDash();
    let act, prev;
    try {
      [act, prev] = await Promise.all([metaAds(r.desde, r.hastaHoy), metaAds(r.previo.desde, r.previo.hasta).catch(() => null)]);
    } catch (e) {
      if (!vivo(seq)) return;
      cuerpo.innerHTML = vacio({ ico: 'alerta', titulo: 'No pude leer Meta', texto: esc(e.message || e), boton: `<button type="button" class="anun-btn2" onclick="anunActualizar()">${uiIco('refrescar', 14)}Reintentar</button>` });
      return;
    }
    if (!vivo(seq)) return;
    if (act.noConf) { cuerpo.innerHTML = conectar(act.falta); return; }
    const k = r.desde + '|' + r.hastaHoy;
    cuerpo.innerHTML = dashHtml(r, act, prev, S.creaVal[k]);
    if (!S.creaVal[k]) {
      const crea = await metaCreativos(r.desde, r.hastaHoy);
      if (vivo(seq)) cuerpo.innerHTML = dashHtml(r, act, prev, crea);
    }
  }
  function dashHtml(r, act, prev, crea) {
    const mon = act.moneda;
    const sinTc = mon !== MON() && !(tc() > 0);
    const prevOk = !!(prev && prev.aMedida);
    const inv = aUsd(act.gasto, mon), invPrev = prevOk ? aUsd(prev.gasto, prev.moneda) : null;
    // agendas con call hasta hoy (el mismo corte que el gasto y que el período anterior); las que vienen, aparte
    const A = agendas(rangoHoy(r)), P = agendas(r.previo), F = futuras(r);
    const hay = hayAgendas();
    const roas = inv > 0 && hay ? A.fact / inv : null;
    const roasP = invPrev > 0 && hay ? P.fact / invPrev : null;
    const cpa = inv != null && A.cierres.length ? inv / A.cierres.length : null;
    const cpaP = invPrev != null && P.cierres.length ? invPrev / P.cierres.length : null;
    const v = (a, b) => (a == null || b == null) ? null : uiVar(a, b);
    const okCrea = crea && !crea.falta && !crea.error;
    // la variación de un costo de Meta es la misma en una moneda que en otra (el tipo de cambio se cancela): se
    // calcula en la moneda de la cuenta, así no se pierde cuando falta el tipo de cambio
    const vCosto = (den, denP) => (prevOk && prev.moneda === mon && den && denP) ? uiVar(act.gasto / den, prev.gasto / denP) : null;
    const hora = (iso) => new Date(iso || Date.now()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const horaAct = hora(act.generado), horaCrea = okCrea && crea.generado ? hora(crea.generado) : null;
    // los registros de la landing (CPL real y calificado) y los objetivos del webinar activo
    const L = act.landing, LP = prevOk ? prev.landing : {};
    const nReg = L.registros || 0, nCal = L.calificados || 0;
    const O = (S.obj && S.obj.p) || {};
    const cuantos = (n, u1, uN) => `${uiNum(n)} ${n === 1 ? u1 : uN}`;

    // ── chip de moneda + línea de consulta ──
    const chip = mon === MON() ? `<span class="anun-moneda">${esc(mon)}</span>`
      : sinTc ? `<button type="button" class="anun-moneda falta" onclick="anunTc()">${uiIco('alerta', 12)}${esc(mon)} · cargá el tipo de cambio para ver todo en ${esc(MON())}</button>`
        : `<button type="button" class="anun-moneda" onclick="anunTc()" title="Cambiar el tipo de cambio">${esc(MON())} · convertido de ${esc(mon)} a ${uiNum(tc())}</button>`;
    // las dos consultas a Meta (por campaña y anuncio por anuncio) se guardan aparte y pueden ser de
    // horas distintas: si lo son, se dicen las dos (por eso las impresiones pueden no coincidir)
    const info = `${esc(act.cuenta)} · consultado ${esc(horaAct)}${horaCrea && horaCrea !== horaAct ? ` · anuncio por anuncio ${esc(horaCrea)}` : ''} · solo lectura, el panel no toca las campañas`;

    // ── 4 tarjetas ──
    const conGasto = act.porDia.filter(d => d.gasto > 0);
    const pico = conGasto.slice().sort((a, b) => b.gasto - a.gasto)[0];
    const tInv = kpi({
      color: 'verde', ico: 'billetera', titulo: 'Inversión', sub: 'Total gastado en pauta',
      valor: plata(act.gasto, mon), spark: sparkGasto(act),
      delta: deltaBadge(v(act.gasto, prevOk ? prev.gasto : null), 'neutro', ['Inversión', ...lineasVs(r, plata(act.gasto, mon), prevOk ? plata(prev.gasto, prev.moneda) : null, v(act.gasto, prevOk ? prev.gasto : null), 'neutro')]),
      tip: ['Inversión', plata(act.gasto, mon), mon !== MON() && !sinTc ? `${mon} ${uiNum(act.gasto)} al tipo de cambio ${uiNum(tc())}` : '',
        conGasto.length ? `${cuantos(conGasto.length, 'día', 'días')} con gasto · promedio ${plata(act.gasto / conGasto.length, mon)} por día` : '',
        pico ? `Día pico: ${fLarga(pico.fecha)} · ${plata(pico.gasto, mon)}` : ''],
      pie: sinTc ? `<span class="anun-kpi-nota">${esc(mon)} · sin tipo de cambio</span>` : '',
    });
    // la línea de objetivo: la proyección del webinar activo; en verde si se cumple, en rojo si no
    const objetivo = (k, val, ok) => val == null ? '' : `<div class="anun-kpi-obj"><span>OBJETIVO</span><b class="${ok == null ? '' : ok ? 'bien' : 'mal'}"${tipAttr([`Objetivo de ${k}: ${val}`,
      S.obj && S.obj.nombre ? `Proyección de "${S.obj.nombre}" (Ajustes › Webinar)` : 'Proyección del webinar activo', ok == null ? '' : ok ? 'Se está cumpliendo' : 'Todavía no se cumple'])}>${val}</b></div>`;
    // un costo por unidad (CPL real, CPL calificado): el valor, el del período anterior y la variación
    const costoU = (n, nP) => ({ txt: n ? usdOMon(div(inv, n), act.gasto / n, mon) : null, val: n ? div(inv, n) : null,
      txtP: prevOk && nP ? usdOMon(div(invPrev, nP), prev.gasto / nP, prev.moneda) : null, vr: vCosto(n, nP) });
    const cR = costoU(nReg, LP.registros), cC = costoU(nCal, LP.calificados);
    const tCpl = kpi({
      color: 'rojo', ico: 'usuarios', titulo: 'CPL real', sub: 'Inversión / registros de la landing',
      valor: cR.txt || '<span class="anun-raya">—</span>',
      delta: deltaBadge(cR.vr, 'sube-mal', ['CPL real', ...lineasVs(r, cR.txt, cR.txtP, cR.vr, 'sube-mal')]),
      tip: ['CPL real', nReg ? `${cR.txt} por registro` : 'Sin registros en el período', nReg ? `${plata(act.gasto, mon)} invertidos / ${cuantos(nReg, 'registro', 'registros')} de la landing` : '',
        act.leads ? `Meta cuenta ${cuantos(act.leads, 'lead', 'leads')}: CPL Meta ${usdOMon(div(inv, act.leads), act.gasto / act.leads, mon)}` : ''],
      pie: `<span class="anun-kpi-n">${cuantos(nReg, 'registro', 'registros')}</span>`,
      extra: objetivo('CPL', O.cpl != null ? usd(O.cpl) : null, O.cpl != null && cR.val != null ? cR.val <= O.cpl : null),
    });
    const tCplc = kpi({
      color: 'gold', ico: 'objetivo', titulo: 'CPL calificado', sub: 'Inversión / registros calificados',
      valor: cC.txt || '<span class="anun-raya">—</span>',
      delta: deltaBadge(cC.vr, 'sube-mal', ['CPL calificado', ...lineasVs(r, cC.txt, cC.txtP, cC.vr, 'sube-mal')]),
      tip: ['CPL calificado', nCal ? `${cC.txt} por calificado` : 'Sin calificados en el período', nCal ? `${plata(act.gasto, mon)} invertidos / ${cuantos(nCal, 'calificado', 'calificados')}` : '',
        nReg ? `Calificó el ${pctFino(nCal / nReg * 100)} de los registros · ${cuantos(L.respondieron || 0, 'respondió', 'respondieron')} las preguntas` : ''],
      pie: `<span class="anun-kpi-n">${cuantos(nCal, 'calificado', 'calificados')}${nReg ? ' · ' + pctFino(nCal / nReg * 100) : ''}</span>`,
      extra: objetivo('CPL calificado', O.cplCalificado != null ? usd(O.cplCalificado) : null, O.cplCalificado != null && cC.val != null ? cC.val <= O.cplCalificado : null),
    });
    const roasObj = O.entrada && O.entrada.roasObjetivo;
    const tRoas = kpi({
      color: 'violeta', ico: 'sube', titulo: 'ROAS', sub: 'Facturación / Inversión',
      valor: roas != null ? nd(roas, 2) + 'x' : '—',
      delta: deltaBadge(v(roas, roasP), 'sube-bien', ['ROAS', ...lineasVs(r, roas != null ? nd(roas, 2) + 'x' : null, roasP != null ? nd(roasP, 2) + 'x' : null, v(roas, roasP), 'sube-bien')]),
      tip: ['ROAS', roas != null ? `${usd(A.fact)} facturados / ${usd(inv)} invertidos` : sinTc ? 'Hace falta el tipo de cambio: el gasto está en ' + mon : !hay ? 'Cargando las agendas…' : 'Sin inversión en el período',
        roas != null ? `Por cada ${MON() === 'USD' ? 'dólar' : MON()} de pauta volvieron ${usd(roas)} en contratos` : sinTc && hay ? `Facturación ${usd(A.fact)} · inversión ${plata(act.gasto, mon)}` : ''],
      pie: sinTc ? '<span class="anun-kpi-nota">hace falta el tipo de cambio</span>' : !hay ? '<span class="anun-kpi-nota">cargando agendas…</span>'
        : `<span class="anun-kpi-n">${usd(A.fact)} en ${cuantos(A.cierres.length, 'cierre', 'cierres')}</span>`,
      extra: objetivo('ROAS', roasObj ? nd(roasObj, 2) + 'x' : null, roasObj && roas != null ? roas >= roasObj : null),
    });
    // costo por cierre: en la moneda del cliente si se puede; si no, en la de la cuenta (igual que la etapa CPA)
    const nCi = A.cierres.length;
    const cpaTxt = nCi ? usdOMon(cpa, act.gasto / nCi, mon) : null;
    const cpaPTxt = prevOk && P.cierres.length ? usdOMon(cpaP, prev.gasto / P.cierres.length, prev.moneda) : null;
    const vCpa = vCosto(nCi, P.cierres.length);

    // ── métricas secundarias ──
    const ctr = div(act.clics, act.impresiones), ctrP = prevOk ? div(prev.clics, prev.impresiones) : null;
    const cpm = div(inv, act.impresiones / 1000), cpmP = prevOk ? div(invPrev, prev.impresiones / 1000) : null;
    const cpl = div(inv, act.leads), cplP = prevOk ? div(invPrev, prev.leads) : null;
    const cpc = div(inv, act.clics), cpcP = prevOk ? div(invPrev, prev.clics) : null;
    const pv = (k) => (prevOk ? Number(prev[k]) || 0 : 0);
    const vCpl = vCosto(act.leads, pv('leads')), vCpm = vCosto(act.impresiones / 1000, pv('impresiones') / 1000), vCpc = vCosto(act.clics, pv('clics'));
    const cuentaC = okCrea ? crea.cuenta || {} : {};
    const conOrigen = A.todas.length ? 100 * (A.todas.length - A.sinOrigen.length) / A.todas.length : null;
    const convLanding = act.visitas ? nReg / act.visitas * 100 : null;
    const faltaTip = !crea ? 'Leyendo anuncio por anuncio…' : crea.falta ? 'Meta no está conectado' : crea.error ? 'Meta no lo devolvió: ' + crea.error : '';
    // el mismo costo en el período anterior (en la moneda del cliente si se puede; si no, en la de la cuenta)
    const costoPrev = (vUsd, den) => prevOk && den ? usdOMon(vUsd, prev.gasto / den, prev.moneda) : null;
    // un conteo contra el período anterior: el texto de la variación y las líneas del tooltip
    const dN = (a, b, pol) => (prevOk ? deltaTxt(uiVar(a, b), pol) : '');
    const vsN = (a, b, pol) => (prevOk ? lineasVs(r, n0(a), n0(b), uiVar(a, b), pol) : []);
    // Alcance y Frecuencia salen de la consulta anuncio por anuncio; CTR y CPM, de la de campañas. Son
    // dos consultas guardadas a horas distintas: cada tooltip dice de cuál sale y, si las impresiones
    // no coinciden, cuántas tiene la otra.
    const notaCrea = horaCrea && horaCrea !== horaAct ? `Consulta anuncio por anuncio de las ${horaCrea}` : '';
    const imprDifieren = okCrea && cuentaC.impresiones > 0 && cuentaC.impresiones !== act.impresiones;
    const notaImprCamp = imprDifieren ? `El CTR y el CPM usan la consulta por campaña${horaCrea !== horaAct ? ` de las ${horaAct}` : ''}: ${n0(act.impresiones)} impresiones` : '';
    const notaImprCrea = imprDifieren ? `La Frecuencia usa la consulta anuncio por anuncio${horaCrea !== horaAct ? ` de las ${horaCrea}` : ''}: ${n0(cuentaC.impresiones)} impresiones` : '';
    const hastaHoyTxt = cortaHoy(r) ? ', hasta hoy' : '', conCallHoy = cortaHoy(r) ? ' con call hasta hoy' : '';
    const sec = [
      { etq: 'Registros', valor: n0(nReg), delta: dN(nReg, LP.registros, 'sube-bien'), tip: 'Registros de la landing en el período (todos los webinars)',
        vs: vsN(nReg, LP.registros, 'sube-bien'), clic: nReg ? "anunEtapa('cpl')" : '', clicTxt: 'Clic: los registros por campaña' },
      { etq: 'Calificados', valor: n0(nCal), delta: dN(nCal, LP.calificados, 'sube-bien'), tip: ['Registros que calificaron en las preguntas del form', nReg ? `${pctFino(nCal / nReg * 100)} de los registros` : ''],
        vs: vsN(nCal, LP.calificados, 'sube-bien'), clic: nCal ? "anunEtapa('cplc')" : '', clicTxt: 'Clic: los calificados por campaña' },
      { etq: 'Visitas landing', valor: n0(act.visitas), delta: dN(act.visitas, pv('visitas'), 'sube-bien'), tip: 'Visitas a la landing desde los anuncios (landing_page_view de Meta)',
        vs: vsN(act.visitas, pv('visitas'), 'sube-bien') },
      { etq: 'Conv. landing', valor: convLanding != null ? pctFino(convLanding) : '—', apagada: convLanding == null,
        tip: [`Registros / visitas a la landing: ${n0(nReg)} / ${n0(act.visitas)}`, 'Los registros incluyen a los que llegan sin anuncio: sirve para ver la tendencia'] },
      { etq: 'Leads Meta', valor: n0(act.leads), delta: dN(act.leads, pv('leads'), 'sube-bien'), tip: 'Leads que reporta Meta (formulario o píxel, sin contar dos veces el mismo)',
        vs: vsN(act.leads, pv('leads'), 'sube-bien'), clic: act.leads ? "anunEtapa('leads')" : '', clicTxt: 'Clic: los leads por campaña' },
      { etq: 'CPL Meta', valor: usdOMon(cpl, act.leads ? act.gasto / act.leads : null, mon), delta: deltaTxt(vCpl, 'sube-mal'), tip: `Inversión / leads de Meta: ${plata(act.gasto, mon)} / ${n0(act.leads)}`,
        vs: lineasVs(r, usdOMon(cpl, act.leads ? act.gasto / act.leads : null, mon), costoPrev(cplP, pv('leads')), vCpl, 'sube-mal') },
      { etq: 'CTR', valor: pct(ctr != null ? ctr * 100 : null, 2), delta: deltaTxt(v(ctr, ctrP), 'sube-bien'), tip: [`Clics / impresiones: ${n0(act.clics)} / ${n0(act.impresiones)}`, notaImprCrea],
        vs: lineasVs(r, pct(ctr != null ? ctr * 100 : null, 2), ctrP != null ? pct(ctrP * 100, 2) : null, v(ctr, ctrP), 'sube-bien') },
      { etq: 'CPM', valor: usdOMon(cpm, act.impresiones ? act.gasto / act.impresiones * 1000 : null, mon), delta: deltaTxt(vCpm, 'sube-mal'), tip: [`Costo cada mil impresiones (${n0(act.impresiones)} impresiones)`, notaImprCrea],
        vs: lineasVs(r, usdOMon(cpm, act.impresiones ? act.gasto / act.impresiones * 1000 : null, mon), prevOk && prev.impresiones ? usdOMon(cpmP, prev.gasto / prev.impresiones * 1000, prev.moneda) : null, vCpm, 'sube-mal') },
      { etq: 'CPC', valor: usdOMon(cpc, act.clics ? act.gasto / act.clics : null, mon), delta: deltaTxt(vCpc, 'sube-mal'), tip: `Inversión / clics: ${plata(act.gasto, mon)} / ${n0(act.clics)}`,
        vs: lineasVs(r, usdOMon(cpc, act.clics ? act.gasto / act.clics : null, mon), costoPrev(cpcP, pv('clics')), vCpc, 'sube-mal') },
      { etq: 'Alcance', valor: cuentaC.alcance ? n0(cuentaC.alcance) : '—', apagada: !cuentaC.alcance, tip: faltaTip || ['Personas únicas que vieron un anuncio', notaCrea] },
      { etq: 'Frecuencia', valor: cuentaC.frecuencia ? nd(cuentaC.frecuencia, 2) : '—', apagada: !cuentaC.frecuencia,
        tip: faltaTip || [`Impresiones / alcance${cuentaC.impresiones && cuentaC.alcance ? ': ' + n0(cuentaC.impresiones) + ' / ' + n0(cuentaC.alcance) : ''}`, 'Cuántas veces vio un anuncio cada persona', notaCrea, notaImprCamp] },
      { etq: 'Agendas pauta', valor: hay ? n0(A.pauta.length) : '…', delta: hay ? deltaTxt(uiVar(A.pauta.length, P.pauta.length), 'sube-bien') : '',
        tip: [`Agendas con origen ${origenesPauta().join(' o ')} (por fecha de la call${hastaHoyTxt})`, hay ? lineaFuturas(F) : ''],
        vs: hay ? lineasVs(r, n0(A.pauta.length), n0(P.pauta.length), uiVar(A.pauta.length, P.pauta.length), 'sube-bien') : [],
        clic: hay && A.pauta.length ? "anunEtapa('cps')" : '', clicTxt: 'Clic: ver las agendas' },
      { etq: 'Facturación', valor: hay ? usd(A.fact) : '…', delta: hay ? deltaTxt(uiVar(A.fact, P.fact), 'sube-bien') : '',
        tip: hay ? [`Monto del contrato de ${cuantos(nCi, 'cierre', 'cierres')} de pauta (devengado)`, nCi - A.sinMonto.length > 0 ? `Ticket promedio ${usd(A.fact / (nCi - A.sinMonto.length))}` : '',
          A.sinMonto.length ? `${cuantos(A.sinMonto.length, 'cierre', 'cierres')} sin monto cargado` : ''] : 'Cargando las agendas…',
        vs: hay ? lineasVs(r, usd(A.fact), usd(P.fact), uiVar(A.fact, P.fact), 'sube-bien') : [], clic: hay && nCi ? "anunEtapa('cpa')" : '', clicTxt: 'Clic: ver los cierres' },
      { etq: 'Costo/cierre', valor: cpaTxt || '—', apagada: !cpaTxt, delta: deltaTxt(vCpa, 'sube-mal'),
        tip: [!hay ? 'Cargando las agendas…' : !nCi ? 'Sin cierres de pauta en el período' : `${cpa != null ? usd(inv) : plata(act.gasto, mon)} invertidos / ${cuantos(nCi, 'cierre', 'cierres')}`,
          nCi && cpa == null ? `Hace falta el tipo de cambio para verlo en ${MON()}` : ''],
        vs: lineasVs(r, cpaTxt, cpaPTxt, vCpa, 'sube-mal') },
      { etq: 'Sin origen', valor: hay ? n0(A.sinOrigen.length) : '…', delta: hay ? deltaTxt(uiVar(A.sinOrigen.length, P.sinOrigen.length), 'sube-mal') : '', tip: `Agendas${cortaHoy(r) ? ' con call hasta hoy' : ' del período'} sin origen cargado: no se sabe si vinieron de pauta`,
        vs: hay ? lineasVs(r, n0(A.sinOrigen.length), n0(P.sinOrigen.length), uiVar(A.sinOrigen.length, P.sinOrigen.length), 'sube-mal') : [],
        clic: hay && A.sinOrigen.length ? "anunEtapa('sinorigen')" : '', clicTxt: 'Clic: ver cuáles son' },
      { etq: 'Con origen', valor: pct(conOrigen, 0), tip: `Parte de las agendas${cortaHoy(r) ? ' con call hasta hoy' : ' del período'} que tiene origen (la atribución posible hoy)${A.todas.length ? ': ' + n0(A.todas.length - A.sinOrigen.length) + ' de ' + n0(A.todas.length) : ''}` },
    ];

    // ── costo por etapa ──
    // cada etapa en la moneda del cliente (o en la de la cuenta si todavía no hay tipo de cambio). Tooltip: el costo,
    // cuántas hay, de dónde sale y la conversión; clic: las filas de esa etapa. Las tasas de agendas van sobre las
    // calls hasta hoy: una call que todavía no pasó no puede estar asistida.
    const pctC = (a, b) => (b ? pctFino(a / b * 100) : null);
    const etapa = (k, sig, nombre, n, u1, uN, que, conv, extra) => {
      const vU = n ? div(inv, n) : null, vN = n ? act.gasto / n : null;
      const costo = n ? usdOMon(vU, vN, mon) : '—';
      const tip = [`${sig} · ${uiCap(nombre.toLowerCase())}`,
        n ? `${costo} por ${u1}` : n == null ? 'Cargando las agendas…' : `Sin ${uN} en el período`,
        n != null ? `${cuantos(n, u1, uN)} · inversión ${plata(act.gasto, mon)}` : '', conv || '', ...(extra || []), que,
        n ? 'Clic: ' + (k === 'cpl' || k === 'cplc' ? `los ${uN} por campaña` : `ver ${k === 'cpa' ? 'los' : 'las'} ${uN}`) : ''];
      return `<button type="button" class="anun-etapa" onclick="anunEtapa('${k}')"${tipAttr(tip)}><span class="anun-etapa-h"><b>${sig}</b><span>${nombre}</span></span><strong>${costo}</strong></button>`;
    };
    // agendas de pauta con call hasta hoy que todavía no tienen resultado cargado (no cuentan como asistidas)
    const sinRes = hay ? A.pauta.filter(x => !['Presentada', 'Cerrada', 'No-show', 'Cancelada', 'Descalificada'].includes(x.Estado)).length : 0;
    const etapas = `
      ${etapa('cpl', 'CPL', 'REGISTRO', nReg, 'registro', 'registros', 'Registros de la landing en el período')}
      ${etapa('cplc', 'CPLC', 'CALIFICADO', nCal, 'calificado', 'calificados', 'Registros que calificaron en las preguntas del form', nReg ? `${pctC(nCal, nReg)} de los registros` : '')}
      ${etapa('cps', 'CPS', 'AGENDA', hay ? A.pauta.length : null, 'agenda', 'agendas', `Agendas con origen ${origenesPauta().join(' o ')}, por fecha de la call${hastaHoyTxt}`, hay && nReg ? `${pctC(A.pauta.length, nReg)} de los registros` : '', hay ? [lineaFuturas(F)] : [])}
      ${etapa('cpsr', 'CPSR', 'ASISTIDA', hay ? A.asis.length : null, 'asistida', 'asistidas', 'Agendas de pauta en Presentada o Cerrada', hay && A.pauta.length ? `Show-up: ${pctC(A.asis.length, A.pauta.length)} de las agendas${conCallHoy}` : '',
        sinRes ? [`${cuantos(sinRes, 'agenda', 'agendas')} todavía sin resultado cargado (Pendiente, Confirmada o Re-agenda)`] : [])}
      ${etapa('cpa', 'CPA', 'CIERRE', hay ? A.cierres.length : null, 'cierre', 'cierres', 'Agendas de pauta en estado Cerrada', hay && A.asis.length ? `Cierre: ${pctC(A.cierres.length, A.asis.length)} de las asistidas` : '')}`;

    return `<div class="anun-dash">
      ${act.viejo ? aviso(`Meta pidió esperar (demasiadas consultas a la cuenta): se muestra lo consultado a las ${esc(new Date(act.viejo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }))}. Tocá Actualizar en unos minutos.`) : ''}
      <div class="anun-fila-chip">${chip}<span class="anun-info">${info}</span></div>
      <div class="anun-kpis">${tInv}${tCpl}${tCplc}${tRoas}</div>
      <section class="anun-card anun-sec"><div class="anun-micro">Métricas secundarias</div><div class="anun-sec-g">${sec.map(celda).join('')}</div></section>
      <section class="anun-card anun-etapas"><div class="anun-micro">Costo por etapa del embudo</div><div class="anun-etapas-g">${etapas}</div></section>
      ${embudoHtml(r, act, inv, A, sinTc, F)}
      ${campanasHtml(act, crea)}
    </div>`;
  }
  // CPL/CPM/CPC: en la moneda del cliente si se puede; si no, en la de la cuenta
  function usdOMon(vUsd, vNat, mon) { return vUsd != null ? usd(vUsd) : (vNat != null && isFinite(vNat) ? plata(vNat, mon) : '—'); }

  function embudoHtml(r, act, inv, A, sinTc, F = []) {
    const hay = hayAgendas();
    const hastaHoyTxt = cortaHoy(r) ? ', hasta hoy' : '', conCallHoy = cortaHoy(r) ? ' con call hasta hoy' : '';
    const mon = act.moneda;
    const L = act.landing, nReg = L.registros || 0, nCal = L.calificados || 0;
    // las barras de conteo se miden contra la etapa más ancha (los registros, salvo que haya más agendas que registros)
    const base = Math.max(nReg, hay ? A.pauta.length : 0, 1);
    const ancho = (n) => Math.max(0, Math.min(100, n / base * 100));
    // cada fila: tooltip con la etapa, cuántas, su costo y la conversión desde la anterior; clic = las filas de esa etapa
    const barra = (k, cls, etq, valor, w, tip) => `<div class="anun-emb-f clic" data-k="${k}"${clicAttr(`anunEmbudo('${k}')`)}${tipAttr(tip)}><span class="anun-emb-l">${esc(etq)}</span><div class="anun-emb-pista"><div class="anun-emb-b ${cls}" style="width:${w.toFixed(2)}%"><b>${valor}</b></div></div></div>`;
    const conv = (txt, p, tip) => `<div class="anun-emb-conv"${tipAttr(tip)}>${uiIco('abajo', 12)}${esc(txt)}: <b>${esc(pctFino(p))}</b></div>`;
    const costoDe = (n) => (n ? usdOMon(div(inv, n), act.gasto / n, mon) : null);
    const conGasto = act.porDia.filter(d => d.gasto > 0).length;
    const nAg = hay ? A.pauta.length : null, nCi = hay ? A.cierres.length : null;
    const tipInv = ['Inversión', plata(act.gasto, mon) + ' en el período', conGasto ? `${uiNum(conGasto)} día${conGasto === 1 ? '' : 's'} con gasto · ${plata(act.gasto / conGasto, mon)} por día` : '',
      `${n0(act.impresiones)} impresiones · ${n0(act.clics)} clics`, 'Clic: el gasto día por día'];
    const tipReg = ['Registros de la landing', `${n0(nReg)} en el período`, nReg ? `${costoDe(nReg)} por registro (CPL real)` : '', nReg ? 'Clic: los registros por campaña' : ''];
    const tipCal = ['Calificados', `${n0(nCal)} · ${pctFino(nReg ? nCal / nReg * 100 : null)} de los registros`, nCal ? `${costoDe(nCal)} por calificado` : '', nCal ? 'Clic: los calificados por campaña' : ''];
    const tipAg = ['Agendas de pauta', hay ? `${n0(nAg)} agenda${nAg === 1 ? '' : 's'} · ${pctFino(nReg ? nAg / nReg * 100 : null)} de los registros` : 'Cargando las agendas…',
      nAg ? `${costoDe(nAg)} por agenda` : '', `Origen ${origenesPauta().join(' o ')}, por fecha de la call${hastaHoyTxt}`, hay ? lineaFuturas(F) : '', nAg ? 'Clic: ver las agendas' : ''];
    const tipCi = ['Cierres atribuidos', hay ? `${n0(nCi)} cierre${nCi === 1 ? '' : 's'} · ${pctFino(nAg ? nCi / nAg * 100 : null)} de las agendas` : 'Cargando las agendas…',
      nCi ? `${costoDe(nCi)} por cierre · facturación ${usd(A.fact)}` : '', nCi ? 'Clic: ver los cierres' : ''];
    const avisos = [];
    if (sinTc) avisos.push(`El gasto está en ${esc(mon)} y las ventas en ${esc(MON())}: <button type="button" class="anun-link" onclick="anunTc()">cargá el tipo de cambio</button> para ver ROAS y costos en ${esc(MON())}.`);
    if (act.gasto > 0 && nReg && !L.asignados && act.campanas.length) avisos.push('Ningún registro del período coincide con una campaña. Para ver registros y CPL por campaña y por anuncio, en los parámetros de URL de los anuncios poné <code>utm_campaign={{campaign.name}}&amp;utm_content={{ad.name}}</code>.');
    if (act.gasto > 0 && hay && !A.pauta.length) avisos.push(`Hay inversión sin agendas de pauta en el período. Revisá que las agendas lleguen con su origen (${origenesPauta().map(o => `<code>${esc(o)}</code>`).join(' o ')}) o <button type="button" class="anun-link" onclick="anunOrigenes()">cambiá qué orígenes cuentan como pauta</button>.`);
    if (hay && A.sinOrigen.length) avisos.push(`${A.sinOrigen.length} agenda${A.sinOrigen.length === 1 ? '' : 's'} ${cortaHoy(r) ? 'con call hasta hoy' : 'del período'} no tiene${A.sinOrigen.length === 1 ? '' : 'n'} origen: no se sabe si vino${A.sinOrigen.length === 1 ? '' : 'eron'} de pauta. <button type="button" class="anun-link" onclick="anunEtapa('sinorigen')">Ver cuáles son</button>`);
    if (hay && A.sinMonto.length) avisos.push(`${A.sinMonto.length} cierre${A.sinMonto.length === 1 ? '' : 's'} de pauta sin monto cargado: la facturación atribuida queda corta (${A.sinMonto.slice(0, 4).map(x => esc(x.Nombre)).join(', ')}).`);
    const pCal = nReg ? 100 * nCal / nReg : null;
    const pAg = hay && nReg ? 100 * A.pauta.length / nReg : null;
    const pCi = hay && A.pauta.length ? 100 * A.cierres.length / A.pauta.length : null;
    const factTip = ['Facturación atribuida', hay ? usd(A.fact) : 'Cargando las agendas…', hay ? `Monto del contrato de ${n0(A.cierres.length)} cierre${A.cierres.length === 1 ? '' : 's'} de pauta (devengado)` : '',
      hay && A.sinMonto.length ? `${n0(A.sinMonto.length)} sin monto cargado: queda corta` : '', hay && A.cierres.length ? 'Clic: ver los cierres' : ''];
    return `<section class="anun-card anun-emb">
      <header class="anun-emb-h">
        <div><b>Embudo: del gasto al cierre</b><span>Inversión → Registros → Calificados → Agendas de pauta → Cierres atribuidos · <button type="button" class="anun-link" onclick="anunOrigenes()" title="Qué orígenes de agenda cuentan como pauta">pauta = ${esc(origenesPauta().join(' · '))}</button></span></div>
        <div class="anun-emb-kpis">
          <div><span>FACTURACIÓN ATRIBUIDA</span><b class="oro${hay && A.cierres.length ? ' clic' : ''}"${tipAttr(factTip)}${hay && A.cierres.length ? clicAttr(`anunEtapa('cpa')`) : ''}>${hay ? usd(A.fact) : '…'}</b><small>contratos al cierre</small></div>
        </div>
      </header>
      <div class="anun-emb-barras">
        ${barra('inv', 'verde', 'Inversión', plata(act.gasto, mon), 100, tipInv)}
        ${barra('registros', 'violeta', 'Registros', n0(nReg), ancho(nReg), tipReg)}
        ${conv('registros → calificados', pCal, ['Registros → calificados', nReg ? `Calificaron ${n0(nCal)} de ${n0(nReg)} registros` : '', pCal != null ? pctFino(pCal) : ''])}
        ${barra('calificados', 'azul', 'Calificados', n0(nCal), ancho(nCal), tipCal)}
        ${conv('registros → agendas', pAg, ['Registros → agendas', hay && nReg ? `${n0(nAg)} agendas de pauta${conCallHoy} sobre ${n0(nReg)} registros` : '', pAg != null ? pctFino(pAg) : ''])}
        ${barra('agendas', 'ambar', 'Agendas', hay ? n0(A.pauta.length) : '…', ancho(A.pauta.length), tipAg)}
        ${conv('agendas → cierres', pCi, ['Agendas → cierres', hay && nAg ? `Cerraron ${n0(nCi)} de ${n0(nAg)} agendas de pauta${conCallHoy}` : '', pCi != null ? pctFino(pCi) : ''])}
        ${barra('cierres', 'rojo', 'Cierres', hay ? n0(A.cierres.length) : '…', ancho(A.cierres.length), tipCi)}
      </div>
      ${avisos.map(a => aviso(a)).join('')}
    </section>`;
  }

  /* ── detalle de lo que hay detrás de cada número del Dashboard (modales de solo lectura) ── */
  function listaAgendas(l, conMonto, vacio = 'Ninguna en el período.') {
    if (!l.length) return `<div class="anun-sub-msg">${esc(vacio)}</div>`;
    return `<div class="anun-lista">${l.map(x => `<div class="anun-lista-f"><b>${esc(x.Nombre || '—')}</b><span class="anun-lista-sub">${esc(fCorta(fechaCall(x)))} · ${esc(x.Origen || 'sin origen')} · ${esc(x.Closer || 'sin closer')}</span>${conMonto ? `<em>${num(x.Monto) ? usd(num(x.Monto)) : 'sin monto'}</em>` : ''}${uiEstado(x.Estado || '—', colorEstado(x.Estado))}</div>`).join('')}</div>`;
  }
  const actDelPeriodo = () => { const r = uiPerRango(PER); return { r, act: S.metaVal[r.desde + '|' + r.hastaHoy] || null }; };
  window.anunEtapa = (k) => {
    tipFuera();
    const { r, act } = actDelPeriodo();
    const mon = act ? act.moneda : MON();
    const inv = act ? aUsd(act.gasto, mon) : null;
    const costo = (n) => (act && n ? usdOMon(div(inv, n), act.gasto / n, mon) : '—');
    const cerrar = [{ texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }];
    if (k === 'leads') {
      if (!act) return;
      const camps = act.campanas.filter(c => c.leadsU > 0).sort((a, b) => b.leadsU - a.leadsU || b.gasto - a.gasto);
      const filasL = camps.map(c => ({ etiqueta: c.nombre, valor: c.leadsU, texto: `${n0(c.leadsU)} lead${c.leadsU === 1 ? '' : 's'}`,
        sub: `CPL Meta ${plata(c.gasto / c.leadsU, mon)} · ${plata(c.gasto, mon)} invertidos` }));
      uiModalAbrir({ titulo: 'Leads de Meta por campaña', sub: `${r.etiqueta} · ${n0(act.leads)} leads · ${costo(act.leads)} por lead`, ancho: '720px',
        cuerpo: listaB(filasL, { total: act.leads, vacio: 'Ninguna campaña registró leads en el período' }) + `<p class="anun-pie">Leads que reporta Meta (formulario o píxel), sin contar dos veces el mismo. El porcentaje es la parte de los ${n0(act.leads)} leads del período.</p>`,
        acciones: cerrar });
      return;
    }
    // registros (o calificados) de la landing por campaña. Con los anuncios ya leídos, el reparto también sabe de qué
    // campaña es cada anuncio que nombra el UTM.
    if (k === 'cpl' || k === 'cplc') {
      if (!act) return;
      const cal = k === 'cplc', campo = cal ? 'calificados' : 'registros', u1 = cal ? 'calificado' : 'registro';
      const crea = S.creaVal[r.desde + '|' + r.hastaHoy];
      const LC = crea && crea.landing ? crea.landing.campanas || {} : null;
      const camps = act.campanas.map(c => ({ c, n: Number(((LC ? LC[c.id] : c) || {})[campo]) || 0 })).filter(x => x.n > 0).sort((a, b) => b.n - a.n || b.c.gasto - a.c.gasto);
      // las dos consultas pueden ser de horas distintas: si el reparto ya vio registros nuevos, el total es el suyo
      const total = Math.max(Number(act.landing[campo]) || 0, camps.reduce((s, x) => s + x.n, 0));
      const sinCamp = total - camps.reduce((s, x) => s + x.n, 0);
      const filasL = camps.map(({ c, n }) => ({ etiqueta: c.nombre, valor: n, texto: `${n0(n)} ${n === 1 ? u1 : campo}`,
        sub: `${cal ? 'CPL calificado' : 'CPL real'} ${plata(c.gasto / n, mon)} · ${plata(c.gasto, mon)} invertidos` }));
      if (sinCamp > 0) filasL.push({ etiqueta: 'Sin campaña', valor: sinCamp, texto: `${n0(sinCamp)} ${sinCamp === 1 ? u1 : campo}`, sub: 'Orgánico, o un UTM que no nombra ninguna campaña ni anuncio' });
      uiModalAbrir({ titulo: cal ? 'Calificados por campaña' : 'Registros por campaña', sub: `${r.etiqueta} · ${n0(total)} ${total === 1 ? u1 : campo} · ${costo(total)} por ${u1}`, ancho: '720px',
        cuerpo: listaB(filasL, { total, vacio: `Sin ${campo} en el período` }) + '<p class="anun-pie">Un registro va a una campaña si su <code>utm_campaign</code> o su <code>utm_content</code> es el nombre o el id de la campaña o de uno de sus anuncios. En los parámetros de URL de los anuncios: <code>utm_campaign={{campaign.name}}&amp;utm_content={{ad.name}}</code>.</p>',
        acciones: cerrar });
      return;
    }
    if (!hayAgendas()) { uiToast('Todavía se están cargando las agendas', ''); return; }
    // las mismas agendas que cuentan las tarjetas: call hasta hoy (las que vienen van aparte, en Agendas)
    const A = agendas(rangoHoy(r)), F = futuras(r);
    const conCall = cortaHoy(r) ? ' con call hasta hoy' : '';
    const def = {
      cps: { l: A.pauta, t: 'Agendas de pauta', u1: 'agenda', uN: 'agendas', nota: `Agendas con origen ${origenesPauta().join(' o ')}, por fecha de la call${cortaHoy(r) ? ', hasta hoy' : ''}.` },
      cpsr: { l: A.asis, t: 'Agendas asistidas de pauta', u1: 'asistida', uN: 'asistidas', nota: `Agendas de pauta${conCall} que se presentaron (Presentada o Cerrada).` },
      cpa: { l: A.cierres, t: 'Cierres de pauta', u1: 'cierre', uN: 'cierres', nota: `Agendas de pauta${conCall} en estado Cerrada, con el monto del contrato (devengado). Total: ${usd(A.fact)}.` },
      sinorigen: { l: A.sinOrigen, t: 'Agendas sin origen', u1: 'agenda', uN: 'agendas', sinCosto: true, nota: `Agendas${conCall || ' del período'} sin origen cargado: no se sabe si vinieron de pauta. El origen lo trae cada agenda o se carga a mano en el pipeline.` },
    }[k];
    if (!def) return;
    const l = def.l.slice().sort((a, b) => fechaCall(b).localeCompare(fechaCall(a)));
    const prox = k === 'cps' && F.length ? `<div class="ui-sec">Con call después de hoy (todavía no entran en las cuentas)</div>${listaAgendas(F, false)}` : '';
    uiModalAbrir({
      titulo: def.t, sub: `${r.etiqueta} · ${n0(l.length)} ${l.length === 1 ? def.u1 : def.uN}${l.length && act && !def.sinCosto ? ' · ' + costo(l.length) + ' por ' + def.u1 : ''}${prox ? ` · ${n0(F.length)} más después de hoy` : ''}`, ancho: '720px',
      cuerpo: `${listaAgendas(l, k === 'cpa')}${prox}<p class="anun-pie">${esc(def.nota)}</p>`, acciones: cerrar,
    });
  };
  window.anunEmbudo = (k) => {
    if (k === 'inv') return anunInversion();
    anunEtapa({ registros: 'cpl', calificados: 'cplc', agendas: 'cps', cierres: 'cpa' }[k] || k);
  };
  // el gasto día por día del período (Meta) con los registros de cada día, y el reparto por campaña
  window.anunInversion = () => {
    tipFuera();
    const { r, act } = actDelPeriodo(); if (!act) return;
    const mon = act.moneda, conTc = aUsd(1, mon) != null;
    const nat = (n) => (conTc && mon !== MON() ? n * tc() : n);   // el valor del eje vuelto a la moneda de la cuenta
    const dias = diasCompletos(act.porDia);
    const regDia = act.landing.porDia || {};
    const total = dias.reduce((s, d) => s + (d.gasto || 0), 0);
    const conGasto = dias.filter(d => d.gasto > 0);
    const pico = conGasto.slice().sort((a, b) => b.gasto - a.gasto)[0];
    let paso = Math.max(1, Math.ceil(dias.length / 7));
    while (paso < dias.length && (dias.length - 1) % paso !== 0 && (dias.length - 1) % paso < paso * 0.6) paso++;
    const vGasto = dias.map(d => (conTc ? aUsd(d.gasto, mon) : d.gasto) || 0);
    const graf = dias.length >= 2 ? uiLineas({
      etiquetas: dias.map(d => fCorta(d.fecha)), alto: 200, leyenda: 'abajo', xMax: dias.length / paso,
      tituloTip: (i) => fLarga(dias[i].fecha),
      series: [
        { nombre: 'Gasto', color: 'verde', area: true, valores: vGasto,
          fmt: (n) => (conTc ? usd(n) : plata(n, mon)) + (total > 0 ? ' · ' + pctParte(nat(n) / total * 100) + ' del período' : '') },
        { nombre: 'Registros', color: 'rosa', eje: 'der', valores: dias.map(d => (regDia[d.fecha] || {}).registros || 0), fmt: (n) => n0(n) },
      ],
      fmt: fmtEjePlata(vGasto, conTc ? pref() : ''), fmtDer: (n) => uiNum(n),
    }) : '<div class="anun-sub-msg">Hace falta más de un día con datos para dibujar la curva.</div>';
    const camps = act.campanas.filter(c => c.gasto > 0).sort((a, b) => b.gasto - a.gasto)
      .map(c => ({ etiqueta: c.nombre, valor: c.gasto, texto: plata(c.gasto, mon), sub: `${n0(c.resultados || 0)} ${c.tipoResultado || 'resultados'}` }));
    const nReg = act.landing.registros || 0;
    const t = (k2, v2) => `<div class="anun-mini"><span>${k2}</span><b>${v2}</b></div>`;
    uiModalAbrir({
      titulo: 'Inversión del período', sub: `${r.etiqueta} · ${plata(act.gasto, mon)}${mon !== MON() && conTc ? ` (${mon} ${uiNum(act.gasto)} a ${uiNum(tc())})` : ''}`, ancho: '880px',
      cuerpo: `<div class="anun-minis">${t('Total', plata(act.gasto, mon))}${t('Días con gasto', n0(conGasto.length))}${t('Promedio por día', conGasto.length ? plata(act.gasto / conGasto.length, mon) : '—')}${t('Día pico', pico ? fCorta(pico.fecha) + ' · ' + plata(pico.gasto, mon) : '—')}${t('Registros', n0(nReg))}${t('CPL real', nReg ? plata(act.gasto / nReg, mon) : '—')}</div>
        <div class="anun-inv-graf">${graf}</div>
        <div class="ui-sec">Por campaña</div>${listaB(camps, { total: act.gasto, vacio: 'Sin campañas con gasto' })}`,
      acciones: [{ texto: 'Ver el calendario', onclick: "uiModalCerrar();anunTab('calendario')" }, { texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }],
    });
  };

  function campanasHtml(act, crea) {
    const okCrea = crea && !crea.falta && !crea.error;
    const anuncios = okCrea ? crea.anuncios || [] : [];
    // registros por campaña: los de la consulta anuncio por anuncio (sabe de qué campaña es cada anuncio que nombra el
    // UTM) o, mientras llega, los de la consulta por campaña
    const LC = okCrea && crea.landing ? crea.landing.campanas || {} : null;
    const regsDe = (x, esAnuncio) => (esAnuncio || !LC ? (x.registros != null ? x : null) : LC[x.id] || { registros: 0, calificados: 0 });
    const q = nom(S.q);
    const coincide = (t) => !q || nom(t).includes(q);
    const lista = act.campanas.filter(c => coincide(c.nombre) || anuncios.some(a => a.campana.id === c.id && coincide(a.nombre)));
    const mon = act.moneda;
    // ROAS de Meta solo existe si alguna campaña reporta compras (en captación la columna sobra)
    const conRoas = act.campanas.some(c => c.facturado > 0);
    const nCols = conRoas ? 12 : 11;
    const fila = (x, esAnuncio) => {
      const visitas = esAnuncio ? x.visitas : x.landings;
      const malo = (x.resultados || 0) === 0 && x.gasto > 0;
      const roas = x.facturado && x.gasto ? x.facturado / x.gasto : null;
      const rg = regsDe(x, esAnuncio);
      const tipReg = rg ? tipAttr(['Registros de la landing', `${n0(rg.registros)} registro${rg.registros === 1 ? '' : 's'} · ${n0(rg.calificados)} calificado${rg.calificados === 1 ? '' : 's'}`,
        rg.calificados ? `CPL calificado ${plata(x.gasto / rg.calificados, mon)}` : '', 'Por UTM: utm_campaign o utm_content con el nombre o el id']) : '';
      return `<td class="num">${plata(x.gasto, mon)}</td>
        <td class="num">${n0(visitas)}</td>
        <td class="num">${visitas ? plata(x.gasto / visitas, mon) : '—'}</td>
        <td class="num">${n0(x.clics)}</td>
        <td class="num">${x.ctr != null ? pct(x.ctr, 2) : '—'}</td>
        <td class="num"${tipReg}>${rg ? n0(rg.registros) : '—'}</td>
        <td class="num">${rg && rg.registros ? plata(x.gasto / rg.registros, mon) : '—'}</td>
        <td class="num"><b>${n0(x.resultados)}</b><small>${esc(x.tipoResultado || (malo ? 'nada medido' : ''))}</small></td>
        <td class="num">${x.costoPorResultado != null ? plata(x.costoPorResultado, mon) : '—'}</td>
        ${conRoas ? `<td class="num">${roas != null ? `<b class="${roas >= 2 ? 'bien' : roas >= 1 ? 'medio' : 'mal'}">${nd(roas, 2)}x</b>` : '—'}</td>` : ''}`;
    };
    const filasHtml = lista.map(c => {
      const abierta = S.abiertas.has(c.id) || (q && anuncios.some(a => a.campana.id === c.id && coincide(a.nombre)) && !coincide(c.nombre));
      const suyos = anuncios.filter(a => a.campana.id === c.id && (!q || coincide(a.nombre) || coincide(c.nombre)));
      const malo = (c.resultados || 0) === 0 && c.gasto > 0;
      let sub = '';
      if (abierta) {
        if (!crea) sub = `<tr class="anun-sub"><td></td><td colspan="${nCols - 1}" class="anun-sub-msg">Leyendo los anuncios…</td></tr>`;
        else if (crea.falta) sub = `<tr class="anun-sub"><td></td><td colspan="${nCols - 1}" class="anun-sub-msg">${FALTA_CREA}</td></tr>`;
        else if (crea.error) sub = `<tr class="anun-sub"><td></td><td colspan="${nCols - 1}" class="anun-sub-msg">Meta no devolvió los anuncios: ${esc(crea.error)}</td></tr>`;
        else if (!suyos.length) sub = `<tr class="anun-sub"><td></td><td colspan="${nCols - 1}" class="anun-sub-msg">Sin anuncios con entrega en el período.</td></tr>`;
        else sub = suyos.map(a => `<tr class="anun-sub clic" onclick="anunAnuncio('${esc(a.id)}')"><td></td>
          <td><span class="anun-camp-ad">${a.creativo && a.creativo.thumb ? `<img src="${esc(a.creativo.thumb)}" alt="" loading="lazy" onerror="this.remove()">` : '<i></i>'}<span>${esc(a.nombre)}</span>${a.estado ? `<em class="${a.estado === 'ACTIVE' ? 'on' : ''}">${esc(estadoMeta(a.estado))}</em>` : ''}</span></td>${fila(a, true)}</tr>`).join('');
      }
      return `<tr class="${malo ? 'malo' : ''}${abierta ? ' abierta' : ''}">
        <td><button type="button" class="anun-chev" onclick="anunCamp('${esc(c.id)}')" aria-label="Ver anuncios">${uiIco(abierta ? 'abajo' : 'der', 14)}</button></td>
        <td><span class="anun-camp-n" title="${esc(c.nombre)}">${esc(c.nombre)}</span></td>${fila(c, false)}</tr>${sub}`;
    }).join('');
    const cols = ['', 'CAMPAÑA', 'INVERSIÓN', 'VISITAS', 'COSTE/ VISITA', 'CLICS', 'CTR', 'REGISTROS', 'CPL REAL', 'RESULTADOS', 'COSTO X RESULT.', ...(conRoas ? ['ROAS META'] : [])];
    return `<section class="anun-card anun-camp">
      <header class="anun-camp-h"><b>Campañas</b>
        <div class="anun-camp-acc">
          <label class="anun-buscar">${uiIco('buscar', 14)}<input type="search" placeholder="Buscar campaña o anuncio..." value="${esc(S.q)}" oninput="anunBuscar(this.value)"></label>
          <button type="button" class="anun-btn2 chico" onclick="anunCsvCampanas()" title="Descargar la tabla en CSV">${uiIco('descargar', 14)}CSV</button>
        </div>
      </header>
      <div class="anun-tabla-w"><table class="anun-tabla${conRoas ? '' : ' sin-roas'}">
        <thead><tr>${cols.map((c, i) => `<th class="${i > 1 ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody id="anunCampBody">${filasHtml || `<tr><td colspan="${nCols}" class="anun-sub-msg">${act.campanas.length ? 'Ninguna campaña coincide con la búsqueda.' : 'Sin campañas con gasto en este período.'}</td></tr>`}</tbody>
      </table></div>
      ${act.campanas.some(c => (c.resultados || 0) === 0 && c.gasto > 0) ? '<p class="anun-pie">Las filas marcadas en rojo gastaron y no registraron ningún resultado en el período. Puede ser una campaña de alcance o de video, o una conversión que no se está midiendo.</p>' : ''}
    </section>`;
  }
  const estadoMeta = (e) => ({ ACTIVE: 'Activo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campaña pausada', ADSET_PAUSED: 'Conjunto pausado', DELETED: 'Borrado', ARCHIVED: 'Archivado', DISAPPROVED: 'Rechazado', PENDING_REVIEW: 'En revisión', WITH_ISSUES: 'Con problemas', IN_PROCESS: 'Procesando' })[e] || e;

  /* ═══════════════════════════════ FEED ═══════════════════════════════ */
  // qué mide cada anuncio (meta-ads-creativos: compras > leads > conversaciones de DM), en singular y plural
  const TIPO_RES = { leads: ['lead', 'leads'], conversaciones: ['DM', 'DMs'], compras: ['compra', 'compras'] };
  const unidadRes = (t, n) => (TIPO_RES[t] || ['resultado', 'resultados'])[n === 1 ? 0 : 1];
  // promedio y ranking POR TIPO de resultado (leads con leads, DMs con DMs): un costo por conversación
  // de DM no se compara con un costo por lead de formulario (el mismo criterio que usaba el hub original
  // para las campañas de mensajes contra las de formularios). Un promedio mezclado lo dominan los leads.
  function statsPorTipo(anuncios) {
    const out = {};
    (anuncios || []).forEach(a => {
      const t = a.tipoResultado; if (!t) return;
      const o = out[t] = out[t] || { gasto: 0, res: 0, n: 0, rank: [] };
      if (a.resultados > 0) { o.gasto += a.gasto || 0; o.res += a.resultados; o.n++; }
      if (a.resultados >= 5 && a.costoPorResultado != null) o.rank.push(a);
    });
    Object.values(out).forEach(o => { o.prom = o.res ? o.gasto / o.res : null; o.rank.sort((a, b) => a.costoPorResultado - b.costoPorResultado); });
    return out;
  }
  // "12,3% por debajo del promedio" (o por encima): cuánto se aleja un costo del promedio de su tipo
  const vsProm = (c, prom) => (c != null && prom > 0 ? (() => { const d = (c - prom) / prom * 100; return Math.abs(d) < 0.05 ? 'igual al promedio' : `${uiNum(Math.abs(d), 1)}% ${d < 0 ? 'por debajo' : 'por encima'} del promedio`; })() : '');
  function feedModelo(anuncios) {
    const T = statsPorTipo(anuncios);
    const pos = new Map(); Object.values(T).forEach(o => o.rank.forEach((a, i) => pos.set(a.id, i + 1)));
    const variosTipos = Object.values(T).filter(o => o.rank.length).length > 1;
    const gastoTotal = anuncios.reduce((s, a) => s + (a.gasto || 0), 0);
    return anuncios.map(a => {
      const serie = (a.porDia || []).filter(d => d.impresiones > 0).slice().sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
      const ctrDia = serie.map(d => d.clics / d.impresiones * 100);
      let fatiga = 0;
      if (ctrDia.length >= 4) {
        const m = Math.floor(ctrDia.length / 2);
        const prom = (x) => x.reduce((s, y) => s + y, 0) / x.length;
        const ini = prom(ctrDia.slice(0, m)), fin = prom(ctrDia.slice(m));
        const caida = ini > 0 ? Math.max(0, (ini - fin) / ini) : 0;
        fatiga = caida * Math.max(1, a.frecuencia || 1);
      }
      const ret = a.video && a.video.reproducciones ? 100 * (a.video.p75 || 0) / a.video.reproducciones : null;
      const o = T[a.tipoResultado] || null;
      return { ...a, rank: pos.get(a.id) || null, rankDe: o ? o.rank.length : 0, variosTipos, ctrDia, ctrDias: serie, fatiga, retencion: ret,
        cprProm: o ? o.prom : null, promN: o ? o.n : 0, parteGasto: gastoTotal ? a.gasto / gastoTotal * 100 : null };
    });
  }
  async function tabFeed(cuerpo, seq) {
    const r = uiPerRango(PER);
    cuerpo.innerHTML = `<div class="anun-feed">${Array.from({ length: 8 }, () => '<div class="anun-cre esq"></div>').join('')}</div>`;
    const crea = await metaCreativos(r.desde, r.hastaHoy);
    if (!vivo(seq)) return;
    if (crea.falta) { cuerpo.innerHTML = conectar(crea.faltan); return; }
    if (crea.error) { cuerpo.innerHTML = vacio({ ico: 'alerta', titulo: 'Meta no devolvió los anuncios', texto: esc(crea.error), boton: `<button type="button" class="anun-btn2" onclick="anunActualizar()">${uiIco('refrescar', 14)}Reintentar</button>` }); return; }
    const mod = feedModelo((crea.anuncios || []).filter(a => a.gasto > 0));
    if (!mod.length) { cuerpo.innerHTML = vacio({ ico: 'grilla2', titulo: 'Sin anuncios con gasto en este período', texto: 'Elegí otro período arriba.' }); return; }
    const ord = {
      cpr: (a, b) => (a.costoPorResultado == null) - (b.costoPorResultado == null) || (a.costoPorResultado || 0) - (b.costoPorResultado || 0) || b.gasto - a.gasto,
      gasto: (a, b) => b.gasto - a.gasto,
      resultados: (a, b) => b.resultados - a.resultados || b.gasto - a.gasto,
      fatiga: (a, b) => b.fatiga - a.fatiga || b.frecuencia - a.frecuencia,
      video: (a, b) => (a.retencion == null) - (b.retencion == null) || (a.retencion || 0) - (b.retencion || 0),
    }[S.orden];
    const mon = (crea.cuenta && crea.cuenta.moneda) || MON();
    cuerpo.innerHTML = `<div class="anun-feed">${mod.slice().sort(ord).map(a => tarjetaCre(a, mon)).join('')}</div>
      <p class="anun-pie">Ranking: los anuncios con 5 resultados o más, ordenados por costo por resultado y separados por tipo de resultado (leads con leads, DMs con DMs); el promedio de costo también es por tipo. "Más fatigado" = el CTR de la segunda mitad del período cae contra la primera, multiplicado por la frecuencia. Retención = reproducciones al 75% / reproducciones.</p>`;
  }
  function tarjetaCre(a, mon) {
    const res = a.resultados ? `${n0(a.resultados)} ${a.tipoResultado === 'conversaciones' ? 'DMs' : a.tipoResultado || 'res.'}` : '0 resultados';
    const frecMala = a.frecuencia >= 3;
    const obj = OBJETIVOS[a.campana.objetivo] || (a.campana.objetivo ? uiCap(String(a.campana.objetivo).toLowerCase().replace(/^outcome_/, '').replace(/_/g, ' ')) : '');
    const fecha = a.creado ? fCorta(a.creado) : (a.primerDia ? fCorta(a.primerDia) : '');
    const t = a.tipoResultado, unidad = unidadRes(t, 1), unidades = unidadRes(t, 2);
    // cada dato de la tarjeta con su tooltip; el nombre del anuncio va en la primera línea (sobre la
    // imagen no aparece nada, así no tapa el creativo). Ranking y promedio son de su mismo tipo de resultado.
    const tCard = [a.nombre, a.campana.nombre + (a.conjunto && a.conjunto.nombre ? ' · ' + a.conjunto.nombre : ''), a.estado ? estadoMeta(a.estado) : '', 'Clic: ver el detalle del anuncio'];
    const tRank = a.rank ? [`Puesto ${a.rank} de ${a.rankDe} entre los anuncios de ${unidades}`, `Por costo por ${unidad}, entre los que tienen 5 ${unidades} o más`, a.costoPorResultado != null ? `${plata(a.costoPorResultado, mon)} por ${unidad}` : '',
      a.variosTipos ? 'Los anuncios de otro tipo de resultado tienen su propio ranking' : '']
      : ['Sin ranking', t ? `Necesita 5 ${unidades} o más en el período para entrar (tiene ${n0(a.resultados || 0)})` : 'No midió resultados en el período (ni leads, ni DMs, ni compras)'];
    const tGasto = ['Inversión', plata(a.gasto, mon), a.parteGasto != null ? `${pctParte(a.parteGasto)} del gasto de todos los anuncios del período` : ''];
    const tFrec = ['Frecuencia', `${nd(a.frecuencia, 2)} veces por persona`, a.impresiones && a.alcance ? `${n0(a.impresiones)} impresiones / ${n0(a.alcance)} personas` : '', frecMala ? 'Alta: el público ya lo vio muchas veces' : ''];
    const tRes = ['Resultados', a.resultados ? `${n0(a.resultados)} ${a.tipoResultado === 'conversaciones' ? 'conversaciones de DM' : a.tipoResultado || 'resultados'}` : 'Ninguno medido en el período', a.tipoResultado ? 'Lo que mide la campaña: ' + a.tipoResultado : ''];
    const tCpr = [`Costo por ${unidad}`, a.costoPorResultado != null ? `${plata(a.costoPorResultado, mon)} por ${unidad}` : 'Sin resultados: no hay costo',
      a.cprProm != null ? `Promedio de los anuncios de ${unidades}: ${plata(a.cprProm, mon)} (${uiNum(a.promN)} anuncio${a.promN === 1 ? '' : 's'})` : '',
      vsProm(a.costoPorResultado, a.cprProm)];
    const tCtr = ['CTR', pct(a.ctr, 2), a.impresiones ? `${n0(a.clics)} clics / ${n0(a.impresiones)} impresiones` : ''];
    const tVid = a.retencion != null ? ['Retención de video', pctFino(a.retencion), `${n0(a.video.p75)} de ${n0(a.video.reproducciones)} reproducciones llegaron al 75%`] : null;
    const tObj = obj ? ['Objetivo de la campaña', obj, a.campana.objetivo || ''] : null;
    const tReg = a.registros ? ['Registros de la landing', `${n0(a.registros)} registro${a.registros === 1 ? '' : 's'} · ${n0(a.calificados)} calificado${a.calificados === 1 ? '' : 's'}`, `CPL real ${plata(a.gasto / a.registros, mon)}`, 'Por UTM: utm_content o utm_campaign con el nombre o el id del anuncio'] : null;
    return `<button type="button" class="anun-cre" onclick="anunAnuncio('${esc(a.id)}')" aria-label="${esc(a.nombre)}">
      <span class="anun-cre-sin"><b>${esc(a.nombre)}</b><small>${a.creativo && a.creativo.thumb ? '' : 'sin miniatura'}</small></span>
      ${a.creativo && a.creativo.thumb ? `<img src="${esc(a.creativo.thumb)}" alt="" loading="lazy" onerror="this.classList.add('roto')">` : ''}
      <span class="anun-cre-rank"${tipAttr(tRank)}>${a.rank ? `${ico('trofeo', 11)}#${a.rank}${a.variosTipos ? ` en ${esc(unidades)}` : ''}` : `${ico('menos', 11)}Sin ranking`}</span>
      <span class="anun-cre-ov">
        <span class="anun-cre-l1"${tipAttr(tCard)}>Anuncio${fecha ? ' · ' + esc(fecha) : ''} · ${esc(a.campana.nombre)}</span>
        <span class="anun-cre-m">
          <span class="fuerte"${tipAttr(tGasto)}>${ico('monedas', 13)}${plata(a.gasto, mon)}</span>
          <span class="${frecMala ? 'mal' : ''}"${tipAttr(tFrec)}>${uiIco(frecMala ? 'baja' : 'sube', 13)}${nd(a.frecuencia, 1)} frec.</span>
          <span${tipAttr(tRes)}>${uiIco('usuarios', 13)}${esc(res)}</span>
          <span${tipAttr(tCpr)}>${ico('moneda', 13)}${a.costoPorResultado != null ? plata(a.costoPorResultado, mon) : '—'} ${a.tipoResultado === 'leads' ? 'CPL' : 'CPR'}</span>
        </span>
        <span class="anun-cre-chips">${obj ? `<i class="ok"${tipAttr(tObj)}>${esc(obj)}</i>` : ''}<i${tipAttr(tCtr)}>CTR ${pct(a.ctr, 1)}</i>${a.retencion != null ? `<i${tipAttr(tVid)}>${uiIco('ojo', 11)}${esc(pctFino(a.retencion))} video</i>` : ''}${a.registros ? `<i${tipAttr(tReg)}>${uiIco('usuarios', 11)}${n0(a.registros)} reg. · ${plata(a.gasto / a.registros, mon)}</i>` : ''}</span>
        <span class="anun-cre-sp">${sparkRecta(a.ctrDia, { etiquetas: (a.ctrDias || []).map(d => fLarga(d.fecha)), fmt: (n) => pct(n, 2), nombre: 'CTR del día' })}</span>
      </span>
    </button>`;
  }

  /* ── detalle de un anuncio (Feed, Calendario, tabla de campañas) ── */
  window.anunAnuncio = (id) => {
    tipFuera();   // el tooltip del dato que se clickeó no queda encima del detalle
    const todos = Object.values(S.creaVal).filter(v => v && v.anuncios).flatMap(v => v.anuncios.map(a => ({ a, mon: (v.cuenta && v.cuenta.moneda) || MON(),
      cta: String((v.cuenta && v.cuenta.id) || '').replace(/^act_/, '') })));
    const hit = todos.find(x => x.a.id === id); if (!hit) return;
    const { a, mon, cta } = hit;
    const dias = diasCompletos(a.porDia);
    // que la última etiqueta del eje X no se pise con la anterior: el paso tiene que dividir n-1
    let paso = Math.max(1, Math.ceil(dias.length / 7));
    while (paso < dias.length && (dias.length - 1) % paso !== 0 && (dias.length - 1) % paso < paso * 0.6) paso++;
    const conTc = aUsd(1, mon) != null;
    // el tooltip lleva el valor exacto del día (el eje va abreviado) y la fecha completa
    const vGasto = dias.map(d => (conTc ? aUsd(d.gasto, mon) : d.gasto) || 0);
    const graf = dias.length >= 2 ? uiLineas({
      etiquetas: dias.map(d => fCorta(d.fecha)), alto: 170, leyenda: 'abajo', xMax: dias.length / paso,
      tituloTip: (i) => fLarga(dias[i].fecha),
      series: [
        { nombre: 'Gasto', color: 'verde', valores: vGasto, area: true, fmt: (n) => (conTc ? usd(n) : plata(n, mon)) },
        { nombre: 'CTR %', color: 'rosa', eje: 'der', valores: dias.map(d => d.impresiones ? d.clics / d.impresiones * 100 : 0), fmt: (n) => pct(n, 2) },
      ],
      fmt: fmtEjePlata(vGasto, conTc ? pref() : ''), fmtDer: (n) => uiNum(n, 1) + '%',
    }) : '<div class="anun-sub-msg">Sin serie diaria para este rango.</div>';
    const filasT = [
      ['Estado', a.estado ? estadoMeta(a.estado) : '—'], ['Campaña', a.campana.nombre], ['Conjunto', a.conjunto && a.conjunto.nombre || '—'],
      ['Creado', a.creado ? fCorta(a.creado) : '—'], ['Inversión', plata(a.gasto, mon)], ['Impresiones', n0(a.impresiones)], ['Alcance', n0(a.alcance)],
      ['Frecuencia', nd(a.frecuencia, 2)], ['Clics', n0(a.clics)], ['CTR', pct(a.ctr, 2)], ['CPM', plata(a.cpm, mon)],
      ['Visitas a la landing', n0(a.visitas)], ['Leads', n0(a.leads)], ['Conversaciones DM', n0(a.conversaciones)],
      ['Costo por resultado', a.costoPorResultado != null ? plata(a.costoPorResultado, mon) : '—'],
      ...(a.registros != null ? [['Registros (landing)', n0(a.registros)], ['Calificados', n0(a.calificados)], ['CPL real', a.registros ? plata(a.gasto / a.registros, mon) : '—']] : []),
      ...(a.video ? [['Reproducciones', n0(a.video.reproducciones)], ['Vieron el 75%', n0(a.video.p75)], ['ThruPlays', n0(a.video.thruplays)]] : []),
    ];
    uiModalAbrir({
      titulo: a.nombre, sub: `${a.campana.nombre}${a.conjunto && a.conjunto.nombre ? ' · ' + a.conjunto.nombre : ''}`, ancho: '880px',
      cuerpo: `<div class="anun-det">
        <div class="anun-det-img">${a.creativo && a.creativo.thumb ? `<img src="${esc(a.creativo.thumb)}" alt="">` : '<span class="anun-cre-sin">sin miniatura</span>'}</div>
        <div class="anun-det-d"><div class="anun-det-t">${filasT.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>${graf}</div>
      </div>`,
      acciones: [
        ...(cta ? [{ texto: 'Ver en el Administrador de anuncios', onclick: `window.open('https://adsmanager.facebook.com/adsmanager/manage/ads?act=${cta}&selected_ad_ids=${encodeURIComponent(a.id)}','_blank','noopener')` }] : []),
        { texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true },
      ],
    });
  };

  /* ═══════════════════════════════ CALENDARIO ═══════════════════════════════ */
  function mesCal() { if (!S.mes) S.mes = uiHoyAR().slice(0, 7); return S.mes; }
  async function tabCalendario(cuerpo, seq) {
    const [y, m] = mesCal().split('-').map(Number);
    const desde = `${mesCal()}-01`;
    const ult = uiS(new Date(y, m, 0));
    const hasta = ult > uiHoyAR() ? uiHoyAR() : ult;
    cuerpo.innerHTML = calendarioHtml(y, m, null, null);
    if (desde > uiHoyAR()) return;
    const [act, crea] = await Promise.all([metaAds(desde, hasta).catch(e => ({ error: String(e.message || e) })), metaCreativos(desde, hasta)]);
    if (!vivo(seq)) return;
    if (act.noConf) { cuerpo.innerHTML = conectar(act.falta); return; }
    cuerpo.innerHTML = calendarioHtml(y, m, act, crea);
  }
  function calendarioHtml(y, m, act, crea) {
    const hoy = uiHoyAR();
    const mon = act && act.moneda || MON();
    const regDia = (act && act.landing && act.landing.porDia) || {};   // registros de la landing por día
    const gastoDia = {}; ((act && act.porDia) || []).forEach(d => { gastoDia[d.fecha] = d; });
    const maxG = Math.max(0, ...Object.values(gastoDia).map(d => d.gasto));
    const okCrea = crea && !crea.falta && !crea.error;
    const anuncios = okCrea ? crea.anuncios || [] : [];
    // promedio de costo POR TIPO de resultado (un anuncio de DMs se compara con los de DMs) y la parte
    // del gasto de cada anuncio sobre la misma consulta anuncio por anuncio (la del Feed), no sobre el
    // total por campaña, que es otra consulta y puede ser de otra hora
    const T = statsPorTipo(anuncios.filter(a => a.gasto > 0));   // el mismo conjunto que el Feed (los que gastaron)
    const gastoAds = anuncios.reduce((s, a) => s + (a.gasto || 0), 0);
    const lanz = {};
    anuncios.forEach(a => {
      const f = String(a.creado || a.primerDia || '').slice(0, 10);
      if (f.slice(0, 7) === `${y}-${String(m).padStart(2, '0')}`) (lanz[f] = lanz[f] || []).push(a);
    });
    const pri = new Date(y, m - 1, 1), dow = (pri.getDay() + 6) % 7, nd2 = new Date(y, m, 0).getDate();
    const dias = Object.values(gastoDia).filter(d => d.gasto > 0);
    const total = dias.reduce((s, d) => s + d.gasto, 0);
    const pico = dias.slice().sort((a, b) => b.gasto - a.gasto)[0];
    // agendas de pauta por día de call (el cruce gasto ↔ agendas del tooltip)
    const agDia = {}; filas().forEach(x => { if (esPauta(x)) { const f = fechaCall(x); if (f.slice(0, 7) === `${y}-${String(m).padStart(2, '0')}`) agDia[f] = (agDia[f] || 0) + 1; } });
    const leer = act && !act.error;
    const celdas = [];
    for (let i = 0; i < dow; i++) celdas.push('<div class="anun-cal-d fuera"></div>');
    for (let d = 1; d <= nd2; d++) {
      const f = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const g = gastoDia[f];
      const ls = (lanz[f] || []).sort((a, b) => b.gasto - a.gasto);
      const nivel = g && maxG ? g.gasto / maxG : 0;
      const pills = ls.slice(0, 6).map(a => {
        const tp = a.tipoResultado, prom = (T[tp] || {}).prom;
        const bien = prom != null && a.costoPorResultado != null && a.costoPorResultado <= prom;
        const tPill = [a.nombre, a.campana.nombre, `Inversión ${plata(a.gasto, mon)}${gastoAds ? ' · ' + pctParte(a.gasto / gastoAds * 100) + ' del gasto de los anuncios del mes' : ''}`,
          a.costoPorResultado != null ? `${plata(a.costoPorResultado, mon)} por ${unidadRes(tp, 1)}${prom != null ? ` · ${bien ? 'debajo' : 'encima'} del promedio de los anuncios de ${unidadRes(tp, 2)} (${plata(prom, mon)})` : ''}` : 'Sin resultados en el mes',
          'Clic: ver el anuncio'];
        return `<button type="button" class="anun-cal-ev ${bien ? 'bien' : ''}" onclick="event.stopPropagation();anunAnuncio('${esc(a.id)}')"${tipAttr(tPill)}>
          <span>● ${esc(a.nombre)}</span><small>${plata(a.gasto, mon)} · ${a.costoPorResultado != null ? plata(a.costoPorResultado, mon) + ' c/res.' : 'sin resultados'}</small></button>`;
      }).join('');
      // tooltip del día: gasto (y su parte del mes), impresiones, clics, CTR, anuncios creados y agendas de pauta
      const tDia = [fLarga(f),
        !act ? 'Consultando Meta…' : act.error ? 'Sin datos de Meta' : g && g.gasto > 0 ? `Gasto ${plata(g.gasto, mon)}${total ? ' · ' + pctParte(g.gasto / total * 100) + ' del mes' : ''}` : f > hoy ? 'Todavía no llegó' : 'Sin gasto en Meta',
        leer && g && g.impresiones ? `${n0(g.impresiones)} impresiones · ${n0(g.clics)} clics · CTR ${pct(g.clics / g.impresiones * 100, 2)}` : '',
        regDia[f] ? `${n0(regDia[f].registros)} registro${regDia[f].registros === 1 ? '' : 's'}${regDia[f].calificados ? ` · ${n0(regDia[f].calificados)} calificado${regDia[f].calificados === 1 ? '' : 's'}` : ''}${g && g.gasto > 0 ? ' · CPL ' + plata(g.gasto / regDia[f].registros, mon) : ''}` : '',
        leer && pico && g && g.fecha === pico.fecha && dias.length > 1 ? 'Día pico del mes' : '',
        ls.length ? `${n0(ls.length)} anuncio${ls.length === 1 ? '' : 's'} creado${ls.length === 1 ? '' : 's'} ese día` : '',
        agDia[f] ? `${n0(agDia[f])} agenda${agDia[f] === 1 ? '' : 's'} de pauta con call ese día` : '',
        f <= hoy || agDia[f] ? 'Clic: ver el día' : ''];
      // un día que no llegó y no tiene agendas no tiene nada que abrir: ni mano ni clic
      const clicable = f <= hoy || !!agDia[f];
      celdas.push(`<div class="anun-cal-d${f === hoy ? ' hoy' : ''}${f > hoy ? ' futuro' : ''}${clicable ? ' clic' : ''}"${clicable ? ` onclick="anunDia('${f}')"` : ''} style="--nivel:${nivel.toFixed(3)}"${tipAttr(tDia)}>
        <div class="anun-cal-top"><span class="anun-cal-n">${d}</span>${g && g.gasto > 0 ? `<span class="anun-cal-gasto">${plata(g.gasto, mon)}</span>` : ''}</div>
        ${pills}${ls.length > 6 ? `<span class="anun-cal-mas"${tipAttr([`${ls.length - 6} anuncio${ls.length - 6 === 1 ? '' : 's'} más creado${ls.length - 6 === 1 ? '' : 's'} ese día`, ...ls.slice(6, 14).map(a => `${a.nombre} · ${plata(a.gasto, mon)}`), ls.length > 14 ? `y ${ls.length - 14} más` : '', 'Clic: ver el día'])}>+${ls.length - 6} más</span>` : ''}
        ${g && g.gasto > 0 ? `<i class="anun-cal-barra" style="width:${(nivel * 100).toFixed(1)}%"></i>` : ''}
      </div>`);
    }
    while (celdas.length % 7) celdas.push('<div class="anun-cal-d fuera"></div>');
    let pie = '';
    if (!act) pie = '<span>Consultando Meta…</span>';
    else if (act.error) pie = `<span class="mal">No pude leer el gasto de Meta: ${esc(act.error)}</span>`;
    else pie = `<span>Total del mes <b>${plata(total, mon)}</b></span>${act.landing && act.landing.registros ? `<span>Registros <b>${n0(act.landing.registros)}</b> · CPL real <b>${plata(total / act.landing.registros, mon)}</b></span>` : ''}<span>Promedio por día con gasto <b>${dias.length ? plata(total / dias.length, mon) : '—'}</b></span><span>Día pico ${pico ? `<button type="button" class="anun-link anun-pico" onclick="anunDia('${pico.fecha}')"${tipAttr([fLarga(pico.fecha), `Gasto ${plata(pico.gasto, mon)}${total ? ' · ' + pctParte(pico.gasto / total * 100) + ' del mes' : ''}`, 'Clic: ver el día'])}>${fCorta(pico.fecha) + ' · ' + plata(pico.gasto, mon)}</button>` : '<b>—</b>'}</span>`;
    const nota = !crea ? '' : crea.falta ? `<span class="tenue">Lanzamientos de anuncios: ${FALTA_CREA}</span>`
      : crea.error ? `<span class="tenue">Sin lanzamientos: ${esc(crea.error)}</span>` : `<span class="tenue">Las pastillas son los anuncios creados ese día; en verde los que salen más baratos que el promedio de su tipo de resultado (leads con leads, DMs con DMs).</span>`;
    return `<div class="anun-cal">
      <div class="anun-cal-sem">${['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(x => `<span>${x}</span>`).join('')}</div>
      <div class="anun-cal-g">${celdas.join('')}</div>
    </div>
    <div class="anun-cal-pie">${pie}${nota}</div>`;
  }
  // el detalle de un día (lo abre el calendario y también la curva de Inversión del Dashboard): se
  // busca el día en el mes del calendario y, si no está, en cualquier rango ya consultado a Meta
  window.anunDia = (f) => {
    tipFuera();
    const [y, m] = f.split('-').map(Number);
    const desde = `${f.slice(0, 7)}-01`, ult = uiS(new Date(y, m, 0)), hasta = ult > uiHoyAR() ? uiHoyAR() : ult;
    const tiene = (v) => v && !v.error && (v.porDia || []).some(d => d.fecha === f);
    let k = desde + '|' + hasta;
    if (!tiene(S.metaVal[k])) k = Object.keys(S.metaVal).find(x => tiene(S.metaVal[x])) || k;
    const act = S.metaVal[k];
    const crea = S.creaVal[desde + '|' + hasta] || S.creaVal[k];
    const mon = act && act.moneda || MON();
    const g = act && (act.porDia || []).find(d => d.fecha === f);
    const rg = (act && act.landing && act.landing.porDia && act.landing.porDia[f]) || { registros: 0, calificados: 0 };
    const okCrea = crea && crea.anuncios;
    const ads = okCrea ? crea.anuncios.filter(a => String(a.creado || a.primerDia || '').slice(0, 10) === f) : [];
    // en qué anuncios se fue el gasto de ese día (serie diaria de cada anuncio)
    const gastoAds = okCrea ? crea.anuncios.map(a => ({ a, d: (a.porDia || []).find(x => x.fecha === f) })).filter(x => x.d && x.d.gasto > 0).sort((p, q) => q.d.gasto - p.d.gasto) : [];
    const totDia = gastoAds.reduce((s, x) => s + x.d.gasto, 0);
    const ags = filas().filter(x => esPauta(x) && fechaCall(x) === f);
    const t = (k2, v) => `<div class="anun-mini"><span>${k2}</span><b>${v}</b></div>`;
    uiModalAbrir({
      titulo: fLarga(f), sub: 'Gasto de Meta, registros, anuncios lanzados y agendas de pauta de ese día', ancho: '720px',
      cuerpo: `<div class="anun-minis">${t('Gasto', g ? plata(g.gasto, mon) : '—')}${t('Impresiones', g ? n0(g.impresiones) : '—')}${t('Clics', g ? n0(g.clics) : '—')}${t('CTR', g && g.impresiones ? pct(g.clics / g.impresiones * 100, 2) : '—')}${t('CPM', g && g.impresiones ? plata(g.gasto / g.impresiones * 1000, mon) : '—')}${t('Registros', n0(rg.registros))}${t('CPL real', g && rg.registros ? plata(g.gasto / rg.registros, mon) : '—')}</div>
        ${gastoAds.length ? `<div class="ui-sec">En qué anuncios se fue el gasto</div>${listaB(gastoAds.slice(0, 8).map(x => ({ etiqueta: x.a.nombre, sub: x.a.campana.nombre, valor: x.d.gasto, texto: plata(x.d.gasto, mon), onclick: `anunAnuncio('${String(x.a.id).replace(/[^\w-]/g, '')}')` })), { total: totDia, compacta: true })}${gastoAds.length > 8 ? `<p class="anun-pie">Y ${gastoAds.length - 8} anuncio${gastoAds.length - 8 === 1 ? '' : 's'} más.</p>` : ''}` : ''}
        <div class="ui-sec">Anuncios creados ese día</div>
        ${ads.length ? `<div class="anun-lista">${ads.map(a => `<button type="button" class="anun-lista-f" onclick="anunAnuncio('${esc(a.id)}')"><b>${esc(a.nombre)}</b><span class="anun-lista-sub">${esc(a.campana.nombre)}</span><em>${plata(a.gasto, mon)}</em></button>`).join('')}</div>` : `<div class="anun-sub-msg">${crea && crea.falta ? FALTA_CREA : 'Ninguno.'}</div>`}
        <div class="ui-sec">Agendas de pauta con call ese día</div>
        ${listaAgendas(ags, false, 'Ninguna.')}`,
      acciones: [{ texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }],
    });
  };
  const colorEstado = (e) => ({ Cerrada: 'verde', Presentada: 'azul', Confirmada: 'cian', Pendiente: 'gris', 'Re-agenda': 'ambar', 'No-show': 'violeta', Cancelada: 'rojo', Descalificada: 'rojo' })[e] || 'gris';

  /* ═══════════════════════════════ PLANIFICAR ═══════════════════════════════ */
  async function tabPlanificar(cuerpo, seq) {
    const campMeta = () => { const v = creaCache(); return v && v.campanas ? v.campanas : null; };
    if (S.plan) cuerpo.innerHTML = kanbanHtml(campMeta(), creaCache());
    else cuerpo.innerHTML = `<div class="anun-sub-msg">Cargando el tablero…</div>`;
    try { S.plan = await dbLista(COL_PLAN); } catch (e) {
      if (!vivo(seq)) return;
      cuerpo.innerHTML = vacio({ ico: 'alerta', titulo: 'No pude leer el tablero', texto: esc(e.message || e) }); return;
    }
    if (!vivo(seq)) return;
    cuerpo.innerHTML = kanbanHtml(campMeta(), creaCache());
    // el estado real de las campañas en Meta (si la función nueva está) llega después y no traba el tablero
    if (!creaCache()) {
      const crea = await metaCreativos(...claveCrea());
      if (vivo(seq) && S.tab === 'planificar') cuerpo.innerHTML = kanbanHtml(crea && crea.campanas ? crea.campanas : null, crea);
    }
  }
  function kanbanHtml(campMeta, crea) {
    const porId = new Map((campMeta || []).map(c => [c.id, c]));
    const total = (S.plan || []).length;
    const cols = ESTADOS_PLAN.map(e => {
      const docs = (S.plan || []).filter(d => (d.estado || 'planificada') === e.id).sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9));
      // tooltip de la columna: cuántas campañas, su parte del tablero y el presupuesto diario cargado
      const conPres = docs.filter(d => num(d.presupuesto) > 0);
      const pres = conPres.reduce((s, d) => s + num(d.presupuesto), 0);
      const tCol = [e.titulo, `${n0(docs.length)} campaña${docs.length === 1 ? '' : 's'}${total ? ' · ' + pct(docs.length / total * 100, 0) + ' del tablero' : ''}`,
        conPres.length ? `Presupuesto cargado: ${pref()}${uiNum(pres)}/día${conPres.length < docs.length ? ` (${conPres.length} de ${docs.length} lo tienen)` : ''}` : docs.length ? 'Ninguna tiene presupuesto cargado' : ''];
      return `<div class="ui-kb-col anun-kb-col" data-col="${e.id}">
        <div class="anun-kb-h"${tipAttr(tCol)}><i style="background:${e.color}"></i><b>${esc(e.titulo)}</b><em>${docs.length}</em></div>
        <div class="ui-kb-l anun-kb-l">${docs.length ? docs.map(d => `<div class="ui-kb-t anun-kb-t" draggable="true" data-id="${esc(d.id)}" onclick="anunPlanEditar('${esc(d.id)}')">${tarjetaPlan(d, porId)}</div>`).join('') : '<div class="ui-kb-vacio anun-kb-vacio">Sin campañas</div>'}</div>
      </div>`;
    }).join('');
    return `<div class="ui-kb anun-kb" data-mover="anunPlanMover">${cols}</div>
      <p class="anun-pie">Arrastrá las tarjetas entre columnas; tocá una para editarla. Se guarda para todo el equipo. ${campMeta ? 'Si una campaña está vinculada a Meta, la tarjeta muestra su estado real.' : crea && crea.falta ? 'Conectá tu cuenta de Meta (Integraciones) para ver en cada tarjeta el estado real de su campaña.' : crea && crea.error ? 'No pude leer el estado de las campañas en Meta: ' + esc(crea.error) : 'Leyendo el estado de las campañas en Meta…'}</p>`;
  }
  function tarjetaPlan(d, porId) {
    const meta = d.metaId ? porId.get(d.metaId) : null;
    const estMeta = meta ? (meta.estado === 'ACTIVE' ? 'activa' : ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(meta.estado) ? 'pausada' : null) : null;
    const difiere = estMeta && estMeta !== d.estado;
    return `<b>${esc(d.nombre || 'Sin nombre')}</b>
      <div class="anun-kb-meta">${d.objetivo ? `<span class="anun-chip">${esc(d.objetivo)}</span>` : ''}${d.presupuesto ? `<span>${pref()}${esc(uiNum(num(d.presupuesto)))}/día</span>` : ''}${d.inicio ? `<span>${uiIco('calendario', 12)}${esc(fCorta(d.inicio))}</span>` : ''}</div>
      ${d.angulo ? `<small>${esc(String(d.angulo).slice(0, 110))}</small>` : ''}
      ${meta ? `<div class="anun-kb-metaest${difiere ? ' difiere' : ''}"${tipAttr(['Estado real en Meta', `${meta.nombre || d.metaNombre || ''}: ${estadoMeta(meta.estado)}`, difiere ? `En el tablero está en "${(ESTADOS_PLAN.find(e => e.id === d.estado) || {}).titulo || d.estado}": movela para que coincida` : 'Coincide con el tablero'])}>${uiIco('link', 12)}Meta: ${esc(estadoMeta(meta.estado))}${difiere ? ' · no coincide' : ''}</div>` : d.metaId ? `<div class="anun-kb-metaest">${uiIco('link', 12)}vinculada a Meta</div>` : ''}`;
  }
  window.anunPlanMover = async (id, col) => {
    const d = (S.plan || []).find(x => x.id === id); if (!d || d.estado === col) return;
    const antes = d.estado;
    d.estado = col;
    // reordenar la columna destino según el DOM
    const orden = [...document.querySelectorAll(`.anun-kb-col[data-col="${col}"] .anun-kb-t`)].map(t => t.dataset.id);
    const cambios = orden.map((x, i) => ({ id: x, orden: i, ...(x === id ? { estado: col } : {}) }));
    orden.forEach((x, i) => { const dd = S.plan.find(p => p.id === x); if (dd) dd.orden = i; });
    pintarConteos();
    try { await dbGuardarVarios(COL_PLAN, cambios); uiToast('Movida a ' + (ESTADOS_PLAN.find(e => e.id === col) || {}).titulo, 'ok'); }
    catch (e) { d.estado = antes; uiToast('No se pudo guardar: ' + e.message, 'mal'); pintarTab(); }
  };
  function pintarConteos() {
    document.querySelectorAll('.anun-kb-col').forEach(c => {
      const n = c.querySelectorAll('.anun-kb-t').length;
      const em = c.querySelector('.anun-kb-h em'); if (em) em.textContent = n;
      const l = c.querySelector('.anun-kb-l');
      if (!n && l && !l.querySelector('.anun-kb-vacio')) l.innerHTML = '<div class="ui-kb-vacio anun-kb-vacio">Sin campañas</div>';
    });
  }
  function formPlan(d) {
    const campMeta = (() => { const v = Object.values(S.creaVal).find(x => x && x.campanas && x.campanas.length); return v ? v.campanas : []; })();
    const metaAdsCamps = (() => { const v = Object.values(S.metaVal).find(x => x && x.campanas && x.campanas.length); return v ? v.campanas.map(c => ({ id: c.id, nombre: c.nombre })) : []; })();
    const opts = [...new Map([...campMeta, ...metaAdsCamps].map(c => [c.id, c])).values()];
    const objetivos = ['Registros (webinar)', 'Leads (formulario)', 'Mensajes (DM)', 'Ventas', 'Tráfico', 'Video / alcance', 'Retargeting'];
    return `<div class="ui-campos" style="--n:2">
      <label class="ui-campo" style="grid-column:1/-1"><span>Nombre</span><input id="anunPlNombre" value="${esc(d.nombre || '')}" placeholder="Ej: Webinar de noviembre · captación"></label>
      <label class="ui-campo"><span>Objetivo</span><select id="anunPlObj"><option value="">—</option>${objetivos.map(o => `<option${o === d.objetivo ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <label class="ui-campo"><span>Estado</span><select id="anunPlEst">${ESTADOS_PLAN.map(e => `<option value="${e.id}"${e.id === (d.estado || 'planificada') ? ' selected' : ''}>${esc(e.titulo)}</option>`).join('')}</select></label>
      <label class="ui-campo"><span>Presupuesto diario (${MON()})</span><input id="anunPlPres" type="number" min="0" step="1" value="${esc(d.presupuesto || '')}"></label>
      <label class="ui-campo"><span>Campaña de Meta vinculada</span><select id="anunPlMeta"><option value="">Sin vincular</option>${opts.map(c => `<option value="${esc(c.id)}"${c.id === d.metaId ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}${d.metaId && !opts.some(c => c.id === d.metaId) ? `<option value="${esc(d.metaId)}" selected>${esc(d.metaNombre || d.metaId)}</option>` : ''}</select></label>
      <label class="ui-campo"><span>Inicio</span><input id="anunPlIni" type="date" value="${esc(d.inicio || '')}"></label>
      <label class="ui-campo"><span>Fin</span><input id="anunPlFin" type="date" value="${esc(d.fin || '')}"></label>
      <label class="ui-campo" style="grid-column:1/-1"><span>Ángulo y creativos</span><input id="anunPlAng" value="${esc(d.angulo || '')}" placeholder="Qué ángulo, qué piezas, quién graba"></label>
      <label class="ui-campo" style="grid-column:1/-1"><span>Notas</span><textarea id="anunPlNotas" placeholder="Audiencia, exclusiones, presupuesto por fase…">${esc(d.notas || '')}</textarea></label>
    </div>`;
  }
  window.anunPlanNuevo = () => {
    uiModalAbrir({ titulo: 'Nueva campaña', sub: 'Se guarda en el tablero de Planificar para todo el equipo', cuerpo: formPlan({}), ancho: '640px',
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Crear campaña', onclick: "anunPlanGuardar('')", pri: true }] });
    setTimeout(() => { const i = document.getElementById('anunPlNombre'); if (i) i.focus(); }, 30);
  };
  window.anunPlanEditar = (id) => {
    tipFuera();   // el chip "Meta: …" de la tarjeta tiene tooltip: que no quede encima del formulario
    const d = (S.plan || []).find(x => x.id === id); if (!d) return;
    uiModalAbrir({ titulo: d.nombre || 'Campaña', sub: `Creada ${d.creado ? fCorta(d.creado) : ''}${d.actualizado ? ' · editada ' + fCorta(d.actualizado) : ''}`, cuerpo: formPlan(d), ancho: '640px',
      acciones: [{ texto: 'Borrar', onclick: `anunPlanBorrar('${esc(id)}')` }, { texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: `anunPlanGuardar('${esc(id)}')`, pri: true }] });
  };
  window.anunPlanGuardar = async (id) => {
    const v = (x) => { const el = document.getElementById(x); return el ? el.value.trim() : ''; };
    const nombre = v('anunPlNombre');
    if (!nombre) { uiToast('Ponele un nombre a la campaña', 'mal'); return; }
    const metaSel = document.getElementById('anunPlMeta');
    const doc = { nombre, objetivo: v('anunPlObj'), estado: v('anunPlEst') || 'planificada', presupuesto: v('anunPlPres'), metaId: v('anunPlMeta'),
      metaNombre: metaSel && metaSel.selectedOptions[0] ? metaSel.selectedOptions[0].textContent : '', inicio: v('anunPlIni'), fin: v('anunPlFin'), angulo: v('anunPlAng'), notas: v('anunPlNotas') };
    if (id) doc.id = id;
    else doc.orden = (S.plan || []).filter(d => (d.estado || 'planificada') === doc.estado).length;
    try {
      const g = await dbGuardar(COL_PLAN, doc);
      S.plan = (S.plan || []).filter(d => d.id !== g.id).concat([g]);
      uiModalCerrar(); uiToast(id ? 'Campaña guardada' : 'Campaña creada', 'ok');
      if (S.tab === 'planificar') pintarTab();
    } catch (e) { uiToast('No se pudo guardar: ' + e.message, 'mal'); }
  };
  window.anunPlanBorrar = async (id) => {
    const d = (S.plan || []).find(x => x.id === id);
    if (!confirm(`¿Borrar "${d ? d.nombre : 'esta campaña'}" del tablero? No toca nada en Meta.`)) return;
    try { await dbBorrar(COL_PLAN, id); S.plan = (S.plan || []).filter(x => x.id !== id); uiModalCerrar(); uiToast('Borrada', 'ok'); pintarTab(); }
    catch (e) { uiToast('No se pudo borrar: ' + e.message, 'mal'); }
  };

  /* ═══════════════════════════════ CONTACTOS ═══════════════════════════════ */
  function contactosLista() {
    const r = uiPerRango(PER);
    return agendas(r).pauta.slice().sort((a, b) => fechaCall(b).localeCompare(fechaCall(a)));
  }
  async function tabContactos(cuerpo) {
    if (!hayAgendas()) { cuerpo.innerHTML = '<div class="anun-sub-msg">Cargando las agendas del pipeline…</div>'; return; }
    const r = uiPerRango(PER);
    // la tabla es la lista de contactos del período entero (también las calls que vienen, marcadas
    // "próxima"); las cifras de arriba van con las calls hasta hoy, como el Dashboard
    const todas = contactosLista();
    const esProx = (x) => cortaHoy(r) && fechaCall(x) > r.hastaHoy;
    const nProx = todas.filter(esProx).length;
    const conteo = {}; todas.forEach(x => { conteo[x.Estado || 'Sin estado'] = (conteo[x.Estado || 'Sin estado'] || 0) + 1; });
    if (S.cont.estado === 'proximas' && !nProx) S.cont.estado = 'todas';   // otro período, sin calls por venir
    const est = S.cont.estado;
    const q = nom(S.cont.q);
    const ASIS = ['Presentada', 'Cerrada'];
    const pasa = (x) => est === 'todas' || (est === 'proximas' ? esProx(x) : est === 'asistidas' ? ASIS.includes(x.Estado) : (x.Estado || 'Sin estado') === est);
    const vis = todas.filter(x => pasa(x) && (!q || nom([x.Nombre, x.Email, x.Instagram, x.Closer, x.Setter].join(' ')).includes(q)));
    const nAsis = todas.filter(x => ASIS.includes(x.Estado)).length;
    const chips = [{ id: 'todas', texto: 'Todas', badge: todas.length }, ...(nAsis ? [{ id: 'asistidas', texto: 'Asistidas', badge: nAsis, color: 'azul' }] : []),
      ...(nProx ? [{ id: 'proximas', texto: 'Próximas', badge: nProx, color: 'cian' }] : []),
      ...Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ id: k, texto: k, badge: n, color: colorEstado(k) }))];
    const tel = (x) => String(x.WhatsApp || '').replace(/\D/g, '');
    const filasH = vis.map(x => `<tr>
      <td><b>${esc(x.Nombre || '—')}</b>${x.Instagram ? `<small>@${esc(String(x.Instagram).replace(/^@/, ''))}</small>` : ''}</td>
      <td class="mono-f">${esc(fCorta(fechaCall(x)))}${x.Hora ? ` · ${esc(String(x.Hora).slice(-5))}` : ''}${esProx(x) ? '<em class="anun-prox">próxima</em>' : ''}</td>
      <td><span class="anun-chip">${esc(x.Origen || '—')}</span></td>
      <td>${uiEstado(x.Estado || '—', colorEstado(x.Estado))}</td>
      <td>${esc(x.Capital || '—')}</td>
      <td>${esc(x.Closer || '—')}</td><td>${esc(x.Setter || '—')}</td>
      <td class="num">${num(x.Monto) ? usd(num(x.Monto)) : '—'}</td>
      <td class="anun-acc">${tel(x) ? `<a href="https://wa.me/${tel(x)}" target="_blank" rel="noopener" title="WhatsApp">${uiIco('mensaje', 15)}</a>` : ''}${x.Email ? `<a href="mailto:${esc(x.Email)}" title="${esc(x.Email)}">${uiIco('enviar', 15)}</a>` : ''}</td>
    </tr>`).join('');
    const A = agendas(rangoHoy(r)), F = futuras(r);
    // las 4 cifras: tooltip con la conversión y clic que filtra la tabla de abajo. Las tasas van sobre
    // las calls hasta hoy: una call que todavía no pasó no puede estar asistida ni cerrada.
    const pctC = (a, b) => (b ? pctFino(a / b * 100) : '—');
    const hh = cortaHoy(r) ? ' con call hasta hoy' : '';
    const conMonto = A.cierres.length - A.sinMonto.length;
    const minis = [
      { k: 'Agendas de pauta', v: n0(A.pauta.length) + (F.length ? `<small>+${n0(F.length)} próxima${F.length === 1 ? '' : 's'}</small>` : ''), f: 'todas',
        tip: ['Agendas de pauta', `${n0(A.pauta.length)}${hh || ' en el período'}`, F.length ? `Y ${n0(F.length)} más con call después de hoy: están en la tabla como «próxima» y todavía no entran en las tasas` : '', `Origen ${origenesPauta().join(' o ')}, por fecha de la call`, 'Clic: ver todas'] },
      { k: 'Asistidas', v: n0(A.asis.length), f: 'asistidas', tip: ['Asistidas', `${n0(A.asis.length)} de ${n0(A.pauta.length)} agendas${hh} · show-up ${pctC(A.asis.length, A.pauta.length)}`, 'Presentada o Cerrada', 'Clic: filtrar la tabla'] },
      { k: 'Cierres', v: n0(A.cierres.length), f: 'Cerrada', tip: ['Cierres', `${n0(A.cierres.length)} de ${n0(A.asis.length)} asistida${A.asis.length === 1 ? '' : 's'} · ${pctC(A.cierres.length, A.asis.length)}`, `${pctC(A.cierres.length, A.pauta.length)} de las agendas${hh}`, 'Clic: filtrar la tabla'] },
      { k: 'Facturación', v: usd(A.fact), f: 'Cerrada', tip: ['Facturación', `${usd(A.fact)} de ${n0(A.cierres.length)} cierre${A.cierres.length === 1 ? '' : 's'}`, conMonto > 0 ? `Ticket promedio ${usd(A.fact / conMonto)}` : '', A.sinMonto.length ? `${n0(A.sinMonto.length)} sin monto cargado` : '', 'Clic: ver los cierres'] },
    ];
    cuerpo.innerHTML = `<div class="anun-cont">
      <div class="anun-cont-kpis">
        ${minis.map(x => `<button type="button" class="anun-mini clic${est === x.f && (x.k !== 'Facturación') ? ' on' : ''}" onclick="anunContEstado('${x.f}')"${tipAttr(x.tip)}><span>${x.k}</span><b>${x.v}</b></button>`).join('')}
      </div>
      <div class="anun-cont-barra">${uiChips(chips, est, 'anunContEstado', 'caja')}
        <div class="der"><label class="anun-buscar">${uiIco('buscar', 14)}<input type="search" placeholder="Buscar nombre, mail, closer…" value="${esc(S.cont.q)}" oninput="anunContBuscar(this.value)"></label>
        <button type="button" class="anun-btn2" onclick="anunCsvContactos()">${uiIco('descargar', 14)}Exportar CSV</button></div></div>
      <section class="anun-card anun-camp"><div class="anun-tabla-w"><table class="anun-tabla anun-tabla-cont">
        <thead><tr><th>NOMBRE</th><th>CALL</th><th>ORIGEN</th><th>ESTADO</th><th>CAPITAL</th><th>CLOSER</th><th>SETTER</th><th class="num">MONTO</th><th></th></tr></thead>
        <tbody>${filasH || `<tr><td colspan="9" class="anun-sub-msg">${todas.length ? 'Nadie coincide con el filtro.' : 'Sin agendas de pauta en este período.'}</td></tr>`}</tbody>
      </table></div></section>
      <p class="anun-pie">Las agendas cuyo origen cuenta como pauta (${esc(origenesPauta().join(' · '))}), por fecha de la call. <button type="button" class="anun-link" onclick="anunOrigenes()">Cambiar qué orígenes cuentan</button></p>
    </div>`;
  }
  window.anunContEstado = (id) => { tipFuera(); S.cont.estado = id; if (S.tab === 'contactos') tabContactos(document.getElementById('anunCuerpo')); };
  let tBusc = null;
  window.anunContBuscar = (q) => {
    S.cont.q = q; clearTimeout(tBusc);
    tBusc = setTimeout(() => { const c = document.getElementById('anunCuerpo'); tabContactos(c).then(() => { const i = c.querySelector('.anun-cont-barra input'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } }); }, 200);
  };
  window.anunCsvContactos = () => {
    const l = contactosLista(); const r = uiPerRango(PER);
    descargarCsv(`agendas-pauta_${r.desde}_${r.hasta}.csv`, ['Nombre', 'Email', 'WhatsApp', 'Instagram', 'Fecha call', 'Hora', 'Origen', 'Estado', 'Capital', 'Closer', 'Setter', 'Monto'],
      l.map(x => [x.Nombre, x.Email, x.WhatsApp, x.Instagram, fechaCall(x), x.Hora, x.Origen, x.Estado, x.Capital, x.Closer, x.Setter, num(x.Monto) || '']));
  };

  /* ═══════════════════════════════ AUDIENCIAS ═══════════════════════════════ */
  // prefijo telefónico → país: [prefijo, ISO-2, nombre, código numérico del mapa, largo total mín, máx]
  // El largo importa: "351…" es Portugal con 12 dígitos y Córdoba (sin el 54) con 10; "11…" de 10
  // dígitos es Buenos Aires, no Estados Unidos.
  const PAISES = [
    ['54', 'AR', 'Argentina', '032', 12, 13], ['598', 'UY', 'Uruguay', '858', 11, 11], ['595', 'PY', 'Paraguay', '600', 12, 12], ['591', 'BO', 'Bolivia', '068', 11, 11],
    ['56', 'CL', 'Chile', '152', 11, 11], ['51', 'PE', 'Perú', '604', 11, 11], ['57', 'CO', 'Colombia', '170', 12, 12], ['58', 'VE', 'Venezuela', '862', 12, 12],
    ['593', 'EC', 'Ecuador', '218', 11, 12], ['52', 'MX', 'México', '484', 12, 13], ['502', 'GT', 'Guatemala', '320', 11, 11], ['503', 'SV', 'El Salvador', '222', 11, 11],
    ['504', 'HN', 'Honduras', '340', 11, 11], ['505', 'NI', 'Nicaragua', '558', 11, 11], ['506', 'CR', 'Costa Rica', '188', 11, 11], ['507', 'PA', 'Panamá', '591', 11, 11],
    ['53', 'CU', 'Cuba', '192', 10, 11], ['55', 'BR', 'Brasil', '076', 12, 13], ['34', 'ES', 'España', '724', 11, 11], ['351', 'PT', 'Portugal', '620', 12, 12],
    ['39', 'IT', 'Italia', '380', 11, 13], ['33', 'FR', 'Francia', '250', 11, 11], ['49', 'DE', 'Alemania', '276', 11, 14], ['44', 'GB', 'Reino Unido', '826', 12, 12],
    ['41', 'CH', 'Suiza', '756', 11, 11], ['31', 'NL', 'Países Bajos', '528', 11, 11], ['32', 'BE', 'Bélgica', '056', 10, 11], ['353', 'IE', 'Irlanda', '372', 11, 12],
    ['972', 'IL', 'Israel', '376', 11, 12], ['971', 'AE', 'Emiratos Árabes', '784', 11, 12], ['61', 'AU', 'Australia', '036', 11, 11], ['64', 'NZ', 'Nueva Zelanda', '554', 10, 11],
    ['86', 'CN', 'China', '156', 13, 13], ['81', 'JP', 'Japón', '392', 11, 12], ['1809', 'DO', 'Rep. Dominicana', '214', 11, 11], ['1829', 'DO', 'Rep. Dominicana', '214', 11, 11],
    ['1849', 'DO', 'Rep. Dominicana', '214', 11, 11], ['1787', 'PR', 'Puerto Rico', '630', 11, 11], ['1', 'US', 'Estados Unidos', '840', 11, 11],
  ].sort((a, b) => b[0].length - a[0].length);
  const PAIS_ISO = {}; PAISES.forEach(p => { if (!PAIS_ISO[p[1]]) PAIS_ISO[p[1]] = { iso: p[1], nombre: p[2], num: p[3] }; });
  // teléfono normalizado con código de país (sin "+"), como lo pide Meta; los números locales sin
  // código (10 dígitos, o con el 0 de larga distancia) se les pone el prefijo del negocio (cliente.prefijoTel).
  function telNorm(t) {
    const crudo = String(t || '').trim();
    let d = crudo.replace(/\D/g, '');
    const conCodigo = /^(\+|00)/.test(crudo);
    if (d.startsWith('00')) d = d.slice(2);
    if (!conCodigo) {
      if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
      if (d.length === 10) { const p = (window.MHQ && MHQ.cliente && MHQ.cliente.prefijoTel) || ''; return p ? p + d : d; }
      if (d.length < 10) return '';
    }
    return d.length >= 10 ? d : '';
  }
  function paisDeTel(t) {
    const d = telNorm(t);
    if (!d) return null;
    const p = PAISES.find(x => d.startsWith(x[0]) && d.length >= x[4] && d.length <= x[5]);
    return p ? p[1] : null;
  }
  // compradores: las agendas cerradas del pipeline, sin repetir (en el hub original sumaba los clientes del Tracker)
  function compradores() {
    const out = [], vistos = new Map();
    const clave = (x) => (x.email && 'e:' + x.email) || (x.tel && 't:' + x.tel) || (x.nombre && 'n:' + nom(x.nombre)) || null;
    const sumar = (x) => {
      const ks = [x.email && 'e:' + x.email, x.tel && 't:' + x.tel, x.nombre && 'n:' + nom(x.nombre)].filter(Boolean);
      const ya = ks.map(k => vistos.get(k)).find(Boolean);
      if (ya) { ya.email = ya.email || x.email; ya.tel = ya.tel || x.tel; ya.pais = ya.pais || x.pais; if (x.fuente && !ya.fuente.includes(x.fuente)) ya.fuente += ' + ' + x.fuente; ks.forEach(k => vistos.set(k, ya)); return; }
      if (!clave(x)) return;
      out.push(x); ks.forEach(k => vistos.set(k, x));
    };
    filas().filter(x => x.Estado === 'Cerrada').forEach(x => {
      const tel = telNorm(x.WhatsApp);
      sumar({ nombre: x.Nombre, email: String(x.Email || '').trim().toLowerCase().includes('@') ? String(x.Email).trim().toLowerCase() : '', tel, pais: paisDeTel(x.WhatsApp), fuente: 'Agenda cerrada' });
    });
    return out.filter(x => x.email || x.tel);
  }
  // Audiencias y Planificar piden los anuncios con el mismo rango que el Dashboard: si ya se vio el
  // Dashboard, no hay otra consulta a Meta (la cuenta tiene límite de llamadas).
  const claveCrea = () => { const r = uiPerRango(PER); return [r.desde, r.hastaHoy]; };
  const creaCache = () => { const [d, h] = claveCrea(); return S.creaVal[d + '|' + h] || Object.values(S.creaVal).find(v => v && v.permisos) || null; };
  async function tabAudiencias(cuerpo, seq) {
    if (!S.aud) { try { const d = await dbLista(COL_AUD); S.aud = d.find(x => x.id === 'lookalike') || {}; } catch (e) { S.aud = {}; } }
    if (!vivo(seq)) return;
    const crea = creaCache();
    cuerpo.innerHTML = audienciasHtml(crea);
    pintarMapa();
    if (!crea) {
      const c2 = await metaCreativos(...claveCrea());
      if (vivo(seq)) { cuerpo.innerHTML = audienciasHtml(c2); pintarMapa(); }
    }
  }
  function cuentaNombre() {
    const v = Object.values(S.metaVal).find(x => x && x.cuenta);
    return v ? v.cuenta : 'Cuenta de Meta';
  }
  function audienciasHtml(crea) {
    const cs = compradores();
    const porPais = {}; let sinPais = 0;
    cs.forEach(c => { if (c.pais) porPais[c.pais] = (porPais[c.pais] || 0) + 1; else sinPais++; });
    const top = Object.entries(porPais).sort((a, b) => b[1] - a[1]);
    S.audPaises = porPais;
    // tooltip de cada país (mapa y leyenda): compradores, su parte de los que tienen país y el puesto
    const conPais = cs.length - sinPais;
    S.audMapa = { conPais, puestos: new Map(top.map(([i], k) => [i, k + 1])), paises: top.length };
    const tipPais = (nombre, n, puesto) => [nombre, `${uiNum(n)} comprador${n === 1 ? '' : 'es'}${conPais ? ' · ' + pct(n / conPais * 100, n / conPais * 100 < 10 ? 1 : 0) + ' de los que tienen país' : ''}`,
      puesto ? `${puesto}º de ${top.length} ${top.length === 1 ? 'país' : 'países'}` : '', 'Clic: ver quiénes son'];
    const ratio = [0.01, 0.03, 0.05].includes(Number(S.aud.ratio)) ? Number(S.aud.ratio) : 0.01;
    // solo códigos del catálogo: la lista viene de /api/db y va adentro de un onclick (un texto armado ejecutaba código)
    const guardados = Array.isArray(S.aud.paises) ? S.aud.paises.filter(i => PAIS_ISO[i]) : [];
    const elegidos = guardados.length ? guardados : top.slice(0, 3).map(x => x[0]).filter(i => PAIS_ISO[i]);
    const sugerencias = top.map(x => x[0]).filter(i => !elegidos.includes(i)).slice(0, 2);
    const perm = crea && crea.permisos;
    let lock;
    if (!crea) lock = `<span class="anun-lock">${uiIco('candado', 14)}Chequeando los permisos del token de Meta…</span>`;
    else if (crea.falta) lock = `<span class="anun-lock">${uiIco('candado', 14)}Conectá tu cuenta de Meta (Integraciones) para chequear el permiso de audiencias.</span>`;
    else if (!perm) lock = `<span class="anun-lock">${uiIco('candado', 14)}No pude leer los permisos del token de Meta.</span>`;
    // el token de Integraciones es de solo lectura a propósito: sin ads_management no falta nada
    else if (!perm.ads_management) lock = `<span class="anun-lock ok">${ico('escudoOk', 14)}Token de solo lectura (ads_read): el panel no escribe en Meta. El público se crea a mano, subiendo el CSV.</span>`;
    else lock = `<span class="anun-lock ok">${ico('escudoOk', 14)}El token tiene permiso de audiencias. El panel igual no escribe en Meta: subí el CSV a mano.</span>`;
    const anillo = (r) => ratio === r ? ' sel' : '';
    const opcion = (r, p, t) => `<button type="button" class="anun-lk-op${ratio === r ? ' on' : ''}" onclick="anunAudRatio(${r})"><b>${p}</b><span>${t}</span></button>`;
    const chipsP = elegidos.map(i => `<span class="anun-pais"><em>${esc(i)}</em>${esc((PAIS_ISO[i] || {}).nombre || i)}<button type="button" onclick="anunAudPais('${esc(i)}',false)" aria-label="Quitar">${uiIco('x', 12)}</button></span>`).join('');
    const opcionesPais = Object.values(PAIS_ISO).filter(p => !elegidos.includes(p.iso)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return `<div class="anun-aud">
      <div class="anun-aud-cuenta"><label class="anun-cuentasel">${esc(cuentaNombre())}${uiIco('abajo', 14)}<select aria-label="Cuenta publicitaria"><option>${esc(cuentaNombre())}</option></select></label>${lock}</div>

      <section class="anun-card anun-aud-card anun-comp">
        <div class="anun-comp-izq">
          <div class="anun-ch"><span class="anun-ch-ico">${uiIco('usuario', 18)}</span><div><b>Tus compradores</b><span>La base de todo: una audiencia en Meta con quienes ya te compraron.</span></div></div>
          <div class="anun-comp-n"><b>${uiNum(cs.length)}</b><span>clientes con email o teléfono</span></div>
          <div class="anun-comp-seg">${ico('escudoOk', 14)}Se sube cifrada: Meta nunca ve un email ni un teléfono en claro.</div>
          <div class="anun-comp-acc">
            <button type="button" class="anun-btnpri" onclick="anunAudCsv()" ${cs.length ? '' : 'disabled'}>${uiIco('descargar', 14)}Descargar CSV para Meta</button>
            <span>Cifrado SHA-256 en tu navegador. Subilo en Administrador de anuncios → Públicos → Crear → Lista de clientes.</span>
          </div>
        </div>
        <div class="anun-comp-der">
          <div class="anun-mapa" id="anunMapa"><div class="anun-sub-msg">Cargando el mapa…</div></div>
          <div class="anun-mapa-ley">${top.slice(0, 5).map(([i, n], k) => `<button type="button" class="anun-ley-p" data-iso="${esc(i)}" onclick="anunCompradores('${esc(i)}')"${tipAttr(tipPais((PAIS_ISO[i] || {}).nombre || i, n, k + 1))}><b>${esc((PAIS_ISO[i] || {}).nombre || i)}</b>${uiNum(n)}</button>`).join('')}${sinPais ? `<button type="button" class="anun-ley-p" onclick="anunCompradores('')"${tipAttr(['Sin país', `${uiNum(sinPais)} comprador${sinPais === 1 ? '' : 'es'} sin código de país en el teléfono`, 'No entran en ningún país del mapa', 'Clic: ver quiénes son'])}><b>Sin país</b>${uiNum(sinPais)}</button>` : ''}</div>
        </div>
      </section>

      <section class="anun-card anun-aud-card">
        <div class="anun-ch"><span class="anun-ch-ico">${ico('copiarMas', 18)}</span><div><b>Clonar a tus compradores</b><span>Meta busca personas parecidas a quienes te compraron, en los países que elijas.</span></div>
          <button type="button" class="anun-btn2 chico anun-ch-acc" onclick="anunAudCopiar()">${uiIco('copiar', 14)}Copiar configuración</button></div>
        <div class="anun-lk">
          <div class="anun-lk-aros">${[[0.05, 'a5', 'Más alcance', 'El público más grande y menos parecido'], [0.03, 'a3', 'Equilibrio', 'Entre parecido y alcance'], [0.01, 'a1', 'Más parecido', 'El público más chico y más parecido a tus compradores']]
            .map(([rr, cls, t1, t2]) => `<i class="${cls}${anillo(rr)}" onclick="anunAudRatio(${rr})"${tipAttr([`${Math.round(rr * 100)}% · ${t1}`, t2, ratio === rr ? 'Elegido' : 'Clic: elegirlo'])}></i>`).join('')}<b${tipAttr(['Vos', `Tus ${uiNum(cs.length)} compradores: la audiencia de origen del similar`])}>Vos</b></div>
          <div class="anun-lk-ops">${opcion(0.01, '1%', 'Más parecido')}${opcion(0.03, '3%', 'Equilibrio')}${opcion(0.05, '5%', 'Más alcance')}</div>
          <div class="anun-lk-paises">
            <div class="anun-lk-pt">${uiIco('globo', 14)}Países (hasta 5)</div>
            <div class="anun-lk-chips">${chipsP || '<span class="tenue">Ninguno elegido</span>'}</div>
            ${elegidos.length < 5 ? `<label class="anun-lk-add"><select onchange="if(this.value)anunAudPais(this.value,true)"><option value="">Agregar país</option>${opcionesPais.map(p => `<option value="${p.iso}">${esc(p.nombre)}</option>`).join('')}</select>${uiIco('abajo', 14)}</label>` : ''}
            ${sugerencias.length && elegidos.length < 5 ? `<div class="anun-lk-sug">Donde más compran: ${sugerencias.map(i => `<button type="button" class="anun-link" onclick="anunAudPais('${i}',true)">+ ${esc((PAIS_ISO[i] || {}).nombre || i)}</button>`).join(' ')}</div>` : ''}
            <div class="anun-lk-lock">${uiIco('candado', 13)}Primero creá la audiencia de compradores en Meta (subí el CSV); después armá el similar con esta configuración.</div>
          </div>
        </div>
      </section>

      <section class="anun-card anun-aud-card">
        <div class="anun-ch"><span class="anun-ch-ico">${uiIco('destellos', 18)}</span><div><b>Públicos sugeridos</b><span>Una IA cruza tus compradores y te propone públicos.</span></div>
          <button type="button" class="anun-btn2 chico anun-ch-acc" onclick="anunAudSugerir()">${uiIco('copiar', 14)}Copiar pregunta para la IA</button></div>
        <div class="anun-vacio chico">${uiIco('destellos', 22)}<b>La IA de públicos no está conectada a esta pantalla</b><span>"Copiar pregunta para la IA" arma el resumen de tus compradores (países, capital y orígenes; sin nombres ni contactos) para que lo pegues en tu IA y te proponga públicos.</span></div>
        <p class="anun-pie">Los intereses no se guardan en Meta desde acá: copiá la configuración al armar la campaña.</p>
      </section>
    </div>`;
  }
  window.anunAudRatio = (r) => { S.aud.ratio = r; guardarAud(); refrescarAud(); };
  window.anunAudPais = (iso, sumar) => {
    const l = Array.isArray(S.aud.paises) && S.aud.paises.length ? S.aud.paises.slice() : Object.entries(S.audPaises || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const i = l.indexOf(iso);
    if (sumar && i < 0) { if (l.length >= 5) { uiToast('Hasta 5 países', 'mal'); return; } l.push(iso); }
    if (!sumar && i >= 0) l.splice(i, 1);
    S.aud.paises = l; guardarAud(); refrescarAud();
  };
  // repinta Audiencias; el tooltip del aro o del país que se clickeó se oculta, si no quedaría diciendo
  // "Clic: elegirlo" sobre el aro ya elegido hasta mover el mouse
  function refrescarAud() { tipFuera(); const c = document.getElementById('anunCuerpo'); if (c && S.tab === 'audiencias') { c.innerHTML = audienciasHtml(creaCache()); pintarMapa(); } }
  let tAud = null;
  function guardarAud() {
    clearTimeout(tAud);
    tAud = setTimeout(() => { dbGuardar(COL_AUD, { id: 'lookalike', ratio: S.aud.ratio || 0.01, paises: S.aud.paises || [] }).catch(e => uiToast('No se pudo guardar: ' + e.message, 'mal')); }, 400);
  }
  window.anunAudCopiar = () => {
    const ratio = Number(S.aud.ratio) || 0.01;
    const paises = (S.aud.paises && S.aud.paises.length ? S.aud.paises : Object.entries(S.audPaises || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]));
    const txt = `Público similar (lookalike) · origen: Compradores de ${nombreCliente()} (lista de clientes) · tamaño: ${Math.round(ratio * 100)}% · países: ${paises.map(i => `${(PAIS_ISO[i] || {}).nombre || i} (${i})`).join(', ')}`;
    copiar(txt);
  };
  window.anunAudSugerir = () => {
    const cs = compradores();
    const porPais = {}; cs.forEach(c => { const k = c.pais ? (PAIS_ISO[c.pais] || {}).nombre || c.pais : 'Sin país'; porPais[k] = (porPais[k] || 0) + 1; });
    const cerradas = filas().filter(x => x.Estado === 'Cerrada');
    const cap = {}; cerradas.forEach(x => { const k = String(x.Capital || '').trim() || 'sin dato'; cap[k] = (cap[k] || 0) + 1; });
    const ori = {}; cerradas.forEach(x => { const k = x.Origen || 'sin origen'; ori[k] = (ori[k] || 0) + 1; });
    const lista = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(', ');
    copiar(`Proponeme 3 públicos para anuncios de Meta de ${nombreCliente()}, que vende con un webinar en vivo y llamadas de cierre. Datos de los compradores, sin nombres: ${cs.length} con email o teléfono. Por país: ${lista(porPais)}. Capital declarado de los que cerraron: ${lista(cap)}. Origen de esas ventas: ${lista(ori)}. Para cada público: segmentación (edad, países, intereses o comportamientos), qué ángulo de anuncio le hablaría y si conviene similar de compradores o intereses. Sin precios ni promesas de ganancia en el anuncio.`);
  };
  async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  window.anunAudCsv = async () => {
    const cs = compradores();
    if (!cs.length) return;
    if (!(window.crypto && crypto.subtle)) { uiToast('Este navegador no puede cifrar el archivo', 'mal'); return; }
    const filasC = [];
    for (const c of cs) {
      const partes = nom(c.nombre).split(' ').filter(Boolean);
      const fn = partes[0] || '', ln = partes.length > 1 ? partes[partes.length - 1] : '';
      filasC.push([c.email ? await sha256(c.email) : '', c.tel ? await sha256(c.tel) : '', fn ? await sha256(fn) : '', ln ? await sha256(ln) : '', c.pais ? await sha256(c.pais.toLowerCase()) : '']);
    }
    descargarCsv(`compradores-meta_${uiHoyAR()}.csv`, ['email', 'phone', 'fn', 'ln', 'country'], filasC);
    uiToast(`${cs.length} compradores, cifrados`, 'ok');
  };

  /* ── mapa coroplético (world-atlas 110m, proyección Natural Earth, sin librerías) ── */
  function proyectar(lon, lat) {
    const l = lon * Math.PI / 180, p = lat * Math.PI / 180, p2 = p * p, p4 = p2 * p2;
    return [l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))];
  }
  function mundoCargar() {
    if (S.mundo) return Promise.resolve(S.mundo);
    if (S.mundoPedido) return S.mundoPedido;
    S.mundoPedido = fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json()).then(topo => {
      const tr = topo.transform || { scale: [1, 1], translate: [0, 0] };
      const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(p => { x += p[0]; y += p[1]; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; }); });
      const arco = (i) => i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
      const anillo = (ids) => { const pts = []; ids.forEach((i, k) => { const a = arco(i); pts.push(...(k ? a.slice(1) : a)); }); return pts; };
      const W = 1000, H = 520, sx = W / 5.47, sy = H / 2.62;
      const paises = topo.objects.countries.geometries.filter(g => g.id !== '010').map(g => {
        const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
        let d = '';
        polys.forEach(poly => poly.forEach(ids => {
          const pts = anillo(ids);
          if (pts.some((p, i) => i && Math.abs(p[0] - pts[i - 1][0]) > 270)) return;
          d += pts.map((p, i) => { const [x, y] = proyectar(p[0], p[1]); return (i ? 'L' : 'M') + (W / 2 + x * sx).toFixed(1) + ',' + (H / 2 - y * sy + 30).toFixed(1); }).join('') + 'Z';
        }));
        return { id: g.id, nombre: (g.properties || {}).name || '', d };
      });
      S.mundo = { W, H, paises };
      return S.mundo;
    });
    S.mundoPedido.catch(() => { S.mundoPedido = null; });
    return S.mundoPedido;
  }
  function pintarMapa() {
    const caja = document.getElementById('anunMapa'); if (!caja) return;
    mundoCargar().then(m => {
      const caja2 = document.getElementById('anunMapa'); if (!caja2) return;
      const porNum = {}; Object.entries(S.audPaises || {}).forEach(([iso, n]) => { const p = PAIS_ISO[iso]; if (p) porNum[p.num] = { n, nombre: p.nombre, iso }; });
      const max = Math.max(1, ...Object.values(porNum).map(x => x.n));
      caja2.innerHTML = `<svg viewBox="0 0 ${m.W} ${m.H}" preserveAspectRatio="xMidYMid meet" aria-label="Compradores por país">${m.paises.map(p => {
        const hit = porNum[p.id];
        const nivel = hit ? (0.28 + 0.72 * Math.log(1 + hit.n) / Math.log(1 + max)) : 0;
        return `<path d="${p.d}" class="${hit ? 'con' : ''}" style="${hit ? `--op:${nivel.toFixed(2)}` : ''}" data-pais="${esc(hit ? hit.nombre : nombrePais(p))}" data-n="${hit ? hit.n : 0}"${hit ? ` data-iso="${esc(hit.iso)}"` : ''}/>`;
      }).join('')}</svg>`;
    }).catch(() => {
      const c = document.getElementById('anunMapa');
      if (c) c.innerHTML = '<div class="anun-sub-msg">No pude bajar el mapa (sin conexión con el CDN). Los países están en la lista de abajo.</div>';
    });
  }
  // Nombre en castellano de cada país del mapa. world-atlas trae el nombre en inglés ("Falkland Is.",
  // "Dem. Rep. Congo") y el código numérico ISO 3166-1: número → código de 2 letras (los 173 países del
  // mapa 110m, verificados contra sus nombres) → Intl.DisplayNames en es-AR ("Islas Malvinas",
  // "Kazajistán"). Los 3 que el mapa trae sin código van a mano; si el navegador no tiene
  // Intl.DisplayNames, queda una lista corta y, en último caso, el nombre del mapa.
  const NUM_A2 = Object.fromEntries(('242FJ 834TZ 732EH 124CA 840US 398KZ 860UZ 598PG 360ID 032AR 152CL 180CD 706SO 404KE 729SD 148TD 332HT 214DO 643RU 044BS 238FK ' +
    '578NO 304GL 260TF 626TL 710ZA 426LS 484MX 858UY 076BR 068BO 604PE 170CO 591PA 188CR 558NI 340HN 222SV 320GT 084BZ 862VE 328GY 740SR 250FR 218EC 630PR ' +
    '388JM 192CU 716ZW 072BW 516NA 686SN 466ML 478MR 204BJ 562NE 566NG 120CM 768TG 288GH 384CI 324GN 624GW 430LR 694SL 854BF 140CF 178CG 266GA 226GQ 894ZM ' +
    '454MW 508MZ 748SZ 024AO 108BI 376IL 422LB 450MG 275PS 270GM 788TN 012DZ 400JO 784AE 634QA 414KW 368IQ 512OM 548VU 116KH 764TH 418LA 104MM 704VN 408KP ' +
    '410KR 496MN 356IN 050BD 064BT 524NP 586PK 004AF 762TJ 417KG 795TM 364IR 760SY 051AM 752SE 112BY 804UA 616PL 040AT 348HU 498MD 642RO 440LT 428LV 233EE ' +
    '276DE 100BG 300GR 792TR 008AL 191HR 756CH 442LU 056BE 528NL 620PT 724ES 372IE 540NC 090SB 554NZ 036AU 144LK 156CN 158TW 380IT 208DK 826GB 352IS 031AZ ' +
    '268GE 608PH 458MY 096BN 705SI 246FI 703SK 203CZ 232ER 392JP 600PY 887YE 682SA 196CY 504MA 818EG 434LY 231ET 262DJ 800UG 646RW 070BA 807MK 688RS 499ME ' +
    '780TT 728SS').split(' ').map(s => [s.slice(0, 3), s.slice(3)]));
  const SIN_CODIGO = { Kosovo: 'Kosovo', 'N. Cyprus': 'Chipre del Norte', Somaliland: 'Somalilandia' };
  // Chrome dice "Islas Malvinas (Islas Falkland)": para un equipo argentino, Islas Malvinas a secas
  const A2_NOMBRE = { FK: 'Islas Malvinas' };
  const NOMBRES_MAPA = { 'United States of America': 'Estados Unidos', Brazil: 'Brasil', Spain: 'España', Mexico: 'México', Peru: 'Perú', Germany: 'Alemania', France: 'Francia', Italy: 'Italia', 'United Kingdom': 'Reino Unido', Canada: 'Canadá', Russia: 'Rusia', Japan: 'Japón', 'Falkland Is.': 'Islas Malvinas', 'Dominican Rep.': 'República Dominicana' };
  let dnPaises;
  function nombrePais(p) {
    const a2 = NUM_A2[p.id];
    if (a2 && A2_NOMBRE[a2]) return A2_NOMBRE[a2];
    if (a2) {
      try { dnPaises = dnPaises || new Intl.DisplayNames(['es-AR', 'es'], { type: 'region' }); const n = dnPaises.of(a2); if (n && n !== a2) return n; } catch (e) { }
    }
    return SIN_CODIGO[p.nombre] || NOMBRES_MAPA[p.nombre] || p.nombre;
  }
  // mapa: el país bajo el mouse (o el de la leyenda) se ilumina y muestra el tooltip universal con el
  // formato de la referencia ("<País>" + "● Compradores <n>"), más su parte de los compradores con país y el
  // puesto. Clic en un país con compradores: quiénes son.
  function mapaResaltar(iso, p) {
    const caja = document.getElementById('anunMapa'); if (!caja) return;
    caja.querySelectorAll('path.hov').forEach(x => { if (x !== p && (!iso || x.dataset.iso !== iso)) x.classList.remove('hov'); });
    if (p) p.classList.add('hov');
    if (iso) caja.querySelectorAll(`path[data-iso="${iso}"]`).forEach(x => x.classList.add('hov'));
    caja.classList.toggle('foco', !!(iso || p));
  }
  if (!window.__anunMapaTip) {
    window.__anunMapaTip = true;
    document.addEventListener('mousemove', (e) => {
      const caja = document.getElementById('anunMapa'); if (!caja) return;
      const p = e.target && e.target.closest ? e.target.closest('#anunMapa path') : null;
      const ley = !p && e.target && e.target.closest ? e.target.closest('.anun-mapa-ley [data-iso]') : null;
      mapaResaltar(ley ? ley.dataset.iso : (p && p.dataset.iso) || '', p);
      if (!p) return;   // fuera del mapa manda el delegado general (data-tip de la leyenda, o nada)
      const n = Number(p.dataset.n) || 0, M = S.audMapa || {};
      const puesto = p.dataset.iso && M.puestos ? M.puestos.get(p.dataset.iso) : null;
      const extra = n && M.conPais ? `<span>${pct(n / M.conPais * 100, n / M.conPais * 100 < 10 ? 1 : 0)} de los compradores con país${puesto ? ` · ${puesto}º de ${M.paises}` : ''}</span>` : '';
      if (typeof uiTipMostrar === 'function') uiTipMostrar(`<b>${esc(p.dataset.pais)}</b><span><i class="c-gold"></i>Compradores<em>${uiNum(n)}</em></span>${extra}${n ? '<span class="anun-tip-pista">Clic: ver quiénes son</span>' : ''}`, e.clientX, e.clientY);
    });
    document.addEventListener('click', (e) => {
      const p = e.target && e.target.closest ? e.target.closest('#anunMapa path[data-iso]') : null;
      if (p) anunCompradores(p.dataset.iso);
    });
    // al arrastrar una tarjeta del tablero no hay mousemove: que el tooltip no quede colgado
    document.addEventListener('dragstart', tipFuera);
    document.addEventListener('mouseleave', () => mapaResaltar('', null));
    // Los puntos de uiLineas salen corridos hacia arriba (hasta ~24 px abajo del gráfico): ui-atlas.js
    // los ubica en % del alto entero del SVG, pero la capa del hover es 30 px más baja (deja lugar a las
    // fechas). Mientras no se arregle allá, en los gráficos de esta pantalla se reubican midiendo: la
    // cuenta sale de los valores y de la geometría real, así sigue bien también después del arreglo.
    document.addEventListener('mousemove', (e) => {
      const plot = e.target && e.target.closest ? e.target.closest('.anun-det .ui-g-plot, .anun-inv-graf .ui-g-plot') : null;
      if (!plot || typeof UI_GRAF === 'undefined') return;
      const graf = plot.closest('.ui-graf'), G = graf && UI_GRAF[graf.dataset.g];
      if (!G || G.tipo !== 'lineas' || !G.H) return;
      const svg = plot.querySelector('svg'), hov = plot.querySelector('.ui-g-hover'); if (!svg || !hov) return;
      const rp = plot.getBoundingClientRect(), rs = svg.getBoundingClientRect(), rh = hov.getBoundingClientRect();
      const n = G.etiquetas.length;
      const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - rp.left) / rp.width * (n - 1))));
      const vivas = G.series.filter(x => !x.off);
      hov.querySelectorAll('.ui-g-dot').forEach((d, k) => {
        const s = vivas[k]; if (!s) return;
        const max = (s.eje === 'der' ? G.maxD : G.maxI) || 1;
        const y = G.padT + (G.H - G.padT - G.padB) * (1 - (Number(s.valores[i]) || 0) / max);
        d.style.top = (rs.top + y / G.H * rs.height - rh.top).toFixed(1) + 'px';
      });
    });
  }
  // quiénes son los compradores de un país ('' = los que no tienen país)
  window.anunCompradores = (iso) => {
    tipFuera();
    const cs = compradores();
    const l = cs.filter(c => (iso ? c.pais === iso : !c.pais)).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
    const nombre = iso ? ((PAIS_ISO[iso] || {}).nombre || iso) : 'Sin país';
    const elegidos = Array.isArray(S.aud && S.aud.paises) && S.aud.paises.length ? S.aud.paises : Object.entries(S.audPaises || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
    const sumable = iso && !elegidos.includes(iso) && elegidos.length < 5;
    const datos = (c) => [c.email ? 'email' : '', c.tel ? 'teléfono' : ''].filter(Boolean).join(' y ');
    uiModalAbrir({
      titulo: `Compradores · ${nombre}`, sub: `${uiNum(l.length)} de ${uiNum(cs.length)} compradores con email o teléfono${iso ? '' : ' · el teléfono no trae código de país'}`, ancho: '600px',
      cuerpo: l.length ? `<div class="anun-lista">${l.map(c => `<div class="anun-lista-f"><b>${esc(c.nombre || 'Sin nombre')}</b><span class="anun-lista-sub">${esc(c.fuente || '')}</span><em>${esc(datos(c))}</em></div>`).join('')}</div>
        <p class="anun-pie">De dónde sale cada uno: las agendas en estado Cerrada del pipeline, sin repetir. El país sale del código del teléfono.</p>` : '<div class="anun-sub-msg">Ninguno.</div>',
      acciones: [...(sumable ? [{ texto: `Sumar ${nombre} al público similar`, onclick: `uiModalCerrar();anunAudPais('${iso}',true)` }] : []), { texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }],
    });
  };

  /* ════════ utilidades ════════ */
  function descargarCsv(nombre, cab, filasC) {
    // una celda que empieza con = + - @ se toma como fórmula al abrir el CSV: se le antepone una comilla (como crm.js)
    const c = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = [cab.map(c).join(','), ...filasC.map(f => f.map(c).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function copiar(txt) {
    const ok = () => uiToast('Copiado', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok).catch(() => prompt('Copiá esto:', txt));
    else prompt('Copiá esto:', txt);
  }

  /* ════════ acciones globales (los onclick llaman por nombre) ════════ */
  window.anunTab = (id) => { if (!TABS.some(t => t.id === id)) return; S.tab = id; ses('tab', id); pintarTab(); };
  window.anunPeriodo = () => { S.abiertas.clear(); pintarTab(); };
  window.anunActualizar = () => {
    try { Object.keys(sessionStorage).filter(k => k.startsWith('anun:m:')).forEach(k => { const x = sesGet(k.slice(7)); if (x) sessionStorage.setItem(k, JSON.stringify({ t: 0, tOrig: x.tOrig || x.t, v: x.v })); }); } catch (e) { }
    S.meta = {}; S.crea = {}; S.creaVal = {}; S.plan = null; S.conf = null; S.obj = null; pintarTab();
  };
  window.anunOrden = (o) => { S.orden = o; ses('orden', o); pintarTab(); };
  window.anunMes = (paso) => {
    const [y, m] = mesCal().split('-').map(Number);
    const d = new Date(y, m - 1 + paso, 1);
    const nuevo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (nuevo > uiHoyAR().slice(0, 7)) return;
    S.mes = nuevo; pintarTab();
  };
  window.anunCamp = (id) => {
    if (S.abiertas.has(id)) S.abiertas.delete(id); else S.abiertas.add(id);
    repintarCampanas();
  };
  let tQ = null;
  window.anunBuscar = (q) => { S.q = q; clearTimeout(tQ); tQ = setTimeout(repintarCampanas, 160); };
  function repintarCampanas() {
    const r = uiPerRango(PER);
    const act = S.metaVal[r.desde + '|' + r.hastaHoy]; if (!act) return;
    const vieja = document.querySelector('#anunCuerpo .anun-camp'); if (!vieja) return;
    const foco = document.activeElement && document.activeElement.closest('.anun-buscar');
    const tmp = document.createElement('div');
    tmp.innerHTML = campanasHtml(act, S.creaVal[r.desde + '|' + r.hastaHoy]);
    const nueva = tmp.firstElementChild;
    vieja.replaceWith(nueva);
    if (foco) { const i = nueva.querySelector('.anun-buscar input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    if (S.abiertas.size && !(S.creaVal[r.desde + '|' + r.hastaHoy])) metaCreativos(r.desde, r.hastaHoy).then(() => repintarCampanas());
  }
  window.anunCsvCampanas = () => {
    const r = uiPerRango(PER), k = r.desde + '|' + r.hastaHoy;
    const act = S.metaVal[k]; if (!act) return;
    const crea = S.creaVal[k], LC = crea && crea.landing ? crea.landing.campanas || {} : null;
    const rg = (c) => (LC ? LC[c.id] || { registros: 0, calificados: 0 } : c);
    const mon = act.moneda, u = (v) => { const x = aUsd(v, mon); return x == null ? '' : x.toFixed(2); };
    descargarCsv(`campanas-meta_${r.desde}_${r.hasta}.csv`,
      ['Campaña', `Inversión (${mon})`, `Inversión (${MON()})`, 'Impresiones', 'Clics', 'CTR %', 'Visitas landing', 'Registros', 'Calificados', 'Leads Meta', 'Conversaciones DM', 'Resultados', 'Qué mide', `Costo x resultado (${mon})`],
      act.campanas.map(c => [c.nombre, c.gasto.toFixed(2), u(c.gasto), c.impresiones, c.clics, (c.ctr || 0).toFixed(2), c.landings || 0, rg(c).registros ?? '', rg(c).calificados ?? '', c.leadsU, c.conversaciones || 0, c.resultados || 0, c.tipoResultado || '', c.costoPorResultado != null ? c.costoPorResultado.toFixed(2) : '']));
  };
  // tipo de cambio: si Meta factura en otra moneda que la del cliente, se carga a mano y queda para todo el equipo
  // (en el hub original salía solo del dólar cripto; acá cada cliente puede vender en otra moneda)
  window.anunTc = () => {
    const v = Object.values(S.metaVal).find(x => x && x.moneda && x.moneda !== MON());
    const mon = (v && v.moneda) || '—';
    uiModalAbrir({
      titulo: 'Tipo de cambio', sub: `Meta cobra en ${mon} y las ventas están en ${MON()}. El gasto se pasa a ${MON()} con este valor, el mismo para todo el equipo.`, ancho: '480px',
      cuerpo: `<div class="ui-campos"><label class="ui-campo"><span>1 ${esc(MON())} = ¿cuántos ${esc(mon)}?</span><input id="anunTcV" type="number" min="0" step="any" value="${tc() || ''}"></label></div>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: 'anunTcGuardar()', pri: true }],
    });
    setTimeout(() => { const i = document.getElementById('anunTcV'); if (i) i.focus(); }, 30);
  };
  window.anunTcGuardar = async () => {
    const v = Number((document.getElementById('anunTcV') || {}).value);
    if (!(v > 0)) { uiToast('Poné un número mayor que cero', 'mal'); return; }
    try { S.conf = await dbGuardar(COL_CONF, { id: 'atribucion', tc: v }); uiModalCerrar(); uiToast('Guardado para todo el equipo', 'ok'); pintarTab(); }
    catch (e) { uiToast('No se pudo guardar: ' + e.message, 'mal'); }
  };
  // qué orígenes de agenda cuentan como pauta (se guarda para todo el equipo)
  window.anunOrigenes = () => {
    const vistos = {}; filas().forEach(x => { const o = normO(x.Origen); if (o) vistos[o] = (vistos[o] || 0) + 1; });
    origenesPauta().forEach(o => { if (!(o in vistos)) vistos[o] = 0; });
    const sel = new Set(origenesPauta());
    uiModalAbrir({
      titulo: 'Qué cuenta como pauta', sub: 'Las agendas con estos orígenes entran al embudo de Anuncios (agendas, asistidas, cierres y facturación atribuida).', ancho: '520px',
      cuerpo: `<div class="anun-oris">${Object.entries(vistos).sort((a, b) => b[1] - a[1]).map(([o, n]) => `<label class="anun-ori"><input type="checkbox" value="${esc(o)}"${sel.has(o) ? ' checked' : ''}><span>${esc(o)}</span><em>${uiNum(n)} agendas</em></label>`).join('')}</div>
        <p class="anun-pie" style="margin-top:12px">Por defecto: MASTERCLASS y WEBINAR. El origen lo trae cada agenda o se carga a mano en el pipeline.</p>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: 'anunOrigenesGuardar()', pri: true }],
    });
  };
  window.anunOrigenesGuardar = async () => {
    const elegidos = [...document.querySelectorAll('.anun-oris input:checked')].map(i => i.value);
    if (!elegidos.length) { uiToast('Elegí al menos un origen', 'mal'); return; }
    try { S.conf = await dbGuardar(COL_CONF, { id: 'atribucion', origenes: elegidos }); uiModalCerrar(); uiToast('Guardado para todo el equipo', 'ok'); pintarTab(); }
    catch (e) { uiToast('No se pudo guardar: ' + e.message, 'mal'); }
  };

  /* ════════ enganche ════════
     El shell llama PANTALLAS.anuncios al entrar a #anuncios; cuando llega el pipeline (cargarDatos → mhq:datos), se repinta. */
  document.addEventListener('mhq:datos', () => { if (vistaActiva()) render(); });
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS[VISTA] = () => render();
})();
