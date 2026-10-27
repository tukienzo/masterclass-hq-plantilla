/* Piezas del sistema de diseño de la app — calcadas de un panel de referencia.
 *
 * Todas son funciones puras que devuelven HTML. Ninguna toca el DOM ni pide datos: se las llama
 * desde el render de cada pantalla y se pega el resultado con innerHTML, que es como ya trabaja
 * todo el hub. Por eso también son globales y no módulos ES: el markup tiene 110 onclick inline
 * que llaman funciones por nombre, y un módulo las encerraría en su propio ámbito.
 *
 * La regla: ninguna pantalla vuelve a escribir un <div style="..."> a mano. Si falta una forma de
 * mostrar algo, se agrega acá y la usan todas.
 */

/* ── helpers ── */
const uiEsc = (t) => String(t == null ? '' : t)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Los números siempre con separador de miles argentino. Un KPI con "255179" no se lee.
const uiNum = (n, dec = 0) => {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const uiPct = (n, dec = 1) => (isFinite(Number(n)) ? `${Number(n).toFixed(dec)}%` : '—');

// Color por significado, no por gusto. Es la misma tabla en las 25 pantallas.
const UI_COLOR = {
  cerrada: 'verde', ganada: 'verde', cobrado: 'verde', completo: 'verde',
  perdida: 'rojo', devuelto: 'rojo', error: 'rojo',
  cancelada: 'ambar', seguimiento: 'ambar', 'en seguimiento': 'ambar', cuotas: 'ambar',
  'no-show': 'violeta', noshow: 'violeta', seña: 'violeta',
  pendiente: 'gris', 'sin dato': 'gris',
  agendada: 'azul', asistencia: 'azul', impresiones: 'azul', credito: 'rosa', 'crédito': 'rosa',
};
const uiColorDe = (etiqueta) => UI_COLOR[String(etiqueta || '').toLowerCase().trim()] || 'gris';

// Color estable a partir de un nombre: la misma persona siempre con el mismo color.
const UI_PALETA = ['rojo', 'verde', 'azul', 'ambar', 'violeta', 'rosa', 'cian', 'naranja', 'lima', 'azulino'];
function uiColorNombre(nombre) {
  let h = 0;
  for (const c of String(nombre || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return UI_PALETA[h % UI_PALETA.length];
}

/* ── micro-etiqueta ──
   La firma visual del sistema de diseño: mayúsculas chiquitas y espaciadas ARRIBA de cada número. */
function uiMicro(texto, color) {
  return `<span class="ui-micro">${color ? `<i class="ui-punto c-${uiEsc(color)}"></i>` : ''}${uiEsc(texto)}</span>`;
}

/* ── chip de variación ── */
function uiDelta(pct) {
  const v = Number(pct);
  if (!isFinite(v) || v === 0) return '';
  const sube = v > 0;
  return `<span class="ui-delta ${sube ? 'up' : 'down'}">${sube ? '▲' : '▼'} ${sube ? '+' : ''}${v.toFixed(1)}%</span>`;
}

/* ── sparkline ──
   Línea + área con degradado, del color de la tarjeta. Sin ejes ni grilla: adentro de un KPI
   lo único que importa es la forma. */
function uiSpark(valores, color = 'verde', alto = 44, opts) {
  if (typeof uiSparkArea === 'function') {
    const html = uiSparkArea(valores, color, opts || {});
    return html ? `<div class="ui-spark-w" style="height:${alto}px">${html}</div>` : '';
  }
  const v = (valores || []).map(Number).filter(isFinite);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), rango = (max - min) || 1;
  const ancho = 100, id = 'sp' + Math.random().toString(36).slice(2, 9);
  const px = (i) => (i / (v.length - 1)) * ancho;
  const py = (n) => alto - 4 - ((n - min) / rango) * (alto - 10);
  const linea = v.map((n, i) => `${px(i).toFixed(2)},${py(n).toFixed(2)}`).join(' ');
  return `<svg class="ui-spark c-${uiEsc(color)}" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--c)" stop-opacity=".28"/>
      <stop offset="100%" stop-color="var(--c)" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,${alto} ${linea} ${ancho},${alto}" fill="url(#${id})"/>
    <polyline points="${linea}" fill="none" stroke="var(--c)" stroke-width="1.6"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* ── tarjeta de KPI ──
   {etiqueta, valor, prefijo, color, delta, spark, barra, sub, icono}
   `barra` es {pct, texto} para los KPI que muestran avance en vez de evolución.
   `icono` es un <svg> (string) que va en un cuadradito tintado arriba, como la referencia. */
function uiTile(o) {
  const c = o.color || 'verde';
  return `<div class="ui-tile c-${uiEsc(c)}">
    <div class="ui-tile-h">
      <div class="ui-tile-hl">${o.icono ? `<span class="ui-tile-ico">${o.icono}</span>` : ''}${uiMicro(o.etiqueta, c)}</div>
      ${uiDelta(o.delta)}
    </div>
    <div class="ui-tile-v">${o.prefijo ? `<small>${uiEsc(o.prefijo)}</small>` : ''}<b>${uiEsc(o.valor)}</b></div>
    ${o.sub ? `<div class="ui-tile-sub">${uiEsc(o.sub)}</div>` : ''}
    ${o.barra ? uiBarra(o.barra.pct, c, o.barra.texto) : ''}
    ${o.spark ? uiSpark(o.spark, c, 44, { etiquetas: o.sparkEtiquetas, fmt: o.sparkFmt, nombre: o.etiqueta }) : ''}
  </div>`;
}

/* ── barra de progreso simple ── */
function uiBarra(pct, color = 'gold', texto) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="ui-barra c-${uiEsc(color)}"${texto ? ` data-tip="${uiEsc(texto)}"` : ''}>
    <div class="ui-barra-riel"><i style="width:${p.toFixed(1)}%"></i></div>
    ${texto ? `<span>${uiEsc(texto)}</span>` : ''}
  </div>`;
}

/* ── barra apilada + leyenda ──
   El patrón con el que la referencia muestra TODO desglose: una barra de un renglón y abajo
   "● etiqueta  N  %". segmentos = [{etiqueta, valor, color?}] */
function uiBarraApilada(segmentos, opciones = {}) {
  const segs = (segmentos || []).filter(s => Number(s.valor) > 0);
  const total = opciones.total != null ? Number(opciones.total) : segs.reduce((a, s) => a + Number(s.valor), 0);
  if (!total) return `<div class="ui-vacio">Sin datos todavía</div>`;
  const tramos = segs.map(s => {
    const c = s.color || uiColorDe(s.etiqueta);
    const p = (Number(s.valor) / total) * 100;
    return { ...s, color: c, pct: p };
  });
  return `<div class="ui-apilada">
    <div class="ui-apilada-barra">
      ${tramos.map(t => `<i class="c-${uiEsc(t.color)}" style="width:${t.pct.toFixed(2)}%" data-tip="${uiEsc(t.etiqueta + '\n' + uiNum(t.valor) + ' · ' + t.pct.toFixed(0) + '%')}"></i>`).join('')}
    </div>
    <div class="ui-apilada-leyenda">
      ${tramos.map(t => `<span><i class="ui-punto c-${uiEsc(t.color)}"></i>${uiEsc(t.etiqueta)}<b>${uiNum(t.valor)}</b><em>${t.pct.toFixed(0)}%</em></span>`).join('')}
    </div>
  </div>`;
}

/* ── dona con el número grande al centro ──
   segmentos = [{etiqueta, valor, color?, nota?}] */
function uiDona(segmentos, opciones = {}) {
  const segs = (segmentos || []).filter(s => Number(s.valor) > 0);
  const total = segs.reduce((a, s) => a + Number(s.valor), 0);
  if (!total) return `<div class="ui-vacio">Sin datos todavía</div>`;
  const R = 54, C = 2 * Math.PI * R;
  const fmtV = opciones.fmt || uiNum;
  let acum = 0;
  const pctDe = (s) => (Number(s.valor) / total) * 100;
  const arcos = segs.map((s, k) => {
    const c = s.color || uiColorDe(s.etiqueta);
    const largo = (Number(s.valor) / total) * C;
    const pc = pctDe(s);
    const arco = `<circle class="c-${uiEsc(c)}" data-seg="${k}" data-cv="${uiEsc(fmtV(s.valor))}" data-cl="${uiEsc(s.etiqueta + ' · ' + pc.toFixed(0) + '%')}"
      data-tip="${uiEsc(s.etiqueta + '\n' + fmtV(s.valor) + ' · ' + pc.toFixed(1).replace('.', ',') + '%' + (s.nota ? '\n' + s.nota : ''))}"
      ${opciones.onclick ? `onclick="${uiEsc(opciones.onclick)}('${uiEsc(String(s.etiqueta).replace(/'/g, ''))}')"` : ''}
      cx="70" cy="70" r="${R}" fill="none" stroke="var(--c)"
      stroke-width="15" stroke-dasharray="${largo.toFixed(2)} ${(C - largo).toFixed(2)}"
      stroke-dashoffset="${(-acum).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
    acum += largo;
    return arco;
  }).join('');
  return `<div class="ui-dona">
    <div class="ui-dona-aro">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--line)" stroke-width="15"/>
        ${arcos}
      </svg>
      <div class="ui-dona-centro">
        <b>${uiEsc(opciones.centro != null ? opciones.centro : uiNum(total))}</b>
        ${opciones.etiqueta ? `<span>${uiEsc(opciones.etiqueta)}</span>` : ''}
      </div>
    </div>
    <div class="ui-dona-leyenda">
      ${segs.map((s, k) => `<span data-seg="${k}" data-cv="${uiEsc(fmtV(s.valor))}" data-cl="${uiEsc(s.etiqueta + ' · ' + pctDe(s).toFixed(0) + '%')}"${opciones.onclick ? ` class="clic" onclick="${uiEsc(opciones.onclick)}('${uiEsc(String(s.etiqueta).replace(/'/g, ''))}')"` : ''}><i class="ui-punto c-${uiEsc(s.color || uiColorDe(s.etiqueta))}"></i>
        <em>${uiEsc(s.etiqueta)}</em><b>${uiEsc(fmtV(s.valor))}</b>${s.nota ? `<small>${uiEsc(s.nota)}</small>` : ''}</span>`).join('')}
    </div>
  </div>`;
}

/* ── embudo ──
   Trapecio de verdad, no barras apiladas: cada escalón va del ancho de su etapa al de la
   siguiente, así se ve el angostamiento. etapas = [{nombre, valor, color?}] */
function uiEmbudo(etapas) {
  const e = (etapas || []).filter(x => Number(x.valor) >= 0);
  if (e.length < 2) return `<div class="ui-vacio">Hacen falta al menos dos etapas</div>`;
  const tope = Number(e[0].valor) || 1;
  const W = 300, ALTO = 64;
  const ancho = (v) => Math.max(8, (Number(v) / tope) * W);
  const filas = e.slice(0, -1).map((et, i) => {
    const sig = e[i + 1];
    const a = ancho(et.valor), b = ancho(sig.valor);
    const c = et.color || ['azul', 'cian', 'gold', 'verde'][i % 4];
    // El porcentaje es el de ESTA etapa sobre la primera, no el de la siguiente. Puesto al revés
    // el embudo dice que "Agendadas" es el 19%, cuando el 19% son las Asistencias.
    const pct = tope ? (Number(et.valor) / tope) * 100 : 0;
    const conv = i > 0 && Number(e[i - 1].valor) ? (Number(et.valor) / Number(e[i - 1].valor)) * 100 : null;
    const tip = `${et.nombre}\n${uiNum(et.valor)} · ${pct.toFixed(0)}% del total${conv != null ? '\n' + conv.toFixed(0) + '% desde ' + e[i - 1].nombre : ''}`;
    return `<div class="ui-emb-paso" data-tip="${uiEsc(tip)}">
      <span class="ui-emb-n">${uiNum(et.valor)}</span>
      <svg class="c-${uiEsc(c)}" viewBox="0 0 ${W} ${ALTO}" preserveAspectRatio="none">
        <polygon points="${(W - a) / 2},0 ${(W + a) / 2},0 ${(W + b) / 2},${ALTO} ${(W - b) / 2},${ALTO}"
          fill="var(--c)" fill-opacity=".30" stroke="var(--c)" stroke-opacity=".55" stroke-width="1"/>
      </svg>
      <span class="ui-emb-pct">${pct.toFixed(0)}%</span>
      <span class="ui-emb-nombre">${uiEsc(et.nombre)}</span>
    </div>`;
  }).join('');
  const ult = e[e.length - 1];
  const pctUlt = tope ? (Number(ult.valor) / tope) * 100 : 0;
  return `<div class="ui-embudo">${filas}
    <div class="ui-emb-pie" data-tip="${uiEsc(ult.nombre + '\n' + uiNum(ult.valor) + ' · ' + pctUlt.toFixed(0) + '% del total' + (e.length > 1 && Number(e[e.length - 2].valor) ? '\n' + (Number(ult.valor) / Number(e[e.length - 2].valor) * 100).toFixed(0) + '% desde ' + e[e.length - 2].nombre : ''))}">
      <span class="ui-emb-n">${uiNum(ult.valor)}</span>
      <span class="ui-emb-ult"><b>${pctUlt.toFixed(0)}%</b>${uiEsc(ult.nombre)}</span>
    </div>
  </div>`;
}

/* ── píldoras ──
   opciones = [{id, texto, color?, badge?}]. `onclick` es el NOMBRE de una función global que
   recibe el id, porque así es como el resto del hub engancha sus eventos. */
function uiChips(opciones, activa, onclick, clase = '') {
  return `<div class="ui-chips ${uiEsc(clase)}">
    ${(opciones || []).map(o => `<button type="button" class="ui-chip${o.id === activa ? ' on' : ''}"
      onclick="${uiEsc(onclick)}('${uiEsc(o.id)}')">
      ${o.color ? `<i class="ui-punto c-${uiEsc(o.color)}"></i>` : ''}${uiEsc(o.texto)}
      ${o.badge != null ? `<em class="ui-chip-badge">${uiEsc(o.badge)}</em>` : ''}
    </button>`).join('')}
  </div>`;
}

/* ── pestañas numeradas ──
   "01 Agendas · 02 Pre-Call 12 · 03 Post-Call 5 …" — para procesos con orden. */
function uiPasos(pasos, activo, onclick) {
  return `<div class="ui-pasos">
    ${(pasos || []).map((p, i) => `<button type="button" class="ui-paso${p.id === activo ? ' on' : ''}"
      onclick="${uiEsc(onclick)}('${uiEsc(p.id)}')">
      <em>${String(i + 1).padStart(2, '0')}</em>${uiEsc(p.texto)}
      ${p.badge != null ? `<b class="c-${uiEsc(p.colorBadge || 'ambar')}">${uiEsc(p.badge)}</b>` : ''}
    </button>`).join('')}
  </div>`;
}

/* ── aviso ──
   La mejor idea de la referencia: cuando el dato está truncado, filtrado o incompleto, LO DICE.
   tipo: 'ambar' (dato parcial) · 'rojo' (algo falla) · 'azul' (contexto) */
function uiAviso(o) {
  const t = o.tipo || 'ambar';
  return `<div class="ui-aviso c-${uiEsc(t)}">
    <span>${uiEsc(o.texto)}</span>
    ${o.accion ? `<button type="button" onclick="${uiEsc(o.accion.onclick)}">${uiEsc(o.accion.texto)} →</button>` : ''}
  </div>`;
}

/* ── firma de la IA ──
   Todo número que salga de un modelo lleva esto. Si no lleva, el equipo no puede saber si lo
   escribió una persona o lo inventó Claude. */
function uiFirmaIA(o = {}) {
  return `<div class="ui-firma">
    <span class="ui-firma-ia">✦ ${uiEsc(o.texto || 'Generado con IA')}</span>
    ${o.cuando ? `<span class="ui-firma-cuando">Última actualización: ${uiEsc(o.cuando)}</span>` : ''}
    ${o.onRecalcular ? `<button type="button" class="ui-btn pri chico" onclick="${uiEsc(o.onRecalcular)}">↻ Recalcular</button>` : ''}
  </div>`;
}

/* ── aviso de que la IA no está segura ──
   El patrón de "La IA no está segura del tipo de esta secuencia. Confirmá manualmente." */
function uiDudaIA(texto) {
  return uiAviso({ tipo: 'ambar', texto: texto || 'La IA no está segura de esto. Confirmalo a mano.' });
}

/* ── avatar con iniciales ── */
function uiAvatar(nombre, tam = 30) {
  const ini = String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
  return `<span class="ui-avatar c-${uiColorNombre(nombre)}" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * .38)}px"
    title="${uiEsc(nombre)}">${uiEsc(ini)}</span>`;
}

/* ── podio del leaderboard ──
   top = [{nombre, valor, nota?}] ordenado de mayor a menor. El 1º va al medio y elevado. */
function uiPodio(top) {
  const t = (top || []).slice(0, 3);
  if (!t.length) return `<div class="ui-vacio">Todavía no hay a quién premiar</div>`;
  const orden = [t[1], t[0], t[2]].map((p, i) => ({ p, puesto: [2, 1, 3][i] })).filter(x => x.p);
  return `<div class="ui-podio">
    ${orden.map(({ p, puesto }) => `<div class="ui-podio-p p${puesto}">
      <span class="ui-podio-n">${puesto}</span>
      ${uiAvatar(p.nombre, 34)}
      <b>${uiEsc(p.nombre)}</b>
      <strong>${uiEsc(p.valor)}</strong>
      ${p.nota ? `<small>${uiEsc(p.nota)}</small>` : ''}
    </div>`).join('')}
  </div>`;
}

/* ── tarjeta de integración ──
   estado: 'ok' | 'mal' | 'off'. El punto de color es lo primero que se mira. */
function uiIntegracion(o) {
  const col = { ok: 'verde', mal: 'rojo', off: 'gris' }[o.estado] || 'gris';
  return `<button type="button" class="ui-integra" ${o.onclick ? `onclick="${uiEsc(o.onclick)}"` : ''}>
    <span class="ui-integra-logo">${o.logo || uiEsc((o.nombre || '?')[0])}</span>
    <span class="ui-integra-txt">
      <b>${uiEsc(o.nombre)}</b>
      <small><i class="ui-punto c-${col}"></i>${uiEsc(o.detalle || '')}</small>
    </span>
    <span class="ui-integra-chev">›</span>
  </button>`;
}

/* ── encabezado de pantalla ──
   Título grande + acciones a la derecha, como en la referencia. acciones = [{texto, onclick, pri?, icono?}] */
function uiTitulo(titulo, acciones, sub) {
  return `<div class="ui-titulo">
    <div><h1>${uiEsc(titulo)}</h1>${sub ? `<p>${uiEsc(sub)}</p>` : ''}</div>
    <div class="ui-titulo-acc">
      ${(acciones || []).map(a => `<button type="button" class="ui-btn${a.pri ? ' pri' : ''}" onclick="${uiEsc(a.onclick)}">
        ${a.icono ? uiEsc(a.icono) + ' ' : ''}${uiEsc(a.texto)}${a.badge != null ? `<em class="ui-chip-badge">${uiEsc(a.badge)}</em>` : ''}
      </button>`).join('')}
    </div>
  </div>`;
}

/* ── lista-ranking ──
   El patrón de la referencia para "Top contenidos": tag + título + barra proporcional + valor + chevron.
   filas = [{tag?, tagColor?, titulo, valor, color?, onclick?}] ; opciones = {max?} */
function uiRanking(filas, opciones = {}) {
  const f = (filas || []);
  if (!f.length) return `<div class="ui-vacio">Sin datos todavía</div>`;
  const max = opciones.max != null ? Number(opciones.max) : Math.max(...f.map(x => Number(x.valor) || 0), 1);
  return `<div class="ui-ranking">
    ${f.map(x => {
      const c = x.color || 'rosa';
      const p = max ? Math.max(3, (Number(x.valor) / max) * 100) : 0;
      const inner =
        `${x.tag ? `<span class="ui-rank-tag c-${uiEsc(x.tagColor || c)}">${uiEsc(x.tag)}</span>` : ''}` +
        `<span class="ui-rank-tit">${uiEsc(x.titulo)}</span>` +
        `<span class="ui-rank-barra c-${uiEsc(c)}"><i style="width:${p.toFixed(1)}%"></i></span>` +
        `<b class="ui-rank-val">${typeof x.valor === 'number' ? uiNum(x.valor) : uiEsc(x.valor)}</b>` +
        `${x.onclick ? `<span class="ui-rank-chev">›</span>` : ''}`;
      return x.onclick
        ? `<button type="button" class="ui-rank clic" onclick="${uiEsc(x.onclick)}">${inner}</button>`
        : `<div class="ui-rank">${inner}</div>`;
    }).join('')}
  </div>`;
}

/* ── encabezado de tarjeta ──
   Ícono en cuadradito + título + acción opcional, como "Miniaturas … Recalcular" de la referencia.
   o = {icono?, titulo, sub?, color?, accion?:{texto,onclick}} */
function uiCardHead(o) {
  const c = o.color || 'gold';
  return `<div class="ui-cardhead">
    ${o.icono ? `<span class="ui-cardhead-ico c-${uiEsc(c)}">${o.icono}</span>` : ''}
    <div class="ui-cardhead-t"><b>${uiEsc(o.titulo)}</b>${o.sub ? `<span>${uiEsc(o.sub)}</span>` : ''}</div>
    ${o.accion ? `<button type="button" class="ui-cardhead-acc" onclick="${uiEsc(o.accion.onclick)}">${uiEsc(o.accion.texto)}</button>` : ''}
  </div>`;
}
