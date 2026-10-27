/* UTM's y Trazabilidad — puerto del utms2.js del hub original (calcado de la referencia de diseño) y del armador de
 * utms.js, con los datos de masterclass.
 *
 * Qué cambia contra el hub original, y por qué: acá la atribución es directa. Cada registro de la landing guarda su utm y cada
 * agenda del pipeline cruza con su registro por mail o WhatsApp, así que no hacen falta el Origen de Calendly, la
 * agrupación a mano de fuentes ni la Trazabilidad con IA. Todo sale de /api/icp (lib/icp-core.mjs: agregados y
 * recorridos, sin datos personales de los registros) y de DATA.rows (las agendas, que el navegador ya tiene).
 *  · UTM's: registros por fuente, campaña y anuncio (utm_source, utm_campaign, utm_content), el embudo de cada uno
 *    (registros → calificados → agendaron → se presentaron → compraron → cash) y los links con UTM de los anuncios.
 *  · Trazabilidad: el recorrido de cada lead que agendó: de qué anuncio vino, si calificó, sus agendas y cómo terminó.
 * Quedó afuera lo que es solo del hub original: Agrupar fuentes (el Origen de Calendly), Buscar en descripciones de YouTube,
 * vincular links a eventos de Calendly y "Fuente & Equipo".
 */
(function () {
  /* ════════ el armador de links (puro: lo prueba test/traza.test.mjs en node) ════════ */
  const UTM_K = ['source', 'medium', 'campaign', 'content'];
  // las macros de Meta ({{ad.name}}, {{campaign.name}}…) van tal cual: Meta las cambia por el nombre al hacer clic
  const esMacro = (v) => /^\{\{[\w.]+\}\}$/.test(v);
  // la regla de nomenclatura del hub original: minúsculas y guiones, o después no se puede juntar
  const normUtm = (v) => { const s = String(v == null ? '' : v).trim(); return esMacro(s) ? s : s.toLowerCase().replace(/\s+/g, '-'); };
  function linkFinal(d) {
    const base = String((d && d.destino) || '').trim();
    if (!/^https?:\/\//i.test(base)) return '';
    try {
      const u = new URL(base), hash = u.hash;
      u.hash = '';
      UTM_K.forEach((k) => u.searchParams.delete('utm_' + k));
      const ps = UTM_K.map((k) => [k, normUtm(d[k])]).filter(([, v]) => v)
        .map(([k, v]) => `utm_${k}=${esMacro(v) ? v : encodeURIComponent(v)}`);
      return u.toString() + (ps.length ? (u.search ? '&' : '?') + ps.join('&') : '') + hash;
    } catch (e) { return ''; }
  }
  globalThis.MHQ_UTM = { linkFinal, normUtm };
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => uiEsc(t);
  const COL_LINKS = 'utm-links';
  const TOPE = 200;
  // los 10 colores del sistema, ordenados para que dos tramos vecinos nunca se parezcan; más allá, gris
  const PALETA = ['ambar', 'rosa', 'cian', 'rojo', 'verde', 'azul', 'naranja', 'violeta', 'lima', 'azulino'];
  const colorDe = (i) => (i < PALETA.length ? PALETA[i] : 'gris');
  const VISTAS = [['utm_source', 'Por fuente'], ['utm_campaign', 'Por campaña'], ['utm_content', 'Por anuncio']];
  const DIM = { utm_source: ['fuente', 'Sin utm_source'], utm_campaign: ['campaña', 'Sin utm_campaign'], utm_content: ['anuncio', 'Sin utm_content'] };
  // cómo terminó cada registro, en tramos que no se pisan (suman los registros del grupo)
  const TRAMOS = [
    ['compro', 'Compró', 'verde', (g) => g.compraron],
    ['presento', 'Se presentó', 'azul', (g) => g.presentaron - g.compraron],
    ['agendo', 'Agendó', 'ambar', (g) => g.agendaron - g.presentaron],
    ['sin', 'Sin agenda', 'gris', (g) => g.n - g.agendaron],
  ];
  const RESULTADOS = [['compro', 'Compró', 'verde'], ['presento', 'Se presentó sin comprar', 'azul'], ['agendo', 'Agendó, sin presentarse', 'ambar']];
  const PRESETS = [
    { id: 'metadin', txt: 'Meta Ads (automático)', vals: { source: '{{site_source_name}}', medium: 'paid', campaign: '{{campaign.name}}', content: '{{ad.name}}' } },
    { id: 'meta', txt: 'Meta Ads', vals: { source: 'fb', medium: 'paid' } },
    { id: 'historia', txt: 'Historia IG', vals: { source: 'ig', medium: 'historia' } },
    { id: 'bio', txt: 'Link en bio', vals: { source: 'ig', medium: 'bio' } },
    { id: 'yt', txt: 'YouTube', vals: { source: 'youtube', medium: 'descripcion' } },
    { id: 'mail', txt: 'Mail', vals: { source: 'email', medium: 'activecampaign' } },
  ];
  const TIPOS = [['anuncio', 'Anuncio de Meta'], ['historia', 'Historia de Instagram'], ['reel', 'Reel'], ['video', 'Video de YouTube'], ['mail', 'Mail'], ['link', 'Link común']];
  const PASOS = ['Lo esencial', 'Parámetros UTM', 'La pieza', 'Confirmar y copiar'];

  const SG = (k, d) => { try { return sessionStorage.getItem('mhqutm:' + k) || d; } catch (e) { return d; } };
  const SS = (k, v) => { try { sessionStorage.setItem('mhqutm:' + k, v); } catch (e) { } };
  const UT = { vista: SG('vista', 'utm_source'), datos: null, t: 0, prom: null, promW: '', err: '', links: null, errLinks: '',
    calc: null, md: null, wiz: null, idx: null, idxRef: null,
    tz: { q: '', fuente: '', campana: '', anuncio: '', res: '', orden: 'rec', n: TOPE } };

  const pl = (n, uno, varios) => `${uiNum(n)} ${Number(n) === 1 ? uno : varios}`;
  const pctDe = (n, base) => (base ? Number(n) / base * 100 : 0);
  const pct1 = (p) => uiNum(p, 1) + '%';
  // el % de las listas: 3 de 758 no son "0%" (ni 757 son "100%")
  const pctCorto = (p) => (p > 0 && p < 1 ? '<1%' : p > 99 && p < 100 ? '>99%' : Math.round(p) + '%');
  const moneda = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';
  const zona = () => (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires';
  const plata = (n) => uiMonto(Math.round(Number(n) || 0), moneda());
  const vistaActual = () => (location.hash || '').slice(1);
  const ICO_LINK = '<svg class="ui-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>';

  /* ════════ alcance: un webinar o todos (lo comparten UTM's, Trazabilidad e ICP) ════════ */
  function wElegido() {
    const ws = (window.MHQ && MHQ.webinars) || [];
    let w = '';
    try { w = sessionStorage.getItem('mhqtraza:w') || ''; } catch (e) { }
    if (w === 'todos' || ws.some((x) => x.id === w)) return w;
    return (window.MHQ && MHQ.webinarActivo) || (ws[0] && ws[0].id) || 'todos';
  }
  window.utWebinar = (w) => { try { sessionStorage.setItem('mhqtraza:w', w); } catch (e) { } UT.tz.n = TOPE; entrar(); };
  function selectorW() {
    const ws = (window.MHQ && MHQ.webinars) || [], w = wElegido();
    return `<label class="ut-sel ut-sel-w" title="De qué webinar son los registros"><select onchange="utWebinar(this.value)" aria-label="Webinar">
      ${ws.map((x) => `<option value="${esc(x.id)}"${x.id === w ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
      <option value="todos"${w === 'todos' ? ' selected' : ''}>Todos los webinars</option></select>${uiIco('abajo', 14)}</label>`;
  }

  /* ════════ carga ════════ */
  const datos = () => (UT.datos && UT.datos.w === wElegido() ? UT.datos : null);
  function traer(fresco) {
    const w = wElegido();
    if (!fresco && datos() && Date.now() - UT.t < 60000) return Promise.resolve(UT.datos);
    if (UT.prom && UT.promW === w) return UT.prom;
    UT.promW = w;
    // si mientras tanto se eligió otro alcance, la respuesta vieja no pisa los datos ni el pedido nuevo
    const p = pedirJSON('/api/icp?w=' + encodeURIComponent(w))
      .then((j) => { if (w === wElegido()) { UT.datos = j; UT.t = Date.now(); UT.err = ''; } return j; })
      .catch((e) => { if (e.message !== 'sesion' && w === wElegido()) UT.err = e.message; return null; })
      .finally(() => { if (UT.prom === p) UT.prom = null; });
    UT.prom = p;
    return p;
  }
  const cargarLinks = (fresco) => dbLista(COL_LINKS, fresco)
    .then((l) => { UT.links = l || []; UT.errLinks = ''; })
    .catch((e) => { UT.links = UT.links || []; UT.errLinks = e.message; });
  // las agendas del pipeline por id (DATA.rows, de base.js)
  function fila(id) {
    const rows = (typeof DATA !== 'undefined' && DATA && DATA.rows) || [];
    if (UT.idxRef !== rows) { UT.idxRef = rows; UT.idx = new Map(rows.map((r) => [String(r._id || r._row), r])); }
    return UT.idx.get(String(id)) || null;
  }
  const filasDe = (r) => r.filas.map(fila).filter(Boolean);

  /* ════════ cabecera y entrada ════════ */
  function cabecera() {
    const extra = $('pageExtra');
    if (extra) extra.innerHTML = selectorW() + `<button type="button" class="ut-btn-sec" onclick="utActualizar()">${uiIco('refrescar', 15)}Actualizar</button>`;
  }
  function repintar() {
    cabecera();
    if (vistaActual() === 'traza') renderTraza(); else render();
  }
  function entrar() {
    if (typeof YO === 'undefined' || !YO) return;   // el shell la llama también antes del ingreso
    repintar();
    Promise.all([traer(), UT.links ? null : cargarLinks()]).then(() => { if (['utms', 'traza'].includes(vistaActual())) repintar(); });
  }
  window.utActualizar = async () => {
    try { await cargarDatos(); } catch (e) { }
    await Promise.all([traer(true), cargarLinks(true)]);
    if (['utms', 'traza'].includes(vistaActual())) repintar();
  };
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.utms = entrar;
  window.PANTALLAS.traza = entrar;

  const skeleton = () => `<div class="ut-card ut-esq"><i></i><i></i><i></i></div><div class="ut-card ut-esq"><i></i><i></i></div>`;
  const falla = () => `<div class="ut">${UT.err ? uiAviso({ tipo: 'rojo', texto: 'No pude traer los datos: ' + UT.err, accion: { texto: 'Reintentar', onclick: 'utActualizar()' } }) : skeleton()}</div>`;
  const toggle = (ops, act, fn) => `<div class="ut-tg">${ops.map(([id, t]) => `<button type="button" class="${id === act ? 'on' : ''}" onclick="${fn}('${id}')">${esc(t)}</button>`).join('')}</div>`;
  function uiTipOcultarSeguro() { try { if (typeof uiTipOcultar === 'function') uiTipOcultar(); } catch (e) { } }

  /* ════════════════════════ UTM's ════════════════════════ */
  function render() {
    const caja = $('utms');
    if (!caja) return;
    const d = datos();
    if (!d) { caja.innerHTML = falla(); return; }
    const u = d.utm, dim = DIM[UT.vista] ? UT.vista : 'utm_source';
    const grupos = u.dims[dim].map((g, i) => ({ ...g, nombre: g.k || DIM[dim][1], color: g.k ? colorDe(i) : 'gris', i }));
    UT.calc = { grupos, u, dim };
    const sinUtm = (u.dims.utm_source.find((g) => !g.k) || { n: 0 }).n;
    caja.innerHTML = `<div class="ut">
      ${sinUtm ? `<div class="ut-banda">
        <span class="ut-banda-ico">${uiIco('alerta', 17)}</span>
        <div class="ut-banda-t"><b>${pl(sinUtm, 'registro llegó', 'registros llegaron')} sin UTM (${pctCorto(pctDe(sinUtm, u.totales.n))})</b><span>No se sabe de qué anuncio ${sinUtm === 1 ? 'vino' : 'vinieron'}. Armá el link de cada anuncio acá abajo, en "Links con UTM", para que la atribución no sea a ojo.</span></div>
        <button type="button" class="ut-banda-acc" onclick="utLinkNuevo()">Armar un link →</button>
      </div>` : ''}
      <div class="ut-fila-tg">${toggle(VISTAS, dim, 'utVista')}</div>
      ${cardRegistros(grupos, u, dim)}
      ${cardEmbudo(grupos, u, dim)}
      ${cardLinks(u)}
    </div>`;
  }
  window.utVista = (v) => { UT.vista = v; SS('vista', v); render(); };

  function tipGrupo(g, total) {
    return [
      g.nombre + (g.ctx ? ` (${g.ctx})` : ''),
      `${pl(g.n, 'registro', 'registros')} · ${pct1(pctDe(g.n, total))} del total`,
      `${pl(g.calificados, 'calificado', 'calificados')} · ${pl(g.agendaron, 'agendó', 'agendaron')} · ${pl(g.compraron, 'compró', 'compraron')}`,
      `Cash ${plata(g.cash)}`,
      g.agendaron ? 'Clic: ver a los que agendaron' : 'Todavía nadie de acá agendó',
    ].join('\n');
  }
  const abrirAttrs = (g, i, extra) => (g.agendaron ? ` role="button" tabindex="0" onclick="utAbrir('dim',${i}${extra || ''})" onkeydown="if(event.key==='Enter')utAbrir('dim',${i}${extra || ''})"` : '');

  /* dona: Ø152, anillo 18,5, arranca a las 9 y gira en sentido horario. Cada tramo es un sector de corona con las
     esquinas apenas redondeadas, 3° de aire entre tramos y un degradé vertical propio. */
  function sector(C, r1, r2, a0, a1, rc) {
    const rad = (d) => d * Math.PI / 180;
    const P = (r, d) => [C - r * Math.cos(rad(d)), C - r * Math.sin(rad(d))];
    const spanR = rad(a1 - a0);
    const k = Math.max(0, Math.min(rc, (r2 - r1) / 2, spanR * r1 / 2.2));
    const dO = (k / r2) * 180 / Math.PI, dI = (k / r1) * 180 / Math.PI;
    const f = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2);
    const largo = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + f(P(r2, a0 + dO)) +
      ' A' + r2 + ',' + r2 + ' 0 ' + largo + ' 1 ' + f(P(r2, a1 - dO)) +
      ' Q' + f(P(r2, a1)) + ' ' + f(P(r2 - k, a1)) +
      ' L' + f(P(r1 + k, a1)) +
      ' Q' + f(P(r1, a1)) + ' ' + f(P(r1, a1 - dI)) +
      ' A' + r1 + ',' + r1 + ' 0 ' + largo + ' 0 ' + f(P(r1, a0 + dI)) +
      ' Q' + f(P(r1, a0)) + ' ' + f(P(r1 + k, a0)) +
      ' L' + f(P(r2 - k, a0)) +
      ' Q' + f(P(r2, a0)) + ' ' + f(P(r2, a0 + dO)) + ' Z';
  }
  // Reparto del aro en grados: proporcional, salvo que ningún tramo queda con menos de VIS_MIN grados visibles (2 de
  // 750 son 0,9°, menos de 1 px de aro, y el mouse no los encontraba nunca).
  function repartoDona(ns) {
    const AIRE = 3, AIRE_CH = 1.4, VIS_MIN = 3;
    const tot = ns.reduce((a, b) => a + b, 0);
    if (ns.length < 2 || !tot) return ns.map((n) => ({ span: tot ? n / tot * 360 : 0, aire: 0 }));
    const chica = ns.map(() => false);
    let spans = ns.map((n) => n / tot * 360);
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      let cambio = false;
      spans.forEach((s, i) => { if (!chica[i] && s - AIRE < VIS_MIN) { chica[i] = true; cambio = true; } });
      const fijo = chica.reduce((a, c) => a + (c ? VIS_MIN + AIRE_CH : 0), 0);
      if (fijo > 300) return ns.map((n) => ({ span: n / tot * 360, aire: AIRE_CH }));
      const resto = ns.reduce((a, n, i) => a + (chica[i] ? 0 : n), 0);
      spans = ns.map((n, i) => (chica[i] ? VIS_MIN + AIRE_CH : (resto ? n / resto * (360 - fijo) : 0)));
      if (!cambio) break;
    }
    return spans.map((s, i) => ({ span: s, aire: chica[i] ? AIRE_CH : AIRE }));
  }
  function dona(items, total, etiqueta, tipC) {
    const S = 152, sw = 18.5, r2 = S / 2, r1 = r2 - sw, C = S / 2;
    const seg = items.filter((f) => f.n > 0);
    const reparto = repartoDona(seg.map((f) => f.n));
    let acum = 0, defs = '', trazos = '';
    seg.forEach((f, i) => {
      const k = items.indexOf(f);
      const { span, aire } = reparto[i];
      const a0 = acum + aire / 2, a1 = acum + span - aire / 2;
      acum += span;
      const gid = 'utg' + i + Math.random().toString(36).slice(2, 6);
      defs += `<linearGradient id="${gid}" class="c-${f.color}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--c)"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--c) 68%,#000)"/></linearGradient>`;
      const datosT = `data-k="${k}" data-cv="${uiNum(f.n)}" data-cl="${esc(pct1(pctDe(f.n, total)) + ' DEL TOTAL')}" data-tip="${esc(tipGrupo(f, total))}"${f.agendaron ? ` onclick="utAbrir('dim',${k})"` : ''}`;
      if (seg.length === 1) {
        trazos += `<circle class="ut-dona-s ut-dona-1 c-${f.color}" ${datosT} cx="${C}" cy="${C}" r="${(r1 + r2) / 2}" fill="none" stroke="url(#${gid})" stroke-width="${sw}"/>`;
        return;
      }
      const fin = a1 - a0 < 0.6 ? a0 + 0.6 : a1;
      trazos += `<path class="ut-dona-s c-${f.color}" ${datosT} d="${sector(C, r1, r2, a0, fin, 3.2)}" fill="url(#${gid})" style="animation-delay:${i * 55}ms"/>`;
    });
    return `<div class="ut-dona"${tipC ? ` data-tip="${esc(tipC)}"` : ''}>
      <svg viewBox="0 0 ${S} ${S}" aria-hidden="true"><defs>${defs}</defs>${seg.length ? '' : `<circle cx="${C}" cy="${C}" r="${(r1 + r2) / 2}" fill="none" stroke="#202024" stroke-width="${sw}"/>`}${trazos}</svg>
      <div class="ut-dona-c"><b>${uiNum(total)}</b><span>${esc(etiqueta)}</span></div>
    </div>`;
  }
  function filaLista(g, i, total) {
    const pct = pctDe(g.n, total);
    return `<div class="ut-fila c-${g.color}" data-k="${i}" data-cv="${uiNum(g.n)}" data-cl="${esc(pct1(pct) + ' DEL TOTAL')}" data-tip="${esc(tipGrupo(g, total))}"${abrirAttrs(g, i)}>
      <span class="ut-fila-n"><i class="ut-punto"></i><b>${esc(g.nombre)}</b>${g.ctx ? `<em class="ut-ctx">${esc(g.ctx)}</em>` : ''}</span>
      <span class="ut-riel"><i style="width:${Math.max(g.n ? 0.8 : 0, pct).toFixed(2)}%"></i></span>
      <span class="ut-val">${uiNum(g.n)} · ${pctCorto(pct)}</span>
    </div>`;
  }
  function cardRegistros(grupos, u, dim) {
    const total = u.totales.n;
    const tipC = [`${pl(total, 'registro', 'registros')} de la landing`,
      `${pl(grupos.length, DIM[dim][0], DIM[dim][0] === 'campaña' ? 'campañas' : DIM[dim][0] + 's')}${grupos[0] && total ? ` · la más grande: ${grupos[0].nombre} ${pct1(pctDe(grupos[0].n, total))}` : ''}`,
      'Pasá el mouse por un tramo para ver cada una'].join('\n');
    const lista = grupos.length && total
      ? `<div class="ut-dist">${dona(grupos, total, 'REGISTROS', tipC)}<div class="ut-lista">${grupos.map((g, i) => filaLista(g, i, total)).join('')}</div></div>`
      : `<div class="ut-vacio">${uiIco('usuarios', 20)}<b>Todavía no hay registros</b><span>Cuando alguien se registre en la landing, acá se ve de qué ${DIM[dim][0]} vino.</span></div>`;
    return `<section class="ut-card">
      <header class="ut-ch"><div><h3>Registros por ${DIM[dim][0]}</h3><p>Sobre ${pl(total, 'registro', 'registros')} de la landing · ${dim} tal cual llega en el link (sin mayúsculas)</p></div></header>
      ${lista}
      <p class="ut-ayuda">${uiIco('lista', 12)}<span>Clickeá una fila para ver a los que agendaron y cómo terminó cada uno.</span></p>
    </section>`;
  }

  function cardEmbudo(grupos, u, dim) {
    const t = u.totales;
    const kpi = (l, v, s, tip, cls) => `<div data-tip="${esc(tip)}"><span>${l}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b><small>${esc(s)}</small></div>`;
    const kpis = `<div class="ut-kpis ut-kpis5">
      ${kpi('REGISTROS', uiNum(t.n), 'de la landing', `Registros · ${uiNum(t.n)}\nTodos los de este webinar, con o sin UTM`)}
      ${kpi('CALIFICADOS', uiNum(t.calificados), `${pctCorto(pctDe(t.calificados, t.n))} de los registros`, `Calificados · ${uiNum(t.calificados)}\nEligieron una opción marcada en cada pregunta con marca\n${pl(t.respondieron, 'contestó', 'contestaron')} las preguntas`)}
      ${kpi('AGENDARON', uiNum(t.agendaron), `${pctCorto(pctDe(t.agendaron, t.n))} de los registros`, `Agendaron · ${uiNum(t.agendaron)}\nRegistros con al menos una agenda en el pipeline (cruce por mail o WhatsApp)\n${pl(t.presentaron, 'se presentó', 'se presentaron')} · show-up ${pctCorto(pctDe(t.presentaron, t.agendaron))}`)}
      ${kpi('COMPRARON', uiNum(t.compraron), `${pctCorto(pctDe(t.compraron, t.presentaron))} de los que se presentaron`, `Compraron · ${uiNum(t.compraron)}\nCon una agenda Cerrada\n${pct1(pctDe(t.compraron, t.n))} de los registros`, 'verde')}
      ${kpi('CASH', plata(t.cash), t.n ? `${plata(t.cash / t.n)} por registro` : '—', `Cash · ${plata(t.cash)}\nMonto de las agendas cerradas de estos registros${t.compraron ? `\nTicket promedio ${plata(t.cash / t.compraron)}` : ''}`, 'oro')}
    </div>`;
    const sr = u.sinRegistro;
    const nota = sr.agendas ? `<p class="ut-ayuda">${uiIco('info', 12)}<span><button type="button" class="ut-link" onclick="utAbrir('sin')">${pl(sr.agendas, 'agenda', 'agendas')} del pipeline${sr.ventas ? ` (${pl(sr.ventas, 'venta', 'ventas')} · ${plata(sr.cash)})` : ''}</button> no ${sr.agendas === 1 ? 'cruza' : 'cruzan'} con ningún registro ${wElegido() === 'todos' ? 'de la landing' : 'de este webinar'}: ${sr.agendas === 1 ? 'llegó' : 'llegaron'} por otro lado o con otro mail o WhatsApp. No suman acá.</span></p>` : '';
    return `<section class="ut-card">
      <header class="ut-ch"><div><h3>Embudo por ${DIM[dim][0]}</h3><p>Registros → calificados → agendaron → se presentaron → compraron → cash (${esc(moneda())}).</p></div></header>
      ${kpis}
      <div class="ut-bloques">${grupos.map((g, i) => bloque(g, i, t.n)).join('') || `<div class="ut-vacio"><b>Sin registros todavía</b></div>`}</div>
      ${nota}
      <p class="ut-ayuda">${uiIco('info', 12)}<span>Cada persona cuenta una vez aunque haya agendado varias veces. Se presentó = una agenda Presentada o Cerrada; compró = Cerrada, y el cash es su Monto.</span></p>
    </section>`;
  }
  /* Barra apilada por cómo terminó cada registro: al pasar el mouse se resalta el tramo con su leyenda y el clic abre a
     esos leads (los que no agendaron no tienen agenda que mostrar). */
  function bloque(g, i, total) {
    const segs = TRAMOS.map(([k, txt, col, fn]) => ({ k, txt, col, n: Math.max(0, fn(g)) })).filter((s) => s.n > 0);
    const abre = (s) => (s.k === 'sin' ? '' : `utAbrir('dim',${i},'${s.k}')`);
    const tipS = (s) => [`${s.txt} · ${g.nombre}`, `${pl(s.n, 'registro', 'registros')} · ${pct1(pctDe(s.n, g.n))} del grupo`,
      s.k === 'compro' ? `Cash ${plata(g.cash)}` : '', abre(s) ? 'Clic: ver esos leads' : ''].filter(Boolean).join('\n');
    const barra = segs.map((s) => `<i class="c-${s.col}" data-e="${s.k}" style="flex:${s.n} 1 0" data-tip="${esc(tipS(s))}"${abre(s) ? ` onclick="${abre(s)}"` : ''}></i>`).join('');
    const ley = segs.map((s) => `<span data-e="${s.k}" data-tip="${esc(tipS(s))}"${abre(s) ? ` role="button" tabindex="0" onclick="${abre(s)}" onkeydown="if(event.key==='Enter')${abre(s)}"` : ''}><i class="c-${s.col}"></i>${esc(s.txt)} ${pctCorto(pctDe(s.n, g.n))}</span>`).join('');
    return `<div class="ut-bq c-${g.color}">
      <div class="ut-bq-1"><span class="ut-bq-n${g.agendaron ? ' clic' : ''}" data-tip="${esc(tipGrupo(g, total))}"${abrirAttrs(g, i)}><i class="ut-punto"></i><b>${esc(g.nombre)}</b>${g.ctx ? `<em class="ut-ctx">${esc(g.ctx)}</em>` : ''}</span><b class="ut-bq-m">${plata(g.cash)}</b></div>
      <div class="ut-bq-2"><span>${pl(g.n, 'registro', 'registros')} · ${pl(g.calificados, 'calificado', 'calificados')} · ${pl(g.agendaron, 'agendó', 'agendaron')} · ${pl(g.compraron, 'compró', 'compraron')}</span><span>${pctCorto(pctDe(g.agendaron, g.n))} agendó · ${pctCorto(pctDe(g.compraron, g.n))} compró</span></div>
      <div class="ut-apil">${barra}</div>
      <div class="ut-ley">${ley}</div>
    </div>`;
  }

  /* ════════ links con UTM ════════ */
  // cuántos registros trajo un link: los que llegaron con sus mismos UTM fijos (una macro de Meta vale cualquier valor)
  function conteoLink(l, combos) {
    const req = UTM_K.map((k) => [k, normUtm(l[k])]).filter(([, v]) => v && !esMacro(v));
    if (!req.length) return null;
    return (combos || []).filter((c) => req.every(([k, v]) => c[k] === v))
      .reduce((t, c) => ({ ...t, n: t.n + c.n, agendaron: t.agendaron + c.agendaron, compraron: t.compraron + c.compraron, cash: t.cash + c.cash }), { n: 0, agendaron: 0, compraron: 0, cash: 0, req });
  }
  function tipLink(l, cl) {
    if (!cl) return `${l.nombre}\nNo tiene UTM fijos para contarlo: con las macros de Meta, lo que trajo se ve arriba por campaña y por anuncio`;
    return [l.nombre, `${pl(cl.n, 'registro', 'registros')} con ${cl.req.map(([k, v]) => `${k}=${v}`).join(' y ')}`,
      `${pl(cl.agendaron, 'agendó', 'agendaron')} · ${pl(cl.compraron, 'compró', 'compraron')} · ${plata(cl.cash)}`].join('\n');
  }
  function cardLinks(u) {
    const filas = (UT.links || []).map((l) => {
      const cl = conteoLink(l, u.combos);
      const params = UTM_K.filter((k) => l[k]).map((k) => `${k}=${esc(l[k])}`).join(' · ') || 'sin parámetros UTM';
      const idq = esc(String(l.id)).replace(/'/g, '');
      const tipo = (TIPOS.find((t) => t[0] === l.tipo) || TIPOS[TIPOS.length - 1])[1];
      const pieza = /^https?:\/\//i.test(l.pieza_url || '') ? `<a class="ut-ev" href="${esc(l.pieza_url)}" target="_blank" rel="noopener">${esc(l.pieza_titulo || 'ver la pieza')}</a>` : '';
      return `<div class="ut-ln">
        <span class="ut-ln-ico${l.tipo === 'video' ? ' yt' : ''}">${l.tipo === 'video' ? uiIco('youtube', 16) : ICO_LINK}</span>
        <div class="ut-ln-t">
          <div class="ut-ln-n"><b>${esc(l.nombre)}</b><em class="ut-auto">${esc(tipo)}</em>${pieza}</div>
          <code class="ut-ln-p">${params}</code>
        </div>
        <span class="ut-ln-c" data-tip="${esc(tipLink(l, cl))}">${cl ? `${pl(cl.n, 'registro', 'registros')}${cl.compraron ? ` · ${pl(cl.compraron, 'venta', 'ventas')}` : ''}` : '—'}</span>
        <span class="ut-ln-acc">
          <button type="button" title="Copiar link final" onclick="utLinkCopiar('${idq}')">${uiIco('copiar', 15)}</button>
          <button type="button" title="Editar" onclick="utLinkEditar('${idq}')">${uiIco('lapiz', 15)}</button>
          <button type="button" class="rojo" title="Borrar" onclick="utLinkBorrar('${idq}')">${uiIco('tacho', 15)}</button>
        </span>
      </div>`;
    }).join('');
    return `<section class="ut-card">
      <header class="ut-ch"><div><h3>Links con UTM</h3><p>El link de cada anuncio con su fuente, campaña y anuncio, y cuántos registros y ventas trajo.</p></div>
        <div class="ut-ch-acc"><button type="button" class="ut-btn-pri" onclick="utLinkNuevo()">${uiIco('mas', 13)}Nuevo link</button></div></header>
      ${UT.errLinks ? uiAviso({ tipo: 'rojo', texto: 'No pude leer los links guardados: ' + UT.errLinks }) : ''}
      <div class="ut-links">${filas || `<div class="ut-vacio"><b>Todavía no hay links</b><span>Armá el primero con "Nuevo link": sale con la landing de este sitio y sus UTM, listo para pegar en el anuncio.</span></div>`}</div>
    </section>`;
  }
  const linkPorId = (id) => (UT.links || []).find((l) => String(l.id) === String(id));
  function copiar(txt) {
    const ok = () => uiToast('Link copiado ✓', 'ok');
    try { navigator.clipboard.writeText(txt).then(ok, () => window.prompt('Copiá el link:', txt)); }
    catch (e) { window.prompt('Copiá el link:', txt); }
  }
  window.utLinkCopiar = (id) => {
    const l = linkPorId(id); if (!l) return;
    const url = linkFinal(l);
    if (url) copiar(url); else uiToast('Ese link no tiene destino', 'mal');
  };
  window.utLinkBorrar = async (id) => {
    const l = linkPorId(id); if (!l || !confirm(`¿Borrar "${l.nombre}" de los links?`)) return;
    try { await dbBorrar(COL_LINKS, l.id); await cargarLinks(true); render(); uiToast('Listo ✓', 'ok'); }
    catch (e) { uiToast('No pude borrar: ' + e.message, 'mal'); }
  };

  /* ════════ asistente: nuevo / editar link ════════ */
  const landing = () => location.origin + '/';
  window.utLinkNuevo = () => abrirWiz(null);
  window.utLinkEditar = (id) => { const l = linkPorId(id); if (l) abrirWiz(l); };
  function abrirWiz(l) {
    const v = (k, d = '') => (l && l[k]) || d;
    UT.wiz = { paso: 0, id: l ? l.id : null, d: { nombre: v('nombre'), destino: v('destino', landing()), source: v('source'), medium: v('medium'),
      campaign: v('campaign'), content: v('content'), tipo: v('tipo', 'anuncio'), pieza_url: v('pieza_url'), pieza_titulo: v('pieza_titulo') } };
    uiModalAbrir({ titulo: l ? 'Editar link' : 'Nuevo link con UTM', sub: 'Paso 1 de 4 · Lo esencial', cuerpo: '<div id="utWiz"></div>', ancho: '494px' });
    const m = document.querySelector('#uiModal .ui-modal'); if (m) m.classList.add('ut-wiz');
    wizPintar();
  }
  function campo(k, lbl, ph, ayuda, oblig) {
    return `<label class="ut-wf"><span>${esc(lbl)}${oblig ? ' *' : ''}</span><input class="ut-wi" value="${esc(UT.wiz.d[k])}" placeholder="${esc(ph)}" oninput="utWizSet('${k}',this.value)"${k === 'nombre' ? ' autofocus' : ''}>${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
  }
  function cajaFinal() {
    const url = linkFinal(UT.wiz.d);
    return `<div class="ut-final" id="utWizFinalCaja"${url ? '' : ' hidden'}><div class="ut-final-h"><span>LINK FINAL</span><button type="button" title="Copiar" onclick="utWizCopiar()">${uiIco('copiar', 14)}</button></div><p id="utWizFinal">${esc(url)}</p></div>`;
  }
  function wizPintar() {
    const w = UT.wiz, caja = $('utWiz'); if (!w || !caja) return;
    const sub = document.querySelector('#uiModal .ui-modal > header span');
    if (sub) sub.textContent = `Paso ${w.paso + 1} de 4 · ${PASOS[w.paso]}`;
    let cuerpo = '';
    if (w.paso === 0) {
      cuerpo = campo('nombre', 'Nombre', 'Ej: Anuncio 1 · video corto', 'Solo para que lo reconozcas en la lista.', true) +
        campo('destino', 'Link de destino', landing(), 'Por defecto, la landing de este sitio.') +
        (w.d.destino !== landing() ? `<button type="button" class="ut-wl" onclick="utWizSet('destino','${esc(landing())}',true)">Usar la landing de este sitio</button>` : '') +
        cajaFinal();
    } else if (w.paso === 1) {
      const meta = UTM_K.some((k) => esMacro(normUtm(w.d[k])));
      cuerpo = `<div class="ut-wpre"><span>Atajos</span>${PRESETS.map((p) => `<button type="button" class="${Object.entries(p.vals).every(([k, v]) => w.d[k] === v) ? 'on' : ''}" onclick="utWizPreset('${p.id}')">${esc(p.txt)}</button>`).join('')}</div>` +
        `<div class="ut-w2">${campo('source', 'utm_source · de dónde', 'fb', '', true)}${campo('medium', 'utm_medium · formato', 'paid')}</div>` +
        `<div class="ut-w2">${campo('campaign', 'utm_campaign · campaña', 'webinar-noviembre')}${campo('content', 'utm_content · anuncio', 'anuncio-1')}</div>` +
        `<p class="ut-wnota">Todo en minúsculas y con guiones. El mismo nombre de campaña en todos sus anuncios, o después no se puede juntar.${meta ? ' Las {{macros}} de Meta van tal cual: Meta pone el nombre real de la campaña y del anuncio en cada clic. Pegá el link en "URL del sitio web" del anuncio.' : ''}</p>` + cajaFinal();
    } else if (w.paso === 2) {
      cuerpo = `<label class="ut-wf"><span>Qué es</span><label class="ut-sel ancho"><select onchange="utWizSet('tipo',this.value,true)">
          ${TIPOS.map(([v, t]) => `<option value="${v}"${w.d.tipo === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select>${uiIco('abajo', 14)}</label></label>` +
        campo('pieza_url', 'Link de la pieza (opcional)', 'https://…', 'Para abrirla desde la lista de links.') +
        campo('pieza_titulo', 'Título de la pieza (opcional)', 'Ej: el video del testimonio');
    } else {
      const url = linkFinal(w.d);
      cuerpo = `<div class="ut-wres">
          <div><span>Nombre</span><b>${esc(w.d.nombre)}</b></div>
          <div><span>Parámetros</span><code>${UTM_K.filter((k) => w.d[k]).map((k) => `${k}=${esc(normUtm(w.d[k]))}`).join(' · ') || 'ninguno'}</code></div>
          <div><span>Pieza</span><b>${esc((TIPOS.find((t) => t[0] === w.d.tipo) || ['', ''])[1])}${w.d.pieza_titulo ? ' · ' + esc(w.d.pieza_titulo) : ''}</b></div>
        </div>` + (url ? cajaFinal() : `<p class="ut-wnota rojo">Falta un link de destino válido (con https://).</p>`);
    }
    const puede = wizPuede();
    caja.innerHTML = `
      <div class="ut-wprog">${PASOS.map((_, i) => `<i class="${i <= w.paso ? 'on' : ''}"></i>`).join('')}</div>
      <div class="ut-wcuerpo">${cuerpo}</div>
      <footer class="ut-wpie">
        <button type="button" class="ut-wcan" onclick="uiModalCerrar()">Cancelar</button>
        <span>${w.paso > 0 ? `<button type="button" class="ut-wat" onclick="utWizPaso(-1)">${uiIco('izq', 14)}Atrás</button>` : ''}
        <button type="button" class="ut-wsig" id="utWizSig" ${puede.ok ? '' : 'disabled'} title="${esc(puede.por || '')}" onclick="utWizPaso(1)">${w.paso === 3 ? (w.id ? 'Guardar cambios' : 'Guardar y copiar') : 'Siguiente'}${uiIco('flecha', 14)}</button></span>
      </footer>`;
    const f = caja.querySelector('input[autofocus]'); if (f && !w.id) setTimeout(() => f.focus(), 30);
  }
  function wizPuede() {
    const d = UT.wiz.d;
    if (!String(d.nombre).trim()) return { ok: false, por: 'Poné un nombre para reconocerlo en la lista.' };
    if (!/^https?:\/\//i.test(String(d.destino).trim())) return { ok: false, por: 'El link de destino tiene que empezar con https://' };
    if (UT.wiz.paso >= 1 && !normUtm(d.source)) return { ok: false, por: 'Falta utm_source: de dónde viene (fb, ig, youtube…).' };
    return { ok: true };
  }
  window.utWizSet = (k, v, repintarYa) => {
    if (!UT.wiz) return;
    UT.wiz.d[k] = v;
    if (repintarYa) { wizPintar(); return; }
    const url = linkFinal(UT.wiz.d);
    const p = $('utWizFinal'), cj = $('utWizFinalCaja');
    if (p) p.textContent = url;
    if (cj) cj.hidden = !url;
    const b = $('utWizSig'), pu = wizPuede();
    if (b) { b.disabled = !pu.ok; b.title = pu.por || ''; }
  };
  window.utWizPreset = (id) => {
    const p = PRESETS.find((x) => x.id === id); if (!p || !UT.wiz) return;
    UTM_K.forEach((k) => { if (p.vals[k] == null && esMacro(UT.wiz.d[k])) UT.wiz.d[k] = ''; });   // no arrastrar macros de otro atajo
    Object.assign(UT.wiz.d, p.vals);
    if (id.startsWith('meta')) UT.wiz.d.tipo = 'anuncio';
    wizPintar();
  };
  window.utWizCopiar = () => { const u = linkFinal((UT.wiz && UT.wiz.d) || {}); if (u) copiar(u); };
  window.utWizPaso = async (d) => {
    const w = UT.wiz; if (!w) return;
    if (d > 0 && !wizPuede().ok) return;
    if (d > 0 && w.paso === 3) {
      const doc = { ...w.d, nombre: String(w.d.nombre).trim(), destino: String(w.d.destino).trim() };
      UTM_K.forEach((k) => { doc[k] = normUtm(doc[k]); });
      if (w.id) doc.id = w.id;
      try {
        await dbGuardar(COL_LINKS, doc);
        await cargarLinks(true);
        uiModalCerrar(); render();
        copiar(linkFinal(doc));
      } catch (e) { uiToast('No pude guardar: ' + e.message, 'mal'); }
      return;
    }
    w.paso = Math.max(0, Math.min(3, w.paso + d));
    wizPintar();
  };

  /* ════════ el recorrido de un lead (detalle de UTM's y Trazabilidad) ════════ */
  const resDe = (r) => (r.compro ? RESULTADOS[0] : r.presento ? RESULTADOS[1] : RESULTADOS[2]);
  const EST_COLOR = { Cerrada: 'verde', Presentada: 'azul', 'No-show': 'violeta', Cancelada: 'naranja', Descalificada: 'rosa', 'Re-agenda': 'azul', Confirmada: 'ambar', Pendiente: 'gris' };
  const EST_TXT = { Cerrada: 'Compró', Presentada: 'Se presentó, sin cerrar', 'Re-agenda': 'Reagendó' };
  // "2026-11-01 17:00" (la hora de la llamada, ya en la zona del cliente) o un ISO → "1 nov 17:00"
  function fCorta(v) {
    const s = String(v || '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (m) return `${Number(m[3])} ${UI_MESES_C[Number(m[2]) - 1]}${m[4] ? ` ${m[4].padStart(2, '0')}:${m[5]}` : ''}`;
    const d = new Date(s);
    if (isNaN(d)) return '—';
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona(), month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
    return `${Number(g('day'))} ${UI_MESES_C[Number(g('month')) - 1]} ${g('hour')}:${g('minute')}`;
  }
  // días entre el registro y una fecha del pipeline; negativo = agendó antes de registrarse (el registro no lo trajo)
  function dias(desdeIso, hasta) {
    const a = Date.parse(desdeIso), s = String(hasta || '');
    const b = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00' : s.replace(' ', 'T'));
    return isNaN(a) || isNaN(b) ? null : (b - a) / 864e5;
  }
  const diasTxt = (n) => (n == null || n < 0 ? '' : n < 1 ? 'el mismo día' : `a los ${pl(Math.round(n), 'día', 'días')}`);
  function preguntaTxt(id) {
    const q = ((datos() || {}).icp || {}).landing || [];
    return (q.find((x) => x.id === id) || {}).texto || id;
  }
  function pasoRegistro(r, rows) {
    if (!r.reg) {
      const origen = rows.map((x) => x.Origen).find(Boolean);
      return `<li class="tz-p gris"><i></i><div><b>Sin registro en la landing</b><span>${origen ? `Origen en el pipeline: ${esc(origen)} · ` : ''}no cruza por mail ni WhatsApp con ningún registro${wElegido() === 'todos' ? '' : ' de este webinar'}</span></div></li>`;
    }
    const u = r.reg.utm, ruta = [u.utm_source, u.utm_campaign, u.utm_content].map((x) => x || '—');
    const cal = r.reg.calificado === true ? '<em class="ut-chip g">calificado</em>' : r.reg.calificado === false ? '<em class="ut-chip r">no calificado</em>' : '<em class="ut-chip n">sin responder</em>';
    const resp = Object.entries(r.reg.respuestas || {}).map(([k, v]) => `<em class="ut-chip v" data-tip="${esc(preguntaTxt(k) + '\n' + v)}">${esc(v)}</em>`).join('');
    return `<li class="tz-p"><i></i><div><b>Se registró</b><span>${esc(fCorta(r.reg.creado))} · ${u.utm_source ? `<code>${ruta.map(esc).join(' › ')}</code>` : 'sin UTM'}</span><span class="tz-chips">${cal}${resp}</span></div></li>`;
  }
  function pasoAgenda(x, r) {
    const est = x.Estado || 'Pendiente', monto = (datos() || {}).montos || {};
    const cuando = r.reg ? diasTxt(dias(r.reg.creado, x.Timestamp)) : '';
    const partes = [x.Timestamp ? `Agendó ${fCorta(x.Timestamp)}${cuando ? ` (${cuando} del registro)` : ''}` : 'Agendó',
      x['Fecha call'] ? `llamada ${fCorta(x['Fecha call'])}` : '', x.Closer ? `closer ${x.Closer}` : '', x.Evento || ''].filter(Boolean);
    return `<li class="tz-p c-${EST_COLOR[est] || 'gris'}"><i></i><div><b>${esc(EST_TXT[est] || est)}${est === 'Cerrada' && monto[x._id] ? ` · ${plata(monto[x._id])}` : ''}</b><span>${partes.map(esc).join(' · ')}</span></div></li>`;
  }
  function tarjetaLead(r) {
    const rows = filasDe(r);
    const nombre = rows.map((x) => x.Nombre).find(Boolean) || (rows.length ? 'Sin nombre' : 'Agenda nueva: tocá Actualizar');
    const res = resDe(r);
    return `<article class="ut-ag tz-lead">
      <div class="ut-ag-1"><b>${esc(nombre)}</b><span class="ut-est c-${res[2]}">${esc(res[1])}</span>${r.cash ? `<span class="tz-cash">${plata(r.cash)}</span>` : ''}</div>
      <ol class="tz-pasos">${pasoRegistro(r, rows)}${rows.slice().reverse().map((x) => pasoAgenda(x, r)).join('')}</ol>
    </article>`;
  }
  // filtros compartidos por el detalle y la Trazabilidad. f = {q, res, fuente, campana, anuncio, orden}
  const VACIO = '__vacio';
  function filtrar(recs, f) {
    const q = String(f.q || '').trim().toLowerCase();
    const porUtm = (r, k, v) => !v || (r.reg && (v === VACIO ? !r.reg.utm[k] : r.reg.utm[k] === v));
    let out = recs.filter((r) => {
      if (f.res === 'sinreg' ? r.reg : (f.res && resDe(r)[0] !== f.res)) return false;
      if (!porUtm(r, 'utm_source', f.fuente) || !porUtm(r, 'utm_campaign', f.campana) || !porUtm(r, 'utm_content', f.anuncio)) return false;
      if (q) {
        const txt = filasDe(r).map((x) => [x.Nombre, x.Email, x.WhatsApp, x.Closer, x.Evento, x.Origen].join(' ')).join(' ') +
          (r.reg ? ' ' + Object.values(r.reg.utm).join(' ') : '');
        if (!txt.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const fecha = (r) => String((filasDe(r)[0] || {})['Fecha call'] || '');
    if (f.orden === 'monto') out = out.slice().sort((a, b) => b.cash - a.cash || fecha(b).localeCompare(fecha(a)));
    else if (f.orden === 'reg') out = out.slice().sort((a, b) => String((b.reg || {}).creado || '').localeCompare(String((a.reg || {}).creado || '')));
    else out = out.slice().sort((a, b) => (f.orden === 'ant' ? -1 : 1) * fecha(b).localeCompare(fecha(a)));
    return out;
  }
  function sel(estado, campoF, ops, todosTxt, fn) {
    return `<label class="ut-sel"><select onchange="${fn}('${campoF}',this.value)"><option value="">${esc(todosTxt)}</option>${ops.map(([v, t]) => `<option value="${esc(v)}"${v === estado[campoF] ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${uiIco('abajo', 14)}</label>`;
  }
  const ORDENES = [['rec', 'Llamada más reciente'], ['ant', 'Llamada más antigua'], ['reg', 'Registro más reciente'], ['monto', 'Mayor cash']];
  const selOrden = (estado, fn) => `<label class="ut-sel"><select onchange="${fn}('orden',this.value)">${ORDENES.map(([v, t]) => `<option value="${v}"${estado.orden === v ? ' selected' : ''}>${t}</option>`).join('')}</select>${uiIco('abajo', 14)}</label>`;

  /* ════════ modal: los leads de una fuente / campaña / anuncio ════════ */
  window.utAbrir = (tipo, i, res) => {
    const c = UT.calc, d = datos(); if (!c || !d) return;
    let g;
    if (tipo === 'sin') {
      g = { nombre: wElegido() === 'todos' ? 'Sin registro' : 'Sin registro de este webinar', color: 'gris', recs: d.recorridos.filter((r) => !r.reg),
        sub: 'Agendas que no cruzan con ningún registro: llegaron por otro lado o con otro mail o WhatsApp' };
    } else {
      const x = c.grupos[i]; if (!x) return;
      g = { nombre: x.nombre, color: x.color, recs: d.recorridos.filter((r) => r.reg && r.reg.utm[c.dim] === x.k),
        sub: `Los que agendaron · por ${DIM[c.dim][0]}${x.ctx ? ' · ' + x.ctx : ''}` };
    }
    uiTipOcultarSeguro();
    UT.md = { g, q: '', res: res || '', orden: 'rec' };
    uiModalAbrir({ titulo: g.nombre, sub: g.sub, cuerpo: '<div id="utMd"></div>', ancho: '866px' });
    const m = document.querySelector('#uiModal .ui-modal');
    if (m) m.classList.add('ut-md', 'c-' + g.color);
    mdPintar(true);
  };
  function mdPintar(entero) {
    const caja = $('utMd'); if (!caja || !UT.md) return;
    const s = UT.md, todas = s.g.recs, out = filtrar(todas, s);
    const lista = out.length ? out.slice(0, TOPE).map(tarjetaLead).join('') : `<div class="ut-vacio"><b>Nadie con estos filtros</b><span>Probá sacando algún filtro o cambiando la búsqueda.</span></div>`;
    if (!entero) { const l = $('utMdLista'); if (l) { l.innerHTML = lista; l.scrollTop = 0; } const k = $('utMdN'); if (k) k.textContent = `${uiNum(out.length)} con estos filtros`; return; }
    const pres = todas.filter((r) => r.presento).length, comp = todas.filter((r) => r.compro);
    caja.innerHTML = `
      <div class="ut-md-kpis">
        <div><span>AGENDARON</span><b>${uiNum(todas.length)}</b><small>${pl(todas.reduce((a, r) => a + r.filas.length, 0), 'agenda', 'agendas')}</small></div>
        <div><span>SE PRESENTARON</span><b>${uiNum(pres)}</b></div>
        <div><span>COMPRARON</span><b class="verde">${uiNum(comp.length)}</b></div>
        <div><span>CASH</span><b>${plata(comp.reduce((a, r) => a + r.cash, 0))}</b></div>
      </div>
      <div class="ut-md-filtros">
        <label class="ut-buscar">${uiIco('buscar', 16)}<input type="search" placeholder="Buscar por nombre, mail, closer o UTM..." value="${esc(s.q)}" oninput="utMdSet('q',this.value)"></label>
        <div class="ut-sels">
          ${sel(s, 'res', RESULTADOS.map(([v, t]) => [v, 'Resultado: ' + t]), 'Resultado: todos', 'utMdSet')}
          ${selOrden(s, 'utMdSet')}
          <span class="ut-md-n" id="utMdN">${uiNum(out.length)} con estos filtros</span>
        </div>
      </div>
      <div class="ut-md-lista" id="utMdLista">${lista}</div>
      <footer class="ut-md-pie">${out.length > TOPE ? `Se muestran los primeros ${TOPE} de ${uiNum(out.length)}: acotá con la búsqueda o los filtros.` : 'Cada lead con su recorrido: el registro (de qué anuncio vino y qué contestó) y sus agendas, con la llamada, el closer y cómo terminó.'}</footer>`;
  }
  let mdTimer = null;
  window.utMdSet = (campoF, v) => {
    if (!UT.md) return;
    UT.md[campoF] = v;
    if (campoF === 'q') { clearTimeout(mdTimer); mdTimer = setTimeout(() => mdPintar(false), 120); } else mdPintar(false);
  };

  /* ════════════════════════ TRAZABILIDAD ════════════════════════ */
  function mediana(xs) { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; }
  function renderTraza() {
    const caja = $('traza');
    if (!caja) return;
    const d = datos();
    if (!d) { caja.innerHTML = falla(); return; }
    const recs = d.recorridos, con = recs.filter((r) => r.reg), comp = recs.filter((r) => r.compro), compCon = comp.filter((r) => r.reg);
    const cash = (xs) => xs.reduce((a, r) => a + r.cash, 0);
    const primera = (r) => filasDe(r).map((x) => x.Timestamp).filter(Boolean).sort()[0];
    const dAg = con.map((r) => dias(r.reg.creado, primera(r))).filter((x) => x != null && x >= 0);
    const dVe = compCon.map((r) => { const c = filasDe(r).find((x) => x.Estado === 'Cerrada') || {}; return dias(r.reg.creado, c['Fecha cierre'] || c['Fecha call']); }).filter((x) => x != null && x >= 0);
    const mAg = mediana(dAg), mVe = mediana(dVe);
    const kpi = (l, v, s, tip, cls) => `<div data-tip="${esc(tip)}"><span>${l}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b><small>${esc(s)}</small></div>`;
    const diasV = (m) => (m == null ? '—' : m < 1 ? '<1 día' : pl(Math.round(m), 'día', 'días'));
    const f = UT.tz;
    const ops = (k) => {
      const vs = [...new Set(con.map((r) => r.reg.utm[k]))].sort();
      return vs.map((v) => (v ? [v, v] : [VACIO, 'Sin ' + k]));
    };
    const out = filtrar(recs, f);
    caja.innerHTML = `<div class="ut tz">
      <div class="ut-kpis ut-kpis5">
        ${kpi('AGENDARON', uiNum(recs.length), `${pctCorto(pctDe(con.length, recs.length))} con registro`, `Personas con al menos una agenda · ${uiNum(recs.length)}\n${pl(con.length, 'cruza', 'cruzan')} con un registro de la landing${wElegido() === 'todos' ? '' : ' de este webinar'}\n${uiNum(recs.length - con.length)} sin registro`)}
        ${kpi('COMPRARON', uiNum(comp.length), `${uiNum(compCon.length)} con registro`, `Compraron · ${uiNum(comp.length)}\n${pl(compCon.length, 'trazada', 'trazadas')} hasta el registro (y su UTM)`, 'verde')}
        ${kpi('CASH', plata(cash(comp)), `${pctCorto(pctDe(cash(compCon), cash(comp)))} trazado`, `Cash · ${plata(cash(comp))}\n${plata(cash(compCon))} de leads con registro`, 'oro')}
        ${kpi('REGISTRO → AGENDA', diasV(mAg), dAg.length ? `mediana de ${pl(dAg.length, 'lead', 'leads')}` : 'sin datos todavía', 'Días desde que se registró hasta que agendó\nLa mediana: la mitad tarda menos, la otra mitad más\nNo cuentan los que agendaron antes de registrarse')}
        ${kpi('REGISTRO → VENTA', diasV(mVe), dVe.length ? `mediana de ${pl(dVe.length, 'venta', 'ventas')}` : 'sin ventas trazadas', 'Días desde que se registró hasta la venta (fecha de cierre o de la llamada)')}
      </div>
      <section class="ut-card tz-card">
        <header class="ut-ch"><div><h3>Recorrido de cada lead</h3><p>Del anuncio al registro, de ahí a la agenda y a la venta. Solo los que agendaron: el resto sigue en Registros.</p></div></header>
        <div class="tz-filtros">
          <label class="ut-buscar">${uiIco('buscar', 16)}<input type="search" placeholder="Buscar por nombre, mail, closer o UTM..." value="${esc(f.q)}" oninput="utTzSet('q',this.value)"></label>
          <div class="ut-sels">
            ${sel(f, 'fuente', ops('utm_source'), 'Fuente: todas', 'utTzSet')}
            ${sel(f, 'campana', ops('utm_campaign'), 'Campaña: todas', 'utTzSet')}
            ${sel(f, 'anuncio', ops('utm_content'), 'Anuncio: todos', 'utTzSet')}
            ${sel(f, 'res', RESULTADOS.map(([v, t]) => [v, t]).concat([['sinreg', 'Sin registro']]), 'Resultado: todos', 'utTzSet')}
            ${selOrden(f, 'utTzSet')}
            <span class="ut-md-n" id="tzN">${uiNum(out.length)} ${out.length === 1 ? 'lead' : 'leads'}</span>
          </div>
        </div>
        <div class="tz-lista" id="tzLista">${tzLista(out)}</div>
      </section>
      <p class="ut-ayuda">${uiIco('info', 12)}<span>El registro sale de la landing (con el UTM del link por el que entró) y las agendas, del pipeline; se cruzan por mail o WhatsApp. Las fechas van en la zona del cliente.</span></p>
    </div>`;
  }
  function tzLista(out) {
    const f = UT.tz;
    if (!out.length) return `<div class="ut-vacio">${uiIco('usuarios', 20)}<b>${(datos() || { recorridos: [] }).recorridos.length ? 'Nadie con estos filtros' : 'Todavía nadie agendó'}</b><span>${(datos() || { recorridos: [] }).recorridos.length ? 'Probá sacando algún filtro.' : 'Cuando entren agendas al pipeline, acá se ve el recorrido de cada uno.'}</span></div>`;
    return out.slice(0, f.n).map(tarjetaLead).join('') +
      (out.length > f.n ? `<button type="button" class="ut-btn-sec tz-mas" onclick="utTzMas()">Mostrar más (${uiNum(out.length - f.n)})</button>` : '');
  }
  let tzTimer = null;
  function tzPintarLista() {
    const d = datos(); if (!d) return;
    const out = filtrar(d.recorridos, UT.tz);
    const l = $('tzLista'), n = $('tzN');
    if (l) l.innerHTML = tzLista(out);
    if (n) n.textContent = `${uiNum(out.length)} ${out.length === 1 ? 'lead' : 'leads'}`;
  }
  window.utTzSet = (campoF, v) => {
    UT.tz[campoF] = v; UT.tz.n = TOPE;
    if (campoF === 'q') { clearTimeout(tzTimer); tzTimer = setTimeout(tzPintarLista, 120); } else tzPintarLista();
  };
  window.utTzMas = () => { UT.tz.n += TOPE; tzPintarLista(); };

  /* ════════ resaltado al pasar el mouse ════════
     Un solo manejador delegado (como los de ui-atlas.js): la pantalla se repinta con innerHTML y así no se pierden ni se
     duplican los eventos. El tooltip lo pone el data-tip de cada elemento. */
  if (!window.__utHover) {
    window.__utHover = true;
    const distReset = (d) => {
      d.classList.remove('hov');
      d.querySelectorAll('[data-k].on').forEach((x) => x.classList.remove('on'));
      const c = d.querySelector('.ut-dona-c');
      if (c && c.dataset.orig != null) { c.innerHTML = c.dataset.orig; delete c.dataset.orig; }
    };
    document.addEventListener('mouseover', (e) => {
      const t = e.target && e.target.closest ? e.target : null;
      // dona + lista: el tramo y su fila van juntos
      const el = t && t.closest('.ut-dist [data-k]');
      document.querySelectorAll('.ut-dist.hov').forEach((d) => { if (!el || !d.contains(el)) distReset(d); });
      if (el) {
        const d = el.closest('.ut-dist'), k = el.dataset.k;
        d.classList.add('hov');
        d.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x.dataset.k === k));
        const c = d.querySelector('.ut-dona-c');
        if (c) {
          if (c.dataset.orig == null) c.dataset.orig = c.innerHTML;
          c.innerHTML = `<b>${esc(el.dataset.cv || '')}</b><span>${esc(el.dataset.cl || '')}</span>`;
        }
      }
      // barra apilada + su leyenda, dentro de cada grupo del embudo
      const tr = t && t.closest('.ut-bq [data-e]');
      document.querySelectorAll('.ut-bq.hov').forEach((b) => {
        if (tr && b.contains(tr)) return;
        b.classList.remove('hov'); b.querySelectorAll('[data-e].on').forEach((x) => x.classList.remove('on'));
      });
      if (tr) {
        const b = tr.closest('.ut-bq'), k = tr.dataset.e;
        b.classList.add('hov');
        b.querySelectorAll('[data-e]').forEach((x) => x.classList.toggle('on', x.dataset.e === k));
      }
    });
  }
})();
