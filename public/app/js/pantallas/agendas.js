/* Llamadas — la familia "Agendas" del hub original (agendas.js + lo de hub.js para
 * Pipeline, Pre-call y el tablero de Llamadas), portada a Masterclass HQ. Seis vistas en un archivo porque comparten
 * las mismas cuentas (qué es una asistencia, de qué color es cada estado, cómo se arma la tarjeta de un lead):
 *
 *  · Métricas (`closers`): embudo agenda → asistencia → cierre con la plata, tira de KPIs, fuentes, cómo terminan,
 *    leaderboard y la Comparativa (la tabla de closers del hub original).
 *  · Agendas (`central`): etapas numeradas, calendario, tabla, tarjetas y agenda por día, con el modal del día.
 *  · Análisis (`analisis`): la calidad de las llamadas, evaluadas a mano con la rúbrica (/api/db). El análisis con
 *    IA de las grabaciones de Fathom queda para más adelante: su lugar está marcado en Análisis, en la etapa
 *    Grabaciones de Agendas y en Llamadas.
 *  · Pipeline (`pipeline`): las columnas por estado de hub.js (renderPipeline), con alta manual y Sincronizar.
 *  · Llamadas (`llamadas`): el tablero del día (con closer / sin closer) y "Días anteriores": todas las llamadas
 *    que ya pasaron con su closer y su resultado (renderTablero y renderHistorial de hub.js).
 *  · Pre-call (`precall`): las próximas 48 h con el dossier de cada lead: lo que respondió al agendar y lo que trae
 *    el cruce con la landing (_registro: UTM, si calificó y sus respuestas).
 *
 * Reglas del tablero de closers original que se mantienen tal cual:
 *  · Asistencia = Presentada + Cerrada. Tasa de cierre = cerradas ÷ asistencias. Call/Close = cerradas ÷
 *    (asistencias + no-show). Show-up = asistencias ÷ (asistencias + no-show): lo que ya pasó sin resultado cargado
 *    queda FUERA del denominador y se cuenta aparte ("sin cargar").
 *  · Las llamadas futuras no entran en el corte (todavía no tienen resultado): van como "próximas".
 *  · Cash venta nueva = campo Monto de la agenda, por fecha de la llamada. Lo cobrado (cuotas) es de Ventas/Finanzas.
 *
 * Lo que era solo del hub original quedó afuera: ledger de pagos y CRM, programas por monto, onboarding, setters derivados del
 * closer, alias de closers de su equipo, Clientes, cancelar de verdad en Calendly/iClosed y el análisis con IA.
 * Todo lo global va con prefijo ag (los onclick del HTML llaman funciones por nombre y otros módulos portan las
 * mismas funciones de hub.js: con el prefijo no se pisan).
 */
(function () {
  /* ═════════════════════════════ base compartida ═════════════════════════════ */
  const $ = (id) => document.getElementById(id);
  const vistaOn = (id) => { const v = $(id); return !!(v && v.classList.contains('on')); };
  const filas = () => (typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.rows)) ? DATA.rows : [];
  // el pipeline llegó (base.js dispara mhq:datos): con cero agendas también hay que dejar de decir "Cargando"
  let LISTO = false;
  const cargado = () => LISTO || filas().length > 0;
  // "hoy" y la moneda son los del cliente (Integraciones → cliente), no los del hub original
  const ZONA = () => (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires';
  const MON = () => (window.MHQ && MHQ.cliente && MHQ.cliente.moneda) || 'USD';
  const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA() });
  const fechaDe = (r) => String(r['Fecha call'] || '').slice(0, 10);
  const horaDe = (r) => String(r.Hora || '').slice(-5);
  const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f);
  const fkey = (r) => fechaDe(r) + ' ' + horaDe(r);
  const telDe = (r) => String(r.WhatsApp || '').replace(/\D/g, '');
  const montoDe = (r) => parseFloat(r.Monto) || 0;
  const canon = (c) => closerCanon(c);
  const esReal = (c) => !!String(c || '').trim();
  const closerDe = (r) => { const c = canon(r.Closer); return esReal(c) ? c : 'Sin closer'; };
  // en dólares queda el «$» del hub original; en otra moneda va su código, como en usdT, Ventas y Finanzas (un «$» a secas
  // no dice si son pesos o dólares, y en euros está mal)
  const pre$ = () => (MON() === 'USD' ? '$' : MON() + ' ');
  const usd = (n) => pre$() + uiNum(Math.round(n || 0));
  // Porcentajes con coma decimal, como el resto del hub ("72,4%"): uiPct usa toFixed y daría "72.4%".
  const pctTxt = (v, dec = 1) => (isFinite(Number(v)) ? uiNum(v, dec) + '%' : '—');
  const pct = (a, b, dec = 1) => (b ? pctTxt(100 * a / b, dec) : '—');
  // Para las partes chicas de un total: "0,4%" en vez de un "0%" que parece vacío.
  const pctCorto = (a, b) => { if (!b) return '—'; const v = 100 * a / b; return v > 0 && v < 1 ? pctTxt(v, 1) : Math.round(v) + '%'; };
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const ASISTE = (e) => e === 'Presentada' || e === 'Cerrada';
  const SIN_RESULTADO = (e) => e === 'Pendiente' || e === 'Confirmada';   // la misma regla que "Sin cargar"
  const plural = (n, s, p) => `${uiNum(n)} ${n === 1 ? s : (p || s + 's')}`;
  const rowDe = (row) => filas().find(x => x._row === row) || null;
  // Tooltip universal de ui-atlas.js: atributo data-tip con una línea por renglón (la primera va en
  // negrita). Se le pasan las líneas sueltas o en arrays; las vacías se descartan, así cada gráfico
  // arma su lista sin preguntar qué dato existe.
  const tip = (...lineas) => {
    const t = lineas.flat(3).filter(x => x != null && x !== '' && x !== false).join('\n');
    return t ? ` data-tip="${uiEsc(t)}"` : '';
  };
  const usdT = (n) => MON() + ' ' + uiNum(n);
  // Un clic que repinta lo que está bajo el mouse (una píldora que pasa a "Clic: volver a todas")
  // dejaba el tooltip con el texto viejo: el motor de ui-atlas.js solo lo cambia al mover el mouse.
  // tipFuera() lo oculta (para los clics que cambian toda la pantalla o la hacen scrollear) y
  // tipRefrescar() además, ya repintado, le pasa al motor un mousemove en el mismo punto: si debajo
  // quedó algo con data-tip, muestra el texto nuevo sin esperar a que se mueva el mouse.
  const tipFuera = () => { if (typeof uiTipOcultar === 'function') uiTipOcultar(); };
  let ultimoXY = null;
  document.addEventListener('mousemove', (e) => { if (e.isTrusted) ultimoXY = [e.clientX, e.clientY]; }, { capture: true, passive: true });
  const tipRefrescar = () => {
    tipFuera();
    const xy = ultimoXY;
    if (!xy) return;
    setTimeout(() => {
      const el = document.elementFromPoint(xy[0], xy[1]);
      if (el) el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: xy[0], clientY: xy[1] }));
    }, 0);
  };
  // "Jueves 8 de octubre" (para el título de los tooltips de un día)
  const diaTip = (f) => { const d = uiF(f); return `${uiCap(DIAS_L[d.getDay()])} ${d.getDate()} de ${UI_MESES[d.getMonth()]}`; };

  // trazos lucide que no están en ui-atlas.js
  const ICOS = {
    trofeo: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    ajustes: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    docmas: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
    lupamas: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    ordenar: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    tabla: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>',
    agenda: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    portacheck: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    circulo: '<circle cx="12" cy="12" r="9"/>',
  };
  const ico = (n, t = 16) => ICOS[n]
    ? `<svg class="ui-ico" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOS[n]}</svg>`
    : uiIco(n, t);

  /* ── colores por significado: los mismos en las tres pantallas (la referencia de diseño los mezcla; acá no) ── */
  const VERDE = '#34d399', ROSA = '#fb7185', AMBAR = '#fbbf24', ORO = '#e0b44c', CELESTE = '#38bdf8', BLANCO = '#fafafa';
  const ESTADOS = ['Pendiente', 'Confirmada', 'Re-agenda', 'Presentada', 'No-show', 'Cerrada', 'Cancelada', 'Descalificada'];
  const EST = {
    'Pendiente':     { col: '#d4a53a', pl: 'Pendientes' },
    'Confirmada':    { col: '#60a5fa', pl: 'Confirmadas' },
    'Re-agenda':     { col: '#8b8b91', pl: 'Re-agenda', txt: '#b4b4b9' },
    'Presentada':    { col: '#a78bfa', pl: 'Presentadas' },
    'No-show':       { col: '#6c6c71', pl: 'No-show', txt: '#9e9ea2' },
    'Cerrada':       { col: VERDE, pl: 'Cerradas' },
    'Cancelada':     { col: AMBAR, pl: 'Canceladas' },
    'Descalificada': { col: ROSA, pl: 'Descalificadas' },
  };
  const estDe = (e) => EST[e] || { col: '#8b8b91', pl: e || 'Sin estado' };
  const estTxt = (e) => estDe(e).txt || estDe(e).col;

  /* ── origen (la nota interna del tipo de evento, el utm o el evento de Calendly/iClosed), canal y capital ── */
  const ORIGEN_NOMBRE = { 'MASTERCLASS': 'Masterclass', 'WEBINAR': 'Webinar', 'IG': 'Instagram', 'WPP': 'WhatsApp' };
  // Mayúsculas y alias normalizados (la referencia muestra "Youtube" y "YouTube" como dos filas: acá no).
  function origenDe(r) {
    const k = String(r.Origen || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!k) return { k: '', nombre: 'Sin origen' };
    return { k, nombre: ORIGEN_NOMBRE[k] || uiCap(String(r.Origen).trim().toLowerCase()) };
  }
  const ES_IG = (k) => /(^|\s)IG(\s|$)|INSTAGRAM/.test(k);
  // En el hub original el canal agrupaba orígenes por persona del equipo; acá cada cliente trae los suyos: el canal es
  // el origen, con un color estable por nombre.
  const canalDe = (r) => origenDe(r).nombre;
  const colCanal = (c) => (c === 'Sin origen' ? '#525252' : colorPersona(c));
  const CAP_COL = { '>3K': VERDE, '2-3K': '#60a5fa', '1-2K': AMBAR, '<1K': ROSA };
  const capDe = (r) => { const k = String(r.Capital || '').trim(); return CAP_COL[k] ? k : ''; };
  const SERIE = ['#fbbf24', '#60a5fa', '#a78bfa', '#34d399', '#f87171', '#2dd4bf', '#fb923c', '#e879f9'];

  // "Pipeline" = tipo de llamada: el evento de Calendly/iClosed
  const pipelineDe = (r) => String(r.Evento || '').trim() || 'Sin evento';
  // el programa vendido lo carga el closer al cerrar (campo Programa); en el hub original se infería del monto
  const progDe = (r) => String(r.Programa || '').trim() || 'Sin programa';
  // Agenda inválida: sin fecha, sin nombre o sin ningún contacto. No entra al calendario.
  const esInvalida = (r) => !fechaOk(fechaDe(r)) || !String(r.Nombre || '').trim() || (!telDe(r) && !String(r.Email || '').trim());

  /* ── personas: color estable por nombre, iniciales ── */
  const PAL = ['#60a5fa', '#d4a53a', '#a78bfa', '#c8c8cc', '#34d399', '#fb923c', '#f472b6', '#2dd4bf'];
  const colorPersona = (n) => { let h = 0; for (const c of String(n || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAL[h % PAL.length]; };
  const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  const avatar = (n, t = 27) => `<span class="ag-av" style="--ag:${colorPersona(n)};width:${t}px;height:${t}px;font-size:${Math.round(t * .4)}px">${uiEsc(iniciales(n))}</span>`;

  /* ── fechas largas ("jueves, 15 de octubre de 2026"; el CSS las capitaliza como la referencia) ── */
  const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const diaLargo = (f) => { const d = uiF(f); return `${DIAS_L[d.getDay()]}, ${d.getDate()} de ${UI_MESES[d.getMonth()]} de ${d.getFullYear()}`; };

  /* ── piezas de interfaz propias (las de la referencia que no están en ui.js / ui-atlas.js) ── */
  // segmentado SÓLIDO: pestañas de pantalla y pasos numerados, activo con degradé dorado
  function solido(ops, activa, fn, conNum) {
    return `<div class="ag-sol">${ops.map((o, i) => `<button type="button" class="ag-sol-b${o.id === activa ? ' on' : ''}" onclick="${fn}('${o.id}')"${o.tip ? tip(o.tip) : ''}>${conNum ? `<em>${String(i + 1).padStart(2, '0')}</em>` : ''}${o.ico ? ico(o.ico, 16) : ''}<span>${uiEsc(o.texto)}</span>${o.badge ? `<b class="${o.rojo ? 'rojo' : ''}">${uiEsc(o.badge)}</b>` : ''}</button>`).join('')}</div>`;
  }
  // segmentado TEÑIDO (UTM | Instagram) o suelto (Individual | Comparativa)
  function tenido(ops, activa, fn, variante) {
    return `<div class="ag-ten ${variante || ''}">${ops.map(o => `<button type="button" class="${o.id === activa ? 'on' : ''}" onclick="${fn}('${o.id}')">${uiEsc(o.texto)}</button>`).join('')}</div>`;
  }
  // segmentado NEUTRO (Mes · Semana · Día del calendario): activo gris, no dorado
  function neutro(ops, activa, fn) {
    return `<div class="ag-neu">${ops.map(o => `<button type="button" class="${o.id === activa ? 'on' : ''}" onclick="${fn}('${o.id}')">${uiEsc(o.texto)}</button>`).join('')}</div>`;
  }
  // Dona de la referencia: arranca a las 9 en punto, sentido horario, hueco entre segmentos, puntas
  // redondeadas y cada segmento con degradé vertical (pleno arriba, ≈70 % abajo).
  // Interactiva: cada segmento lleva data-seg (si la dona y su leyenda viven en un .ag-hl, el
  // segmento y su fila se prenden juntos y el resto se apaga), data-cv/data-cl (lo que pasa a decir
  // el centro), su tooltip y, si trae `det`, el clic que abre las agendas de ese dato.
  // segs = [{etiqueta, valor, color, id?, tip?, cv?, cl?, det?}]
  function dona(segs, o) {
    const tam = o.tam, sw = o.grosor, R = (tam - sw) / 2, C = tam / 2;
    const vivos = (segs || []).filter(s => Number(s.valor) > 0);
    const tot = vivos.reduce((a, s) => a + Number(s.valor), 0);
    const uid = 'agd' + Math.random().toString(36).slice(2, 8);
    let defs = '', arcos = '';
    if (tot > 0) {
      const hueco = vivos.length > 1 ? 2.6 * Math.PI / 180 : 0, punta = vivos.length > 1 ? (sw / 2) / R : 0;
      let a0 = Math.PI;
      vivos.forEach((s, i) => {
        const ang = Number(s.valor) / tot * 2 * Math.PI;
        let ini = a0 + hueco / 2 + punta, fin = a0 + ang - hueco / 2 - punta;
        a0 += ang;
        if (fin < ini) { const m = (ini + fin) / 2; ini = m; fin = m + 0.0001; }
        const p100 = pctCorto(s.valor, tot);
        const attrs = ` data-seg="${uiEsc(s.id != null ? s.id : i)}" data-cv="${uiEsc(s.cv != null ? s.cv : uiNum(s.valor))}" data-cl="${uiEsc(s.cl != null ? s.cl : s.etiqueta + ' · ' + p100)}"`
          + tip(s.tip || [s.etiqueta, `${uiNum(s.valor)} · ${p100}`])
          + (s.det ? ` data-det="${uiEsc(s.det)}" onclick="agMetDet(this)"` : '');
        defs += `<linearGradient id="${uid}${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${(C - R).toFixed(1)}" x2="0" y2="${(C + R).toFixed(1)}"><stop offset="0" stop-color="${s.color}"/><stop offset="1" stop-color="${s.color}" stop-opacity=".7"/></linearGradient>`;
        if (vivos.length === 1) { arcos += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="url(#${uid}${i})" stroke-width="${sw}"${attrs}/>`; return; }
        const p = (a) => [C + R * Math.cos(a), C + R * Math.sin(a)];
        const [x1, y1] = p(ini), [x2, y2] = p(fin);
        arcos += `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${fin - ini > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}" fill="none" stroke="url(#${uid}${i})" stroke-width="${sw}" stroke-linecap="round"${attrs}/>`;
      });
    }
    return `<div class="ag-dona ${o.clase || ''}${o.animar ? ' anim' : ''}" style="width:${tam}px;height:${tam}px;--hueco:${tam - 2 * sw}px">
      <svg viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true"><defs>${defs}</defs>
        <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#1d1d21" stroke-width="${sw}"/>${o.tipCentro ? `<circle class="ag-dona-hueco" cx="${C}" cy="${C}" r="${(R - sw / 2).toFixed(1)}" fill="transparent"${tip(o.tipCentro)}/>` : ''}${arcos}</svg>
      <div class="ag-dona-c"><b>${uiEsc(o.centro)}</b><span>${uiEsc(o.micro)}</span></div>
    </div>`;
  }

  /* ── archivos y portapapeles ── */
  function csvTexto(lista, cols) {
    // una celda que empieza con = + - @ se toma como fórmula al abrir el CSV (el nombre lo escribe cualquiera al agendar)
    const e = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [cols.map(c => e(c[0])).join(',')].concat(lista.map(r => cols.map(c => e(c[1](r))).join(','))).join('\n');
  }
  function descargar(nombre, texto, tipo) {
    const b = new Blob([texto], { type: tipo || 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  }
  async function copiarTexto(t, aviso) {
    try { await navigator.clipboard.writeText(t); uiToast(aviso || 'Copiado', 'ok'); }
    catch (e) { window.prompt('Copiá el texto:', t); }
  }
  // El cartel de "Guardado ✓" vive por debajo del modal (z-index 80 contra 300): con el modal del día abierto
  // quedaría tapado. Se sube una vez, sin tocar sus estilos.
  function subirModales() {
    const p = $('pstatus'); if (p) p.style.zIndex = '460';
  }
  // "1.500" escrito a la argentina es mil quinientos, no uno coma cinco
  function normMonto(s) {
    let t = String(s == null ? '' : s).replace(/usd|\$|\s/gi, '');
    if (!t) return '';
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(',', '.');
    return t;
  }

  /* ════════════════════════════ 1 · MÉTRICAS (vista closers) ════════════════════════════ */
  const PER_MET = 'agendas';
  const AGM = { modo: 'individual', closer: '', prog: '', fuente: 'utm', ultima: '' };
  try { Object.assign(AGM, JSON.parse(sessionStorage.getItem('mhqag:met') || '{}')); } catch (e) { /* storage bloqueado */ }
  const metGuardar = () => { try { sessionStorage.setItem('mhqag:met', JSON.stringify({ modo: AGM.modo, closer: AGM.closer, prog: AGM.prog, fuente: AGM.fuente })); } catch (e) { } };
  const TILES_DEF = ['cierre', 'ticket', 'capital', 'show', 'sincargar', 'descalif'];
  const TILE_NOMBRES = {
    cierre: '% de cierre sobre asistencias (y Call/Close)', ticket: 'Ticket promedio de venta nueva', capital: 'Agendas con capital de +2K',
    show: 'Show-up', sincargar: 'Llamadas sin resultado cargado', descalif: 'Descalificadas y canceladas', agendadas: 'Agendadas del corte',
    proximas: 'Próximas (de mañana en adelante)', cash: 'Cash venta nueva', noshow: 'No-show', cancel: 'Canceladas y tasa de cancelación',
  };
  function tilesElegidos() {
    try { const t = JSON.parse(localStorage.getItem('mhqag:tiles') || 'null'); if (Array.isArray(t) && t.length) return t; } catch (e) { }
    return TILES_DEF.slice();
  }
  // "71 llamadas sin resultado no cuentan (66 sin cargar y 5 de hoy)": las de días anteriores sin
  // cargar más las de hoy que todavía no tienen resultado. Ninguna entra en el show-up ni en la tasa.
  const fueraTxt = (d, verbo) => {
    const n = (d.falta || 0) + (d.hoy || 0);
    if (!n) return '';
    const partes = [d.falta ? `${uiNum(d.falta)} sin cargar` : '', d.hoy ? `${uiNum(d.hoy)} de hoy` : ''].filter(Boolean).join(' y ');
    return `${plural(n, 'llamada')} sin resultado ${verbo}${d.hoy ? ` (${partes})` : ''}`;
  };

  function metCalcular(r) {
    const h = hoyAR();
    const tope = r.hasta < h ? r.hasta : h;
    // "prog:Programa Agencia IA" puede llevar dos puntos adentro: se corta solo en el primero
    const corte = AGM.prog ? AGM.prog.indexOf(':') : -1;
    const tipo = corte > 0 ? AGM.prog.slice(0, corte) : '', val = corte > 0 ? AGM.prog.slice(corte + 1) : '';
    const pasaTipo = (row) => tipo !== 'tipo' || pipelineDe(row) === val;
    const delProg = (row) => tipo !== 'prog' || progDe(row) === val;
    const base = () => ({ n: 0, fut: 0, pres: 0, sinCierre: 0, ns: 0, cerr: 0, cerrOtro: 0, desc: 0, canc: 0, rea: 0, falta: 0, hoy: 0, cash: 0, conMonto: 0, cap2: 0, cap3: 0, mix: {} });
    const g = {}, fuentes = {};
    // U = las agendas que suman en T (corte + closer elegido) y F = las próximas: de acá salen las
    // listas que abre el clic en un gráfico, así siempre coinciden al número con lo que se ve.
    const U = [], F = [];
    const cierraFn = (row) => row.Estado === 'Cerrada' && delProg(row);
    filas().forEach(row => {
      if (!pasaTipo(row)) return;
      const k = closerDe(row), f = fechaDe(row);
      const d = g[k] || (g[k] = base());
      const mio = !AGM.closer || AGM.closer === k;
      if (fechaOk(f) && f > h) { d.fut++; if (mio) F.push(row); return; }        // futuras aparte: no tienen resultado todavía
      if (!fechaOk(f) || f < r.desde || f > tope) return;
      if (mio) U.push(row);
      const e = row.Estado;
      d.n++;
      if (ASISTE(e)) d.pres++;
      if (e === 'Presentada') d.sinCierre++;
      if (e === 'No-show') d.ns++;
      if (e === 'Descalificada') d.desc++;
      if (e === 'Cancelada') d.canc++;
      if (e === 'Re-agenda') d.rea++;
      // Sin cargar = ya pasó y nadie cargó qué pasó: solo los días anteriores, la misma regla que la
      // pantalla Agendas. Las de hoy en Pendiente o Confirmada pueden no haber pasado todavía: van aparte.
      if (SIN_RESULTADO(e)) { if (f < h) d.falta++; else d.hoy++; }
      const cap = String(row.Capital || '').trim();
      if (cap === '2-3K' || cap === '>3K') d.cap2++;
      if (cap === '>3K') d.cap3++;
      const cierra = e === 'Cerrada' && delProg(row);
      if (e === 'Cerrada' && !cierra) d.cerrOtro++;
      if (cierra) {
        d.cerr++;
        const m = montoDe(row);
        d.cash += m; if (m > 0) d.conMonto++;
        const t = capMeta(row.Capital).k || 'Sin dato';
        d.mix[t] = (d.mix[t] || 0) + 1;
      }
      if (!AGM.closer || AGM.closer === k) {
        const o = origenDe(row), fk = o.k || '—';
        const x = fuentes[fk] || (fuentes[fk] = { k: o.k, nombre: o.nombre, n: 0, cerr: 0 });
        x.n++; if (cierra) x.cerr++;
      }
    });
    const T = base();
    Object.entries(g).forEach(([k, d]) => {
      if (AGM.closer && AGM.closer !== k) return;
      Object.keys(T).forEach(c => { if (typeof T[c] === 'number') T[c] += d[c] || 0; });
    });
    return { r, h, tope, g, T, fuentes, tipo, val, U, F, cierra: cierraFn };
  }

  function metPintar() {
    const caja = $('closers');
    if (!caja) return;
    if (!cargado()) { caja.innerHTML = '<div class="ag-cargando">Cargando las agendas…</div>'; return; }
    const r = uiPerRango(PER_MET);
    const M = metCalcular(r);
    // el embudo se dibuja de arriba hacia abajo solo cuando cambia lo que se mira, no en cada refresco
    const clave = [r.desde, r.hasta, AGM.closer, AGM.prog, AGM.modo].join('|');
    M.animar = clave !== AGM.ultima; AGM.ultima = clave;
    caja.innerHTML = `<div class="ag ag-met">${metFiltros(M)}${AGM.modo === 'comparativa' ? metComparativa(M) : metIndividual(M)}</div>`;
  }

  function metFiltros(M) {
    const closers = Object.keys(M.g).filter(k => k !== 'Sin closer').sort((a, b) => a.localeCompare(b, 'es'));
    if (M.g['Sin closer']) closers.push('Sin closer');
    if (AGM.closer && !closers.includes(AGM.closer)) closers.unshift(AGM.closer);
    const opC = `<option value="">Todos los closers</option>` + closers.map(c => `<option value="${uiEsc(c)}"${c === AGM.closer ? ' selected' : ''}>${uiEsc(c)}</option>`).join('');
    const tipos = [...new Set(filas().map(pipelineDe))].sort((a, b) => a.localeCompare(b, 'es'));
    const progs = [...new Set(filas().filter(x => x.Estado === 'Cerrada').map(progDe))].sort((a, b) => a.localeCompare(b, 'es'));
    if (AGM.prog.startsWith('prog:') && !progs.includes(AGM.prog.slice(5))) progs.push(AGM.prog.slice(5));
    const opP = `<option value="">Todos los programas</option>
      <optgroup label="Programa vendido (lo carga el closer al cerrar)">${progs.map(p => `<option value="prog:${uiEsc(p)}"${AGM.prog === 'prog:' + p ? ' selected' : ''}>${uiEsc(p)}</option>`).join('')}</optgroup>
      <optgroup label="Tipo de llamada (evento)">${tipos.map(t => `<option value="tipo:${uiEsc(t)}"${AGM.prog === 'tipo:' + t ? ' selected' : ''}>${uiEsc(t)}</option>`).join('')}</optgroup>`;
    const nota = M.tipo === 'prog'
      ? `<div class="ag-nota">${uiIco('info', 14)}El programa se sabe recién al cerrar: agendas, asistencias y no-show no se filtran; los cierres y la plata sí.</div>`
      : M.tipo === 'tipo' ? `<div class="ag-nota">${uiIco('info', 14)}Solo las agendas de "${uiEsc(M.val)}".</div>` : '';
    return `<div class="ag-met-fil">
      ${tenido([{ id: 'individual', texto: 'Individual' }, { id: 'comparativa', texto: 'Comparativa' }], AGM.modo, 'agMetModo', 'suelto')}
      <label class="ag-sel ancho1"><select onchange="agMetCloser(this.value)" aria-label="Closer">${opC}</select></label>
      <label class="ag-sel ancho2"><select onchange="agMetProg(this.value)" aria-label="Programa">${opP}</select></label>
    </div>${nota}`;
  }

  function metIndividual(M) {
    return `<div class="ag-met-acc"><button type="button" class="ag-btn2 chico" onclick="agMetPersonalizar()">${ico('ajustes', 14)}Personalizar</button></div>
      <div class="ag-met-grid">
        ${metEmbudo(M)}
        <div class="ag-met-der">
          ${metTira(M)}
          <div class="ag-met-2">${metFuentes(M)}${metCierre(M)}</div>
        </div>
      </div>
      ${metLeaderboard(M)}`;
  }

  /* ── tarjeta "Embudo de conversión" ── */
  function metEmbudo(M) {
    const T = M.T;
    // en el hub original esta caja era el cash del mes (CRM + ledger, con cuotas): eso vive en Ventas. Acá, el ticket de venta nueva.
    const c2 = { v: T.conMonto ? MON() + ' ' + uiNum(T.cash / T.conMonto) : '—', l: 'Ticket promedio', s: `en ${plural(T.conMonto, 'cierre')} con monto`,
      tip: ['Ticket promedio de venta nueva', T.conMonto ? `${usdT(T.cash / T.conMonto)} · ${usdT(T.cash)} ÷ ${plural(T.conMonto, 'cierre')} con monto` : 'Ningún cierre del período tiene monto cargado', 'Las cuotas y lo cobrado están en Ventas'] };
    const res = T.pres + T.ns;
    const etapas = [
      { n: 'Agendadas', v: T.n, det: 'etapa:0', tip: ['Agendadas', `${plural(T.n, 'llamada')} del corte · 100%`, T.fut ? `+${uiNum(T.fut)} próximas aparte (todavía sin resultado)` : '',
        T.n ? 'Clic: ver la lista' : ''] },
      { n: 'Asistencias', v: T.pres, det: 'etapa:1', tip: ['Asistencias', `${uiNum(T.pres)} · ${pct(T.pres, T.n)} de las agendadas`,
        `Show-up ${pct(T.pres, res)} sobre ${plural(res, 'resuelta')}`, fueraTxt(T, 'no cuentan'), `Presentadas + cerradas${T.pres ? ' · clic: ver la lista' : ''}`] },
      { n: 'Cerradas', v: T.cerr, det: 'etapa:2', tip: ['Cerradas', `${uiNum(T.cerr)} · ${pct(T.cerr, T.n)} de las agendadas`,
        `${pct(T.cerr, T.pres)} desde Asistencias (tasa de cierre)`, `${usdT(T.cash)} cash venta nueva`, T.cerr ? 'Clic: ver la lista' : ''] },
    ];
    const ley = [
      ['Sin cierre', T.sinCierre, EST['Presentada'].col, 'Se presentaron y no cerraron (estado Presentada)', 'est:Presentada'],
      ['No-show', T.ns, EST['No-show'].col, `${pct(T.ns, res, 0)} de las resueltas`, 'est:No-show'],
      ['Re-agenda', T.rea, EST['Re-agenda'].col, 'Movidas a otra fecha', 'est:Re-agenda'],
      ['Canceladas', T.canc, AMBAR, '', 'est:Cancelada'], ['Descalificadas', T.desc, ROSA, '', 'est:Descalificada'],
      ['Sin cargar', T.falta, '#e4e4e7', 'De días anteriores: ya pasaron y nadie cargó qué pasó (siguen en Pendiente o Confirmada)', 'falta'],
    ];
    // las de hoy todavía sin resultado: pueden no haber pasado, así que no son "sin cargar"
    if (T.hoy) ley.push(['De hoy', T.hoy, EST['Pendiente'].col, 'Hoy, todavía en Pendiente o Confirmada: si mañana siguen así, pasan a Sin cargar', 'hoy']);
    if (M.tipo === 'prog') ley.unshift(['Cerradas de otro programa', T.cerrOtro, '#c8c8cc', 'Cerradas con otro programa cargado', 'otro']);
    const cajaCash = tip('Cash collected · venta nueva', `${usdT(T.cash)} en ${plural(T.conMonto, 'cierre')} con monto`,
      T.conMonto ? `Ticket promedio ${usdT(T.cash / T.conMonto)}` : '', T.cerr > T.conMonto ? `${plural(T.cerr - T.conMonto, 'cerrada')} sin monto cargado` : '',
      'Campo Monto de las cerradas del período: sin cuotas ni backend', T.cerr ? 'Clic: ver las cerradas' : '');
    return `<section class="ag-card ag-emb-card">
      <h3>Embudo de conversión</h3>
      <div class="ag-plata">
        <div class="ag-plata-c verde"${cajaCash}${T.cerr ? ' data-det="etapa:2" onclick="agMetDet(this)"' : ''}><b>${MON()} ${uiNum(T.cash)}</b><span>Cash collected</span><small>venta nueva · sin cuotas</small></div>
        <div class="ag-plata-c gold"${tip(c2.tip)}><b>${uiEsc(c2.v)}</b><span>${uiEsc(c2.l)}</span><small>${uiEsc(c2.s)}</small></div>
      </div>
      ${T.n ? embudoHtml(etapas, M.animar) : '<div class="ag-vacio ag-emb-vacio">Sin agendas en este período.</div>'}
      <div class="ag-ley">${ley.map(([t, n, c, desc, det]) => `<span${tip(t, `${plural(n, 'llamada')} · ${pct(n, T.n, 0)} de las agendadas`, desc, n ? 'Clic: ver cuáles' : '')}${n ? ` data-det="${det}" onclick="agMetDet(this)"` : ''}><i style="--ag:${c}"></i>${uiEsc(t)} <b>${uiNum(n)}</b></span>`).join('')}</div>
      <p class="ag-emb-pie">Tasa de cierre <b>${pct(T.cerr, T.pres)}</b> sobre asistencias</p>
    </section>`;
  }
  // El embudo en SVG: la etapa 1 es un cuenco que se angosta en curva hasta el cuello, con dos
  // capas de "borde" detrás para el 3D; las otras dos son tubos. Ancho proporcional con mínimo.
  function embudoHtml(et, animar) {
    const W = 329, cx = W / 2, H1 = 78, SEP = 3, H2 = 75, H3 = 75, H = H1 + SEP + H2 + SEP + H3;
    const v0 = Math.max(et[0].v, 1), R0 = 140;
    const med = (v, min) => Math.max(min, Math.min(R0 * 0.58, R0 * v / v0));
    const r2 = med(et[1].v, 26), r3 = Math.min(r2 * 0.86, med(et[2].v, 19)), r2b = Math.max(r3 + 1, r2 * 0.84);
    const copa = (r0, rn) => {
      const k1 = (r0 - rn) * 0.2, k2 = (r0 - rn) * 0.12;
      return `M${(cx - r0).toFixed(1)},0 L${(cx + r0).toFixed(1)},0 C${(cx + r0 - k1).toFixed(1)},${(H1 * .3).toFixed(1)} ${(cx + rn + k2).toFixed(1)},${(H1 * .7).toFixed(1)} ${(cx + rn).toFixed(1)},${H1} L${(cx - rn).toFixed(1)},${H1} C${(cx - rn - k2).toFixed(1)},${(H1 * .7).toFixed(1)} ${(cx - r0 + k1).toFixed(1)},${(H1 * .3).toFixed(1)} ${(cx - r0).toFixed(1)},0 Z`;
    };
    const y2 = H1 + SEP, y3 = y2 + H2 + SEP;
    const id = 'age' + Math.random().toString(36).slice(2, 7);
    const pat = (n, a, b) => `<pattern id="${id}${n}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="${a}"/><rect width="6" height="12" fill="${b}"/></pattern>`;
    const centros = [H1 * .45, y2 + H2 / 2, y3 + H3 / 2];
    const v0n = et[0].v || 1;
    // cada etapa (el trazo y su renglón de números) lleva el tooltip con valor, % y conversión, y el
    // clic que abre las agendas de esa etapa
    const interac = (i) => `${tip(et[i].tip)}${et[i].v ? ` data-det="${et[i].det}" onclick="agMetDet(this)"` : ''}`;
    return `<div class="ag-emb${animar ? ' anim' : ''}" data-on="0" onmouseleave="agEmbSalir(this)">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>${pat(0, '#48b8e8', '#6dd0f7')}${pat(1, '#2fb886', '#5fd9aa')}${pat(2, '#d9b45c', '#ecd28f')}</defs>
        <g class="ag-emb-e" data-i="0" onmouseenter="agEmbHover(this)"${interac(0)}><path d="${copa(R0 + 9, r2 + 3)}" fill="#26404b"/><path d="${copa(R0 + 4.5, r2 + 1.5)}" fill="#3587ac"/><path d="${copa(R0, r2)}" fill="url(#${id}0)"/></g>
        <g class="ag-emb-e" data-i="1" onmouseenter="agEmbHover(this)"${interac(1)}><path d="M${(cx - r2).toFixed(1)},${y2} L${(cx + r2).toFixed(1)},${y2} L${(cx + r2b).toFixed(1)},${y2 + H2} L${(cx - r2b).toFixed(1)},${y2 + H2} Z" fill="url(#${id}1)"/></g>
        <g class="ag-emb-e" data-i="2" onmouseenter="agEmbHover(this)"${interac(2)}><rect x="${(cx - r3).toFixed(1)}" y="${y3}" width="${(2 * r3).toFixed(1)}" height="${H3}" fill="url(#${id}2)"/></g>
      </svg>
      ${et.map((e, i) => `<div class="ag-emb-row" data-i="${i}" style="top:${(centros[i] / H * 100).toFixed(2)}%" onmouseenter="agEmbHover(this)"${interac(i)}><span class="n">${uiNum(e.v)}</span><span class="p">${Math.round(100 * e.v / v0n)}%</span><span class="t">${uiEsc(e.n)}</span></div>`).join('')}
    </div>`;
  }

  /* ── tira de KPIs (una sola tarjeta partida en celdas, como la referencia) ── */
  function tilesDe(M) {
    const T = M.T, res = T.pres + T.ns;
    // tip = las líneas del tooltip (qué es · el valor exacto con su cuenta · contexto);
    // det = la lista que abre el clic (la misma clave que usa el embudo)
    const D = {
      cierre: { t: '% Cierre / asist.', v: pct(T.cerr, T.pres), c: VERDE, s: `Call/Close ${pct(T.cerr, res)}`, det: T.cerr ? 'etapa:2' : '',
        tip: ['% de cierre sobre asistencias', `${pct(T.cerr, T.pres)} · ${uiNum(T.cerr)} cerradas de ${plural(T.pres, 'asistencia')}`, `Call/Close ${pct(T.cerr, res)} · ${uiNum(T.cerr)} de ${uiNum(res)} (asistencias + no-show)`] },
      ticket: { t: 'Ticket promedio', pre: T.conMonto ? MON() : '', v: T.conMonto ? uiNum(T.cash / T.conMonto) : '—', c: CELESTE, s: `en ${plural(T.conMonto, 'cierre')}`, det: T.cerr ? 'etapa:2' : '',
        tip: ['Ticket promedio de venta nueva', T.conMonto ? `${usdT(T.cash / T.conMonto)} · ${usdT(T.cash)} en ${plural(T.conMonto, 'cierre')} con monto` : 'Ningún cierre del período tiene monto cargado', 'Sin cuotas ni backend'] },
      capital: { t: 'Capital +2K', v: uiNum(T.cap2), c: BLANCO, s: `${uiNum(T.cap3)} con +3K`, det: T.cap2 ? 'cap2' : '',
        tip: ['Agendas con capital de +2K', `${uiNum(T.cap2)} · ${pct(T.cap2, T.n)} de las ${plural(T.n, 'agendada')}`, `${uiNum(T.cap3)} declararon más de 3K`, 'Lo que declararon al agendar (2-3K o más de 3K)'] },
      show: { t: 'Show-up', v: pct(T.pres, res), c: ORO, s: `de ${uiNum(res)} resueltas`, det: res ? 'res' : '',
        tip: ['Show-up', `${pct(T.pres, res)} · ${uiNum(T.pres)} asistencias de ${plural(res, 'resuelta')}`, `${uiNum(T.ns)} no-show`, fueraTxt(T, 'quedan fuera')] },
      sincargar: { t: 'Sin cargar', v: uiNum(T.falta), c: BLANCO, s: `${pct(T.falta, T.n, 0)} del corte`, det: T.falta ? 'falta' : '',
        tip: ['Llamadas sin resultado cargado', `${uiNum(T.falta)} · ${pct(T.falta, T.n)} del corte`, 'De días anteriores: ya pasaron y siguen en Pendiente o Confirmada',
          T.hoy ? `Aparte: ${plural(T.hoy, 'llamada')} de hoy todavía sin resultado` : '', `Aparte hay ${plural(T.fut, 'próxima', 'próximas')}`] },
      descalif: { t: 'Descalificadas', v: uiNum(T.desc), c: ROSA, s: `${plural(T.canc, 'cancelada')}`, det: T.desc ? 'est:Descalificada' : '',
        tip: ['Descalificadas', `${uiNum(T.desc)} · ${pct(T.desc, T.n)} de las agendadas`, `Aparte: ${plural(T.canc, 'cancelada')}`] },
      agendadas: { t: 'Agendadas', v: uiNum(T.n), c: BLANCO, s: `+${uiNum(T.fut)} próximas`, det: T.n ? 'etapa:0' : '',
        tip: ['Agendadas del corte', `${plural(T.n, 'llamada')} hasta hoy`, T.hoy ? `${uiNum(T.hoy)} de hoy todavía sin resultado` : '', `+${uiNum(T.fut)} próximas: se cuentan aparte`] },
      proximas: { t: 'Próximas', v: uiNum(T.fut), c: BLANCO, s: 'de mañana en adelante', det: T.fut ? 'fut' : '',
        tip: ['Próximas', `${plural(T.fut, 'llamada')} de mañana en adelante`, 'Todavía sin resultado: no entran en las tasas'] },
      cash: { t: 'Cash venta nueva', pre: MON(), v: uiNum(T.cash), c: VERDE, s: 'campo Monto', det: T.cerr ? 'etapa:2' : '',
        tip: ['Cash venta nueva', `${usdT(T.cash)} en ${plural(T.conMonto, 'cierre')} con monto`, 'Campo Monto de las cerradas: sin cuotas ni backend'] },
      noshow: { t: 'No-show', v: uiNum(T.ns), c: BLANCO, s: `${pct(T.ns, res, 0)} de resueltas`, det: T.ns ? 'est:No-show' : '',
        tip: ['No-show', `${uiNum(T.ns)} · ${pct(T.ns, res)} de las ${plural(res, 'resuelta')}`] },
      cancel: { t: 'Canceladas', v: uiNum(T.canc), c: AMBAR, s: `tasa ${pct(T.canc, T.n)}`, det: T.canc ? 'est:Cancelada' : '',
        tip: ['Canceladas', `${uiNum(T.canc)} · ${pct(T.canc, T.n)} de las ${plural(T.n, 'agendada')}`] },
    };
    return D;
  }
  function metTira(M) {
    const D = tilesDe(M);
    const ids = tilesElegidos().filter(id => D[id]);
    return `<div class="ag-tira" style="--n:${Math.max(1, ids.length)}">${ids.map(id => {
      const t = D[id];
      return `<div class="ag-tira-c${t.det ? ' clic' : ''}"${tip(t.tip, t.det ? 'Clic: ver la lista' : '')}${t.det ? ` data-det="${t.det}" onclick="agMetDet(this)"` : ''}><span class="ag-tira-l">${uiEsc(t.t)}</span><b class="ag-tira-v" style="--ag:${t.c}">${t.pre ? `<small>${uiEsc(t.pre)}</small>` : ''}${uiEsc(t.v)}</b><span class="ag-tira-s">${uiEsc(t.s || '')}</span></div>`;
    }).join('')}</div>`;
  }

  /* ── tarjeta "Agendas por fuente de origen" ── */
  function metFuentes(M) {
    const ig = AGM.fuente === 'ig';
    const it = Object.values(M.fuentes).filter(x => !ig || ES_IG(x.k)).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
    const total = it.reduce((a, x) => a + x.n, 0);
    // color propio solo para las 8 que tienen segmento; las que van dentro de «Otros» llevan su gris
    let ci = 0;
    it.forEach((x, i) => { x.col = i < 8 && x.k && ci < SERIE.length ? SERIE[ci++] : '#525252'; });
    const top = it.slice(0, 8), resto = it.slice(8);
    const deTot = ig ? 'de las de Instagram' : 'del total';
    // clave de cada fuente para el detalle: la UTM tal cual (o "—" si vino sin origen)
    const det = (ks) => 'fuentes:' + JSON.stringify(ks);
    const tipF = (x) => [x.nombre, `${plural(x.n, 'agenda')} · ${pct(x.n, total)} ${deTot}`,
      `${plural(x.cerr, 'cerrada')}${x.n ? ` · ${pct(x.cerr, x.n, 0)} de sus agendas` : ''}`, x.k ? `UTM: ${x.k}` : 'Llegaron sin UTM de origen'];
    const segs = top.map(x => ({ id: x.k || '—', etiqueta: x.nombre, valor: x.n, color: x.col, cl: `${x.nombre}\n${pctCorto(x.n, total)}`,
      det: det([x.k || '—']), tip: [...tipF(x), 'Clic: ver las agendas'] }));
    if (resto.length) {
      const nR = resto.reduce((a, x) => a + x.n, 0), cR = resto.reduce((a, x) => a + x.cerr, 0);
      segs.push({ id: '·otros', etiqueta: 'Otros', valor: nR, color: '#525252', cl: `Otros\n${pctCorto(nR, total)}`, det: det(resto.map(x => x.k || '—')),
        tip: [`Otras ${resto.length} fuentes`, `${plural(nR, 'agenda')} · ${pct(nR, total)} ${deTot}`, `${plural(cR, 'cerrada')}`, resto.slice(0, 4).map(x => `${x.nombre}: ${uiNum(x.n)}`), 'Clic: ver las agendas'] });
    }
    const cuerpo = total
      ? `<div class="ag-fu-cuerpo ag-hl">
          ${dona(segs, { tam: 120, grosor: 18, centro: uiNum(total), micro: 'Agendas', animar: M.animar, tipCentro: [`${plural(total, 'agenda')}${ig ? ' de Instagram' : ''} · ${plural(it.length, 'fuente')}`, it.slice(0, 4).map(x => `${x.nombre}: ${uiNum(x.n)} · ${pct(x.n, total, 0)}`), it.length > 4 ? `y ${it.length - 4} más` : '', 'Pasá por un segmento para ver cada una'] })}
          <div class="ag-fu-lista">${it.map((x, i) => {
            const enOtros = i >= 8;
            return `<div class="ag-fu-f" data-seg="${uiEsc(enOtros ? '·otros' : (x.k || '—'))}" data-cv="${uiNum(x.n)}" data-cl="${uiEsc(x.nombre + '\n' + pctCorto(x.n, total))}"${tip(tipF(x), enOtros ? 'En la dona va dentro de «Otros»' : '', 'Clic: ver las agendas')} data-det="${uiEsc(det([x.k || '—']))}" onclick="agMetDet(this)"><i style="--ag:${x.col}"></i><span>${uiEsc(x.nombre)}</span><em>${uiNum(x.n)} · ${uiNum(x.cerr)} cerr.</em></div>`;
          }).join('')}</div>
        </div>`
      : `<div class="ag-vacio ag-fu-vacio">${ig ? 'Ninguna agenda del período vino de Instagram.' : 'Sin agendas en este período.'}</div>`;
    return `<section class="ag-card ag-fuentes">
      <header class="ag-card-h"><h3>Agendas por fuente de origen</h3>${tenido([{ id: 'utm', texto: 'UTM' }, { id: 'ig', texto: 'Instagram' }], AGM.fuente, 'agMetFuente', 'chico')}</header>
      ${cuerpo}
    </section>`;
  }

  /* ── tarjeta "% Cierre" ── */
  function metCierre(M) {
    const T = M.T;
    const segs = [
      { id: 'cerr', etiqueta: 'Cerradas', valor: T.cerr, color: VERDE, val: VERDE, det: 'etapa:2', extra: `${pct(T.cerr, T.pres)} de las asistencias (tasa de cierre)` },
      M.tipo === 'prog' ? { id: 'otro', etiqueta: 'Otro programa', valor: T.cerrOtro, color: '#c8c8cc', det: 'otro', extra: 'Cerradas con el monto de otro programa' } : null,
      { id: 'sinc', etiqueta: 'Sin cierre', valor: T.sinCierre, color: EST['Presentada'].col, val: EST['Presentada'].col, det: 'est:Presentada', extra: `${pct(T.sinCierre, T.pres)} de las asistencias: se presentaron y no cerraron` },
      { id: 'ns', etiqueta: 'No-show', valor: T.ns, color: EST['No-show'].col, det: 'est:No-show', extra: `${pct(T.ns, T.pres + T.ns)} de las resueltas` },
      { id: 'rea', etiqueta: 'Re-agenda', valor: T.rea, color: EST['Re-agenda'].col, det: 'est:Re-agenda', extra: 'Movidas a otra fecha' },
      { id: 'canc', etiqueta: 'Canceladas', valor: T.canc, color: AMBAR, det: 'est:Cancelada', extra: `${pct(T.canc, T.n)} de las agendadas` },
      { id: 'desc', etiqueta: 'Descalificadas', valor: T.desc, color: ROSA, val: ROSA, det: 'est:Descalificada', extra: `${pct(T.desc, T.n)} de las agendadas` },
    ].filter(Boolean);
    // el total de la dona son las llamadas con resultado cargado (las "sin cargar" no entran)
    const conRes = segs.reduce((a, s) => a + s.valor, 0);
    segs.forEach(s => {
      s.tip = [s.etiqueta, `${plural(s.valor, 'llamada')} · ${pct(s.valor, conRes)} de las ${uiNum(conRes)} con resultado`, s.extra, s.valor ? 'Clic: ver cuáles' : ''];
      s.cv = uiNum(s.valor); s.cl = conRes ? Math.round(100 * s.valor / conRes) + '%' : '';
    });
    const res = T.pres + T.ns;
    const kv = [
      ['Tasa asistencia', pct(T.pres, res), '', ['Tasa de asistencia (show-up)', `${pct(T.pres, res)} · ${uiNum(T.pres)} de ${plural(res, 'resuelta')}`, 'Asistencias ÷ (asistencias + no-show)']],
      ['Tasa cancelación', pct(T.canc, T.n), '', ['Tasa de cancelación', `${pct(T.canc, T.n)} · ${uiNum(T.canc)} de ${plural(T.n, 'agendada')}`, 'Canceladas ÷ agendadas']],
      ['Capital +2K', uiNum(T.cap2), '', ['Capital +2K', `${uiNum(T.cap2)} · ${pct(T.cap2, T.n)} de las agendadas`, `${uiNum(T.cap3)} declararon más de 3K`]],
      ['Ticket promedio', T.conMonto ? MON() + ' ' + uiNum(T.cash / T.conMonto) : '—', 'oro', ['Ticket promedio', T.conMonto ? `${usdT(T.cash / T.conMonto)} · ${usdT(T.cash)} ÷ ${plural(T.conMonto, 'cierre')} con monto` : 'Ningún cierre con monto cargado', 'Venta nueva: sin cuotas ni backend']],
    ];
    return `<section class="ag-card ag-cierre">
      <h3>% Cierre</h3>
      <div class="ag-ci-top ag-hl">
        ${dona(segs, { tam: 84, grosor: 10, centro: pct(T.cerr, T.pres), micro: 'Cierre', clase: 'chica', animar: M.animar, tipCentro: ['% de cierre sobre asistencias', `${pct(T.cerr, T.pres)} · ${uiNum(T.cerr)} cerradas de ${plural(T.pres, 'asistencia')}`, `La dona reparte las ${uiNum(conRes)} llamadas con resultado`] })}
        <div class="ag-ley2">${segs.map(s => `<div data-seg="${s.id}" data-cv="${uiEsc(s.cv)}" data-cl="${uiEsc(s.cl)}"${tip(s.tip)}${s.valor ? ` data-det="${s.det}" onclick="agMetDet(this)"` : ''}><i style="--ag:${s.color}"></i><span>${uiEsc(s.etiqueta)}</span><b${s.val ? ` style="--v:${s.val}"` : ''}>${uiNum(s.valor)}</b></div>`).join('')}</div>
      </div>
      <div class="ag-kvs">${kv.map(([t, v, c, tp]) => `<div class="ag-kv"${tip(tp)}><span>${uiEsc(t)}</span><b class="${c}">${uiEsc(v)}</b></div>`).join('')}</div>
    </section>`;
  }

  /* ── "Leaderboard de closers" con podio ── */
  // El ranking se arma SIEMPRE con todos los closers del período: el puesto y el % del cash son
  // contra el equipo. Con un closer elegido se ve el mismo ranking, con él marcado y el resto
  // atenuado (antes quedaba solo, como "1º" con el 100% del cash, aunque fuera 3º con el 15%).
  function metLeaderboard(M) {
    const lista = Object.entries(M.g)
      .filter(([k, d]) => k !== 'Sin closer' && (d.n || d.cerr || d.cash))
      .map(([k, d]) => ({ k, d }))
      .sort((a, b) => b.d.cash - a.d.cash || b.d.cerr - a.d.cerr || b.d.n - a.d.n);
    lista.forEach((x, i) => { x.p = i + 1; });
    const sub = (d) => d.pres ? `${plural(d.cerr, 'cierre')} · ${pct(d.cerr, d.pres)} cierre` : `${plural(d.cerr, 'cierre')} · sin asistencias`;
    const totCash = lista.reduce((a, x) => a + x.d.cash, 0);
    const elegido = AGM.closer ? (lista.find(x => x.k === AGM.closer) || null) : null;
    const esSel = (x) => !!AGM.closer && x.k === AGM.closer;
    // el tooltip de cada closer: su puesto en el equipo, su plata, su embudo y qué hace el clic
    const tipC = (x) => tip(`${x.p}º de ${lista.length} · ${x.k}`,
      `${usdT(x.d.cash)} cash venta nueva${totCash ? ` · ${pct(x.d.cash, totCash, 0)} del cash de los closers` : ''}`,
      `${plural(x.d.cerr, 'cierre')} de ${plural(x.d.pres, 'asistencia')}${x.d.pres ? ` · ${pct(x.d.cerr, x.d.pres)} de cierre` : ''}`,
      `${plural(x.d.n, 'agendada')} · show-up ${pct(x.d.pres, x.d.pres + x.d.ns)}${x.d.falta ? ` · ${uiNum(x.d.falta)} sin cargar` : ''}`,
      x.d.conMonto ? `Ticket promedio ${usdT(x.d.cash / x.d.conMonto)}` : '',
      esSel(x) ? 'Clic: volver a todos los closers' : `Clic: ver solo a ${x.k}`);
    const attrs = (x) => ` data-v="${uiEsc(x.k)}" onclick="agMetVerCloser(this.dataset.v)"${esSel(x) ? ' aria-pressed="true"' : ''}${tipC(x)}`;
    let cuerpo;
    if (!lista.length) cuerpo = '<div class="ag-vacio">Todavía no hay closers con agendas en este período.</div>';
    else {
      const t = lista.slice(0, 3);
      const orden = [t[1], t[0], t[2]].filter(Boolean);
      const podio = `<div class="ag-podio">${orden.map(x => `<button type="button" class="ag-podio-p p${x.p}${esSel(x) ? ' sel' : ''}"${attrs(x)}>
          <span class="ag-podio-n">${x.p}</span><b>${uiEsc(x.k)}</b><strong>${usd(x.d.cash)}</strong><small>${sub(x.d)}</small></button>`).join('')}</div>`;
      const resto = lista.slice(3).map(x => `<button type="button" class="ag-lb-f${esSel(x) ? ' sel' : ''}"${attrs(x)}>
          <span class="ag-lb-pos">${x.p}</span><b>${uiEsc(x.k)}</b><small>${sub(x.d)}</small><strong>${usd(x.d.cash)}</strong></button>`).join('');
      cuerpo = podio + (resto ? `<div class="ag-lb-lista">${resto}</div>` : '');
    }
    const quien = !AGM.closer ? ''
      : elegido ? ` · ${uiEsc(AGM.closer)} va ${elegido.p}º de ${lista.length}` : ` · ${uiEsc(AGM.closer)} no tiene agendas de venta en el período`;
    return `<section class="ag-card ag-lb${AGM.closer ? ' consel' : ''}">
      <header class="ag-lb-h"><h3>${ico('trofeo', 16)}Leaderboard de closers</h3><p>Ordenado por cash collected (${MON()}) · venta nueva del período${quien}</p></header>
      <div class="ag-lb-b">${cuerpo}</div>
    </section>`;
  }

  /* ── Comparativa: la tabla de closers del hub original, entera ── */
  function metComparativa(M) {
    const rows = Object.entries(M.g).filter(([, d]) => d.n || d.fut)
      .sort((a, b) => b[1].cash - a[1].cash || b[1].n - a[1].n);
    const maxCash = Math.max(1, ...rows.map(([, d]) => d.cash));
    const T = rows.reduce((a, [, d]) => { Object.keys(a).forEach(c => { a[c] += d[c] || 0; }); return a; },
      { n: 0, fut: 0, pres: 0, ns: 0, desc: 0, canc: 0, falta: 0, hoy: 0, cerr: 0, cash: 0, conMonto: 0 });
    const su = (d) => (d.pres + d.ns) ? `${Math.round(100 * d.pres / (d.pres + d.ns))}% <small>n=${d.pres + d.ns}</small>` : '';
    const tc = (d) => d.pres ? `${Math.round(100 * d.cerr / d.pres)}% <small>n=${d.pres}</small>` : '';
    const quien = (k, total) => total ? 'Todos los closers' : k;
    const mixTxt = (d) => d.mix ? Object.entries(d.mix).sort((a, b) => b[1] - a[1]).map(([x, n]) => x + ' ' + n).join(' · ') : '';
    const fila = (k, d, total) => `<tr class="${total ? 'tot' : 'clic'}${AGM.closer === k ? ' sel' : ''}"${total ? '' : ` data-v="${uiEsc(k)}" onclick="agMetVerCloser(this.dataset.v)"`}>
        <td>${total ? '<b>Total</b>' : `<span class="ag-quien">${avatar(k, 22)}<b>${uiEsc(k)}</b></span>`}</td>
        <td class="der">${uiNum(d.n)}</td><td class="der">${d.fut ? uiNum(d.fut) : ''}</td>
        <td class="der">${uiNum(d.pres)}</td><td class="der">${d.ns ? uiNum(d.ns) : ''}</td>
        <td class="der"${(d.pres + d.ns) ? tip(`Show-up · ${quien(k, total)}`, `${pct(d.pres, d.pres + d.ns)} · ${uiNum(d.pres)} de ${plural(d.pres + d.ns, 'resuelta')}`, fueraTxt(d, 'quedan fuera')) : ''}>${su(d)}</td>
        <td class="der">${d.desc ? uiNum(d.desc) : ''}</td><td class="der">${d.canc ? uiNum(d.canc) : ''}</td>
        <td class="der">${d.falta ? `<span class="ag-sc-falta"${tip(`Sin cargar · ${quien(k, total)}`, `${plural(d.falta, 'llamada')} de días anteriores ya pasaron sin resultado`, `${pct(d.falta, d.n, 0)} de sus agendadas`, d.hoy ? `Aparte: ${uiNum(d.hoy)} de hoy todavía sin resultado` : '')}>${uiNum(d.falta)}</span>` : ''}</td>
        <td class="der">${uiNum(d.cerr)}</td>
        <td class="der"${d.pres ? tip(`Tasa de cierre · ${quien(k, total)}`, `${pct(d.cerr, d.pres)} · ${uiNum(d.cerr)} de ${plural(d.pres, 'asistencia')}`) : ''}>${tc(d)}</td>
        <td class="der"${d.cash ? tip(`Cash venta nueva · ${quien(k, total)}`, `${usdT(d.cash)}${!total && T.cash ? ` · ${pct(d.cash, T.cash, 0)} del total` : ''}`,
          d.conMonto ? `${d.cerr > d.conMonto ? `${uiNum(d.conMonto)} de sus ${plural(d.cerr, 'cierre')} con monto` : plural(d.conMonto, 'cierre') + ' con monto'} · ticket ${usdT(d.cash / d.conMonto)}` : '',
          mixTxt(d) ? `Capital declarado de sus ${plural(d.cerr, 'cierre')}: ${mixTxt(d)}` : '') : ''}>${d.cash ? `<span class="ag-cashbar"><i style="width:${(100 * d.cash / maxCash).toFixed(1)}%"></i></span>${usd(d.cash)}` : ''}</td>
        <td class="der">${d.conMonto ? usd(d.cash / d.conMonto) : ''}</td>
      </tr>`;
    return `<section class="ag-card ag-comp">
      <header class="ag-lb-h"><h3>${uiIco('usuarios', 16)}Comparativa de closers</h3><p>${uiEsc(M.r.etiqueta)} · tocá un closer para ver su tablero solo</p></header>
      ${rows.length ? `<div class="ag-tw"><table class="ag-t">
        <thead><tr><th>Closer</th><th class="der" title="Agendadas del corte (hasta hoy)">Agend.</th><th class="der" title="Próximas: todas las que vienen">Próx.</th><th class="der" title="Presentadas + cerradas">Present.</th><th class="der">No-show</th><th class="der">Show-up</th><th class="der" title="Descalificadas">Desc.</th><th class="der" title="Canceladas">Canc.</th><th class="der" title="De días anteriores: ya pasaron y nadie cargó qué pasó">Sin cargar</th><th class="der" title="Cerradas">Cerr.</th><th class="der" title="Tasa de cierre: cerradas ÷ presentadas">TC</th><th class="der" title="Cash venta nueva (campo Monto)">Cash v. nueva</th><th class="der" title="Ticket promedio de los cierres con monto">AOV</th></tr></thead>
        <tbody>${rows.map(([k, d]) => fila(k, d)).join('')}${rows.length > 1 ? fila('Total', T, true) : ''}</tbody></table></div>` : '<div class="ag-vacio">Sin agendas en este período.</div>'}
      <div class="tfoot ag-tfoot"><b>Show-up</b> = presentadas sobre presentadas + no-show. Las que ya pasaron y nadie cargó quedan FUERA del cálculo, por eso va el n al lado. <b>TC</b> = cerradas sobre presentadas.
        <b>Cash venta nueva</b> sale del campo Monto de la agenda, que carga el closer al cerrar: es venta nueva, NO incluye cuotas, y va por fecha de la llamada (lo cobrado está en Ventas).
        Pasá el mouse por Cash venta nueva para ver el capital que declararon sus cierres.</div>
    </section>`;
  }

  function metCabecera() {
    const ex = $('pageExtra');
    if (!ex) return;
    ex.innerHTML = `<button type="button" class="ag-btn2" onclick="agMetReporte()">${ico('docmas', 15)}Generar reporte</button>`
      + uiPeriodo(PER_MET, 'agMetPeriodo')
      + `<button type="button" class="ag-btn2" id="agMetAct" onclick="agMetActualizar()" title="Vuelve a leer las agendas">${uiIco('refrescar', 15)}Actualizar</button>`;
  }

  window.agMetPeriodo = () => metPintar();
  window.agMetModo = (m) => { AGM.modo = m; metGuardar(); metPintar(); };
  window.agMetCloser = (c) => { AGM.closer = c; metGuardar(); metPintar(); };
  window.agMetProg = (p) => { AGM.prog = p; metGuardar(); metPintar(); };
  window.agMetFuente = (f) => { AGM.fuente = f; metGuardar(); metPintar(); tipRefrescar(); };
  window.agMetVerCloser = (k) => {
    tipFuera();   // cambia toda la pantalla y sube al principio: el tooltip del podio no tiene que quedar
    AGM.closer = AGM.closer === k ? '' : k; AGM.modo = 'individual'; metGuardar(); metPintar();
    const m = document.querySelector('main'); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.agEmbHover = (el) => { const b = el.closest('.ag-emb'); if (b) b.dataset.on = el.dataset.i; };
  window.agEmbSalir = (b) => { b.dataset.on = '0'; };

  // Clic en un gráfico de Métricas (etapa del embudo, segmento de dona, fila de fuente, leyenda,
  // celda de la tira): las agendas que forman ese número, con el mismo corte y los mismos filtros
  // de closer y programa que la pantalla. Salen de M.U / M.F, así coinciden al número.
  const DET_NOMBRE = { 'etapa:0': 'Agendadas', 'etapa:1': 'Asistencias', 'etapa:2': 'Cerradas', falta: 'Sin resultado cargado', otro: 'Cerradas de otro programa',
    cap2: 'Capital +2K', res: 'Resueltas (asistencias y no-show)', fut: 'Próximas', hoy: 'De hoy, todavía sin resultado' };
  window.agMetDet = (el) => {
    const det = el && el.dataset ? el.dataset.det : String(el || '');
    if (!det) return;
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    const r = uiPerRango(PER_MET), M = metCalcular(r);
    let titulo = DET_NOMBRE[det] || '', pred = null;
    if (det === 'etapa:0' || det === 'fut') pred = () => true;
    else if (det === 'etapa:1') pred = (x) => ASISTE(x.Estado);
    else if (det === 'etapa:2') pred = M.cierra;
    else if (det === 'falta') pred = (x) => SIN_RESULTADO(x.Estado) && fechaDe(x) < M.h;
    else if (det === 'hoy') pred = (x) => SIN_RESULTADO(x.Estado) && fechaDe(x) === M.h;
    else if (det === 'otro') pred = (x) => x.Estado === 'Cerrada' && !M.cierra(x);
    else if (det === 'cap2') pred = (x) => ['2-3K', '>3K'].includes(String(x.Capital || '').trim());
    else if (det === 'res') pred = (x) => ASISTE(x.Estado) || x.Estado === 'No-show';
    else if (det.startsWith('est:')) { const e = det.slice(4); pred = (x) => x.Estado === e; titulo = e === 'Presentada' ? 'Sin cierre (presentadas)' : estDe(e).pl; }
    else if (det.startsWith('fuentes:')) {
      let ks = [];
      try { ks = JSON.parse(det.slice(8)); } catch (e) { /* clave rota: no abre nada */ }
      const set = new Set(ks);
      pred = (x) => set.has(origenDe(x).k || '—');
      titulo = ks.length === 1 ? (ks[0] === '—' ? 'Sin origen' : origenDe({ Origen: ks[0] }).nombre) : `Otras ${ks.length} fuentes`;
    }
    if (!pred) return;
    const fut = det === 'fut';
    const ls = (fut ? M.F : M.U).filter(pred).sort((a, b) => (fut ? fkey(a).localeCompare(fkey(b)) : fkey(b).localeCompare(fkey(a))));
    const conMonto = ls.filter(x => montoDe(x) > 0), suma = conMonto.reduce((a, x) => a + montoDe(x), 0);
    const progTxt = AGM.prog ? ' · ' + AGM.prog.slice(AGM.prog.indexOf(':') + 1) : '';
    const vis = ls.slice(0, 300);
    const cuerpo = ls.length ? `<div class="ag-det">
        ${suma ? `<p class="ag-det-res">${usdT(suma)} en ${plural(conMonto.length, 'llamada')} con monto cargado</p>` : ''}
        <div class="ag-tw"><table class="ag-t ag-tdet"><thead><tr><th>Llamada</th><th>Lead</th><th>Closer</th><th>Origen</th><th>Estado</th><th class="der">Monto</th></tr></thead><tbody>
        ${vis.map(x => `<tr class="clic" onclick="agCenVerLead('${x._row}')">
          <td class="ag-mono ag-gris">${uiEsc(uiFechaCorta(fechaDe(x)))} ${uiEsc(horaDe(x))}</td>
          <td><b class="ag-t-n">${uiEsc(x.Nombre || 'Sin nombre')}</b>${capDe(x) ? `<span class="ag-capchip" style="--ag:${CAP_COL[capDe(x)]}">${uiEsc(capDe(x))}</span>` : ''}</td>
          <td>${uiEsc(closerDe(x))}</td><td>${uiEsc(origenDe(x).nombre)}</td>
          <td><span class="ag-estchip" style="--ag:${estTxt(x.Estado)}">${uiEsc(x.Estado || '—')}</span></td>
          <td class="der ag-mono">${montoDe(x) ? uiEsc(usdT(montoDe(x))) : ''}</td>
        </tr>`).join('')}
        </tbody></table></div>
        ${ls.length > vis.length ? `<p class="ag-gris ag-det-res">Se muestran ${uiNum(vis.length)} de ${uiNum(ls.length)}.</p>` : ''}
      </div>` : '<div class="ag-vacio">No hay agendas con este dato en el período.</div>';
    uiModalAbrir({
      titulo: `${titulo} · ${plural(ls.length, 'llamada')}`,
      sub: `${fut ? 'De mañana en adelante' : `${r.etiqueta} · ${uiFechaCorta(r.desde)} al ${uiFechaCorta(M.tope)}`}${AGM.closer ? ' · ' + AGM.closer : ''}${progTxt} · tocá una fila para ver lo que respondió el lead`,
      cuerpo, ancho: '860px',
    });
    subirModales();
  };
  window.agMetActualizar = async () => {
    const b = $('agMetAct');
    if (b) { b.disabled = true; b.classList.add('girando'); }
    try {
      await cargarDatos();
      uiToast('Datos actualizados', 'ok');
    } catch (e) { uiToast('No pude actualizar: ' + e.message, 'mal'); }
    if (b) { b.disabled = false; b.classList.remove('girando'); }
    metPintar();
  };
  window.agMetPersonalizar = () => {
    const el = tilesElegidos();
    uiModalAbrir({
      titulo: 'Personalizar la tira de KPIs', sub: 'Elegí qué indicadores ver arriba (hasta 8). Se guarda en este navegador.',
      cuerpo: `<div class="cfg-lista">${Object.entries(TILE_NOMBRES).map(([id, n]) => `<div class="cfg-fila"><span>${uiEsc(n)}</span>${uiSwitch(el.includes(id), `agMetTile('${id}')`)}</div>`).join('')}</div>`,
      acciones: [{ texto: 'Restablecer', onclick: 'agMetTilesReset()' }, { texto: 'Listo', onclick: 'uiModalCerrar()', pri: true }], ancho: '540px',
    });
  };
  window.agMetTile = (id) => {
    let el = tilesElegidos();
    if (el.includes(id)) { if (el.length === 1) { uiToast('Tiene que quedar al menos uno'); return; } el = el.filter(x => x !== id); }
    else { if (el.length >= 8) { uiToast('Entran hasta 8: sacá uno antes'); return; } el.push(id); }
    const orden = Object.keys(TILE_NOMBRES);
    el.sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
    try { localStorage.setItem('mhqag:tiles', JSON.stringify(el)); } catch (e) { }
    metPintar(); window.agMetPersonalizar();
  };
  window.agMetTilesReset = () => { try { localStorage.removeItem('mhqag:tiles'); } catch (e) { } metPintar(); window.agMetPersonalizar(); };

  // Generar reporte: el período en texto plano (para pegar en WhatsApp o en un documento) y
  // la tabla por closer en CSV.
  window.agMetReporte = () => {
    const r = uiPerRango(PER_MET), M = metCalcular(r), T = M.T, res = T.pres + T.ns;
    const fu = Object.values(M.fuentes).sort((a, b) => b.n - a.n).slice(0, 8);
    const lb = Object.entries(M.g).filter(([k, d]) => k !== 'Sin closer' && (d.n || d.cerr || d.cash)).sort((a, b) => b[1].cash - a[1].cash || b[1].cerr - a[1].cerr || b[1].n - a[1].n);
    const progTxt = !AGM.prog ? 'Todos' : AGM.prog.slice(AGM.prog.indexOf(':') + 1);
    const txt = [
      `AGENDAS · ${r.etiqueta.toUpperCase()} (${uiFechaCorta(r.desde)} al ${uiFechaCorta(M.tope)})`,
      `Closer: ${AGM.closer || 'Todos'} · Programa: ${progTxt}`,
      '',
      'EMBUDO',
      `· Agendadas: ${uiNum(T.n)} (+${uiNum(T.fut)} próximas)`,
      `· Asistencias: ${uiNum(T.pres)} (${pct(T.pres, T.n, 0)} de las agendadas)`,
      `· Cerradas: ${uiNum(T.cerr)} (${pct(T.cerr, T.n, 0)} de las agendadas)`,
      `· Tasa de cierre: ${pct(T.cerr, T.pres)} sobre asistencias · Call/Close ${pct(T.cerr, res)} · Show-up ${pct(T.pres, res)}`,
      `· Sin cierre ${uiNum(T.sinCierre)} · No-show ${uiNum(T.ns)} · Re-agenda ${uiNum(T.rea)} · Canceladas ${uiNum(T.canc)} · Descalificadas ${uiNum(T.desc)} · Sin cargar ${uiNum(T.falta)}${T.hoy ? ` · De hoy sin resultado ${uiNum(T.hoy)}` : ''}`,
      '',
      'PLATA',
      `· Cash venta nueva: ${usd(T.cash)}${T.conMonto ? ` · ticket promedio ${usd(T.cash / T.conMonto)}` : ''}`,
      '',
      'FUENTES (UTM)',
      ...fu.map(x => `· ${x.nombre}: ${uiNum(x.n)} agendas · ${uiNum(x.cerr)} cerradas`),
      '',
      'LEADERBOARD (cash venta nueva)',
      ...lb.map(([k, d], i) => `${i + 1}. ${k} — ${usd(d.cash)} · ${plural(d.cerr, 'cierre')} · ${pct(d.cerr, d.pres)} cierre`),
    ].filter(x => x !== null && x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
    AGM.reporte = { txt, M };
    uiModalAbrir({
      titulo: 'Reporte de agendas', sub: `${r.etiqueta} · ${uiFechaCorta(r.desde)} al ${uiFechaCorta(r.hasta)} · listo para pegar`,
      cuerpo: `<pre class="ag-rep">${uiEsc(txt)}</pre>`,
      acciones: [{ texto: 'Descargar CSV por closer', onclick: 'agMetReporteCsv()' }, { texto: 'Copiar', onclick: 'agMetReporteCopiar()', pri: true }], ancho: '720px',
    });
  };
  window.agMetReporteCopiar = () => { if (AGM.reporte) copiarTexto(AGM.reporte.txt, 'Reporte copiado'); };
  window.agMetReporteCsv = () => {
    if (!AGM.reporte) return;
    const M = AGM.reporte.M;
    const lista = Object.entries(M.g).filter(([, d]) => d.n || d.fut).sort((a, b) => b[1].cash - a[1].cash).map(([k, d]) => ({ k, ...d }));
    descargar(`agendas_${M.r.desde}_${M.tope}.csv`, csvTexto(lista, [
      ['Closer', x => x.k], ['Agendadas', x => x.n], ['Próximas', x => x.fut], ['Presentadas', x => x.pres], ['No-show', x => x.ns],
      ['Show-up %', x => (x.pres + x.ns) ? Math.round(100 * x.pres / (x.pres + x.ns)) : ''], ['Descalificadas', x => x.desc], ['Canceladas', x => x.canc],
      ['Sin cargar', x => x.falta], ['Cerradas', x => x.cerr], ['TC %', x => x.pres ? Math.round(100 * x.cerr / x.pres) : ''],
      [`Cash venta nueva ${MON()}`, x => Math.round(x.cash)], [`AOV ${MON()}`, x => x.conMonto ? Math.round(x.cash / x.conMonto) : ''],
    ]));
  };

  /* ═══════════════════════════ 2 · AGENDAS (vista central) ═══════════════════════════ */
  const AGC = {
    etapa: 'agendas', estado: '', q: '', vista: 'cal', orden: 'prox', modo: 'mes', ancla: '', desde: '', hasta: '',
    pipeline: '', utm: false, invalidas: false, closer: '', f: { capital: '', origen: '', evento: '', setter: '' },
    tope: 300, pop: '', dia: '', cual: 'todas', post: '', sync: false, paneles: new Map(),
  };
  try {
    const s = JSON.parse(sessionStorage.getItem('mhqag:cen') || '{}');
    ['vista', 'modo', 'orden', 'utm', 'etapa', 'ancla', 'desde', 'hasta'].forEach(k => { if (s[k] != null) AGC[k] = s[k]; });
  } catch (e) { }
  const cenGuardar = () => { try { sessionStorage.setItem('mhqag:cen', JSON.stringify({ vista: AGC.vista, modo: AGC.modo, orden: AGC.orden, utm: AGC.utm, etapa: AGC.etapa, ancla: AGC.ancla, desde: AGC.desde, hasta: AGC.hasta })); } catch (e) { } };
  // en el hub original el setter se derivaba del closer; acá es el campo Setter tal cual
  const setterDe = (r) => String(r.Setter || '').trim() || 'Sin asignar';

  function cenRango() {
    const h = hoyAR(), a = AGC.ancla || h, d = uiF(a);
    if (AGC.modo === 'dia') return { desde: a, hasta: a, titulo: diaLargo(a) };
    if (AGC.modo === 'semana') {
      const dom = uiSumarDias(a, -d.getDay()), sab = uiSumarDias(dom, 6), d1 = uiF(dom), d2 = uiF(sab);
      return { desde: dom, hasta: sab, titulo: d1.getMonth() === d2.getMonth()
        ? `${d1.getDate()} al ${d2.getDate()} de ${UI_MESES[d2.getMonth()]}`
        : `${d1.getDate()} de ${UI_MESES[d1.getMonth()]} al ${d2.getDate()} de ${UI_MESES[d2.getMonth()]}` };
    }
    if (AGC.modo === 'custom') {
      let de = AGC.desde || h.slice(0, 8) + '01', ha = AGC.hasta || uiSumarDias(h, 30);
      if (de > ha) [de, ha] = [ha, de];
      if (Math.round((uiF(ha) - uiF(de)) / 864e5) > 120) ha = uiSumarDias(de, 120);   // el calendario no se estira de más
      return { desde: de, hasta: ha, titulo: `${uiFechaCorta(de)} – ${uiFechaCorta(ha)}` };
    }
    return { desde: uiS(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: uiS(new Date(d.getFullYear(), d.getMonth() + 1, 0)), titulo: `${UI_MESES[d.getMonth()]} de ${d.getFullYear()}` };
  }
  // "en octubre de 2026" / "del 4 al 10 de octubre": el rango del calendario dicho en una frase
  const rangoTxt = (R) => (AGC.modo === 'mes' ? 'en ' : 'del ') + R.titulo;
  // Todo lo que filtra menos el estado y el rango: búsqueda, pipeline, closer, filtros, inválidas.
  function cenBase() {
    const t = AGC.q.trim().toLowerCase();
    return filas().filter(r => {
      const inv = esInvalida(r);
      if (AGC.invalidas ? !inv : inv) return false;
      if (AGC.pipeline && pipelineDe(r) !== AGC.pipeline) return false;
      if (AGC.closer && closerDe(r) !== AGC.closer) return false;
      if (AGC.f.capital && (String(r.Capital || '').trim() || '—') !== AGC.f.capital) return false;
      if (AGC.f.origen && (origenDe(r).k || '—') !== AGC.f.origen) return false;
      if (AGC.f.evento && String(r.Evento || '') !== AGC.f.evento) return false;
      if (AGC.f.setter && setterDe(r) !== AGC.f.setter) return false;
      if (t && !Object.values(r).join(' ').toLowerCase().includes(t)) return false;
      return true;
    });
  }
  const pasaEstado = (r) => !AGC.estado || r.Estado === AGC.estado;
  const enR = (R) => (r) => { const f = fechaDe(r); return fechaOk(f) && f >= R.desde && f <= R.hasta; };
  function ordenar(lista) {
    const h = hoyAR();
    if (AGC.orden === 'asc') return lista.sort((a, b) => fkey(a).localeCompare(fkey(b)));
    if (AGC.orden === 'desc') return lista.sort((a, b) => fkey(b).localeCompare(fkey(a)));
    // la regla de la Central de siempre: próximas primero (la más cercana arriba), después las pasadas
    return lista.sort((a, b) => {
      const da = fkey(a), db = fkey(b), fa = da.slice(0, 10) >= h, fb = db.slice(0, 10) >= h;
      if (fa !== fb) return fa ? -1 : 1;
      return fa ? da.localeCompare(db) : db.localeCompare(da);
    });
  }
  const colorPunto = (r) => AGC.utm ? (colCanal(canalDe(r))) : estDe(r.Estado).col;

  function cenPintar() {
    const caja = $('central');
    if (!caja) return;
    if (!cargado()) { caja.innerHTML = '<div class="ag-cargando">Cargando las agendas…</div>'; return; }
    const act = document.activeElement;
    const foco = act && act.id === 'cSearch' ? (act.selectionStart || 0) : null;
    const R = cenRango(), base = cenBase();
    const enRango = base.filter(enR(R));
    caja.innerHTML = `<div class="ag ag-cen">
      ${cenCabecera(enRango)}
      <div class="ag-etapas">${cenEtapas(base)}</div>
      ${cenBusqueda()}
      ${AGC.etapa === 'agendas' ? cenToolbar(base) + cenFranja() + cenCuerpo(R, base, enRango) : cenEtapa(base)}
    </div>`;
    if (foco != null) { const i = $('cSearch'); if (i) { i.focus(); try { i.setSelectionRange(foco, foco); } catch (e) { } } }
    cenModalRefrescar();
  }

  /* ── encabezado de sub-página: título, contadores, pipeline, UTM, sincronizar ── */
  function cenCabecera(enRango) {
    const h = hoyAR();
    const pend = enRango.filter(r => ['Pendiente', 'Confirmada', 'Re-agenda'].includes(r.Estado) && fechaDe(r) >= h).length;
    const cerradas = enRango.filter(r => r.Estado === 'Cerrada'), cerr = cerradas.length;
    const montoCerr = cerradas.reduce((a, r) => a + montoDe(r), 0);
    const falta = enRango.filter(r => SIN_RESULTADO(r.Estado) && fechaDe(r) < h).length;
    const pipes = [...new Set(filas().map(pipelineDe))].sort((a, b) => a.localeCompare(b, 'es'));
    const R = cenRango();
    return `<div class="ag-sub">
      <div class="ag-sub-t"><h2>Central de agendas</h2><p>Pipeline de calls con leads agendados${syncTxt()}</p></div>
      <div class="ag-sub-d">
        <div class="ag-cnt">
          <div style="--ag:#d4a53a"${tip('Pendientes por delante', `${plural(pend, 'llamada')} de hoy en adelante`, `Pendientes, confirmadas y re-agendas ${rangoTxt(R)}`)}><b>${uiNum(pend)}</b><span>Pendientes</span></div>
          <div class="clic" style="--ag:${VERDE}"${tip('Cerradas', `${uiNum(cerr)} · ${pct(cerr, enRango.length, 0)} de las ${plural(enRango.length, 'llamada')} ${rangoTxt(R)}`, montoCerr ? `${usdT(montoCerr)} en monto cargado` : '', AGC.estado === 'Cerrada' && AGC.etapa === 'agendas' ? 'Clic: volver a todas' : 'Clic: ver solo las cerradas en el calendario')} onclick="agCenSoloEstado('Cerrada')"><b>${uiNum(cerr)}</b><span>Cerradas</span></div>
          <div style="--ag:${ROSA}"${tip('Sin cargar', `${plural(falta, 'llamada')} ${rangoTxt(R)} ya pasaron sin resultado`, 'De días anteriores: siguen en Pendiente o Confirmada')}><b>${uiNum(falta)}</b><span>Sin cargar</span></div>
        </div>
        <label class="ag-sel chico"><select onchange="agCenPipeline(this.value)" aria-label="Pipeline"><option value="">Todos los pipelines</option>${pipes.map(p => `<option${p === AGC.pipeline ? ' selected' : ''}>${uiEsc(p)}</option>`).join('')}</select></label>
        <button type="button" class="ag-utm${AGC.utm ? ' on' : ''}" onclick="agCenUtm()" title="Pintar el calendario por canal de origen en vez de por estado">${uiIco('etiqueta', 14)}UTM</button>
        <button type="button" class="ag-btn2 bajo" onclick="agCenSync()"${AGC.sync ? ' disabled' : ''} title="Trae ya las agendas nuevas de iClosed y Calendly (solas se traen cada 15 minutos)">${uiIco('calendario', 14)}${AGC.sync ? 'Sincronizando…' : 'Sincronizar'}</button>
        <button type="button" class="ag-icob" onclick="agCenRefrescar()" title="Volver a leer el pipeline">${uiIco('refrescar', 15)}</button>
      </div>
    </div>`;
  }

  /* ── etapas numeradas: 01 Agendas · 02 Pre-Call · 03 Post-Call · 04 Grabaciones · 05 Revisión · 06 Cualificación ── */
  function cenCuentas(base) {
    const h = hoyAR(), lim = uiSumarDias(h, 2), hace30 = uiSumarDias(h, -30);
    const pre = base.filter(r => ['Pendiente', 'Confirmada', 'Re-agenda'].includes(r.Estado) && fechaDe(r) >= h && fechaDe(r) <= lim);
    const post = base.filter(r => SIN_RESULTADO(r.Estado) && fechaDe(r) < h && fechaDe(r) >= hace30);
    const cual = base.filter(r => fechaDe(r) >= h && ['Pendiente', 'Confirmada', 'Re-agenda'].includes(r.Estado));
    let rev = null;
    if (AGA.evals) {
      const M = evMapa();
      rev = base.filter(r => ASISTE(r.Estado) && fechaDe(r) < h && fechaDe(r) >= hace30 && !evDe(r, M));
    }
    const preDia = [0, 1, 2].map(i => pre.filter(r => fechaDe(r) === uiSumarDias(h, i)).length);
    return { pre, preDia, post, cual, rev };
  }
  function cenEtapas(base) {
    const c = cenCuentas(base), R = cenRango(), nR = base.filter(enR(R)).length;
    return solido([
      { id: 'agendas', texto: 'Agendas', tip: ['01 · Agendas', `${plural(nR, 'llamada')} ${rangoTxt(R)}`, 'Calendario, tabla, tarjetas y agenda por día'] },
      { id: 'precall', texto: 'Pre-Call', badge: c.pre.length || '', tip: ['02 · Pre-Call', `${plural(c.pre.length, 'llamada')} de hoy, mañana y pasado mañana`,
        c.pre.length ? `Hoy ${uiNum(c.preDia[0])} · mañana ${uiNum(c.preDia[1])} · pasado mañana ${uiNum(c.preDia[2])}` : '', 'Pendientes, confirmadas o re-agendadas: hay que confirmarlas antes de que pasen'] },
      { id: 'postcall', texto: 'Post-Call', badge: c.post.length || '', rojo: true, tip: ['03 · Post-Call', `${plural(c.post.length, 'llamada')} sin resultado cargado`, 'De los últimos 30 días: siguen en Pendiente o Confirmada'] },
      { id: 'grabaciones', texto: 'Grabaciones', tip: ['04 · Grabaciones', 'Las llamadas grabadas en Fathom, con su análisis con IA: se conecta más adelante'] },
      { id: 'revision', texto: 'Revisión', badge: c.rev ? (c.rev.length || '') : '', rojo: true,
        tip: ['05 · Revisión', c.rev ? `${plural(c.rev.length, 'llamada hecha', 'llamadas hechas')} sin evaluar` : 'Leyendo las evaluaciones…', 'Últimos 30 días'] },
      { id: 'cualif', texto: 'Cualificación', badge: c.cual.length || '', tip: ['06 · Cualificación', `${plural(c.cual.length, 'próxima', 'próximas')} por delante`, 'Lo que respondió cada lead al agendar'] },
    ], AGC.etapa, 'agCenEtapa', true);
  }

  function cenBusqueda() {
    const pills = AGC.etapa === 'agendas'
      ? `<div class="ag-pills">${[['', 'Todos'], ...ESTADOS.map(e => [e, e === 'Descalificada' ? 'Descalif.' : estDe(e).pl])].map(([id, t]) => `<button type="button" class="ag-pill2${AGC.estado === id ? ' on' : ''}" onclick="agCenEstadoFiltro('${id}')"${id ? ` title="${uiEsc(estDe(id).pl)}"` : ''}>${uiEsc(t)}</button>`).join('')}</div>`
      : '';
    return `<div class="ag-busq">
      <label class="ag-bus">${uiIco('buscar', 14)}<input type="search" id="cSearch" value="${uiEsc(AGC.q)}" placeholder="Nombre, @usuario, mail o teléfono" autocomplete="off" oninput="agCenBuscar(this.value)" aria-label="Buscar agendas"></label>
      ${pills}
    </div>`;
  }

  function cenToolbar(base) {
    const inv = filas().filter(esInvalida).length;
    const nF = Object.values(AGC.f).filter(Boolean).length;
    const ordenTxt = { prox: 'Próximas primero', desc: 'Fecha ↓', asc: 'Fecha ↑' }[AGC.orden];
    const vistas = [['cal', 'calendario', 'Calendario'], ['tabla', 'tabla', 'Tabla (la Central de siempre)'], ['lista', 'lista', 'Tarjetas'], ['agenda', 'agenda', 'Agenda por día']];
    return `<div class="ag-tool">
      <button type="button" class="ag-btnp" onclick="agCenNueva()">${uiIco('mas', 15)}Agendar llamada</button>
      <button type="button" class="ag-btn3" onclick="agCenImportar()">${uiIco('subir', 15)}Importar</button>
      <button type="button" class="ag-btn3" onclick="agCenExportar()">${uiIco('descargar', 15)}Exportar</button>
      <div class="ag-popw"><button type="button" class="ag-pil${nF ? ' on' : ''}" onclick="agCenPop('filtros')">${uiIco('filtro', 14)}Filtros${nF ? ' · ' + nF : ''}${uiIco('abajo', 13)}</button>${AGC.pop === 'filtros' ? cenPopFiltros() : ''}</div>
      <div class="ag-popw"><button type="button" class="ag-pil${AGC.closer ? ' on' : ''}" onclick="agCenPop('closer')">${uiEsc(AGC.closer || 'Closer')}${uiIco('abajo', 13)}</button>${AGC.pop === 'closer' ? cenPopCloser() : ''}</div>
      <button type="button" class="ag-pil${AGC.invalidas ? ' on' : ''}" onclick="agCenInvalidas()" title="Agendas sin fecha válida, sin nombre o sin ningún contacto">${AGC.invalidas ? 'Ocultar inválidas' : 'Ver inválidas'}${inv ? ` (${inv})` : ''}</button>
      <button type="button" class="ag-btn3" onclick="agCenOrden()">${ico('ordenar', 14)}${ordenTxt}</button>
      <div class="ag-vistas">${vistas.map(([id, ic, t]) => `<button type="button" class="${AGC.vista === id ? 'on' : ''}" onclick="agCenVista('${id}')" title="${t}" aria-label="${t}">${ico(ic, 16)}</button>`).join('')}</div>
    </div>`;
  }
  function cenPopFiltros() {
    const todas = filas();
    const sel = (campo, titulo, valores) => `<label class="ag-pop-c"><span>${titulo}</span><span class="ag-sel"><select onchange="agCenFiltro('${campo}',this.value)"><option value="">Todos</option>${valores.map(([v, t]) => `<option value="${uiEsc(v)}"${AGC.f[campo] === v ? ' selected' : ''}>${uiEsc(t)}</option>`).join('')}</select></span></label>`;
    const cuenta = (fn) => { const m = {}; todas.forEach(r => { const k = fn(r); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const caps = cuenta(r => String(r.Capital || '').trim() || '—').filter(([k]) => CAP_COL[k] || k === '—').map(([k, n]) => [k, `${k === '—' ? 'Sin dato' : k} (${n})`]);
    const oris = cuenta(r => origenDe(r).k || '—').map(([k, n]) => [k, `${k === '—' ? 'Sin origen' : (ORIGEN_NOMBRE[k] || uiCap(k.toLowerCase()))} (${n})`]);
    const evs = cuenta(r => String(r.Evento || '')).filter(([k]) => k).map(([k, n]) => [k, `${k} (${n})`]);
    const sets = cuenta(setterDe).map(([k, n]) => [k, `${k} (${n})`]);
    return `<div class="ag-pop" onclick="event.stopPropagation()">
      ${sel('capital', 'Capital declarado', caps)}${sel('origen', 'Origen (UTM)', oris)}${sel('evento', 'Evento de Calendly / iClosed', evs)}${sel('setter', 'Setter', sets)}
      <div class="ag-pop-acc"><button type="button" class="ui-link" onclick="agCenFiltrosLimpiar()">Limpiar filtros</button></div>
    </div>`;
  }
  function cenPopCloser() {
    const m = {};
    filas().forEach(r => { if (esInvalida(r)) return; const k = closerDe(r); m[k] = (m[k] || 0) + 1; });
    const ls = Object.entries(m).sort((a, b) => (a[0] === 'Sin closer') - (b[0] === 'Sin closer') || b[1] - a[1]);
    return `<div class="ag-pop ag-pop-l" onclick="event.stopPropagation()">
      <button type="button" class="${!AGC.closer ? 'on' : ''}" data-v="" onclick="agCenCloserSel(this.dataset.v)"><span>Todos los closers</span></button>
      ${ls.map(([k, n]) => `<button type="button" class="${AGC.closer === k ? 'on' : ''}" data-v="${uiEsc(k)}" onclick="agCenCloserSel(this.dataset.v)">${k === 'Sin closer' ? '<i class="ag-sincl"></i>' : avatar(k, 20)}<span>${uiEsc(k)}</span><em>${uiNum(n)}</em></button>`).join('')}
    </div>`;
  }
  // "¿No ves todas las agendas?": el agujero del dato contado, con el camino para taparlo
  function cenFranja() {
    const h = hoyAR();
    const sinCloser = filas().filter(r => !esInvalida(r) && fechaDe(r) >= h && !['Cancelada', 'Descalificada'].includes(r.Estado) && closerDe(r) === 'Sin closer').length;
    const inv = filas().filter(esInvalida).length;
    if (AGC.invalidas) return `<div class="ag-franja">Mostrando solo las ${plural(inv, 'agenda inválida', 'agendas inválidas')} (sin fecha, sin nombre o sin contacto): no entran al calendario. <button type="button" onclick="agCenInvalidas()">Volver a las válidas →</button></div>`;
    if (!sinCloser && !inv) return '';
    const partes = [sinCloser ? `${plural(sinCloser, 'próxima', 'próximas')} sin closer asignado` : '', inv ? `${plural(inv, 'inválida')} (sin fecha o sin contacto)` : ''].filter(Boolean).join(' y ');
    return `<div class="ag-franja">¿No ves todas las agendas? Hay ${partes}. <button type="button" onclick="agCenRevisar()">Revisar →</button></div>`;
  }

  function cenCuerpo(R, base, enRango) {
    const h = hoyAR();
    const filtrados = enRango.filter(pasaEstado);
    let lista;
    if (AGC.invalidas) lista = ordenar(base.filter(pasaEstado));
    else if (AGC.vista === 'cal') lista = filtrados;
    else lista = ordenar((AGC.q.trim() ? base : enRango).filter(pasaEstado));   // buscando: en todas las fechas, como la Central vieja
    AGC.ultimaLista = lista;
    const sinCargar = filtrados.filter(r => SIN_RESULTADO(r.Estado) && fechaDe(r) < h).length;
    const cab = cenCalHeader(R, AGC.invalidas ? base : enRango, AGC.vista !== 'cal' || AGC.invalidas ? lista.length : filtrados.length);
    const banda = sinCargar && !AGC.invalidas
      ? `<div class="ag-banda">Hay ${plural(sinCargar, 'llamada', 'llamadas')} de este rango que ya pasaron sin resultado cargado: cuentan como pendientes hasta que alguien cargue qué pasó. <button type="button" onclick="agCenEtapa('postcall')">Cargarlas →</button></div>`
      : '';
    let cuerpo;
    if (AGC.invalidas || AGC.vista === 'tabla') cuerpo = cenTabla(lista);
    else if (AGC.vista === 'lista') cuerpo = cenLista(lista);
    else if (AGC.vista === 'agenda') cuerpo = cenAgenda(lista);
    else if (AGC.modo === 'semana') cuerpo = cenSemana(R, filtrados);
    else if (AGC.modo === 'dia') cuerpo = cenDiaVista(R, filtrados);
    else cuerpo = cenGrilla(R, filtrados);
    const aviso = AGC.vista !== 'cal' && AGC.q.trim() && !AGC.invalidas ? `<div class="ag-nota">${uiIco('info', 14)}Buscando "${uiEsc(AGC.q.trim())}" en todas las fechas, no solo en el rango.</div>` : '';
    return cab + banda + aviso + cuerpo;
  }

  // Las píldoras cuentan el rango entero (sin el filtro de estado), así se ve el reparto completo y
  // la que está activa queda marcada; el badge dice cuántas se están mostrando.
  function cenCalHeader(R, delRango, n) {
    let pills;
    const rt = AGC.invalidas ? 'de las inválidas' : rangoTxt(R);
    if (AGC.utm) {
      const m = {}, vis = delRango.filter(pasaEstado);
      vis.forEach(r => { const c = canalDe(r); m[c] = (m[c] || 0) + 1; });
      pills = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([c, k]) => `<span class="ag-cnts-p" style="--ag:${colCanal(c)}"${tip(c, `${plural(k, 'llamada')} · ${pct(k, vis.length, 0)} de las ${uiNum(vis.length)} ${rt}`, AGC.estado ? `Solo ${estDe(AGC.estado).pl.toLowerCase()}` : '')}><i></i>${uiNum(k)} ${uiEsc(c)}</span>`).join('');
    } else {
      pills = ESTADOS.map(e => {
        const k = delRango.filter(r => r.Estado === e).length;
        return k ? `<button type="button" class="ag-cnts-p${AGC.estado === e ? ' on' : ''}" style="--ag:${estTxt(e)}" onclick="agCenEstadoFiltro('${AGC.estado === e ? '' : e}')"${tip(estDe(e).pl, `${plural(k, 'llamada')} · ${pct(k, delRango.length, 0)} de las ${uiNum(delRango.length)} ${rt}`, AGC.estado === e ? 'Clic: volver a todas' : 'Clic: ver solo estas')}>${uiNum(k)} ${uiEsc(estDe(e).pl)}</button>` : '';
      }).join('');
    }
    const nav = AGC.modo === 'custom'
      ? `<div class="ag-custom"><input type="date" value="${R.desde}" onchange="agCenCustom(this.value,null)" aria-label="Desde"><span>a</span><input type="date" value="${R.hasta}" onchange="agCenCustom(null,this.value)" aria-label="Hasta"></div>`
      : `<div class="ag-flechas"><button type="button" onclick="agCenMover(-1)" aria-label="Anterior">${uiIco('izq', 16)}</button>${R.desde <= hoyAR() && R.hasta >= hoyAR() ? '' : `<button type="button" class="hoy" onclick="agCenHoy()">Hoy</button>`}<button type="button" onclick="agCenMover(1)" aria-label="Siguiente">${uiIco('der', 16)}</button></div>`;
    return `<div class="ag-calh">
      <div class="ag-calh-i">
        <div class="ag-calh-t"><h3>${uiEsc(AGC.invalidas ? 'Agendas inválidas' : R.titulo)}</h3><span class="ag-badge">${plural(n, 'llamada')}</span></div>
        <div class="ag-cnts">${pills}</div>
      </div>
      ${AGC.invalidas ? '' : `<div class="ag-calh-d">${neutro([{ id: 'mes', texto: 'Mes' }, { id: 'semana', texto: 'Semana' }, { id: 'dia', texto: 'Día' }, { id: 'custom', texto: 'Personalizado' }], AGC.modo, 'agCenModo')}${nav}</div>`}
    </div>`;
  }

  /* ── los puntos de un día, agrupados por estado (o por canal con UTM prendido) ──
     Cada grupo: {g: 'Pendiente', ls: [filas], col}. En el orden del embudo (o de más a menos canal). */
  const grupoDe = (r) => (AGC.utm ? canalDe(r) : (r.Estado || 'Sin estado'));
  function gruposDia(ls) {
    const m = new Map();
    ls.forEach(r => { const g = grupoDe(r); if (!m.has(g)) m.set(g, []); m.get(g).push(r); });
    const orden = AGC.utm
      ? [...m.keys()].sort((a, b) => m.get(b).length - m.get(a).length || a.localeCompare(b, 'es'))
      : [...ESTADOS.filter(e => m.has(e)), ...[...m.keys()].filter(e => !ESTADOS.includes(e))];
    return orden.map(g => ({ g, ls: m.get(g), col: AGC.utm ? (colCanal(g)) : estDe(g).col }));
  }
  // Entran 5 puntos por día. Con más llamadas, cada grupo tiene al menos uno y el resto se reparte
  // proporcional (resto mayor): así un día con 9 pendientes y 1 cerrada muestra el verde igual.
  function puntosPorGrupo(gs, n, max) {
    if (n <= max) return gs.map(x => x.ls.length);
    const k = gs.map((_, i) => (i < max ? 1 : 0));
    let quedan = max - k.reduce((a, b) => a + b, 0);
    while (quedan > 0) {
      let mejor = -1, dif = -Infinity;
      gs.forEach((x, i) => { const d = x.ls.length / n * max - k[i]; if (k[i] && k[i] < x.ls.length && d > dif) { dif = d; mejor = i; } });
      if (mejor < 0) break;
      k[mejor]++; quedan--;
    }
    return k;
  }
  const repartoTxt = (gs) => gs.map(x => `${x.g}: ${uiNum(x.ls.length)}`);

  /* ── calendario: grilla de días (mes o rango personalizado), domingo primero como la referencia ── */
  function cenGrilla(R, lista) {
    const h = hoyAR(), porDia = {};
    lista.forEach(r => { const f = fechaDe(r); (porDia[f] = porDia[f] || []).push(r); });
    const ini = uiF(R.desde);
    let celdas = '';
    for (let i = 0; i < ini.getDay(); i++) celdas += '<div class="ag-dia vacio"></div>';
    for (let f = R.desde; f <= R.hasta; f = uiSumarDias(f, 1)) {
      const ls = (porDia[f] || []).sort((a, b) => horaDe(a).localeCompare(horaDe(b)));
      const n = ls.length, d = uiF(f), num = d.getDate() === 1 && AGC.modo === 'custom' ? `1 ${UI_MESES_C[d.getMonth()]}` : d.getDate();
      if (!n) { celdas += `<div class="ag-dia${f === h ? ' hoy' : ''}"${tip(diaTip(f), 'Sin llamadas con estos filtros')}><span class="ag-dia-n">${num}</span></div>`; continue; }
      const gs = gruposDia(ls), cupo = puntosPorGrupo(gs, n, 5), mostrados = cupo.reduce((a, b) => a + b, 0);
      const plata = ls.filter(r => r.Estado === 'Cerrada').reduce((a, r) => a + montoDe(r), 0);
      // un punto por llamada (hasta 5): el tooltip de cada uno dice "estado: cantidad" del día y quiénes son
      const pts = gs.map((x, i) => Array.from({ length: cupo[i] }, () => `<i style="--ag:${x.col}" data-seg="${uiEsc(x.g)}"${tip(`${x.g}: ${uiNum(x.ls.length)} de ${uiNum(n)}`,
        x.ls.slice(0, 4).map(r => `${horaDe(r) || '--:--'} · ${r.Nombre || 'Sin nombre'} · ${closerDe(r)}`), x.ls.length > 4 ? `y ${x.ls.length - 4} más` : '', 'Clic: abrir el día en la primera')} onclick="event.stopPropagation();agCenDia('${f}','${x.ls[0]._row}')"></i>`).join('')).join('');
      celdas += `<div class="ag-dia con${f === h ? ' hoy' : ''}${f < h ? ' pasado' : ''}" onclick="agCenDia('${f}')"${tip(`${diaTip(f)} · ${plural(n, 'llamada')}`, repartoTxt(gs), plata ? `Cerradas: ${usdT(plata)} en monto` : '', 'Clic: ver las tarjetas del día')}>
            <span class="ag-dia-n">${num}</span>
            <button type="button" class="ag-dia-info" onclick="event.stopPropagation();agCenInfoDia('${f}')"${tip('Resumen del día', 'Por estado, closer, canal y capital')}>${uiIco('barras', 11)}Info</button>
            <b class="ag-dia-tot">${plural(n, 'llamada')}</b>
            <span class="ag-dia-pts ag-hl">${pts}${n > mostrados ? `<em${tip(`+${uiNum(n - mostrados)}: el día tiene ${plural(n, 'llamada')}`, repartoTxt(gs))}>+${n - mostrados}</em>` : ''}</span>
          </div>`;
    }
    return `<div class="ag-semh">${DIAS_C.map(x => `<span>${x}</span>`).join('')}</div><div class="ag-mes">${celdas}</div>`;
  }
  function cenSemana(R, lista) {
    const h = hoyAR();
    let cols = '';
    for (let f = R.desde; f <= R.hasta; f = uiSumarDias(f, 1)) {
      const ls = lista.filter(r => fechaDe(r) === f).sort((a, b) => horaDe(a).localeCompare(horaDe(b)));
      const d = uiF(f);
      cols += `<div class="ag-scol${f === h ? ' hoy' : ''}">
        <button type="button" class="ag-scol-h${ls.length ? '' : ' vacio'}"${ls.length ? ` onclick="agCenDia('${f}')"${tip(`${diaTip(f)} · ${plural(ls.length, 'llamada')}`, repartoTxt(gruposDia(ls)), 'Clic: ver las tarjetas del día')}` : ` aria-disabled="true"${tip(diaTip(f), 'Sin llamadas con estos filtros')}`}><span>${DIAS_C[d.getDay()]}</span><b>${d.getDate()}</b><em>${ls.length ? plural(ls.length, 'llamada') : '—'}</em></button>
        <div class="ag-scol-l">${ls.map(r => `<button type="button" class="ag-mini" onclick="agCenDia('${f}','${r._row}')" style="--ag:${colorPunto(r)}"${tip(r.Nombre || 'Sin nombre', `${horaDe(r) || '--:--'} · ${r.Estado || 'Sin estado'}`, `${closerDe(r)} · ${canalDe(r)}${capDe(r) ? ' · capital ' + capDe(r) : ''}`)}><i></i><span>${uiEsc(horaDe(r) || '--:--')}</span><b>${uiEsc(r.Nombre || 'Sin nombre')}</b></button>`).join('')}</div>
      </div>`;
    }
    return `<div class="ag-semana">${cols}</div>`;
  }
  function cenDiaVista(R, lista) {
    const ls = lista.filter(r => fechaDe(r) === R.desde).sort((a, b) => horaDe(a).localeCompare(horaDe(b)));
    return ls.length ? `<div class="ag-cards">${ls.map(tarjeta).join('')}</div>` : uiVacio({ ico: 'calendario', titulo: 'Sin llamadas este día', texto: 'Con los filtros de arriba no hay ninguna agenda para este día.' });
  }
  function cenLista(lista) {
    if (!lista.length) return uiVacio({ ico: 'lista', titulo: 'Nada para mostrar', texto: 'Ninguna agenda coincide con la búsqueda y los filtros.' });
    const vis = lista.slice(0, AGC.tope);
    return `<div class="ag-cards">${vis.map(tarjeta).join('')}</div>${cenMas(lista.length, vis.length)}`;
  }
  function cenAgenda(lista) {
    if (!lista.length) return uiVacio({ ico: 'agenda', titulo: 'Nada para mostrar', texto: 'Ninguna agenda coincide con la búsqueda y los filtros.' });
    const vis = lista.slice(0, AGC.tope), grupos = [];
    vis.forEach(r => { const f = fechaDe(r) || 'sin fecha'; const g = grupos[grupos.length - 1]; if (g && g.f === f) g.ls.push(r); else grupos.push({ f, ls: [r] }); });
    return `<div class="ag-agenda">${grupos.map(g => `<section>
        <header>${fechaOk(g.f) ? `<b>${uiEsc(uiCap(diaLargo(g.f).split(' de ')[0]))}</b><span>${uiEsc(UI_MESES[uiF(g.f).getMonth()])} · ${plural(g.ls.length, 'llamada')}</span>${g.f === hoyAR() ? '<em>Hoy</em>' : ''}` : `<b>Sin fecha</b><span>${plural(g.ls.length, 'agenda')}</span>`}</header>
        ${g.ls.map(r => `<div class="ag-ag-f${['Cancelada', 'Descalificada'].includes(r.Estado) ? ' baja' : ''}">
          <span class="ag-ag-h ag-mono">${uiEsc(horaDe(r) || '--:--')}</span>
          <i style="--ag:${colorPunto(r)}"${tip(AGC.utm ? `Canal: ${canalDe(r)}` : `Estado: ${r.Estado || 'Sin estado'}`, `${horaDe(r) || '--:--'} · ${r.Nombre || 'Sin nombre'}`)}></i>
          <button type="button" class="ag-ag-n" onclick="agCenVerLead('${r._row}')" title="Ver lo que respondió al agendar">${uiEsc(r.Nombre || 'Sin nombre')}</button>
          <span class="ag-ag-m">${uiEsc(closerDe(r))} · ${uiEsc(canalDe(r))}${capDe(r) ? ' · ' + uiEsc(capDe(r)) : ''}</span>
          ${selEstado(r, true)}
          <button type="button" class="ag-acc-b neg" onclick="agCenChat('${r._row}')">${uiIco('mensaje', 13)}Chat</button>
        </div>`).join('')}
      </section>`).join('')}</div>${cenMas(lista.length, vis.length)}`;
  }
  // La Central de Agendas de siempre, con todas sus funciones: buscar en todo, el estado que se
  // toca y se cambia, el detalle desplegable con lo que respondió el lead y monto/gatillo/notas.
  function cenTabla(lista) {
    if (!lista.length) return uiVacio({ ico: 'tabla', titulo: AGC.invalidas ? 'No hay agendas inválidas' : 'Nada para mostrar', texto: AGC.invalidas ? 'Todas tienen fecha, nombre y algún contacto.' : 'Ninguna agenda coincide con la búsqueda y los filtros.' });
    const abiertas = ABIERTAS;
    const vis = lista.slice(0, AGC.tope);
    const filasHtml = vis.map(r => {
      const tel = telDe(r), abierta = abiertas.has(r._row), cap = capDe(r);
      return `<tr class="${esInvalida(r) ? 'inval' : ''}">
        <td class="ag-mono ag-gris">${fechaOk(fechaDe(r)) ? uiEsc(fechaDe(r)) : '<span class="ag-rojo">sin fecha</span>'}${horaDe(r) ? ' ' + uiEsc(horaDe(r)) : ''}</td>
        <td><button type="button" class="ag-tnom" onclick="agToggleDet('${r._row}')" title="Ver la info de esta llamada">${abierta ? '▾' : '▸'} ${uiEsc(r.Nombre || 'sin nombre')}</button></td>
        <td>${tel ? `<a class="ag-wa" target="_blank" rel="noopener" href="https://wa.me/${tel}">abrir</a>` : ''}</td>
        <td>${cap ? `<span class="ag-capchip" style="--ag:${CAP_COL[cap]}">${uiEsc(cap)}</span>` : `<span class="ag-gris">${uiEsc(String(r.Capital || '').slice(0, 14))}</span>`}</td>
        <td>${uiEsc(origenDe(r).nombre)}</td>
        <td class="ag-ev-cel">${chipFuente(r)} <span>${uiEsc(r.Evento)}</span></td>
        <td>${uiEsc(closerDe(r))}</td><td>${uiEsc(r.Setter)}</td>
        <td><span class="ag-estchip" style="--ag:${estTxt(r.Estado)}" title="Click para cambiar" onclick="agEditEstado(this,'${r._row}')">${uiEsc(r.Estado || '—')}</span></td>
        <td class="der ag-mono">${r.Monto ? uiEsc(pre$()) + uiEsc(r.Monto) : ''}</td><td>${uiEsc(r.Gatillo)}</td>
      </tr>` + (abierta ? `<tr class="cdet"><td colspan="11">
        ${infoLeadHtml(r)}
        ${estChips(r._row, r.Estado)}
        <div class="cdet-campos">
          <label>Monto cerrado (${MON()})<input value="${uiEsc(r.Monto)}" onchange="agSet('${r._row}','Monto',this.value)"></label>
          <label>Gatillo (¿qué lo hizo agendar?)<input value="${uiEsc(r.Gatillo)}" onchange="agSet('${r._row}','Gatillo',this.value)"></label>
          <label>Notas<input value="${uiEsc(r.Notas)}" onchange="agSet('${r._row}','Notas',this.value)"></label>
        </div>
        <div class="chiprow" style="margin-top:8px">
          ${r.Origen ? `<span class="chip">origen: ${uiEsc(r.Origen)}</span>` : ''}
          ${r.Evento ? `<span class="chip">${uiEsc(r.Evento)}</span>` : ''}
          ${r.Setter ? `<span class="chip">setter: ${uiEsc(r.Setter)}</span>` : ''}
          ${tel ? `<a class="chip b" target="_blank" rel="noopener" href="https://wa.me/${tel}">WhatsApp</a><button class="chip b" onclick="agCenChat('${r._row}')">Mandar WhatsApp</button>` : ''}
          ${fechaOk(fechaDe(r)) ? `<button class="copybtn" onclick="agCenDia('${fechaDe(r)}','${r._row}')">Abrir el día →</button>` : ''}
        </div>
      </td></tr>` : '');
    }).join('');
    return `<div class="ag-tw"><table class="ag-t ag-tcen">
      <thead><tr><th>Call</th><th>Nombre</th><th>WhatsApp</th><th>Capital</th><th>Origen</th><th>Evento</th><th>Closer</th><th>Setter</th><th>Estado</th><th class="der">Monto</th><th>Gatillo</th></tr></thead>
      <tbody>${filasHtml}</tbody></table></div>${cenMas(lista.length, vis.length)}`;
  }
  const cenMas = (total, vistos) => total > vistos ? `<div class="ag-mas"><button type="button" class="ag-btn3" onclick="agCenMas()">Ver ${uiNum(Math.min(300, total - vistos))} más (quedan ${uiNum(total - vistos)})</button></div>` : '';

  /* ── la tarjeta de un lead (modal del día, vista Día y vista Tarjetas) ── */
  function selEstado(r, chico) {
    const e = r.Estado || 'Pendiente';
    const opciones = ESTADOS.includes(e) ? ESTADOS : [e, ...ESTADOS];
    return `<label class="ag-estsel${chico ? ' chico' : ''}" style="--ag:${estTxt(e)}" title="Cambiar el estado"><i></i><select onchange="agCenEstado('${r._row}',this.value)" aria-label="Estado">${opciones.map(x => `<option${x === e ? ' selected' : ''}>${uiEsc(x)}</option>`).join('')}</select>${uiIco('abajo', 12)}</label>`;
  }
  function tarjeta(r) {
    const e = r.Estado || 'Pendiente', baja = e === 'Cancelada' || e === 'Descalificada';
    const ig = String(r.Instagram || '').trim().replace(/^@/, ''), tel = String(r.WhatsApp || '').trim(), mail = String(r.Email || '').trim();
    const cap = capDe(r), canal = canalDe(r), panel = AGC.paneles.get(r._row);
    return `<article class="ag-lead${baja ? ' baja' : ''}${AGC.foco === r._row ? ' foco' : ''}" data-row="${r._row}">
      <header><b>${uiEsc(r.Nombre || 'Sin nombre')}</b>${cap ? `<span class="ag-capchip" style="--ag:${CAP_COL[cap]}" title="Capital que declaró al agendar">${uiEsc(cap)}</span>` : '<span class="ag-capchip sin" title="No declaró capital">sin capital</span>'}</header>
      <div class="ag-lead-hora">⏰ ${uiEsc(horaDe(r) || '--:--')} <span>· ${uiEsc(closerDe(r))}</span></div>
      <div class="ag-lead-src"><i style="--ag:${colCanal(canal)}"></i>${uiEsc(origenDe(r).nombre)}</div>
      <div class="ag-lead-ct">
        ${ig ? `<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">${uiIco('instagram', 14)}@${uiEsc(ig)}</a>` : ''}
        ${tel ? `<a href="https://wa.me/${telDe(r)}" target="_blank" rel="noopener" title="Abrir en mi WhatsApp">${uiIco('telefono', 14)}${uiEsc(tel)}</a>` : ''}
        ${mail ? `<span>${ico('mail', 14)}${uiEsc(mail)}</span>` : ''}
      </div>
      <div class="ag-lead-reu"><button type="button" class="ag-reu${panel === 'info' ? ' on' : ''}" onclick="agCenPanel('${r._row}','info')">${uiIco('archivo', 15)}Respuestas del lead</button><button type="button" class="ag-copiar" title="Copiar el mensaje de confirmación de la llamada" onclick="agCenCopiar('${r._row}')">${uiIco('copiar', 13)}</button></div>
      <div class="ag-lead-acc">
        ${baja
          ? `<button type="button" class="ag-acc-b" onclick="agCenPanel('${r._row}','reg')">${uiIco('telefono', 13)}Editar</button>`
          : `${selEstado(r)}<button type="button" class="ag-acc-b oro${panel === 'reg' ? ' on' : ''}" onclick="agCenPanel('${r._row}','reg')">${uiIco('telefono', 13)}Registrar</button>`}
        <button type="button" class="ag-acc-b neg" onclick="agCenChat('${r._row}')">${uiIco('mensaje', 13)}Chat</button>
        ${baja ? `<span class="ag-baja">${uiEsc(e)}</span>` : ''}
      </div>
      ${panel === 'info' ? panelInfo(r) : panel === 'reg' ? panelReg(r) : ''}
    </article>`;
  }
  function panelInfo(r) {
    return `<div class="ag-lead-x ag-info">
      ${infoLeadHtml(r)}
      <div class="ag-info-chips">
        ${r.Evento ? `<span>${uiEsc(r.Evento)}</span>` : ''}${chipFuente(r)}
        <span>Setter: ${uiEsc(setterDe(r))}</span><span>Agendó: ${uiEsc(String(r.Timestamp || '—'))}</span>
      </div>
      ${r.Gatillo ? `<p><b>Gatillo:</b> ${uiEsc(r.Gatillo)}</p>` : ''}${r.Notas ? `<p class="ag-notas"><b>Notas:</b> ${uiEsc(r.Notas)}</p>` : ''}
    </div>`;
  }
  function panelReg(r, estadoPre) {
    const closers = tabClosersDisponibles();
    const act = esReal(canon(r.Closer)) ? canon(r.Closer) : '';
    if (act && !closers.includes(act)) closers.push(act);
    const e = estadoPre || r.Estado || 'Pendiente';
    return `<div class="ag-lead-x ag-regf">
      <div class="ag-regg">
        <label><span>Estado</span><select class="agr-e">${(ESTADOS.includes(e) ? ESTADOS : [e, ...ESTADOS]).map(x => `<option${x === e ? ' selected' : ''}>${uiEsc(x)}</option>`).join('')}</select></label>
        <label><span>Closer</span><select class="agr-c"><option value="">— sin closer —</option>${closers.map(c => `<option value="${uiEsc(c)}"${c === act ? ' selected' : ''}>${uiEsc(c)}</option>`).join('')}</select></label>
        <label><span>Monto cerrado (${MON()})</span><input class="agr-m" inputmode="decimal" value="${uiEsc(r.Monto)}" placeholder="ej. 1000"></label>
        <label><span>Gatillo</span><input class="agr-g" value="${uiEsc(r.Gatillo)}" placeholder="¿Qué lo hizo agendar?"></label>
        <label class="ancho"><span>Notas</span><textarea class="agr-n" rows="2">${uiEsc(r.Notas)}</textarea></label>
      </div>
      <div class="ag-regacc"><button type="button" class="ag-btn3 chico" onclick="agCenPanel('${r._row}','reg')">Cancelar</button><button type="button" class="ag-btnp chico" onclick="agCenGuardarReg(this)">Guardar</button></div>
    </div>`;
  }
  function repintarTarjeta(row) {
    const r = rowDe(row);
    if (!r) return;
    document.querySelectorAll(`.ag-lead[data-row="${row}"]:not(.ag-lead-modal)`).forEach(el => { el.outerHTML = tarjeta(r); });
  }

  /* ── modal del día ── */
  // AGC.diaSub = {t, v} cuando se abrió desde una fila del "Info" del día (solo las de ese estado,
  // closer, canal o capital); si no, el filtro de estado de arriba.
  const DIA_SUB = { estado: (r) => r.Estado || 'Sin estado', closer: (r) => closerDe(r), canal: (r) => canalDe(r), capital: (r) => capDe(r) || 'Sin dato' };
  function cenDelDia(f) {
    const sub = AGC.diaSub && DIA_SUB[AGC.diaSub.t] ? (r) => DIA_SUB[AGC.diaSub.t](r) === AGC.diaSub.v : pasaEstado;
    return cenBase().filter(r => fechaDe(r) === f).filter(sub).sort((a, b) => horaDe(a).localeCompare(horaDe(b)));
  }
  function cenModalCuerpo(ls) {
    return ls.length ? ls.map(tarjeta).join('') : '<div class="ag-vacio">Sin llamadas este día con los filtros de arriba.</div>';
  }
  const diaSubTxt = () => (AGC.diaSub ? ` · ${AGC.diaSub.t === 'capital' ? 'capital ' : ''}${AGC.diaSub.v}` : '');
  window.agCenDia = (f, foco, sub) => {
    AGC.dia = f; AGC.foco = foco || null; AGC.diaSub = sub || null;
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    const ls = cenDelDia(f);
    uiModalAbrir({ titulo: diaLargo(f), sub: plural(ls.length, 'llamada') + diaSubTxt(), cuerpo: cenModalCuerpo(ls), ancho: '448px' });
    const m = document.querySelector('#uiModal .ui-modal');
    if (m) m.classList.add('ag-modal-dia');
    subirModales();
    if (foco) setTimeout(() => { const c = document.querySelector(`#uiModal .ag-lead[data-row="${foco}"]`); if (c) c.scrollIntoView({ block: 'center' }); }, 30);
  };
  window.agCenDiaSub = (f, t, v) => window.agCenDia(f, null, { t, v });
  function cenModalRefrescar() {
    const m = document.querySelector('#uiModal.open .ui-modal.ag-modal-dia');
    if (!m || !AGC.dia) return;
    const a = document.activeElement;
    if (a && m.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;   // no pisar lo que se está escribiendo
    const b = m.querySelector('.ui-modal-b'), st = b ? b.scrollTop : 0;
    const ls = cenDelDia(AGC.dia);
    if (b) { b.innerHTML = cenModalCuerpo(ls); b.scrollTop = st; }
    const sub = m.querySelector('header span'); if (sub) sub.textContent = plural(ls.length, 'llamada') + diaSubTxt();
  }
  // "Info" del día: el resumen sin abrir las tarjetas (por estado, closer, canal y capital). Cada
  // fila dice su parte del día y abre solo esas tarjetas.
  window.agCenInfoDia = (f) => {
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    const ls = cenBase().filter(r => fechaDe(r) === f);
    const cuenta = (fn) => { const m = {}; ls.forEach(r => { const k = fn(r); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const bloque = (titulo, t, colorDe) => `<div class="ag-idia-b"><span class="ag-idia-t">${titulo}</span>${cuenta(DIA_SUB[t]).map(([k, n]) => `<div class="ag-idia-f" data-t="${t}" data-v="${uiEsc(k)}" onclick="agCenDiaSub('${f}',this.dataset.t,this.dataset.v)"${tip(`${titulo} · ${k}`, `${plural(n, 'llamada')} · ${pct(n, ls.length, 0)} del día`, 'Clic: ver esas tarjetas')}><i style="--ag:${colorDe(k)}"></i><span>${uiEsc(k)}</span><b>${uiNum(n)}</b><u style="--ag:${colorDe(k)};width:${ls.length ? (100 * n / ls.length).toFixed(1) : 0}%"></u></div>`).join('')}</div>`;
    const cerr = ls.filter(r => r.Estado === 'Cerrada');
    uiModalAbrir({
      titulo: 'Resumen del ' + diaLargo(f).split(', ')[1], sub: `${plural(ls.length, 'llamada')} · ${plural(cerr.length, 'cerrada')}${cerr.length ? ' · ' + usd(cerr.reduce((a, r) => a + montoDe(r), 0)) : ''}`,
      cuerpo: `<div class="ag-idia">
        ${bloque('Por estado', 'estado', k => estDe(k).col)}
        ${bloque('Por closer', 'closer', k => colorPersona(k))}
        ${bloque('Por canal', 'canal', k => colCanal(k))}
        ${bloque('Capital declarado', 'capital', k => CAP_COL[k] || '#525252')}
      </div>`,
      acciones: [{ texto: `Ver las ${plural(ls.length, 'llamada')}`, onclick: `agCenDia('${f}')`, pri: true }], ancho: '620px',
    });
  };

  /* ── etapas 02 a 06 ── */
  function cenEtapa(base) {
    const c = cenCuentas(base);
    if (AGC.etapa === 'precall') return cenEtPre(c.pre);
    if (AGC.etapa === 'postcall') return cenEtPost(c.post);
    if (AGC.etapa === 'grabaciones') return cenEtGrab();
    if (AGC.etapa === 'revision') return cenEtRev(c.rev);
    return cenEtCual(c.cual);
  }
  const etH = (titulo, texto, der) => `<div class="ag-et-h"><div><h3>${titulo}</h3><p>${texto}</p></div>${der || ''}</div>`;
  function filaLead(r, acciones) {
    const f = fechaDe(r), h = hoyAR();
    return `<div class="ag-fila" data-row="${r._row}">
      <span class="ag-fila-c"><b class="ag-mono">${uiEsc(horaDe(r) || '--:--')}</b><small>${f === h ? 'HOY' : f === uiSumarDias(h, 1) ? 'MAÑANA' : uiEsc(uiFechaCorta(f))}</small></span>
      <span class="ag-fila-n"><button type="button" onclick="agCenVerLead('${r._row}')" title="Ver lo que respondió al agendar">${uiEsc(r.Nombre || 'Sin nombre')}</button>
        <small>${uiEsc(closerDe(r))} · ${uiEsc(canalDe(r))}${capDe(r) ? ` · <i style="--ag:${CAP_COL[capDe(r)]}">${uiEsc(capDe(r))}</i>` : ''}</small></span>
      <span class="ag-estchip" style="--ag:${estTxt(r.Estado)}">${uiEsc(r.Estado || '—')}</span>
      <span class="ag-fila-a">${acciones}</span>
    </div>`;
  }
  function cenEtPre(ls) {
    ls = ls.slice().sort((a, b) => fkey(a).localeCompare(fkey(b)));
    const acc = (r) => `<button type="button" class="ag-acc-b" onclick="agSet('${r._row}','Estado','Confirmada')">✓ Confirmada</button>
      <button type="button" class="ag-acc-b" onclick="agSet('${r._row}','Estado','Re-agenda')">↺ Re-agenda</button>
      <button type="button" class="ag-acc-b rojo" onclick="agCenDescalificar('${r._row}')">✕ Descalificar</button>
      <button type="button" class="ag-acc-b neg" onclick="agCenChat('${r._row}')">${uiIco('mensaje', 13)}Chat</button>
      <button type="button" class="ag-copiar" title="Copiar el mensaje de confirmación" onclick="agCenCopiar('${r._row}')">${uiIco('copiar', 13)}</button>`;
    return etH('Pre-call · hoy, mañana y pasado mañana', 'Confirmar cada llamada antes de que pase: el mensaje de confirmación se copia o se abre en WhatsApp. Mismas reglas que la pestaña Pre-call, que tiene el dossier de cada lead.', `<a class="ui-link" href="#precall">Abrir Pre-call →</a>`)
      + (ls.length ? `<div class="ag-filas">${ls.map(r => filaLead(r, acc(r))).join('')}</div>` : uiVacio({ ico: 'check', titulo: 'Nada para confirmar', texto: 'No hay llamadas pendientes de hoy a pasado mañana con estos filtros.' }));
  }
  function cenEtPost(ls) {
    const m = {};
    ls.forEach(r => { const k = closerDe(r); m[k] = (m[k] || 0) + 1; });
    const chips = Object.entries(m).sort((a, b) => b[1] - a[1]);
    if (AGC.post && !m[AGC.post]) AGC.post = '';
    const vis = ls.filter(r => !AGC.post || closerDe(r) === AGC.post).sort((a, b) => fkey(b).localeCompare(fkey(a)));
    const acc = (r) => `<button type="button" class="ag-acc-b" onclick="agSet('${r._row}','Estado','Presentada')">Presentada</button>
      <button type="button" class="ag-acc-b" onclick="agSet('${r._row}','Estado','No-show')">No-show</button>
      <button type="button" class="ag-acc-b verde" onclick="agCenRegistrarModal('${r._row}','Cerrada')">Cerrada…</button>
      <button type="button" class="ag-acc-b" onclick="agSet('${r._row}','Estado','Cancelada')">Cancelada</button>`;
    return etH('Post-call · cargar qué pasó', 'Llamadas de los últimos 30 días que siguen en Pendiente o Confirmada. Mientras no se cargan, el show-up y la tasa de cierre no las ven.')
      + (chips.length > 1 ? `<div class="ag-pills ag-pills-c"><button type="button" class="ag-pill2${!AGC.post ? ' on' : ''}" data-v="" onclick="agCenPost(this.dataset.v)">Todos · ${uiNum(ls.length)}</button>${chips.map(([k, n]) => `<button type="button" class="ag-pill2${AGC.post === k ? ' on' : ''}" data-v="${uiEsc(k)}" onclick="agCenPost(this.dataset.v)">${uiEsc(k)} · ${uiNum(n)}</button>`).join('')}</div>` : '')
      + (vis.length ? `<div class="ag-filas">${vis.slice(0, AGC.tope).map(r => filaLead(r, acc(r))).join('')}</div>${cenMas(vis.length, Math.min(vis.length, AGC.tope))}` : uiVacio({ ico: 'check', titulo: 'Todo cargado', texto: 'Ninguna llamada de los últimos 30 días quedó sin resultado.' }));
  }
  // 04 · Grabaciones: en el hub original, las llamadas grabadas en Fathom y analizadas por la IA. Acá se conecta más adelante:
  // el lugar queda marcado para que nadie lo busque en otro lado.
  function cenEtGrab() {
    return etH('Grabaciones', 'Las llamadas de venta que graban los closers en Fathom, con su análisis con IA (score, objeciones y transcripción).')
      + uiVacio({ ico: 'video', titulo: 'Fathom se conecta más adelante', texto: 'Cuando esté conectado, cada llamada grabada aparece acá y la IA la puntúa sola con la misma rúbrica de Análisis. Mientras tanto, las llamadas hechas se evalúan a mano en Análisis.', cta: { texto: 'Abrir Análisis', onclick: "location.hash='#analisis'" } });
  }
  function cenEtRev(ls) {
    if (!ls) { anaCargar(); return etH('Revisión de llamadas', 'Llamadas que se hicieron y nadie evaluó.') + '<div class="ag-cargando">Leyendo las evaluaciones…</div>'; }
    const vis = ls.slice().sort((a, b) => fkey(b).localeCompare(fkey(a)));
    const acc = (r) => `<button type="button" class="ag-acc-b oro" onclick="agAnaEvaluar('${r._row}')">${ico('portacheck', 13)}Evaluar</button>`;
    const txt = 'Llamadas hechas de los últimos 30 días sin evaluar: se evalúan a mano con la rúbrica (score general, del lead, interés y urgencia).';
    return etH('Revisión · llamadas sin evaluar', txt, `<a class="ui-link" href="#analisis">Abrir Análisis →</a>`)
      + (vis.length ? `<div class="ag-filas">${vis.slice(0, AGC.tope).map(r => filaLead(r, acc(r))).join('')}</div>${cenMas(vis.length, Math.min(vis.length, AGC.tope))}` : uiVacio({ ico: 'check', titulo: 'Todas evaluadas', texto: 'Las llamadas de los últimos 30 días ya tienen su evaluación.' }));
  }
  const URG_NIVEL = (t) => { const s = norm(t); return !s ? null : /ya mismo|de una/.test(s) ? 'ya' : /semana/.test(s) ? 'semanas' : /mes/.test(s) ? 'meses' : 'nose'; };
  const URG_TXT = { ya: 'quiere arrancar ya', semanas: 'arranca en 2-4 semanas', meses: 'arranca en unos meses', nose: 'sin fecha para arrancar' };
  function cenEtCual(ls) {
    const sinNeg = (r) => /^no |^no$|no tengo|todavia no|otro nicho/i.test(norm(r.Negocio));
    const sinForm = (r) => !['Negocio', 'Facturacion', 'Urgencia', 'Decisor', 'Objetivo'].some(k => String(r[k] || '').trim());
    const F = {
      todas: [() => true, 'Todas'], cap2: [r => ['2-3K', '>3K'].includes(capDe(r)), 'Capital +2K'], cap1: [r => capDe(r) === '<1K', 'Capital <1K'],
      ya: [r => URG_NIVEL(r.Urgencia) === 'ya', 'Quiere arrancar ya'], sinneg: [sinNeg, 'Sin negocio'], sinform: [sinForm, 'Sin formulario'],
    };
    if (!F[AGC.cual]) AGC.cual = 'todas';
    const vis = ls.filter(F[AGC.cual][0]).sort((a, b) => fkey(a).localeCompare(fkey(b)));
    const celda = (t, max) => { const s = String(t || '').trim(); return s ? `<span title="${uiEsc(s)}">${uiEsc(s.length > max ? s.slice(0, max) + '…' : s)}</span>` : '<span class="ag-gris">—</span>'; };
    return etH('Cualificación de las próximas', 'Lo que respondió cada lead al agendar, para llegar a la llamada sabiendo con quién se habla (y descalificar antes si no aplica).')
      + `<div class="ag-pills ag-pills-c">${Object.entries(F).map(([id, [fn, t]]) => `<button type="button" class="ag-pill2${AGC.cual === id ? ' on' : ''}" onclick="agCenCual('${id}')">${t} · ${uiNum(ls.filter(fn).length)}</button>`).join('')}</div>`
      + (vis.length ? `<div class="ag-tw"><table class="ag-t ag-tcual"><thead><tr><th>Llamada</th><th>Lead</th><th>Closer</th><th>Capital</th><th>Negocio</th><th>Factura</th><th>Urgencia</th><th>Decisor</th><th></th></tr></thead><tbody>
          ${vis.slice(0, AGC.tope).map(r => `<tr>
            <td class="ag-mono ag-gris">${uiEsc(uiFechaCorta(fechaDe(r)))} ${uiEsc(horaDe(r))}</td>
            <td><button type="button" class="ag-tnom" onclick="agCenVerLead('${r._row}')">${uiEsc(r.Nombre || 'Sin nombre')}</button></td>
            <td>${uiEsc(closerDe(r))}</td>
            <td>${capDe(r) ? `<span class="ag-capchip" style="--ag:${CAP_COL[capDe(r)]}">${uiEsc(capDe(r))}</span>` : '<span class="ag-gris">—</span>'}</td>
            <td>${celda(r.Negocio, 40)}</td><td>${celda(r.Facturacion, 40)}</td><td>${URG_TXT[URG_NIVEL(r.Urgencia)] ? `<span title="${uiEsc(r.Urgencia)}">${uiEsc(uiCap(URG_TXT[URG_NIVEL(r.Urgencia)]))}</span>` : celda(r.Urgencia, 30)}</td><td>${celda(r.Decisor, 40)}</td>
            <td class="der"><button type="button" class="ag-acc-b rojo" onclick="agCenDescalificar('${r._row}')">Descalificar</button></td>
          </tr>`).join('')}</tbody></table></div>${cenMas(vis.length, Math.min(vis.length, AGC.tope))}`
        : uiVacio({ ico: 'usuario', titulo: 'Nadie con este filtro', texto: 'Ninguna de las próximas agendas coincide.' }));
  }

  /* ── acciones de Agendas ── */
  window.agCenEtapa = (id) => { AGC.etapa = id; AGC.tope = 300; cenGuardar(); cenPintar(); tipRefrescar(); };
  window.agCenEstadoFiltro = (e) => { AGC.estado = e; cenPintar(); tipRefrescar(); };
  // el contador de Cerradas de la cabecera filtra el calendario (y lo vuelve a soltar)
  window.agCenSoloEstado = (e) => {
    const ya = AGC.estado === e && AGC.etapa === 'agendas';
    AGC.estado = ya ? '' : e; AGC.etapa = 'agendas'; AGC.tope = 300; cenGuardar(); cenPintar(); tipRefrescar();
  };
  let _tBus = null;
  window.agCenBuscar = (v) => { AGC.q = v; AGC.tope = 300; clearTimeout(_tBus); _tBus = setTimeout(cenPintar, 160); };
  window.agCenVista = (v) => { AGC.vista = v; AGC.tope = 300; cenGuardar(); cenPintar(); };
  window.agCenOrden = () => { AGC.orden = { prox: 'desc', desc: 'asc', asc: 'prox' }[AGC.orden] || 'prox'; cenGuardar(); cenPintar(); };
  window.agCenPop = (p) => { AGC.pop = AGC.pop === p ? '' : p; cenPintar(); };
  window.agCenFiltro = (campo, v) => { AGC.f[campo] = v; cenPintar(); };
  window.agCenFiltrosLimpiar = () => { AGC.f = { capital: '', origen: '', evento: '', setter: '' }; AGC.pop = ''; cenPintar(); };
  window.agCenCloserSel = (k) => { AGC.closer = k; AGC.pop = ''; cenPintar(); };
  window.agCenInvalidas = () => { AGC.invalidas = !AGC.invalidas; AGC.tope = 300; cenPintar(); };
  window.agCenPipeline = (p) => { AGC.pipeline = p; cenPintar(); };
  window.agCenUtm = () => { AGC.utm = !AGC.utm; cenGuardar(); cenPintar(); tipRefrescar(); };
  window.agCenMas = () => { AGC.tope += 300; cenPintar(); };
  window.agCenPost = (k) => { AGC.post = k; cenPintar(); };
  window.agCenCual = (id) => { AGC.cual = id; AGC.tope = 300; cenPintar(); };
  window.agCenModo = (m) => {
    AGC.modo = m;
    if (m === 'custom' && !AGC.desde) { const h = hoyAR(); AGC.desde = h; AGC.hasta = uiSumarDias(h, 13); }
    cenGuardar(); cenPintar();
  };
  window.agCenMover = (paso) => {
    const a = uiF(AGC.ancla || hoyAR());
    if (AGC.modo === 'dia') a.setDate(a.getDate() + paso);
    else if (AGC.modo === 'semana') a.setDate(a.getDate() + 7 * paso);
    else { a.setDate(1); a.setMonth(a.getMonth() + paso); }
    AGC.ancla = uiS(a); cenGuardar(); cenPintar();
  };
  window.agCenHoy = () => { AGC.ancla = hoyAR(); cenGuardar(); cenPintar(); };
  window.agCenCustom = (de, ha) => { if (de) AGC.desde = de; if (ha) AGC.hasta = ha; cenGuardar(); cenPintar(); };
  window.agCenRevisar = () => {
    const h = hoyAR();
    const sinCloser = filas().some(r => !esInvalida(r) && fechaDe(r) >= h && !['Cancelada', 'Descalificada'].includes(r.Estado) && closerDe(r) === 'Sin closer');
    if (sinCloser) { AGC.closer = 'Sin closer'; AGC.vista = 'agenda'; AGC.orden = 'prox'; AGC.estado = ''; uiToast('Filtrado: agendas sin closer. Asignalo con Registrar o desde Llamadas.'); }
    else AGC.invalidas = true;
    cenGuardar(); cenPintar();
  };
  window.agCenRefrescar = () => { cargarDatos().then(() => uiToast('Actualizado', 'ok'), (e) => uiToast('No pude actualizar: ' + e.message, 'mal')); };
  window.agCenSync = () => sincronizarYa();
  window.agCenPanel = (row, tipo) => {
    if (AGC.paneles.get(row) === tipo) AGC.paneles.delete(row); else AGC.paneles.set(row, tipo);
    repintarTarjeta(row);
  };
  window.agCenEstado = (row, v) => {
    if (v === 'Cerrada') AGC.paneles.set(row, 'reg');   // al cerrar, que quede abierto para cargar el monto
    agSet(row, 'Estado', v);
  };
  window.agCenDescalificar = (row) => {
    const r = rowDe(row); if (!r) return;
    if (!confirm(`¿Descalificar a "${r.Nombre || 'este lead'}"?`)) return;
    agSet(row, 'Estado', 'Descalificada');
  };
  window.agCenGuardarReg = async (btn) => {
    const card = btn.closest('.ag-lead'), row = (card && card.dataset.row), r = rowDe(row);
    if (!r) { uiToast('No encontré esa agenda', 'mal'); return; }
    const v = (c) => { const el = card.querySelector('.' + c); return el ? el.value : null; };
    const nuevo = { Estado: v('agr-e'), Closer: v('agr-c'), Monto: normMonto(v('agr-m')), Gatillo: v('agr-g'), Notas: v('agr-n') };
    if (nuevo.Monto && !isFinite(Number(nuevo.Monto))) { uiToast('El monto tiene que ser un número (ej. 1000)', 'mal'); return; }
    // Se compara contra lo que el formulario MOSTRÓ (closer canónico, estado por defecto), así no se
    // reescribe nada que nadie tocó: ni la grafía del closer ni la cuenta genérica de la empresa.
    const mostrado = {
      Estado: r.Estado || 'Pendiente', Closer: esReal(canon(r.Closer)) ? canon(r.Closer) : '',
      Monto: String(r.Monto == null ? '' : r.Monto).trim(), Gatillo: String(r.Gatillo || '').trim(), Notas: String(r.Notas || '').trim(),
    };
    const cambios = Object.entries(nuevo).filter(([k, val]) => val != null && String(val).trim() !== mostrado[k]);
    const enModal = card.classList.contains('ag-lead-modal');
    if (!cambios.length) { AGC.paneles.delete(row); if (enModal) uiModalCerrar(); else repintarTarjeta(row); return; }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const est = cambios.find(c => c[0] === 'Estado');
      for (const [k, val] of cambios) {
        if (k === 'Estado') continue;
        await api('POST', { row, field: k, value: val });
        r[k] = val;
      }
      AGC.paneles.delete(row);
      if (enModal) uiModalCerrar();
      if (est) await agSet(row, 'Estado', est[1]);     // repinta, guarda y refresca
      else { repintar(); cargarDatos().catch(() => { }); }
      uiToast('Guardado', 'ok');
    } catch (e) {
      uiToast('No se guardó: ' + e.message, 'mal');
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  };
  // Registrar fuera del modal del día (Post-call): el mismo formulario, en su propio modal
  window.agCenRegistrarModal = (row, estadoPre) => {
    const r = rowDe(row); if (!r) return;
    uiModalAbrir({ titulo: 'Registrar resultado', sub: `${r.Nombre || 'Sin nombre'} · ${uiFechaCorta(fechaDe(r))} ${horaDe(r)} · ${closerDe(r)}`,
      cuerpo: `<div class="ag-lead ag-lead-modal" data-row="${row}">${panelReg(r, estadoPre)}</div>`, ancho: '560px' });
    setTimeout(() => { const i = document.querySelector('#uiModal .agr-m'); if (i && estadoPre === 'Cerrada') i.focus(); }, 40);
  };
  window.agCenCopiar = (row) => { const r = rowDe(row); if (r) copiarTexto(waTexto(r), 'Mensaje de confirmación copiado'); };
  window.agCenChat = (row) => {
    const r = rowDe(row); if (!r) return;
    if (!telDe(r)) { uiToast('Este lead no tiene WhatsApp cargado', 'mal'); return; }
    subirModales();
    abrirWpp(row);
  };
  window.agCenVerLead = (row) => { subirModales(); verInfoLead(row); };

  // + Agendar llamada: el mismo alta manual del Pipeline (action add de /api/panel)
  window.agCenNueva = () => {
    const closers = tabClosersDisponibles();
    const oris = [...new Set(filas().map(r => String(r.Origen || '').trim()).filter(Boolean))].sort();
    uiModalAbrir({
      titulo: 'Agendar llamada', sub: 'Alta manual: queda Pendiente en el pipeline, igual que el "+ Agendar" del Pipeline.',
      cuerpo: `<div class="ui-campos ag-dos">
        <label class="ui-campo"><span>Nombre *</span><input name="Nombre" autocomplete="off"></label>
        <label class="ui-campo"><span>WhatsApp</span><input name="WhatsApp" inputmode="tel" placeholder="+código de país y número"></label>
        <label class="ui-campo"><span>Fecha de la llamada *</span><input name="Fecha call" type="date" value="${hoyAR()}"></label>
        <label class="ui-campo"><span>Hora</span><input name="Hora" type="time"></label>
        <label class="ui-campo"><span>Capital</span><select name="Capital"><option value="">—</option>${['<1K', '1-2K', '2-3K', '>3K'].map(c => `<option>${uiEsc(c)}</option>`).join('')}</select></label>
        <label class="ui-campo"><span>Origen</span><input name="Origen" list="agOris" placeholder="MASTERCLASS, IG…"><datalist id="agOris">${oris.map(o => `<option value="${uiEsc(o)}">`).join('')}</datalist></label>
        <label class="ui-campo"><span>Closer</span><select name="Closer"><option value="">— sin closer —</option>${closers.map(c => `<option>${uiEsc(c)}</option>`).join('')}</select></label>
        <label class="ui-campo"><span>Setter</span><input name="Setter"></label>
        <label class="ui-campo"><span>Email</span><input name="Email" type="email"></label>
      </div>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Agendar', onclick: 'agCenGuardarNueva(this)', pri: true }], ancho: '620px',
    });
  };
  window.agCenGuardarNueva = async (btn) => {
    const m = btn.closest('.ui-modal');
    const v = (n) => { const el = m.querySelector(`[name="${n}"]`); return el ? String(el.value || '').trim() : ''; };
    const data = { Nombre: v('Nombre'), WhatsApp: v('WhatsApp'), Email: v('Email'), 'Fecha call': v('Fecha call'), Hora: v('Hora'), Capital: v('Capital'), Origen: v('Origen'), Closer: v('Closer'), Setter: v('Setter') };
    if (!data.Nombre || !data['Fecha call']) { uiToast('Faltan el nombre y la fecha', 'mal'); return; }
    Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });
    data.Estado = 'Pendiente';
    data.Timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    btn.disabled = true; btn.textContent = 'Agendando…';
    try { await api('POST', { action: 'add', ...data }); uiModalCerrar(); uiToast('Llamada agendada', 'ok'); cargarDatos().catch(() => { }); }
    catch (e) { uiToast('No se pudo crear: ' + e.message, 'mal'); btn.disabled = false; btn.textContent = 'Agendar'; }
  };

  // Importar: CSV con encabezados (Nombre, WhatsApp, Fecha, Hora, Capital, Origen, Closer…)
  const IMP_COLS = {
    'Nombre': ['nombre', 'name', 'lead', 'nombre completo', 'full name'], 'WhatsApp': ['whatsapp', 'telefono', 'phone', 'celular', 'wpp', 'tel'],
    'Email': ['email', 'mail', 'correo', 'e-mail'], 'Fecha call': ['fecha call', 'fecha', 'date', 'dia', 'fecha de la llamada'], 'Hora': ['hora', 'time', 'horario'],
    'Capital': ['capital'], 'Origen': ['origen', 'utm', 'utm_source', 'fuente', 'source'], 'Closer': ['closer'], 'Setter': ['setter'], 'Instagram': ['instagram', 'ig', 'usuario'],
  };
  function parseCsv(txt) {
    const pri = (txt.split(/\r?\n/)[0] || '');
    const sep = (pri.match(/;/g) || []).length > (pri.match(/,/g) || []).length ? ';' : (pri.includes('\t') ? '\t' : ',');
    const out = []; let fila = [], campo = '', comillas = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (comillas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else comillas = false; } else campo += c; }
      else if (c === '"') comillas = true;
      else if (c === sep) { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; fila.push(campo); out.push(fila); fila = []; campo = ''; }
      else campo += c;
    }
    if (campo || fila.length) { fila.push(campo); out.push(fila); }
    return out.filter(f => f.some(x => String(x).trim()));
  }
  function fechaImp(s) {
    const t = String(s || '').trim();
    let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }
  function importLeer(txt) {
    const t = parseCsv(String(txt || '').replace(/^﻿/, ''));
    if (t.length < 2) return { filas: [], error: t.length ? 'Falta al menos una fila además de los encabezados.' : '' };
    const cab = t[0].map(norm);
    const idx = {};
    Object.entries(IMP_COLS).forEach(([campo, alias]) => { const i = cab.findIndex(h => alias.includes(h)); if (i >= 0) idx[campo] = i; });
    if (idx.Nombre == null || idx['Fecha call'] == null) return { filas: [], error: 'No encontré las columnas Nombre y Fecha en el encabezado.' };
    const out = t.slice(1, 101).map(f => {
      const d = {};
      Object.entries(idx).forEach(([campo, i]) => { const val = String(f[i] || '').trim(); if (val) d[campo] = val; });
      if (d['Fecha call']) d['Fecha call'] = fechaImp(d['Fecha call']);
      if (d.Hora) { const m = d.Hora.match(/^(\d{1,2}):(\d{2})/); d.Hora = m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; if (!d.Hora) delete d.Hora; }
      d._ok = !!(d.Nombre && d['Fecha call']);
      return d;
    });
    return { filas: out, error: '', truncado: t.length - 1 > 100 };
  }
  window.agCenImportar = () => {
    AGC.imp = null;
    uiModalAbrir({
      titulo: 'Importar agendas', sub: 'Un CSV con encabezados: Nombre y Fecha obligatorios; WhatsApp, Email, Hora, Capital, Origen, Closer, Setter e Instagram si los tenés. Hasta 100 por vez.',
      cuerpo: `<div class="ag-imp">
        <label class="ag-imp-f">${uiIco('subir', 18)}<span>Elegir archivo .csv</span><input type="file" accept=".csv,text/csv,text/plain" onchange="agCenImportArchivo(this)"></label>
        <textarea class="ag-imp-t" placeholder="…o pegá el CSV acá (Nombre,WhatsApp,Fecha,Hora,Capital,Origen,Closer)" oninput="agCenImportPrev(this.value)"></textarea>
        <div id="agImpPrev" class="ag-imp-prev"></div>
      </div>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Importar', onclick: 'agCenImportOk(this)', pri: true }], ancho: '760px',
    });
  };
  window.agCenImportArchivo = (inp) => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const t = document.querySelector('#uiModal .ag-imp-t'); if (t) t.value = rd.result; window.agCenImportPrev(rd.result); };
    rd.readAsText(f);
  };
  window.agCenImportPrev = (txt) => {
    const box = $('agImpPrev'); if (!box) return;
    const L = importLeer(txt);
    AGC.imp = L;
    if (L.error) { box.innerHTML = `<div class="ag-banda">${uiEsc(L.error)}</div>`; return; }
    if (!L.filas.length) { box.innerHTML = ''; return; }
    const ok = L.filas.filter(x => x._ok).length;
    box.innerHTML = `<p class="ag-imp-res"><b>${plural(ok, 'agenda')}</b> para importar${L.filas.length - ok ? ` · <span class="ag-rojo">${L.filas.length - ok} sin nombre o sin fecha válida (se saltean)</span>` : ''}${L.truncado ? ' · solo las primeras 100' : ''}</p>
      <div class="ag-tw"><table class="ag-t"><thead><tr><th></th><th>Nombre</th><th>Fecha</th><th>Hora</th><th>WhatsApp</th><th>Capital</th><th>Origen</th><th>Closer</th></tr></thead><tbody>
      ${L.filas.slice(0, 8).map(d => `<tr><td>${d._ok ? '<span class="ag-verde">✓</span>' : '<span class="ag-rojo">✕</span>'}</td><td>${uiEsc(d.Nombre || '—')}</td><td class="ag-mono">${uiEsc(d['Fecha call'] || '—')}</td><td class="ag-mono">${uiEsc(d.Hora || '')}</td><td>${uiEsc(d.WhatsApp || '')}</td><td>${uiEsc(d.Capital || '')}</td><td>${uiEsc(d.Origen || '')}</td><td>${uiEsc(d.Closer || '')}</td></tr>`).join('')}
      </tbody></table></div>${L.filas.length > 8 ? `<p class="ag-gris ag-imp-res">…y ${L.filas.length - 8} más.</p>` : ''}`;
  };
  window.agCenImportOk = async (btn) => {
    const L = AGC.imp, ok = L ? L.filas.filter(x => x._ok) : [];
    if (!ok.length) { uiToast('No hay agendas válidas para importar', 'mal'); return; }
    if (!confirm(`Se van a agregar ${ok.length} agendas al pipeline, en estado Pendiente.\n\n¿Seguro?`)) return;
    btn.disabled = true;
    let hechas = 0;
    for (const d of ok) {
      btn.textContent = `Importando ${hechas + 1}/${ok.length}…`;
      const data = Object.fromEntries(Object.entries(d).filter(([k]) => k !== '_ok'));
      data.Estado = 'Pendiente'; data.Timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      try { await api('POST', { action: 'add', ...data }); hechas++; }
      catch (e) { uiToast(`Se cortó en la ${hechas + 1}: ${e.message}`, 'mal'); break; }
    }
    uiModalCerrar();
    uiToast(`${plural(hechas, 'agenda importada', 'agendas importadas')}`, hechas ? 'ok' : 'mal');
    cargarDatos().catch(() => { });
  };
  window.agCenExportar = () => {
    const R = cenRango();
    let lista = AGC.ultimaLista || [];
    if (AGC.etapa !== 'agendas') { const c = cenCuentas(cenBase()); lista = { precall: c.pre, postcall: c.post, revision: c.rev || [], cualif: c.cual }[AGC.etapa] || []; }
    if (!lista.length) { uiToast('No hay agendas para exportar con estos filtros'); return; }
    descargar(`agendas_${AGC.invalidas ? 'invalidas' : R.desde + '_' + R.hasta}.csv`, csvTexto(ordenar(lista.slice()), [
      ['Fecha', fechaDe], ['Hora', horaDe], ['Nombre', r => r.Nombre], ['WhatsApp', r => r.WhatsApp], ['Email', r => r.Email], ['Instagram', r => r.Instagram],
      ['Capital', r => r.Capital], ['Origen', r => r.Origen], ['Canal', canalDe], ['Evento', r => r.Evento], ['Closer', closerDe], ['Setter', setterDe],
      ['Estado', r => r.Estado], ['Monto', r => r.Monto], ['Gatillo', r => r.Gatillo], ['Notas', r => r.Notas],
      ['Negocio', r => r.Negocio], ['Facturación', r => r.Facturacion], ['Urgencia', r => r.Urgencia], ['Decisor', r => r.Decisor],
    ]));
    uiToast(`${plural(lista.length, 'agenda exportada', 'agendas exportadas')}`, 'ok');
  };

  /* ═══════════════════════════ 3 · ANÁLISIS ═══════════════════════════ */
  // La calidad de las llamadas, evaluadas a mano con la rúbrica: las evaluaciones van a la colección ag-evaluaciones
  // de /api/db y la rúbrica a ag-config (escriben equipo y cliente). En el hub original además la IA analizaba sola las
  // grabaciones de Fathom: eso se conecta más adelante y su lugar queda marcado (anaFathom).
  const PER_ANA = 'agendas-analisis';
  const COL_EV = 'ag-evaluaciones', COL_CFG = 'ag-config';
  const AGA = { sub: 'resumen', q: '', res: '', man: '', evals: null, err: '', rubrica: null, cargando: false, tope: 200 };
  try { const s = JSON.parse(sessionStorage.getItem('mhqag:ana') || '{}'); if (s.sub) AGA.sub = s.sub; } catch (e) { }
  const BANDAS = [
    { id: 'exc', t: 'Excelente', r: '≥9', min: 9, col: VERDE }, { id: 'bue', t: 'Bueno', r: '7–9', min: 7, col: '#d4a53a' },
    { id: 'reg', t: 'Regular', r: '5–7', min: 5, col: '#fb923c' }, { id: 'baj', t: 'Bajo', r: '<5', min: -1, col: ROSA },
  ];
  const banda = (s) => BANDAS.find(b => Number(s) >= b.min) || BANDAS[3];
  const nScore = (v) => uiNum(Number(v), 1);   // "8,5": coma decimal, como los porcentajes
  const prom = (ls, k) => { const v = ls.map(x => Number(x[k])).filter(isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const RUBRICA_DEF = {
    score: 'Cómo llevó la llamada el closer: diagnóstico del caso, presentación del programa, manejo de objeciones y cierre o próximo paso claro.',
    lead: 'Qué tan buen prospecto es: capital disponible, negocio o proyecto concreto y si decide solo o vino con quien decide.',
    interes: 'Cuánto quiere el programa: hace preguntas, se imagina adentro, pide precio o forma de pago.',
    urgencia: 'Cuándo quiere arrancar: ya mismo (9-10), en semanas (6-8), en meses (3-5), sin fecha (0-2).',
  };
  const CRITERIOS = [['score', 'Score general'], ['lead', 'Score del lead'], ['interes', 'Interés'], ['urgencia', 'Urgencia']];
  // Clave de una llamada en la base: el id de la reserva (Calendly/iClosed) o el de la fila + la fecha.
  function claveDe(r) {
    const base = String(r.CalendlyID || '').trim() || ('r' + r._row);
    return (base.replace(/[^A-Za-z0-9_-]/g, '') + '_' + fechaDe(r).replace(/-/g, '')).slice(0, 64);
  }
  // las claves de todas las agendas (se recalculan solo si cambia el pipeline)
  let _cl = { rows: null, n: -1, set: null };
  const clavesFilas = () => { const f = filas(); if (_cl.rows !== f || _cl.n !== f.length) _cl = { rows: f, n: f.length, set: new Set(f.map(claveDe)) }; return _cl.set; };
  function evMapa() {
    const m = new Map(), pn = new Map(), cl = clavesFilas();
    // El respaldo por nombre + fecha es solo para las evaluaciones huérfanas (su id ya no coincide con ninguna
    // agenda): si no, una evaluación se pegaba también a otra agenda del mismo lead ese día.
    (AGA.evals || []).forEach(e => { m.set(e.id, e); if (!cl.has(e.id)) pn.set(norm(e.nombre) + '|' + e.fecha, e); });
    return { m, pn };
  }
  const evDe = (r, M) => M.m.get(claveDe(r)) || M.pn.get(norm(r.Nombre) + '|' + fechaDe(r)) || null;
  const porTxt = (ev) => (ev ? `Evaluada por ${ev.por || '—'}` : '');
  const clicTxt = (ev) => (ev ? 'Clic: ver o editar la evaluación' : 'Clic: evaluarla');
  // Una llamada "se hizo" si el pipeline dice Presentada o Cerrada, o si tiene una evaluación con su id.
  const hecha = (x, M) => ASISTE(x.Estado) || M.m.has(claveDe(x));
  // Una reserva repetida (la misma clave dos veces) saldría dos veces con la evaluación pegada por id: queda una
  // por clave, la que tiene resultado (Cerrada antes que Presentada) o la primera.
  const PESO_EST = { 'Cerrada': 2, 'Presentada': 1 };
  function unaPorClave(ls) {
    const m = new Map();
    ls.forEach(x => { const k = claveDe(x), y = m.get(k); if (!y || (PESO_EST[x.Estado] || 0) > (PESO_EST[y.Estado] || 0)) m.set(k, x); });
    return m.size === ls.length ? ls : ls.filter(x => m.get(claveDe(x)) === x);
  }
  const haceTxt = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (!iso || !isFinite(s)) return '';
    if (s < 90) return 'hace un momento';
    const m = Math.round(s / 60); if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60); return h < 36 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
  };
  // "Sin cargar" es SOLO Pendiente o Confirmada (SIN_RESULTADO, la regla de Post-Call). Descalificada, No-show,
  // Cancelada o Re-agenda ya tienen resultado: se muestra ese.
  function resSinCargar(r) {
    if (!SIN_RESULTADO(r.Estado)) return `<span class="ag-res" style="--ag:${estTxt(r.Estado)}"${tip('Resultado en el pipeline', r.Estado || 'Sin estado')}>${uiEsc(r.Estado || 'Sin estado')}</span>`;
    return `<span class="ag-res" style="--ag:#8b8b91"${tip('Sin resultado en el pipeline', `La agenda sigue en ${r.Estado || 'blanco'}: el closer no cargó qué pasó`, 'Cargalo en Agendas › Post-Call')}>Sin cargar</span>`;
  }

  // Lee evaluaciones y rúbrica. Si ya hay una lectura en curso devuelve esa en vez de lanzar otra: así
  // agAnaEvaluar la espera sin reintentar en bucle.
  function anaCargar(fresco) {
    if (AGA.cargando) return AGA.cargando;
    const fin = () => {
      AGA.cargando = false;
      if (vistaOn('analisis')) anaPintar();
      if (vistaOn('central')) cenPintar();
    };
    AGA.cargando = Promise.all([
      dbLista(COL_EV, fresco).then(d => { AGA.evals = d || []; AGA.err = ''; })
        .catch(e => { AGA.err = e.message || String(e); if (!AGA.evals) AGA.evals = []; }),
      dbLista(COL_CFG, fresco).then(d => { const doc = (d || []).find(x => x.id === 'rubrica'); AGA.rubrica = doc ? doc.criterios : null; }).catch(() => { }),
    ]).then(fin, fin);
    return AGA.cargando;
  }

  // Las llamadas que se hicieron en el período, hasta hoy: Presentada o Cerrada en el pipeline, o con evaluación.
  function anaLlamadas(r) {
    const h = hoyAR(), tope = r.hasta < h ? r.hasta : h, M = evMapa();
    return unaPorClave(filas().filter(x => fechaOk(fechaDe(x)) && fechaDe(x) >= r.desde && fechaDe(x) <= tope && hecha(x, M)));
  }

  function anaPintar() {
    const caja = $('analisis');
    if (!caja) return;
    if (!cargado()) { caja.innerHTML = '<div class="ag-cargando">Cargando las llamadas…</div>'; return; }
    const act = document.activeElement, foco = act && act.id === 'agAnaQ' ? (act.selectionStart || 0) : null;
    const r = uiPerRango(PER_ANA), M = evMapa();
    const calls = anaLlamadas(r).map(x => ({ r: x, ev: evDe(x, M) }));
    const evs = calls.filter(c => c.ev);
    const cerr = calls.filter(c => c.r.Estado === 'Cerrada').length;
    // la tasa de cierre es sobre lo que tiene resultado en el pipeline (Presentada + Cerrada), como en Métricas
    const asis = calls.filter(c => ASISTE(c.r.Estado)).length;
    const sp = prom(evs.map(c => c.ev), 'score');
    let cuerpo;
    if (AGA.evals === null && !AGA.err) cuerpo = '<div class="ag-cargando">Leyendo las evaluaciones…</div>';
    else if (AGA.sub === 'llamadas') cuerpo = anaTablaLlamadas(calls);
    else if (AGA.sub === 'manual') cuerpo = anaTablaManual(calls);
    else cuerpo = anaResumen(r, calls, evs);
    caja.innerHTML = `<div class="ag ag-ana">
      <div class="ag-sub">
        <div class="ag-sub-t"><h2>Análisis de llamadas</h2><p>La calidad de cada llamada de venta, evaluada con la rúbrica · el análisis con IA de Fathom se suma más adelante</p></div>
        <div class="ag-sub-d">
          <div class="ag-cnt">
            <div style="--ag:#d4a53a"${tip('Llamadas evaluadas', `${uiNum(evs.length)} de ${plural(calls.length, 'llamada hecha', 'llamadas hechas')} en el período`, `${pct(evs.length, calls.length, 0)} evaluadas`)}><b>${uiNum(evs.length)}</b><span>Evaluadas</span></div>
            <div style="--ag:${BLANCO}"${tip('Score promedio', sp != null ? `${nScore(sp)} · ${banda(sp).t} · en ${plural(evs.length, 'evaluación', 'evaluaciones')}` : 'Sin evaluaciones en el período')}><b>${sp != null ? nScore(sp) : '—'}</b><span>Score prom.</span></div>
            <div style="--ag:${VERDE}"${tip('Tasa de cierre', asis ? `${pct(cerr, asis)} · ${uiNum(cerr)} cerradas de ${plural(asis, 'llamada con resultado', 'llamadas con resultado')}` : 'Sin llamadas con resultado en el período', 'Cerradas ÷ (presentadas + cerradas)', calls.length > asis ? `${plural(calls.length - asis, 'llamada hecha', 'llamadas hechas')} sin resultado en el pipeline: no cuentan` : '')}><b>${asis ? Math.round(100 * cerr / asis) + '%' : '—'}</b><span>Tasa cierre</span></div>
          </div>
          <button type="button" class="ag-btn2 bajo" onclick="agAnaConfig()">${ico('ajustes', 14)}Rúbrica</button>
          <button type="button" class="ag-icob" onclick="agAnaRecargar()" title="Volver a leer evaluaciones y agendas">${uiIco('refrescar', 15)}</button>
        </div>
      </div>
      ${solido([{ id: 'resumen', texto: 'Resumen', ico: 'grilla' }, { id: 'llamadas', texto: 'Llamadas', ico: 'lista' }, { id: 'manual', texto: 'Manual', ico: 'portapapeles' }], AGA.sub, 'agAnaSub', true)}
      ${AGA.err ? `<div class="ag-banda ag-mt">No pude leer las evaluaciones guardadas (${uiEsc(AGA.err)}). Lo de las agendas se ve igual; reintentá con ⟳.</div>` : ''}
      ${cuerpo}
    </div>`;
    if (foco != null) { const i = $('agAnaQ'); if (i) { i.focus(); try { i.setSelectionRange(foco, foco); } catch (e) { } } }
  }

  /* ── 01 Resumen ── */
  function anaResumen(r, calls, evs) {
    const E = evs.map(c => c.ev);
    // "+N sem.": de las evaluaciones de ESTE período, cuántas se hicieron en los últimos 7 días (con hoy, como las
    // barras). `creado` es ISO en UTC: se pasa al día del cliente.
    const h = hoyAR(), hace7 = uiSumarDias(h, -6);
    const diaZ = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString('en-CA', { timeZone: ZONA() }) : ''; };
    const sem = E.filter(e => diaZ(e.creado) >= hace7).length;
    const sp = prom(E, 'score');
    // tendencia contra el período anterior equivalente
    const Mp = evMapa();
    const ant = unaPorClave(filas().filter(x => fechaOk(fechaDe(x)) && fechaDe(x) >= r.previo.desde && fechaDe(x) <= r.previo.hasta && hecha(x, Mp))).map(x => evDe(x, Mp)).filter(Boolean);
    const spAnt = prom(ant, 'score');
    let tend = '';
    if (sp != null && spAnt != null) { const d = sp - spAnt; tend = Math.abs(d) < 0.2 ? '<em class="ag-tend flat">estable</em>' : `<em class="ag-tend ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${uiNum(Math.abs(d), 1)}</em>`; }
    const max = E.length ? Math.max(...E.map(e => Number(e.score) || 0)) : null;
    const mejor = max != null ? evs.find(c => (Number(c.ev.score) || 0) === max) : null;
    const cerr = calls.filter(c => c.r.Estado === 'Cerrada').length, asis = calls.filter(c => ASISTE(c.r.Estado)).length;
    const kpis = `<div class="ag-k4">
      <div style="--ag:#d4a53a"${tip('Llamadas evaluadas', `${uiNum(E.length)} de ${plural(calls.length, 'llamada hecha', 'llamadas hechas')} en el período`, sem ? `${uiNum(sem)} de ${uiNum(E.length)} se evaluaron en los últimos 7 días` : '')}><b>${uiNum(E.length)}</b><span>Llamadas evaluadas${sem ? `<em class="ag-tend up">+${sem} sem.</em>` : ''}</span></div>
      <div style="--ag:#d4a53a"${tip('Score promedio', sp != null ? `${nScore(sp)} · ${banda(sp).t}` : 'Sin evaluaciones en el período', spAnt != null ? `${r.nombreAnt}: ${nScore(spAnt)} en ${plural(ant.length, 'evaluación', 'evaluaciones')}` : 'Sin evaluaciones en el período anterior para comparar')}><b>${sp != null ? nScore(sp) : '—'}</b><span>Score promedio${tend}</span></div>
      <div style="--ag:${VERDE}"${tip('Score más alto', mejor ? `${nScore(max)} · ${mejor.r.Nombre || 'Sin nombre'}` : 'Sin evaluaciones en el período', mejor ? `${closerDe(mejor.r)} · ${uiFechaCorta(fechaDe(mejor.r))} · ${mejor.r.Estado}` : '', mejor ? 'Clic: ver la evaluación' : '')}${mejor ? ` onclick="agAnaEvaluar('${mejor.r._row}')"` : ''}><b>${max != null ? nScore(max) : '—'}</b><span>Score más alto</span></div>
      <div style="--ag:${VERDE}"${tip('Tasa de cierre', asis ? `${pct(cerr, asis)} · ${uiNum(cerr)} cerradas de ${plural(asis, 'llamada con resultado', 'llamadas con resultado')}` : 'Sin llamadas con resultado en el período', calls.length > asis ? `${plural(calls.length - asis, 'llamada hecha', 'llamadas hechas')} sin resultado en el pipeline: no cuentan` : '')}><b>${asis ? Math.round(100 * cerr / asis) + '%' : '—'}</b><span>Tasa de cierre <em class="ag-tend flat">${plural(asis, 'llamada')}</em></span></div>
    </div>`;
    const sinEval = !E.length
      ? `<div class="ag-aviso-ev">${uiIco('info', 15)}<span>Todavía no hay llamadas evaluadas en este período: se evalúan a mano con la rúbrica.</span><button type="button" class="ui-link" onclick="agAnaSub('manual')">Evaluar llamadas →</button></div>` : '';
    return kpis + sinEval + `<div class="ag-g93">${anaBarras()}${anaTop(evs)}</div>
      <div class="ag-g4">${anaDist(E)}${anaClosers(calls)}</div>
      ${anaFathom()}`;
  }
  // "Score por llamada: últimos 7 días": barras con el promedio del día y la cantidad adentro
  function anaBarras() {
    const h = hoyAR(), M = evMapa();
    const dias = Array.from({ length: 7 }, (_, i) => uiSumarDias(h, i - 6));
    const porDia = dias.map(f => {
      const hechas = unaPorClave(filas().filter(x => fechaDe(x) === f && hecha(x, M)));
      const conEv = hechas.map(x => ({ r: x, ev: evDe(x, M) })).filter(c => c.ev);
      const ev = conEv.map(c => c.ev);
      return { f, hechas: hechas.length, n: ev.length, s: prom(ev, 'score'), conEv };
    });
    const hay = porDia.some(d => d.n);
    const PH = 150;   // alto útil del gráfico (escala de 0 a 10)
    // La columna entera (no solo la barra) lleva el tooltip y el clic: así un día con score bajo
    // o sin evaluaciones también se puede señalar.
    const cols = porDia.map(d => {
      const b = d.s != null ? banda(d.s) : null;
      const top = d.conEv.slice().sort((x, y) => (Number(y.ev.score) || 0) - (Number(x.ev.score) || 0))[0];
      const t = d.n
        ? tip(diaTip(d.f), `Score promedio ${nScore(d.s)} · ${b.t}`, `${plural(d.n, 'llamada evaluada', 'llamadas evaluadas')} de ${plural(d.hechas, 'hecha', 'hechas')}`,
          top ? `Mejor: ${top.r.Nombre || 'Sin nombre'} · ${nScore(top.ev.score)}` : '', 'Clic: ver las llamadas del día')
        : tip(diaTip(d.f), d.hechas ? `${plural(d.hechas, 'llamada hecha', 'llamadas hechas')}, ninguna evaluada` : 'Sin llamadas de venta hechas', d.hechas ? 'Clic: evaluarlas' : '');
      return `<div class="ag-sc-col${d.f === h ? ' hoy' : ''}"${t}${d.hechas ? ` onclick="agAnaDia('${d.f}')"` : ''}>${d.n ? `<div class="ag-sc-bar" style="--ag:${b.col};height:${(d.s / 10 * PH).toFixed(1)}px"><span class="ag-sc-v">${nScore(d.s)}</span><span class="ag-sc-c">${d.n}</span></div>` : ''}</div>`;
    }).join('');
    const xs = porDia.map(d => { const x = uiF(d.f); return `<span class="${d.f === h ? 'hoy' : ''}">${DIAS_C[x.getDay()]}<small>${x.getDate()}</small></span>`; }).join('');
    const d0 = uiF(dias[0]), d6 = uiF(dias[6]);
    return `<section class="ag-card ag-pad0 ag-scc">
      <header class="ag-card-hd"><span class="ag-mtit">Score por llamada: últimos 7 días</span><span class="ag-gris ag-chico">${DIAS_C[d0.getDay()]} ${d0.getDate()} — ${DIAS_C[d6.getDay()]} ${d6.getDate()}</span></header>
      <div class="ag-sc" style="--ph:${PH}px">
        ${[9, 7, 5].map(v => `<div class="ag-sc-g" style="bottom:${(v / 10 * PH).toFixed(1)}px"><span>${v}</span></div>`).join('')}
        <div class="ag-sc-cols">${cols}</div>
        ${hay ? '' : '<div class="ag-sc-vacio">Ninguna llamada de esta semana tiene evaluación todavía</div>'}
      </div>
      <div class="ag-sc-x">${xs}</div>
      <div class="ag-sc-ley">${BANDAS.map(b => `<span><i style="--ag:${b.col}"></i>${b.t} (${b.r})</span>`).join('')}</div>
    </section>`;
  }
  function anaTop(evs) {
    const top = evs.slice().sort((a, b) => (Number(b.ev.score) || 0) - (Number(a.ev.score) || 0) || fkey(b.r).localeCompare(fkey(a.r))).slice(0, 5);
    const tipT = (c, i) => tip(`${i + 1}º · ${c.r.Nombre || 'Sin nombre'}`, `Score ${nScore(c.ev.score)} · ${banda(c.ev.score).t}`,
      CRITERIOS.slice(1).map(([k, t]) => (c.ev[k] != null ? `${t}: ${nScore(c.ev[k])}` : '')).filter(Boolean).join(' · '),
      `${closerDe(c.r)} · ${uiFechaCorta(fechaDe(c.r))} · ${c.r.Estado}`, porTxt(c.ev), clicTxt(c.ev));
    return `<section class="ag-card ag-pad0 ag-topc">
      <header class="ag-card-hd"><span class="ag-mtit">Top llamadas</span></header>
      ${top.length ? top.map((c, i) => `<button type="button" class="ag-top-f" onclick="agAnaEvaluar('${c.r._row}')"${tipT(c, i)}>
          <span class="ag-top-pos">${i + 1}</span>${avatar(c.r.Nombre, 27)}
          <span class="ag-top-n"><b>${uiEsc(c.r.Nombre || 'Sin nombre')}</b><small>${uiEsc(uiFechaCorta(fechaDe(c.r)))} · ${uiEsc(c.r.Estado)}</small></span>
          <span class="ag-scp" style="--ag:${banda(c.ev.score).col}">${nScore(c.ev.score)}</span></button>`).join('')
        : '<div class="ag-vacio ag-m14">Sin llamadas evaluadas en el período.</div>'}
    </section>`;
  }
  function anaDist(E) {
    const n = (b) => E.filter(e => banda(e.score).id === b.id).length;
    const max = Math.max(1, ...BANDAS.map(n));
    return `<section class="ag-card ag-pad0 ag-distc">
      <header class="ag-card-hd"><span class="ag-mtit">Distribución de scores</span></header>
      <div class="ag-dist">${BANDAS.map(b => `<div class="ag-dist-f"${tip(`${b.t} (${b.r})`, E.length ? `${plural(n(b), 'llamada')} · ${pct(n(b), E.length, 0)} de las ${plural(E.length, 'evaluada')}` : 'Sin evaluaciones en el período', n(b) ? 'Clic: ver cuáles' : '')}${n(b) ? ` onclick="agAnaBanda('${b.id}')"` : ''}><span style="--ag:${b.col}">${b.t}</span><i><u style="width:${(100 * n(b) / max).toFixed(1)}%;--ag:${b.col}"></u></i><b>${n(b)}</b></div>`).join('')}</div>
    </section>`;
  }
  function anaClosers(calls) {
    const g = {};
    calls.forEach(c => { const k = closerDe(c.r); (g[k] = g[k] || { n: 0, asis: 0, cerr: 0, ev: [] }); g[k].n++; if (ASISTE(c.r.Estado)) g[k].asis++; if (c.r.Estado === 'Cerrada') g[k].cerr++; if (c.ev) g[k].ev.push(c.ev); });
    const ls = Object.entries(g).sort((a, b) => b[1].ev.length - a[1].ev.length || b[1].n - a[1].n);
    if (!ls.length) return '<section class="ag-card ag-span3"><div class="ag-vacio">Sin llamadas hechas en el período.</div></section>';
    // el promedio del equipo, para que cada barra diga si el closer está arriba o abajo
    const todas = calls.filter(c => c.ev).map(c => c.ev);
    const eq = Object.fromEntries(CRITERIOS.map(([c]) => [c, prom(todas, c)]));
    return ls.map(([k, d]) => {
      const col = colorPersona(k), sg = prom(d.ev, 'score');
      const cab = tip(k, `${plural(d.n, 'llamada hecha', 'llamadas hechas')} · ${plural(d.cerr, 'cerrada')} (${pct(d.cerr, d.asis, 0)} de las que tienen resultado)`,
        d.n > d.asis ? `${plural(d.n - d.asis, 'sigue', 'siguen')} sin resultado en el pipeline` : '',
        d.ev.length ? `${plural(d.ev.length, 'evaluada')} · score ${nScore(sg)} (${banda(sg).t})` : 'Ninguna evaluada todavía', 'Clic: ver sus llamadas');
      return `<section class="ag-card ag-cc" style="--ag:${col}">
        <div class="ag-cc-h" data-v="${uiEsc(k)}" onclick="agAnaCloser(this.dataset.v)"${cab}>${avatar(k, 29)}<div><b>${uiEsc(k)}</b><small>${plural(d.n, 'llamada')} · ${plural(d.cerr, 'cerrada')}${d.ev.length ? ` · ${d.ev.length} eval.` : ''}</small></div><span class="ag-cc-s">${sg != null ? nScore(sg) : '—'}</span></div>
        ${CRITERIOS.map(([c, t]) => {
          const v = prom(d.ev, c);
          const tt = tip(`${t} · ${k}`, v != null ? `${nScore(v)} promedio en ${plural(d.ev.length, 'evaluación', 'evaluaciones')}` : 'Sin evaluaciones todavía',
            eq[c] != null ? `Equipo: ${nScore(eq[c])}` : '', v != null ? banda(v).t : '');
          return `<div class="ag-cc-f"${tt}><span>${t === 'Score general' ? 'Score gral.' : t === 'Score del lead' ? 'Score lead' : t}</span><i><u style="width:${v != null ? (v * 10).toFixed(0) : 0}%"></u></i><b>${v != null ? nScore(v) : '–'}</b></div>`;
        }).join('')}
      </section>`;
    }).join('');
  }
  // El lugar del análisis con IA de Fathom (en el hub original: el resumen de todas las grabaciones y el análisis de cada una).
  function anaFathom() {
    return `<div class="ag-fa">${uiVacio({ ico: 'video', titulo: 'Análisis con IA de las grabaciones (Fathom): más adelante', texto: 'Cuando se conecte Fathom, la IA va a puntuar sola cada llamada grabada con esta misma rúbrica, y acá va a ir el resumen de todas: cómo terminan, palancas de cierre y objeciones más repetidas. Mientras tanto, las llamadas se evalúan a mano (03 Manual).' })}</div>`;
  }

  /* ── 02 Llamadas: todas las llamadas hechas, con su score ── */
  const nivelCol = (v) => v == null ? '#6c6c71' : v >= 9 ? VERDE : v >= 7 ? '#d4a53a' : v >= 5 ? '#fb923c' : ROSA;
  const nCorto = (v) => v == null ? '–' : (Number.isInteger(Number(v)) ? String(Number(v)) : uiNum(Number(v), 1));
  function anaFiltroTexto(calls) {
    const t = AGA.q.trim().toLowerCase();
    return t ? calls.filter(c => [c.r.Nombre, c.r.Email, c.r.WhatsApp, c.r.Instagram, closerDe(c.r)].join(' ').toLowerCase().includes(t)) : calls;
  }
  function anaBuscador(pills) {
    return `<div class="ag-busq">
      <label class="ag-bus">${uiIco('buscar', 14)}<input type="search" id="agAnaQ" value="${uiEsc(AGA.q)}" placeholder="Nombre, @usuario, mail o teléfono" autocomplete="off" oninput="agAnaBuscar(this.value)" aria-label="Buscar llamadas"></label>
      <div class="ag-pills">${pills}</div>
    </div>`;
  }
  function anaTablaLlamadas(calls) {
    const F = { '': [() => true, 'Todos'], cerr: [c => c.r.Estado === 'Cerrada', 'Cerrados'], pres: [c => c.r.Estado === 'Presentada', 'No cerrados'], nc: [c => SIN_RESULTADO(c.r.Estado), 'Sin cargar'], ev: [c => !!c.ev, 'Evaluadas'], sin: [c => !c.ev, 'Sin evaluar'] };
    if (!F[AGA.res]) AGA.res = '';
    const base = anaFiltroTexto(calls);
    const vis = base.filter(F[AGA.res][0]).sort((a, b) => fkey(b.r).localeCompare(fkey(a.r)));
    // "Sin cargar" (se evaluó, pero el pipeline no tiene el resultado) solo aparece si hay alguna
    const pills = Object.entries(F).filter(([id, [fn]]) => id !== 'nc' || AGA.res === 'nc' || base.some(fn)).map(([id, [fn, t]]) => `<button type="button" class="ag-pill2${AGA.res === id ? ' on' : ''}" onclick="agAnaRes('${id}')">${t} · ${uiNum(base.filter(fn).length)}</button>`).join('');
    const fila = (c) => {
      const r = c.r, ev = c.ev, b = ev ? banda(ev.score) : null;
      const sub = ev ? b.t : [capDe(r) ? 'Capital ' + capDe(r) : '', URG_TXT[URG_NIVEL(r.Urgencia)] || ''].filter(Boolean).join(' · ') || 'Sin evaluar';
      return `<tr class="clic" onclick="agAnaEvaluar('${r._row}')">
        <td>${ev ? `<span class="ag-scp ag-scp-t" style="--ag:${b.col}"${tip(`Score ${nScore(ev.score)} · ${b.t}`, CRITERIOS.slice(1).map(([k, t]) => (ev[k] != null ? `${t}: ${nScore(ev[k])}` : '')).filter(Boolean).join(' · '), porTxt(ev), clicTxt(ev))}>${nScore(ev.score)}</span>` : `<span class="ag-scp ag-scp-t vacio"${tip('Sin evaluar', 'Clic en la fila: evaluarla')}>–</span>`}</td>
        <td><b class="ag-t-n">${uiEsc(r.Nombre || 'Sin nombre')}</b><small class="ag-t-s">${uiEsc(sub)}</small></td>
        <td><span class="ag-quien">${avatar(closerDe(r), 20)}<span>${uiEsc(closerDe(r))}</span></span></td>
        <td><span class="ag-iu"><span style="--ag:${nivelCol(ev ? ev.interes : null)}"${tip('Interés', ev && ev.interes != null ? `${nScore(ev.interes)} de 10 · ${banda(ev.interes).t}` : 'Sin evaluar')}><em>I</em>${nCorto(ev ? ev.interes : null)}</span><span style="--ag:${nivelCol(ev ? ev.urgencia : null)}"${tip('Urgencia', ev && ev.urgencia != null ? `${nScore(ev.urgencia)} de 10 · ${ev.urgencia >= 9 ? 'quiere arrancar ya' : ev.urgencia >= 6 ? 'arranca en semanas' : ev.urgencia >= 3 ? 'arranca en meses' : 'sin fecha'}` : 'Sin evaluar', r.Urgencia ? `Al agendar dijo: «${r.Urgencia}»` : '')}><em>U</em>${nCorto(ev ? ev.urgencia : null)}</span></span></td>
        <td>${r.Estado === 'Cerrada' ? `<span class="ag-res" style="--ag:${VERDE}"><i></i>Cerrada</span>` : r.Estado === 'Presentada' ? `<span class="ag-res" style="--ag:#d4a53a">→ Sin cierre</span>` : resSinCargar(r)}</td>
        <td class="ag-mono ag-gris">${uiEsc(uiFechaCorta(fechaDe(r)))}</td>
        <td class="der"><button type="button" class="ag-hacc" title="${ev ? 'Editar la evaluación' : 'Evaluar'}" onclick="event.stopPropagation();agAnaEvaluar('${r._row}')">${ico(ev ? 'lapiz' : 'portacheck', 14)}</button></td>
      </tr>`;
    };
    return anaBuscador(pills) + (vis.length
      ? `<div class="ag-tfull"><table class="ag-t ag-tana"><thead><tr><th>Score</th><th>Lead</th><th>Agente</th><th>Interés/Urg.</th><th>Resultado</th><th>Fecha</th><th></th></tr></thead><tbody>${vis.slice(0, AGA.tope).map(fila).join('')}</tbody></table></div>${vis.length > AGA.tope ? `<div class="ag-mas"><button type="button" class="ag-btn3" onclick="agAnaMas()">Ver más (quedan ${uiNum(vis.length - AGA.tope)})</button></div>` : ''}`
      : uiVacio({ ico: 'telefono', titulo: 'Sin llamadas', texto: 'No hay llamadas hechas (presentadas, cerradas o evaluadas) con estos filtros en el período.' }));
  }
  /* ── 03 Manual: la cola de evaluación ── */
  function anaTablaManual(calls) {
    const F = { '': [() => true, 'Todas'], sin: [c => !c.ev, 'Sin evaluar'], ev: [c => !!c.ev, 'Evaluadas'] };
    if (!F[AGA.man]) AGA.man = '';
    const base = anaFiltroTexto(calls);
    const vis = base.filter(F[AGA.man][0]).sort((a, b) => (!!a.ev - !!b.ev) || fkey(b.r).localeCompare(fkey(a.r)));
    const pills = Object.entries(F).map(([id, [fn, t]]) => `<button type="button" class="ag-pill2${AGA.man === id ? ' on' : ''}" onclick="agAnaMan('${id}')">${t} · ${uiNum(base.filter(fn).length)}</button>`).join('');
    const diaDe = (iso, r) => uiFechaCorta(String(iso || '').slice(0, 10) || fechaDe(r));
    const fila = (c) => {
      const r = c.r, ev = c.ev;
      return `<tr class="clic" onclick="agAnaEvaluar('${r._row}')">
        <td>${!ev ? `<span class="ag-evst">${ico('circulo', 12)}Sin evaluar</span>` : `<span class="ag-evst ok">${uiIco('check', 12)}Evaluada</span>`}</td>
        <td><b class="ag-t-n">${uiEsc(r.Nombre || 'Sin nombre')}</b><small class="ag-t-s">${uiEsc(uiFechaCorta(fechaDe(r)))} · ${uiEsc(r.Estado)}</small></td>
        <td><span class="ag-quien">${avatar(closerDe(r), 20)}<span>${uiEsc(closerDe(r))}</span></span></td>
        <td>${ev ? `<span class="ag-scp ag-scp-t" style="--ag:${banda(ev.score).col}"${tip(`Score ${nScore(ev.score)} · ${banda(ev.score).t}`, CRITERIOS.slice(1).map(([k, t]) => (ev[k] != null ? `${t}: ${nScore(ev[k])}` : '')).filter(Boolean).join(' · '), porTxt(ev))}>${nScore(ev.score)}</span>` : '<span class="ag-gris">–</span>'}</td>
        <td>${!ev ? '<span class="ag-gris">–</span>' : `<span class="ag-t-por">${uiEsc(ev.por || '—')}<small>${uiEsc(diaDe(ev.actualizado || ev.creado, r))}</small></span>`}</td>
        <td class="der"><button type="button" class="ag-hacc" title="${ev ? 'Editar la evaluación' : 'Evaluar'}" onclick="event.stopPropagation();agAnaEvaluar('${r._row}')">${ico('portacheck', 14)}</button></td>
      </tr>`;
    };
    return anaBuscador(pills) + (vis.length
      ? `<div class="ag-tfull"><table class="ag-t ag-tman"><thead><tr><th>Estado</th><th>Lead</th><th>Agente</th><th>Puntaje</th><th>Evaluada por</th><th></th></tr></thead><tbody>${vis.slice(0, AGA.tope).map(fila).join('')}</tbody></table></div>${vis.length > AGA.tope ? `<div class="ag-mas"><button type="button" class="ag-btn3" onclick="agAnaMas()">Ver más (quedan ${uiNum(vis.length - AGA.tope)})</button></div>` : ''}`
      : uiVacio({ ico: 'portapapeles', titulo: AGA.man === 'sin' ? 'No queda nada por evaluar' : 'Sin llamadas', texto: 'Con estos filtros no hay llamadas hechas en el período.' }));
  }

  /* ── evaluar una llamada ── */
  // Para no arrancar de cero, la urgencia se sugiere con lo que el lead respondió al agendar.
  const URG_SUGERIDA = { ya: 9, semanas: 7, meses: 4, nose: 2 };
  const nombreYo = () => (typeof YO !== 'undefined' && YO && YO.nombre) || '';
  window.agAnaEvaluar = (row) => {
    const r = rowDe(row);
    if (!r) { uiToast('No encontré esa llamada', 'mal'); return; }
    // anaCargar devuelve la lectura en curso: se espera esa (antes, un clic mientras cargaba reintentaba en bucle)
    if (AGA.evals === null) { uiToast('Leyendo las evaluaciones…'); anaCargar().then(() => { if (AGA.evals !== null) window.agAnaEvaluar(row); }); return; }
    const ev = evDe(r, evMapa()) || {};
    // /api/db: escriben equipo y cliente. Un closer ve la evaluación, sin editar.
    const edita = perfilEfectivo() !== 'closer', ro = edita ? '' : ' readonly';
    const rub = Object.assign({}, RUBRICA_DEF, AGA.rubrica || {});
    const urgSug = URG_SUGERIDA[URG_NIVEL(r.Urgencia)];
    const campo = (k, t) => {
      const v = ev[k] != null ? Math.round(Number(ev[k]) * 2) / 2 : (k === 'urgencia' && urgSug != null ? urgSug : 7);
      return `<div class="ag-ev-c">
        <div class="ag-ev-l"><b>${t}</b><output class="ag-ev-v" style="--ag:${banda(v).col}">${nScore(v)}</output></div>
        <input type="range" class="agev-${k}" min="0" max="10" step="0.5" value="${v}" oninput="agAnaSlider(this)" aria-label="${t}"${edita ? '' : ' disabled'}>
        <small>${uiEsc(rub[k])}${k === 'urgencia' && ev[k] == null && urgSug != null ? ` · Sugerida por lo que respondió al agendar: «${uiEsc(r.Urgencia)}».` : ''}</small>
      </div>`;
    };
    const chips = [
      `<span>${uiIco('calendario', 13)}${uiEsc(uiFechaCorta(fechaDe(r)))} ${uiEsc(horaDe(r))}</span>`,
      `<span>${avatar(closerDe(r), 18)}${uiEsc(closerDe(r))}</span>`,
      `<span class="ag-estchip" style="--ag:${estTxt(r.Estado)}">${uiEsc(r.Estado)}</span>`,
      capDe(r) ? `<span class="ag-capchip" style="--ag:${CAP_COL[capDe(r)]}">Capital ${uiEsc(capDe(r))}</span>` : '',
      `<span>${uiEsc(canalDe(r))}</span>`, r.Monto ? `<span>Monto ${uiEsc(usd(montoDe(r)))}</span>` : '',
    ].join('');
    uiModalAbrir({
      titulo: ev.id ? (edita ? 'Editar evaluación' : 'Evaluación') : 'Evaluar llamada', sub: `${r.Nombre || 'Sin nombre'} · ${closerDe(r)}`,
      cuerpo: `<div class="ag-ev" data-row="${uiEsc(row)}" data-id="${uiEsc(ev.id || claveDe(r))}">
        <div class="ag-ev-chips">${chips}</div>
        <details class="ag-ev-form"><summary>Lo que respondió al agendar</summary><div>${infoLeadHtml(r)}</div></details>
        <div class="ag-ev-g">${CRITERIOS.map(([k, t]) => campo(k, t)).join('')}</div>
        <div class="ui-campos ag-dos">
          <label class="ui-campo"><span>Evaluada por</span><input class="agev-por" value="${uiEsc(ev.por || nombreYo())}"${ro}></label>
          <label class="ui-campo"><span>Grabación (link, opcional)</span><input class="agev-link" value="${uiEsc(ev.link || '')}" placeholder="https://…"${ro}></label>
        </div>
        <label class="ui-campo ag-mt"><span>Notas: qué hizo bien, qué mejorar</span><textarea class="agev-notas" rows="3"${ro}>${uiEsc(ev.notas || '')}</textarea></label>
        ${ev.id ? `<p class="ag-ev-pie">Evaluada por ${uiEsc(ev.por || '—')} · última edición ${uiEsc(uiFechaCorta(String(ev.actualizado || ev.creado || '').slice(0, 10) || fechaDe(r)))}${/^https?:\/\//i.test(ev.link || '') ? ` · <a href="${uiEsc(ev.link)}" target="_blank" rel="noopener">abrir grabación</a>` : ''}</p>` : ''}
        ${edita ? '' : '<p class="ag-ev-pie">Las evaluaciones las cargan el equipo y el cliente.</p>'}
      </div>`,
      acciones: edita ? [
        ...(ev.id ? [{ texto: 'Borrar evaluación', onclick: `agAnaBorrar('${ev.id}')` }] : []),
        { texto: 'Cancelar', onclick: 'uiModalCerrar()' },
        { texto: ev.id ? 'Guardar cambios' : 'Guardar evaluación', onclick: 'agAnaGuardar(this)', pri: true },
      ] : [{ texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }], ancho: '700px',
    });
  };
  window.agAnaSlider = (el) => {
    const o = el.parentElement.querySelector('.ag-ev-v');
    if (o) { o.textContent = nScore(el.value); o.style.setProperty('--ag', banda(el.value).col); }
  };
  window.agAnaGuardar = async (btn) => {
    const m = btn.closest('.ui-modal'), box = m && m.querySelector('.ag-ev');
    const r = box ? rowDe(box.dataset.row) : null;
    if (!r) { uiToast('No encontré esa llamada', 'mal'); return; }
    const v = (c) => { const el = box.querySelector('.' + c); return el ? el.value : ''; };
    const link = v('agev-link').trim();
    if (link && !/^https?:\/\//i.test(link)) { uiToast('El link tiene que empezar con https://', 'mal'); return; }
    const doc = {
      id: box.dataset.id || claveDe(r), nombre: r.Nombre || '', fecha: fechaDe(r), hora: horaDe(r), closer: closerDe(r), resultado: r.Estado || '',
      score: Number(v('agev-score')), lead: Number(v('agev-lead')), interes: Number(v('agev-interes')), urgencia: Number(v('agev-urgencia')),
      por: v('agev-por').trim() || nombreYo(), notas: v('agev-notas').trim(), link, estado: 'evaluada',
    };
    const texto = btn.textContent;   // "Guardar evaluación" o "Guardar cambios": si falla, vuelve el mismo
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const g = await dbGuardar(COL_EV, doc);
      AGA.evals = (AGA.evals || []).filter(e => e.id !== g.id).concat([g]);
      uiModalCerrar(); uiToast('Evaluación guardada', 'ok');
      if (vistaOn('analisis')) anaPintar(); else if (vistaOn('central')) cenPintar();
    } catch (e) { uiToast('No se pudo guardar: ' + e.message, 'mal'); btn.disabled = false; btn.textContent = texto; }
  };
  window.agAnaBorrar = async (id) => {
    if (!confirm('¿Borrar esta evaluación? No se puede deshacer.')) return;
    try {
      await dbBorrar(COL_EV, id);
      AGA.evals = (AGA.evals || []).filter(e => e.id !== id);
      uiModalCerrar(); uiToast('Evaluación borrada', 'ok');
      if (vistaOn('analisis')) anaPintar(); else if (vistaOn('central')) cenPintar();
    } catch (e) { uiToast('No se pudo borrar: ' + e.message, 'mal'); }
  };

  /* ── la rúbrica (en el hub original, "Configurar IA": Fathom, uso y equipo + la rúbrica) ── */
  window.agAnaConfig = () => {
    const rub = Object.assign({}, RUBRICA_DEF, AGA.rubrica || {}), ed = perfilEfectivo() !== 'closer';
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    uiModalAbrir({
      titulo: 'Rúbrica de la evaluación', sub: 'Con qué se puntúa cada llamada, de 0 a 10. Se guarda para todo el equipo.',
      cuerpo: `<div class="ag-cfg-b">
          <p class="ag-gris ag-chico">Es la guía que ve quien evalúa, debajo de cada barra. Cuando se conecte Fathom, la IA va a puntuar con esta misma rúbrica.</p>
          ${CRITERIOS.map(([k, tt]) => `<label class="ui-campo"><span>${tt}</span><textarea class="agrub-${k}" rows="2"${ed ? '' : ' readonly'}>${uiEsc(rub[k])}</textarea></label>`).join('')}
          <p class="ag-gris ag-chico">Bandas: Excelente ≥9 · Bueno 7–9 · Regular 5–7 · Bajo &lt;5.</p>
        </div>`,
      acciones: ed ? [{ texto: 'Restablecer rúbrica', onclick: 'agAnaRubricaDef()' }, { texto: 'Cerrar', onclick: 'uiModalCerrar()' }, { texto: 'Guardar rúbrica', onclick: 'agAnaGuardarRubrica(this)', pri: true }]
        : [{ texto: 'Cerrar', onclick: 'uiModalCerrar()', pri: true }], ancho: '620px',
    });
  };
  window.agAnaRubricaDef = () => { CRITERIOS.forEach(([k]) => { const el = document.querySelector(`#uiModal .agrub-${k}`); if (el && !el.readOnly) el.value = RUBRICA_DEF[k]; }); };
  window.agAnaGuardarRubrica = async (btn) => {
    const criterios = {};
    CRITERIOS.forEach(([k]) => { const el = document.querySelector(`#uiModal .agrub-${k}`); criterios[k] = el ? el.value.trim() || RUBRICA_DEF[k] : RUBRICA_DEF[k]; });
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await dbGuardar(COL_CFG, { id: 'rubrica', criterios });
      AGA.rubrica = criterios;
      uiModalCerrar(); uiToast('Rúbrica guardada', 'ok');
    } catch (e) { uiToast('No se pudo guardar: ' + e.message, 'mal'); btn.disabled = false; btn.textContent = 'Guardar rúbrica'; }
  };

  // Detalle de un gráfico de Análisis: las llamadas que forman ese número, con su score (o el botón
  // para evaluarlas). Cada fila abre la evaluación.
  function anaModalLista(titulo, sub, items) {
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    const vis = items.slice().sort((a, b) => (!!b.ev - !!a.ev) || ((Number(b.ev && b.ev.score) || 0) - (Number(a.ev && a.ev.score) || 0)) || fkey(b.r).localeCompare(fkey(a.r)));
    uiModalAbrir({
      titulo, sub,
      cuerpo: vis.length ? `<div class="ag-tw"><table class="ag-t ag-tdet"><thead><tr><th>Score</th><th>Lead</th><th>Closer</th><th>Resultado</th><th>Llamada</th><th></th></tr></thead><tbody>
        ${vis.map(c => `<tr class="clic" onclick="agAnaEvaluar('${c.r._row}')">
          <td>${c.ev ? `<span class="ag-scp ag-scp-t" style="--ag:${banda(c.ev.score).col}">${nScore(c.ev.score)}</span>` : '<span class="ag-scp ag-scp-t vacio">–</span>'}</td>
          <td><b class="ag-t-n">${uiEsc(c.r.Nombre || 'Sin nombre')}</b></td>
          <td>${uiEsc(closerDe(c.r))}</td>
          <td><span class="ag-estchip" style="--ag:${estTxt(c.r.Estado)}">${uiEsc(c.r.Estado)}</span></td>
          <td class="ag-mono ag-gris">${uiEsc(uiFechaCorta(fechaDe(c.r)))} ${uiEsc(horaDe(c.r))}</td>
          <td class="der"><span class="ag-acc-b${c.ev ? '' : ' oro'}">${c.ev ? 'Ver' : 'Evaluar'}</span></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="ag-vacio">No hay llamadas con este dato.</div>',
      ancho: '760px',
    });
  }
  window.agAnaDia = (f) => {
    const M = evMapa();
    const items = unaPorClave(filas().filter(x => fechaDe(x) === f && hecha(x, M))).map(x => ({ r: x, ev: evDe(x, M) }));
    const n = items.filter(c => c.ev).length;
    anaModalLista(`Llamadas del ${diaTip(f).toLowerCase()}`, `${plural(items.length, 'llamada hecha', 'llamadas hechas')} · ${plural(n, 'evaluada')} · tocá una para ${n ? 'ver o ' : ''}evaluarla`, items);
  };
  window.agAnaBanda = (id) => {
    const b = BANDAS.find(x => x.id === id); if (!b) return;
    const r = uiPerRango(PER_ANA), M = evMapa();
    const items = anaLlamadas(r).map(x => ({ r: x, ev: evDe(x, M) })).filter(c => c.ev && banda(c.ev.score).id === id);
    anaModalLista(`${b.t} (${b.r}) · ${plural(items.length, 'llamada')}`, `${r.etiqueta} · evaluadas con score ${b.r}`, items);
  };
  window.agAnaCloser = (k) => {
    AGA.q = k; AGA.res = ''; AGA.sub = 'llamadas'; AGA.tope = 200;
    try { sessionStorage.setItem('mhqag:ana', JSON.stringify({ sub: 'llamadas' })); } catch (e) { }
    if (typeof uiTipOcultar === 'function') uiTipOcultar();
    anaPintar();
    const m = $('mainScroll'); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.agAnaSub = (s) => { AGA.sub = s; AGA.tope = 200; try { sessionStorage.setItem('mhqag:ana', JSON.stringify({ sub: s })); } catch (e) { } anaPintar(); };
  window.agAnaPeriodo = () => anaPintar();
  let _tAna = null;
  window.agAnaBuscar = (v) => { AGA.q = v; AGA.tope = 200; clearTimeout(_tAna); _tAna = setTimeout(anaPintar, 160); };
  window.agAnaRes = (id) => { AGA.res = id; anaPintar(); };
  window.agAnaMan = (id) => { AGA.man = id; anaPintar(); };
  window.agAnaMas = () => { AGA.tope += 200; anaPintar(); };
  window.agAnaRecargar = () => { uiToast('Releyendo evaluaciones y agendas…'); anaCargar(true); cargarDatos().catch(() => { }); };

  /* ═════════════════ lo que en el hub original venía de hub.js (copiado acá: los onclick llaman ag*) ═════════════════ */
  // Editar un campo: se ve al toque y, si el servidor no lo guarda, vuelve a como estaba (setField de hub.js).
  async function agSet(row, field, value) {
    const r = rowDe(row);
    if (!r) return;
    const prev = r[field];
    r[field] = value;
    repintar();
    try {
      await api('POST', { row, field, value });
      flash('Guardado ✓');
      cargarDatos().catch(() => { });
    } catch (e) {
      r[field] = prev;
      repintar();
      flash('No se guardó, se revirtió: ' + e.message, true);
    }
  }
  window.agSet = agSet;
  const estCls = (e) => ({ 'Pendiente': 'a', 'Confirmada': 'b', 'Re-agenda': 'a', 'Presentada': 'p', 'No-show': 'r', 'Cerrada': 'g', 'Descalificada': 'r', 'Cancelada': 'r' }[e] || '');
  const estChips = (row, actual) => `<div class="estrow">` + (DATA.estados || []).map(e =>
    `<button class="fchip${e === actual ? ' on' : ''}" onclick="agSet('${row}','Estado','${e}')">${e}</button>`).join('') + `</div>`;
  window.agEditEstado = (el, row) => { const r = rowDe(row); el.outerHTML = estChips(row, r ? r.Estado : ''); };
  // el detalle desplegable de la tabla de Agendas (CENTRAL_OPEN de hub.js)
  const ABIERTAS = new Set();
  window.agToggleDet = (row) => { if (ABIERTAS.has(row)) ABIERTAS.delete(row); else ABIERTAS.add(row); cenPintar(); };
  window.agBorrar = async (row) => {
    const r = rowDe(row); if (!r) return;
    if (!confirm(`¿Borrar la card de "${r.Nombre || 'este lead'}"? No se puede deshacer. (Si ya pagó, mejor no borrar: usá Cancelada o Descalificada para conservar el historial.)`)) return;
    try { await api('POST', { action: 'adel', row }); flash('Borrada ✓'); cargarDatos().catch(() => { }); }
    catch (e) { flash('No se pudo borrar: ' + e.message, true); }
  };

  // Lo que el lead respondió al agendar. Va en todos lados donde se abre un lead: sin esto el closer abre la agenda y
  // no sabe con quién va a hablar.
  const CAMPOS_LEAD = [['Negocio', '¿A qué se dedica?'], ['Facturacion', 'Factura hoy'], ['Objetivo', 'Objetivo'], ['Traba', 'Qué lo frena'], ['Urgencia', 'Urgencia'], ['Decisor', '¿Decide solo?']];
  function infoLeadHtml(r) {
    const filasKv = CAMPOS_LEAD.filter(([c]) => String(r[c] || '').trim())
      .map(([c, label]) => `<div class="lead-kv"><dt>${label}</dt><dd>${esc(r[c])}</dd></div>`).join('');
    const ig = String(r.Instagram || '').trim().replace(/^@/, '');
    const extra = [
      r.Capital ? `<span class="chip a">capital: ${esc(r.Capital)}</span>` : '',
      ig ? `<a class="chip b" target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(ig)}">@${esc(ig)}</a>` : '',
      r.Email ? `<span class="chip">${esc(r.Email)}</span>` : '',
    ].join('');
    if (!filasKv && !extra) return '<p class="meta">Este lead se agendó sin completar el formulario.</p>';
    return (extra ? `<div class="chiprow" style="margin-bottom:8px">${extra}</div>` : '') + (filasKv ? `<div class="lead-info">${filasKv}</div>` : '');
  }
  // Lo que trae el cruce con la landing (panel.mjs → cruzarConRegistros, por mail o WhatsApp): de qué campaña vino,
  // si calificó y qué respondió al registrarse. Los textos de las preguntas se leen del webinar, una vez por webinar.
  const PREG = {}, PREG_P = {};
  function cargarPreguntas(w) {
    return PREG_P[w] || (PREG_P[w] = apiApp('webinar', { id: w })
      .then(j => { PREG[w] = Object.fromEntries((((j.webinar || {}).landing || {}).preguntas || []).map(p => [p.id, p.texto])); })
      .catch(() => { PREG[w] = {}; }));
  }
  const precargarPreguntas = () => Promise.all([...new Set(filas().map(r => r._registro && r._registro.w).filter(Boolean))].map(cargarPreguntas));
  function registroHtml(r) {
    const g = r._registro;
    if (!g) return '<p class="meta">No aparece registrado a la landing (ni por mail ni por WhatsApp).</p>';
    const u = g.utm || {}, w = ((window.MHQ && MHQ.webinars) || []).find(x => x.id === g.w), textos = PREG[g.w] || {};
    const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].filter(k => u[k]).map(k => `<span class="chip">${k.slice(4)}: ${esc(u[k])}</span>`).join('');
    const resp = Object.entries(g.respuestas || {}).map(([id, v]) => `<div class="lead-kv"><dt>${esc(textos[id] || id)}</dt><dd>${esc(v)}</dd></div>`).join('');
    return `<div class="chiprow" style="margin-bottom:8px">
        <span class="chip ${g.calificado === true ? 'g' : g.calificado === false ? 'r' : ''}">${g.calificado === true ? 'Calificó' : g.calificado === false ? 'No calificó' : 'No respondió las preguntas'}</span>
        ${w ? `<span class="chip">${esc(w.nombre)}</span>` : ''}${g.creado ? `<span class="chip">se registró el ${esc(uiFechaCorta(String(g.creado).slice(0, 10)))}</span>` : ''}
        ${utm || '<span class="chip">sin UTM</span>'}
      </div>${resp ? `<div class="lead-info">${resp}</div>` : ''}`;
  }
  // La ficha del lead, desde cualquier vista de agenda (verInfoLead de hub.js, en el modal de ui-atlas.js)
  function verInfoLead(row) {
    const r = rowDe(row);
    if (!r) { flash('No encontré ese lead', true); return; }
    // si los textos de las preguntas de la landing todavía no llegaron, la ficha se rearma cuando llegan (si sigue abierta)
    const w = r._registro && r._registro.w;
    if (w && !PREG[w]) cargarPreguntas(w).then(() => { const f = document.querySelector('#uiModal.open .ag-ficha'); if (f && f.dataset.row === row) verInfoLead(row); });
    const cuando = (fechaDe(r) || 'sin fecha') + (horaDe(r) ? ' · ' + horaDe(r) : '');
    uiModalAbrir({
      titulo: r.Nombre || 'Info del lead', sub: `${cuando} · ${closerDe(r)}`, ancho: '620px',
      cuerpo: `<div class="ag-ficha" data-row="${esc(row)}"><div class="chiprow" style="margin-bottom:10px">
          <span class="chip ${estCls(r.Estado)}">${esc(r.Estado || '')}</span>${chipFuente(r)}
          ${r.Evento ? `<span class="chip">${esc(r.Evento)}</span>` : ''}
          ${telDe(r) ? `<button class="chip b" onclick="agCenChat('${r._row}')">Mandar WhatsApp</button>` : ''}
        </div>
        <div class="ag-dos-t">Al agendar</div>${infoLeadHtml(r)}
        <div class="ag-dos-t">En la landing</div>${registroHtml(r)}
        ${r.Gatillo ? `<p style="margin-top:10px;font-size:12.5px"><b>Gatillo:</b> ${esc(r.Gatillo)}</p>` : ''}
        ${r.Notas ? `<p class="ag-notas" style="font-size:12.5px"><b>Notas:</b> ${esc(r.Notas)}</p>` : ''}</div>`,
    });
  }
  // El mensaje se muestra y se puede editar antes de salir: ningún mensaje se va a un lead sin que alguien lo lea.
  function abrirWpp(row) {
    const r = rowDe(row);
    if (!r) { flash('No encontré ese lead', true); return; }
    uiModalAbrir({
      titulo: 'Mandar WhatsApp a ' + (r.Nombre || ''), sub: 'Se abre tu WhatsApp con el mensaje listo: revisalo antes de mandarlo.', ancho: '520px',
      cuerpo: `<textarea class="ag-wpp-t" rows="5" aria-label="Mensaje">${uiEsc(waTexto(r))}</textarea>`,
      acciones: [{ texto: 'Cancelar', onclick: 'uiModalCerrar()' }, { texto: 'Abrir en WhatsApp →', onclick: `agWppAbrir('${r._row}')`, pri: true }],
    });
  }
  window.agWppAbrir = (row) => {
    const r = rowDe(row), t = document.querySelector('#uiModal .ag-wpp-t');
    if (!r || !telDe(r)) { uiToast('Este lead no tiene WhatsApp cargado', 'mal'); return; }
    window.open(`https://wa.me/${telDe(r)}?text=${encodeURIComponent(t ? t.value : waTexto(r))}`, '_blank', 'noopener');
    uiModalCerrar();
  };
  // Confirmación neutra (en el hub original era el guion de preseteo de su equipo): cada uno la ajusta antes de mandarla.
  function waTexto(r) {
    const nombre = String(r.Nombre || '').trim().split(/\s+/)[0], f = fechaDe(r), h = hoyAR();
    const dia = !fechaOk(f) ? '' : f === h ? ' de hoy' : f === uiSumarDias(h, 1) ? ' de mañana' : ` del ${DIAS_L[uiF(f).getDay()]} ${uiF(f).getDate()}`;
    return `Hola${nombre ? ' ' + nombre : ''}! ¿Cómo estás? Te escribo para confirmar la llamada${dia}${horaDe(r) ? ' a las ' + horaDe(r) : ''}. ¿Te queda cómodo?`;
  }
  // De qué sistema salió la agenda (en el hub original se deducía del prefijo "ic-" del id; acá la fila lo dice en _fuente)
  const FUENTE_TXT = { iclosed: 'iClosed', calendly: 'Calendly' };
  const chipFuente = (r) => (FUENTE_TXT[r._fuente] ? `<span class="chip fuente-${r._fuente}" title="Agenda tomada desde ${FUENTE_TXT[r._fuente]}">${FUENTE_TXT[r._fuente]}</span>` : '');
  const CAPITALES = [
    { k: '>3K', txt: 'Más de 3.000', cls: 'cap-3k' }, { k: '2-3K', txt: '2.000 a 3.000', cls: 'cap-23k' },
    { k: '1-2K', txt: '1.000 a 2.000', cls: 'cap-12k' }, { k: '<1K', txt: 'Menos de 1.000', cls: 'cap-1k' },
  ];
  function capMeta(v) { return CAPITALES.find(c => c.k === String(v || '').trim()) || { k: '', txt: 'Sin dato', cls: '' }; }

  /* ── un closer, un nombre ──
     La misma persona llega con grafías distintas según de dónde venga la agenda ("Juan Pérez" y "juan perez"):
     se canoniza al mostrar y al agrupar, eligiendo la grafía más frecuente. No reescribe nada. (Los alias a mano del
     hub original eran nombres de su equipo: quedaron afuera.) */
  const _canon = new Map();
  let _grafias = null;
  const normNom = (c) => String(c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  function closerCanon(nombre) {
    const crudo = String(nombre == null ? '' : nombre).trim();
    if (!crudo) return '';
    if (_canon.has(crudo)) return _canon.get(crudo);
    if (!_grafias) {
      const m = {};
      filas().forEach(r => { const c = String(r.Closer || '').trim(); if (c) { const k = normNom(c); (m[k] = m[k] || {})[c] = (m[k][c] || 0) + 1; } });
      _grafias = Object.fromEntries(Object.entries(m).map(([k, g]) => [k, Object.entries(g).sort((a, b) => b[1] - a[1])[0][0]]));
    }
    const out = _grafias[normNom(crudo)] || crudo;
    _canon.set(crudo, out);
    return out;
  }
  // Los closers que todavía no tienen agendas también se tienen que poder elegir: los de Equipo con rol closer
  // (las personas solo las leen equipo y cliente).
  let CLOSERS_APP = null;
  function leerClosersApp() {
    // antes del ingreso no se sabe el rol (shell.js pinta la pantalla del hash al cargar, antes que boot): un closer
    // recibiría 403. boot() vuelve a llamar a la pantalla con YO puesto.
    if (CLOSERS_APP || typeof YO === 'undefined' || !YO || perfilEfectivo() === 'closer') return;
    CLOSERS_APP = [];
    apiApp('personas').then(j => { CLOSERS_APP = (j.personas || []).filter(p => p.rol === 'closer' && p.activo !== false).map(p => p.nombre); }).catch(() => { CLOSERS_APP = null; });
  }
  function tabClosersDisponibles() {
    const set = new Set(CLOSERS_APP || []);
    filas().forEach(r => { const c = canon(r.Closer); if (esReal(c)) set.add(c); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }
  const dstr = (off) => new Date(Date.now() + off * 864e5).toLocaleDateString('en-CA', { timeZone: ZONA() });
  function enCorte(d, rango) {
    if (rango === 'todo') return true;
    if (!d) return false;
    if (rango === '7d' || rango === 'semana') return d >= dstr(-7);
    if (rango === '30d') return d >= dstr(-30);
    return d.slice(0, 7) === hoyAR().slice(0, 7);
  }

  /* ── sincronizar iClosed y Calendly (/api/agendas-sync) ── */
  let SYNC;   // la última corrida (manual o del cron): undefined = sin leer, null = nunca corrió
  function leerSync() {
    fetch('/api/agendas-sync').then(r => r.json()).then(j => { if (j && j.ok) { SYNC = j.estado || null; if (vistaOn('central')) cenPintar(); } }).catch(() => { });
  }
  // la línea de estado de la cabecera de Agendas: en el hub original un sync caído no se veía en ningún lado
  function syncTxt() {
    if (SYNC === undefined) return '';
    if (SYNC === null) return ' · la sincronización con iClosed y Calendly todavía no corrió';
    const fs = [SYNC.iclosed, SYNC.calendly].filter(x => x && !x.saltado);
    if (!fs.length) return ' · <span class="ag-rojo">iClosed y Calendly sin conectar (Integraciones)</span>';
    const mal = fs.filter(x => x.error).map(x => `<span class="ag-rojo"${tip(FUENTE_TXT[x.fuente] + ' no sincronizó', x.error)}>${FUENTE_TXT[x.fuente]} con error</span>`).join(' · ');
    return ` · ${fs.map(x => FUENTE_TXT[x.fuente]).join(' y ')} al día ${haceTxt(SYNC.cuando)}${mal ? ' · ' + mal : ''}`;
  }
  async function sincronizarYa() {
    if (AGC.sync) { uiToast('Ya se está sincronizando…'); return; }
    AGC.sync = true; repintar();
    try {
      const r = await fetch('/api/agendas-sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
      SYNC = { cuando: j.cuando, iclosed: j.iclosed, calendly: j.calendly };
      const fs = [j.iclosed, j.calendly];
      uiToast(fs.map(x => `${FUENTE_TXT[x.fuente]}: ${x.saltado ? 'sin conectar' : x.error ? x.error : plural(x.guardadas || 0, 'agenda nueva o cambiada', 'agendas nuevas o cambiadas') + (x.parcial ? ' (el resto entra solo en unos minutos)' : '')}`).join(' · '), fs.some(x => x.error) ? 'mal' : 'ok');
      await cargarDatos();
    } catch (e) { uiToast('No se pudo sincronizar: ' + e.message, 'mal'); }
    AGC.sync = false; repintar();
  }

  /* ═══════════════════════════ 4 · PIPELINE (renderPipeline de hub.js) ═══════════════════════════ */
  const COLS = [
    { id: 'c-pend', title: 'Pendiente', estados: ['Pendiente'] }, { id: 'c-conf', title: 'Confirmada', estados: ['Confirmada'] },
    { id: 'c-rea', title: 'Re-agenda', estados: ['Re-agenda'] }, { id: 'c-pres', title: 'Presentada', estados: ['Presentada'] },
    { id: 'c-nosh', title: 'No-show', estados: ['No-show'] }, { id: 'c-cerr', title: 'Cerrada', estados: ['Cerrada'] },
    { id: 'c-out', title: 'Fuera', estados: ['Descalificada', 'Cancelada'] },
  ];
  const COLESTADO = { 'c-pend': 'Pendiente', 'c-conf': 'Confirmada', 'c-rea': 'Re-agenda', 'c-pres': 'Presentada', 'c-nosh': 'No-show', 'c-cerr': 'Cerrada', 'c-out': 'Descalificada' };
  const PIP = { rango: 'semana', abiertas: new Set(), pendiente: false };
  // drag & drop entre columnas solo en desktop; en el celular el camino son los chips de estado
  const CAN_DRAG = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const RANGOS = [['7atras', 'Últimos 7'], ['ayer', 'Ayer'], ['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Semana'], ['todo', 'Todos']];
  function enRangoPip(r) {
    const d = fechaDe(r), R = PIP.rango;
    if (R === 'todo') return true;
    if (!d) return R === 'semana';   // sin fecha: visibles en la vista default
    if (R === 'ayer') return d === dstr(-1);
    if (R === 'hoy') return d === dstr(0);
    if (R === 'manana') return d === dstr(1);
    if (R === '7atras') return d >= dstr(-7) && d <= dstr(0);
    return d >= dstr(0) && d <= dstr(7);
  }
  function pipArmar() {
    if ($('board')) return;
    $('pipeline').innerHTML = `<div class="toolbar">
        <input type="search" id="agpQ" placeholder="Buscar…" autocomplete="off" aria-label="Buscar en el pipeline">
        <select id="agpCloser" aria-label="Closer"><option value="">Closers</option></select>
        <select id="agpCapital" aria-label="Capital"><option value="">Capital</option></select>
        <select id="agpOrigen" aria-label="Origen"><option value="">Origen</option></select>
        <select id="agpEvento" aria-label="Evento"><option value="">Evento</option></select>
        <span id="agpRango" style="display:flex;gap:4px">${RANGOS.map(([r, t]) => `<button class="fchip${r === PIP.rango ? ' on' : ''}" data-r="${r}">${t}</button>`).join('')}</span>
        <button class="btn primary" id="agpAdd">+ Agendar</button>
        <button class="btn" id="agpSync" title="Trae ya las agendas nuevas de iClosed y Calendly (solas se traen cada 15 minutos)">↻ Sincronizar</button>
      </div>
      <form id="addform">
        <input name="Nombre" placeholder="Nombre *" required>
        <input name="WhatsApp" placeholder="WhatsApp">
        <input name="Fecha call" type="date" required>
        <input name="Hora" type="time">
        <select name="Capital"><option value="">Capital…</option><option>&lt;1K</option><option>1-2K</option><option>2-3K</option><option>&gt;3K</option></select>
        <input name="Origen" placeholder="Origen" list="agpDlOrigen"><datalist id="agpDlOrigen"></datalist>
        <input name="Closer" placeholder="Closer" list="agpDlCloser"><datalist id="agpDlCloser"></datalist>
        <input name="Setter" placeholder="Setter">
        <button class="btn primary" type="submit">Guardar</button>
        <button class="btn" type="button" id="agpCancelar">Cancelar</button>
      </form>
      <div id="segrow"></div>
      <div id="board"></div>`;
    const board = $('board');
    $('agpQ').addEventListener('input', pipPintar);
    ['agpCloser', 'agpCapital', 'agpOrigen', 'agpEvento'].forEach(id => $(id).addEventListener('change', pipPintar));
    $('agpRango').addEventListener('click', e => {
      const c = e.target.closest('.fchip'); if (!c) return;
      PIP.rango = c.dataset.r;
      document.querySelectorAll('#agpRango .fchip').forEach(x => x.classList.toggle('on', x === c));
      pipPintar();
    });
    $('agpAdd').addEventListener('click', () => $('addform').classList.toggle('open'));
    $('agpCancelar').addEventListener('click', () => $('addform').classList.remove('open'));
    $('agpSync').addEventListener('click', () => sincronizarYa());
    // alta manual
    $('addform').addEventListener('submit', async e => {
      e.preventDefault();
      const data = {};
      Array.from(e.target.elements).forEach(el => { if (el.name && el.value) data[el.name] = el.value; });
      if (!data.Nombre) return;
      data.Estado = 'Pendiente';
      data.Timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      // deshabilitado mientras va el pedido: un doble clic no crea dos filas
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await api('POST', { action: 'add', ...data });
        e.target.reset(); e.target.classList.remove('open');
        flash('Agenda creada ✓');
        cargarDatos().catch(() => { });
      } catch (err) { flash('No se pudo crear: ' + err.message, true); }
      finally { btn.disabled = false; btn.textContent = 'Guardar'; }
    });
    // drag & drop entre columnas
    board.addEventListener('dragstart', e => {
      const c = e.target.closest('.pcard'); if (!c) return;
      c.classList.add('dragging');
      e.dataTransfer.setData('text/plain', c.dataset.row);
      e.dataTransfer.effectAllowed = 'move';
    });
    board.addEventListener('dragend', e => { const c = e.target.closest('.pcard'); if (c) c.classList.remove('dragging'); });
    board.addEventListener('dragover', e => { const col = e.target.closest('.col'); if (col) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drop'); } });
    board.addEventListener('dragleave', e => { const col = e.target.closest('.col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('drop'); });
    board.addEventListener('drop', e => {
      const col = e.target.closest('.col'); if (!col) return;
      e.preventDefault();
      col.classList.remove('drop');
      const row = e.dataTransfer.getData('text/plain'), cls = [...col.classList].find(x => COLESTADO[x]);
      if (!row || !cls) return;
      const r = rowDe(row), def = COLS.find(x => x.id === cls);
      if (r && def && def.estados.includes(r.Estado)) return;   // soltada en su propia columna: no pisar No-show/Cancelada
      let estado = COLESTADO[cls];
      if (cls === 'c-out') estado = confirm('¿Lo descalificaste?\nAceptar = Descalificada · Cancelar = Cancelada') ? 'Descalificada' : 'Cancelada';
      if (estado === 'Cerrada') PIP.abiertas.add(row);
      agSet(row, 'Estado', estado);
      if (estado === 'Cerrada') setTimeout(() => { const i = document.querySelector(`.pcard[data-row="${row}"] .extra input`); if (i) i.focus(); }, 100);
    });
    // el drag no tiene que secuestrar la selección de texto en los inputs
    board.addEventListener('pointerdown', e => { const c = e.target.closest('.pcard'); if (c) c.draggable = CAN_DRAG && !e.target.closest('input,select,.extra'); });
    // clic en la card: abre monto · gatillo · notas
    board.addEventListener('click', e => {
      if (e.target.closest('select,input,a,button,.extra')) return;
      const c = e.target.closest('.pcard'); if (!c) return;
      const row = c.dataset.row;
      if (PIP.abiertas.has(row)) PIP.abiertas.delete(row); else PIP.abiertas.add(row);
      c.classList.toggle('open');
    });
    // no se repinta mientras alguien escribe en una card: se repinta al salir
    board.addEventListener('focusout', () => setTimeout(() => {
      if (PIP.pendiente && !(document.activeElement && document.activeElement.matches && document.activeElement.matches('#board input'))) { PIP.pendiente = false; pipPintar(); }
    }, 0));
  }
  function opciones(sel, vals) {
    const cur = sel.value;
    sel.innerHTML = sel.options[0].outerHTML + [...new Set(vals)].filter(Boolean).sort().map(v => `<option>${esc(v)}</option>`).join('');
    sel.value = cur;
  }
  function pipFiltradas() {
    const t = $('agpQ').value.trim().toLowerCase(), fc = $('agpCloser').value, fk = $('agpCapital').value, fo = $('agpOrigen').value, fe = $('agpEvento').value;
    return filas().filter(r => (!t || [r.Nombre, r.Closer, r.Origen, r.Setter, r.Email].join(' ').toLowerCase().includes(t))
      && (!fc || r.Closer === fc) && (!fk || String(r.Capital) === fk) && (!fo || r.Origen === fo) && (!fe || r.Evento === fe)
      && (t ? true : enRangoPip(r)));   // buscando por texto se ignora el rango
  }
  function pipCard(r) {
    const hoyEs = fechaDe(r) === hoyAR(), tel = telDe(r), fecha = (fechaDe(r) || 'sin fecha') + (horaDe(r) ? ' · ' + horaDe(r) : '');
    return `<div class="pcard${hoyEs ? ' today' : ''}${PIP.abiertas.has(r._row) ? ' open' : ''}" data-row="${esc(r._row)}" draggable="${CAN_DRAG}">
      <b style="cursor:pointer" title="Ver lo que respondió al agendar" onclick="event.stopPropagation();agCenVerLead('${r._row}')">${esc(r.Nombre)}</b>
      <div class="meta">
        <span>${esc(fecha)}</span>
        <span>${esc(r.Closer || '')}</span>
        ${r.Capital ? `<span class="chip a">${esc(r.Capital)}</span>` : ''}
        ${chipFuente(r)}
        ${r.Estado === 'No-show' ? '<span class="chip r">NO-SHOW</span>' : ''}
      </div>
      <div class="extra">
        ${estChips(r._row, r.Estado)}
        <input placeholder="Monto cerrado (${MON()})" value="${esc(r.Monto)}" onchange="agSet('${r._row}','Monto',this.value)">
        <input placeholder="Gatillo (¿qué lo hizo agendar?)" value="${esc(r.Gatillo)}" onchange="agSet('${r._row}','Gatillo',this.value)">
        <input placeholder="Notas" value="${esc(r.Notas)}" onchange="agSet('${r._row}','Notas',this.value)">
        <div class="meta">
          ${r.Origen ? `<span class="chip">${esc(r.Origen)}</span>` : ''}
          ${r.Evento ? `<span class="chip">${esc(String(r.Evento).slice(0, 26))}</span>` : ''}
          ${tel ? `<a class="chip b" target="_blank" rel="noopener" href="https://wa.me/${tel}">WhatsApp</a>` : ''}
        </div>
        ${perfilEfectivo() === 'closer' ? '' : `<button class="copybtn" style="color:var(--red);margin-top:4px" onclick="agBorrar('${r._row}')">🗑 Borrar card</button>`}
      </div>
    </div>`;
  }
  function pipPintar() {
    if (!$('board')) return;
    const b = $('agpSync'); if (b) { b.disabled = !!AGC.sync; b.textContent = AGC.sync ? 'Sincronizando…' : '↻ Sincronizar'; }
    if (document.activeElement && document.activeElement.matches && document.activeElement.matches('#board input')) { PIP.pendiente = true; return; }
    if (!cargado()) { $('board').innerHTML = '<p style="padding:12px;color:var(--muted)">Cargando…</p>'; return; }
    const rows = pipFiltradas(), todas = filas();
    opciones($('agpCloser'), todas.map(r => r.Closer));
    opciones($('agpCapital'), todas.map(r => String(r.Capital || '')));
    opciones($('agpOrigen'), todas.map(r => r.Origen));
    opciones($('agpEvento'), todas.map(r => r.Evento));
    $('agpDlOrigen').innerHTML = [...new Set(todas.map(r => r.Origen))].filter(Boolean).map(v => `<option>${esc(v)}</option>`).join('');
    $('agpDlCloser').innerHTML = tabClosersDisponibles().map(v => `<option>${esc(v)}</option>`).join('');
    // tooltip de cada columna: cuántas hay, cuánto pesan en lo que muestra el filtro y, en "Fuera", de qué estado
    const tipCol = (c, n) => `${c.title}\n${plural(n, 'agenda')} · ${pctCorto(n, rows.length)} de las ${rows.length} que muestra el filtro${c.estados.length > 1 ? '\n' + c.estados.map(e => `${e}: ${rows.filter(r => r.Estado === e).length}`).join(' · ') : ''}`;
    $('board').innerHTML = COLS.map(c => {
      const cs = rows.filter(r => c.estados.includes(r.Estado)).sort((a, b) => fkey(a).localeCompare(fkey(b)));
      return `<div class="col ${c.id}"><h3>${c.title} <span class="count" data-tip="${esc(tipCol(c, cs.length))}">${cs.length}</span></h3>
        <div class="cards">${cs.map(pipCard).join('')}</div></div>`;
    }).join('');
    $('segrow').innerHTML = COLS.map((c, i) => {
      const n = rows.filter(r => c.estados.includes(r.Estado)).length;
      return `<button class="fchip" data-tip="${esc(tipCol(c, n) + '\nClic para ir a la columna')}" onclick="document.querySelectorAll('#board .col')[${i}].scrollIntoView({inline:'start',behavior:'smooth',block:'nearest'})">${c.title.split(' ')[0]} ${n}</button>`;
    }).join('');
  }

  /* ═══════════════════════════ 5 · PRE-CALL (renderPrecall de hub.js + el dossier) ═══════════════════════════ */
  function preArmar() {
    if ($('agpcLista')) return;
    $('precall').innerHTML = `<div class="toolbar">
        <input type="search" id="agpcQ" placeholder="Buscar…" autocomplete="off" aria-label="Buscar en las próximas">
        <label><input type="checkbox" id="agpcTodas"> Mostrar todas las futuras (no solo 48 h)</label>
      </div>
      <div id="agpcLista"></div>`;
    $('agpcQ').addEventListener('input', prePintar);
    $('agpcTodas').addEventListener('change', prePintar);
  }
  function prePintar() {
    const caja = $('agpcLista');
    if (!caja) return;
    if (!cargado()) { caja.innerHTML = '<p style="padding:12px;color:var(--muted)">Cargando…</p>'; return; }
    const todas = $('agpcTodas').checked, t = $('agpcQ').value.trim().toLowerCase(), h = hoyAR(), lim = uiSumarDias(h, 2);
    const rows = filas()
      .filter(r => ['Pendiente', 'Confirmada', 'Re-agenda'].includes(r.Estado))
      .filter(r => { const d = fechaDe(r); return d >= h && (todas || d <= lim); })
      .filter(r => !t || [r.Nombre, r.Closer, r.Origen, r.WhatsApp].join(' ').toLowerCase().includes(t))
      .sort((a, b) => fkey(a).localeCompare(fkey(b)));
    caja.innerHTML = rows.length ? rows.map(r => {
      const d = fechaDe(r);
      return `<div class="pc${d === h ? ' today' : ''}">
        <div class="when"><b>${horaDe(r) ? esc(horaDe(r)) : '--:--'}</b><span>${d === h ? 'HOY' : d === uiSumarDias(h, 1) ? 'MAÑANA' : esc(uiFechaCorta(d))}</span></div>
        <div class="who">
          <b style="cursor:pointer" title="Ver la ficha completa" onclick="agCenVerLead('${r._row}')">${esc(r.Nombre)}</b>
          <div class="meta">
            <span>${esc(r.Closer || 'sin closer')}</span>
            ${r.Capital ? `<span class="chip a">${esc(r.Capital)}</span>` : ''}
            ${r.Origen ? `<span class="chip">${esc(r.Origen)}</span>` : ''}
            ${r.Evento ? `<span class="chip">${esc(r.Evento)}</span>` : ''}
            <span class="chip ${r.Estado === 'Confirmada' ? 'b' : 'a'}">${esc(r.Estado)}</span>
            ${telDe(r) ? `<button class="chip b" onclick="event.stopPropagation();agCenChat('${r._row}')">Mandar WhatsApp</button>` : ''}
          </div>
          <details class="ag-dossier" open><summary>Dossier</summary>
            <div class="ag-dossier-g"><div><div class="ag-dos-t">Al agendar</div>${infoLeadHtml(r)}</div><div><div class="ag-dos-t">En la landing</div>${registroHtml(r)}</div></div>
          </details>
          ${r.Gatillo ? `<p><b>Gatillo:</b> ${esc(r.Gatillo)}</p>` : ''}
          ${r.Notas ? `<p class="ag-notas"><b>Notas:</b> ${esc(r.Notas)}</p>` : ''}
        </div>
        <div class="estrow" style="flex-direction:column;align-items:stretch">
          <button class="copybtn" onclick="agSet('${r._row}','Estado','Confirmada')">✓ Confirmada</button>
          <button class="copybtn" onclick="agSet('${r._row}','Estado','Re-agenda')">↺ Re-agenda</button>
          <button class="copybtn" onclick="agCenDescalificar('${r._row}')">✕ Descalificar</button>
        </div>
      </div>`;
    }).join('') : '<p style="padding:12px;color:var(--muted)">Sin llamadas próximas en esta ventana.</p>';
  }

  /* ═════════════════ 6 · LLAMADAS (renderTablero y renderHistorial de hub.js) ═════════════════
     El día: dos columnas por hora, con closer y sin closer (en el hub original se partió después entre los dos setters del
     equipo). Se arrastra una llamada al otro lado o se toca ⇄: soltar en "sin closer" le saca el closer; en "con
     closer" abre el desplegable para elegir quién la toma (no se inventa un closer). "‹ Días anteriores" es un modo:
     todas las que ya pasaron, con su closer y su resultado, para cargar lo que falta. */
  const TAB = { dia: null, closer: 'Todos', canal: 'Todos' };
  const TAB_DIAS_MAX = 45;   // tope de pestañas de día, para que no se desborde la fila
  const HIS = { rango: '30d', estado: 'todas', closer: 'Todos', tope: 200 };
  try { HIS.closer = localStorage.getItem('mhqhiscloser') || 'Todos'; } catch (e) { /* storage bloqueado */ }
  const HIS_ESTADOS = [
    ['todas', 'Todas', () => true], ['sincargar', 'Sin cargar', r => SIN_RESULTADO(r.Estado)],
    ['Cerrada', 'Cerradas', r => r.Estado === 'Cerrada'], ['Presentada', 'Presentadas', r => r.Estado === 'Presentada'],
    ['No-show', 'No-show', r => r.Estado === 'No-show'], ['Cancelada', 'Canceladas', r => r.Estado === 'Cancelada'],
    ['Descalificada', 'Descalificadas', r => r.Estado === 'Descalificada'],
  ];
  const HIS_RANGOS = [['7d', '7 días'], ['30d', '30 días'], ['todo', 'Todo']];
  const DIAS_X = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const tabDelDia = (dia) => filas().filter(r => fechaDe(r) === dia).sort((a, b) => horaDe(a).localeCompare(horaDe(b)));
  const conCloser = (r) => esReal(canon(r.Closer));
  function llaArmar() {
    if ($('agTabDias')) return;
    $('llamadas').innerHTML = `<div class="card">
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:2px">
        <h3 id="agTabTitulo" style="font-size:18px;font-weight:800">Llamadas</h3>
        <span class="meta" id="agTabSub" style="color:var(--muted);font-size:12.5px"></span>
      </div>
      <div class="tab-dias" id="agTabDias"></div>
      <div id="agTabModoDia">
        <div class="chiprow" id="agTabClosers" style="margin-top:10px"></div>
        <div class="chiprow" id="agTabCanales" style="margin-top:6px"></div>
        <div class="chiprow" id="agTabCapital" style="margin-top:6px"></div>
        <p class="meta" style="margin-top:8px;color:var(--muted);font-size:12.5px">Izquierda: las que ya tienen closer. Derecha: las que faltan repartir. Para asignar o pasar una llamada, elegí el closer en el desplegable, tocá ⇄ o arrastrala de lado. Tocá el estado para cargar qué pasó.</p>
        <div class="tab-board" id="agTabBoard"></div>
      </div>
      <div id="agTabModoHistorial" style="display:none">
        <p id="agHisSub" style="color:var(--muted);font-size:12.5px;margin:10px 0"></p>
        <div class="chiprow" id="agHisRango"></div>
        <div class="chiprow" id="agHisEstado"></div>
        <div class="chiprow" id="agHisCloser"></div>
        <input type="search" id="agHisQ" placeholder="Buscar en el historial…" autocomplete="off" aria-label="Buscar en el historial" class="ag-his-q">
        <div id="agHisPorCloser"></div>
        <div id="agHisTabla" class="his-grid"></div>
        <div class="tw" style="margin-top:10px;border:0;background:none"><div class="tfoot" id="agHisFuente" style="border-top:1px solid var(--line)"></div></div>
        <div id="agHisMas"></div>
      </div>
      <div class="ag-nota ag-mt">${uiIco('video', 14)}Las grabaciones de Fathom y su análisis con IA se suman acá más adelante, en cada llamada que ya pasó.</div>
    </div>`;
    $('agHisQ').addEventListener('input', () => { HIS.tope = 200; llaPintar(); });
  }
  // el que entra como closer ve primero sus llamadas (en el hub original no sabía quién eras). Va aparte de llaArmar:
  // al recargar en #llamadas la pantalla se arma antes del ingreso, cuando todavía no se sabe quién entró.
  let hisDeYo = false;
  function hisCloserDeYo() {
    if (hisDeYo || typeof YO === 'undefined' || !YO) return;
    hisDeYo = true;
    try { if (!localStorage.getItem('mhqhiscloser') && perfilEfectivo() === 'closer' && YO.nombre) HIS.closer = canon(YO.nombre); } catch (e) { }
  }
  // Los días salen de las agendas que EXISTEN, no de una ventana fija: en el hub original, 7 días desde hoy dejaban invisibles
  // las llamadas del fin de semana siguiente. Todos los días con alguna agenda viva de hoy en adelante, más hoy.
  function tabRenderDias() {
    const desdeHoy = hoyAR(), conAgenda = new Set([desdeHoy]);
    filas().forEach(r => { const f = fechaDe(r); if (fechaOk(f) && f >= desdeHoy && r.Estado !== 'Cancelada') conAgenda.add(f); });
    const dias = [...conAgenda].sort().slice(0, TAB_DIAS_MAX);
    if (!TAB.dia || (TAB.dia !== 'anteriores' && !dias.includes(TAB.dia))) TAB.dia = dias[0];
    const pasadas30 = filas().filter(r => { const f = fechaDe(r); return fechaOk(f) && f < desdeHoy && f >= dstr(-30); }).length;
    const tabAnteriores = `<button class="tab-dia${TAB.dia === 'anteriores' ? ' on' : ''}" data-dia="anteriores" data-tip="${esc(`Días anteriores\n${plural(pasadas30, 'llamada')} en los últimos 30 días\nClic para ver el historial`)}"><b>‹ Días anteriores</b><span>últimos 30 · ${pasadas30}</span></button>`;
    $('agTabDias').innerHTML = tabAnteriores + dias.map(dia => {
      const calls = tabDelDia(dia).filter(r => r.Estado !== 'Cancelada');
      const sinCloser = calls.filter(r => !conCloser(r)).length;
      const [a, m, d] = dia.split('-').map(Number);
      const wd = DIAS_X[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
      const canc = tabDelDia(dia).length - calls.length;
      const tipDia = `${wd} ${d}/${m}\n${plural(calls.length, 'llamada')}${calls.length ? (sinCloser ? ` · ${sinCloser} sin closer (${pctCorto(sinCloser, calls.length)})` : ' · todas con closer') : ''}${canc ? '\n' + plural(canc, 'cancelada') : ''}\nClic para ver el tablero del día`;
      return `<button class="tab-dia${dia === TAB.dia ? ' on' : ''}" data-dia="${dia}" data-tip="${esc(tipDia)}"><b>${wd} ${d}/${m}</b><span>${plural(calls.length, 'llamada')}${sinCloser ? ' · ' + sinCloser + ' sin closer' : ''}</span></button>`;
    }).join('');
    document.querySelectorAll('#agTabDias [data-dia]').forEach(b => b.addEventListener('click', () => { TAB.dia = b.dataset.dia; TAB.closer = 'Todos'; TAB.canal = 'Todos'; llaPintar(); }));
  }
  function tabCardHtml(r) {
    const cap = capMeta(r.Capital), cancelada = r.Estado === 'Cancelada', tel = String(r.WhatsApp || '').trim();
    const actual = conCloser(r) ? canon(r.Closer) : '';
    const closers = tabClosersDisponibles();
    if (actual && !closers.includes(actual)) closers.push(actual);
    return `<div class="tab-card ${cap.cls}${cancelada ? ' cancelada' : ''}" draggable="${!cancelada}" data-row="${esc(r._row)}">
      <div class="tc-top">
        <span class="tc-nom" title="${esc(r.Nombre || '')}" onclick="agCenVerLead('${r._row}')" style="cursor:pointer">${esc(r.Nombre || 'sin nombre')}</span>
        <button class="tc-btn" title="Pasar al otro lado" onclick="agTabCloser('${r._row}')">⇄</button>
        <span class="chip ${estCls(r.Estado)}" style="cursor:pointer" title="Tocá para cargar qué pasó" onclick="agEditEstado(this,'${r._row}')">${esc(r.Estado || '—')}</span>
      </div>
      ${tel ? `<div class="tc-tel">${esc(tel)}</div>` : ''}
      <div class="tc-bot">
        <span class="tc-cap" data-tip="${esc(`Capital declarado\n${cap.k ? cap.txt : 'sin dato (no contestó o no matchea ningún tramo)'}`)}">${esc(cap.k || 'Sin dato')}</span>
        <span class="tc-canal" data-tip="${esc(`${canalDe(r)}\nDe dónde salió la agenda: ${r.Origen || 'sin origen'}`)}">${esc(canalDe(r))}</span>
        <select onchange="agSet('${r._row}','Closer',this.value)" aria-label="Closer">
          <option value="">— sin closer —</option>
          ${closers.map(c => `<option value="${esc(c)}"${c === actual ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }
  function renderTablero() {
    const calls = tabDelDia(TAB.dia), vivas = calls.filter(r => r.Estado !== 'Cancelada');
    const conteo = {};
    vivas.forEach(r => { const c = conCloser(r) ? canon(r.Closer) : 'Sin closer'; conteo[c] = (conteo[c] || 0) + 1; });
    const canceladasDia = calls.length - vivas.length;
    // "vivas" son todas las del día menos las canceladas, en cualquier estado: no son "confirmadas"
    const tipChipDia = (c, n) => c === 'Todos'
      ? `Todas las del día\n${plural(n, 'llamada')} agendada${n === 1 ? '' : 's'}, sin contar las canceladas${canceladasDia ? ` (${canceladasDia})` : ''}\nClic para ver todas`
      : `${c}\n${plural(n, 'llamada')} · ${pctCorto(n, vivas.length)} del día (sin canceladas)\nClic para filtrar`;
    $('agTabClosers').innerHTML = [['Todos', vivas.length], ...Object.entries(conteo).sort((a, b) => b[1] - a[1])].map(([c, n]) =>
      `<button class="fchip${TAB.closer === c ? ' on' : ''}" data-c="${esc(c)}" data-tip="${esc(tipChipDia(c, n))}">${esc(c)} ${n}</button>`).join('');
    document.querySelectorAll('#agTabClosers [data-c]').forEach(b => b.addEventListener('click', () => { TAB.closer = b.dataset.c; llaPintar(); }));
    // de dónde salió cada agenda
    const porCanal = {};
    vivas.forEach(r => { const k = canalDe(r); porCanal[k] = (porCanal[k] || 0) + 1; });
    $('agTabCanales').innerHTML = [['Todos', vivas.length], ...Object.entries(porCanal).sort((a, b) => b[1] - a[1])].map(([c, n]) =>
      `<button class="fchip${TAB.canal === c ? ' on' : ''}" data-canal="${esc(c)}" data-tip="${esc(tipChipDia(c, n))}">${esc(c)} ${n}</button>`).join('');
    document.querySelectorAll('#agTabCanales [data-canal]').forEach(b => b.addEventListener('click', () => { TAB.canal = b.dataset.canal; llaPintar(); }));
    $('agTabCapital').innerHTML = CAPITALES.map(c => {
      const n = vivas.filter(r => capMeta(r.Capital).k === c.k).length;
      return n ? `<span class="chip" data-tip="${esc(`${c.txt}\n${plural(n, 'llamada')} · ${pctCorto(n, vivas.length)} del día`)}"><span class="salud-dot" style="background:${{ 'cap-3k': 'var(--green)', 'cap-23k': 'var(--blue)', 'cap-12k': 'var(--amber)' }[c.cls] || 'var(--red)'}"></span>${c.txt} ${n}</span>` : '';
    }).join('');
    const visibles = calls.filter(r => (TAB.canal === 'Todos' || canalDe(r) === TAB.canal)
      && (TAB.closer === 'Todos' || (conCloser(r) ? canon(r.Closer) : 'Sin closer') === TAB.closer));
    $('agTabTitulo').textContent = 'Llamadas del ' + TAB.dia.split('-').reverse().slice(0, 2).join('/');
    $('agTabSub').textContent = `${plural(vivas.length, 'agendada')}${canceladasDia ? ' · ' + plural(canceladasDia, 'cancelada') : ''}`;
    const horas = [...new Set(visibles.map(r => horaDe(r) || '--:--'))].sort();
    const board = $('agTabBoard');
    if (!horas.length) { board.innerHTML = '<p class="meta" style="padding:14px">No hay llamadas para este día con estos filtros.</p>'; return; }
    const nCon = visibles.filter(conCloser).length, nSin = visibles.length - nCon;
    board.innerHTML = `<div class="tab-head"><div>Hora</div><div data-tip="${esc(`Con closer\n${plural(nCon, 'llamada')} · ${pctCorto(nCon, visibles.length)} de las que se ven`)}">Con closer ${nCon}</div><div data-tip="${esc(`Sin closer: faltan repartir\n${plural(nSin, 'llamada')} · ${pctCorto(nSin, visibles.length)} de las que se ven`)}">Sin closer ${nSin}</div></div>`
      + horas.map(h => {
        const delRango = visibles.filter(r => (horaDe(r) || '--:--') === h);
        return `<div class="tab-fila"><div class="tab-hora">${esc(h)}</div>
          <div class="tab-col" data-lado="con">${delRango.filter(conCloser).map(tabCardHtml).join('')}</div>
          <div class="tab-col" data-lado="sin">${delRango.filter(r => !conCloser(r)).map(tabCardHtml).join('')}</div></div>`;
      }).join('');
    board.querySelectorAll('.tab-card[draggable="true"]').forEach(card => card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.row); e.dataTransfer.effectAllowed = 'move'; }));
    board.querySelectorAll('.tab-col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drop');
        const row = e.dataTransfer.getData('text/plain');
        if (!row) return;
        if (col.dataset.lado === 'sin') { if (conCloser(rowDe(row) || {})) agSet(row, 'Closer', ''); }
        else window.agTabCloser(row);
      });
    });
  }
  // ⇄: la columna sale del closer, así que pasar de lado es elegir uno en el desplegable de la tarjeta
  window.agTabCloser = (row) => {
    const sel = document.querySelector(`#agTabBoard .tab-card[data-row="${row}"] select`);
    if (sel) { sel.focus(); if (sel.showPicker) { try { sel.showPicker(); } catch (e) { /* no todos los navegadores */ } } }
    else flash('Elegí el closer en el desplegable de la tarjeta');
  };
  // Las que YA pasaron (el "Historial" de hub.js). El estado lo carga el closer después de la llamada.
  function renderHistorial() {
    const h = hoyAR();
    const enRango = filas().filter(r => { const d = fechaDe(r); return fechaOk(d) && d < h && enCorte(d, HIS.rango); });
    $('agHisRango').innerHTML = HIS_RANGOS.map(([k, l]) => `<button class="fchip${HIS.rango === k ? ' on' : ''}" data-hr="${k}">${l}</button>`).join('');
    $('agHisEstado').innerHTML = HIS_ESTADOS.map(([k, l, fn]) => {
      const n = enRango.filter(fn).length;
      const t = k === 'todas' ? `Todas\n${plural(n, 'llamada')} que ya pasaron en la ventana` : `${l}\n${plural(n, 'llamada')} · ${pctCorto(n, enRango.length)} de las ${enRango.length} de la ventana\nClic para filtrar`;
      return `<button class="fchip${HIS.estado === k ? ' on' : ''}" data-he="${esc(k)}" data-tip="${esc(t)}">${l} ${n}</button>`;
    }).join('');
    const closers = [...new Set(enRango.filter(conCloser).map(r => canon(r.Closer)))].sort();
    if (HIS.closer !== 'Todos' && !closers.includes(HIS.closer)) closers.push(HIS.closer);
    $('agHisCloser').innerHTML = ['Todos', ...closers].map(c => `<button class="fchip${HIS.closer === c ? ' on' : ''}" data-hc="${esc(c)}">${esc(c)}</button>`).join('');
    // Quién tiene llamadas sin cargar: una cola de trabajo, no un ranking. Cada tarjeta filtra a "ese closer + sin cargar".
    const porCloser = {};
    enRango.forEach(r => { const c = conCloser(r) ? canon(r.Closer) : 'Sin closer'; porCloser[c] = porCloser[c] || { n: 0, falta: 0 }; porCloser[c].n++; if (SIN_RESULTADO(r.Estado)) porCloser[c].falta++; });
    const filasCloser = Object.entries(porCloser).filter(([, d]) => d.falta).sort((a, b) => b[1].falta - a[1].falta);
    $('agHisPorCloser').innerHTML = filasCloser.length ? `<div class="tiles" style="margin:2px 0 12px">${filasCloser.map(([c, d]) =>
      `<div class="tile" style="cursor:pointer" data-tip="${esc(`${c} · sin cargar\n${d.falta} de ${d.n} llamadas que ya pasaron (${pctCorto(d.falta, d.n)})\nClic para ver su cola`)}" data-c="${esc(c)}" onclick="agHisCola(this.dataset.c)"><b>${d.falta}</b><span>${esc(c)} · sin cargar</span><p>de ${d.n} que ya pasaron · ${Math.round(100 * d.falta / d.n)}%</p></div>`).join('')}</div>` : '';
    const fnEstado = (HIS_ESTADOS.find(e => e[0] === HIS.estado) || HIS_ESTADOS[0])[2];
    const texto = $('agHisQ').value.trim().toLowerCase();
    const lista = enRango.filter(fnEstado)
      .filter(r => HIS.closer === 'Todos' || (conCloser(r) && canon(r.Closer) === HIS.closer))
      .filter(r => !texto || Object.values(r).join(' ').toLowerCase().includes(texto))
      .sort((a, b) => fkey(b).localeCompare(fkey(a)));   // lo más reciente arriba
    const sinCargar = enRango.filter(r => SIN_RESULTADO(r.Estado)).length;
    $('agHisSub').textContent = 'De la más reciente a la más vieja. Tocá el estado para cargar qué pasó.';
    $('agTabSub').innerHTML = [plural(enRango.length, 'llamada'), sinCargar ? `<b>${sinCargar} sin cargar</b>` : '',
      `${enRango.filter(r => r.Estado === 'Cerrada').length} cerradas`, `${enRango.filter(r => r.Estado === 'Cancelada').length} canceladas`].filter(Boolean).join(' · ');
    const vis = lista.slice(0, HIS.tope);
    $('agHisTabla').innerHTML = vis.length ? vis.map(r => {
      const tel = telDe(r), f = fechaDe(r), cap = capMeta(r.Capital);
      return `<div class="his-card ${cap.cls}${r.Estado === 'Cancelada' ? ' baja' : ''}">
        <div class="tc-top">
          <span class="his-nom" title="${esc(r.Nombre || '')}" onclick="agCenVerLead('${r._row}')" style="cursor:pointer">${esc(r.Nombre || 'sin nombre')}</span>
          <span class="his-cuando">${esc(f.split('-').reverse().slice(0, 2).join('/'))}${horaDe(r) ? ' ' + esc(horaDe(r)) : ''}</span>
        </div>
        ${tel ? `<a class="his-tel" href="https://wa.me/${tel}" target="_blank" rel="noopener">${esc(r.WhatsApp)}</a>` : ''}
        <div class="his-pie">
          <span class="tc-cap" data-tip="${esc(`Capital declarado\n${cap.k ? cap.txt : 'sin dato (no contestó o no matchea ningún tramo)'}`)}">${esc(cap.k || 'Sin dato')}</span>
          <span class="tc-canal" data-tip="${esc(`${canalDe(r)}\nDe dónde salió la agenda: ${r.Origen || 'sin origen'}`)}">${esc(canalDe(r))}</span>
          ${conCloser(r) ? `<span class="tc-canal">${esc(canon(r.Closer))}</span>` : ''}
        </div>
        <div class="his-pie">
          <span class="chip ${estCls(r.Estado)}" style="cursor:pointer" title="Tocá para cargar qué pasó" onclick="agEditEstado(this,'${r._row}')">${esc(r.Estado || '—')}</span>
          ${r.Estado === 'Cerrada' && r.Monto ? `<span class="his-monto">${usd(montoDe(r))}</span>` : ''}
        </div>
      </div>`;
    }).join('') : '<p style="padding:14px;color:var(--muted);grid-column:1/-1">Ninguna llamada con estos filtros.</p>';
    $('agHisMas').innerHTML = lista.length > vis.length ? `<button class="fchip" id="agHisMasBtn" style="margin-top:10px">Ver ${Math.min(200, lista.length - vis.length)} más (quedan ${lista.length - vis.length})</button>` : '';
    const mas = $('agHisMasBtn'); if (mas) mas.onclick = () => { HIS.tope += 200; llaPintar(); };
    $('agHisFuente').innerHTML = 'El mismo pipeline que Agendas. El estado lo carga el closer después de la llamada: lo que figura como Pendiente o Confirmada y ya pasó quiere decir que nadie lo cargó, no que no haya pasado nada. Por eso el show-up y la tasa de cierre de Métricas se calculan sobre las que sí tienen resultado.';
    document.querySelectorAll('#agHisRango [data-hr]').forEach(b => b.onclick = () => { HIS.rango = b.dataset.hr; HIS.tope = 200; llaPintar(); });
    document.querySelectorAll('#agHisEstado [data-he]').forEach(b => b.onclick = () => { HIS.estado = b.dataset.he; HIS.tope = 200; llaPintar(); });
    document.querySelectorAll('#agHisCloser [data-hc]').forEach(b => b.onclick = () => {
      HIS.closer = b.dataset.hc; HIS.tope = 200;
      try { localStorage.setItem('mhqhiscloser', HIS.closer); } catch (e) { /* storage bloqueado */ }
      llaPintar();
    });
  }
  // Atajo desde las tarjetas de "sin cargar": deja el historial en la cola de ese closer.
  window.agHisCola = (closer) => {
    HIS.closer = closer; HIS.estado = 'sincargar'; HIS.tope = 200;
    try { localStorage.setItem('mhqhiscloser', closer); } catch (e) { /* storage bloqueado */ }
    llaPintar();
    const t = $('agHisEstado'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  function llaPintar() {
    if (!$('agTabDias')) return;
    if (!cargado()) { $('agTabBoard').innerHTML = '<p class="meta" style="padding:14px">Cargando…</p>'; return; }
    tabRenderDias();
    const esHist = TAB.dia === 'anteriores';
    $('agTabModoDia').style.display = esHist ? 'none' : '';
    $('agTabModoHistorial').style.display = esHist ? '' : 'none';
    if (esHist) { $('agTabTitulo').textContent = 'Llamadas que ya pasaron'; renderHistorial(); }
    else renderTablero();
  }

  /* ═══════════════════════════ registro de las pantallas ═══════════════════════════ */
  // la pantalla de la familia que esté a la vista, con los datos de ahora
  function repintar() {
    _grafias = null; _canon.clear();   // las grafías de los closers se recalculan con los datos nuevos
    if (vistaOn('closers')) metPintar();
    else if (vistaOn('central')) cenPintar();
    else if (vistaOn('analisis')) anaPintar();
    else if (vistaOn('pipeline')) pipPintar();
    else if (vistaOn('llamadas')) llaPintar();
    else if (vistaOn('precall')) prePintar();
  }
  window.PANTALLAS = window.PANTALLAS || {};
  window.PANTALLAS.closers = function () { leerClosersApp(); metCabecera(); metPintar(); };
  window.PANTALLAS.central = function () { leerClosersApp(); subirModales(); leerSync(); cenPintar(); if (AGA.evals === null) anaCargar(); };
  window.PANTALLAS.analisis = function () {
    const ex = $('pageExtra');
    if (ex) ex.innerHTML = uiPeriodo(PER_ANA, 'agAnaPeriodo');
    subirModales();
    anaPintar();
    if (AGA.evals === null) anaCargar();
  };
  window.PANTALLAS.pipeline = function () { leerClosersApp(); subirModales(); pipArmar(); pipPintar(); };
  window.PANTALLAS.llamadas = function () { leerClosersApp(); subirModales(); llaArmar(); hisCloserDeYo(); llaPintar(); };
  window.PANTALLAS.precall = function () { subirModales(); preArmar(); prePintar(); };
  // el pipeline cambió (carga, edición, sincronización): se repinta lo que esté a la vista. Los textos de las
  // preguntas de la landing (para el dossier) se piden una vez por webinar.
  document.addEventListener('mhq:datos', () => {
    LISTO = true;
    repintar();
    precargarPreguntas().then(() => { if (vistaOn('precall')) prePintar(); });
  });
  // como en el hub original: al volver a la pestaña del navegador, el tablero se pone al día solo
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ['closers', 'central', 'analisis', 'pipeline', 'llamadas', 'precall'].some(vistaOn)) cargarDatos().catch(() => { });
  });
  // Resaltado por grupo (donas con su leyenda, puntos de un día del calendario): dentro de un
  // .ag-hl, pasar el mouse por algo con data-seg prende todo lo que comparte ese data-seg y apaga el
  // resto; si hay un centro de dona y el elemento trae data-cv/data-cl, el centro pasa a decir eso.
  // Es el mismo gesto que uiDona de ui-atlas.js, para la dona propia (la de la referencia con huecos y puntas).
  let hlActivo = null;   // el único .ag-hl prendido: así no se recorre el DOM en cada movimiento
  function hlReset(c) {
    c.classList.remove('hov'); delete c.dataset.k; c._hlEl = null;
    c.querySelectorAll('[data-seg].on').forEach(x => x.classList.remove('on'));
    const ctr = c.querySelector('.ag-dona-c');
    if (ctr && ctr.dataset.orig != null) { ctr.innerHTML = ctr.dataset.orig; delete ctr.dataset.orig; }
  }
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.ag-hl [data-seg]');
    const c = el ? el.closest('.ag-hl') : null;
    if (hlActivo && hlActivo !== c) { hlReset(hlActivo); hlActivo = null; }
    // Se corta solo si es el MISMO elemento: varias filas comparten data-seg (las fuentes que en la
    // dona van dentro de «Otros») y cada una tiene que poner su número en el centro.
    if (!el || (c.classList.contains('hov') && c._hlEl === el)) return;
    const k = el.dataset.seg;
    hlActivo = c; c._hlEl = el;
    c.classList.add('hov'); c.dataset.k = k;
    c.querySelectorAll('[data-seg]').forEach(x => x.classList.toggle('on', x.dataset.seg === k));
    const ctr = c.querySelector('.ag-dona-c');
    if (ctr && el.dataset.cv != null) {
      if (ctr.dataset.orig == null) ctr.dataset.orig = ctr.innerHTML;
      ctr.innerHTML = `<b>${uiEsc(el.dataset.cv)}</b><span>${uiEsc(el.dataset.cl || '')}</span>`;
    }
  });
  // los desplegables de Filtros y Closer se cierran tocando afuera
  document.addEventListener('click', (e) => {
    if (!AGC.pop || (e.target.closest && e.target.closest('.ag-popw'))) return;
    AGC.pop = '';
    if (vistaOn('central')) cenPintar();
  });
})();
