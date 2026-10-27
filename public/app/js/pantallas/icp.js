/* ICP — puerto del icp.js del hub original (calcado de Conversión › ICP de la referencia de diseño) con los datos de
 * masterclass: quién es el lead que compra, según lo que él mismo contestó.
 *
 * De dónde sale cada dato (todo de /api/icp, lib/icp-core.mjs: agregados, nunca personas):
 *  - Landing: las respuestas de calificación de cada registro (las preguntas del webinar), cruzadas con el pipeline por
 *    mail o WhatsApp para saber quién agendó y quién compró.
 *  - Form de agenda: las respuestas que trae cada agenda del pipeline (Capital, Negocio, Urgencia, Decisor, Facturación),
 *    de todo el pipeline: una persona cuenta una vez, con la respuesta de su agenda más reciente.
 *  - Compró = una agenda Cerrada; el cash es su Monto.
 *  - IA (opcional, con la key de Anthropic del cliente): icp-generar-background.mjs le pasa a Claude solo esos agregados y
 *    trae perfiles de comprador; cuántas personas cumple cada perfil lo cuenta el servidor, en vivo.
 * Quedó afuera lo del hub original que acá no tiene dato: país y ciudad por el WhatsApp, género por el nombre, contenido de
 * Instagram, llamadas de Fathom, 1-1 con alumnos y el arco de transformación.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => uiEsc(t);
  const num = (n) => uiNum(n);
  const pctDe = (n, base) => (base ? Number(n) / base * 100 : 0);
  const pct0 = (p) => `${Math.round(p || 0)}%`;
  const pct1 = (p) => `${(Math.round((p || 0) * 10) / 10).toString().replace('.', ',')}%`;
  const pl = (n, uno, varios) => `${num(n)} ${Number(n) === 1 ? uno : varios}`;
  const tipL = (...ls) => ls.filter((l) => l != null && l !== '').join('\n');
  const capi = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
  const moneda = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';
  const plata = (n) => uiMonto(Math.round(Number(n) || 0), moneda());
  const MIN_N = 5;   // menos de 5 casos es anecdótico: se muestra en gris y no se saca conclusión (la regla del método original)
  const CAMPOS_AGENDA = { Capital: 'Capital', Negocio: 'Negocio', Urgencia: 'Urgencia', Decisor: 'Decisor', Facturacion: 'Facturación' };
  const TABS = [{ id: 'resumen', texto: 'Resumen' }, { id: 'landing', texto: 'Landing' }, { id: 'agenda', texto: 'Form de agenda' }];

  const SG = (k, d) => { try { return sessionStorage.getItem('mhqicp:' + k) || d; } catch (e) { return d; } };
  const ST = { tab: SG('tab', 'resumen'), abiertos: new Set() };
  if (!TABS.some((t) => t.id === ST.tab)) ST.tab = 'resumen';
  const D = { datos: null, t: 0, prom: null, promW: '', err: '', timer: null, esperando: '' };

  /* ════════ alcance: un webinar o todos (lo comparte con UTM's y Trazabilidad) ════════ */
  function wElegido() {
    const ws = (window.MHQ && MHQ.webinars) || [];
    let w = '';
    try { w = sessionStorage.getItem('mhqtraza:w') || ''; } catch (e) { }
    if (w === 'todos' || ws.some((x) => x.id === w)) return w;
    return (window.MHQ && MHQ.webinarActivo) || (ws[0] && ws[0].id) || 'todos';
  }
  window.icpWebinar = (w) => { try { sessionStorage.setItem('mhqtraza:w', w); } catch (e) { } entrar(); };
  function cabeceraPagina() {
    const extra = $('pageExtra'); if (!extra) return;
    const ws = (window.MHQ && MHQ.webinars) || [], w = wElegido();
    extra.innerHTML = `<label class="ut-sel ut-sel-w" title="De qué webinar son los registros"><select onchange="icpWebinar(this.value)" aria-label="Webinar">
      ${ws.map((x) => `<option value="${esc(x.id)}"${x.id === w ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
      <option value="todos"${w === 'todos' ? ' selected' : ''}>Todos los webinars</option></select>${uiIco('abajo', 14)}</label>
      <button type="button" class="ut-btn-sec" onclick="icpActualizar()">${uiIco('refrescar', 15)}Actualizar</button>`;
  }

  /* ════════ datos ════════ */
  const datos = () => (D.datos && D.datos.w === wElegido() ? D.datos : null);
  function traer(fresco) {
    const w = wElegido();
    if (!fresco && datos() && Date.now() - D.t < 60000) return Promise.resolve(D.datos);
    if (D.prom && D.promW === w) return D.prom;
    D.promW = w;
    // si mientras tanto se eligió otro alcance, la respuesta vieja no pisa los datos ni el pedido nuevo
    const p = pedirJSON('/api/icp?w=' + encodeURIComponent(w))
      .then((j) => { if (w === wElegido()) { D.datos = j; D.t = Date.now(); D.err = ''; } return j; })
      .catch((e) => { if (e.message !== 'sesion' && w === wElegido()) D.err = e.message; return null; })
      .finally(() => { if (D.prom === p) D.prom = null; });
    D.prom = p;
    return p;
  }
  const vistaActiva = () => (location.hash || '').slice(1) === 'icp';
  function entrar() {
    if (typeof YO === 'undefined' || !YO) return;   // el shell la llama también antes del ingreso
    cabeceraPagina();
    pintar();
    traer().then((j) => {
      if (!vistaActiva()) return;
      pintar();
      if (j && j.ia && j.ia.estado === 'working' && !D.timer) esperar('');
    });
  }
  window.icpActualizar = async () => { await traer(true); if (vistaActiva()) pintar(); };
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.icp = entrar;

  /* ════════ piezas visuales del ICP de la referencia (las del hub original) ════════ */
  const ICOS = {
    trofeo: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    formulario: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  };
  function ico(n, t = 16, cls = '') {
    if (ICOS[n]) return `<svg class="ui-ico ${cls}" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOS[n]}</svg>`;
    return uiIco(n, t, cls);
  }
  const vacioMini = (t) => `<div class="icp-vacio-mini">${esc(t)}</div>`;
  const cargandoHtml = (t) => `<div class="icp-cargando"><i></i>${esc(t || 'Cargando…')}</div>`;
  const aviso = (texto, tipo = 'ambar', accion) => `<div class="icp-aviso ${tipo}">${ico(tipo === 'rojo' ? 'alerta' : 'info', 15)}<span>${texto}</span>${accion ? `<button type="button" onclick="${accion.onclick}">${esc(accion.texto)} →</button>` : ''}</div>`;
  const btnPri = (texto, onclick, icono = 'refrescar') => `<button type="button" class="btn primary icp-btn" onclick="${onclick}">${ico(icono, 16)}${esc(texto)}</button>`;
  // tarjeta con encabezado (ícono en cuadradito + título + bajada, con divisor)
  function tarjeta(o) {
    return `<section class="icp-c ${o.clase || ''}">
      <header class="icp-c-h">
        ${o.ico ? `<span class="icp-ib" style="--k:${o.color || '#fbbf24'}">${ico(o.ico, 16)}</span>` : ''}
        <div class="icp-c-t"><b>${esc(o.titulo)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</div>
        ${o.der ? `<div class="icp-c-der">${o.der}</div>` : ''}
      </header>
      <div class="icp-c-b">${o.cuerpo || ''}</div>
    </section>`;
  }
  // fila con barra: "«Más de 1.000» ▬▬▬ 2 · 29%"
  function lista(rows, o = {}) {
    if (!rows.length) return vacioMini(o.vacio || 'Sin datos todavía');
    const max = Math.max(1, ...rows.map((f) => f.p));
    return `<div class="icp-lb" style="--bw:${o.barra || 120}px;--rh:${o.alto || 30}px">${rows.map((f) => `<div class="icp-lb-f${f.poco ? ' poco' : ''}" data-tip="${esc(f.tip || '')}">
        <span class="icp-lb-t">${f.html || esc(f.etiqueta)}</span>
        <span class="icp-lb-riel"><i style="width:${Math.min(100, Math.max(f.p > 0 ? 4 : 0, f.p / max * 100)).toFixed(1)}%;background:${f.color || '#fbbf24'}"></i></span>
        <span class="icp-lb-v">${esc(f.valor)}</span>
      </div>`).join('')}</div>`;
  }
  // "✦ Generado con IA · Última actualización: 26-oct, 01:13 p. m."
  function fechaHora(iso) {
    const d = new Date(iso || ''); if (isNaN(d)) return '';
    const zona = (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires';
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, day: '2-digit', month: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
    return `${g('day')}-${UI_MESES_C[Number(g('month')) - 1]}, ${String(g('hour')).padStart(2, '0')}:${g('minute')} ${/p/i.test(g('dayPeriod')) ? 'p. m.' : 'a. m.'}`;
  }

  /* ════════ cabecera: pestañas + la base del cálculo ════════ */
  window.icpTab = (id) => { ST.tab = id; try { sessionStorage.setItem('mhqicp:tab', id); } catch (e) { } pintar(); const m = $('mainScroll'); if (m) m.scrollTop = 0; };
  function cabecera(d) {
    let crit = '';
    if (d) {
      const r = d.icp.base.registros, p = d.icp.base.pipeline;
      const txt = ST.tab === 'agenda' ? 'Form de agenda: todo el pipeline, una persona cuenta una vez'
        : ST.tab === 'landing' ? 'Respuestas de calificación de la landing, cruzadas con el pipeline por mail o WhatsApp'
          : 'Registros de la landing y agendas del pipeline, cruzados por mail o WhatsApp';
      const cuenta = ST.tab === 'agenda' ? `${pl(p.n, 'persona agendó', 'personas agendaron')} · ${pl(p.compraron, 'compró', 'compraron')}`
        : `${pl(r.n, 'registro', 'registros')} · ${pl(r.agendaron, 'agendó', 'agendaron')} · ${pl(r.compraron, 'compró', 'compraron')}`;
      crit = `<div class="icp-criterio" data-tip="${esc(tipL('Qué es un lead', 'Una persona: si agendó varias veces cuenta una vez.', 'Compró = una agenda Cerrada; el cash es su Monto.'))}"><span>${esc(txt)}</span><b>${esc(cuenta)}</b></div>`;
    }
    return `<div class="icp-cab">${uiTabs(TABS, ST.tab, 'icpTab')}</div>${crit}`;
  }
  function pintar() {
    const sec = $('icp'); if (!sec) return;
    const d = datos();
    let html;
    try {
      const cuerpo = !d ? (D.err ? aviso('No pude traer los datos del ICP: ' + esc(D.err), 'rojo', { texto: 'Reintentar', onclick: 'icpActualizar()' }) : cargandoHtml('Cargando registros y pipeline…'))
        : ST.tab === 'landing' ? landing(d) : ST.tab === 'agenda' ? agenda(d) : resumen(d);
      html = `<div class="icp-raiz">${cabecera(d)}<div class="icp-cuerpo">${cuerpo}</div></div>`;
    } catch (e) {
      console.error('[icp]', e);
      html = `<div class="icp-raiz">${cabecera(null)}<div class="icp-cuerpo">${aviso('No pude armar esta vista: ' + esc(e.message), 'rojo', { texto: 'Reintentar', onclick: 'icpActualizar()' })}</div></div>`;
    }
    sec.innerHTML = html;
  }

  /* ════════════════════════ RESUMEN ════════════════════════ */
  // el grupo con el que se describe al cliente: los que compraron; sin ventas todavía, los que agendaron
  function grupoRef(t) {
    if (t.compraron) return { k: 'compraron', nombre: 'los que compraron', que: 'que compraron' };
    if (t.agendaron) return { k: 'agendaron', nombre: 'los que agendaron', que: 'que agendaron' };
    return { k: 'n', nombre: 'los registrados', que: 'registrados' };
  }
  // por pregunta o campo: sus respuestas ordenadas por el grupo de referencia, con su peso ahí y entre todos
  function tops(opciones, base, g, campoN) {
    const totG = base[g.k], totN = base.n;
    return opciones.filter((o) => o[g.k] > 0).sort((a, b) => b[g.k] - a[g.k]).map((o) => {
      const p = pctDe(o[g.k], totG), pt = pctDe(o.n, totN);
      return { t: o.opcion || o.respuesta, p, pt, n: o[g.k],
        tip: tipL(o.opcion || o.respuesta, `${num(o[g.k])} de ${num(totG)} ${g.que} (${campoN}) · ${pct1(p)}`,
          g.k === 'n' ? '' : `Entre ${campoN === 'form de agenda' ? 'todos los que agendaron' : 'todos los registros'}: ${pct1(pt)} (${num(o.n)} de ${num(totN)})`) };
    });
  }
  function quienCompra(d) {
    const r = d.icp.base.registros, p = d.icp.base.pipeline;
    const gL = grupoRef(r), gA = p.compraron ? grupoRef(p) : { k: 'n', nombre: 'los que agendaron', que: 'que agendaron' };
    const colsL = d.icp.landing.map((q) => ({ titulo: q.texto, items: tops(q.opciones, q.respondieron, gL, 'landing') }));
    const colsA = d.icp.agenda.map((c) => ({ titulo: c.etiqueta, items: tops(c.opciones, c.respondieron, gA, 'form de agenda') }));
    if (!colsL.length && !colsA.length) return `<section class="icp-c icp-quien">${vacioMini('Todavía no hay respuestas: ni la landing tiene preguntas contestadas ni el pipeline trae el form de agenda.')}</section>`;
    // el retrato: la respuesta más común de cada pregunta, contra lo que pesa entre todos (si sobresale, es señal)
    const y = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : xs[0] || '');
    const fL = colsL.filter((c) => c.items[0]).map((c) => `el ${pct0(c.items[0].p)} contestó «${c.items[0].t}» a «${c.titulo}»${gL.k === 'n' ? '' : ` (entre todos los registros, ${pct0(c.items[0].pt)})`}`);
    const fA = colsA.filter((c) => c.items[0]).map((c) => `${c.titulo} «${c.items[0].t}» (${pct0(c.items[0].p)})`);
    const frases = [];
    if (fL.length) frases.push(`De ${gL.nombre} ${r[gL.k] === r.n ? '' : `(${num(r[gL.k])})`} desde la landing, ${y(fL)}.`.replace('  ', ' '));
    const entre = gA.k === 'compraron' ? (p.compraron === 1 ? 'el único que compró' : `los ${num(p.compraron)} que compraron`) : (p.n === 1 ? 'la única persona que agendó' : `las ${num(p.n)} personas que agendaron`);
    if (fA.length) frases.push(`En el form de agenda, entre ${entre}: ${y(fA)}.`);
    const rasgos = colsL.concat(colsA).filter((c) => c.items[0]).map((c) => `<span data-tip="${esc(c.items[0].tip)}">${esc(c.items[0].t)} · ${pct0(c.items[0].p)}</span>`).join('');
    const col = (c) => `<div class="icp-qg-c"><em data-tip="${esc(c.titulo)}">${esc(c.titulo)}</em>${c.items.length ? c.items.slice(0, 3).map((x) => `<span data-tip="${esc(x.tip)}">${esc(x.t)} ${pct0(x.p)}</span>`).join('') : '<span class="icp-qg-sd">Sin dato</span>'}</div>`;
    const sinVentas = !r.compraron && !p.compraron;
    return `<section class="icp-c icp-quien">
      <header class="icp-quien-h"><span class="icp-ib" style="--k:#fbbf24">${ico(sinVentas ? 'usuario' : 'trofeo', 16)}</span><b>${sinVentas ? 'Quién agenda' : 'Quién compra'}</b>
        <span class="icp-quien-n">${sinVentas ? 'todavía no hay ventas: se describe a los que agendaron' : `${pl(r.compraron, 'compra', 'compras')} desde la landing · ${pl(p.compraron, 'compra', 'compras')} en el pipeline`}</span></header>
      <p class="icp-quien-p">${esc(frases.join(' '))}</p>
      <div class="icp-rasgos">${rasgos}</div>
      <div class="icp-qg">${colsL.concat(colsA).map(col).join('')}</div>
      <p class="icp-quien-pie">Cada % es sobre ${gL.k === 'n' ? 'los registros' : gL.nombre} que contestaron esa pregunta. Las respuestas de la landing son de los registros de este alcance; las del form de agenda, de todo el pipeline.</p>
    </section>`;
  }
  // la respuesta que más convierte en cada pregunta: % que compró (o agendó, si todavía no hay ventas) de los que la eligieron
  function predice(d) {
    const r = d.icp.base.registros, p = d.icp.base.pipeline;
    const filas = [];
    const sumar = (preguntas, metrica, prom, de) => preguntas.forEach((q) => {
      const ops = q.opciones.filter((o) => o.n > 0).map((o) => ({ o, tasa: pctDe(o[metrica], o.n) }));
      const conN = ops.filter((x) => x.o.n >= MIN_N);
      const mejor = (conN.length ? conN : ops).sort((a, b) => b.tasa - a.tasa || b.o.n - a.o.n)[0];
      if (!mejor || !mejor.o[metrica]) return;
      const et = mejor.o.opcion || mejor.o.respuesta, poco = mejor.o.n < MIN_N;
      filas.push({ p: mejor.tasa, poco, html: `«${esc(et)}» <small>${esc(q.texto || q.etiqueta)}</small>`,
        valor: `${pct0(mejor.tasa)} · ${num(mejor.o[metrica])} de ${num(mejor.o.n)}`, color: poco ? '#5b5b60' : '#34d399',
        tip: tipL(`${q.texto || q.etiqueta}: «${et}»`, `${pct1(mejor.tasa)} ${metrica === 'compraron' ? 'compró' : 'agendó'} · ${num(mejor.o[metrica])} de ${pl(mejor.o.n, de, de + 's')}`,
          `Promedio de ${q.texto ? 'los que contestaron' : 'todo el pipeline'}: ${pct1(prom(q))}`, poco ? `Anecdótico: menos de ${MIN_N} casos` : '') });
    });
    const mL = r.compraron ? 'compraron' : 'agendaron', mA = 'compraron';
    sumar(d.icp.landing, mL, (q) => pctDe(q.respondieron[mL], q.respondieron.n), 'registro');
    if (p.compraron) sumar(d.icp.agenda, mA, (c) => pctDe(c.respondieron[mA], c.respondieron.n), 'persona');
    filas.sort((a, b) => (a.poco - b.poco) || b.p - a.p);
    return tarjeta({
      ico: 'objetivo', color: '#34d399', titulo: r.compraron || p.compraron ? 'Qué respuesta compra más' : 'Qué respuesta agenda más',
      sub: `En cada pregunta, la respuesta con más ${r.compraron ? 'compras' : 'agendas'} sobre los que la eligieron`, clase: 'icp-predice',
      cuerpo: lista(filas, { barra: 140, vacio: 'Todavía no hay agendas ni ventas que cruzar con las respuestas.' }) +
        `<p class="icp-pie">En gris, las de menos de ${MIN_N} casos: anecdóticas, no se decide ahí. Con 10 a 15 ya es sugestivo; con más de 15, sólido.</p>`,
    });
  }
  function tiles(d) {
    const r = d.icp.base.registros, p = d.icp.base.pipeline;
    const kt = (o) => `<div class="icp-kt${o.clase ? ' ' + o.clase : ''}" data-tip="${esc(o.tip)}"><div class="icp-kt-l" style="--k:${o.k}">${ico(o.ico, 16)}<span>${esc(o.l)}</span></div><b>${o.v}</b><small>${esc(o.s)}</small></div>`;
    return `<div class="icp-kt4">
      ${kt({ clase: 'caja', k: '#6c6c71', ico: 'formulario', l: 'Contestaron la landing', v: num(r.respondieron), s: `de ${pl(r.n, 'registro', 'registros')} · ${pct0(pctDe(r.respondieron, r.n))}`, tip: tipL('Contestaron las preguntas de la landing', `${num(r.respondieron)} de ${num(r.n)} registros · ${pct1(pctDe(r.respondieron, r.n))}`, 'El resto se registró y no pasó al paso 2 del form') })}
      ${kt({ k: '#fbbf24', ico: 'estrella', l: 'Calificados', v: num(r.calificados), s: `${pct0(pctDe(r.calificados, r.respondieron))} de los que contestaron`, tip: tipL('Calificados', `${num(r.calificados)} de ${num(r.respondieron)} que contestaron · ${pct1(pctDe(r.calificados, r.respondieron))}`, 'Eligieron una opción marcada en cada pregunta con marca') })}
      ${kt({ k: '#60a5fa', ico: 'calendario', l: 'Agendaron', v: num(p.n), s: `${num(r.agendaron)} desde la landing`, tip: tipL('Personas con al menos una agenda', `${num(p.n)} en todo el pipeline`, `${num(r.agendaron)} cruzan con un registro de este alcance (${pct1(pctDe(r.agendaron, r.n))} de los registros)`) })}
      ${kt({ clase: 'caja verde', k: '#34d399', ico: 'trofeo', l: 'Compraron', v: num(p.compraron), s: `${plata(p.cash)} · ${num(r.compraron)} desde la landing`, tip: tipL('Compraron', `${num(p.compraron)} personas con una agenda Cerrada · ${plata(p.cash)}`, `${num(r.compraron)} desde la landing de este alcance · ${plata(r.cash)}`) })}
    </div>`;
  }
  function resumen(d) {
    return `${tiles(d)}<div class="icp-mt">${quienCompra(d)}</div><div class="icp-fila2">${predice(d)}${cardIA(d)}</div>${temas(d)}`;
  }

  /* ── la síntesis con IA ── */
  const nombreCampo = (d, campo) => CAMPOS_AGENDA[campo] || ((d.icp.landing.find((q) => q.id === campo) || {}).texto) || campo;
  function cardIA(d) {
    const ia = d.ia || {}, r = ia.resultado;
    const trabajando = ia.estado === 'working' || !!D.esperando;
    const der = !ia.hayKey ? '' : trabajando ? `<span class="icp-calc"><i></i>Calculando con IA…</span>` : btnPri(r ? 'Recalcular' : 'Armar perfiles', 'icpCalcular()', 'destellos');
    let cuerpo = '';
    if (!ia.hayKey) cuerpo += aviso('Para sumar los perfiles de comprador con IA, cargá la key de Anthropic del cliente en <b>Integraciones</b>. Todo lo demás de esta pantalla anda sin IA.', 'azul', { texto: 'Ir a Integraciones', onclick: "location.hash='#conexiones'" });
    else if (!r && !trabajando) cuerpo += aviso('Todavía no se armaron. <b>Armar perfiles</b> le pasa a Claude solo los números de esta pantalla (sin nombres ni datos de nadie) y trae los perfiles de comprador más repetidos. Tarda un minuto.', 'azul');
    if (ia.hayKey && ia.estado === 'error' && ia.error && !trabajando) cuerpo += aviso('El último intento falló: ' + esc(ia.error) + (r ? ' Se sigue mostrando el anterior.' : ''), 'rojo');
    if (trabajando && !r) cuerpo += cargandoHtml('Armando los perfiles con IA… podés irte a otra pantalla y volver.');
    if (r) {
      const pfs = (r.perfiles || []).filter((x) => x && x.titulo);
      cuerpo += `<div class="icp-firma chica"><span class="icp-firma-chip">${ico('destellos', 12)}Perfiles con IA · contados en vivo</span>${r.generado_at ? `<span class="icp-firma-f">${esc(fechaHora(r.generado_at))}</span>` : ''}</div>`;
      cuerpo += pfs.length ? `<div class="icp-pfs">${pfs.map((x, k) => perfil(d, x, k)).join('')}</div>` : vacioMini('La IA no encontró perfiles con estos datos.');
      if (r.lectura) cuerpo += `<div class="icp-lectura"><em>${ico('destellos', 12)}Lectura · IA</em><p>${esc(r.lectura)}</p></div>`;
    }
    return tarjeta({ ico: 'destellos', color: '#a78bfa', titulo: 'Perfiles de comprador', sub: 'Síntesis con IA de las respuestas · opcional', clase: 'icp-ia', der, cuerpo });
  }
  // el título y los rasgos los puso la IA; los números son exactos (el servidor cuenta a quién le cabe cada perfil)
  function perfil(d, x, k) {
    const tasa = pctDe(x.compraron, x.n);
    const tip = tipL(x.titulo, `${pl(x.n, 'persona cumple', 'personas cumplen')} todos sus rasgos`, `${pl(x.compraron, 'compró', 'compraron')} · ${pct1(tasa)} · ${plata(x.cash)}`,
      'La IA puso el nombre y los rasgos; el conteo es exacto y en vivo');
    return `<div class="icp-pf" data-tip="${esc(tip)}">
      <div class="icp-pf-h"><span class="icp-pf-av">${ico('usuario', 17)}</span><div class="icp-pf-t"><div><em>#${k + 1}</em><b>${esc(capi(x.titulo))}</b></div>
        <div class="icp-pf-v"><b>${x.n ? pct0(tasa) : '—'}</b><span>${x.n ? `compró · ${num(x.compraron)} de ${num(x.n)}` : 'nadie cumple estos rasgos hoy'}</span></div></div></div>
      ${x.descripcion ? `<p class="icp-pf-d">${esc(x.descripcion)}</p>` : ''}
      <div class="icp-pf-a">${(x.rasgos || []).map((r) => `<span><i>${esc(nombreCampo(d, r.campo))}:</i> ${esc(r.valor)}</span>`).join('')}</div>
    </div>`;
  }
  // los textos libres del form de agenda (objetivo y lo que lo frena), agrupados por la IA, con sus frases
  function temas(d) {
    const r = d.ia && d.ia.resultado; if (!r) return '';
    const card = (L, titulo, sub, color, icono) => {
      const tot = L.reduce((a, t) => a + (Number(t.n) || 0), 0);
      return tarjeta({ ico: icono, color, titulo, sub, clase: 'icp-ins', cuerpo: L.length ? `<div class="icp-ins-l">${L.map((t, i) => item({ k: titulo + i, i, titulo: capi(t.titulo), pct: pctDe(t.n, tot), cuenta: pl(t.n, 'respuesta', 'respuestas'), color, citas: t.frases })).join('')}</div>` : vacioMini('Sin datos suficientes todavía.') });
    };
    const de = r.deseos || [], ds = r.dolores || [];
    if (!de.length && !ds.length) return '';
    return `<div class="icp-fila2">${card(de, 'Deseos', 'Qué quiere lograr · el objetivo del form de agenda', '#34d399', 'corazon')}${card(ds, 'Dolores', 'Qué lo frena · la traba del form de agenda', '#fb923c', 'fuego')}</div>`;
  }
  // ítem de insight (acordeón): puesto, tema, barra, % y cuántas respuestas; al abrir, las frases textuales
  function item(o) {
    const abierto = ST.abiertos.has(o.k), citas = (o.citas || []).filter(Boolean);
    return `<div class="icp-it${abierto ? ' abierto' : ''}${citas.length ? '' : ' sin-citas'}" data-k="${esc(o.k)}" style="--k:${o.color}">
      <button type="button" class="icp-it-h" onclick="icpAcordeon(this)" data-tip="${esc(tipL(o.titulo, `${pct1(o.pct)} · ${o.cuenta} agrupadas por la IA`, citas.length ? 'Clic para ver las frases' : ''))}">
        <span class="icp-it-n">${o.i + 1}</span><span class="icp-it-t">${esc(o.titulo)}</span>
        <span class="icp-it-d">${citas.length ? `<span class="icp-it-chev">${ico('abajo', 12)}</span>` : ''}</span>
        <span class="icp-it-bar"><i style="width:${Math.min(100, Math.max(o.pct > 0 ? 1.5 : 0, o.pct)).toFixed(1)}%"></i></span>
        <span class="icp-it-p"><b>${pct0(o.pct)}</b><small>${esc(o.cuenta)}</small></span>
      </button>
      ${citas.length ? `<div class="icp-it-citas">${citas.map((c) => `<div class="icp-cita"><span>“</span><p>${esc(c)}</p></div>`).join('')}</div>` : ''}
    </div>`;
  }
  window.icpAcordeon = (btn) => {
    const it = btn.closest('[data-k]'); if (!it || it.classList.contains('sin-citas')) return;
    if (it.classList.toggle('abierto')) ST.abiertos.add(it.dataset.k); else ST.abiertos.delete(it.dataset.k);
  };
  window.icpCalcular = () => {
    const d = datos(); if (!d) return;
    const t = d.icp.texto || {};
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    uiModalAbrir({
      titulo: d.ia.resultado ? '¿Recalcular los perfiles?' : '¿Armar los perfiles con IA?', sub: 'Con la key de Anthropic del cliente (Integraciones).',
      cuerpo: `<p class="icp-modal-p">Le pasa a Claude solo agregados: cuántos eligieron cada respuesta y cuántos de ellos agendaron y compraron${(t.Objetivo || t.Traba) ? ', y los textos libres del form de agenda (sin nombres, mails ni teléfonos)' : ''}. Tarda un minuto y consume API del cliente. Mientras tanto se puede seguir usando la app.</p>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: d.ia.resultado ? 'Recalcular' : 'Armar perfiles', onclick: 'icpCalcularYa()', pri: true }], ancho: '540px',
    });
  };
  window.icpCalcularYa = async () => {
    uiModalCerrar();
    const pid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      const r = await fetch(`/.netlify/functions/icp-generar-background?w=${encodeURIComponent(wElegido())}&pid=${pid}`, { method: 'POST' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      uiToast('Armando los perfiles con IA…');
      esperar(pid);
      if (vistaActiva()) pintar();
    } catch (e) { uiToast('No se pudo arrancar: ' + e.message, 'mal'); }
  };
  // Pregunta cada 6 s hasta que el cálculo que se pidió (pid) termine; a los 15 minutos deja de preguntar y avisa, en vez
  // de quedar girando si la función de fondo murió sin escribir su estado.
  function esperar(pid) {
    clearInterval(D.timer);
    let vueltas = 0;
    D.esperando = pid || '*';
    D.timer = setInterval(async () => {
      const j = await traer(true);
      const ia = (j && j.ia) || {};
      const listo = j && ia.estado !== 'working' && (!pid || ia.pid === pid);
      if (!listo && ++vueltas <= 150) return;
      clearInterval(D.timer); D.timer = null; D.esperando = '';
      if (!listo) uiToast('El cálculo tarda más de lo normal: volvé a entrar en un rato.', 'mal');
      else if (ia.estado === 'done') uiToast('Perfiles listos ✓', 'ok');
      else if (ia.estado === 'error') uiToast('Falló el cálculo: ' + String(ia.error || '').slice(0, 90), 'mal');
      if (vistaActiva()) pintar();
    }, 6000);
  }

  /* ════════════════════════ LANDING y FORM DE AGENDA ════════════════════════ */
  // Una tabla por pregunta: cuántos eligieron cada respuesta y, de ellos, cuántos agendaron, se presentaron y compraron.
  // La mejor tasa de cada columna va en dorado; con menos de 5 casos, en gris (anecdótico).
  function tablaRespuestas(ops, cols, base, etqN) {
    const mejores = {};
    cols.forEach((c) => { if (!c.tasa) return; const xs = ops.filter((o) => o.n >= MIN_N && o[c.k]); mejores[c.k] = xs.length ? Math.max(...xs.map((o) => pctDe(o[c.k], o.n))) : null; });
    const head = `<div class="icp-tb-h"><span>Respuesta</span><span>${esc(etqN)}</span>${cols.map((c) => `<span>${esc(c.t)}</span>`).join('')}<span>Cash</span></div>`;
    const fila = (o, extra, baseN = base.n) => {
      const et = o.opcion || o.respuesta, poco = o.n < MIN_N, share = pctDe(o.n, baseN);
      const celdas = cols.map((c) => {
        const tasa = pctDe(o[c.k], o.n), mejor = !poco && o[c.k] && mejores[c.k] != null && Math.abs(tasa - mejores[c.k]) < 1e-9;
        return `<span class="icp-tb-c${mejor ? ' mejor' : ''}" data-l="${esc(c.t)}" data-tip="${esc(tipL(`${c.t} · «${et}»`, `${num(o[c.k])} de ${pl(o.n, 'que la eligió', 'que la eligieron')} · ${pct1(tasa)}`, poco ? `Anecdótico: menos de ${MIN_N} casos` : mejor ? 'La mejor tasa de esta pregunta' : ''))}"><b>${num(o[c.k])}</b><em>${o.n ? pct0(tasa) : '—'}</em></span>`;
      }).join('');
      return `<div class="icp-tb-f${poco ? ' poco' : ''}${extra || ''}">
        <span class="icp-tb-r">${o.califica ? `<i class="icp-tb-k" data-tip="${esc('Califica\nEsta opción está marcada como calificada en la pregunta')}">${ico('estrella', 12)}</i>` : ''}<b>${esc(et)}</b>${o.vieja ? '<small>ya no está en el form</small>' : ''}</span>
        <span class="icp-tb-c icp-tb-n" data-l="${esc(etqN)}" data-tip="${esc(tipL(et, `${num(o.n)} de ${num(baseN)} · ${pct1(share)}`))}"><i class="icp-tb-bar"><i style="width:${Math.min(100, Math.max(o.n ? 3 : 0, share)).toFixed(1)}%"></i></i><b>${num(o.n)}</b><em>${pct0(share)}</em></span>
        ${celdas}
        <span class="icp-tb-c icp-tb-cash" data-l="Cash">${o.cash ? plata(o.cash) : '—'}</span>
      </div>`;
    };
    return { head, fila };
  }
  function landing(d) {
    const L = d.icp.landing;
    if (!L.length) return `<div class="icp-sin-datos alto"><b>Este webinar no tiene preguntas de calificación</b><span>Se cargan en Landing → preguntas del paso 2 del form.</span></div>`;
    const cols = [{ k: 'agendaron', t: 'Agendaron', tasa: true }, { k: 'presentaron', t: 'Se presentaron', tasa: true }, { k: 'compraron', t: 'Compraron', tasa: true }];
    return L.map((q, i) => {
      const t = tablaRespuestas(q.opciones, cols, q.respondieron, 'Registros');
      // los que no contestaron, sobre todos los registros
      const sin = q.sinRespuesta.n ? t.fila({ ...q.sinRespuesta, opcion: 'Sin responder' }, ' sin-resp', q.respondieron.n + q.sinRespuesta.n) : '';
      return `<div class="${i ? 'icp-mt' : ''}">${tarjeta({ ico: 'formulario', color: '#fbbf24', titulo: q.texto, sub: `${pl(q.respondieron.n, 'registro contestó', 'registros contestaron')} · ${pct0(pctDe(q.respondieron.compraron, q.respondieron.n))} compró`, clase: 'icp-preg',
        cuerpo: `<div class="icp-tb-w"><div class="icp-tb">${t.head}${q.opciones.map((o) => t.fila(o)).join('')}${sin}</div></div>` })}</div>`;
    }).join('') + `<p class="icp-pie">Registros: cuántos eligieron cada respuesta y su peso entre los que contestaron. Agendaron, se presentaron y compraron: cuántos de ellos y qué % de los que la eligieron. La estrella marca las opciones que califican. Con menos de ${MIN_N} casos, en gris.</p>`;
  }
  function agenda(d) {
    const A = d.icp.agenda, t = d.icp.texto || {};
    const libres = (t.Objetivo || t.Traba) ? aviso(`Además, ${[t.Objetivo ? pl(t.Objetivo, 'persona escribió su objetivo', 'personas escribieron su objetivo') : '', t.Traba ? pl(t.Traba, 'escribió qué lo frena', 'escribieron qué los frena') : ''].filter(Boolean).join(' y ')}. Eso es texto libre: lo agrupa la IA en Resumen.`, 'azul') : '';
    if (!A.length) return libres + `<div class="icp-sin-datos alto"><b>El pipeline todavía no trae respuestas del form de agenda</b><span>Llegan con cada agenda de iClosed o Calendly (capital, negocio, urgencia, quién decide…).</span></div>`;
    const cols = [{ k: 'presentaron', t: 'Se presentaron', tasa: true }, { k: 'compraron', t: 'Compraron', tasa: true }];
    return libres + A.map((c, i) => {
      const tb = tablaRespuestas(c.opciones.slice(0, 12), cols, c.respondieron, 'Agendaron');
      const resto = c.opciones.length > 12 ? `<p class="icp-pie">Y ${pl(c.opciones.length - 12, 'respuesta más', 'respuestas más')}, con menos casos.</p>` : '';
      return `<div class="${i ? 'icp-mt' : ''}">${tarjeta({ ico: 'portapapeles', color: '#60a5fa', titulo: c.etiqueta, sub: `${pl(c.respondieron.n, 'persona contestó', 'personas contestaron')} · ${pct0(pctDe(c.respondieron.compraron, c.respondieron.n))} compró`, clase: 'icp-preg',
        cuerpo: `<div class="icp-tb-w"><div class="icp-tb dos">${tb.head}${c.opciones.slice(0, 12).map((o) => tb.fila(o)).join('')}</div></div>${resto}` })}</div>`;
    }).join('') + `<p class="icp-pie">Una persona cuenta una vez, con la respuesta de su agenda más reciente. Se presentaron y compraron: cuántos de ellos y qué % de los que dieron esa respuesta. Con menos de ${MIN_N} casos, en gris.</p>`;
  }
})();
