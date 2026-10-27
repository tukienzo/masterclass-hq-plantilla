/* KPIs — portado de "Operaciones › KPIs" del hub original (calcado de la referencia de diseño), solo
 * para masterclass: los números de un webinar, de todo el equipo o de un closer.
 *
 * Cabecera: el webinar, "Configurar" (qué tarjetas ver) y "Editar la proyección". Debajo, las pestañas por área con
 * su contador, el filtro de closer y la grilla de tarjetas de la referencia: micro-etiqueta, la pastilla de % del objetivo, la
 * chincheta para fijarla en el Inicio, el valor grande y el pie "Objetivo: X". La barrita marca el ritmo esperado a hoy
 * (de la captación o de la ventana de cierre) y, si el número sale de agendas, la tarjeta se toca y las muestra.
 *
 * Los objetivos son la proyección del webinar (pantalla Webinar): no hay un segundo lugar donde cargarlos. Por closer
 * se comparan las tasas; las cantidades proyectadas son de todo el equipo. Las fijadas en el Inicio van en db
 * `kpis-fijados` (las ve todo el equipo). Las cuentas son las del núcleo del tablero (window.TAB, en inicio.js).
 * Afuera, por ser del hub original: Personal, Setter, Contenido y la Proyección del mes (tareas, setters, Instagram y
 * su CRM), el Simulador y la Calculadora con Ads (la proyección de Webinar ya hace la cuenta al revés) y la constancia.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = () => window.TAB;
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escribir(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  const TABS = [['captacion', 'Captación'], ['agendas', 'Agendas'], ['closer', 'Closer'], ['negocio', 'Negocio'], ['equipo', 'Equipo']];
  const ST = { tab: TABS.some((t) => t[0] === leer('mhqkpis:tab')) ? leer('mhqkpis:tab') : 'captacion', closer: '' };
  let FIJ = null;   // las fijadas en el Inicio (Set de ids)
  const ocultos = () => { try { return new Set(JSON.parse(leer('mhqkpis:ocultos') || '[]')); } catch (e) { return new Set(); } };
  const puedeVer = (v) => { try { return vistasDe(perfilEfectivo()).includes(v); } catch (e) { return true; } };

  /* ── lo de operaciones.js del hub original (OPS) que usa esta pantalla ── */
  const CHINCHETA = '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>';
  const icoPin = () => `<svg class="ui-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CHINCHETA}</svg>`;
  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const fechaDMA = (s) => { const f = String(s || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return ''; const [y, m, d] = f.split('-').map(Number); return `${d}/${m}/${y}`; };
  function seg(opciones, activa, onclick) {
    return `<div class="op-seg op-seg-s" role="tablist">${opciones.map((o) => `<button type="button" role="tab" class="${o.id === activa ? 'on' : ''}" onclick="${uiEsc(onclick)}('${uiEsc(o.id)}')"><span>${uiEsc(o.texto)}</span>${o.n != null ? `<em>${uiEsc(o.n)}</em>` : ''}</button>`).join('')}</div>`;
  }

  /* ════════ datos ════════ */
  const plata = (n, dec, moneda) => T().plata(n, dec, moneda);
  const fmt$ = (v, moneda) => plata(v, Math.abs(v) < 10 && v !== 0 ? 2 : 0, moneda);
  const pc1 = (x) => T().pc1(x);
  const cDe = (x) => String(x.Closer || '').trim();
  const contarPor = (rs, fn) => { const c = {}; rs.forEach((x) => { const k = fn(x) || 'Sin dato'; c[k] = (c[k] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  const desglose = (pares, max = 4) => pares.slice(0, max).map(([k, v]) => `${k} ${uiNum(v)}`).join(' · ') + (pares.length > max ? ` · otros ${uiNum(pares.slice(max).reduce((s, x) => s + x[1], 0))}` : '');
  const porEstado = (rs) => desglose(contarPor(rs, (x) => x.Estado || 'Sin estado'));
  const vivas = (rs) => rs.filter((x) => x.Estado !== 'Cancelada' && x.Estado !== 'Descalificada');
  const resueltas = (rs) => rs.filter((x) => x.Estado === 'Presentada' || x.Estado === 'Cerrada');
  const conAsistencia = (rs) => rs.filter((x) => ['Presentada', 'Cerrada', 'No-show'].includes(x.Estado));
  const conMonto = (rs) => rs.filter((x) => x.Estado === 'Cerrada' && T().monto(x) > 0);
  const FA = (rs, fecha) => ({ tipo: 'agendas', rs, fecha });     // fecha: 'call' (día de la llamada) | 'alta' (día en que agendó)
  const asisTxt = (m) => `${uiNum(m.asis)} de ${uiNum(m.asis + m.ns)} con resultado se presentaron · ${uiNum(m.ns)} no-show`;
  const cierreTxt = (m) => `${uiNum(m.cierres)} ${m.cierres === 1 ? 'cierre' : 'cierres'} de ${uiNum(m.asis)} llamadas presentadas`;
  const nada = (sub) => ({ v: null, sub });
  const mismaMoneda = (m) => !m || m.toUpperCase() === ((window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD').toUpperCase();
  // todo lo de un webinar (TAB.estado) y las agendas de un closer, si se eligió uno
  function contexto(closer) {
    const x = T().estado();
    if (!x) return null;
    const rows = closer ? x.rows.filter((r) => norm(cDe(r)) === norm(closer)) : x.rows;
    return { ...x, todas: x.rows, rows, closer: closer || '', m: closer ? T().metricas(rows, x.h) : x.m, mT: x.m, asis: T().asistentes(x.id) };
  }

  /* ════════ catálogo ════════
     tipo: n · n1 · pct · plata · x (ROAS). suma = se acumula (lleva la marca del ritmo) en su fase: 'cap' (del primer
     registro al vivo) o 'cierre' (la ventana de cierre). obj(c) = el objetivo, sacado de la proyección. */
  function catalogo() {
    const L = [], k = (o) => L.push(o);
    const deTodos = (c) => (c.closer ? 'Es de todo el webinar: no depende del closer' : '');
    const ad = (fn) => (c) => (c.g === undefined ? nada('…') : !c.g ? nada('Meta Ads sin conectar o sin respuesta') : fn(c, c.g));
    const cant = (fn) => (c) => (c.closer ? null : fn(c));      // las cantidades proyectadas son de todo el equipo (soloEquipo)
    const objCash = (c) => (c.P.cashObjetivo != null ? c.P.cashObjetivo : c.P.cash);
    // Captación
    k({ id: 'cap-reg', tab: 'captacion', et: 'Registros', tipo: 'n', suma: true, fase: 'cap', obj: (c) => c.e.registros,
      calc: (c) => ({ v: c.reg.total, det: [`${uiNum(((c.reg.porDia || {})[c.h] || {}).n || 0)} hoy · ${uiNum(c.reg.calificados)} calificados`, deTodos(c)] }) });
    k({ id: 'cap-cal', tab: 'captacion', et: 'Calificados', tipo: 'n', suma: true, fase: 'cap', obj: (c) => c.P.calificados,
      calc: (c) => ({ v: c.reg.calificados, det: [`de ${uiNum(c.reg.respondieron)} que contestaron las preguntas`, deTodos(c)] }) });
    k({ id: 'cap-pcal', tab: 'captacion', et: '% calificados', tipo: 'pct', obj: (c) => c.e.pctCalificados, ayuda: 'Calificados ÷ registros',
      calc: (c) => (c.reg.respondieron && c.reg.total ? { v: 100 * c.reg.calificados / c.reg.total, det: `${uiNum(c.reg.calificados)} de ${uiNum(c.reg.total)} registros` } : nada('Nadie contestó las preguntas todavía')) });
    k({ id: 'cap-gasto', tab: 'captacion', et: 'Inversión en ads', tipo: 'plata', suma: true, fase: 'cap', presu: true, obj: (c) => c.e.presupuesto, ayuda: 'El objetivo es el presupuesto de la proyección',
      calc: ad((c, g) => ({ v: g.gasto, moneda: g.moneda, det: `Meta, del ${T().fechaTxt(g.desde)} al ${T().fechaTxt(g.hasta)}` })) });
    k({ id: 'cap-cpl', tab: 'captacion', et: 'Costo por registro', tipo: 'plata', menos: true, obj: (c) => c.P.cpl,
      calc: ad((c, g) => (c.reg.total ? { v: g.gasto / c.reg.total, moneda: g.moneda, det: `${plata(g.gasto, 0, g.moneda)} ÷ ${uiNum(c.reg.total)} registros` } : nada('Sin registros'))) });
    k({ id: 'cap-cplcal', tab: 'captacion', et: 'CPL calificado', tipo: 'plata', menos: true, obj: (c) => c.P.cplCalificado,
      calc: ad((c, g) => (c.reg.calificados ? { v: g.gasto / c.reg.calificados, moneda: g.moneda, det: `${plata(g.gasto, 0, g.moneda)} ÷ ${uiNum(c.reg.calificados)} calificados` } : nada('Sin calificados'))) });
    k({ id: 'cap-asis', tab: 'captacion', et: 'Asistentes al vivo', tipo: 'n', obj: (c) => c.P.asistentes, ayuda: 'Se carga a mano: tocá la tarjeta', abre: 'asistencia',
      calc: (c) => (c.asis == null ? nada('Sin cargar: tocá la tarjeta') : { v: c.asis, det: c.reg.total ? `${pc1(100 * c.asis / c.reg.total)} de los registros` : '' }) });
    k({ id: 'cap-pasis', tab: 'captacion', et: '% de registros en el vivo', tipo: 'pct', obj: (c) => c.e.pctAsistencia,
      calc: (c) => (c.asis == null ? nada('Faltan los asistentes al vivo') : c.reg.total ? { v: 100 * c.asis / c.reg.total, det: `${uiNum(c.asis)} de ${uiNum(c.reg.total)} registros` } : nada('Sin registros')) });
    // Agendas
    k({ id: 'ag-agendas', tab: 'agendas', et: 'Agendas', tipo: 'n', suma: true, fase: 'cierre', soloEquipo: true, obj: cant((c) => c.P.agendas), filas: (c) => FA(c.rows, 'alta'),
      calc: (c) => ({ v: c.rows.length, det: [porEstado(c.rows), c.m.porVenir ? `${uiNum(c.m.porVenir)} con la llamada por venir` : ''] }) });
    k({ id: 'ag-conv', tab: 'agendas', et: '% de registros que agenda', tipo: 'pct', obj: (c) => c.e.pctAgenda, ayuda: 'Agendas ÷ registros del webinar',
      calc: (c) => (c.reg.total ? { v: 100 * c.rows.length / c.reg.total, det: `${uiNum(c.rows.length)} agendas de ${uiNum(c.reg.total)} registros` } : nada('Sin registros')) });
    k({ id: 'ag-show', tab: 'agendas', et: 'Show-up', tipo: 'pct', obj: (c) => c.e.pctShow, filas: (c) => FA(conAsistencia(c.rows), 'call'), ayuda: 'Presentadas ÷ (presentadas + no-show)',
      calc: (c) => (c.m.show == null ? nada('Sin llamadas con resultado') : { v: c.m.show, det: asisTxt(c.m) }) });
    k({ id: 'ag-cpa', tab: 'agendas', et: 'Costo por agenda', tipo: 'plata', menos: true, obj: (c) => c.P.costoAgenda,
      calc: ad((c, g) => (c.todas.length ? { v: g.gasto / c.todas.length, moneda: g.moneda, det: [`${plata(g.gasto, 0, g.moneda)} ÷ ${uiNum(c.todas.length)} agendas`, deTodos(c)] } : nada('Sin agendas'))) });
    // Closer
    k({ id: 'clo-cierre', tab: 'closer', et: 'Tasa de cierre', tipo: 'pct', obj: (c) => c.e.pctCierre, filas: (c) => FA(resueltas(c.rows), 'call'), ayuda: 'Cerradas ÷ presentadas',
      calc: (c) => (c.m.cierrePct == null ? nada('Sin llamadas presentadas') : { v: c.m.cierrePct, det: cierreTxt(c.m) }) });
    k({ id: 'clo-pres', tab: 'closer', et: 'Llamadas presentadas', tipo: 'n', suma: true, fase: 'cierre', soloEquipo: true, obj: cant((c) => c.P.llamadas), filas: (c) => FA(resueltas(c.rows), 'call'),
      calc: (c) => ({ v: c.m.asis, det: c.m.show != null ? `show-up ${pc1(c.m.show)} · ${uiNum(c.m.ns)} no-show` : '' }) });
    k({ id: 'clo-cierres', tab: 'closer', et: 'Cierres', tipo: 'n', suma: true, fase: 'cierre', soloEquipo: true, obj: cant((c) => c.P.ventas), filas: (c) => FA(c.rows.filter((x) => x.Estado === 'Cerrada'), 'call'),
      calc: (c) => ({ v: c.m.cierres, det: c.m.asis ? `de ${uiNum(c.m.asis)} llamadas presentadas · ${pc1(c.m.cierrePct)} de cierre` : '' }) });
    k({ id: 'clo-ticket', tab: 'closer', et: 'Ticket promedio', tipo: 'plata', obj: (c) => c.e.ticket, filas: (c) => FA(conMonto(c.rows), 'call'),
      calc: (c) => (c.m.ticket == null ? nada('Sin cierres con monto') : { v: c.m.ticket, det: `${uiNum(c.m.conMonto)} ${c.m.conMonto === 1 ? 'cierre' : 'cierres'} con monto · ${fmt$(c.m.cash)} en total` }) });
    k({ id: 'clo-llamadas', tab: 'closer', et: 'Llamadas agendadas', tipo: 'n', suma: true, fase: 'cierre', filas: (c) => FA(vivas(c.rows), 'call'), ayuda: 'Sin canceladas ni descalificadas',
      calc: (c) => { const rs = vivas(c.rows); return { v: rs.length, det: porEstado(rs) }; } });
    // Negocio
    k({ id: 'neg-cash', tab: 'negocio', et: 'Cash', tipo: 'plata', suma: true, fase: 'cierre', soloEquipo: true, obj: cant(objCash), filas: (c) => FA(conMonto(c.rows), 'call'), ayuda: 'Monto de las agendas Cerradas · el objetivo es presupuesto × ROAS objetivo',
      calc: (c) => ({ v: c.m.cash, det: c.m.cierres ? `${uiNum(c.m.cierres)} ${c.m.cierres === 1 ? 'cierre' : 'cierres'}${c.m.cierres > c.m.conMonto ? ` (${uiNum(c.m.cierres - c.m.conMonto)} sin monto)` : ''}` : 'Sin cierres todavía' }) });
    k({ id: 'neg-roas', tab: 'negocio', et: 'ROAS', tipo: 'x', obj: (c) => c.e.roasObjetivo, ayuda: 'Cash ÷ inversión en ads',
      calc: ad((c, g) => (!g.comparable ? nada(`El gasto está en ${g.moneda}: no se cruza con el cash`) : g.gasto ? { v: c.mT.cash / g.gasto, det: [`${fmt$(c.mT.cash)} ÷ ${fmt$(g.gasto)}`, deTodos(c)] } : nada('Sin gasto'))) });
    k({ id: 'neg-falta', tab: 'negocio', et: 'Falta para el cash objetivo', tipo: 'plata', menos: true,
      calc: (c) => { const o = objCash(c); return o ? { v: Math.max(0, o - c.mT.cash), det: [`Objetivo ${fmt$(o)} − cash ${fmt$(c.mT.cash)}`, deTodos(c)] } : nada('Sin cash objetivo en la proyección'); } });
    k({ id: 'neg-faltan', tab: 'negocio', et: 'Ventas que faltan', tipo: 'n', menos: true,
      calc: (c) => {
        const o = objCash(c), t = c.mT.ticket || c.e.ticket;
        if (!o) return nada('Sin cash objetivo en la proyección');
        if (!t) return nada('Sin ticket: ni cierres con monto ni ticket en la proyección');
        return { v: Math.ceil(Math.max(0, o - c.mT.cash) / t), det: [`${fmt$(Math.max(0, o - c.mT.cash))} que faltan ÷ ticket de ${fmt$(t)}${c.mT.ticket ? '' : ' (el de la proyección)'}`, deTodos(c)] };
      } });
    k({ id: 'neg-cashreg', tab: 'negocio', et: 'Cash por registro', tipo: 'plata', ayuda: 'Cash ÷ registros: cuánto vale cada registro',
      calc: (c) => (c.reg.total ? { v: c.mT.cash / c.reg.total, det: [`${fmt$(c.mT.cash)} ÷ ${uiNum(c.reg.total)} registros`, deTodos(c)] } : nada('Sin registros')) });
    // Equipo: siempre de todo el equipo. "Llamadas" son las vivas (sin canceladas ni descalificadas), como en el hub original.
    const porCloser = (c) => {
      const rs = vivas(c.todas).filter(cDe), pares = contarPor(rs, cDe), caidas = {};
      c.todas.filter((x) => cDe(x) && (x.Estado === 'Cancelada' || x.Estado === 'Descalificada')).forEach((x) => { caidas[cDe(x)] = (caidas[cDe(x)] || 0) + 1; });
      Object.keys(caidas).forEach((n) => { if (!pares.some((p) => p[0] === n)) pares.push([n, 0]); });
      return { tipo: 'closers', rs, pares, caidas, sin: vivas(c.todas).length - rs.length };
    };
    k({ id: 'eqp-closers', tab: 'equipo', et: 'Closers activos', tipo: 'n', obj: (c) => c.P.closers, filas: porCloser, ayuda: 'El objetivo son los closers que pide la proyección para atender las agendas',
      calc: (c) => { const cl = [...new Set(vivas(c.todas).map(cDe).filter(Boolean))]; return { v: cl.length, det: cl.length ? cl.map((n) => n.split(' ')[0]).sort((a, b) => a.localeCompare(b, 'es')).join(', ') : '' }; } });
    k({ id: 'eqp-llamadas', tab: 'equipo', et: 'Llamadas por closer', tipo: 'n1', menos: true, filas: porCloser,
      obj: (c) => (c.e.llamadasPorCloser && c.e.diasLlamadas ? c.e.llamadasPorCloser * c.e.diasLlamadas : null), ayuda: 'El objetivo es el tope: llamadas por closer por día × días de llamadas',
      calc: (c) => {
        const todas = vivas(c.todas), rs = todas.filter(cDe), cl = new Set(rs.map(cDe)), sin = todas.length - rs.length;
        return cl.size ? { v: rs.length / cl.size, det: [`${uiNum(rs.length)} llamadas entre ${uiNum(cl.size)} closers`, sin ? `${uiNum(sin)} sin closer asignado (no cuentan)` : ''] } : nada('Sin llamadas con closer');
      } });
    return L;
  }

  /* ════════ formato y objetivo (los de kpis.js del hub original) ════════ */
  function valorTxt(k, res) {
    if (res.v == null || !isFinite(res.v)) return '—';
    if (k.tipo === 'pct') return uiNum(res.v, 1) + '%';
    if (k.tipo === 'plata') return fmt$(res.v, res.moneda);
    if (k.tipo === 'x') return 'x' + uiNum(res.v, 1);
    if (k.tipo === 'n1') return uiNum(res.v, 1);
    return uiNum(res.v);
  }
  // número comparable con el objetivo: un gasto en otra moneda no se compara con la proyección
  function valorNum(k, res) {
    if (res.v == null || !isFinite(res.v)) return null;
    return k.tipo === 'plata' && !mismaMoneda(res.moneda) ? null : res.v;
  }
  function objetivoTxt(k, o) {
    if (k.tipo === 'pct') return uiNum(o, o % 1 ? 1 : 0) + '%';
    if (k.tipo === 'plata') return fmt$(o);
    if (k.tipo === 'x') return 'x' + uiNum(o, 1);
    return Number.isInteger(o) ? uiNum(o) : uiNum(o, 1);
  }
  // el objetivo redondeado a lo que se ve: el % y la diferencia se calculan contra ESE número
  const redondearObj = (k, v) => (k.tipo === 'plata' ? (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 100) / 100) : Math.round(v * 10) / 10);
  function objetivoDe(k, c) {
    const o = k.obj ? k.obj(c) : null;
    return o == null || o === '' || !isFinite(o) ? null : { v: redondearObj(k, Number(o)) };
  }
  // Un objetivo 0 es válido (en "menos es mejor" es un tope) y no se puede dividir: se compara aparte, sin %.
  function comparar(k, num, obj) {
    if (!obj || num == null || !isFinite(num)) return null;
    if (obj.v === 0) return { cero: true, ok: k.menos ? num <= 0 : num >= 0, exceso: k.menos ? Math.max(0, num) : 0 };
    return { pct: Math.round(100 * num / obj.v) };
  }
  // ¿qué parte de su fase ya pasó? (solo para lo que se acumula: registros, gasto, agendas, cierres, cash)
  function ritmoDe(k, c) {
    if (!k.suma || !k.fase) return null;
    const r = k.fase === 'cap' ? { desde: T().primerDia(c.w), hasta: c.w.fecha } : { desde: c.w.fecha, hasta: T().finVentana(c.w) };
    if (c.h < r.desde || c.h > r.hasta) return null;
    const dia = T().difDias(r.desde, c.h) + 1, de = T().difDias(r.desde, r.hasta) + 1;
    return { pct: Math.min(100, Math.round(100 * dia / de)), dia, de, que: k.fase === 'cap' ? 'de la captación' : 'de la ventana de cierre' };
  }
  const difTxt = (k, d) => (k.tipo === 'pct' ? `${uiNum(d, 1)} puntos` : objetivoTxt(k, redondearObj(k, d)));
  const otraMoneda = (k, res) => k.tipo === 'plata' && res.v != null && isFinite(res.v) && !mismaMoneda(res.moneda);
  function tipObjetivo(k, res, num, obj, cmp, rit) {
    const L = [k.et];
    const oT = objetivoTxt(k, obj.v) + ' (proyección)';
    if (!cmp) {
      L.push(`Objetivo: ${oT}`);
      const motivo = res.sub && res.sub !== '…' ? String(res.sub) : '';
      L.push(otraMoneda(k, res) ? `El valor está en ${res.moneda}: no se compara con la proyección`
        : (res.v == null || !isFinite(res.v)) ? 'Todavía no hay valor para comparar' + (motivo ? ` (${motivo.charAt(0).toLowerCase() + motivo.slice(1)})` : '')
        : 'No se puede comparar con el objetivo');
      return L.join('\n');
    }
    if (cmp.cero) {
      L.push(`${valorTxt(k, res)} · ${k.menos ? 'tope' : 'objetivo'} ${objetivoTxt(k, 0)}`);
      L.push(k.menos ? (cmp.ok ? 'Cumple el tope' : `Te pasás del tope por ${difTxt(k, cmp.exceso)} (acá menos es mejor)`) : 'Con objetivo 0, cualquier valor lo cumple');
      return L.join('\n');
    }
    L.push(`${valorTxt(k, res)} de ${oT} · ${uiNum(cmp.pct)}% del objetivo`);
    const dif = redondearObj(k, obj.v - num);
    if (k.presu) L.push(dif >= 0 ? `Quedan ${difTxt(k, dif)} del presupuesto` : `Se pasó del presupuesto por ${difTxt(k, -dif)}`);
    else if (k.menos) L.push(dif >= 0 ? `Dentro del tope: ${difTxt(k, dif)} de margen` : `Se pasa del tope por ${difTxt(k, -dif)} (acá menos es mejor)`);
    else L.push(dif > 0 ? `Faltan ${difTxt(k, dif)}` : (dif < 0 ? `Objetivo cumplido: ${difTxt(k, -dif)} por encima` : 'Objetivo cumplido'));
    if (rit) L.push(`Ritmo esperado a hoy: ${rit.pct}% (día ${rit.dia} de ${rit.de} ${rit.que}) · ${cmp.pct >= rit.pct ? 'vas adelante' : 'vas atrás'}`);
    return L.join('\n');
  }
  function tipValor(k, res, c, n) {
    if (res.v == null || !isFinite(res.v)) return '';
    const L = [`${k.et} · ${c.w.nombre}${c.closer && !/^(cap|eqp)-/.test(k.id) ? ' · ' + c.closer : ''}`, valorTxt(k, res)];
    [].concat(res.det || []).filter(Boolean).forEach((x) => L.push(x));
    if (n != null) L.push(n.n ? `Clic para ver ${n.n === 1 ? (n.genero === 'f' ? 'la' : 'el') + ' ' + n.que : `${n.genero === 'f' ? 'las' : 'los'} ${uiNum(n.n)} ${n.que}`}` : 'Clic para ver el detalle');
    return L.join('\n');
  }
  // qué se lista al tocar la tarjeta, para decirlo en el tooltip ("las 17 llamadas")
  const unidadFilas = (d) => {
    const n = (d.rs || []).length;
    if (d.tipo === 'closers') return { n: (d.pares || []).length, que: 'closers', genero: 'm' };
    return d.fecha === 'alta' ? { n, que: n === 1 ? 'agenda' : 'agendas', genero: 'f' } : { n, que: n === 1 ? 'llamada' : 'llamadas', genero: 'f' };
  };

  /* ════════ tarjeta (anatomía de la referencia) ════════ */
  const PIN = (on) => `<button type="button" class="kp-pin${on ? ' on' : ''}" title="${on ? 'Sacar del Inicio' : 'Fijar en el Inicio'}" onclick="event.stopPropagation();kpiFijar(this.closest('.kp-card').dataset.id)">${icoPin()}</button>`;
  const CTX_ULT = {};   // el contexto con que se pintó cada tarjeta (también las del Inicio), para el detalle
  function tarjeta(k, c) {
    const fij = FIJ && FIJ.has(k.id);
    let res;
    try { res = k.calc(c); } catch (e) { console.warn('[kpi ' + k.id + ']', e); res = nada('No se pudo calcular'); }
    const cargando = res.v == null && res.sub === '…';
    const num = valorNum(k, res), obj = objetivoDe(k, c);
    const cmp = cargando ? null : comparar(k, num, obj);
    const pct = cmp && !cmp.cero ? cmp.pct : null;
    const rit = pct != null ? ritmoDe(k, c) : null;
    const deEquipo = c.closer && k.soloEquipo;   // con un closer elegido, la cantidad proyectada (del equipo) no aplica
    const tipObj = cargando ? '' : obj ? tipObjetivo(k, res, num, obj, cmp, rit) : `${k.et}\n${deEquipo ? 'La proyección de cantidades es de todo el equipo, no de un closer' : 'Sin objetivo en la proyección'}`;
    const badge = pct != null
      ? `<span class="kp-badge on${k.menos ? ' menos' : ''}" data-tip="${uiEsc(tipObj)}"><i></i>${pct}%</span>`
      : cmp && cmp.cero
        ? `<span class="kp-badge on ${cmp.ok ? 'ok' : 'mal'}" data-tip="${uiEsc(tipObj)}"><i></i>${cmp.ok ? 'OK' : '+' + uiEsc(difTxt(k, cmp.exceso))}</span>`
        : `<span class="kp-badge"${tipObj ? ` data-tip="${uiEsc(tipObj)}"` : ''}><i></i>–</span>`;
    // barrita del objetivo: azul en camino, ámbar si va atrás del ritmo, verde cumplido; en "menos es mejor", verde
    // dentro del tope y rojo pasado; el presupuesto se pone ámbar si se pasa
    let riel = '';
    if (pct != null) {
      const est = k.presu ? (pct > 100 ? 'atras' : 'en') : k.menos ? (pct <= 100 ? 'ok' : 'mal') : pct >= 100 ? 'ok' : (rit && pct < rit.pct ? 'atras' : 'en');
      riel = `<span class="kp-riel ${est}" data-tip="${uiEsc(tipObj)}"><i style="width:${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%"></i>${rit ? `<em style="left:${rit.pct}%"></em>` : ''}</span>`;
    } else if (cmp && cmp.cero) {
      riel = `<span class="kp-riel ${cmp.ok ? 'ok' : 'mal'}" data-tip="${uiEsc(tipObj)}"><i style="width:100%"></i></span>`;
    }
    const pie = obj
      ? `<span class="kp-obj">Objetivo: <b>${uiEsc(objetivoTxt(k, obj.v))}</b> (proyección)</span>`
      : `<span class="kp-obj sin">${deEquipo ? 'La proyección es de todo el equipo' : 'Sin objetivo en la proyección'}</span>`;
    const notas = [cargando ? '' : res.sub, k.ayuda, otraMoneda(k, res) ? `En ${res.moneda}: no se compara con la proyección` : ''].filter(Boolean);
    const info = notas.length ? `<span class="kp-info${res.sub && !cargando && /Sin |sin |Falta|No pude|Nadie/.test(res.sub) ? ' ojo' : ''}" data-tip="${uiEsc(k.et + '\n' + notas.join('\n'))}">${uiIco('info', 12)}</span>` : '';
    CTX_ULT[k.id] = c;
    let nFilas = null;
    if (!cargando && k.filas && res.v != null) { try { const d = k.filas(c); if (d) nFilas = unidadFilas(d); } catch (e) { } }
    const clic = (nFilas != null && nFilas.n > 0) || k.abre === 'asistencia';
    const onclick = k.abre === 'asistencia' ? `tbAsistencia('${uiEsc(c.id)}')` : `kpiDetalle('${k.id}')`;
    const tipV = cargando ? '' : tipValor(k, res, c, nFilas != null && nFilas.n > 0 ? nFilas : null) || (k.abre === 'asistencia' ? `${k.et}\nSin cargar\nClic para cargarlo` : '');
    return `<article class="kp-card${cargando ? ' cargando' : ''}${clic ? ' clic' : ''}" data-id="${k.id}"${clic ? ` onclick="${onclick}"` : ''}>
      <header><span class="kp-et">${uiEsc(k.et)}</span><span class="kp-der">${info}${badge}${PIN(fij)}</span></header>
      <b class="kp-v"${tipV ? ` data-tip="${uiEsc(tipV)}"` : ''}>${cargando ? '<i class="kp-skel"></i>' : uiEsc(valorTxt(k, res))}</b>
      <footer${riel ? ' class="con-riel"' : ''}>${pie}${riel}</footer>
    </article>`;
  }

  /* ── el detalle de una tarjeta: las agendas que suman ese número, o los closers ── */
  const COLOR_EST = { Cerrada: 'verde', Presentada: 'azul', 'No-show': 'violeta', Cancelada: 'ambar', Descalificada: 'rojo', 'Re-agenda': 'ambar', Confirmada: 'cian', Pendiente: 'gris' };
  function tablaAgendas(rs, fecha) {
    const fDe = (x) => (fecha === 'alta' ? T().fechaAlta(x) : T().fechaCall(x));
    const fu = (x) => { const f = T().fuenteDe(x); return f === T().SIN_REG ? 'sin registro' : f; };
    const cols = [
      { t: fecha === 'alta' ? 'AGENDÓ' : 'LLAMADA', ancho: '96px', f: (x) => uiEsc(fechaDMA(fDe(x)) || '—') },
      { t: 'LEAD', f: (x) => `<b class="kp-det-n">${uiEsc(x.Nombre || 'Sin nombre')}</b>` },
      { t: 'CLOSER', f: (x) => uiEsc(cDe(x) || '—') },
      { t: 'ESTADO', f: (x) => uiEstado(x.Estado || 'Sin estado', COLOR_EST[x.Estado] || 'gris') },
      { t: 'FUENTE', f: (x) => uiEsc(fu(x)) },
      { t: 'MONTO', al: 'der', f: (x) => (T().monto(x) > 0 ? uiEsc(fmt$(T().monto(x))) : '<span class="op-gris">—</span>') },
    ];
    return `<div class="kp-det">${uiTabla(cols, rs, { vacio: 'No hay agendas acá' })}</div>`;
  }
  // el tooltip de cada fila de la lista de closers (se reemplazan en orden, uno por fila)
  const conTips = (html, tips) => { let i = 0; return html.replace(/data-tip="[^"]*"/g, (m) => (i < tips.length ? `data-tip="${uiEsc(tips[i++])}"` : m)); };
  window.kpiDetalle = (id) => {
    const k = catalogo().find((x) => x.id === id), c = CTX_ULT[id];
    if (!k || !k.filas || !c) return;
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    let d;
    try { d = k.filas(c); } catch (e) { console.warn('[kpi detalle]', e); return; }
    if (!d) return;
    const per = `${c.w.nombre}${c.closer && d.tipo === 'agendas' ? ' · ' + c.closer : ''}`;
    if (d.tipo === 'agendas') {
      const rs = d.rs.slice().sort((a, b) => (d.fecha === 'alta' ? T().fechaAlta(b).localeCompare(T().fechaAlta(a)) : T().fechaCall(b).localeCompare(T().fechaCall(a))));
      const monto = rs.filter((x) => x.Estado === 'Cerrada').reduce((s, x) => s + T().monto(x), 0);
      uiModalAbrir({
        titulo: k.et, ancho: '880px',
        sub: `${per} · ${uiNum(rs.length)} ${unidadFilas(d).que}${monto ? ' · ' + fmt$(monto) + ' vendidos' : ''} · por ${d.fecha === 'alta' ? 'el día en que agendaron' : 'el día de la llamada'}`,
        cuerpo: (rs.length > 1 ? `<div class="kp-det-res">${uiBarraApilada(contarPor(rs, (x) => x.Estado || 'Sin estado').map(([e, n]) => ({ etiqueta: e, valor: n, color: COLOR_EST[e] || 'gris' })))}</div>` : '') + tablaAgendas(rs, d.fecha),
        acciones: [{ texto: 'Cerrar', pri: true, onclick: 'uiModalCerrar()' }],
      });
      return;
    }
    // closers: llamadas (las mismas que cuentan las otras tarjetas), cierres y, aparte, las caídas
    const caidas = d.caidas || {}, totCaidas = Object.values(caidas).reduce((s, v) => s + v, 0);
    const caidaTxt = (n) => `${uiNum(n)} ${n === 1 ? 'cancelada o descalificada' : 'canceladas o descalificadas'}`;
    const filas = d.pares.map(([n, v]) => {
      const cc = d.rs.filter((x) => cDe(x) === n && x.Estado === 'Cerrada').length, ca = caidas[n] || 0;
      return { etiqueta: n, valor: v, sub: ca ? `+ ${caidaTxt(ca)} (no ${ca === 1 ? 'cuenta' : 'cuentan'})` : '', texto: `${uiNum(v)} ${v === 1 ? 'llamada' : 'llamadas'} · ${uiNum(cc)} ${cc === 1 ? 'cierre' : 'cierres'}`, color: uiColorNombre(n) };
    });
    const tips = d.pares.map(([n, v]) => {
      const rsN = d.rs.filter((x) => cDe(x) === n), cc = rsN.filter((x) => x.Estado === 'Cerrada').length, pres = rsN.filter((x) => x.Estado === 'Presentada' || x.Estado === 'Cerrada').length, ca = caidas[n] || 0;
      const cash = rsN.filter((x) => x.Estado === 'Cerrada').reduce((s, x) => s + T().monto(x), 0);
      return [n, `${uiNum(v)} ${v === 1 ? 'llamada' : 'llamadas'} · ${d.rs.length ? uiNum(100 * v / d.rs.length, 0) : 0}% de las del equipo`,
        `${uiNum(cc)} ${cc === 1 ? 'cierre' : 'cierres'}${pres ? ` de ${uiNum(pres)} presentadas · ${uiNum(100 * cc / pres, 1)}% de cierre` : ''}${cash ? ` · ${fmt$(cash)}` : ''}`,
        ca ? `+ ${caidaTxt(ca)} (no ${ca === 1 ? 'cuenta' : 'cuentan'} como llamada)` : ''].filter(Boolean).join('\n');
    });
    const notas = [totCaidas ? `${caidaTxt(totCaidas)} que no ${totCaidas === 1 ? 'cuenta' : 'cuentan'}` : '', d.sin ? `${uiNum(d.sin)} sin closer asignado (no cuentan)` : ''].filter(Boolean);
    uiModalAbrir({
      titulo: k.et, ancho: '640px', sub: `${per} · ${uiNum(d.pares.length)} closers · ${uiNum(d.rs.length)} llamadas${notas.length ? ' · ' + notas.join(' · ') : ''}`,
      cuerpo: `<div class="kp-det">${conTips(uiListaB(filas, { vacio: 'Sin llamadas en el webinar' }), tips)}</div><p class="op-gris kp-det-nota">Para ver los números de un closer, elegilo en el filtro de arriba.</p>`,
      acciones: [{ texto: 'Cerrar', pri: true, onclick: 'uiModalCerrar()' }],
    });
  };

  /* ════════ pintado ════════ */
  function botonesCabecera() {
    const ex = $('pageExtra');
    if (!ex || T().vista() !== 'kpis') return;
    ex.innerHTML = `<div class="kp-cab">${T().selector()}
      <button type="button" class="op-btn-sec" onclick="kpiConfigurar()">${uiIco('engranaje', 14)}Configurar</button>
      ${puedeVer('webinar') ? `<button type="button" class="op-btn-oro" onclick="location.hash='#webinar'">${uiIco('lapiz', 14)}Editar la proyección</button>` : ''}</div>`;
  }
  const visibles = (tab) => { const o = ocultos(); return catalogo().filter((k) => k.tab === tab && !o.has(k.id)); };
  let PINTADA = 0;
  function pintar() {
    const caja = $('kpis');
    if (!caja || T().vista() !== 'kpis') return;
    const p = ++PINTADA;
    botonesCabecera();
    const x = T().estado();
    if (!x) {
      caja.innerHTML = `<div class="kp">${uiVacio({ ico: 'calendario', titulo: 'Todavía no hay un webinar', texto: 'Los KPIs salen de un webinar y de su proyección: crealo en Webinar.', cta: puedeVer('webinar') ? { texto: 'Ir a Webinar', onclick: "location.hash='#webinar'" } : null })}</div>`;
      return;
    }
    const closers = [...new Set(x.rows.map(cDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (ST.closer && !closers.some((n) => norm(n) === norm(ST.closer))) ST.closer = '';
    const c = contexto(ST.closer), cat = catalogo(), o = ocultos();
    const tabs = TABS.map(([id, t]) => ({ id, texto: t, n: cat.filter((k) => k.tab === id && !o.has(k.id)).length }));
    const lista = visibles(ST.tab);
    const filtro = `<label class="tb-sel kp-closer">${uiIco('usuario', 14)}<select onchange="kpiCloser(this.value)" aria-label="Closer"><option value="">Todo el equipo</option>${closers.map((n) => `<option${norm(n) === norm(ST.closer) ? ' selected' : ''}>${uiEsc(n)}</option>`).join('')}</select></label>`;
    caja.innerHTML = `<div class="kp">
      ${seg(tabs, ST.tab, 'kpiTab')}
      <div class="kp-per">${ST.tab === 'equipo' ? '' : filtro}<span class="kp-per-t">${uiEsc(x.w.nombre)} · vivo ${uiEsc(T().fechaTxt(x.w.fecha))}${ST.closer && ST.tab !== 'equipo' ? ' · ' + uiEsc(ST.closer) : ''}</span></div>
      <div class="kp-grid" id="kpGrid">${lista.length ? lista.map((k) => tarjeta(k, c)).join('')
        : `<div class="kp-vacio">${uiVacio({ ico: 'medidor', titulo: 'No hay KPIs visibles en esta pestaña', texto: 'Tocá "Configurar" para elegir cuáles ver.', cta: { texto: 'Configurar', onclick: 'kpiConfigurar()' } })}</div>`}</div>
    </div>`;
    // el gasto de Meta llega después: las tarjetas que lo usan quedan cargando y se repinta
    if (x.g === undefined) T().gasto(x.w).then(() => { if (p === PINTADA && T().vista() === 'kpis') pintar(); });
  }
  async function cargarBase(fresco) {
    if (FIJ && !fresco) return;
    const f = await dbLista('kpis-fijados', !!fresco).catch(() => null);
    if (f) FIJ = new Set(f.map((d) => d.id));
    else if (!FIJ) FIJ = new Set();
  }
  async function render(force) {
    const caja = $('kpis');
    if (!caja || !T()) return;
    botonesCabecera();
    if (!caja.querySelector('.kp')) caja.innerHTML = '<div class="kp"><p class="op-cargando kp-cargando">Cargando KPIs...</p></div>';
    try { await Promise.all([T().cargar(force), cargarBase(force)]); }
    catch (e) { if (e.message !== 'sesion') caja.innerHTML = `<div class="kp"><p class="op-cargando kp-cargando">No pude leer los KPIs: ${uiEsc(e.message)}</p></div>`; return; }
    pintar();
  }
  window.kpiTab = (t) => { ST.tab = t; escribir('mhqkpis:tab', t); pintar(); };
  window.kpiCloser = (v) => { ST.closer = v; pintar(); };

  /* ── fijar en el Inicio (db kpis-fijados: las ve todo el equipo) ── */
  window.kpiFijar = async (id) => {
    if (!id) return;
    if (!FIJ) await cargarBase(true);
    const k = catalogo().find((x) => x.id === id);
    const estaba = FIJ.has(id);
    if (estaba) FIJ.delete(id); else FIJ.add(id);
    document.querySelectorAll(`.kp-card[data-id="${id}"] .kp-pin`).forEach((b) => b.classList.toggle('on', !estaba));
    try {
      if (estaba) await dbBorrar('kpis-fijados', id);
      else await dbGuardar('kpis-fijados', { id, tab: k ? k.tab : '', etiqueta: k ? k.et : id, orden: Date.now() });
      uiToast(estaba ? 'Lo sacaste del Inicio' : 'Fijado en el Inicio', 'ok');
      if (T().vista() === 'ceo') T().refrescar();
    } catch (e) {
      if (estaba) FIJ.add(id); else FIJ.delete(id);
      uiToast('No se pudo guardar: ' + e.message, 'mal'); pintar();
    }
  };
  // para el Inicio: las tarjetas fijadas del webinar elegido, de todo el equipo ('' si no hay ninguna)
  window.kpiFijadosHtml = async () => {
    await cargarBase(true);
    const c = FIJ.size ? contexto('') : null;
    const cat = c ? catalogo().filter((k) => FIJ.has(k.id)) : [];
    return cat.length ? `<div class="kp-inicio"><div class="kp-grid">${cat.map((k) => tarjeta(k, c)).join('')}</div></div>` : '';
  };

  /* ── configurar qué se ve (preferencia de cada uno, en el navegador) ── */
  window.kpiConfigurar = () => {
    const o = ocultos();
    const lista = catalogo().filter((k) => k.tab === ST.tab);
    uiModalAbrir({
      titulo: 'Configurar KPIs · ' + (TABS.find((t) => t[0] === ST.tab) || [, ''])[1], sub: 'Elegí qué tarjetas ver en esta pestaña. Se guarda en este navegador.', ancho: '520px',
      cuerpo: `<div class="cfg-lista">${lista.map((k) => `<div class="cfg-fila"><span>${uiEsc(k.et)}</span>${uiSwitch(!o.has(k.id), `kpiToggle('${k.id}')`)}</div>`).join('')}</div>`,
      acciones: [{ texto: 'Mostrar todas', onclick: 'kpiMostrarTodas()' }, { texto: 'Listo', pri: true, onclick: 'uiModalCerrar()' }],
    });
  };
  window.kpiToggle = (id) => {
    const o = ocultos();
    if (o.has(id)) o.delete(id); else o.add(id);
    escribir('mhqkpis:ocultos', JSON.stringify([...o])); pintar(); window.kpiConfigurar();
  };
  window.kpiMostrarTodas = () => {
    const o = ocultos();
    catalogo().filter((k) => k.tab === ST.tab).forEach((k) => o.delete(k.id));
    escribir('mhqkpis:ocultos', JSON.stringify([...o])); pintar(); window.kpiConfigurar();
  };

  /* ════════ entrada ════════ */
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.kpis = () => { render().catch((e) => console.warn('[kpis]', e)); };
})();
