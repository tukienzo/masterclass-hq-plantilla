/* Ventas (#crm) — el CRM de ventas del hub original, portado a masterclass.
 *
 * Las partes de la planilla original, como pestañas: Ventas (una fila por llamada), Cuotas y el Leaderboard con sus
 * fórmulas. Los datos viven en /api/crm (netlify/functions/crm.mjs + lib/crm-core.mjs).
 *
 * Lo que suma sobre una planilla, igual que en el hub original:
 *   · Llamadas sin cargar: las agendas del pipeline que ya pasaron y no tienen resultado, para cargarlas con nombre,
 *     teléfono, fecha, origen y setter puestos.
 *   · Historial de cada registro: quién cambió qué y cuándo.
 *   · Cobrar una cuota en un toque y traer las pendientes del mes anterior.
 *   · Bajar el mes en CSV.
 *   · Cargar cierre: el cierre se carga UNA vez como plan de pagos y de ahí salen la venta y las cuotas.
 *   · Programas: el catálogo del cliente (colección `programas` de /api/db), que usa "Cargar cierre".
 * Al guardar una venta se concilia el pipeline (Presentada / No-show / Cerrada + Monto), como el crmsync del hub original.
 * Sin lo que era solo del hub original: Backend (resells a alumnos), los pagos a la planilla, los alias y nombres de su equipo.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const MON = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';   // la moneda del negocio
  const FN = '/api/crm';
  const ST = { mes: '', tab: 'ventas', closer: null, q: '', data: null, gen: 0, previo: null, form: null, verTodas: false };
  const E = (s) => uiEsc(s);
  const n0 = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  const usd = (v) => uiNum(n0(v));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const L = () => (ST.data && ST.data.listas) || {};
  const yo = () => (ST.data && ST.data.yo) || {};
  const editaTodo = () => yo().rol === 'equipo' || yo().rol === 'cliente';
  const mesSig = (m, n) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7); };
  const nombreMes = (m) => { const [y, mm] = m.split('-').map(Number); const n = UI_MESES[mm - 1]; return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + y; };
  const fechaCorta = (f) => /^\d{4}-\d{2}-\d{2}/.test(f || '') ? uiFechaCorta(String(f).slice(0, 10)) : (f || '');
  const SI = (v) => norm(v) === 'si';

  async function pedir(metodo, qs, cuerpo) {
    let r;
    try {
      r = await fetch(FN + (qs ? '?' + qs : ''), { method: metodo, cache: 'no-store', headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    } catch (e) { throw Object.assign(new Error('No hay conexión. Revisá internet y reintentá.'), { status: 0 }); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && typeof mostrarGate === 'function' && typeof YO !== 'undefined' && YO) mostrarGate('Tu sesión se cerró: entrá de nuevo con tu link.');
    if (!r.ok || j.error) throw Object.assign(new Error(j.error || ('HTTP ' + r.status)), { status: r.status, j });
    return j;
  }

  /* ════════ permisos (los mismos de lib/crm-core.mjs; el servidor decide, esto solo esconde botones) ════════ */
  function puedeEditar(r) {
    if (editaTodo()) return true;
    if (!ST.data || r.mes < mesSig(ST.data.hoy, -1) || r.mes > mesSig(ST.data.hoy, 1)) return false;
    return yo().rol === 'closer' && norm(r.closer) === norm(yo().closer);
  }
  const puedeCrear = () => editaTodo() || yo().rol === 'closer';

  /* ════════ datos ════════ */
  async function cargar(mes, fresco) {
    const gen = ++ST.gen;
    const j = await pedir('GET', 'mes=' + encodeURIComponent(mes) + (fresco ? '&t=' + Date.now() : ''));
    if (gen !== ST.gen) return;
    ST.data = j; ST.mes = j.mes; ST.previo = null;
    if (ST.closer === null) ST.closer = j.yo.closer || '';
  }
  const registros = (tipo) => ((ST.data && ST.data.registros) || []).filter((r) => r.tipo === tipo);
  const porId = (id) => ((ST.data && ST.data.registros) || []).find((r) => r.id === id);
  // el closer es el nombre de la persona tal cual (el de Equipo o el de la agenda); se compara con norm()
  const closerDe = (nombre) => String(nombre || '').trim();
  const filas = () => (typeof DATA !== 'undefined' && DATA && DATA.rows) || [];
  const closersConocidos = () => [...new Set([...((ST.data && ST.data.closers) || []), ...registros('venta').map((r) => r.closer), ...filas().map((r) => closerDe(r.Closer))].filter(Boolean))].sort();

  /* Llamadas sin cargar: agendas del pipeline de este mes que ya pasaron, no canceladas, con closer, y sin registro en
     el CRM: ni por la agenda, ni por el nombre, ni por el teléfono (lo cargado a mano no trae la agenda). */
  const cola = (s) => String(s || '').replace(/\D/g, '').slice(-8);
  function pendientes() {
    if (!ST.data) return [];
    const hoy = uiHoyAR();
    const ahora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires' });
    const ventas = registros('venta');
    const ids = new Set(ventas.map((r) => r.agenda).filter(Boolean));
    const nombres = new Set(ventas.map((r) => norm(r.nombre)).filter(Boolean));
    const tels = new Set(ventas.map((r) => cola(r.telefono)).filter((t) => t.length >= 8));
    const filtro = norm(yo().rol === 'closer' ? yo().closer : ST.closer);   // un closer, solo las suyas: la que cargue queda a su nombre
    return filas().filter((r) => {
      const f = String(r['Fecha call'] || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f.slice(0, 7) !== ST.mes || f > hoy) return false;
      if (f === hoy && /^\d{1,2}:\d{2}/.test(r.Hora || '') && String(r.Hora).padStart(5, '0').slice(0, 5) > ahora) return false;   // la de las 20 h todavía no pasó
      if (/cancelad|descalificad/i.test(r.Estado || '')) return false;
      const c = closerDe(r.Closer);
      if (!c || (filtro && norm(c) !== filtro)) return false;
      return !ids.has(r._id) && !nombres.has(norm(r.Nombre)) && !tels.has(cola(r.WhatsApp) || '-');
    }).sort((a, b) => String(b['Fecha call']).localeCompare(String(a['Fecha call'])) || String(b.Hora || '').localeCompare(String(a.Hora || '')));
  }

  /* ════════ armazón ════════ */
  const TABS = [['ventas', 'Ventas'], ['cuotas', 'Cuotas'], ['leaderboard', 'Leaderboard']];
  function barra() {
    const d = ST.data;
    const hoy = d ? d.hoy : '';
    const badge = { ventas: registros('venta').length, cuotas: registros('cuota').length };
    return `<div class="crm-bar">
      <div class="crm-mes">
        <button type="button" class="ui-icobtn" title="Mes anterior" onclick="crmMes(-1)">${uiIco('izq', 16)}</button>
        <b>${E(ST.mes ? nombreMes(ST.mes) : '')}</b>
        <button type="button" class="ui-icobtn" title="Mes siguiente" onclick="crmMes(1)"${hoy && ST.mes >= mesSig(hoy, 1) ? ' disabled' : ''}>${uiIco('der', 16)}</button>
        ${d && ST.mes !== hoy ? `<button type="button" class="crm-hoy" onclick="crmIrMes('${E(hoy)}')">Volver a ${E(nombreMes(hoy).split(' ')[0].toLowerCase())}</button>` : ''}
      </div>
      ${uiTabs(TABS.map(([id, t]) => ({ id, texto: t, badge: badge[id] != null && d ? badge[id] : null })), ST.tab, 'crmTab')}
      <div class="crm-bar-der">
        ${d && editaTodo() ? `<button type="button" class="fin-btn3" title="El catálogo de programas y precios del cliente" onclick="crmProgramas()">${uiIco('etiqueta', 15)}Programas</button>` : ''}
        ${ST.tab !== 'leaderboard' ? `<button type="button" class="ui-icobtn" title="Bajar este mes en CSV" onclick="crmCsv()">${uiIco('descargar', 16)}</button>` : ''}
        ${ST.tab !== 'leaderboard' && d && puedeCrear() ? `<button type="button" class="btn primary" onclick="crmNuevo()">${uiIco('mas', 15)}${ST.tab === 'cuotas' ? 'Cuota' : 'Cargar'}</button>` : ''}
      </div>
    </div>`;
  }
  const tipoDeTab = () => (ST.tab === 'cuotas' ? 'cuota' : 'venta');
  const sk = (alto, ancho = '100%') => `<i class="fin-sk" style="height:${alto}px;width:${ancho}"></i>`;

  async function render(fresco) {
    const sec = $('crm'); if (!sec) return;
    if (!$('crmRaiz')) sec.innerHTML = `<div class="crm" id="crmRaiz"><div id="crmBar"></div><div id="crmCuerpo"></div></div>`;
    if (!ST.mes) ST.mes = uiHoyAR().slice(0, 7);
    if (!ST.data || fresco) {
      $('crmBar').innerHTML = barra();
      if (!ST.data) $('crmCuerpo').innerHTML = `<div class="ui-kpis">${[1, 2, 3, 4].map(() => `<div class="ui-kpi">${sk(14, '50%')}${sk(36, '70%')}</div>`).join('')}</div>${sk(320)}`;
      try { await cargar(ST.mes, fresco); }
      catch (e) { $('crmCuerpo').innerHTML = errorHtml(e); return; }
    }
    pintar();
  }
  function errorHtml(e) {
    if (e.status === 401 || e.status === 403) return uiVacio({ ico: 'candado', titulo: e.message, texto: 'Si creés que deberías verlo, avisale al equipo.' });
    return uiAviso({ tipo: 'rojo', texto: 'No pude leer el CRM: ' + e.message, accion: { texto: 'Reintentar', onclick: 'crmRefrescar()' } });
  }
  function pintar() {
    if (!$('crmRaiz') || !ST.data) return;
    $('crmBar').innerHTML = barra();
    const f = { ventas: pintarVentas, cuotas: pintarCuotas, leaderboard: pintarLeaderboard }[ST.tab] || pintarVentas;
    $('crmCuerpo').innerHTML = f();
    if (ST.tab === 'cuotas') traerPrevio();
  }
  // "Llamadas sin cargar" sale del pipeline: cuando se recarga (cargarDatos de base.js), se repinta
  document.addEventListener('mhq:datos', () => { if ((location.hash || '').slice(1) === 'crm' && ST.tab === 'ventas') pintar(); });

  /* ════════ Ventas ════════ */
  const COLOR_SIT = (s) => {
    const n = norm(s);
    if (/^adentro|cerrado en 2/.test(n)) return 'verde';
    if (n === 'fee') return 'violeta';
    if (/seguimiento|reagend|quiere entrar|pensarlo|decidir/.test(n)) return 'ambar';
    if (/no cerro|no paga|no se presento/.test(n)) return 'rojo';
    if (/cobrado|completo pif/.test(n)) return 'verde';
    if (/por cobrar/.test(n)) return 'ambar';
    if (/paga tarde/.test(n)) return 'naranja';
    if (/dividido/.test(n)) return 'azul';
    if (/protocolo/.test(n)) return 'violeta';
    return 'gris';
  };
  const sit = (s) => (s ? uiEstado(s, COLOR_SIT(s)) : '<span class="crm-vacio">—</span>');
  const sn = (v) => (v ? `<span class="crm-sn ${SI(v) ? 'si' : norm(v) === 'no' ? 'no' : ''}">${E(SI(v) ? 'Sí' : v)}</span>` : '<span class="crm-vacio">—</span>');
  const plata = (v) => (n0(v) ? `<b>${usd(v)}</b>` : '<span class="crm-vacio">—</span>');

  function chipsCloser(regs) {
    const cuenta = {};
    regs.forEach((r) => { cuenta[r.closer || 'Sin closer'] = (cuenta[r.closer || 'Sin closer'] || 0) + 1; });
    if (ST.closer && !(ST.closer in cuenta)) cuenta[ST.closer] = 0;
    // el id del chip es el índice, no el nombre: un nombre con comilla rompería el onclick (y podría inyectar código)
    ST.chips = ['', ...Object.keys(cuenta).sort()];
    const ops = ST.chips.map((c, i) => ({ id: String(i), texto: c || 'Todos', badge: c ? cuenta[c] : regs.length }));
    return uiChips(ops, String(Math.max(0, ST.chips.indexOf(ST.closer || ''))), 'crmCloser', 'crm-chips');
  }
  function buscar(regs) {
    const q = norm(ST.q);
    return q ? regs.filter((r) => norm(`${r.nombre} ${r.telefono || ''} ${r.mail || ''} ${r.notas || ''} ${r.situacion || ''}`).includes(q)) : regs;
  }
  const buscador = () => `<label class="crm-buscar">${uiIco('buscar', 15)}<input type="search" id="crmQ" placeholder="Buscar por nombre, teléfono o nota…" value="${E(ST.q)}" oninput="crmBuscar(this.value)" autocomplete="off"></label>`;

  function pintarVentas() {
    const todas = registros('venta');
    const vs = todas.filter((r) => !ST.closer || r.closer === ST.closer);
    const k = kpisDe(vs);
    const pend = pendientes();
    ST.pend = pend;
    const lista = ST.filas = buscar(vs).slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.creado || '').localeCompare(String(a.creado || '')));
    const quien = ST.closer ? `de ${ST.closer}` : 'del equipo';
    return `
      <div class="ui-kpis crm-kpis">
        ${uiKpi({ ico: 'plata', etiqueta: 'Cash del mes', prefijo: MON(), valor: usd(k.cash), sub: `${usd(k.cashD1)} en la call · ${usd(k.cashSeg)} en seguimiento`, color: 'verde', variante: 'tinte' })}
        ${uiKpi({ ico: 'check', etiqueta: 'Cerradas', valor: uiNum(k.unidades), sub: `${k.uLlam} en la call · ${k.uSeg} en seguimiento${k.u2 ? ` · ${k.u2} en 2 llamadas` : ''}`, color: 'gold' })}
        ${uiKpi({ ico: 'objetivo', etiqueta: 'Tasa de cierre', valor: pct(k.cierreGral), sub: `efectiva ${pct(k.cierreEf)} · sobre ${k.presentadas} presentadas`, color: 'azul' })}
        ${uiKpi({ ico: 'usuarios', etiqueta: 'Show-up', valor: pct(k.showUp), sub: `${k.presentadas} de ${k.agendas} agendas`, color: 'violeta' })}
      </div>
      ${pend.length ? pendientesHtml(pend) : ''}
      <div class="crm-filtros">${chipsCloser(todas)}${buscador()}</div>
      ${uiTabla([
        { t: 'Lead', f: (r) => `<b>${E(r.nombre) || '<span class="crm-vacio">sin nombre</span>'}</b><small>${E([r.telefono, r.fuente].filter(Boolean).join(' · '))}</small>` },
        { t: 'Fecha', f: (r) => E(fechaCorta(r.fecha)) },
        ...(ST.closer ? [] : [{ t: 'Closer', f: (r) => E(r.closer) }]),
        { t: 'Se presentó', f: (r) => sn(r.presento), al: 'cen' },
        { t: 'Calificaba', f: (r) => sn(r.califica), al: 'cen' },
        { t: 'Situación', f: (r) => sit(r.situacion) },
        { t: 'En la call', f: (r) => plata(r.dia1), al: 'der' },
        { t: 'Seguimiento', f: (r) => plata(r.seguimiento), al: 'der' },
        { t: '', f: (r) => (r.notas ? `<span class="crm-nota" data-tip="${E('¿Cómo te sentiste en la call?\n' + r.notas)}">${uiIco('mensaje', 15)}</span>` : ''), ancho: '34px' },
      ], lista, { onFila: 'crmAbrirFila', vacio: ST.q ? 'Nada coincide con la búsqueda' : `Todavía no hay llamadas cargadas ${quien} en ${nombreMes(ST.mes).split(' ')[0].toLowerCase()}`, vacioTexto: pend.length ? 'Arrancá por las llamadas sin cargar de arriba.' : '' })}
      <p class="crm-pie">${lista.length} ${lista.length === 1 ? 'llamada' : 'llamadas'}${ST.q ? ' que coinciden' : ''} · cada cambio queda con nombre y hora en el historial del registro</p>`;
  }
  function pendientesHtml(pend) {
    const visibles = ST.verTodas ? pend : pend.slice(0, 6);
    return `<section class="crm-pend">
      <header><span class="crm-pend-n">${pend.length}</span><div><b>${pend.length === 1 ? 'Llamada de la agenda sin cargar' : 'Llamadas de la agenda sin cargar'}</b>
        <span>Ya pasaron y no tienen resultado en el CRM. Tocá una y sale con el nombre, el teléfono, la fecha y el origen puestos.</span></div></header>
      <div class="crm-pend-l">${visibles.map((r, i) => `<button type="button" class="crm-pend-i" onclick="crmCargarAgenda(${i})">
        <b>${E(r.Nombre)}</b><span>${E(fechaCorta(r['Fecha call']))}${r.Hora ? ' · ' + E(String(r.Hora).slice(0, 5)) : ''}${ST.closer ? '' : ' · ' + E(closerDe(r.Closer))}</span>
        <em>${E(r.Origen || r.Evento || '')}</em>${uiIco('der', 14)}</button>`).join('')}</div>
      ${pend.length > visibles.length ? `<button type="button" class="crm-mas" onclick="crmVerTodas()">Ver las ${pend.length}</button>` : ''}
    </section>`;
  }
  const pct = (v) => (v == null ? '—' : uiNum(v * 100, 0) + '%');

  // las fórmulas del Leaderboard (las mismas de lib/crm-core.mjs kpis(), sobre lo que está filtrado en pantalla)
  function kpisDe(vs) {
    const c = (f) => vs.filter(f).length;
    const agendas = c((v) => SI(v.presento) || norm(v.presento) === 'no'), presentadas = c((v) => SI(v.presento)), calif = c((v) => SI(v.presento) && SI(v.califica));
    const uSeg = c((v) => norm(v.situacion) === 'adentro en seguimiento'), uLlam = c((v) => norm(v.situacion) === 'adentro en llamada'), u2 = c((v) => norm(v.situacion) === 'cerrado en 2 llamadas');
    const unidades = uSeg + uLlam + u2;
    const cashD1 = vs.reduce((s, v) => s + n0(v.dia1), 0), cashSeg = vs.reduce((s, v) => s + n0(v.seguimiento), 0);
    const div = (a, b) => (b ? a / b : null);
    return { agendas, presentadas, calificadas: calif, uSeg, uLlam, u2, unidades, cashD1, cashSeg, cash: cashD1 + cashSeg,
      cierreGral: div(unidades, presentadas), cierreEf: div(unidades, calif), showUp: div(presentadas, agendas) };
  }

  /* ════════ Cuotas ════════ */
  const CERRADAS_CUOTA = ['cobrado', 'completo pif', 'no paga'];
  const falta = (r) => (CERRADAS_CUOTA.includes(norm(r.situacion)) ? 0 : Math.max(0, n0(r.porCobrar) - n0(r.cobrado)));
  function pintarCuotas() {
    const cs = registros('cuota');
    const hoy = uiHoyAR();
    const cobrado = cs.reduce((s, r) => s + n0(r.cobrado), 0), total = cs.reduce((s, r) => s + n0(r.porCobrar), 0);
    const pendiente = cs.reduce((s, r) => s + falta(r), 0);
    const vencidas = cs.filter((r) => falta(r) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') && r.fecha < hoy);
    // pasa seguido: la situación dice "Cobrado" pero el monto cobrado quedó vacío, y esa plata no suma
    const sinMonto = cs.filter((r) => norm(r.situacion) === 'cobrado' && n0(r.cobrado) < n0(r.porCobrar));
    const lista = ST.filas = buscar(cs).slice().sort((a, b) => (falta(b) > 0) - (falta(a) > 0) || String(a.fecha || '9').localeCompare(String(b.fecha || '9')));
    return `
      <div class="ui-kpis crm-kpis">
        ${uiKpi({ ico: 'plata', etiqueta: 'Cobrado', prefijo: MON(), valor: usd(cobrado), sub: `de ${usd(total)} a cobrar en el mes`, color: 'verde', variante: 'tinte' })}
        ${uiKpi({ ico: 'billetera', etiqueta: 'Falta cobrar', prefijo: MON(), valor: usd(pendiente), sub: `${cs.filter((r) => falta(r) > 0).length} cuotas abiertas`, color: 'ambar' })}
        ${uiKpi({ ico: 'calendario', etiqueta: 'Vencidas', valor: uiNum(vencidas.length), sub: vencidas.length ? `${MON()} ${usd(vencidas.reduce((s, r) => s + falta(r), 0))} que ya se tendrían que haber cobrado` : 'ninguna atrasada', color: vencidas.length ? 'rojo' : 'gris' })}
      </div>
      ${sinMonto.length ? uiAviso({ tipo: 'ambar', texto: `${sinMonto.length} ${sinMonto.length === 1 ? 'cuota dice' : 'cuotas dicen'} "Cobrado" pero no ${sinMonto.length === 1 ? 'tiene' : 'tienen'} el monto cobrado completo (${sinMonto.map((r) => r.nombre || 'sin nombre').join(', ')}): faltan ${MON()} ${usd(sinMonto.reduce((s, r) => s + n0(r.porCobrar) - n0(r.cobrado), 0))} en el cash del mes. Abrilas y poné cuánto entró.` }) : ''}
      <div id="crmPrevio"></div>
      <div class="crm-filtros">${buscador()}</div>
      ${uiTabla([
        { t: 'Nombre', f: (r) => `<b>${E(r.nombre) || '<span class="crm-vacio">sin nombre</span>'}</b>${r.telefono ? `<small>${E(r.telefono)}</small>` : ''}` },
        { t: 'Cuota', f: (r) => E(r.cuota || '—') },
        { t: 'Fecha de cobro', f: (r) => `<span class="${falta(r) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '') && r.fecha < hoy ? 'crm-vencida' : ''}">${E(fechaCorta(r.fecha) || '—')}</span>` },
        { t: 'Por cobrar', f: (r) => plata(r.porCobrar), al: 'der' },
        { t: 'Cobrado', f: (r) => plata(r.cobrado), al: 'der' },
        { t: 'Closer', f: (r) => E(r.closer || '—') },
        { t: 'Situación', f: (r) => sit(r.situacion) },
        { t: '', f: (r) => (falta(r) > 0 && puedeEditar(r) ? `<button type="button" class="crm-cobrar" onclick="event.stopPropagation();crmCobrar('${E(r.id)}')">${uiIco('check', 14)}Cobrada</button>` : ''), al: 'der' },
      ], lista, { onFila: 'crmAbrirFila', vacio: ST.q ? 'Nada coincide con la búsqueda' : `No hay cuotas en ${nombreMes(ST.mes).split(' ')[0].toLowerCase()}` })}`;
  }
  // las cuotas que quedaron abiertas el mes anterior, para traerlas a este (en la planilla se copiaban a mano)
  async function traerPrevio() {
    const caja = $('crmPrevio');
    if (!caja || !ST.data || ST.mes !== ST.data.hoy || !puedeCrear()) return;
    try {
      if (!ST.previo) ST.previo = await pedir('GET', 'mes=' + mesSig(ST.mes, -1));
    } catch (e) { return; }
    const ya = new Set(registros('cuota').map((r) => r.de).filter(Boolean));
    const abiertas = (ST.previo.registros || []).filter((r) => r.tipo === 'cuota' && falta(r) > 0 && !ya.has(r.id) && puedeEditar({ ...r, mes: ST.mes }));
    ST.abiertas = abiertas;
    if (!$('crmPrevio')) return;
    $('crmPrevio').innerHTML = abiertas.length ? uiAviso({ tipo: 'azul', texto: `${abiertas.length} ${abiertas.length === 1 ? 'cuota quedó abierta' : 'cuotas quedaron abiertas'} en ${nombreMes(mesSig(ST.mes, -1)).split(' ')[0].toLowerCase()} (${MON()} ${usd(abiertas.reduce((s, r) => s + falta(r), 0))}).`, accion: { texto: 'Traerlas a este mes', onclick: 'crmTraerCuotas()' } }) : '';
  }

  /* ════════ Leaderboard ════════ */
  const FILAS_LB = [
    ['agendas', 'Agendas totales', 'n'], ['presentadas', 'Agendas presentadas', 'n'], ['calificadas', 'Calificadas presentadas', 'n'],
    ['cierreGral', 'Tasa de cierre general', '%'], ['cierreEf', 'Tasa de cierre efectiva', '%'], ['showUp', 'Show-up rate', '%'],
    ['aovD1', 'AOV (día 1)', '$'], ['aovTrato', 'AOV (trato cerrado)', '$'],
    ['uSeg', 'Cerradas en seguimiento', 'n'], ['uLlam', 'Cerradas en llamada', 'n'], ['u2', 'Cerradas en 2 llamadas', 'n'], ['unidades', 'Unidades cerradas totales', 'n'],
    ['cashD1', 'Cash collected (día 1)', '$'], ['cashTrato', 'Cash collected trato cerrado', '$'], ['cashSeg', 'Cash collected (en seguimiento)', '$'], ['cash', 'Cash collected total', '$'],
  ];
  const fmt = (v, t) => (v == null ? '—' : t === '%' ? uiNum(v * 100, 0) + '%' : t === '$' ? usd(v) : uiNum(v));
  function pintarLeaderboard() {
    const lb = ST.data.leaderboard;
    const m = lb.metas || {};
    const cols = lb.closers;
    const metaDe = (k) => (m[k] != null ? m[k] : null);
    // sin mínimo cargado no hay verde ni rojo: no se compara contra nada
    const est = (v, meta) => (meta == null || v == null ? '' : v >= meta ? 'ok' : 'bajo');
    const celdaEq = (k, t) => `<td class="al-der crm-eq ${est(lb.equipo[k], metaDe(k))}">${fmt(lb.equipo[k], t)}</td>`;
    const obj = n0(m.objetivoMes), restante = Math.max(0, obj - lb.total);
    return `
      <div class="crm-lb-w"><table class="ui-tabla crm-lb">
        <thead><tr><th>KPI</th>${cols.map((c, i) => `<th class="al-der">${i === 0 && c.k.cash > 0 ? '<i class="ui-punto c-gold"></i>' : ''}${E(c.closer)}</th>`).join('')}<th class="al-der">Equipo</th><th class="al-der">Mínimo</th></tr></thead>
        <tbody>
          ${FILAS_LB.map(([k, et, t]) => `<tr class="${k === 'unidades' || k === 'cash' ? 'crm-lb-fuerte' : ''}"><td>${E(et)}</td>${cols.map((c) => `<td class="al-der">${fmt(c.k[k], t)}</td>`).join('')}${celdaEq(k, t)}<td class="al-der crm-meta">${metaDe(k) == null || k === 'aovD1' ? '' : fmt(metaDe(k), t)}</td></tr>`).join('')}
          <tr class="crm-lb-sep"><td>Cash collected de cuotas</td>${cols.map(() => '<td></td>').join('')}<td class="al-der crm-eq ${est(lb.cuotas, metaDe('cuotas'))}">${usd(lb.cuotas)}</td><td class="al-der crm-meta">${metaDe('cuotas') == null ? '' : usd(m.cuotas)}</td></tr>
          <tr class="crm-lb-total"><td>Cash collected TOTAL</td>${cols.map(() => '<td></td>').join('')}<td class="al-der crm-eq ${est(lb.total, metaDe('total'))}">${usd(lb.total)}</td><td class="al-der crm-meta">${metaDe('total') == null ? '' : usd(m.total)}</td></tr>
        </tbody>
      </table></div>
      <div class="crm-lb-pie">
        <span>${!obj ? 'Todavía no hay un objetivo del mes cargado.' : restante ? `Faltan <b>${MON()} ${usd(restante)}</b> para el objetivo del mes (${MON()} ${usd(obj)}).` : `<b>Objetivo del mes cumplido</b> (${MON()} ${usd(obj)}).`} Las tasas del equipo salen del total, no del promedio de los closers.</span>
        ${editaTodo() ? `<button type="button" class="fin-btn2" onclick="crmMetas()">${uiIco('objetivo', 15)}Editar mínimos</button>` : ''}
      </div>`;
  }

  /* ════════ formulario ════════ */
  // getters: las etiquetas leen la moneda al abrir el formulario (al cargar el archivo MHQ todavía no existe)
  const FORM = {
    get venta() { return [['nombre', 'Nombre del lead', 't'], ['telefono', 'Teléfono', 't'], ['fecha', 'Fecha de la call', 'fecha'], ['closer', 'Closer', 'closer'],
      ['presento', '¿Se presentó?', 'lista:siNo'], ['califica', '¿Calificaba?', 'lista:siNo'], ['situacion', 'Situación del lead', 'lista:situacionVenta', 2],
      ['dia1', '¿Cuánto pagó en la llamada? (' + MON() + ')', 'usd'], ['seguimiento', '¿Cuánto pagó en seguimiento? (' + MON() + ')', 'usd'],
      ['notas', '¿Cómo te sentiste en la call? ¿Qué podrías haber mejorado?', 'largo', 2], ['fuente', 'Origen', 'origen'], ['setter', 'Setter', 'setter']]; },
    get cuota() { return [['nombre', 'Nombre', 't'], ['telefono', 'Teléfono', 't'], ['cuota', 'Cuota', 'lista:cuota'], ['fecha', 'Fecha de cobro', 'fecha'],
      ['porCobrar', 'Monto por cobrar (' + MON() + ')', 'usd'], ['cobrado', 'Monto cobrado (' + MON() + ')', 'usd'], ['closer', 'Closer', 'closer'], ['situacion', 'Situación', 'lista:situacionCuota'],
      ['notas', 'Notas', 'largo', 2]]; },
  };
  const TITULO = { venta: 'llamada', cuota: 'cuota' };
  const ETIQ = { nombre: 'Nombre', telefono: 'Teléfono', mail: 'Mail', fecha: 'Fecha', closer: 'Closer', presento: 'Se presentó', califica: 'Calificaba', situacion: 'Situación',
    dia1: 'En la call', seguimiento: 'En seguimiento', notas: 'Notas', fuente: 'Origen', setter: 'Setter', porCobrar: 'Por cobrar', cobrado: 'Cobrado', cuota: 'Cuota',
    mes: 'Mes', agenda: 'Agenda', instagram: 'Instagram', de: 'Viene de' };

  function campo([k, etiqueta, tipo, ancho], val, dis) {
    const v = val == null ? '' : val;
    const d = dis ? ' disabled' : '';
    let input;
    if (tipo.startsWith('lista:')) {
      const ops = L()[tipo.slice(6)] || [];
      const todas = v && !ops.includes(v) ? [v, ...ops] : ops;   // lo que vino escrito distinto se respeta
      input = `<select data-k="${k}"${d}><option value=""></option>${todas.map((x) => `<option${x === v ? ' selected' : ''}>${E(x)}</option>`).join('')}</select>`;
    } else if (tipo === 'closer') {
      const ops = [...new Set([v, ...closersConocidos()].filter(Boolean))];
      input = `<select data-k="${k}"${d || (yo().rol === 'closer' ? ' disabled' : '')}><option value=""></option>${ops.map((x) => `<option${x === v ? ' selected' : ''}>${E(x)}</option>`).join('')}</select>`;
    } else if (tipo === 'usd') {
      input = `<input data-k="${k}" type="number" min="0" step="0.01" inputmode="decimal" value="${n0(v) ? E(v) : ''}" placeholder="0"${d}>`;
    } else if (tipo === 'fecha') {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(v);
      input = `<input data-k="${k}" type="date" value="${iso ? E(v) : ''}"${d}>${v && !iso ? `<small>Decía «${E(v)}»</small>` : ''}`;
    } else if (tipo === 'largo') {
      input = `<textarea data-k="${k}" rows="3"${d}>${E(v)}</textarea>`;
    } else if (tipo === 'origen' || tipo === 'setter') {
      input = `<input data-k="${k}" list="crmDl-${tipo}" value="${E(v)}"${d}>`;
    } else {
      input = `<input data-k="${k}" value="${E(v)}"${d}>`;
    }
    return `<label class="ui-campo"${ancho === 2 ? ' style="grid-column:1/-1"' : ''}><span>${E(etiqueta)}</span>${input}</label>`;
  }
  // los orígenes y setters que ya aparecen en el pipeline del cliente
  function datalists() {
    const de = (k) => [...new Set(filas().map((r) => String(r[k] || '').trim()).filter(Boolean))].slice(0, 40);
    return `<datalist id="crmDl-origen">${de('Origen').map((o) => `<option value="${E(o)}">`).join('')}</datalist><datalist id="crmDl-setter">${de('Setter').map((o) => `<option value="${E(o)}">`).join('')}</datalist>`;
  }
  function historialHtml(r) {
    const h = (r && r.historial) || [];
    if (!h.length) return '';
    const val = (k, x) => (['dia1', 'seguimiento', 'porCobrar', 'cobrado'].includes(k) ? (n0(x) ? MON() + ' ' + usd(x) : '0') : (x === '' || x == null ? '—' : String(x).slice(0, 60)));
    const linea = (e) => typeof e.c === 'string' ? E(e.c) : Object.entries(e.c || {}).map(([k, [a, b]]) => `${E(ETIQ[k] || k)}: ${E(val(k, a))} → <b>${E(val(k, b))}</b>`).join(' · ');
    return `<details class="crm-hist"><summary>${uiIco('reloj', 14)}Historial (${h.length})</summary><ol>${h.slice().reverse().map((e) => `<li><em>${E(new Date(e.t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires' }))} · ${E(e.q)}</em><span>${linea(e)}</span></li>`).join('')}</ol></details>`;
  }

  function abrirForm(tipo, reg, extra) {
    const r = reg || { tipo, mes: ST.mes, ...extra };
    const edit = !reg || puedeEditar(reg);
    ST.form = { tipo, reg, extra: extra || {} };
    const pasado = reg && tipo === 'venta' && reg.mes < ST.data.hoy && !/^adentro|cerrado en 2/.test(norm(reg.situacion)) && puedeCrear() && puedeEditar({ ...reg, mes: ST.data.hoy });
    const cierre = tipo !== 'venta' ? '' : reg && reg.plan
      ? `<button type="button" class="crm-pasar" onclick="crmVerPlan()">${uiIco('check', 14)}Ver el plan de pagos (${E(reg.plan.programa)} · ${MON()} ${usd(reg.plan.total)})</button>`
      : edit ? `<button type="button" class="crm-pasar" onclick="crmCierre()">${uiIco('plata', 14)}Pagó: cargar el cierre (programa, pagos y cuotas)</button>` : '';
    const origenAgenda = extra && extra.agenda ? `<p class="crm-de-agenda">${uiIco('calendario', 14)}De la agenda del ${E(fechaCorta(extra.fecha))}${extra.fuente ? ' · ' + E(extra.fuente) : ''}: al guardar, la llamada se actualiza sola en el pipeline.</p>` : '';
    uiModalAbrir({
      titulo: reg ? (reg.nombre || 'Sin nombre') : `Cargar ${TITULO[tipo]}`,
      sub: reg ? `${TITULO[tipo].charAt(0).toUpperCase() + TITULO[tipo].slice(1)} · ${nombreMes(reg.mes)}${reg.creadoPor ? ` · cargó ${reg.creadoPor}` : ''}` : nombreMes(ST.mes),
      ancho: '680px',
      cuerpo: `${origenAgenda}${!edit ? uiAviso({ tipo: 'azul', texto: 'Solo lectura: es de otro closer o de un mes ya liquidado.' }) : ''}
        <div class="ui-campos crm-form" style="--n:2">${FORM[tipo].map((c) => campo(c, r[c[0]], !edit)).join('')}</div>${datalists()}
        ${cierre}
        ${pasado ? `<button type="button" class="crm-pasar" onclick="crmPasarAlMes()">${uiIco('der', 14)}Pagó en ${E(nombreMes(ST.data.hoy).split(' ')[0].toLowerCase())}: registrar el pago en el mes en curso</button>` : ''}
        ${historialHtml(reg)}
        ${reg && editaTodo() ? `<button type="button" class="crm-borrar" onclick="crmBorrar()">${uiIco('tacho', 14)}Borrar este registro</button>` : ''}`,
      acciones: edit ? [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: 'crmGuardar()', pri: true }] : [{ texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }],
    });
  }
  // solo viaja lo que cambió: un campo que nadie tocó queda como estaba
  function cambiosForm() {
    const f = ST.form, base = f.reg || f.extra || {};
    const out = {};
    document.querySelectorAll('#uiModal [data-k]').forEach((el) => {
      const k = el.dataset.k;
      let v = el.value;
      if (el.disabled) return;
      if (el.type === 'number') { if (n0(v) === n0(base[k])) return; v = n0(v); }
      else {
        if (el.type === 'date' && !v && base[k] && !/^\d{4}-\d{2}-\d{2}$/.test(base[k])) return;
        if (String(v).trim() === String(base[k] == null ? '' : base[k]).trim()) return;
      }
      out[k] = v;
    });
    if (!f.reg) Object.entries(f.extra || {}).forEach(([k, v]) => { if (!(k in out) && v !== '' && v != null) out[k] = v; });
    return out;
  }
  async function guardar(tipo, reg, campos, opciones = {}) {
    const cuerpo = { accion: 'guardar', registro: { ...campos, tipo, mes: (reg && reg.mes) || opciones.mes || ST.mes, id: reg ? reg.id : undefined }, base: reg ? (reg.v || 0) : undefined };
    try {
      const j = await pedir('POST', '', cuerpo);
      const lista = ST.data.registros;
      const i = lista.findIndex((x) => x.id === j.registro.id);
      if (j.registro.mes === ST.mes) { if (i >= 0) lista[i] = j.registro; else lista.push(j.registro); }
      else if (i >= 0) lista.splice(i, 1);
      if (tipo === 'venta' && (campos.presento || 'dia1' in campos || 'seguimiento' in campos || campos.agenda)) conciliar(j.registro.mes < ST.data.hoy);
      return j.registro;
    } catch (e) {
      if (e.status === 409 && e.j && e.j.registro) {
        const lista = ST.data.registros, i = lista.findIndex((x) => x.id === e.j.registro.id);
        if (i >= 0) lista[i] = e.j.registro;
      }
      throw e;
    }
  }
  // el pipeline se pone al día solo (crmsync). Varias cargas seguidas disparan UNA sola conciliación.
  // `previo`: se guardó algo del mes anterior, que la conciliación solo mira sola hasta el día 10
  let tConc = null, concPrevio = false;
  function conciliar(previo) {
    concPrevio = concPrevio || !!previo;
    clearTimeout(tConc);
    tConc = setTimeout(() => {
      const p = concPrevio; concPrevio = false;
      api('POST', { action: 'crmsync', previo: p }).then((j) => { if (j && j.actualizados) cargarDatos().catch(() => { }); }).catch(() => { });
    }, 5000);
  }
  async function despuesDeGuardar(texto) {
    uiModalCerrar(); uiToast(texto, 'ok');
    try { await cargar(ST.mes, true); } catch (e) { }
    pintar();
  }

  /* ════════ acciones (las llama el HTML por nombre) ════════ */
  window.crmTab = (t) => { ST.tab = t; ST.q = ''; pintar(); };
  window.crmMes = (n) => window.crmIrMes(mesSig(ST.mes, n));
  window.crmIrMes = async (m) => { ST.mes = m; ST.verTodas = false; $('crmCuerpo').innerHTML = sk(320); await render(true); };
  window.crmRefrescar = () => render(true);
  window.crmCloser = (i) => { ST.closer = (ST.chips || [])[Number(i)] || ''; ST.verTodas = false; pintar(); };
  window.crmVerTodas = () => { ST.verTodas = true; pintar(); };
  let tBuscar = null;
  window.crmBuscar = (q) => { ST.q = q; clearTimeout(tBuscar); tBuscar = setTimeout(() => { pintar(); const i = $('crmQ'); if (i) { i.focus(); i.setSelectionRange(q.length, q.length); } }, 180); };
  window.crmNuevo = () => {
    const tipo = tipoDeTab();
    const extra = {};
    if (yo().rol === 'closer') extra.closer = yo().closer;
    else if (ST.closer && tipo !== 'cuota') extra.closer = ST.closer;
    if (tipo === 'venta') extra.fecha = uiHoyAR().slice(0, 7) === ST.mes ? uiHoyAR() : '';
    abrirForm(tipo, null, extra);
  };
  // la fila tocada es la de la tabla tal como se pintó (ST.filas), no un orden recalculado
  window.crmAbrirFila = (i) => { const r = (ST.filas || [])[i]; if (r) abrirForm(r.tipo, r); };
  window.crmCargarAgenda = (i) => {
    const r = (ST.pend || [])[i];
    if (!r) return;
    abrirForm('venta', null, {
      nombre: r.Nombre || '', telefono: r.WhatsApp || '', mail: r.Email || '', instagram: r.Instagram || '', fecha: String(r['Fecha call'] || '').slice(0, 10),
      closer: closerDe(r.Closer), fuente: r.Origen || r.Evento || '', setter: r.Setter || '', agenda: r._id || '',
    });
  };
  window.crmGuardar = async () => {
    const f = ST.form; if (!f) return;
    const campos = cambiosForm();
    if (!f.reg && !String(campos.nombre || '').trim()) { uiToast('Poné el nombre', 'mal'); return; }
    if (!f.reg && f.tipo !== 'cuota' && yo().rol !== 'closer' && !campos.closer) { uiToast('Elegí el closer', 'mal'); return; }
    if (f.reg && !Object.keys(campos).length) { uiModalCerrar(); return; }
    try { await guardar(f.tipo, f.reg, campos); await despuesDeGuardar('Guardado ✓'); }
    catch (e) {
      if (e.status === 409) { uiToast(e.message, 'mal'); const nuevo = porId(f.reg.id); if (nuevo) abrirForm(f.tipo, nuevo); }
      else uiToast('No pude guardar: ' + e.message, 'mal');
    }
  };
  window.crmBorrar = async () => {
    const r = ST.form && ST.form.reg; if (!r) return;
    if (!confirm(`¿Borrar «${r.nombre || 'sin nombre'}» del CRM de ${nombreMes(r.mes)}? Queda una copia guardada por las dudas.`)) return;
    try {
      await pedir('POST', '', { accion: 'borrar', id: r.id, tipo: r.tipo, mes: r.mes });
      ST.data.registros = ST.data.registros.filter((x) => x.id !== r.id);
      await despuesDeGuardar('Borrado ✓');
    } catch (e) { uiToast('No pude borrar: ' + e.message, 'mal'); }
  };
  window.crmCobrar = async (id) => {
    const r = porId(id); if (!r) return;
    const campos = { cobrado: Math.max(n0(r.cobrado), n0(r.porCobrar)), situacion: 'Cobrado' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '')) campos.fecha = uiHoyAR();
    try { await guardar('cuota', r, campos); await despuesDeGuardar(`${r.nombre || 'Cuota'}: cobrada ✓`); }
    catch (e) { uiToast('No pude marcarla: ' + e.message, 'mal'); }
  };

  /* ════════ Cargar cierre ════════
     El plan de pagos se arma acá; la venta y las cuotas las arma el servidor (armarCierre en lib/crm-core.mjs). */
  const MEDIOS = ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'USDT', 'Efectivo'];
  const progs = () => (ST.data && ST.data.programas) || [];
  const unMesDespues = (f) => { const d = new Date((/^\d{4}-\d{2}-\d{2}$/.test(f) ? f : uiHoyAR()) + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
  // si la venta es nueva o se tocó algo en la ficha, se guarda primero: el cierre cuelga de una venta guardada
  window.crmCierre = async () => {
    const f = ST.form; if (!f || f.tipo !== 'venta') return;
    const campos = cambiosForm();
    let reg = f.reg;
    try {
      if (!reg) {
        if (!String(campos.nombre || '').trim()) { uiToast('Poné el nombre', 'mal'); return; }
        if (yo().rol !== 'closer' && !campos.closer) { uiToast('Elegí el closer', 'mal'); return; }
        reg = await guardar('venta', null, campos);
      } else if (Object.keys(campos).length) reg = await guardar('venta', reg, campos);
    } catch (e) { uiToast('No pude guardar la venta: ' + e.message, 'mal'); return; }
    abrirCierre(reg);
  };
  function abrirCierre(reg) {
    const hoy = uiHoyAR();
    ST.cierre = { reg, montoTocado: false, totalTocado: false, filas: [{ concepto: 'Adentro en Llamada', monto: '', fecha: reg.fecha && reg.fecha <= hoy ? reg.fecha : hoy, pagado: true, medio: '' }] };
    const sinProgs = !progs().length;
    uiModalAbrir({
      titulo: 'Cargar cierre', ancho: '820px',
      sub: [reg.nombre, reg.fecha ? 'llamada del ' + fechaCorta(reg.fecha) : '', reg.closer, reg.setter ? 'setter ' + reg.setter : ''].filter(Boolean).join(' · '),
      cuerpo: `${sinProgs ? uiAviso({ tipo: 'ambar', texto: editaTodo() ? 'Todavía no hay programas cargados: el cierre necesita saber qué se vendió.' : 'Todavía no hay programas cargados: pedile al equipo que los cargue en Ventas › Programas.', accion: editaTodo() ? { texto: 'Cargar programas', onclick: 'crmProgramas()' } : null }) : ''}
        <div class="ui-campos" style="--n:2">
          <label class="ui-campo"><span>Programa *</span><select id="crmCiProg" onchange="crmCiProg()"><option value=""></option>${progs().map((p) => `<option>${E(p.nombre)}</option>`).join('')}</select></label>
          <label class="ui-campo"><span>Precio total (${MON()}) *</span><input id="crmCiTotal" type="number" min="1" step="0.01" inputmode="decimal" oninput="crmCiTotal(true)"></label>
        </div>
        <div class="crm-ci-h"><b>Plan de pagos</b><span id="crmCiFalta" class="crm-ci-falta"></span></div>
        <div id="crmCiFilas" class="crm-ci-filas"></div>
        <button type="button" class="crm-mas" onclick="crmCiFila()">+ Agregar un pago</button>
        <p class="fin-nota">Se carga una sola vez. La venta queda con su situación y la plata de la call o del seguimiento, y cada pago a cobrar queda como cuota en el mes en que vence.</p>
        <datalist id="crmDlMedio">${MEDIOS.map((m) => `<option value="${E(m)}">`).join('')}</datalist>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar cierre', onclick: 'crmCiGuardar()', pri: true }],
    });
    pintarFilasCierre();
  }
  function pintarFilasCierre() {
    const c = ST.cierre, caja = $('crmCiFilas'); if (!c || !caja) return;
    caja.innerHTML = c.filas.map((f, i) => `<div class="crm-ci-fila${f.pagado ? ' pag' : ''}" data-i="${i}">
        <em>${i + 1}</em>
        <select data-c="concepto" aria-label="Concepto">${((i ? L().conceptoDespues : L().conceptoEntrada) || []).map((o) => `<option${o === f.concepto ? ' selected' : ''}>${E(o)}</option>`).join('')}</select>
        <input data-c="monto" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${MON()}" aria-label="Monto en ${MON()}" value="${E(f.monto)}">
        <input data-c="fecha" type="date" aria-label="Fecha" value="${E(f.fecha)}">
        <label class="crm-ci-pag"><input data-c="pagado" type="checkbox"${f.pagado ? ' checked' : ''}${i ? '' : ' disabled'}>Pagado</label>
        <input data-c="medio" class="crm-ci-sp" list="crmDlMedio" placeholder="Medio de pago" aria-label="Medio de pago" value="${E(f.medio)}">
        ${i ? `<button type="button" class="ui-icobtn" title="Quitar este pago" onclick="crmCiQuitar(${i})">${uiIco('tacho', 14)}</button>` : '<span></span>'}
      </div>`).join('');
    caja.oninput = caja.onchange = (ev) => {
      const el = ev.target, fila = el.closest('[data-i]'); if (!fila || !el.dataset.c) return;
      const i = Number(fila.dataset.i), k = el.dataset.c;
      c.filas[i][k] = k === 'pagado' ? el.checked : el.value;
      if (k === 'pagado') fila.classList.toggle('pag', el.checked);
      if (k === 'monto' && i === 0) c.montoTocado = true;
      crmCiCambio();
    };
    crmCiCambio();
  }
  // el precio del programa completa el total, mientras nadie lo haya escrito a mano
  window.crmCiProg = () => {
    const c = ST.cierre, p = progs().find((x) => x.nombre === ($('crmCiProg') || {}).value);
    if (!c || !p || !p.precio || c.totalTocado) return;
    $('crmCiTotal').value = p.precio;
    window.crmCiTotal();
  };
  // con un solo pago, el monto sigue al precio total hasta que alguien lo toque
  window.crmCiTotal = (aMano) => {
    const c = ST.cierre; if (!c) return;
    if (aMano) c.totalTocado = true;
    if (c.filas.length === 1 && !c.montoTocado) {
      const v = ($('crmCiTotal') || {}).value || '';
      c.filas[0].monto = v;
      const m = document.querySelector('#crmCiFilas [data-c="monto"]'); if (m) m.value = v;
    }
    crmCiCambio();
  };
  window.crmCiCambio = () => {
    const c = ST.cierre, out = $('crmCiFalta'); if (!c || !out) return;
    const total = n0(($('crmCiTotal') || {}).value);
    const d = Math.round((total - c.filas.reduce((s, f) => s + n0(f.monto), 0)) * 100) / 100;
    out.className = 'crm-ci-falta' + (!total ? '' : d === 0 ? ' ok' : ' mal');
    out.textContent = !total ? 'Poné el precio total' : d === 0 ? '✓ Los pagos suman el precio' : d > 0 ? `Falta asignar ${MON()} ${usd(d)}` : `Sobran ${MON()} ${usd(-d)}`;
  };
  window.crmCiFila = () => {
    const c = ST.cierre; if (!c || c.filas.length >= 8) return;
    const ult = c.filas[c.filas.length - 1];
    const resto = Math.round((n0(($('crmCiTotal') || {}).value) - c.filas.reduce((s, f) => s + n0(f.monto), 0)) * 100) / 100;
    const n = c.filas.filter((f) => f.concepto !== 'Fee').length + 1;
    c.filas.push({ concepto: ult.concepto === 'Fee' ? 'Adentro en Seguimiento' : n <= 3 ? `Cuota ${n}` : 'Completó PIF', monto: resto > 0 ? resto : '', fecha: unMesDespues(ult.fecha), pagado: false, medio: '' });
    pintarFilasCierre();
  };
  window.crmCiQuitar = (i) => { const c = ST.cierre; if (!c || !i) return; c.filas.splice(i, 1); pintarFilasCierre(); };
  window.crmCiGuardar = async () => {
    const c = ST.cierre; if (!c || c.enviando) return;
    const plan = { programa: ($('crmCiProg') || {}).value || '', total: n0(($('crmCiTotal') || {}).value),
      filas: c.filas.map((f) => ({ concepto: f.concepto, monto: n0(f.monto), fecha: f.fecha, pagado: !!f.pagado, medio: f.pagado ? f.medio : '' })) };
    if (!plan.programa) { uiToast('Elegí el programa', 'mal'); return; }
    const btn = document.querySelector('#uiModal footer .btn.primary');
    c.enviando = true; if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      const j = await pedir('POST', '', { accion: 'cierre', id: c.reg.id, mes: c.reg.mes, plan });
      ST.cierre = null;
      conciliar(j.registro.mes < ST.data.hoy);
      try { await cargar(ST.mes, true); } catch (e) { }
      pintar();
      mostrarPlan(j.registro);
    } catch (e) {
      uiToast('No pude cargar el cierre: ' + e.message, 'mal');
    } finally { c.enviando = false; if (btn) { btn.disabled = false; btn.textContent = 'Guardar cierre'; } }
  };
  function mostrarPlan(reg) {
    const p = reg.plan; if (!p) return;
    ST.planMsg = p.mensaje || '';
    uiModalAbrir({
      titulo: 'Plan de pagos', ancho: '680px',
      sub: `${reg.nombre || 'Sin nombre'} · ${p.programa} · ${MON()} ${usd(p.total)} · cargó ${p.por}`,
      cuerpo: `${uiTabla([
          { t: 'Pago', f: (f) => `<b>${E(f.concepto)}</b>` },
          { t: 'Fecha', f: (f) => E(fechaCorta(f.fecha)) },
          { t: 'Medio', f: (f) => E(f.medio || '—') },
          { t: 'Monto', f: (f) => `${MON()} ${usd(f.monto)}`, al: 'der' },
          { t: 'Estado', f: (f) => (f.pagado ? uiEstado('Pagado', 'verde') : uiEstado('A cobrar', 'ambar')) },
        ], p.filas)}
        <label class="ui-campo crm-ci-msj"><span>Mensaje para el grupo</span><textarea rows="11" readonly>${E(p.mensaje || '')}</textarea></label>`,
      acciones: [{ texto: 'Cerrar', onclick: 'uiModalCerrar()' }, { texto: 'Copiar mensaje', onclick: 'crmCopiarPlan()', pri: true }],
    });
  }
  window.crmVerPlan = () => { const r = ST.form && ST.form.reg; if (r) mostrarPlan(r); };
  window.crmCopiarPlan = async () => {
    try { await navigator.clipboard.writeText(ST.planMsg || ''); }
    catch (e) { const t = document.querySelector('.crm-ci-msj textarea'); if (!t) return; t.select(); document.execCommand('copy'); }
    uiToast('Mensaje copiado ✓', 'ok');
  };

  /* ════════ Programas: el catálogo del cliente (colección `programas` de /api/db, solo equipo y cliente) ════════ */
  window.crmProgramas = () => {
    ST.progs = progs().map((p) => ({ ...p }));
    ST.progsBorrados = [];
    pintarProgramas();
  };
  function pintarProgramas() {
    uiModalAbrir({
      titulo: 'Programas', sub: 'Lo que vende el cliente y a cuánto. "Cargar cierre" los ofrece y completa el precio.', ancho: '560px',
      cuerpo: `<div class="crm-progs" id="crmProgs">${ST.progs.map((p, i) => `<div class="crm-prog" data-i="${i}">
          <input data-c="nombre" placeholder="Nombre del programa" aria-label="Nombre del programa" value="${E(p.nombre)}">
          <input data-c="precio" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Precio (${MON()})" aria-label="Precio en ${MON()}" value="${n0(p.precio) ? E(p.precio) : ''}">
          <button type="button" class="ui-icobtn" title="Quitar" onclick="crmProgQuitar(${i})">${uiIco('tacho', 14)}</button></div>`).join('') || uiVacioMini('Todavía no hay programas cargados')}</div>
        <button type="button" class="crm-mas" onclick="crmProgAgregar()">+ Agregar un programa</button>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: 'crmProgGuardar()', pri: true }],
    });
    $('crmProgs').oninput = (ev) => { const el = ev.target, f = el.closest('[data-i]'); if (f && el.dataset.c) ST.progs[Number(f.dataset.i)][el.dataset.c] = el.value; };
  }
  window.crmProgAgregar = () => { ST.progs.push({ nombre: '', precio: '' }); pintarProgramas(); };
  window.crmProgQuitar = (i) => { const [p] = ST.progs.splice(i, 1); if (p && p.id) ST.progsBorrados.push(p.id); pintarProgramas(); };
  window.crmProgGuardar = async () => {
    const lista = ST.progs.map((p) => ({ ...p, nombre: String(p.nombre || '').trim() }));
    lista.filter((p) => p.id && !p.nombre).forEach((p) => ST.progsBorrados.push(p.id));   // vaciar el nombre = quitarlo
    const quedan = lista.filter((p) => p.nombre);
    const nombres = quedan.map((p) => norm(p.nombre));
    if (nombres.some((n, i) => nombres.indexOf(n) !== i)) { uiToast('Hay dos programas con el mismo nombre', 'mal'); return; }
    try {
      for (const id of ST.progsBorrados) await dbBorrar('programas', id);
      if (quedan.length) await dbGuardarVarios('programas', quedan.map((p, i) => ({ ...(p.id ? { id: p.id } : {}), nombre: p.nombre, precio: n0(p.precio), orden: i })));
      await despuesDeGuardar('Programas guardados ✓');
    } catch (e) { uiToast('No pude guardar: ' + e.message, 'mal'); }
  };

  window.crmTraerCuotas = async () => {
    if (ST.trayendo) return;
    ST.trayendo = true;
    let abiertas = [];
    try {
      // se vuelve a leer el mes: si alguien ya las trajo (doble toque, otra persona), no se duplican
      const actual = await pedir('GET', 'mes=' + ST.mes);
      const ya = new Set((actual.registros || []).map((r) => r.de).filter(Boolean));
      abiertas = (ST.abiertas || []).filter((r) => !ya.has(r.id));
    } catch (e) { ST.trayendo = false; uiToast('No pude revisar el mes: ' + e.message, 'mal'); return; }
    let n = 0;
    for (const r of abiertas) {
      try {
        await guardar('cuota', null, { nombre: r.nombre, telefono: r.telefono || '', cuota: r.cuota || '', fecha: r.fecha || '', porCobrar: falta(r), cobrado: 0,
          closer: r.closer || '', situacion: 'Por Cobrar', notas: r.notas || '', de: r.id }, { mes: ST.mes });
        n++;
      } catch (e) { uiToast(`Traje ${n} de ${abiertas.length}: ${e.message}`, 'mal'); break; }
    }
    ST.trayendo = false;
    if (n) await despuesDeGuardar(`${n} ${n === 1 ? 'cuota traída' : 'cuotas traídas'} ✓`);
    else { await render(true); uiToast('Ya estaban traídas', 'ok'); }
  };
  window.crmPasarAlMes = async () => {
    const r = ST.form && ST.form.reg; if (!r) return;
    const hoy = ST.data.hoy;
    try {
      // si ya se pasó (dos toques, o lo pasó otro), se abre ese: un segundo "Adentro en Seguimiento" inflaría las unidades
      const actual = await pedir('GET', 'mes=' + hoy);
      const ya = (actual.registros || []).find((x) => x.de === r.id);
      const id = ya ? ya.id : (await guardar('venta', null, { nombre: r.nombre, telefono: r.telefono || '', fecha: r.fecha || '', closer: r.closer, presento: r.presento || '',
        califica: r.califica || '', situacion: 'Adentro en Seguimiento', fuente: r.fuente || '', setter: r.setter || '', agenda: r.agenda || '', de: r.id }, { mes: hoy })).id;
      uiModalCerrar();
      ST.mes = hoy; await render(true);
      const n = porId(id); if (n) abrirForm('venta', n);
      uiToast(ya ? 'Ya estaba en este mes: es este' : 'Listo: poné cuánto pagó en seguimiento', 'ok');
    } catch (e) { uiToast('No pude pasarlo: ' + e.message, 'mal'); }
  };
  window.crmMetas = () => {
    const m = ST.data.metas || {};
    const C = [['agendas', 'Agendas totales'], ['presentadas', 'Agendas presentadas'], ['calificadas', 'Calificadas presentadas'], ['cierreGral', 'Tasa de cierre general (0 a 1)'],
      ['cierreEf', 'Tasa de cierre efectiva (0 a 1)'], ['showUp', 'Show-up (0 a 1)'], ['aovTrato', 'AOV trato cerrado (' + MON() + ')'], ['unidades', 'Unidades cerradas'],
      ['cash', 'Cash collected closers (' + MON() + ')'], ['cuotas', 'Cash de cuotas (' + MON() + ')'], ['total', 'Cash collected TOTAL (' + MON() + ')'], ['objetivoMes', 'Objetivo del mes (' + MON() + ')']];
    uiModalAbrir({ titulo: 'Mínimos del equipo', sub: 'La columna "Mínimo" del Leaderboard. Vacío = sin mínimo.', ancho: '600px',
      cuerpo: `<div class="ui-campos" style="--n:2">${C.map(([k, t]) => `<label class="ui-campo"><span>${E(t)}</span><input data-meta="${k}" type="number" step="any" min="0" value="${E(m[k] ?? '')}"></label>`).join('')}</div>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: 'crmMetasGuardar()', pri: true }] });
  };
  window.crmMetasGuardar = async () => {
    const metas = {};
    document.querySelectorAll('#uiModal [data-meta]').forEach((i) => { if (i.value !== '') metas[i.dataset.meta] = Number(i.value); });
    try { await pedir('POST', '', { accion: 'metas', metas }); await despuesDeGuardar('Mínimos guardados ✓'); }
    catch (e) { uiToast('No pude guardar: ' + e.message, 'mal'); }
  };
  // CSV con las columnas de la planilla, para tener siempre una copia afuera de la app
  window.crmCsv = () => {
    const tipo = tipoDeTab();
    const COLS = {
      venta: [['nombre', 'Nombre del lead'], ['telefono', 'Número de contacto'], ['fecha', 'Fecha de la call'], ['closer', 'Closer'], ['presento', 'Se presentó?'], ['califica', 'Calificaba?'],
        ['situacion', 'Situación del lead'], ['dia1', 'Cuánto pagó el día de la llamada'], ['seguimiento', 'Cuánto pagó en seguimiento'], ['notas', 'Cómo te sentiste en la call'], ['fuente', 'Fuente'], ['setter', 'Setter']],
      cuota: [['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['fecha', 'Fecha de cobro'], ['porCobrar', 'Monto por cobrar'], ['cobrado', 'Monto cobrado'], ['closer', 'Closer'], ['situacion', 'Situación'], ['cuota', 'Cuota']],
    }[tipo];
    // una celda que empieza con = + - @ se toma como fórmula al abrir el CSV: se le antepone una comilla
    const c = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = [COLS.map((x) => c(x[1])).join(','), ...registros(tipo).map((r) => COLS.map(([k]) => c(r[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `CRM ${tipo === 'cuota' ? 'cuotas' : 'ventas'} ${nombreMes(ST.mes)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // shell.js llama a la pantalla dos veces por cambio de vista (route envuelto + hashchange): se junta en una
  let enCurso = null;
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.crm = function () {
    if (typeof YO !== 'undefined' && !YO) return;   // todavía no hay sesión: boot() la vuelve a llamar
    if (!enCurso) enCurso = render(!!ST.data).finally(() => { enCurso = null; });
    return enCurso;
  };
})();
