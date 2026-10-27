/* Funnel — portado de Conversión › Funnels del hub original (calcado de la referencia de diseño),
 * solo para masterclass. Las cuentas son las del núcleo del tablero (window.TAB, en inicio.js).
 *
 * Pestañas:
 *  - Embudo     → el desglose del webinar: gasto de ads → registros → calificados → asistentes al vivo → agendas →
 *                 presentadas → cierres → cash. Cada paso con su conversión contra la que proyectó el webinar, el
 *                 cuello de botella marcado y, abajo, el mismo embudo abierto por fuente (utm_source). Es el embudo
 *                 comercial del hub original con los pasos de antes de la agenda, que acá sí se miden.
 *  - Comparador → los webinars lado a lado (el comparador de la pestaña Webinars del hub original): agendas, show-up, cierres y
 *                 cash en su ventana de cierre, a igual día si alguno sigue abierto.
 * Afuera, por ser del hub original o estar en otra pantalla: Funnels (tarjetas de landings), Contactos, Píxel de Meta, el embudo
 * de producto (alumnos) y el pipeline / calendario / Gantt de Webinars (la ficha y la checklist están en Webinar).
 */
(function () {
  'use strict';
  const SEC = 'embudos';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => uiEsc(t);
  const T = () => window.TAB;
  const leer = (k, d) => { try { return sessionStorage.getItem(k) || d; } catch (e) { return d; } };
  const grabar = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } };
  const H = { tab: leer('fn:tab', 'embudo'), fuente: null, wid: null };
  const TABS = [['embudo', 'Embudo'], ['comparador', 'Comparador']];

  /* ── utilidades (las de funnels.js del hub original) ── */
  const pc1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  const plur = (n, uno, varios) => (n === 1 ? uno : (varios || uno + 's'));
  const plata = (n, dec) => T().plata(n, dec);
  const tipT = (...ls) => ls.filter((l) => l != null && l !== '').join('\n');
  const tip = (...ls) => esc(tipT(...ls));
  const TIPS = [];
  const conTips = (sel, textos) => { TIPS.push([sel, textos]); };
  function aplicarTips() { TIPS.splice(0).forEach(([sel, ts]) => document.querySelectorAll(sel).forEach((el, i) => { if (ts[i]) el.dataset.tip = ts[i]; })); }
  // el tooltip quedaba encima del modal que abría el clic: se esconde antes de abrir
  const modal = (o) => { if (typeof uiTipOcultar === 'function') uiTipOcultar(); return uiModalAbrir(o); };
  const puedeVer = (v) => { try { return vistasDe(perfilEfectivo()).includes(v); } catch (e) { return true; } };
  function estadoChip(e) {
    const c = { Cerrada: 'verde', Presentada: 'azul', Pendiente: 'gris', Confirmada: 'cian', 'Re-agenda': 'ambar', 'No-show': 'violeta', Cancelada: 'rojo', Descalificada: 'rojo' }[e] || 'gris';
    return `<span class="fn-tchip c-${c}">${esc(e || 'Sin estado')}</span>`;
  }
  // un KPI de ui-atlas.js con su tooltip y, si hay, el clic que abre lo que cuenta
  function kpiCon(html, t, onclick) {
    return html.replace('<div class="ui-kpi', `<div data-tip="${esc(t)}"${onclick ? ` onclick="${onclick}"` : ''} class="fn-kpi-t${onclick ? ' clic' : ''} ui-kpi`);
  }

  /* ════════ armazón ════════ */
  function armazon() {
    const sec = $(SEC);
    if (!sec) return;
    if (!sec.querySelector('.fn')) sec.innerHTML = `<div class="fn"><nav class="fn-tabs" id="fnTabs" role="tablist"></nav><div class="fn-body" id="fnBody"><p class="fn-cargando">Cargando...</p></div></div>`;
    $('fnTabs').innerHTML = TABS.map(([id, t]) => `<button type="button" role="tab" class="fn-tab${H.tab === id ? ' on' : ''}" onclick="fnTab('${id}')">${t}</button>`).join('');
  }
  const esta = () => T() && T().vista() === SEC;
  function cabecera() {
    if (!esta()) return;
    const ex = $('pageExtra');
    if (ex) ex.innerHTML = (H.tab === 'embudo' ? T().selector() : '') + `<button type="button" class="ui-icobtn" title="Actualizar" onclick="fnRecargar()">${uiIco('refrescar', 16)}</button>`;
  }
  let PINTADA = 0;
  function pintar() {
    if (!esta()) return;
    armazon();
    const b = $('fnBody');
    if (!b) return;
    const p = ++PINTADA;
    let html = '';
    try { html = H.tab === 'comparador' ? vistaComparador() : vistaEmbudo(); }
    catch (e) { console.warn('[funnel]', e); html = `<div class="fn-aviso rojo">${uiIco('alerta', 15)}<span>Algo falló al pintar esta pestaña: ${esc(e.message)}</span></div>`; }
    b.innerHTML = html;
    aplicarTips();
    cabecera();
    // el gasto de Meta llega después y no traba lo demás
    const w = T().web();
    if (H.tab === 'embudo' && w && T().gastoYa(w) === undefined) T().gasto(w).then(() => { if (p === PINTADA && esta()) pintar(); });
  }
  async function render(force) {
    if (!$(SEC) || !T()) return;
    armazon(); cabecera();
    try { await T().cargar(force); }
    catch (e) { if (e.message !== 'sesion') { const b = $('fnBody'); if (b) b.innerHTML = `<div class="fn-aviso rojo">${uiIco('alerta', 15)}<span>No pude leer el tablero: ${esc(e.message)}</span></div>`; } return; }
    pintar();
  }
  window.fnTab = (id) => { H.tab = id; grabar('fn:tab', id); pintar(); };
  window.fnRecargar = async () => { uiToast('Actualizando…'); await render(true); uiToast('Actualizado', 'ok'); };

  /* ════════ EMBUDO ════════ */
  const EMB_COL = ['#d4a53a', '#dfb03b', '#d9b83c', '#c9c043', '#a9c34c', '#86c55a', '#5fc56b', '#34c47c', '#34d399'];
  let EMB = null;   // el último embudo pintado (para el clic en un paso)
  // la línea entre dos pasos: la conversión del paso contra la proyectada y, si el paso sale del anterior, quiénes se cayeron
  function conector(e, prev, i) {
    const proy = e.convProy != null ? ` (proyección ${uiNum(e.convProy, e.convProy % 1 ? 1 : 0)}%)` : '';
    let txt;
    if (e.k === 'asistentes' && e.n == null) txt = 'sin cargar: tocá para cargar los asistentes al vivo';
    else if (e.conv == null) txt = e.k === 'calificados' ? 'nadie contestó las preguntas todavía' : 'sin base para calcular la conversión';
    else if (e.k === 'calificados') txt = `${pc1(e.conv)}% calificó${proy}${e.caida > 0 ? ` · ${uiNum(e.caida)} ${e.perdida}` : ''}`;
    else if (e.k === 'asistentes') txt = `${pc1(e.conv)}% de los registros se conectó al vivo${proy}`;
    else if (e.k === 'agendas') txt = `${pc1(e.conv)}% de los registros agendó${proy}${e.deAsistentes != null ? ` · ${pc1(e.deAsistentes)}% de los asistentes` : ''}`;
    else if (e.k === 'presentadas') txt = `show-up ${pc1(e.conv)}%${proy}${e.caida > 0 ? ` · se cayeron ${uiNum(e.caida)}` : ''}`;
    else txt = `${pc1(e.conv)}% cerró${proy}${e.caida > 0 ? ` · ${uiNum(e.caida)} ${e.perdida}` : ''}`;
    const ok = e.ratio != null && e.ratio >= 1;
    const t = tip(`${prev.nom} → ${e.nom}`, e.conv == null ? 'Sin conversión para calcular' : `${pc1(e.conv)}% ${e.base}${e.convProy != null ? ` · la proyección dice ${e.convProy}%` : ''}`,
      e.ratio != null ? (ok ? 'Igual o mejor que lo proyectado' : `${pc1(100 * (1 - e.ratio))}% por debajo de lo proyectado`) : '',
      e.k === 'presentadas' ? 'Show-up: presentadas ÷ (presentadas + no-show); no cuenta pendientes ni canceladas' : '',
      e.porVenir ? `${uiNum(e.porVenir)} más con la llamada por venir (hoy o después): no son caída` : '',
      e.esCuello ? 'Cuello de botella: el paso más lejos de su proyección' : '',
      e.caida > 0 && (e.k === 'presentadas' || e.k === 'cierres') ? 'Clic: ver quiénes' : e.k === 'asistentes' ? 'Clic: cargar los asistentes' : '');
    const clic = (e.caida > 0 && (e.k === 'presentadas' || e.k === 'cierres')) || e.k === 'asistentes';
    return `<div class="fn-emb-caida${clic ? ' clic' : ''}${e.conv == null ? ' gris' : ok ? ' ok' : ''}" data-tip="${t}"${clic ? ` onclick="fnEmbPaso(${i})"` : ''}><span></span><span>↓ ${esc(txt)}${e.porVenir ? ` <em class="fn-porvenir">+ ${uiNum(e.porVenir)} por venir</em>` : ''}${e.esCuello ? ' <b class="fn-cuello">Cuello de botella</b>' : ''}</span><span></span></div>`;
  }
  function barrasEmbudo(x) {
    const etapas = x.pasos, base = etapas[0].n || 0, n = etapas.length;
    return `<div class="fn-emb">${etapas.map((e, i) => {
      const prev = etapas[i - 1];
      const p = e.n == null || !base ? null : 100 * e.n / base;
      const color = EMB_COL[Math.round(i / Math.max(1, n - 1) * (EMB_COL.length - 1))];
      const tp = tip(e.nom, e.n == null ? 'Sin cargar' : `${uiNum(e.n)}${p != null ? ` · ${pc1(p)}% de los registros` : ''}`,
        e.proy != null ? `Proyección: ${uiNum(e.proy)}${e.n != null ? ` (${pc1(100 * e.n / (e.proy || 1))}%)` : ''}` : '',
        e.costo != null ? `${plata(e.costo, 2)} de ads por cada ${e.uno}` : '',
        e.aMano ? 'Se carga a mano: todavía no hay de dónde leerlo' : '',
        e.k === 'registros' || e.k === 'calificados' ? (puedeVer('registros') ? 'Clic: ver los registros' : '') : e.k === 'asistentes' ? 'Clic: cargar los asistentes' : 'Clic: ver quiénes');
      // un paso sin dato o en cero no lleva barra: queda el riel vacío con el número
      const barra = e.n > 0 ? `<i style="width:${Math.max(Math.min(p == null ? 100 : p, 100), 3)}%;background:${color}">${uiNum(e.n)}</i>` : `<b class="fn-emb-cero">${e.n == null ? '—' : '0'}</b>`;
      return `${i > 0 ? conector(e, prev, i) : ''}<div class="fn-emb-f clic${e.n > 0 ? '' : ' cero'}" data-tip="${tp}" onclick="fnEmbPaso(${i})">
        <span class="fn-emb-n">${esc(e.nom)}${e.aMano ? '<em class="fn-emb-mano">a mano</em>' : ''}</span>
        <span class="fn-emb-r">${barra}</span>
        <span class="fn-emb-p">${p == null ? '—' : pc1(p) + '%'}</span>
      </div>`;
    }).join('')}</div>`;
  }
  // las dos puntas del embudo que no son personas: la plata que entra (ads) y la que sale (cash)
  function lineaPlata(x, st, arriba) {
    const { P, e } = st;
    if (arriba) {
      const g = st.g;
      const que = x.fuente ? 'El gasto es de toda la cuenta de Meta: no se abre por fuente'
        : g === undefined ? 'leyendo Meta…' : !g ? 'Meta Ads sin conectar o sin respuesta' : !g.comparable ? `está en ${g.moneda}: no se cruza con el cash` : '';
      const val = !x.fuente && g ? T().plata(g.gasto, 0, g.moneda) : '—';
      const sub = que || `${x.cpl != null ? `${plata(x.cpl, 2)} por registro` : ''}${P.cpl ? ` · proyección ${plata(P.cpl, 2)}` : ''}${e.presupuesto ? ` · presupuesto ${plata(e.presupuesto)}` : ''}`;
      return `<div class="fn-emb-plata" data-tip="${tip('Inversión en ads', g ? `Meta, del ${T().fechaTxt(g.desde)} al ${T().fechaTxt(g.hasta)}` : '', sub)}">${uiIco('megafono', 15)}<span>Inversión en ads</span><b>${esc(val)}</b><small>${esc(sub)}</small></div>`;
    }
    const objC = P.cashObjetivo != null ? P.cashObjetivo : P.cash;
    const sub = [x.ticket != null ? `ticket ${plata(x.ticket)}` : '', x.roas != null ? `ROAS x${uiNum(x.roas, 1)}` : '', !x.fuente && e.roasObjetivo ? `objetivo x${uiNum(e.roasObjetivo, 1)}` : '',
      !x.fuente && objC ? `${pc1(100 * x.cash / objC)}% de ${plata(objC)}` : ''].filter(Boolean).join(' · ');
    return `<div class="fn-emb-plata fin" data-tip="${tip('Cash', 'Monto de las agendas Cerradas', sub)}">${uiIco('plata', 15)}<span>Cash</span><b>${x.cash ? esc(plata(x.cash)) : '—'}</b><small>${esc(sub || 'sin ventas todavía')}</small></div>`;
  }
  let FUENTES = [];
  function tablaFuentes(st) {
    const tabla = T();
    const fs = [...new Set([...Object.keys(st.w.registros.porFuente || {}), ...st.rows.map(tabla.fuenteDe)])];
    const filas = fs.map((f) => ({ f, x: tabla.embudo({ w: st.w, rows: st.rows, fuente: f, hoy: st.h }) }))
      .sort((a, b) => b.x.reg.n - a.x.reg.n || b.x.m.agendas - a.x.m.agendas);
    FUENTES = filas.map((r) => r.f);
    if (!filas.length) return `<div class="fn-vacio-linea">Todavía no hay registros ni agendas para abrir por fuente.</div>`;
    const celda = (v, sub, t) => `<td class="fn-num"${t ? ` data-tip="${esc(t)}"` : ''}>${v}${sub ? `<small class="fn-sub">${sub}</small>` : ''}</td>`;
    const fila = ({ f, x }, i, total) => {
      const r = x.reg, m = x.m, nom = f === tabla.SIN_REG ? 'Agendas sin registro' : f;
      return `<tr class="${total ? 'fn-total' : 'fn-clic'}${!total && H.fuente === f ? ' on' : ''}"${total ? '' : ` onclick="fnFuente(${i})"`}>
        <td><b class="fn-lnom">${esc(total ? 'Todo el webinar' : nom)}</b></td>
        ${celda(f === tabla.SIN_REG ? '—' : uiNum(r.n), !total && st.reg.total && f !== tabla.SIN_REG ? pc1(100 * r.n / st.reg.total) + '%' : '', f === tabla.SIN_REG ? 'Agendaron sin registrarse en la landing (o con otro mail y WhatsApp)' : '')}
        ${celda(f === tabla.SIN_REG ? '—' : uiNum(r.cal), r.n && f !== tabla.SIN_REG ? pc1(100 * r.cal / r.n) + '%' : '')}
        ${celda(uiNum(m.agendas), r.n ? pc1(100 * m.agendas / r.n) + '%' : '')}
        ${celda(m.show == null ? '—' : pc1(m.show) + '%', '', m.show == null ? '' : `${uiNum(m.asis)} de ${uiNum(m.asis + m.ns)} con resultado se presentaron`)}
        ${celda(uiNum(m.cierres), m.cierrePct != null ? pc1(m.cierrePct) + '%' : '')}
        ${celda(m.cash ? esc(plata(m.cash)) : '—')}
        ${celda(m.cash && r.n ? esc(plata(m.cash / r.n, 2)) : '—', '', 'Cash ÷ registros de la fuente')}
      </tr>`;
    };
    const tot = { f: null, x: st.emb };
    return `<div class="fn-tabla-w"><table class="fn-tabla fn-tfu"><thead><tr><th>Fuente</th><th style="width:96px">Registros</th><th style="width:100px">Calificados</th><th style="width:96px">Agendas</th><th style="width:86px">Show-up</th><th style="width:90px">Cierres</th><th style="width:116px">Cash</th><th style="width:116px">Cash / registro</th></tr></thead>
      <tbody>${filas.map((r, i) => fila(r, i)).join('')}${fila(tot, -1, true)}</tbody></table></div>`;
  }
  window.fnFuente = (i) => { const f = FUENTES[i]; H.fuente = H.fuente === f ? null : f; pintar(); };
  window.fnFuenteFuera = () => { H.fuente = null; pintar(); };

  function vistaEmbudo() {
    const tabla = T();
    const st = tabla.estado();
    if (!st) return `<div class="fn-vacio"><b>Todavía no hay un webinar.</b>Crealo en Webinar y el embudo se arma solo con sus registros y sus agendas.${puedeVer('webinar') ? `<div class="fn-vacio-acc"><button type="button" class="fn-btn pri chico" onclick="location.hash='#webinar'">Ir a Webinar</button></div>` : ''}</div>`;
    if (H.wid !== st.id) { H.wid = st.id; H.fuente = null; }
    const x = H.fuente ? tabla.embudo({ w: st.w, rows: st.rows, fuente: H.fuente, hoy: st.h }) : st.emb;
    EMB = { x, st };
    const { P, e } = st, reg = x.reg, m = x.m;
    const paso = (k) => x.pasos.findIndex((p) => p.k === k);
    const kpis = `<div class="ui-kpis fn-kpis">
      ${kpiCon(uiKpi({ etiqueta: 'Registros', valor: uiNum(reg.n), sub: !H.fuente && e.registros ? `${pc1(100 * reg.n / e.registros)}% del objetivo (${uiNum(e.registros)})` : `${uiNum(reg.cal)} calificados`, ico: 'usuarios', color: 'azul' }),
        tipT('Registros', `${uiNum(reg.n)} · ${uiNum(reg.cal)} calificados`, !H.fuente && e.registros ? `Objetivo de la proyección: ${uiNum(e.registros)}` : ''), puedeVer('registros') ? "location.hash='#registros'" : '')}
      ${kpiCon(uiKpi({ etiqueta: 'Agendas', valor: uiNum(m.agendas), sub: reg.n ? `${pc1(100 * m.agendas / reg.n)}% de los registros` : `${uiNum(m.porVenir)} por venir`, ico: 'calendario', color: 'violeta' }),
        tipT('Agendas', `${uiNum(m.agendas)}${reg.n ? ` · ${pc1(100 * m.agendas / reg.n)}% de los registros` : ''}`, `${uiNum(m.canceladas)} canceladas · ${uiNum(m.ns)} no-show · ${uiNum(m.porVenir)} con la llamada por venir`, 'Clic: ver quiénes'), `fnEmbPaso(${paso('agendas')})`)}
      ${kpiCon(uiKpi({ etiqueta: 'Cierres', valor: uiNum(m.cierres), sub: m.cierrePct != null ? `${pc1(m.cierrePct)}% de las presentadas` : 'sin presentadas todavía', ico: 'check', color: 'verde' }),
        tipT('Cierres', `${uiNum(m.cierres)} de ${uiNum(m.asis)} presentadas`, e.pctCierre ? `Proyección: ${e.pctCierre}% de cierre` : '', 'Clic: ver quiénes'), `fnEmbPaso(${paso('cierres')})`)}
      ${kpiCon(uiKpi({ etiqueta: 'Cash', valor: x.cash ? plata(x.cash) : '—', sub: x.roas != null ? `ROAS x${uiNum(x.roas, 1)}` : 'Monto de las cerradas', ico: 'plata', color: 'gold' }),
        tipT('Cash', `${plata(x.cash)} en ${uiNum(m.cierres)} ${plur(m.cierres, 'cierre')}`, x.ticket != null ? `Ticket promedio ${plata(x.ticket)}` : '', x.roas != null ? `ROAS x${uiNum(x.roas, 2)}` : ''))}
    </div>`;
    const cu = x.cuello;
    return `${kpis}
      <section class="fn-card"><div class="fn-card-tit"><b>De la inversión al cash</b><span>${esc(st.w.nombre)}${H.fuente ? '' : ' · todas las fuentes'}</span>
        ${H.fuente ? `<button type="button" class="fn-fchip on fn-quitar" onclick="fnFuenteFuera()" title="Ver todas las fuentes">Fuente: ${esc(H.fuente === tabla.SIN_REG ? 'sin registro' : H.fuente)} ✕</button>` : ''}</div>
        ${lineaPlata(x, st, true)}
        ${barrasEmbudo(x)}
        ${lineaPlata(x, st, false)}
        <p class="fn-nota">${uiIco('info', 14)}<span>Cada paso se compara con la proyección del webinar: calificados, asistentes y agendas sobre los registros; presentadas sobre las llamadas con resultado; cierres sobre las presentadas. Los asistentes al vivo se cargan a mano.${H.fuente ? ' Abierto por fuente, la proyección se compara solo en las tasas.' : ''}</span></p>
      </section>
      ${cu ? `<div class="fn-alerta-card"><b>El cuello de botella es «${esc(cu.nom)}»: ${pc1(cu.conv)}% contra ${uiNum(cu.convProy, cu.convProy % 1 ? 1 : 0)}% proyectado.</b><span>Es el paso que quedó más lejos de la proyección${H.fuente ? ' en esta fuente' : ''}.${cu.k === 'presentadas' && cu.porVenir ? ` Sin contar ${uiNum(cu.porVenir)} con la llamada por venir.` : ''}</span></div>` : ''}
      <section class="fn-sec"><div class="fn-sec-t">Por fuente <small class="fn-sec-sub">utm_source del registro · tocá una para ver su embudo</small></div>
        <div style="margin-top:12px">${tablaFuentes(st)}</div>
        <p class="fn-nota">${uiIco('info', 14)}<span>La fuente de una agenda es la de su registro en la landing (mismo mail o WhatsApp). "Agendas sin registro" son las de gente que agendó sin pasar por la landing.</span></p>
      </section>`;
  }

  // detalle de un paso: los que se cayeron justo ahí, los que tienen la llamada por venir y los que llegaron
  const fechaCorta = (v) => { const f = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(f) ? uiFechaCorta(f) : (f || '—'); };
  window.fnEmbPaso = (i) => {
    if (!EMB) return;
    const tabla = T(), { x, st } = EMB, e = x.pasos[i];
    if (!e) return;
    if (e.k === 'registros' || e.k === 'calificados') { if (puedeVer('registros')) location.hash = '#registros'; return; }
    if (e.k === 'asistentes') { window.tbAsistencia(st.id); return; }
    const rows = x.fuente ? st.rows.filter((r) => tabla.fuenteDe(r) === x.fuente) : st.rows;
    const pv = (r) => tabla.porVenir(r, st.h);
    const llegan = { agendas: rows, presentadas: rows.filter(tabla.asistio), cierres: rows.filter((r) => r.Estado === 'Cerrada') }[e.k];
    const desde = { presentadas: rows, cierres: rows.filter(tabla.asistio) }[e.k] || [];
    const porVenir = e.k === 'presentadas' ? rows.filter(pv) : [];
    const cayeron = desde.filter((r) => !llegan.includes(r) && !porVenir.includes(r));
    const tablaHtml = (rs) => {
      if (!rs.length) return `<div class="fn-vacio-linea">Nadie.</div>`;
      const orden = rs.slice().sort((a, b) => String(b['Fecha call'] || '').localeCompare(String(a['Fecha call'] || '')));
      return `<div class="fn-tabla-w"><table class="fn-tabla"><thead><tr><th>Nombre</th><th style="width:100px">Llamada</th><th style="width:120px">Estado</th><th style="width:130px">Closer</th><th style="width:130px">Fuente</th><th style="width:120px">Monto</th></tr></thead>
        <tbody>${orden.slice(0, 100).map((r) => `<tr><td><b class="fn-lnom">${esc(r.Nombre || 'sin nombre')}</b></td><td class="fn-mono">${esc(fechaCorta(r['Fecha call']))}</td><td>${estadoChip(r.Estado)}</td>
          <td>${esc(r.Closer || '—')}</td><td>${esc(tabla.fuenteDe(r) === tabla.SIN_REG ? 'sin registro' : tabla.fuenteDe(r))}</td><td>${r.Estado === 'Cerrada' && tabla.monto(r) ? esc(plata(tabla.monto(r))) : '—'}</td></tr>`).join('')}</tbody></table></div>
        ${rs.length > 100 ? `<p class="fn-nota">${uiIco('info', 14)}<span>Se muestran las 100 más nuevas de ${uiNum(rs.length)}.</span></p>` : ''}`;
    };
    const sec = (t, rs, sub, primero) => `<div class="fn-sec-t" style="margin:${primero ? '6px' : '22px'} 0 10px">${t} · ${uiNum(rs.length)}${sub ? ` <small class="fn-sec-sub">${esc(sub)}</small>` : ''}</div>${tablaHtml(rs)}`;
    const prev = x.pasos[i - 1];
    modal({
      titulo: e.nom, ancho: '880px',
      sub: `${uiNum(e.n)} ${e.n === 1 ? 'persona' : 'personas'}${e.conv != null ? ` · ${pc1(e.conv)}% ${e.base}` : ''}${porVenir.length ? ` · ${uiNum(porVenir.length)} por venir` : ''}${x.fuente ? ` · fuente ${x.fuente}` : ''}`,
      cuerpo: (cayeron.length ? sec('Se cayeron acá', cayeron, e.perdida, true) : '')
        + (porVenir.length ? sec('Por venir', porVenir, 'con la llamada hoy o más adelante: todavía no se cayeron', !cayeron.length) : '')
        + sec(`Llegaron a "${e.nom}"`, llegan, prev && e.k === 'agendas' ? 'todas las agendas del webinar' : '', !cayeron.length && !porVenir.length),
      acciones: [{ texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }],
    });
  };

  /* ════════ COMPARADOR (wbMetricas / wbComparador del hub original) ════════ */
  // corte (opcional, 'AAAA-MM-DD'): cuenta solo hasta ese día, para comparar un webinar con la ventana abierta contra
  // otro "a igual día": las agendas que entraron hasta el corte y los resultados de las llamadas hechas hasta el corte
  function wbMetricas(w, corte) {
    const tabla = T(), hasta = tabla.finVentana(w);
    const tope = corte && corte < hasta ? corte : hasta;
    const rs = tabla.filas(w.id).filter((r) => tabla.fechaAlta(r) <= tope);
    const yaPaso = (r) => !corte || tabla.fechaCall(r) <= corte;
    const asis = rs.filter((r) => tabla.asistio(r) && yaPaso(r)).length, ns = rs.filter((r) => r.Estado === 'No-show' && yaPaso(r)).length;
    const cerr = rs.filter((r) => r.Estado === 'Cerrada' && yaPaso(r));
    return { rs, agendas: rs.length, asis, ns, show: (asis + ns) ? Math.round(100 * asis / (asis + ns)) : null, cierres: cerr.length,
      cierrePct: asis ? Math.round(100 * cerr.length / asis) : null, cash: cerr.reduce((s, r) => s + tabla.monto(r), 0), hasta, registros: (w.registros || {}).total || 0 };
  }
  function vistaComparador() {
    const tabla = T(), h = tabla.hoy(), fc = (f) => tabla.fechaTxt(f);
    const ws = tabla.webinars().filter((w) => w.fecha && w.fecha <= h);
    if (!ws.length) {
      const prox = tabla.webinars().find((w) => w.fecha > h);
      return `<div class="fn-vacio"><b>Todavía no hay webinars hechos para comparar.</b>Cuando un webinar pase su vivo, aparece acá con sus agendas, show-up, cierres y cash en la ventana de cierre${prox ? ` (el próximo es el ${esc(fc(prox.fecha))})` : ''}.</div>`;
    }
    const ms = ws.map((w) => {
      const m = wbMetricas(w);
      const abierta = m.hasta >= h;
      // días de ventana que ya corrieron, contando el del vivo (la ventana entera si ya cerró)
      const dias = abierta ? tabla.difDias(w.fecha, h) + 1 : (Number(w.ventana) || 10) + 1;
      return { w, m, abierta, dias, faltan: abierta ? tabla.difDias(h, m.hasta) : 0 };
    });
    // Contra el anterior: si alguno tiene la ventana abierta (o duran distinto), los dos se cortan en los mismos días
    // transcurridos, como el "a igual día" de la barra de período.
    ms.forEach((x, i) => {
      const p = ms[i - 1];
      if (!p) return;
      const n = Math.min(x.dias, p.dias);
      x.cmp = (x.dias === p.dias && !x.abierta && !p.abierta) ? { a: x.m, b: p.m, dias: 0 }
        : { a: wbMetricas(x.w, tabla.sumarDias(x.w.fecha, n - 1)), b: wbMetricas(p.w, tabla.sumarDias(p.w.fecha, n - 1)), dias: n };
    });
    const serie = (k, fmt) => uiListaB(ms.map(({ w, m, abierta }) => ({ etiqueta: w.nombre, sub: fc(w.fecha) + (abierta ? ' · abierta' : ''), valor: m[k] || 0, texto: fmt(m[k], m), onclick: `fnWbAbrir(${ws.indexOf(w)})` })), { sinPct: true, compacta: true });
    const varTxt = (i, k, fmt) => {
      if (!i) return 'Es el primero de la lista';
      const c = ms[i].cmp, ant = ms[i - 1].w.nombre;
      const a = Number(c.a[k]) || 0, b = Number(c.b[k]) || 0;
      const igual = c.dias ? ` en sus primeros ${c.dias} ${plur(c.dias, 'día')}` : '';
      if (!b) return a ? `El anterior (${ant}) no tuvo${igual}` : `${ant} tampoco tuvo${igual}`;
      const v = Math.round(100 * (a - b) / b);
      return `${v >= 0 ? '▲ +' : '▼ '}${v}% vs ${ant}${igual} (${c.dias ? `${fmt(a)} contra ${fmt(b)}` : fmt(b)})`;
    };
    const cab = ({ w }) => `${w.nombre} · ${fc(w.fecha)}`;
    const ventana = ({ w, m, abierta }) => `Ventana: ${fc(w.fecha)} → ${fc(m.hasta)}${abierta ? '' : ' · cerrada'}`;
    const abiertaTxt = ({ abierta, faltan, m }) => (abierta ? `Ventana abierta · ${faltan ? `faltan ${faltan} ${plur(faltan, 'día')} (cierra el ${fc(m.hasta)})` : 'cierra hoy'}` : '');
    conTips('.fn-cmp [data-cmp="agendas"] .ui-lb-f', ms.map((x, i) => tipT(cab(x), `${uiNum(x.m.agendas)} ${plur(x.m.agendas, 'agenda')}${x.abierta ? ' hasta hoy' : ''}`, `${uiNum(x.m.registros)} registros`, ventana(x), abiertaTxt(x), varTxt(i, 'agendas', uiNum), 'Clic: ver su embudo')));
    conTips('.fn-cmp [data-cmp="cierres"] .ui-lb-f', ms.map((x, i) => tipT(cab(x), `${uiNum(x.m.cierres)} ${plur(x.m.cierres, 'cierre')}${x.m.cierrePct != null ? ` · ${x.m.cierrePct}% de los ${uiNum(x.m.asis)} que se presentaron` : ''}`,
      `Show-up: ${x.m.show == null ? '—' : x.m.show + '%'} · ${uiNum(x.m.agendas)} agendas`, abiertaTxt(x), varTxt(i, 'cierres', uiNum), 'Clic: ver su embudo')));
    conTips('.fn-cmp [data-cmp="cash"] .ui-lb-f', ms.map((x, i) => tipT(cab(x), x.m.cash ? `${plata(x.m.cash)} de cash` : `Sin cash en la ventana${x.abierta ? ' hasta hoy' : ''}`,
      x.m.cash && x.m.agendas ? `${plata(x.m.cash / x.m.agendas)} por agenda${x.m.cierres ? ' · ' + plata(x.m.cash / x.m.cierres) + ' por cierre' : ''}` : '', abiertaTxt(x), varTxt(i, 'cash', (v) => plata(v)), 'Clic: ver su embudo')));
    return `<div class="fn-cmp">
        <section class="fn-card" data-cmp="agendas"><div class="fn-card-tit"><b>Agendas en la ventana</b></div>${serie('agendas', (v) => uiNum(v))}</section>
        <section class="fn-card" data-cmp="cierres"><div class="fn-card-tit"><b>Cierres</b></div>${serie('cierres', (v, m) => `${uiNum(v)}${m.cierrePct != null ? ' · ' + m.cierrePct + '%' : ''}`)}</section>
        <section class="fn-card" data-cmp="cash"><div class="fn-card-tit"><b>Cash</b></div>${serie('cash', (v) => (v ? plata(v) : '—'))}</section>
      </div>
      <div class="fn-tabla-w" style="margin-top:16px"><table class="fn-tabla">
        <thead><tr><th>Webinar</th><th style="width:90px">Vivo</th><th style="width:96px">Registros</th><th style="width:90px">Agendas</th><th style="width:90px">Show-up</th><th style="width:90px">Cierres</th><th style="width:110px">Cierre / pres.</th><th style="width:110px">Cash</th><th style="width:120px">Cash por agenda</th></tr></thead>
        <tbody>${ms.map(({ w, m, abierta }) => `<tr onclick="fnWbAbrir(${ws.indexOf(w)})" class="fn-clic">
          <td><b class="fn-lnom">${esc(w.nombre)}</b>${abierta ? ' <span class="fn-tchip c-ambar" title="La ventana de cierre sigue abierta: los números todavía se mueven">abierta</span>' : ''}</td><td class="fn-mono">${esc(fc(w.fecha))}</td>
          <td class="fn-num">${uiNum(m.registros)}</td><td class="fn-num">${uiNum(m.agendas)}</td><td class="fn-num">${m.show == null ? '—' : m.show + '%'}</td><td class="fn-num">${uiNum(m.cierres)}</td>
          <td class="fn-num">${m.cierrePct == null ? '—' : m.cierrePct + '%'}</td><td class="fn-num">${m.cash ? esc(plata(m.cash)) : '—'}</td>
          <td class="fn-num">${m.agendas && m.cash ? esc(plata(m.cash / m.agendas)) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="fn-nota">${uiIco('info', 14)}<span>Cada webinar cuenta sus agendas (las de su gente registrada y las que entraron hasta el final de su ventana de cierre). Si la ventana sigue abierta, la comparación con el anterior es a igual día.</span></p>`;
  }
  window.fnWbAbrir = (i) => {
    const w = T().webinars().filter((x) => x.fecha && x.fecha <= T().hoy())[i];
    if (!w) return;
    T().elegir(w.id);
    H.tab = 'embudo'; grabar('fn:tab', 'embudo'); pintar();
  };

  /* ════════ enganche con la app ════════ */
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS[SEC] = () => { render().catch((e) => console.warn('[funnel]', e)); };
})();
