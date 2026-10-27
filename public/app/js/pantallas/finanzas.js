/* Finanzas (#finanzas) — la Finanzas del hub original, portada a masterclass.
 *
 * En el hub original mezcla el ledger de la planilla, la "Carga de Pagos oficial", la foto de cada mes y el CRM. Acá todo sale del CRM
 * de Ventas (lib/crm-core.mjs → panel `finanzasget`), que tiene todos los meses, y del gasto de Meta Ads que da el módulo
 * Ads (/api/meta-ads?resumen=1). Quedan tres pestañas:
 *   Resumen ........ facturación, cash collected, gasto en ads y ROAS del período; cuentas por cobrar, ventas por closer,
 *                    de dónde viene el cash y los cobros día por día
 *   Ventas ......... Transacciones (cada cobro del CRM) y Pagos Pendientes (las cuotas del CRM como cobranza: cobrar y
 *                    "no paga" se escriben en el CRM, no en una lista aparte)
 *   Liquidaciones .. la comisión de cada closer (un % por closer, configurable) y si ya se le pagó
 * Lo que se sacó del hub original: la Caja, egresos, ingresos extra, cuentas, movimientos, divisas, socios, sueldos, setters, medios
 * de pago, links de Stripe, la carga de pagos a la planilla y la foto del mes (acá el CRM guarda todos los meses).
 * Todo lo global lleva el prefijo `fin` (los onclick del HTML llaman funciones por nombre).
 */
(function () {
  'use strict';
  if (typeof uiPeriodo !== 'function' || typeof uiEsc !== 'function') { console.warn('[finanzas] faltan ui.js / ui-atlas.js'); return; }

  /* ════════════════════════════════ utilidades ════════════════════════════════ */
  const $ = (id) => document.getElementById(id);
  const MON = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';   // la moneda del negocio
  const E = (t) => uiEsc(t);
  const A = (v) => uiEsc(JSON.stringify(v));            // un valor dentro de onclick="fn(…)" escrito acá
  // Para los onclick que se pasan a uiModalAbrir (acciones) y uiAviso (accion): esas piezas ya escapan el atributo,
  // así que el valor va crudo (con A() quedaría escapado dos veces y el clic falla).
  const J = (v) => JSON.stringify(v);
  const PER = 'finanzas', PER_LIQ = 'fin-liq';
  const ss = {
    get(k, d) { try { const v = sessionStorage.getItem('mhqfin:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem('mhqfin:' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const hoyS = () => uiHoyAR();
  const mesHoy = () => hoyS().slice(0, 7);
  const n0 = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const nom = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  // la misma de lib/crm-core.mjs: las claves de lo pagado a cada closer salen de acá
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const r2 = (n) => Math.round(n0(n) * 100) / 100;
  const pctTxt = (p) => (p == null || !isFinite(p)) ? '—' : `${Math.round(p)}%`;
  const pctEq = (v) => { const n = n0(v); return `${uiNum(n, Number.isInteger(n) ? 0 : Number.isInteger(n * 10) ? 1 : 2)}%`; };
  const hora = (d) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires' });
  const fU = (n) => `${MON()} ${uiNum(n)}`;

  /* ── fechas ── */
  const mesDe = (f) => String(f || '').slice(0, 7);
  const finDeMes = (mes) => { const [y, m] = mes.split('-').map(Number); return uiS(new Date(y, m, 0)); };
  const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); return `${uiCap(UI_MESES[m - 1])} ${y}`; };
  const mesLargo = (mes) => UI_MESES[Number(mes.slice(5, 7)) - 1];
  const mesCorto = (mes) => UI_MESES_C[Number(mes.slice(5, 7)) - 1];
  // el mes en curso se "cubre" con un período que llegue hasta hoy: todavía no hay cobros del futuro
  const cubre = (mes, r) => { const fin = finDeMes(mes), hoy = hoyS(); return `${mes}-01` >= r.desde && (fin > hoy ? hoy : fin) <= r.hasta; };
  // un cobro sin día (solo se sabe el mes) entra en un período solo si el período tiene el mes entero
  const enPer = (it, r) => it.fecha ? uiEnRango(it.fecha, r) : (it.mes ? cubre(it.mes, r) : false);
  const diasEntre = (a, b) => Math.round((uiF(b) - uiF(a)) / 864e5);
  const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) ? String(f) : null;

  /* ════════════════════════════════ estado ════════════════════════════════ */
  const FIN = {
    tab: ss.get('tab', 'resumen'),
    sub: Object.assign({ ventas: 'transacciones', pend: 'pendientes' }, ss.get('sub', {})),
    txBuscar: '', txF: { tipo: '', closer: '', programa: '' },
    ppF: { closer: '', mes: '', buscar: '' },
    liqF: ss.get('liqF', 'pendientes'),
    gen: 0, datos: null, errFin: '', actualizado: null,
  };

  /* ════════════════════════════════ íconos y piezas ════════════════════════════════ */
  const ICO = {
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    monedas: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    prohibido: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  };
  const ico = (n, t = 16) => ICO[n] ? `<svg class="ui-ico" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>` : uiIco(n, t);
  // segmentado de chips (dorado al activo)
  const seg = (ops, activa, fn, clase = '') => `<div class="fin-seg ${clase}">${ops.map(o => `<button type="button" class="${o.id === activa ? 'on' : ''}" onclick="${fn}(${A(o.id)})">${o.ico || ''}${E(o.t)}${o.badge != null && o.badge !== '' ? `<em>${E(o.badge)}</em>` : ''}</button>`).join('')}</div>`;
  // pestañas grises (las de la referencia de diseño: activa con relleno gris, no dorado)
  const pest = (ops, activa, fn, clase = '') => `<div class="fin-tabs ${clase}" role="tablist">${ops.map(([id, t]) => `<button type="button" role="tab" class="${id === activa ? 'on' : ''}" onclick="${fn}(${A(id)})">${E(t)}</button>`).join('')}</div>`;
  // badge de variación: el color sigue a bueno/malo, no a sube/baja (un gasto que baja = verde)
  function delta(p, malo, titulo) {
    if (p == null || !isFinite(p)) return `<span class="fin-dlt nada" data-tip="${E(titulo || 'Sin base para comparar')}">—</span>`;
    const sube = p >= 0, bien = malo ? !sube : sube;
    const txt = `${sube ? '+' : ''}${uiNum(p, 1)}%`;
    const tip = !titulo ? txt : /^vs /.test(titulo) ? `${txt} ${titulo}` : `${txt}\n${titulo}`;
    return `<span class="fin-dlt ${bien ? 'bien' : 'mal'}"${tip ? ` data-tip="${E(tip)}"` : ''}>${sube ? '▲' : '▼'} ${txt}</span>`;
  }
  // variación con su cuenta en el tooltip. Si antes era 0 no hay %: el tooltip lo dice sin perder contra qué se compara
  function deltaVs(a, b, malo, base, fmt) {
    const v = uiVar(a, b);
    const cola = `Ahora ${fmt(a)} · antes ${fmt(b)}`;
    if (v != null) return delta(v, malo, `${base}\n${cola}`);
    const ambos0 = Math.abs(n0(a)) < 0.5 && Math.abs(n0(b)) < 0.5;
    return delta(null, malo, `${ambos0 ? 'Sin variación: los dos períodos dan 0' : 'Sin %: antes era 0'}\n${base}\n${cola}`);
  }
  const pct1 = (p) => `${uiNum(p, 1)}%`;
  const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const diaLargo = (f) => `${uiCap(DIAS_C[uiF(f).getDay()])} ${uiFechaCorta(f)}`;
  const nCobros = (n) => `${uiNum(n)} cobro${n === 1 ? '' : 's'}`;
  const usdHtml = (n) => `<span class="fin-par"><small>${MON()}</small> ${E(uiNum(n))}</span>`;
  const card = (micro, der, cuerpo, clase = '') => `<section class="fin-card ${clase}"><header class="fin-card-h"><span class="fin-micro">${E(micro)}</span>${der || ''}</header>${cuerpo}</section>`;
  function avatar(nombre) {
    const ini = String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
    return `<span class="fin-av c-${uiColorNombre(nombre)}">${E(ini)}</span>`;
  }
  const estadoDot = (texto, color) => `<span class="fin-est c-${color}"><i></i>${E(texto)}</span>`;
  const vacio = (titulo, texto) => uiVacio({ ico: 'archivo', titulo, texto });
  // tabla al estilo de la referencia: cols = [{t, f(fila,i), al?, ancho?}]
  function tabla(cols, filas, o = {}) {
    if (!filas.length) return `<div class="fin-tvacia">${vacio(o.vacio || 'No hay nada en este período', o.vacioTexto || '')}</div>`;
    return `<div class="fin-tw"><table class="fin-tabla ${o.clase || ''}"><thead><tr>${cols.map(c => `<th${c.al ? ` class="al-${c.al}"` : ''}${c.ancho ? ` style="width:${c.ancho}"` : ''}>${c.t}</th>`).join('')}</tr></thead>
      <tbody>${filas.map((x, i) => `<tr${o.onFila ? ` class="clic" onclick="${o.onFila}(${o.clave ? A(o.clave(x)) : i})"` : ''}>${cols.map(c => `<td${c.al ? ` class="al-${c.al}"` : ''}>${c.f(x, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function spin(on) { const s = $('finSpin'); if (s) s.hidden = !on; }
  const sk = (alto, ancho = '100%') => `<i class="fin-sk" style="height:${alto}px;width:${ancho}"></i>`;

  /* ════════════════════════════════ datos remotos ════════════════════════════════ */
  // todo el CRM (cada mes, ya armado), los mínimos, la comisión de cada closer y lo que ya se les pagó
  async function cargar() { FIN.datos = await api('POST', { action: 'finanzasget' }); }
  /* El gasto de Meta Ads de un período, del módulo Ads. Nunca rompe la pantalla: sin conexión, sin respuesta o en
     otra moneda, devuelve {error} y el gasto y el ROAS quedan en "—". Un error se reintenta a los 2 minutos. */
  const ADS = {};
  function gastoAds(r) {
    const hasta = r.hasta > hoyS() ? hoyS() : r.hasta;
    if (r.desde > hasta) return Promise.resolve({ gasto: 0 });   // un período que no empezó: no hubo pauta
    const k = r.desde + '|' + hasta, c = ADS[k];
    if (c && c.p) return c.p;
    if (c && Date.now() - c.t < (c.v.error ? 120000 : 600000)) return Promise.resolve(c.v);
    const p = fetch(`/api/meta-ads?resumen=1&desde=${r.desde}&hasta=${hasta}`, { cache: 'no-store' })
      .then(async (res) => leerGasto(await res.json().catch(() => null), res.ok))
      .catch(() => ({ error: 'no respondió' }))
      .then((v) => { ADS[k] = { t: Date.now(), v }; return v; });
    ADS[k] = { p };
    return p;
  }
  function leerGasto(j, ok) {
    if (j && j.configurado === false) return { error: 'Meta Ads todavía no está conectado', noConf: true };
    if (!ok || !j || j.error) return { error: errMeta((j && (j.detalle || j.error)) || 'no respondió') };
    if (j.moneda && j.moneda !== MON()) return { error: `la cuenta de Meta está en ${j.moneda} y el CRM en ${MON()}: sin tipo de cambio no se pueden dividir` };
    return { gasto: n0(j.gasto) };
  }
  function errMeta(m) {
    const t = String(m || '');
    if (/too many calls|rate.?limit|limit reached|#17|#80004/i.test(t)) return 'Meta frenó las consultas por un rato (límite de llamadas de la cuenta publicitaria)';
    if (/token|OAuth|session/i.test(t)) return 'el token de Meta no es válido o venció';
    return t.length > 140 ? t.slice(0, 140) + '…' : t;
  }

  /* ════════════════════════════════ modelo ════════════════════════════════ */
  const meses = () => (FIN.datos && FIN.datos.meses) || {};
  // La fecha de un cobro: la de la call (o la de cobro de la cuota) si cae dentro de su mes; si no, el cobro queda "sin
  // día" y cuenta en el mes entero (lo pagado en seguimiento no trae fecha).
  const fechaEnMes = (f, mes) => (fechaOk(f) && f.slice(0, 7) === mes ? f : null);
  /* Todos los cobros del CRM: lo que pagó cada venta en la call y en seguimiento, y cada cuota cobrada. Cada uno con el
     mes del CRM donde está cargado, que es el que manda (lo que se carga en octubre es plata de octubre). */
  let MEMO = { d: null, v: [] };
  function cobros() {
    if (MEMO.d === FIN.datos) return MEMO.v;
    const out = [];
    Object.values(meses()).forEach(c => {
      const mes = c.mes;
      (c.ventas || []).forEach(v => {
        const base = { parte: 'ventas', tipo: 'Venta nueva', id: v.id, nombre: v.nombre || '', closer: v.closer || '', setter: v.setter || '', situacion: v.situacion || '',
          programa: v.programa || '', fuente: v.fuente || '', mes, fechaTxt: v.fecha || '', totalVenta: n0(v.total) };
        if (n0(v.dia1) > 0) out.push(Object.assign({}, base, { detalle: 'en la call', fecha: fechaEnMes(v.fecha, mes), monto: n0(v.dia1) }));
        if (n0(v.seguimiento) > 0) out.push(Object.assign({}, base, { detalle: 'en seguimiento', fecha: null, monto: n0(v.seguimiento) }));
      });
      (c.cuotas || []).forEach(q => {
        if (n0(q.cobrado) > 0) out.push({ parte: 'cuotas', tipo: 'Cuota', id: q.id, detalle: q.cuota || '', nombre: q.nombre || '', closer: q.closer || '', situacion: q.situacion || '',
          programa: '', mes, fecha: fechaEnMes(q.fecha, mes), fechaTxt: q.fecha || '', monto: n0(q.cobrado) });
      });
    });
    out.forEach(o => { o.clave = `${o.parte[0]}${o.mes}${o.id}${o.detalle === 'en seguimiento' ? 's' : ''}`; });
    MEMO = { d: FIN.datos, v: out };
    return out;
  }
  // la comisión de un closer en %: la suya o la de por defecto
  function pctPropio(closer) {
    const pct = ((FIN.datos && FIN.datos.comisiones) || {}).pct || {};
    const k = Object.keys(pct).find(x => norm(x) === norm(closer));
    return k == null ? null : n0(pct[k]);
  }
  const pctDe = (closer) => { const p = pctPropio(closer); return p != null ? p : n0(((FIN.datos && FIN.datos.comisiones) || {}).def ?? 10); };

  /* ── cobranza (Pagos Pendientes) ──
     Las cuotas de TODOS los meses del CRM (las que vencen el mes que viene también se deben). Una cuota "traída" a otro
     mes queda como 'traida': manda la copia, que es la que se cobra; de la original solo cuenta lo que ya se le cobró. */
  function pendientes() {
    const todas = [];
    Object.values(meses()).forEach(c => (c.cuotas || []).forEach(q => todas.push(Object.assign({}, q, { mes: c.mes }))));
    const traidas = new Set(todas.map(q => q.de).filter(Boolean));
    const hoy = hoyS();
    return todas.map(q => {
      const total = n0(q.porCobrar), abono = n0(q.cobrado), falta = Math.max(0, r2(total - abono));
      const s = norm(q.situacion);
      const cobradoCrm = s === 'cobrado' || s === 'completo pif';
      const estado = traidas.has(q.id) ? 'traida' : s === 'no paga' ? 'nopaga' : (cobradoCrm || falta <= 0) ? 'completado' : 'pendiente';
      const vence = fechaOk(q.fecha);
      const p = { key: `${q.mes}/${q.id}`, id: q.id, v: q.v || 0, mes: q.mes, etiqueta: q.cuota ? `Cuota · ${q.cuota}` : 'Cuota', cuota: q.cuota || '', nombre: q.nombre || '', telefono: q.telefono || '', closer: q.closer || '',
        total, abono, falta, monto: estado === 'completado' ? (abono > 0 ? abono : total) : falta, vence, estado, nota: q.notas || '', situacion: q.situacion || '',
        raro: estado === 'completado' && cobradoCrm && abono < total };
      p.grupo = estado !== 'pendiente' ? estado : !vence ? 'sinfecha' : vence < hoy ? 'vencido' : 'porvencer';
      p.dias = vence ? diasEntre(vence, hoy) : null;
      return p;
    });
  }

  /* ── resumen de un período ── */
  function resumenDe(r) {
    const items = cobros().filter(c => enPer(c, r));
    const suma = (t) => items.filter(c => c.tipo === t).reduce((a, c) => a + c.monto, 0);
    const venta = suma('Venta nueva'), cuota = suma('Cuota');
    return { r, items, venta, cuota, cash: venta + cuota, fact: venta };
  }
  const roasDe = (cash, ads) => (ads && !ads.error && ads.gasto > 0 ? cash / ads.gasto : null);

  /* ── liquidación de un mes: la comisión de cada closer sobre lo que cobró (ventas + cuotas de sus clientes) ── */
  function liquidacion(mes) {
    const it = cobros().filter(c => c.mes === mes);
    const cash = it.reduce((a, c) => a + c.monto, 0);
    const por = {};
    it.forEach(c => {
      if (!c.closer) return;
      const k = norm(c.closer), x = por[k] = por[k] || { nombre: c.closer, base: 0, nombres: new Set() };
      x.base += c.monto; x.nombres.add(nom(c.nombre));
    });
    const leads = {};
    ((meses()[mes] || {}).ventas || []).forEach(v => { const k = norm(v.closer); if (!k) return; const x = leads[k] = leads[k] || { leads: 0, cerradas: 0 }; x.leads++; if (n0(v.total) > 0) x.cerradas++; });
    const filas = Object.entries(por).sort((a, b) => b[1].base - a[1].base).map(([k, x]) => {
      // un mes ya liquidado se muestra con el % con el que se pagó, aunque después haya cambiado el del closer
      const pagado = ((((FIN.datos && FIN.datos.liq) || {})[mes]) || {})[k];
      const pct = pagado && pagado.pct != null ? n0(pagado.pct) : pctDe(x.nombre), n = x.nombres.size, l = leads[k];
      return { key: k, nombre: x.nombre, base: x.base, pct, propio: pctPropio(x.nombre) != null, total: x.base * pct / 100, n,
        sub: `${n} ${n === 1 ? 'cliente' : 'clientes'}${l && l.leads ? ` · cierre ${Math.round(100 * l.cerradas / l.leads)}% (${l.cerradas} de ${l.leads} leads)` : ''}` };
    });
    const conCloser = filas.reduce((a, f) => a + f.base, 0);
    return { mes, filas, cash, sinCloser: Math.max(0, cash - conCloser), totalComisiones: filas.reduce((a, f) => a + f.total, 0) };
  }

  /* ════════════════════════════════ armazón ════════════════════════════════ */
  const TABS = [['resumen', 'Resumen'], ['ventas', 'Ventas'], ['liquidaciones', 'Liquidaciones']];
  function armazon() {
    const sec = $('finanzas'); if (!sec) return null;
    if (!$('finRaiz')) sec.innerHTML = `<div class="fin" id="finRaiz"><div id="finTabsW"></div><div id="finTab" class="fin-cuerpo"></div></div>`;
    if (!TABS.some(t => t[0] === FIN.tab)) FIN.tab = 'resumen';
    $('finTabsW').innerHTML = pest(TABS, FIN.tab, 'finTabIr', 'principal');
    return $('finTab');
  }
  const PINTORES = {};
  async function pintar(suave) {
    const caja = armazon(); if (!caja) return;
    if (!FIN.datos) {
      caja.innerHTML = uiAviso({ tipo: 'rojo', texto: 'No pude leer el CRM de Ventas: ' + (FIN.errFin || 'no respondió'), accion: { texto: 'Reintentar', onclick: 'finActualizar()' } });
      return;
    }
    const gen = ++FIN.gen;
    const fn = PINTORES[FIN.tab] || PINTORES.resumen;
    try { await fn(gen, !!suave); }
    catch (e) {
      console.warn('[finanzas]', e);
      if (gen === FIN.gen) caja.innerHTML = uiAviso({ tipo: 'rojo', texto: 'No pude armar esta pestaña: ' + (e.message || e) });
    } finally { if (gen === FIN.gen) spin(false); }
  }
  function cabecera() {
    const x = $('pageExtra'), v = document.querySelector('.view.on');
    if (!x || !v || v.id !== 'finanzas') return;
    x.innerHTML = `<span class="fin-act" id="finAct">${FIN.actualizado ? 'Actualizado ' + hora(FIN.actualizado) : ''}</span>
      <button type="button" class="ui-icobtn" title="Volver a leer el CRM y Meta Ads" onclick="finActualizar()">${uiIco('refrescar', 16)}</button>`;
  }
  async function render(force) {
    const caja = armazon(); if (!caja) return;
    if (!FIN.datos || !caja.innerHTML.trim()) caja.innerHTML = esqueleto();
    if (force) Object.keys(ADS).forEach(k => delete ADS[k]);
    // el gasto de Meta se pide a la vez que el CRM: es lo que más tarda
    if (FIN.tab === 'resumen') { const r = uiPerRango(PER); gastoAds(r); gastoAds(r.previo); }
    try { await cargar(); FIN.errFin = ''; } catch (e) { if (e.message === 'sesion') return; FIN.errFin = e.message || String(e); }
    FIN.actualizado = new Date();
    cabecera();
    await pintar(!!force);
  }
  function esqueleto() {
    return `<div class="fin-bar">${sk(36, '480px')}</div>
      <div class="fin-tiles">${[1, 2, 3, 4].map(() => `<div class="fin-tile">${sk(14, '60%')}${sk(50, '80%')}</div>`).join('')}</div>
      <div class="fin-tira fin-sk-tira">${sk(40)}</div>
      <div class="fin-g2"><div class="fin-card">${sk(160)}</div><div class="fin-card">${sk(160)}</div></div>`;
  }

  /* ════════════════════════════════ RESUMEN ════════════════════════════════ */
  const barraResumen = () => `<div class="fin-bar fin-bar-res"><div class="fin-bar-g">${uiPeriodo(PER, 'finPeriodo')}<span class="fin-spin" id="finSpin" hidden></span></div></div>`;
  PINTORES.resumen = async function (gen, suave) {
    const caja = $('finTab');
    if (!suave || !$('finResCuerpo')) caja.innerHTML = `<div id="finBarRes">${barraResumen()}</div><div id="finResAv"></div><div id="finResCuerpo">${esqResumen()}</div>`;
    else $('finBarRes').innerHTML = barraResumen();
    spin(true);
    const r = uiPerRango(PER);
    const [ads, adsP] = await Promise.all([gastoAds(r), gastoAds(r.previo)]);
    if (gen !== FIN.gen) return;
    const R = resumenDe(r), P = resumenDe(r.previo);
    FIN.ultimo = { R };
    $('finResAv').innerHTML = avisosResumen(ads);
    $('finResCuerpo').innerHTML = cuerpoResumen(R, P, ads, adsP);
  };
  function esqResumen() {
    return `<div class="fin-tiles">${[1, 2, 3, 4].map(() => `<div class="fin-tile">${sk(14, '60%')}<div style="height:22px"></div>${sk(48, '85%')}</div>`).join('')}</div>
      <div class="fin-tira fin-sk-tira">${sk(40)}</div>
      <div class="fin-g2"><div class="fin-card">${sk(190)}</div><div class="fin-card">${sk(190)}</div></div>`;
  }
  function avisosResumen(ads) {
    if (!ads.error) return '';
    if (ads.noConf) return uiAviso({ tipo: 'azul', texto: 'Meta Ads todavía no está conectado: el gasto en ads y el ROAS quedan en "—" hasta que se cargue la cuenta publicitaria en Integraciones.', accion: { texto: 'Ir a Integraciones', onclick: "location.hash='#conexiones'" } });
    return uiAviso({ tipo: 'ambar', texto: `No pude leer el gasto de Meta Ads — ${ads.error}. El gasto en ads y el ROAS quedan en "—": tocá Actualizar en un rato.` });
  }
  /* Acumulado por día (o por semana si el período es largo) de los cobros con fecha, con la etiqueta de cada punto
     para el tooltip: "Mié 14 oct · +<moneda> 1.200 (2 cobros)" / "7 – 13 oct · sin cobros". */
  function curva(items, r, filtro) {
    const fin = r.hasta < hoyS() ? r.hasta : hoyS();
    if (fin < r.desde) return { valores: [], etiquetas: [] };
    const dias = diasEntre(r.desde, fin) + 1, paso = dias > 62 ? 7 : 1;
    const porDia = {}, nDia = {};
    items.filter(c => c.fecha && filtro(c)).forEach(c => { porDia[c.fecha] = (porDia[c.fecha] || 0) + c.monto; nDia[c.fecha] = (nDia[c.fecha] || 0) + 1; });
    const valores = [], etiquetas = [];
    let acc = 0, tramo = 0, nTramo = 0, ini = r.desde;
    for (let i = 0; i < dias; i++) {
      const f = uiSumarDias(r.desde, i);
      acc += porDia[f] || 0; tramo += porDia[f] || 0; nTramo += nDia[f] || 0;
      if ((i + 1) % paso === 0 || i === dias - 1) {
        valores.push(acc);
        const cuando = paso === 1 ? diaLargo(f) : (ini === f ? diaLargo(f) : `${uiFechaCorta(ini)} – ${uiFechaCorta(f)}`);
        etiquetas.push(`${cuando}${f === hoyS() ? ' (hoy)' : ''} · ${tramo ? `+${MON()} ${uiNum(tramo)} (${nCobros(nTramo)})` : 'sin cobros'}`);
        tramo = 0; nTramo = 0; ini = uiSumarDias(f, 1);
      }
    }
    return { valores, etiquetas };
  }
  // la curva de cada tile: la pieza compartida uiSparkArea; la caja .fin-spark conserva el alto y el fundido de la referencia
  function spark(serie, color, nombre) {
    const v = (serie && serie.valores) || [];
    if (v.length < 2 || !v.some(x => x > 0)) return '<div class="fin-spark vacia"></div>';
    return `<div class="fin-spark c-${color}">${uiSparkArea(v, color, { etiquetas: serie.etiquetas, fmt: (n) => fU(n), nombre })}</div>`;
  }
  const tamNum = (txt) => { const n = String(txt).replace(/[^\d]/g, '').length; return n <= 6 ? 54 : n <= 7 ? 50 : n <= 8 ? 44 : n <= 9 ? 40 : 34; };
  function tileValor(n, tip, sinUsd) {
    const t = n == null ? '—' : uiNum(n);
    return `<div class="fin-tile-v"${tip ? ` data-tip="${E(tip)}"` : ''}>${n == null || sinUsd ? '' : '<small>' + MON() + '</small>'}<b style="font-size:${tamNum(t)}px">${E(t)}</b></div>`;
  }
  function tile(o) {
    return `<div class="fin-tile c-${o.color}">
      <div class="fin-tile-h"><span class="fin-tile-l"><i></i>${E(o.etiqueta)}</span>${o.delta || ''}</div>
      ${o.cuerpo}${o.sub ? `<div class="fin-tile-sub">${o.sub}</div>` : ''}${o.pie || ''}
    </div>`;
  }
  function cuerpoResumen(R, P, ads, adsP) {
    const r = R.r, tit = `vs ${r.nombreAnt}`;
    const dl = (a, b, malo, fmt) => deltaVs(a, b, malo, tit, fmt || fU);
    const esteMes = r.modo === 'mes' && r.esActual;
    const meta = n0(((FIN.datos || {}).metas || {}).objetivoMes);
    const sinDia = (f) => R.items.filter(c => !c.fecha && f(c)).reduce((a, c) => a + c.monto, 0);
    const notaSinDia = (n) => n > 0 ? `\nLa curva acumula los cobros con día: ${fU(n)} sin día (lo pagado en seguimiento) no están en ella.` : '\nLa curva acumula los cobros día por día.';
    const roas = roasDe(R.cash, ads), roasP = roasDe(P.cash, adsP);
    const tipFact = `Facturación\nLo cobrado de ventas nuevas en el período: lo que pagó cada venta en la call y en seguimiento (el CRM anota lo que pagó, no el valor del contrato).${notaSinDia(sinDia(c => c.tipo !== 'Cuota'))}`;
    const tipCash = `Cash collected\nVentas nuevas ${fU(R.venta)} + cuotas cobradas ${fU(R.cuota)}\nTodo lo que entró según el CRM de Ventas.${notaSinDia(sinDia(() => true))}`;
    const tipAds = ads.error ? `Gasto en ads\nSin dato: ${ads.error}.` : `Gasto en ads\n${fU(ads.gasto)} de pauta en Meta Ads en el período (el módulo Ads).`;
    const tipRoas = roas != null ? `ROAS\nCash ${fU(R.cash)} ÷ gasto en ads ${fU(ads.gasto)} = ${uiNum(roas, 1)}x\nSolo la pauta de Meta: sin comisiones ni otros gastos.`
      : ads.error ? `ROAS\nSin gasto en ads: ${ads.error}.` : 'ROAS\nSin gasto en ads en este período: no hay contra qué dividir.';
    const tiles = [
      tile({ etiqueta: 'Facturación', color: 'verde', delta: dl(R.fact, P.fact), cuerpo: tileValor(R.fact, tipFact), pie: spark(curva(R.items, r, c => c.tipo !== 'Cuota'), 'verde', 'Facturación acumulada') }),
      tile({ etiqueta: 'Cash collected', color: 'cash', delta: dl(R.cash, P.cash), cuerpo: tileValor(R.cash, tipCash),
        sub: esteMes ? (() => {
          const dia = Number(hoyS().slice(8, 10)), dias = Number(finDeMes(mesHoy()).slice(8, 10));
          const proy = dia ? R.cash / dia * dias : R.cash;
          return `${meta ? `${Math.round(100 * R.cash / meta)}% del objetivo de ${MON()} ${uiNum(meta)} · faltan ${MON()} ${uiNum(Math.max(0, meta - R.cash))}<br>` : ''}Al ritmo de hoy cierra en ${MON()} ${uiNum(proy)}`;
        })() : '',
        pie: spark(curva(R.items, r, () => true), 'cash', 'Cash acumulado') }),
      tile({ etiqueta: 'Gasto en ads', color: 'ads', delta: !ads.error && !adsP.error ? dl(ads.gasto, adsP.gasto, true) : delta(null, true, ads.error ? `Sin dato: ${ads.error}` : `Sin dato del período anterior: ${adsP.error}`),
        cuerpo: tileValor(ads.error ? null : ads.gasto, tipAds), sub: ads.error ? E(uiCap(ads.error)) : 'Meta Ads del período' }),
      tile({ etiqueta: 'ROAS', color: 'verde', delta: roas != null && roasP != null ? dl(roas, roasP, false, (n) => `${uiNum(n, 1)}x`) : delta(null, false, `Sin %: ${roas == null ? 'este período no tiene ROAS' : 'el período anterior no tiene ROAS'}\n${tit}`),
        cuerpo: `<div class="fin-tile-v" data-tip="${E(tipRoas)}"><b style="font-size:54px">${roas != null ? E(uiNum(roas, 1)) + 'x' : '—'}</b></div>`, sub: roas != null ? `cash ÷ gasto en ads` : '' }),
    ].join('');
    const pend = pendientes().filter(p => p.estado === 'pendiente'), venc = pend.filter(p => p.grupo === 'vencido');
    const pc = pend.reduce((a, p) => a + p.falta, 0), vc = venc.reduce((a, p) => a + p.falta, 0);
    const yaCobrado = R.cash + pc > 0 ? R.cash / (R.cash + pc) * 100 : null;
    const comis = R.items.reduce((a, c) => a + (c.closer ? c.monto * pctDe(c.closer) / 100 : 0), 0);
    const tipCobrar = `Cuentas por cobrar\n${fU(pc)} · ${pend.length} cuota${pend.length === 1 ? '' : 's'} pendiente${pend.length === 1 ? '' : 's'} (de todos los meses del CRM)\nClic para ver Pagos Pendientes`;
    const tipVenc = `Vencido\n${fU(vc)} · ${venc.length} cuota${venc.length === 1 ? '' : 's'} con la fecha de cobro pasada\nClic para verlas`;
    const tipYa = yaCobrado == null ? 'Ya cobrado de lo vendido\nSin cobros ni cuentas por cobrar' : `Ya cobrado de lo vendido\n${pct1(yaCobrado)} · ${fU(R.cash)} de ${fU(R.cash + pc)}\nFalta cobrar ${fU(pc)} (las cuentas por cobrar de hoy)`;
    const tipCom = `Comisiones de closers\n${fU(comis)} sobre los cobros del período, con el % de cada closer\nClic para ver Liquidaciones`;
    const tira = `<div class="fin-tira">
      <div class="fin-tira-c clic" onclick="finIr('ventas','pendientes')" data-tip="${E(tipCobrar)}"><span class="fin-tira-l">Cuentas por cobrar</span><div class="fin-tira-v oro">${usdHtml(pc)}</div></div>
      <div class="fin-tira-c clic" onclick="finIr('ventas','pendientes')" data-tip="${E(tipVenc)}"><span class="fin-tira-l">Vencido</span><div class="fin-tira-v${vc ? ' rojo' : ''}">${usdHtml(vc)}</div></div>
      <div class="fin-tira-c" data-tip="${E(tipYa)}"><span class="fin-tira-l">Ya cobrado de lo vendido</span><div class="fin-tira-v"><b>${pctTxt(yaCobrado)}</b><span class="fin-tira-riel"><i style="width:${Math.max(0, Math.min(100, yaCobrado || 0)).toFixed(0)}%"></i></span></div></div>
      <div class="fin-tira-c clic" onclick="finIr('liquidaciones')" data-tip="${E(tipCom)}"><span class="fin-tira-l">Comisiones de closers</span><div class="fin-tira-v">${usdHtml(comis)}</div></div>
    </div>`;
    return `<div class="fin-tiles">${tiles}</div>${tira}
      <div class="fin-g2">${closersCard(R, P)}${donaCard(R, P)}</div>
      <div class="fin-g1">${calorCard(R)}</div>
      <p class="fin-fuentes">Fuentes: el CRM de Ventas (${uiNum(R.items.filter(c => c.tipo !== 'Cuota').length)} pagos de ventas y ${uiNum(R.items.filter(c => c.tipo === 'Cuota').length)} cuotas cobradas en el período) · la pauta de Meta Ads${ads.error ? ' (sin dato)' : ''}.</p>`;
  }
  // Ventas por closer: el cash que trajo cada uno (sus ventas + las cuotas de sus clientes), con su comisión en el tooltip
  function closersCard(R, P) {
    const g = {};
    R.items.forEach(c => {
      const k = c.closer || 'Sin closer', x = g[k] = g[k] || { k, v: 0, ventas: 0, cuotas: 0, clientes: new Set() };
      x.v += c.monto; x.clientes.add(nom(c.nombre));
      if (c.tipo === 'Cuota') x.cuotas += c.monto; else x.ventas += c.monto;
    });
    const arr = Object.values(g).sort((a, b) => b.v - a.v);
    const total = arr.reduce((a, x) => a + x.v, 0);
    const filas = arr.map(x => {
      const p = total ? x.v / total * 100 : 0, sin = x.k === 'Sin closer';
      const tip = `${x.k}\n${fU(x.v)} · ${pct1(p)} del cash\nVentas ${fU(x.ventas)} · cuotas ${fU(x.cuotas)} · ${x.clientes.size} cliente${x.clientes.size === 1 ? '' : 's'}${sin ? '\nSin closer: no paga comisión' : `\nComisión ${pctEq(pctDe(x.k))}: ${fU(x.v * pctDe(x.k) / 100)}`}\nClic para ver los cobros`;
      return `<div class="fin-met-f clic" data-tip="${E(tip)}" onclick="finCloserVer(${A(x.k)})"><span class="fin-met-n">${E(x.k)}</span><span class="fin-riel"><i style="width:${p.toFixed(1)}%"></i></span><b>${MON()} ${E(uiNum(x.v))}</b><em>${Math.round(p)}%</em></div>`;
    }).join('');
    return card('Ventas por closer', `<button type="button" class="fin-link" onclick="finIr('liquidaciones')">Comisiones →</button>`,
      `<div class="fin-total"><b>${MON()} ${E(uiNum(total))}</b>${deltaVs(total, P.cash, false, `vs ${R.r.nombreAnt}`, fU)}</div>
      ${filas ? `<div class="fin-met">${filas}</div>` : uiVacioMini('Sin cobros en este período')}`, 'fin-c-met');
  }
  // sector de anillo con las puntas redondeadas (~3 px), como la dona de la referencia
  function sector(t0, t1, C, Ro, Ri, rc) {
    const P = (t, rr) => `${(C + rr * Math.cos(t)).toFixed(2)},${(C + rr * Math.sin(t)).toFixed(2)}`;
    const large = (t1 - t0) > Math.PI ? 1 : 0;
    const dO = rc / Ro, dI = rc / Ri;
    if (t1 - t0 <= 2 * dI + 0.01) return `M${P(t0, Ro)} A${Ro},${Ro} 0 0 1 ${P(t1, Ro)} L${P(t1, Ri)} A${Ri},${Ri} 0 0 0 ${P(t0, Ri)} Z`;
    return `M${P(t0 + dO, Ro)} A${Ro},${Ro} 0 ${large} 1 ${P(t1 - dO, Ro)} Q${P(t1, Ro)} ${P(t1, Ro - rc)} L${P(t1, Ri + rc)} Q${P(t1, Ri)} ${P(t1 - dI, Ri)} A${Ri},${Ri} 0 ${large} 0 ${P(t0 + dI, Ri)} Q${P(t0, Ri)} ${P(t0, Ri + rc)} L${P(t0, Ro - rc)} Q${P(t0, Ro)} ${P(t0 + dO, Ro)} Z`;
  }
  /* La dona de la referencia, interactiva: cada sector y su fila de la leyenda comparten data-seg; pasar por uno resalta el
     sector, apaga el resto y pone su monto en el centro (manejador delegado al final del archivo); el clic abre los
     cobros de ese origen. */
  const segAttrs = (s) => ` data-seg="${s.i}" data-cv="${E(s.cv)}" data-cl="${E(s.k)}" data-tip="${E(s.tip)}" onclick="finCashTipo(${A(s.tipo)})"`;
  function donaSvg(segs, total) {
    const C = 64, Ro = 64, Ri = 44, Rm = 54, gap = 4 / Rm;
    const vivos = segs.filter(s => s.v > 0);
    const id = 'fd' + Math.random().toString(36).slice(2, 7);
    let defs = '', marcas = '';
    if (!total || !vivos.length) marcas = `<circle cx="${C}" cy="${C}" r="${Rm}" fill="none" stroke="#26262b" stroke-width="20" data-tip="${E('De dónde viene el cash\nSin cobros en este período')}"/>`;
    else if (vivos.length === 1) {
      const s = vivos[0];
      defs = `<linearGradient id="${id}0" class="c-${s.c}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fin-dg-a"/><stop offset="1" class="fin-dg-b"/></linearGradient>`;
      marcas = `<circle cx="${C}" cy="${C}" r="${Rm}" fill="none" stroke="url(#${id}0)" stroke-width="20"${segAttrs(s)}/>`;
    } else {
      let a = Math.PI;   // arranca a las 9, en el sentido de las agujas
      vivos.forEach((s, i) => {
        const span = s.v / total * Math.PI * 2;
        const t0 = a + gap / 2, t1 = a + span - gap / 2;
        a += span;
        defs += `<linearGradient id="${id}${i}" class="c-${s.c}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fin-dg-a"/><stop offset="1" class="fin-dg-b"/></linearGradient>`;
        if (t1 > t0) marcas += `<path d="${sector(t0, t1, C, Ro, Ri, 3)}" fill="url(#${id}${i})"${segAttrs(s)}/>`;
      });
    }
    return `<svg viewBox="0 0 128 128" aria-hidden="true"><defs>${defs}</defs>${marcas}</svg>`;
  }
  function donaCard(R, P) {
    const segs = [
      { k: 'Venta nueva', tipo: 'Venta nueva', v: R.venta, p: P.venta, c: 'verde' },
      { k: 'Cuotas', tipo: 'Cuota', v: R.cuota, p: P.cuota, c: 'gold' },
    ];
    const total = R.cash;
    const det = (tipo) => {
      const it = R.items.filter(c => c.tipo === tipo);
      if (!it.length) return '';
      if (tipo === 'Cuota') return `${it.length} cuota${it.length === 1 ? '' : 's'} cobrada${it.length === 1 ? '' : 's'}`;
      const s2 = (f) => it.filter(f).reduce((a, c) => a + c.monto, 0);
      const personas = new Set(it.map(c => nom(c.nombre))).size;
      const call = s2(c => c.detalle === 'en la call'), sg = s2(c => c.detalle === 'en seguimiento');
      return [`${personas} venta${personas === 1 ? '' : 's'}`, call ? `${MON()} ${uiNum(call)} en la call` : '', sg ? `${MON()} ${uiNum(sg)} en seguimiento` : ''].filter(Boolean).join(' · ');
    };
    segs.forEach((s, i) => {
      s.i = i; s.cv = uiNum(s.v);
      const d = det(s.tipo), vr = uiVar(s.v, s.p);
      s.tip = s.v > 0
        ? `${s.k}\n${MON()} ${uiNum(s.v)} · ${pct1(total ? s.v / total * 100 : 0)} del cash collected${d ? '\n' + d : ''}${vr != null ? `\n${vr >= 0 ? '+' : ''}${uiNum(vr, 1)}% vs ${R.r.nombreAnt} (antes ${MON()} ${uiNum(s.p)})` : ''}\nClic para ver los cobros`
        : `${s.k}\nSin cobros de este tipo en el período`;
    });
    const ley = segs.map(s => `<div class="fin-ley-f${s.v > 0 ? ' clic' : ''}"${s.v > 0 ? segAttrs(s) : ` data-tip="${E(s.tip)}"`}><i class="fin-ley-pt c-${s.c}"></i><span class="fin-ley-n">${E(s.k)}</span><span class="fin-ley-p">${total ? Math.round(s.v / total * 100) : 0}%</span><b>${MON()} ${E(uiNum(s.v))}</b>${deltaVs(s.v, s.p, false, `vs ${R.r.nombreAnt}`, fU)}</div>`).join('');
    const tipCentro = total ? `De dónde viene el cash\n${MON()} ${uiNum(total)} en total\n${segs.map(s => `${s.k} ${pct1(s.v / total * 100)}`).join(' · ')}\nPasá por cada color para ver su detalle` : 'De dónde viene el cash\nSin cobros en este período';
    return card('De dónde viene el cash', '', `<div class="fin-dona-w"><div class="fin-dona" data-tip="${E(tipCentro)}">${donaSvg(segs, total)}<div class="fin-dona-c"><b>${E(uiNum(total))}</b><span>${MON()}</span></div></div><div class="fin-ley">${ley}</div></div>`, 'fin-c-dona');
  }
  function calorCard(R) {
    const r = R.r, dias = diasEntre(r.desde, r.hasta) + 1, semanal = dias > 62;
    const porDia = {}, nDia = {};
    R.items.filter(c => c.fecha).forEach(c => { porDia[c.fecha] = (porDia[c.fecha] || 0) + c.monto; nDia[c.fecha] = (nDia[c.fecha] || 0) + 1; });
    const celdas = [], hoy = hoyS();
    if (!semanal) for (let i = 0; i < dias; i++) { const f = uiSumarDias(r.desde, i); celdas.push({ f, h: f, v: porDia[f] || 0, n: nDia[f] || 0, et: diaLargo(f) + (f === hoy ? ' (hoy)' : '') }); }
    else for (let i = 0; i < dias; i += 7) {
      let v = 0, n = 0; const f = uiSumarDias(r.desde, i), h = uiSumarDias(r.desde, Math.min(dias - 1, i + 6));
      for (let j = 0; j < 7 && i + j < dias; j++) { const d = uiSumarDias(r.desde, i + j); v += porDia[d] || 0; n += nDia[d] || 0; }
      const conHoy = f <= hoy && hoy <= h;
      celdas.push({ f, h, v, n, et: f === h ? `${diaLargo(f)}${f === hoy ? ' (hoy)' : ''}` : `Semana del ${uiFechaCorta(f)} al ${uiFechaCorta(h)}${conHoy ? ' (incluye hoy)' : ''}` });
    }
    const max = Math.max(0, ...celdas.map(c => c.v));
    const nivel = (v) => !v || !max ? 0 : v / max > 0.75 ? 4 : v / max > 0.5 ? 3 : v / max > 0.25 ? 2 : 1;
    const total = celdas.reduce((a, c) => a + c.v, 0), conMov = celdas.filter(c => c.v > 0).length;
    const sinDia = R.items.filter(c => !c.fecha).reduce((a, c) => a + c.monto, 0);
    // tooltip con el día, el monto, cuántos cobros y qué parte del período fue; clic = los cobros de ese día
    const grid = celdas.map(c => {
      const tip = c.v ? `${c.et}\n${MON()} ${uiNum(c.v)} · ${nCobros(c.n)}\n${pct1(total ? c.v / total * 100 : 0)} de lo cobrado con día en el período${c.v === max && conMov > 1 ? ' · el pico' : ''}\nClic para ver los cobros`
        : `${c.et}\n${c.f > hoy ? 'Todavía no llegó' : c.h > hoy ? 'Sin cobros hasta hoy' : 'Sin cobros'}`;
      return `<i class="n${nivel(c.v)}${c.v ? ' clic' : ''}" data-tip="${E(tip)}"${c.v ? ` onclick="finCalorDia(${A(c.f)},${A(c.h)})"` : ''}></i>`;
    }).join('');
    return card('Cobros del período', '', `<div class="fin-calor">${grid}</div>
      <div class="fin-calor-pie"><span class="fin-calor-esc">Menos <i class="n0"></i><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i> Más</span>
        <span class="fin-calor-tot"><span>Total: <b>${MON()} ${E(uiNum(total))}</b></span><span>Con mov.: <b>${conMov}</b></span><span>Prom.: <b>${MON()} ${E(uiNum(conMov ? total / conMov : 0))}</b></span></span></div>
      ${sinDia > 0 ? `<div class="fin-nota">+ ${MON()} ${E(uiNum(sinDia))} sin día: lo pagado en seguimiento no trae la fecha del cobro, solo el mes.</div>` : ''}`, 'fin-c-calor');
  }

  /* ── el clic de los gráficos: abre los cobros del dato que se tocó; tocar un cobro abre su ficha ── */
  const perTxt = (r) => r.modo === 'mes' ? nombreMes(mesDe(r.desde)) : r.etiqueta;
  const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const fechaLarga = (f) => { const d = uiF(f); return `${DIAS_L[d.getDay()]} ${d.getDate()} de ${UI_MESES[d.getMonth()]}`; };
  const resumenActual = () => (FIN.ultimo && FIN.ultimo.R) || null;
  const fechaCelda = (c) => `<span class="fin-fecha"${c.fecha ? '' : ` data-tip="${E('Sin día\nLo pagado en seguimiento no trae el día del cobro, solo el mes')}"`}>${c.fecha ? E(uiFechaCorta(c.fecha)) : E(mesCorto(c.mes)) + ' ·'}</span>`;
  const tipoTxt = (c) => c.tipo === 'Cuota' ? `Cuota${c.detalle ? ' ' + c.detalle : ''}` : `Venta · ${c.detalle}`;
  const colsCobros = [
    { t: 'Fecha', ancho: '78px', f: fechaCelda },
    { t: 'Cliente', f: c => `<b class="fin-lead">${E(c.nombre || '—')}</b>` },
    { t: 'Tipo', f: c => `<span class="fin-sec">${E(tipoTxt(c))}</span>` },
    { t: 'Programa', f: c => `<span class="fin-sec">${E(c.programa || '—')}</span>` },
    { t: 'Closer', f: c => `<span class="fin-sec">${E(c.closer || '—')}</span>` },
    { t: 'Monto', al: 'der', f: c => `<b>${MON()} ${E(uiNum(c.monto, 2))}</b>` },
  ];
  function modalCobros(titulo, sub, lista) {
    const l = lista.slice().sort((a, b) => String(b.fecha || `${b.mes}-00`).localeCompare(String(a.fecha || `${a.mes}-00`)) || b.monto - a.monto);
    uiModalAbrir({
      titulo, sub, ancho: '860px',
      cuerpo: `<div class="fin-det-tot"><span><b>${MON()} ${uiNum(l.reduce((a, c) => a + c.monto, 0), 2)}</b> · ${nCobros(l.length)}</span></div>
        <div class="fin-det-tabla">${tabla(colsCobros, l, { onFila: 'finTxVer', clave: c => c.clave, vacio: 'Sin cobros' })}</div>`,
    });
  }
  window.finCashTipo = (tipo) => {
    const R = resumenActual(); if (!R) return;
    modalCobros(tipo === 'Cuota' ? 'Cuotas cobradas' : 'Ventas nuevas', `${perTxt(R.r)} · de dónde viene el cash`, R.items.filter(c => c.tipo === tipo));
  };
  window.finCloserVer = (k) => {
    const R = resumenActual(); if (!R) return;
    modalCobros(k, `${perTxt(R.r)} · ventas y cuotas cobradas`, R.items.filter(c => (c.closer || 'Sin closer') === k));
  };
  window.finCalorDia = (f, h) => {
    const R = resumenActual(); if (!R) return;
    h = h || f;
    modalCobros(f === h ? `Cobros del ${fechaLarga(f)}` : `Cobros del ${uiFechaCorta(f)} al ${uiFechaCorta(h)}`, `${perTxt(R.r)} · cobros del período`, R.items.filter(c => c.fecha && c.fecha >= f && c.fecha <= h));
  };

  /* ════════════════════════════════ VENTAS ════════════════════════════════ */
  PINTORES.ventas = async function (gen, suave) {
    const caja = $('finTab');
    const sub = FIN.sub.ventas;
    if (!suave || !$('finVen')) caja.innerHTML = `${pest([['transacciones', 'Transacciones'], ['pendientes', 'Pagos Pendientes']], sub, 'finSubVentas', 'sub')}<div id="finVen"></div>`;
    if (sub === 'pendientes') return pintarPendientes();
    return pintarTx();
  };
  window.finSubVentas = (s) => { FIN.sub.ventas = s; ss.set('sub', FIN.sub); pintar(false); };

  /* ── Transacciones ── */
  function txFiltrar(r) {
    const F = FIN.txF, q = nom(FIN.txBuscar);
    let lista = cobros().filter(c => enPer(c, r));
    if (F.tipo) lista = lista.filter(c => c.tipo === F.tipo);
    if (F.closer) lista = lista.filter(c => (c.closer || 'Sin closer') === F.closer);
    if (F.programa) lista = lista.filter(c => (c.programa || 'Sin programa') === F.programa);
    if (q) lista = lista.filter(c => nom([c.nombre, c.closer, c.programa, c.detalle, c.situacion].join(' ')).includes(q));
    return lista.sort((a, b) => String(b.fecha || `${b.mes}-00`).localeCompare(String(a.fecha || `${a.mes}-00`)) || b.monto - a.monto);
  }
  const nFiltros = () => { const F = FIN.txF; return !!F.tipo + !!F.closer + !!F.programa; };
  function pintarTx() {
    const caja = $('finVen'); if (!caja) return;
    caja.innerHTML = `<div class="fin-bar">
        <div class="fin-bar-g">${uiPeriodo(PER, 'finPeriodo')}
          <label class="fin-buscar">${uiIco('buscar', 16)}<input type="search" placeholder="Buscar..." value="${E(FIN.txBuscar)}" oninput="finTxBuscar(this.value)"></label>
          <div class="fin-pop-w"><button type="button" class="fin-btn3${nFiltros() ? ' on' : ''}" onclick="finTxFiltros()">${uiIco('filtro', 15)}Filtros${nFiltros() ? `<em>${nFiltros()}</em>` : ''}</button><div class="fin-pop" id="finTxPop" hidden></div></div>
        </div>
      </div>
      <div id="finTxCuerpo"></div>`;
    pintarTxCuerpo();
  }
  function pintarTxCuerpo() {
    const caja = $('finTxCuerpo'); if (!caja) return;
    const lista = txFiltrar(uiPerRango(PER));
    const cash = lista.reduce((a, c) => a + c.monto, 0), ventas = lista.filter(c => c.tipo !== 'Cuota').reduce((a, c) => a + c.monto, 0);
    const tira = `<div class="fin-tira">
      <div class="fin-tira-c"><span class="fin-tira-l">Cash collected</span><div class="fin-tira-v"><b>${MON()} ${E(uiNum(cash, 2))}</b></div></div>
      <div class="fin-tira-c"><span class="fin-tira-l">Ventas nuevas</span><div class="fin-tira-v verde"><b>${MON()} ${E(uiNum(ventas, 2))}</b></div></div>
      <div class="fin-tira-c"><span class="fin-tira-l">Transacciones</span><div class="fin-tira-v"><b>${uiNum(lista.length)}</b></div></div>
      <div class="fin-tira-c" data-tip="${E(`Ticket promedio\nCash ${MON()} ${uiNum(cash, 2)} ÷ ${uiNum(lista.length)} transacciones`)}"><span class="fin-tira-l">Ticket promedio</span><div class="fin-tira-v"><b>${MON()} ${E(uiNum(lista.length ? cash / lista.length : 0, 2))}</b></div></div>
    </div>`;
    const t = tabla([
      { t: 'Fecha', ancho: '78px', f: fechaCelda },
      { t: 'Lead', f: c => `<b class="fin-lead">${E(c.nombre || 'sin nombre')}</b>${c.tipo === 'Cuota' ? '<span class="fin-tag">cuota</span>' : ''}` },
      { t: 'Programa', f: c => `<span class="fin-sec">${E(c.programa || '—')}</span><span class="fin-suf"> · ${E(c.tipo === 'Cuota' ? `Cuota ${c.detalle}`.trim() : c.detalle)}</span>` },
      { t: 'Closer', f: c => `<span class="fin-sec">${E(c.closer || '—')}</span>` },
      { t: 'Monto', al: 'der', ancho: '130px', f: c => `<b>${MON()} ${E(uiNum(c.monto, 2))}</b>` },
    ], lista, { onFila: 'finTxVer', clave: c => c.clave, vacio: 'No hay cobros en este período', vacioTexto: nFiltros() || FIN.txBuscar ? 'Probá sacando los filtros o la búsqueda.' : 'Los cobros salen de Ventas: lo que pagó cada venta y las cuotas cobradas.' });
    caja.innerHTML = `${tira}<div class="fin-tcard">${t}</div>`;
  }
  window.finTxBuscar = (v) => { FIN.txBuscar = v; pintarTxCuerpo(); };
  window.finTxFiltros = () => {
    const pop = $('finTxPop'); if (!pop) return;
    if (!pop.hidden) { pop.hidden = true; return; }
    const todos = cobros();
    const op = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const sel = (campo, etiqueta, opciones, ninguno) => `<label class="ui-campo"><span>${E(etiqueta)}</span><select onchange="finTxFiltro('${campo}',this.value)"><option value="">${E(ninguno)}</option>${opciones.map(o => `<option${FIN.txF[campo] === o ? ' selected' : ''}>${E(o)}</option>`).join('')}</select></label>`;
    pop.innerHTML = `${sel('tipo', 'Tipo', ['Venta nueva', 'Cuota'], 'Todos')}
      ${sel('closer', 'Closer', op(todos.map(c => c.closer || 'Sin closer')), 'Todos los closers')}
      ${sel('programa', 'Programa', op(todos.map(c => c.programa || 'Sin programa')), 'Todos')}
      <div class="fin-pop-pie"><button type="button" class="fin-link" onclick="finTxFiltro('limpiar')">Limpiar</button></div>`;
    pop.hidden = false;
  };
  window.finTxFiltro = (campo, v) => {
    if (campo === 'limpiar') FIN.txF = { tipo: '', closer: '', programa: '' };
    else FIN.txF[campo] = v;
    const abierto = $('finTxPop') && !$('finTxPop').hidden;
    pintarTx();
    if (abierto) window.finTxFiltros();
  };
  document.addEventListener('click', (e) => {   // el panel de filtros se cierra tocando afuera
    if (e.target.closest && e.target.closest('.fin-pop-w')) return;
    const pop = $('finTxPop'); if (pop && !pop.hidden) pop.hidden = true;
  });
  window.finTxVer = (k) => {
    const c = cobros().find(x => x.clave === k); if (!c) return;
    const kv = (k2, v) => v ? `<div class="fin-kv"><span>${E(k2)}</span><div>${v}</div></div>` : '';
    const pct = pctDe(c.closer);
    uiModalAbrir({
      titulo: c.nombre || 'Cobro', sub: `${tipoTxt(c)} · ${MON()} ${uiNum(c.monto, 2)}`, ancho: '560px',
      cuerpo: `<div class="fin-kvs">
        ${kv('Origen', `CRM de Ventas · ${E(nombreMes(c.mes))} · ${c.tipo === 'Cuota' ? 'Cuotas' : 'Ventas'}`)}
        ${kv('Fecha', c.fecha ? E(uiFechaCorta(c.fecha) + ' ' + c.fecha.slice(0, 4)) : `${E(nombreMes(c.mes))} <small>— lo pagado en seguimiento no trae el día${c.fechaTxt ? ` (la call fue el ${E(fechaOk(c.fechaTxt) ? uiFechaCorta(c.fechaTxt) : c.fechaTxt)})` : ''}</small>`)}
        ${kv('Monto', `${MON()} ${E(uiNum(c.monto, 2))}`)}
        ${kv('Programa', c.programa ? E(c.programa) : '<small>sin dato: se completa al cargar el cierre</small>')}
        ${kv('Closer', E(c.closer || '—') + (c.closer ? ` <small>· comisión ${MON()} ${E(uiNum(c.monto * pct / 100, 2))} (${E(pctEq(pct))})</small>` : ''))}
        ${kv('Setter', E(c.setter || ''))}
        ${kv('Origen del lead', E(c.fuente || ''))}
        ${kv('Situación en el CRM', E(c.situacion || ''))}
      </div><div class="fin-kv-acc"><button type="button" class="btn" onclick="uiModalCerrar();location.hash='#crm'">Ver en Ventas</button></div>`,
    });
  };

  /* ── Pagos Pendientes ── */
  function pintarPendientes() {
    const caja = $('finVen'); if (!caja) return;
    const conTraidas = pendientes(), todos = conTraidas.filter(p => p.estado !== 'traida');
    const F = FIN.ppF;
    const est = FIN.sub.pend;
    const filtrar = (l) => {
      let x = l;
      if (F.closer) x = x.filter(p => (p.closer || 'Sin closer') === F.closer);
      if (F.mes) x = x.filter(p => F.mes === 'sin' ? !p.vence : mesDe(p.vence) === F.mes);
      if (F.buscar) { const q = nom(F.buscar); x = x.filter(p => nom([p.nombre, p.closer, p.etiqueta, p.nota].join(' ')).includes(q)); }
      return x;
    };
    const pend = todos.filter(p => p.estado === 'pendiente');
    const kpi = (l) => ({ m: l.reduce((a, p) => a + p.falta, 0), n: l.length });
    const k = { cobrar: kpi(pend), vencer: kpi(pend.filter(p => p.grupo === 'porvencer')), vencido: kpi(pend.filter(p => p.grupo === 'vencido')), nopaga: kpi(todos.filter(p => p.estado === 'nopaga')), sinf: pend.filter(p => p.grupo === 'sinfecha').length };
    const celda = (et, x, clase, sub) => `<div class="fin-tira-c"><span class="fin-tira-l">${et}</span><div class="fin-tira-v ${clase}">${usdHtml(x.m)}</div><span class="fin-tira-sub">${x.n} ${x.n === 1 ? 'cuota' : 'cuotas'}${sub || ''}</span></div>`;
    const tira = `<div class="fin-tira alta">${celda('Por cobrar', k.cobrar, 'oro', k.sinf ? ` · ${k.sinf} sin fecha` : '')}${celda('Por vencer', k.vencer, '')}${celda('Vencido', k.vencido, 'rojo')}${celda('No paga', k.nopaga, 'rojo')}</div>`;
    const closers = [...new Set(todos.map(p => p.closer || 'Sin closer'))].sort();
    const ms = [...new Set(todos.map(p => mesDe(p.vence)).filter(Boolean))].sort();
    const barra = `${seg([{ id: 'pendientes', t: 'Pendientes' }, { id: 'completados', t: 'Completados' }, { id: 'nopaga', t: 'No paga', badge: k.nopaga.n || '' }, { id: 'resumen', t: 'Resumen' }], est, 'finPpEstado', 'pp')}
      <div class="fin-bar fin-bar-pp"><div class="fin-bar-g">
        <select class="fin-sel" onchange="finPpFiltro('closer',this.value)"><option value="">Todos los closers</option>${closers.map(c => `<option${F.closer === c ? ' selected' : ''}>${E(c)}</option>`).join('')}</select>
        <select class="fin-sel" onchange="finPpFiltro('mes',this.value)"><option value="">Todos los meses</option>${ms.map(m => `<option value="${m}"${F.mes === m ? ' selected' : ''}>${E(nombreMes(m))}</option>`).join('')}<option value="sin"${F.mes === 'sin' ? ' selected' : ''}>Sin fecha</option></select>
        <label class="fin-buscar chico">${uiIco('buscar', 16)}<input type="search" placeholder="Buscar..." value="${E(F.buscar)}" oninput="finPpBuscar(this.value)"></label>
      </div></div>`;
    const avisos = [];
    const raros = todos.filter(p => p.raro);
    if (raros.length) avisos.push(uiAviso({ tipo: 'ambar', texto: `En el CRM, ${raros.map(p => p.nombre || 'sin nombre').join(', ')} ${raros.length === 1 ? 'figura' : 'figuran'} como "Cobrado" sin el monto cobrado completo: o falta el monto, o la situación está mal. La parte que falta no suma al cash.` }));
    if (k.sinf) avisos.push(uiAviso({ tipo: 'azul', texto: `${k.sinf === 1 ? 'Una cuota pendiente no tiene' : `${k.sinf} cuotas pendientes no tienen`} fecha de cobro: sin fecha no se sabe si venció. Se carga en Ventas › Cuotas.` }));
    let lista;
    if (est === 'resumen') lista = resumenCobranza(filtrar(conTraidas));
    else {
      const base = filtrar(todos.filter(p => est === 'pendientes' ? p.estado === 'pendiente' : est === 'completados' ? p.estado === 'completado' : p.estado === 'nopaga'));
      FIN.ppLista = base;
      lista = listaPendientes(base, est);
    }
    caja.innerHTML = `${tira}${barra}${avisos.join('')}${lista}`;
  }
  function listaPendientes(lista, est) {
    if (!lista.length) return `<div class="fin-tcard">${vacio(est === 'pendientes' ? 'No hay cuotas pendientes' : est === 'completados' ? 'Todavía no hay cuotas cobradas' : 'Nadie marcado como "no paga"', est === 'pendientes' ? 'Las cuotas salen del CRM: se cargan solas con "Cargar cierre" o a mano en Ventas › Cuotas.' : '')}</div>`;
    const grupos = est === 'pendientes'
      ? [['vencido', 'Vencidos', 'rojo'], ['porvencer', 'Por vencer', 'gold'], ['sinfecha', 'Sin fecha de cobro', 'gris']]
      : est === 'completados' ? [['completado', 'Completados', 'verde']] : [['nopaga', 'No paga', 'rojo']];
    const orden = (a, b) => (a.vence || '9999').localeCompare(b.vence || '9999') || b.falta - a.falta;
    return `<div class="fin-tcard fin-pp">${grupos.map(([g, t, c]) => {
      const l = lista.filter(p => p.grupo === g).sort(orden);
      if (!l.length) return '';
      return `<div class="fin-pp-g c-${c}">${E(t)} · ${l.length}</div>${l.map(filaPendiente).join('')}`;
    }).join('')}</div>`;
  }
  function filaPendiente(p) {
    const i = A(p.key);
    const fecha = p.vence ? `<b>${Number(p.vence.slice(8, 10))}</b><span>${E(UI_MESES_C[Number(p.vence.slice(5, 7)) - 1])}</span>` : '<b>—</b><span>s/f</span>';
    const venc = p.grupo === 'vencido' ? `<span class="fin-rojo">Venció hace ${p.dias} día${p.dias === 1 ? '' : 's'}</span>`
      : p.grupo === 'porvencer' ? `<span>${p.dias === 0 ? 'Vence hoy' : `Vence en ${-p.dias} día${p.dias === -1 ? '' : 's'}`}</span>`
      : p.grupo === 'sinfecha' ? '<span>Sin fecha de cobro</span>'
      : p.grupo === 'nopaga' ? '<span class="fin-rojo">No paga</span>'
      : `<span class="fin-verde">${E(p.situacion || 'Cobrado')}</span>`;
    const sub = [venc, p.closer ? E(p.closer) : '', `CRM de ${E(mesLargo(p.mes))}`, p.nota ? `<span data-tip="${E('Notas\n' + p.nota)}">${uiIco('info', 13)}</span>` : ''].filter(Boolean).join(' · ');
    const abono = p.abono > 0 && p.estado === 'pendiente' && p.total > 0 ? `<span class="fin-pp-ab" data-tip="${E(`${p.nombre} · ${p.etiqueta}\nAbonó ${MON()} ${uiNum(p.abono)} de ${MON()} ${uiNum(p.total)} · ${pct1(Math.min(100, p.abono / p.total * 100))}\nFalta ${MON()} ${uiNum(p.falta)}`)}"><i style="width:${Math.min(100, p.abono / p.total * 100).toFixed(0)}%"></i></span><small class="fin-verde">abonó ${MON()} ${E(uiNum(p.abono))}</small>` : '';
    const acc = p.estado === 'pendiente'
      ? `<button type="button" class="fin-cobrar" onclick="finPpCobrar(${i})">${ico('monedas', 14)}Cobrar</button>
        <span class="fin-pp-acc"><button type="button" data-tip="Marcar que no paga" onclick="finPpNoPaga(${i})">${ico('prohibido', 17)}</button></span>`
      : p.estado === 'nopaga' ? `<span class="fin-pp-acc"><button type="button" class="fin-btn-sm" onclick="finPpVolver(${i})">Volver a pendientes</button></span>` : '';
    return `<div class="fin-pp-f fin-pg-${p.grupo}">
      <div class="fin-pp-fecha">${fecha}</div>
      <div class="fin-pp-t"><div><b>${E(p.nombre || 'Sin nombre')}</b><em>${E(p.etiqueta)}</em></div><small>${sub}</small></div>
      <div class="fin-pp-m"><b>${MON()} ${E(uiNum(p.estado === 'pendiente' ? p.falta : p.monto))}</b>${abono}</div>
      ${acc}
    </div>`;
  }
  function resumenCobranza(todos) {
    const g = {};
    todos.forEach(p => {
      const k = p.closer || 'Sin closer';
      const x = g[k] = g[k] || { k, cobrar: 0, vencido: 0, nopaga: 0, cobrado: 0, n: 0 };
      if (p.estado === 'pendiente') { x.cobrar += p.falta; if (p.grupo === 'vencido') x.vencido += p.falta; }
      else if (p.estado === 'nopaga') x.nopaga += p.falta;
      x.cobrado += p.abono;   // también lo cobrado de una traída antes de traerla
      if (p.estado !== 'traida') x.n++;
    });
    const filas = Object.values(g).sort((a, b) => b.cobrar - a.cobrar);
    const tot = filas.reduce((a, x) => ({ cobrar: a.cobrar + x.cobrar, vencido: a.vencido + x.vencido, nopaga: a.nopaga + x.nopaga, cobrado: a.cobrado + x.cobrado, n: a.n + x.n }), { cobrar: 0, vencido: 0, nopaga: 0, cobrado: 0, n: 0 });
    const u = (n) => n ? `${MON()} ${uiNum(n)}` : '—';
    return `<div class="fin-tcard">${tabla([
      { t: 'Closer', f: x => x.total ? '<b class="fin-lead">Total</b>' : `<div class="fin-miembro">${avatar(x.k)}<b>${E(x.k)}</b></div>` },
      { t: 'Cuotas', al: 'der', f: x => uiNum(x.n) },
      { t: 'Por cobrar', al: 'der', f: x => `<b class="fin-oro">${u(x.cobrar)}</b>` },
      { t: 'Vencido', al: 'der', f: x => `<span class="fin-rojo">${u(x.vencido)}</span>` },
      { t: 'No paga', al: 'der', f: x => `<span class="fin-rojo">${u(x.nopaga)}</span>` },
      { t: 'Cobrado', al: 'der', f: x => `<span class="fin-verde">${u(x.cobrado)}</span>` },
    ], filas.concat(filas.length > 1 ? [Object.assign({ k: 'Total', total: true }, tot)] : []), { vacio: 'No hay cuotas cargadas' })}</div>
      <p class="fin-fuentes">Cobrado = lo que dice la columna "Monto cobrado" de cada cuota del CRM.</p>`;
  }
  window.finPpEstado = (e) => { FIN.sub.pend = e; ss.set('sub', FIN.sub); pintarPendientes(); };
  window.finPpFiltro = (k, v) => { FIN.ppF[k] = v; pintarPendientes(); };
  window.finPpBuscar = (v) => {
    FIN.ppF.buscar = v; pintarPendientes();
    const inp = document.querySelector('.fin-bar-pp input[type=search]'); if (inp) { inp.focus(); inp.setSelectionRange(v.length, v.length); }
  };
  const ppItem = (k) => pendientes().find(x => x.key === k);
  // cobrar y "no paga" se escriben en la cuota del CRM (con su versión: si alguien la cambió en el medio, se avisa)
  async function pedirCrm(metodo, cuerpo, qs = '') {
    const r = await fetch('/api/crm' + qs, { method: metodo, cache: 'no-store', headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  async function guardarCrm(registro, base, ok) {
    try { await pedirCrm('POST', { accion: 'guardar', registro, base }); uiModalCerrar(); uiToast(ok, 'ok'); }
    catch (e) { uiToast('No pude guardar: ' + e.message, 'mal'); }
    await recargar();
  }
  const guardarCuota = (p, campos, ok) => guardarCrm(Object.assign({}, campos, { id: p.id, tipo: 'cuota', mes: p.mes }), p.v, ok);
  window.finPpCobrar = (k) => {
    const p = ppItem(k); if (!p) return;
    const donde = p.mes < mesHoy() ? `se trae al CRM de ${mesLargo(mesHoy())}: la plata que entra hoy es de este mes` : `se marca en el CRM de ${mesLargo(p.mes)}`;
    uiModalAbrir({
      titulo: `Cobrar a ${p.nombre || 'sin nombre'}`, sub: `${p.etiqueta} · falta ${MON()} ${uiNum(p.falta)} · ${donde}`, ancho: '460px',
      cuerpo: `<label class="ui-campo"><span>Monto que entró (${MON()})</span><input id="finCb-m" type="number" step="any" min="0" value="${E(p.falta)}"></label>
        <p class="fin-nota">Si entra menos de lo que falta, la cuota queda como "Pago Dividido" y el resto sigue pendiente.</p>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Marcar cobrado', onclick: `finPpCobrarOk(${J(k)})`, pri: true }],
    });
  };
  window.finPpCobrarOk = async (k) => {
    const p = ppItem(k); if (!p) return;
    const m = n0(($('finCb-m') || {}).value);
    if (!(m > 0)) { uiToast('Poné el monto que entró', 'mal'); return; }
    // Una cuota de un mes que ya pasó se trae al mes en curso (como "Traerlas a este mes" de Ventas) y se cobra ahí: si
    // no, la plata que entra hoy sumaría al cash de un mes cerrado. La original queda en su mes y deja de contar.
    if (p.mes < mesHoy()) {
      try {
        // releer el mes: si alguien ya la trajo (doble toque, otra persona), no se duplica
        const ya = ((await pedirCrm('GET', null, '?mes=' + mesHoy())).registros || []).some(r => r.de === p.id);
        if (ya) { uiModalCerrar(); uiToast('Ya estaba traída a este mes: cobrala desde ahí', 'mal'); await recargar(); return; }
      } catch (e) { uiToast('No pude revisar el mes: ' + e.message, 'mal'); return; }
      return guardarCrm({ tipo: 'cuota', mes: mesHoy(), nombre: p.nombre, telefono: p.telefono, cuota: p.cuota, fecha: p.vence || '', porCobrar: p.falta, cobrado: r2(m),
        closer: p.closer, situacion: m >= p.falta ? 'Cobrado' : 'Pago Dividido', notas: p.nota, de: p.id }, undefined, `${p.nombre || 'Cuota'}: cobrado ✓ (traída a ${mesLargo(mesHoy())})`);
    }
    const cobrado = r2(p.abono + m);
    await guardarCuota(p, { cobrado, situacion: cobrado >= p.total ? 'Cobrado' : 'Pago Dividido' }, `${p.nombre || 'Cuota'}: cobrado ✓`);
  };
  window.finPpNoPaga = (k) => {
    const p = ppItem(k); if (!p) return;
    uiModalAbrir({
      titulo: `${p.nombre || 'Sin nombre'} no paga`, sub: 'Sale de "Por cobrar" y pasa a No paga (en el CRM queda la situación "No Paga"). Se puede volver atrás.', ancho: '460px',
      cuerpo: `<label class="ui-campo"><span>Motivo</span><textarea id="finNp-m" placeholder="Qué pasó"></textarea></label>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Marcar no paga', onclick: `finPpNoPagaOk(${J(k)})`, pri: true }],
    });
  };
  window.finPpNoPagaOk = async (k) => {
    const p = ppItem(k); if (!p) return;
    const motivo = String(($('finNp-m') || {}).value || '').trim();
    await guardarCuota(p, Object.assign({ situacion: 'No Paga' }, motivo ? { notas: [p.nota, `No paga: ${motivo}`].filter(Boolean).join('\n') } : {}), 'Marcado como no paga');
  };
  window.finPpVolver = (k) => { const p = ppItem(k); if (p) guardarCuota(p, { situacion: 'Por Cobrar' }, 'Volvió a pendientes'); };

  /* ════════════════════════════════ LIQUIDACIONES ════════════════════════════════ */
  PINTORES.liquidaciones = async function () {
    const r = uiPerRango(PER_LIQ), mes = mesDe(r.desde);
    const L = liquidacion(mes);
    FIN.liq = L;
    $('finTab').innerHTML = `<div class="fin-bar"><div class="fin-bar-g"><span class="fin-solo-nav">${uiPeriodo(PER_LIQ, 'finLiqPeriodo', { modo: 'mes', modos: ['mes'] })}</span>
        ${seg([{ id: 'pendientes', t: 'Pendientes' }, { id: 'pagados', t: 'Pagados' }, { id: 'todos', t: 'Todos' }], FIN.liqF, 'finLiqFiltro', 'mon')}</div>
      <div class="fin-bar-g"><button type="button" class="fin-btn2" onclick="finComisiones()">${ico('sliders', 16)}Comisión de cada closer</button></div></div>
      ${cuerpoLiq(L)}`;
  };
  function cuerpoLiq(L) {
    const pagos = ((FIN.datos && FIN.datos.liq) || {})[L.mes] || {};
    L.filas.forEach(f => { f.pagado = pagos[f.key] || null; });
    const filas = L.filas.filter(f => FIN.liqF === 'todos' || (FIN.liqF === 'pagados' ? f.pagado : !f.pagado));
    const aPagar = L.filas.filter(f => !f.pagado).reduce((a, f) => a + f.total, 0);
    const pagado = L.filas.filter(f => f.pagado).reduce((a, f) => a + n0(f.pagado.monto), 0);
    const $0 = (n) => `${MON()} ${uiNum(n, 2)}`;
    const tira = `<div class="fin-tira">
      <div class="fin-tira-c"><span class="fin-tira-l">A pagar</span><div class="fin-tira-v"><b>${E($0(aPagar))}</b></div></div>
      <div class="fin-tira-c"><span class="fin-tira-l">Pagado</span><div class="fin-tira-v verde"><b>${E($0(pagado))}</b></div></div>
      <div class="fin-tira-c" data-tip="${E(`Cash del mes\nLo cobrado en ${nombreMes(L.mes)} según el CRM: ventas nuevas + cuotas cobradas`)}"><span class="fin-tira-l">Cash del mes</span><div class="fin-tira-v"><b>${E($0(L.cash))}</b></div></div>
      <div class="fin-tira-c" data-tip="${E(`Comisiones del mes\n${$0(L.totalComisiones)}${L.cash ? ` · ${pct1(L.totalComisiones / L.cash * 100)} del cash` : ''}`)}"><span class="fin-tira-l">Comisiones</span><div class="fin-tira-v"><b>${L.filas.length}</b></div></div>
    </div>`;
    const tablaH = tabla([
      { t: 'Closer', f: f => `<div class="fin-miembro">${avatar(f.nombre)}<div><b>${E(f.nombre)}</b><small>${E(f.sub)}</small></div></div>` },
      { t: 'Cobrado', al: 'der', f: f => `<span class="fin-sec">${E($0(f.base))}</span>` },
      { t: '%', al: 'der', f: f => `<span class="fin-sec" data-tip="${E(f.propio ? 'Comisión propia de este closer' : 'La comisión por defecto: no tiene una propia')}">${E(pctEq(f.pct))}${f.propio ? '' : ' <small>(por defecto)</small>'}</span>` },
      { t: 'Comisión', al: 'der', f: f => `<span class="fin-tot"><small>${MON()}</small> <b>${E(uiNum(f.total, 2))}</b></span>${f.pagado && Math.abs(n0(f.pagado.monto) - f.total) > 0.5 ? `<small class="fin-ambar" data-tip="${E(`Pagado distinto a lo de hoy\nSe pagó ${MON()} ${uiNum(f.pagado.monto, 2)}; con los datos de hoy da ${MON()} ${uiNum(f.total, 2)}`)}">pagado ${MON()} ${E(uiNum(f.pagado.monto))}</small>` : ''}` },
      { t: '', f: f => `<button type="button" class="fin-est-b" onclick="finLiqEstado(${A(f.key)})" title="${f.pagado ? 'Pagado el ' + E(uiFechaCorta(f.pagado.fecha || hoyS())) + ' · tocá para deshacer' : 'Marcar como pagado'}">${f.pagado ? estadoDot('Pagado', 'verde') : estadoDot('Pendiente', 'ambar')}</button>` },
      { t: '', al: 'der', f: f => (f.pagado && Math.abs(n0(f.pagado.monto) - f.total) > 0.5 ? `<span class="ui-acc"><button type="button" title="Actualizar el monto pagado al de hoy" onclick="finLiqResync(${A(f.key)})">${uiIco('refrescar', 16)}</button></span>` : '') },
    ], filas, { clase: 'liq', vacio: FIN.liqF === 'pagados' ? 'Todavía no se marcó ningún pago' : 'No hay comisiones para este mes', vacioTexto: FIN.liqF === 'pagados' ? '' : 'Salen de lo cobrado en el mes, a nombre del closer de cada venta.' });
    const pie = `<details class="fin-como"${FIN.comoAbierto ? ' open' : ''} ontoggle="finComo(this.open)"><summary>${uiIco('info', 14)} De dónde sale cada número</summary><div>
      <p>Sale del CRM de Ventas de ${E(nombreMes(L.mes))}: lo que pagó cada venta (en la call y en seguimiento) y las cuotas cobradas, cada cosa a nombre del closer que la cerró. Se cobraron <b>${MON()} ${uiNum(L.cash)}</b>${L.sinCloser > 1 ? `; hay <b>${MON()} ${uiNum(L.sinCloser)}</b> sin closer, que no pagan comisión` : ''}.</p>
      <p>La comisión es el % de cada closer sobre lo que cobró (sin uno propio, el de por defecto: ${E(pctEq(n0(((FIN.datos || {}).comisiones || {}).def ?? 10)))}). Se cambia en "Comisión de cada closer". Marcar "Pagado" guarda el monto de ese momento: si después cambia el CRM, la fila lo avisa.</p></div></details>`;
    return `${tira}<div class="fin-tcard">${tablaH}</div>${pie}`;
  }
  window.finLiqPeriodo = () => pintar(true);
  window.finComo = (abierto) => { FIN.comoAbierto = !!abierto; };
  window.finLiqFiltro = (v) => { FIN.liqF = v; ss.set('liqF', v); pintar(true); };
  const liqFila = (k) => ((FIN.liq && FIN.liq.filas) || []).find(f => f.key === k);
  async function liqGuardar(f, pago, ok) {
    try {
      const j = await api('POST', { action: 'liqpago', mes: FIN.liq.mes, closer: f.nombre, pago });
      FIN.datos.liq = Object.assign({}, FIN.datos.liq, { [FIN.liq.mes]: j.liq });
      uiModalCerrar(); uiToast(ok, 'ok'); pintar(true);
    } catch (e) { uiToast('No pude guardar: ' + e.message, 'mal'); }
  }
  window.finLiqEstado = (k) => {
    const f = liqFila(k), L = FIN.liq; if (!f || !L) return;
    if (f.pagado) {
      if (confirm(`¿Volver a pendiente la comisión de ${f.nombre}?`)) liqGuardar(f, null, 'Volvió a pendiente');
      return;
    }
    uiModalAbrir({
      titulo: `Pagar a ${f.nombre}`, sub: `${nombreMes(L.mes)} · ${pctEq(f.pct)} de ${MON()} ${uiNum(f.base, 2)}`, ancho: '460px',
      cuerpo: `<div class="ui-campos" style="--n:2"><label class="ui-campo"><span>Monto pagado (${MON()})</span><input id="finLq-m" type="number" step="any" min="0" value="${E(r2(f.total))}"></label>
        <label class="ui-campo"><span>Fecha</span><input id="finLq-f" type="date" value="${hoyS()}"></label></div>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Marcar pagado', onclick: `finLiqPagar(${J(k)})`, pri: true }],
    });
  };
  window.finLiqPagar = (k) => { const f = liqFila(k); if (f) liqGuardar(f, { monto: n0($('finLq-m').value), fecha: $('finLq-f').value || hoyS() }, 'Marcado como pagado'); };
  window.finLiqResync = (k) => {
    const f = liqFila(k); if (!f || !f.pagado) return;
    if (confirm(`El monto pagado a ${f.nombre} fue ${MON()} ${uiNum(f.pagado.monto, 2)} y hoy da ${MON()} ${uiNum(f.total, 2)}. ¿Actualizar el pagado al monto de hoy?`)) liqGuardar(f, { monto: r2(f.total), fecha: f.pagado.fecha }, 'Actualizado');
  };
  // la comisión de cada closer: una por defecto y, si hace falta, una propia para alguno
  window.finComisiones = () => {
    const c = (FIN.datos && FIN.datos.comisiones) || { def: 10, pct: {} };
    const closers = [...new Set([...Object.keys(c.pct || {}), ...cobros().map(x => x.closer)].filter(Boolean).map(x => String(x).trim()))]
      .filter((x, i, a) => a.findIndex(y => norm(y) === norm(x)) === i).sort((a, b) => a.localeCompare(b));
    FIN.comCl = closers;
    uiModalAbrir({
      titulo: 'Comisión de cada closer', sub: 'El % sobre lo que cobró cada closer en el mes (sus ventas y las cuotas de sus clientes).', ancho: '520px',
      cuerpo: `<div class="fin-fees">
        <label class="fin-fee-f"><span><b>Por defecto</b><br><small>para los que no tienen una propia</small></span><span class="fin-inp-suf"><input type="number" step="0.01" min="0" max="100" id="finCm-def" value="${E(c.def ?? 10)}"><em>%</em></span></label>
        ${closers.map((n, i) => { const p = pctPropio(n); return `<label class="fin-fee-f"><span>${E(n)}</span><span class="fin-inp-suf"><input type="number" step="0.01" min="0" max="100" id="finCm${i}" value="${p == null ? '' : E(p)}" placeholder="${E(c.def ?? 10)}"><em>%</em></span></label>`; }).join('')}
      </div><p class="fin-nota">Vacío = usa la de por defecto. Los closers aparecen cuando tienen cobros en el CRM.</p>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar', onclick: 'finComisionesGuardar()', pri: true }],
    });
  };
  window.finComisionesGuardar = async () => {
    const pct = {};
    (FIN.comCl || []).forEach((n, i) => { const v = $('finCm' + i); if (v && v.value !== '' && isFinite(Number(v.value))) pct[n] = Number(v.value); });
    const def = $('finCm-def').value;
    try {
      const j = await api('POST', { action: 'comisiones', comisiones: { def: def === '' ? 10 : Number(def), pct } });
      FIN.datos.comisiones = j.comisiones;
      uiModalCerrar(); uiToast('Comisiones guardadas', 'ok'); pintar(true);
    } catch (e) { uiToast('No pude guardar: ' + e.message, 'mal'); }
  };

  /* ════════════════════════════════ navegación ════════════════════════════════ */
  async function recargar() {
    try { await cargar(); FIN.errFin = ''; FIN.actualizado = new Date(); cabecera(); } catch (e) { uiToast('No pude releer el CRM: ' + e.message, 'mal'); }
    await pintar(true);
  }
  window.finTabIr = (t) => { FIN.tab = t; ss.set('tab', t); pintar(false); };
  window.finPeriodo = () => pintar(true);
  window.finActualizar = () => { uiToast('Releyendo el CRM y Meta Ads…'); return window.renderFinanzas(true); };
  // para entrar desde otra pantalla directo a una pestaña: finIr('ventas','pendientes')
  window.finIr = (tab, sub) => {
    uiModalCerrar();
    FIN.tab = tab; ss.set('tab', tab);
    if (sub && tab === 'ventas') { FIN.sub.ventas = sub; ss.set('sub', FIN.sub); }
    if ((location.hash || '') !== '#finanzas') location.hash = '#finanzas'; else pintar(false);
  };

  /* ════════════════════════════════ la dona: resaltado ════════════════════════════════
     Un solo manejador delegado, así repintar con innerHTML no duplica nada. Pasar por un sector o por su fila de la
     leyenda: ese sector se agranda, el resto se apaga y el centro muestra su monto; al salir vuelve el total. */
  if (!window.__finGraficos) {
    window.__finGraficos = true;
    const donaReset = (w) => {
      w.classList.remove('hov');
      w.querySelectorAll('[data-seg].on').forEach(x => x.classList.remove('on'));
      const c = w.querySelector('.fin-dona-c');
      if (c && c.dataset.orig != null) { c.innerHTML = c.dataset.orig; delete c.dataset.orig; }
    };
    document.addEventListener('mouseover', (e) => {
      const sg = e.target && e.target.closest && e.target.closest('.fin-dona-w [data-seg]');
      document.querySelectorAll('.fin-dona-w.hov').forEach(w => { if (!sg || !w.contains(sg)) donaReset(w); });
      if (!sg) return;
      const w = sg.closest('.fin-dona-w'), k = sg.dataset.seg;
      w.classList.add('hov');
      w.querySelectorAll('[data-seg]').forEach(x => x.classList.toggle('on', x.dataset.seg === k));
      const c = w.querySelector('.fin-dona-c');
      if (c && sg.dataset.cv != null) {
        if (c.dataset.orig == null) c.dataset.orig = c.innerHTML;
        c.innerHTML = `<b>${E(sg.dataset.cv)}</b><span>${E(sg.dataset.cl || '')}</span>`;
      }
    });
    // el tooltip universal no queda pegado arriba de lo que cambió: casi todo clic de Finanzas abre un modal o repinta
    const enFinanzas = () => { const v = document.querySelector('.view.on'); return !!(v && v.id === 'finanzas'); };
    const tipFuera = () => { if (typeof uiTipOcultar === 'function') uiTipOcultar(); };
    document.addEventListener('click', () => { if (enFinanzas()) tipFuera(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && enFinanzas()) tipFuera(); });
  }

  /* ════════════════════════════════ enganche ════════════════════════════════
     shell.js llama a la pantalla dos veces por cambio de vista (route envuelto + hashchange): las llamadas en vuelo se
     juntan en una. Cada entrada relee el CRM, así lo que se cargó en Ventas se ve acá enseguida. */
  let EN_CURSO = null;
  window.renderFinanzas = function (force) {
    if (EN_CURSO && !force) return EN_CURSO;
    const p = render(force).catch(e => {
      console.warn('[finanzas]', e);
      const c = $('finTab'); if (c) c.innerHTML = uiAviso({ tipo: 'rojo', texto: 'No pude cargar Finanzas: ' + (e.message || e) });
    }).finally(() => { if (EN_CURSO === p) EN_CURSO = null; });
    EN_CURSO = p;
    return p;
  };
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.finanzas = function () {
    if (typeof YO !== 'undefined' && !YO) return;   // todavía no hay sesión: boot() la vuelve a llamar
    cabecera();
    return window.renderFinanzas();
  };
})();
