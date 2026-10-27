/* Segunda tanda del sistema de diseño de la app — piezas calcadas de la referencia (14-oct-2026).
 *
 * Mismas reglas que ui.js: funciones globales que devuelven HTML (nada de módulos, porque el hub
 * engancha eventos con onclick="nombre()"). Lo que necesita interacción —tooltips de gráficos,
 * arrastrar tarjetas, mover el período— se resuelve con UN manejador delegado por tipo de evento,
 * instalado una sola vez al final del archivo. Así una pantalla que se repinta con innerHTML no
 * pierde los eventos ni los duplica.
 *
 * Índice: íconos · barra de período · segmentado · pestañas · tarjeta · tile grande · franja ·
 * lista con barras · gráfico de líneas/áreas · barras verticales · mapa de calor · radar ·
 * dispersión · tabla · estado vacío · switch · kanban · calendario · modal · cajón · aviso flotante.
 */

/* ════════ íconos (trazos al estilo lucide, los mismos que usa la referencia) ════════ */
const UI_ICOS = {
  usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  usuario: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  globo: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sube: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  baja: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  plata: '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  billetera: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  barras: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  linea: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  torta: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  objetivo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  fuego: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  destellos: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>',
  engranaje: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  buscar: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  filtro: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  mas: '<path d="M5 12h14M12 5v14"/>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  izq: '<path d="m15 18-6-6 6-6"/>', der: '<path d="m9 18 6-6-6-6"/>', abajo: '<path d="m6 9 6 6 6-6"/>', arriba: '<path d="m18 15-6-6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  lapiz: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  tacho: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  externo: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  telefono: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mensaje: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  ojo: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  corazon: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  guardado: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  carpeta: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  archivo: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
  video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.94a.5.5 0 0 0-.78-.42L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  pantalla: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m10 7 4 3-4 3z"/>',
  rayo: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  caja: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  capas: '<path d="m12.83 2.18 8.6 3.91a1 1 0 0 1 0 1.83l-8.58 3.9a2 2 0 0 1-1.66 0l-8.58-3.9a1 1 0 0 1 0-1.83l8.58-3.9a2 2 0 0 1 1.66-.01Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  grilla: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  refrescar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  estrella: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  flecha: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  puntos: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  libro: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  corona: '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.29L21.18 5.5a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.66a1 1 0 0 0 1.52-.29z"/><path d="M5 21h14"/>',
  edificio: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  pelicula: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  megafono: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  etiqueta: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  maletin: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  organigrama: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  tilde: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>',
  portapapeles: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  medidor: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  robot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
  copiar: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  microfono: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  medalla: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
  celular: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  calculadora: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M16 14v4M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  embudo: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  radar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
  bandeja: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  candado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  punto: '<circle cx="12" cy="12" r="3"/>',
};
function uiIco(nombre, tam = 16, clase = '') {
  const p = UI_ICOS[nombre] || UI_ICOS.punto;
  return `<svg class="ui-ico ${clase}" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/* ════════ formatos ════════ */
const UI_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const UI_MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const uiCap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
// "USD 12.500" · "$ 1.000" — el prefijo de moneda va aparte para poder achicarlo como la referencia.
function uiMonto(n, moneda = 'USD', dec = 0) {
  if (n == null || !isFinite(Number(n))) return '—';
  return `${moneda} ${uiNum(n, dec)}`;
}
// 1.2M · 345K · 12.300 — para ejes y tiles con poco lugar
function uiCorto(n) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
  if (a >= 1e4) return Math.round(v / 1e3) + 'k';
  return uiNum(v);
}

/* ════════ fechas en hora argentina (todo el hub piensa en AR) ════════ */
// masterclass: el día de hoy en la zona del CLIENTE (en el hub original estaba fijo en Argentina)
function uiHoyAR() { return new Date().toLocaleDateString('en-CA', { timeZone: (window.MHQ && MHQ.cliente && MHQ.cliente.zona) || 'America/Argentina/Buenos_Aires' }); }
function uiF(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function uiS(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function uiSumarDias(s, n) { const d = uiF(s); d.setDate(d.getDate() + n); return uiS(d); }
function uiFechaCorta(s) { const d = uiF(s); return `${d.getDate()} ${UI_MESES_C[d.getMonth()]}`; }

/* ════════ barra de período ════════
   La pieza que más se repite en la referencia: Día · Semana · Mes · Año · Personalizado + "‹ Este mes ›".
   Cada pantalla usa su propia clave (así Finanzas y Ads pueden mirar meses distintos) y pasa el
   NOMBRE de la función que repinta; esa función recibe el rango {desde, hasta, modo, etiqueta,
   previo:{desde,hasta}}. El estado se guarda en la sesión: volver a la pantalla no lo pierde. */
const UI_PER_MODOS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['custom', 'Personalizado']];
const UI_PER = {};
function uiPerEstado(clave, porDefecto) {
  if (UI_PER[clave]) return UI_PER[clave];
  let st = null;
  try { st = JSON.parse(sessionStorage.getItem('mhqper:' + clave) || 'null'); } catch (e) { }
  UI_PER[clave] = st || { modo: porDefecto || 'mes', ancla: uiHoyAR(), desde: null, hasta: null };
  return UI_PER[clave];
}
function uiPerGuardar(clave) { try { sessionStorage.setItem('mhqper:' + clave, JSON.stringify({ ...UI_PER[clave], cb: undefined })); } catch (e) { } }
function uiPerRango(clave) {
  const st = uiPerEstado(clave);
  const hoy = uiHoyAR();
  const a = uiF(st.ancla || hoy);
  let desde, hasta, etiqueta, esActual;
  if (st.modo === 'dia') {
    desde = hasta = uiS(a);
    esActual = desde === hoy;
    etiqueta = esActual ? 'Hoy' : (desde === uiSumarDias(hoy, -1) ? 'Ayer' : uiFechaCorta(desde));
  } else if (st.modo === 'semana') {
    const dow = (a.getDay() + 6) % 7;                    // lunes = 0
    const lun = new Date(a); lun.setDate(a.getDate() - dow);
    desde = uiS(lun); hasta = uiSumarDias(desde, 6);
    esActual = hoy >= desde && hoy <= hasta;
    etiqueta = esActual ? 'Esta semana' : `${uiFechaCorta(desde)} – ${uiFechaCorta(hasta)}`;
  } else if (st.modo === 'anio') {
    desde = `${a.getFullYear()}-01-01`; hasta = `${a.getFullYear()}-12-31`;
    esActual = hoy.slice(0, 4) === desde.slice(0, 4);
    etiqueta = esActual ? 'Este año' : String(a.getFullYear());
  } else if (st.modo === 'custom') {
    desde = st.desde || hoy.slice(0, 8) + '01'; hasta = st.hasta || hoy;
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    esActual = hasta >= hoy;
    etiqueta = `${uiFechaCorta(desde)} – ${uiFechaCorta(hasta)}`;
  } else {
    desde = uiS(new Date(a.getFullYear(), a.getMonth(), 1));
    hasta = uiS(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    esActual = hoy.slice(0, 7) === desde.slice(0, 7);
    etiqueta = esActual ? 'Este mes' : `${uiCap(UI_MESES[a.getMonth()])} ${a.getFullYear()}`;
  }
  // el período anterior equivalente, para los "▲ +12% vs mes ant."
  const dias = Math.round((uiF(hasta) - uiF(desde)) / 864e5) + 1;
  let previo;
  if (st.modo === 'mes') {
    const p = new Date(uiF(desde).getFullYear(), uiF(desde).getMonth() - 1, 1);
    previo = { desde: uiS(p), hasta: uiS(new Date(p.getFullYear(), p.getMonth() + 1, 0)) };
  } else if (st.modo === 'anio') {
    const y = Number(desde.slice(0, 4)) - 1; previo = { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  } else previo = { desde: uiSumarDias(desde, -dias), hasta: uiSumarDias(desde, -1) };
  // Período en curso: se compara contra el MISMO TRAMO del anterior (1 al 14 de septiembre si hoy
  // es 14 de octubre), no contra el período entero, que daría caídas falsas a mitad de mes.
  let tramo = false;
  if (esActual && st.modo !== 'dia' && st.modo !== 'custom') {
    const transcurridos = Math.round((uiF(hoy) - uiF(desde)) / 864e5);
    const tope = uiSumarDias(previo.desde, transcurridos);
    if (tope < previo.hasta) { previo = { desde: previo.desde, hasta: tope }; tramo = true; }
  }
  const nombreAnt = { dia: 'día ant.', semana: 'semana ant.', mes: 'mes ant.', anio: 'año ant.', custom: 'período ant.' }[st.modo];
  return { clave, modo: st.modo, desde, hasta, dias, etiqueta, esActual, previo, tramo,
    nombreAnt: tramo ? nombreAnt.replace('ant.', 'ant. a igual día') : nombreAnt,
    // hasta hoy: para no comparar un mes en curso contra uno entero
    hastaHoy: hasta > hoy ? hoy : hasta };
}
function uiPeriodo(clave, onCambio, opciones = {}) {
  const st = uiPerEstado(clave, opciones.modo);
  if (onCambio) st.cb = onCambio;
  const r = uiPerRango(clave);
  const modos = opciones.modos ? UI_PER_MODOS.filter(m => opciones.modos.includes(m[0])) : UI_PER_MODOS;
  const seg = `<div class="ui-seg">${modos.map(([m, t]) =>
    `<button type="button" class="ui-seg-b${st.modo === m ? ' on' : ''}" onclick="uiPerModo('${clave}','${m}')">${t}</button>`).join('')}</div>`;
  const nav = st.modo === 'custom'
    ? `<div class="ui-per-custom">
         <label>${uiIco('calendario', 14)}<input type="date" value="${r.desde}" onchange="uiPerCustom('${clave}',this.value,null)"></label>
         <label>${uiIco('calendario', 14)}<input type="date" value="${r.hasta}" onchange="uiPerCustom('${clave}',null,this.value)"></label>
       </div>`
    : `<div class="ui-per-nav">
         <button type="button" onclick="uiPerMover('${clave}',-1)" aria-label="Período anterior">${uiIco('izq', 16)}</button>
         <b>${uiEsc(r.etiqueta)}</b>
         <button type="button" onclick="uiPerMover('${clave}',1)" aria-label="Período siguiente"${r.esActual ? ' disabled' : ''}>${uiIco('der', 16)}</button>
       </div>`;
  return `<div class="ui-periodo" data-per="${uiEsc(clave)}">${seg}${nav}</div>`;
}
function uiPerModo(clave, modo) {
  const st = uiPerEstado(clave);
  st.modo = modo; st.ancla = uiHoyAR();
  if (modo === 'custom' && !st.desde) { const h = uiHoyAR(); st.desde = h.slice(0, 8) + '01'; st.hasta = h; }
  uiPerAvisar(clave);
}
function uiPerMover(clave, paso) {
  const st = uiPerEstado(clave);
  const a = uiF(st.ancla || uiHoyAR());
  if (st.modo === 'dia') a.setDate(a.getDate() + paso);
  else if (st.modo === 'semana') a.setDate(a.getDate() + 7 * paso);
  else if (st.modo === 'anio') a.setFullYear(a.getFullYear() + paso);
  else { a.setDate(1); a.setMonth(a.getMonth() + paso); }
  const s = uiS(a);
  st.ancla = s > uiHoyAR() ? uiHoyAR() : s;
  uiPerAvisar(clave);
}
function uiPerCustom(clave, desde, hasta) {
  const st = uiPerEstado(clave);
  if (desde) st.desde = desde;
  if (hasta) st.hasta = hasta;
  uiPerAvisar(clave);
}
function uiPerAvisar(clave) {
  uiPerGuardar(clave);
  document.querySelectorAll(`.ui-periodo[data-per="${clave}"]`).forEach(el => { el.outerHTML = uiPeriodo(clave); });
  const cb = UI_PER[clave] && UI_PER[clave].cb;
  const r = uiPerRango(clave);
  try {
    if (typeof cb === 'function') cb(r);
    else if (typeof cb === 'string' && typeof window[cb] === 'function') window[cb](r);
  } catch (e) { console.warn('[periodo ' + clave + ']', e); }
}
// ¿la fecha (YYYY-MM-DD o ISO) cae dentro del rango?
function uiEnRango(fecha, r) { const f = String(fecha || '').slice(0, 10); return !!f && f >= r.desde && f <= r.hasta; }
// variación porcentual contra el período anterior, o null si no hay base
function uiVar(actual, anterior) {
  const a = Number(actual), b = Number(anterior);
  if (!isFinite(a) || !isFinite(b) || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

/* ════════ segmentado y pestañas ════════ */
// opciones = [{id, texto, ico?, badge?}] · variante: '' (dorado) | 'azul'
function uiSeg(opciones, activa, onclick, variante = '') {
  return `<div class="ui-seg ${variante ? 'ui-seg-' + uiEsc(variante) : ''}">${(opciones || []).map(o =>
    `<button type="button" class="ui-seg-b${o.id === activa ? ' on' : ''}" onclick="${uiEsc(onclick)}('${uiEsc(o.id)}')">${o.ico ? uiIco(o.ico, 15) : ''}${uiEsc(o.texto)}${o.badge != null ? `<em>${uiEsc(o.badge)}</em>` : ''}</button>`).join('')}</div>`;
}
// pestañas subrayadas DENTRO de una pantalla (las de la familia van en la cabecera)
function uiTabs(opciones, activa, onclick) {
  return `<div class="ui-tabs">${(opciones || []).map(o =>
    `<button type="button" class="ui-tab${o.id === activa ? ' on' : ''}" onclick="${uiEsc(onclick)}('${uiEsc(o.id)}')">${o.ico ? uiIco(o.ico, 15) : ''}${uiEsc(o.texto)}${o.badge != null ? `<em>${uiEsc(o.badge)}</em>` : ''}</button>`).join('')}</div>`;
}

/* ════════ tarjeta ════════
   o = {micro?: 'COBROS POR MÉTODO DE PAGO', ico?, color?, titulo?, sub?, der?: html, cuerpo, pie?, clase?, id?}
   Dos cabeceras posibles, las dos de la referencia: la micro-etiqueta en mayúsculas (tarjetas de datos) o
   el ícono en cuadradito + título + bajada con línea divisoria (tarjetas de sección). */
function uiCard(o) {
  let cab = '';
  if (o.titulo) {
    cab = `<header class="ui-card-h">
      ${o.ico ? `<span class="ui-card-ico c-${uiEsc(o.color || 'gold')}">${uiIco(o.ico, 18)}</span>` : ''}
      <div class="ui-card-t"><b>${uiEsc(o.titulo)}</b>${o.sub ? `<span>${uiEsc(o.sub)}</span>` : ''}</div>
      ${o.der ? `<div class="ui-card-der">${o.der}</div>` : ''}
    </header>`;
  } else if (o.micro) {
    cab = `<header class="ui-card-m">
      <span class="ui-card-micro">${o.ico ? uiIco(o.ico, 14) : ''}${uiEsc(o.micro)}</span>
      ${o.der ? `<div class="ui-card-der">${o.der}</div>` : ''}
    </header>`;
  }
  return `<section class="ui-card ${o.titulo ? 'con-h' : ''} ${uiEsc(o.clase || '')}"${o.id ? ` id="${uiEsc(o.id)}"` : ''}>
    ${cab}<div class="ui-card-b">${o.cuerpo || ''}</div>${o.pie ? `<footer class="ui-card-f">${o.pie}</footer>` : ''}
  </section>`;
}

/* ════════ tile grande (Finanzas) ════════
   o = {etiqueta, color, delta?, nombreAnt?, prefijo?, valor, lineas?:[{prefijo,valor}], area?:[n], barra?:{pct,texto}, sub?, onclick?}
   El de "USD 12.500" con el área degradada abajo. `lineas` es para los multi-moneda apilados
   (ARS 1.000.000 / USD 1.000 / MXN 18.000). */
function uiTileG(o) {
  const c = o.color || 'verde';
  const cuerpo = o.lineas && o.lineas.length > 1
    ? `<div class="ui-tg-lineas">${o.lineas.map(l => `<div><small>${uiEsc(l.prefijo || '')}</small><b>${uiEsc(l.valor)}</b></div>`).join('')}</div>`
    : `<div class="ui-tg-v">${o.prefijo ? `<small>${uiEsc(o.prefijo)}</small>` : ''}<b>${uiEsc(o.valor)}</b></div>`;
  return `<div class="ui-tg c-${uiEsc(c)}${o.onclick ? ' clic' : ''}"${o.onclick ? ` onclick="${uiEsc(o.onclick)}"` : ''}>
    <div class="ui-tg-h"><span class="ui-tg-l"><i class="ui-punto c-${uiEsc(c)}"></i>${uiEsc(o.etiqueta)}</span>${o.delta != null ? uiDeltaB(o.delta) : ''}</div>
    ${cuerpo}
    ${o.sub ? `<div class="ui-tg-sub">${o.sub}</div>` : ''}
    ${o.area && o.area.length > 1 ? `<div class="ui-tg-area">${uiSparkArea(o.area, c, { etiquetas: o.areaEtiquetas, fmt: o.areaFmt, nombre: o.areaNombre || o.etiqueta })}</div>` : ''}
    ${o.barra ? `<div class="ui-tg-barra" data-tip="${uiEsc(o.barra.tip || ((o.etiqueta || '') + '\n' + (o.barra.texto || Math.round(o.barra.pct || 0) + '%')))}"><div class="ui-tg-riel"><i style="width:${Math.max(0, Math.min(100, o.barra.pct || 0)).toFixed(1)}%"></i></div><span>${uiEsc(o.barra.texto || Math.round(o.barra.pct || 0) + '%')}</span></div>` : ''}
  </div>`;
}
// la pastilla de variación de la referencia: "▲ +285.7%" verde / "▼ -56.7%" roja
function uiDeltaB(pct, sufijo = '') {
  const v = Number(pct);
  if (pct == null || !isFinite(v)) return '';
  const sube = v >= 0;
  return `<span class="ui-dlt ${sube ? 'up' : 'down'}">${sube ? '▲' : '▼'} ${sube ? '+' : ''}${v.toFixed(1)}%${sufijo ? ' ' + uiEsc(sufijo) : ''}</span>`;
}
// área de tile, interactiva: al pasar el mouse marca el punto y muestra la fecha y el valor.
// opts = {etiquetas?:[...], fmt?:(n)=>texto, nombre?}. Sin etiquetas muestra el número de punto.
function uiSparkArea(valores, color = 'verde', opts = {}) {
  const v = (valores || []).map(Number).map(n => (isFinite(n) ? n : 0));
  if (v.length < 2) return '';
  const W = 200, H = 60, max = Math.max(...v, 1), min = Math.min(0, ...v);
  const ys = v.map(n => H - 4 - ((n - min) / ((max - min) || 1)) * (H - 10));
  const d = uiCurva(v.map((n, i) => [i / (v.length - 1) * W, ys[i]]));
  const id = 'ga' + Math.random().toString(36).slice(2, 9);
  const et = (opts.etiquetas && opts.etiquetas.length === v.length) ? opts.etiquetas : v.map((_, i) => '#' + (i + 1));
  UI_GRAF[id] = { tipo: 'spark', etiquetas: et, fmt: opts.fmt || uiNum, flotante: true,
    series: [{ nombre: opts.nombre || '', color, valores: v, yPct: ys.map(y => y / H * 100) }] };
  return `<div class="ui-graf ui-spk" data-g="${id}"><div class="ui-g-plot">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="c-${uiEsc(color)}" aria-hidden="true">
      <defs><linearGradient class="c-${uiEsc(color)}" id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c)" stop-opacity=".42"/><stop offset="1" stop-color="var(--c)" stop-opacity="0"/></linearGradient></defs>
      <path class="ui-g-areaf" d="${d} L${W},${H} L0,${H} Z" fill="url(#${id}d)"/>
      <path class="ui-g-linea" pathLength="1" d="${d}" fill="none" stroke="var(--c)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="ui-g-hover"><i class="ui-g-vl"></i></div>
  </div></div>`;
}
// curva suave (Catmull-Rom → Bézier) que no se pasa del alto: la referencia dibuja todo con curvas
function uiCurva(pts) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const ymin = Math.min(...pts.map(p => p[1])), ymax = Math.max(...pts.map(p => p[1]));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, Math.min(ymax, Math.max(ymin, p1[1] + (p2[1] - p0[1]) * t))];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, Math.min(ymax, Math.max(ymin, p2[1] - (p3[1] - p1[1]) * t))];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/* ════════ franja de KPIs secundarios ════════
   Una sola tarjeta partida en celdas con separador vertical (EGRESOS | CUENTAS POR COBRAR | …).
   celdas = [{etiqueta, valor, prefijo?, color?, delta?, barra?:pct, sub?}] */
function uiFranja(celdas) {
  return `<div class="ui-franja">${(celdas || []).map(c => `<div class="ui-fr-c">
    <span class="ui-fr-l">${uiEsc(c.etiqueta)}</span>
    <div class="ui-fr-v${c.color ? ' c-' + uiEsc(c.color) : ''}">${c.prefijo ? `<small>${uiEsc(c.prefijo)}</small>` : ''}<b>${uiEsc(c.valor)}</b>${c.delta != null ? uiDeltaB(c.delta) : ''}${c.barra != null ? `<span class="ui-fr-riel" data-tip="${uiEsc((c.etiqueta || '') + '\n' + Math.round(c.barra) + '%')}"><i style="width:${Math.max(0, Math.min(100, c.barra)).toFixed(0)}%"></i></span>` : ''}</div>
    ${c.sub ? `<span class="ui-fr-sub">${uiEsc(c.sub)}</span>` : ''}
  </div>`).join('')}</div>`;
}

/* ════════ lista con barras ════════
   La de "Por país" (bandera · nombre · barrita · "73 · 51%") y la de "Cobros por método de pago"
   (nombre · barra · USD 1.200 · 39%). filas = [{etiqueta, pre?, valor, texto?, pct?, sub?, color?, onclick?}] */
function uiListaB(filas, opciones = {}) {
  const f = filas || [];
  if (!f.length) return uiVacioMini(opciones.vacio || 'Sin datos en este período');
  const max = Math.max(...f.map(x => Number(x.valor) || 0), 1);
  const total = opciones.total != null ? opciones.total : f.reduce((a, x) => a + (Number(x.valor) || 0), 0);
  return `<div class="ui-lb ${opciones.compacta ? 'compacta' : ''}">${f.map(x => {
    const v = Number(x.valor) || 0;
    const pctBar = opciones.barraSobreTotal ? (total ? v / total * 100 : 0) : v / max * 100;
    const pct = x.pct != null ? x.pct : (total ? v / total * 100 : 0);
    const tip = `${x.etiqueta}${x.sub ? ' · ' + x.sub : ''}\n${x.texto != null ? x.texto : uiNum(v)}${opciones.sinPct ? '' : ' · ' + Math.round(pct) + '%'}`;
    const inner = `<span class="ui-lb-e">${x.pre ? `<span class="ui-lb-pre">${x.pre}</span>` : ''}<span class="ui-lb-t">${uiEsc(x.etiqueta)}${x.sub ? `<small>${uiEsc(x.sub)}</small>` : ''}</span></span>
      <span class="ui-lb-riel c-${uiEsc(x.color || opciones.color || 'gold')}"><i style="width:${Math.max(v > 0 ? 2 : 0, pctBar).toFixed(1)}%"></i></span>
      <b class="ui-lb-v">${uiEsc(x.texto != null ? x.texto : uiNum(v))}</b>
      ${opciones.sinPct ? '' : `<span class="ui-lb-p">${Math.round(pct)}%</span>`}`;
    return x.onclick ? `<button type="button" class="ui-lb-f clic" data-tip="${uiEsc(tip)}" onclick="${uiEsc(x.onclick)}">${inner}</button>` : `<div class="ui-lb-f" data-tip="${uiEsc(tip)}">${inner}</div>`;
  }).join('')}</div>`;
}
function uiVacioMini(texto) { return `<div class="ui-vacio-mini">${uiEsc(texto)}</div>`; }

/* ════════ gráfico de líneas / áreas con tooltip ════════
   o = {etiquetas:[...x], series:[{nombre, color, valores:[...], eje?:'der', area?:bool, linea?:bool}],
        alto?:240, fmt?:(n)=>texto, fmtDer?, leyenda?:'abajo'|'arriba', yTicks?:4}
   El SVG se estira a lo ancho; las etiquetas y el tooltip son HTML encima, así el texto no se
   deforma. El tooltip lo maneja el delegado de mousemove (ver abajo). */
const UI_GRAF = {};
function uiLineas(o) {
  const et = o.etiquetas || [];
  const series = (o.series || []).filter(s => (s.valores || []).length);
  if (et.length < 2 || !series.length) return uiVacioMini(o.vacio || 'Todavía no hay datos para graficar');
  const id = 'g' + Math.random().toString(36).slice(2, 9);
  const H = o.alto || 240, W = 1000, padT = 12, padB = 30;
  const izq = series.filter(s => s.eje !== 'der'), der = series.filter(s => s.eje === 'der');
  const maxDe = (ss) => { const m = Math.max(0, ...ss.flatMap(s => s.valores.map(Number).filter(isFinite))); return m > 0 ? uiTecho(m) : 1; };
  const maxI = maxDe(izq), maxD = der.length ? maxDe(der) : 1;
  const x = (i) => (i / (et.length - 1)) * W;
  const y = (v, s) => padT + (H - padT - padB) * (1 - (Number(v) || 0) / (s.eje === 'der' ? maxD : maxI));
  const ticks = o.yTicks || 4;
  const grilla = Array.from({ length: ticks + 1 }, (_, k) => {
    const yy = padT + (H - padT - padB) * (k / ticks);
    return `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" class="ui-g-grid"/>`;
  }).join('');
  const defs = [], trazos = [];
  series.forEach((s, si) => {
    const pts = s.valores.map((v, i) => [x(i), y(v, s)]);
    const d = uiCurva(pts);
    if (s.area) {
      const gid = id + 'a' + si;
      defs.push(`<linearGradient class="c-${uiEsc(s.color)}" id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c)" stop-opacity=".38"/><stop offset="1" stop-color="var(--c)" stop-opacity="0"/></linearGradient>`);
      trazos.push(`<path class="c-${uiEsc(s.color)} ui-g-areaf" data-s="${si}" d="${d} L${W},${H - padB} L0,${H - padB} Z" fill="url(#${gid})"/>`);
    }
    trazos.push(`<path class="c-${uiEsc(s.color)} ui-g-linea" data-s="${si}" pathLength="1" d="${d}" fill="none" stroke="var(--c)" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round"${s.punteada ? ' stroke-dasharray=".012 .01"' : ''}/>`);
  });
  const fmt = o.fmt || uiCorto, fmtD = o.fmtDer || uiCorto;
  const ejeI = Array.from({ length: ticks + 1 }, (_, k) => `<span style="top:${((padT + (H - padT - padB) * (k / ticks)) / H * 100).toFixed(2)}%">${uiEsc(fmt(maxI * (1 - k / ticks)))}</span>`).join('');
  const ejeD = der.length ? Array.from({ length: ticks + 1 }, (_, k) => `<span style="top:${((padT + (H - padT - padB) * (k / ticks)) / H * 100).toFixed(2)}%">${uiEsc(fmtD(maxD * (1 - k / ticks)))}</span>`).join('') : '';
  const cadaX = Math.max(1, Math.ceil(et.length / (o.xMax || 7)));
  const ultimo = et.length - 1;
  const ultimoMultiplo = Math.floor(ultimo / cadaX) * cadaX;
  const pegada = ultimoMultiplo !== ultimo && (ultimo - ultimoMultiplo) < cadaX * 0.6;
  const xs = et.map((t, i) => ((i % cadaX === 0 && !(pegada && i === ultimoMultiplo)) || i === ultimo) ? `<span data-i="${i}" style="left:${(i / ultimo * 100).toFixed(2)}%">${uiEsc(t)}</span>` : '').join('');
  UI_GRAF[id] = { tipo: 'lineas', etiquetas: et, fmt, fmtD, H, padT, padB, maxI, maxD, tituloTip: o.tituloTip,
    series: series.map(s => ({ nombre: s.nombre, color: s.color, valores: s.valores, eje: s.eje, fmt: s.fmt,
      yPct: s.valores.map(v => y(v, s) / H * 100) })) };
  // la leyenda prende y apaga cada serie (con una sola serie no hace falta)
  const ley = `<div class="ui-g-ley">${series.map((s, si) => series.length > 1
    ? `<button type="button" class="ui-g-ley-b" data-s="${si}" onclick="uiGrafSerie('${id}',${si})" title="Mostrar / ocultar"><i class="c-${uiEsc(s.color)}"></i>${uiEsc(s.nombre)}</button>`
    : `<span><i class="c-${uiEsc(s.color)}"></i>${uiEsc(s.nombre)}</span>`).join('')}</div>`;
  return `<div class="ui-graf ${der.length ? 'dos-ejes' : ''}" data-g="${id}" style="--alto:${H}px">
    ${o.leyenda === 'arriba' ? ley : ''}
    <div class="ui-g-cuerpo">
      <div class="ui-g-eje izq">${ejeI}</div>
      <div class="ui-g-plot">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs>${defs.join('')}</defs>${grilla}${trazos.join('')}</svg>
        <div class="ui-g-x">${xs}</div>
        <div class="ui-g-hover"><i class="ui-g-vl"></i><div class="ui-g-tip"></div></div>
      </div>
      ${der.length ? `<div class="ui-g-eje der">${ejeD}</div>` : ''}
    </div>
    ${o.leyenda === 'arriba' ? '' : ley}
  </div>`;
}
// techo "lindo" para el eje: 1.234 → 1.500, 87 → 100
function uiTecho(m) {
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  const paso = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
  return paso * p;
}

/* ════════ barras verticales ════════
   datos = [{etiqueta, valor, color?, texto?}] — "Por edad", "Distribución de scores", gasto por día. */
function uiBarrasV(datos, opciones = {}) {
  const d = datos || [];
  if (!d.length) return uiVacioMini(opciones.vacio || 'Sin datos');
  const max = Math.max(...d.map(x => Number(x.valor) || 0), 1);
  const H = opciones.alto || 160;
  const fmt = opciones.fmt || uiNum;
  return `<div class="ui-bv${opciones.onclick ? ' clic' : ''}" style="--alto:${H}px">${d.map((x, i) => {
    const v = Number(x.valor) || 0;
    const tip = `${x.etiqueta}\n${x.texto != null ? x.texto : fmt(v)}${x.tip ? '\n' + x.tip : ''}`;
    return `<div class="ui-bv-c" data-tip="${uiEsc(tip)}"${opciones.onclick ? ` onclick="${uiEsc(opciones.onclick)}(${i})"` : ''}>
      <span class="ui-bv-n">${uiEsc(x.texto != null ? x.texto : uiCorto(v))}</span>
      <div class="ui-bv-b c-${uiEsc(x.color || opciones.color || 'violeta')}" style="height:${Math.max(v > 0 ? 3 : 0, v / max * 100).toFixed(1)}%"></div>
      <span class="ui-bv-e">${uiEsc(x.etiqueta)}</span>
    </div>`;
  }).join('')}</div>`;
}

/* ════════ mapa de calor ════════
   "Cobros del período": un cuadrado por día, en orden, N por fila. dias = [{fecha, valor, texto?, mixto?}]
   El color crece con el valor; `mixto` lo raya (en la referencia, día con cobros de distinto tipo). */
function uiCalor(dias, opciones = {}) {
  const d = dias || [];
  if (!d.length) return uiVacioMini('Sin días en el período');
  const max = Math.max(...d.map(x => Number(x.valor) || 0), 0);
  const col = opciones.columnas || 10;
  const nivel = (v) => !v || !max ? 0 : v >= max * .66 ? 4 : v >= max * .33 ? 3 : v >= max * .12 ? 2 : 1;
  const total = d.reduce((a, x) => a + (Number(x.valor) || 0), 0);
  const conMov = d.filter(x => Number(x.valor) > 0).length;
  const fmt = opciones.fmt || ((n) => uiNum(n));
  return `<div class="ui-calor c-${uiEsc(opciones.color || 'verde')}">
    <div class="ui-calor-g" style="grid-template-columns:repeat(${col},1fr)">
      ${d.map(x => `<i class="n${nivel(Number(x.valor))}${x.mixto ? ' mixto' : ''}${x.alt ? ' alt' : ''}${opciones.onDia ? ' clic' : ''}" data-tip="${uiEsc(uiFechaCorta(x.fecha) + '\n' + (x.texto != null ? x.texto : fmt(x.valor || 0)) + (x.tip ? '\n' + x.tip : ''))}"${opciones.onDia ? ` onclick="${uiEsc(opciones.onDia)}('${uiEsc(x.fecha)}')"` : ''}></i>`).join('')}
    </div>
    <div class="ui-calor-pie">
      <span class="ui-calor-esc">Menos <i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i> Más</span>
      <span>Total: <b>${uiEsc(fmt(total))}</b></span><span>Con mov.: <b>${conMov}</b></span><span>Prom.: <b>${uiEsc(fmt(conMov ? total / conMov : 0))}</b></span>
    </div>
  </div>`;
}

/* ════════ radar ════════
   ejes = ['L','M','X','J','V','S','D'] · series = [{nombre, color, valores}] — cada serie se
   normaliza contra su propio máximo (como "Visitas · máx 1.200" de la referencia). */
function uiRadar(ejes, series, opciones = {}) {
  const n = (ejes || []).length;
  if (n < 3 || !(series || []).length) return uiVacioMini('Sin datos');
  const R = 100, C = 120;
  const pt = (k, r) => [C + r * Math.sin(2 * Math.PI * k / n), C - r * Math.cos(2 * Math.PI * k / n)];
  const anillos = [0.25, 0.5, 0.75, 1].map(f => `<polygon class="ui-rd-grid" points="${ejes.map((_, k) => pt(k, R * f).map(v => v.toFixed(1)).join(',')).join(' ')}"/>`).join('');
  const rayos = ejes.map((_, k) => { const [x2, y2] = pt(k, R); return `<line class="ui-rd-grid" x1="${C}" y1="${C}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join('');
  const fmt = opciones.fmt || uiNum;
  const ejesLargos = opciones.ejesLargos || ejes;
  const polis = series.map((s, si) => {
    const max = Math.max(...s.valores.map(Number).filter(isFinite), 0) || 1;
    const pts = s.valores.map((v, k) => pt(k, R * (Number(v) || 0) / max));
    return `<g class="ui-rd-g" data-s="${si}"><polygon class="ui-rd-s c-${uiEsc(s.color)}" points="${pts.map(q => q.map(z => z.toFixed(1)).join(',')).join(' ')}"/>
      ${pts.map((q, k) => `<circle class="ui-rd-p c-${uiEsc(s.color)}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3.4" data-tip="${uiEsc(s.nombre + '\n' + ejesLargos[k] + ': ' + fmt(Number(s.valores[k]) || 0))}"/>`).join('')}</g>`;
  }).join('');
  const etq = ejes.map((e, k) => { const [x, y] = pt(k, R + 15); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${uiEsc(e)}</text>`; }).join('');
  const id = 'rd' + Math.random().toString(36).slice(2, 8);
  return `<div class="ui-radar" id="${id}"><svg viewBox="0 0 240 240">${anillos}${rayos}${polis}${etq}</svg>
    <div class="ui-g-ley">${series.map((s, si) => `<button type="button" class="ui-g-ley-b" data-s="${si}" onclick="uiRadarSerie('${id}',${si})" title="Mostrar / ocultar"><i class="c-${uiEsc(s.color)}"></i>${uiEsc(s.nombre)} · máx ${uiEsc(fmt(Math.max(...s.valores.map(Number).filter(isFinite), 0)))}</button>`).join('')}</div></div>`;
}

/* ════════ dispersión (outliers) ════════
   puntos = [{x: 0..1, y: número, color, titulo}] — el eje Y en múltiplos ("10.0x"). */
function uiDispersion(puntos, opciones = {}) {
  const p = puntos || [];
  if (!p.length) return uiVacioMini('Sin piezas en el período');
  const ymax = opciones.ymax || uiTecho(Math.max(...p.map(q => Number(q.y) || 0), 1));
  const ticks = [0, .5, 1];
  return `<div class="ui-disp" style="--alto:${opciones.alto || 170}px">
    <div class="ui-disp-eje">${ticks.map(t => `<span style="bottom:${t * 100}%">${uiEsc((opciones.fmtY || (v => v.toFixed(1) + 'x'))(ymax * t))}</span>`).join('')}</div>
    <div class="ui-disp-plot">${ticks.map(t => `<i class="ui-disp-l" style="bottom:${t * 100}%"></i>`).join('')}
      ${p.map(q => `<b class="ui-disp-p c-${uiEsc(q.color || 'verde')}" style="left:${(Math.max(0, Math.min(1, q.x)) * 100).toFixed(2)}%;bottom:${(Math.max(0, Math.min(1, (Number(q.y) || 0) / ymax)) * 100).toFixed(2)}%" data-tip="${uiEsc(q.titulo || '')}"${q.onclick ? ` onclick="${uiEsc(q.onclick)}"` : ''}></b>`).join('')}
    </div>
  </div>`;
}

/* ════════ tabla ════════
   cols = [{t:'CLIENTE', k:'nombre' | f:(fila)=>html, al?:'der'|'cen', ancho?}] · filas = [...] */
function uiTabla(cols, filas, opciones = {}) {
  const f = filas || [];
  if (!f.length) return uiVacio({ ico: opciones.icoVacio || 'archivo', titulo: opciones.vacio || 'No hay nada para mostrar', texto: opciones.vacioTexto || '' });
  return `<div class="ui-tabla-w"><table class="ui-tabla">
    <thead><tr>${cols.map(c => `<th${c.al ? ` class="al-${c.al}"` : ''}${c.ancho ? ` style="width:${c.ancho}"` : ''}>${uiEsc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${f.map((fila, i) => `<tr${opciones.onFila ? ` class="clic" onclick="${uiEsc(opciones.onFila)}(${i})"` : ''}>${cols.map(c =>
      `<td${c.al ? ` class="al-${c.al}"` : ''}>${c.f ? c.f(fila, i) : uiEsc(fila[c.k])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
// chip de estado con punto: "• Pendiente"
function uiEstado(texto, color) {
  return `<span class="ui-est c-${uiEsc(color || uiColorDe(texto))}"><i></i>${uiEsc(texto)}</span>`;
}

/* ════════ estado vacío ════════
   o = {ico, titulo, texto?, cta?:{texto, onclick}} — borde punteado y la acción en dorado. */
function uiVacio(o = {}) {
  return `<div class="ui-vacio2">
    ${uiIco(o.ico || 'grilla', 22)}
    <b>${uiEsc(o.titulo || 'Todavía no hay nada acá')}</b>
    ${o.texto ? `<span>${uiEsc(o.texto)}</span>` : ''}
    ${o.cta ? `<button type="button" class="ui-vacio-cta" onclick="${uiEsc(o.cta.onclick)}">${uiEsc(o.cta.texto)} →</button>` : ''}
  </div>`;
}

/* ════════ switch ════════ */
function uiSwitch(on, onclick, titulo = '') {
  return `<button type="button" class="ui-sw${on ? ' on' : ''}" role="switch" aria-checked="${on ? 'true' : 'false'}" title="${uiEsc(titulo)}" onclick="${uiEsc(onclick)}"><i></i></button>`;
}

/* ════════ kanban ════════
   cols = [{id, titulo, color, tarjetas:[{id, html}]}] · onMover = nombre de función (idTarjeta, idColumna).
   Arrastrar y soltar con el drag & drop nativo; el manejador es uno solo, delegado. */
function uiKanban(cols, onMover) {
  return `<div class="ui-kb" data-mover="${uiEsc(onMover || '')}">${(cols || []).map(c => `<div class="ui-kb-col" data-col="${uiEsc(c.id)}">
    <div class="ui-kb-h"><i class="ui-punto c-${uiEsc(c.color || 'gris')}"></i><b>${uiEsc(c.titulo)}</b><em>${(c.tarjetas || []).length}</em></div>
    <div class="ui-kb-l">${(c.tarjetas || []).length ? c.tarjetas.map(t => `<div class="ui-kb-t" draggable="${onMover ? 'true' : 'false'}" data-id="${uiEsc(t.id)}">${t.html}</div>`).join('') : `<div class="ui-kb-vacio">Vacío</div>`}</div>
  </div>`).join('')}</div>`;
}

/* ════════ calendario del mes ════════
   o = {anio, mes(0-11), eventos:{'2026-10-14':[{texto, color}]}, onDia?: nombre de función(fecha), max?:3} */
function uiCalendario(o) {
  const hoy = uiHoyAR();
  const pri = new Date(o.anio, o.mes, 1), dow = (pri.getDay() + 6) % 7;
  const dias = new Date(o.anio, o.mes + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < dow; i++) celdas.push('<div class="ui-cal-d fuera"></div>');
  for (let d = 1; d <= dias; d++) {
    const f = `${o.anio}-${String(o.mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const ev = (o.eventos || {})[f] || [];
    const max = o.max || 3;
    celdas.push(`<div class="ui-cal-d${f === hoy ? ' hoy' : ''}${ev.length ? ' con' : ''}${o.onDia ? ' clic' : ''}"${o.onDia ? ` onclick="${uiEsc(o.onDia)}('${f}')"` : ''}>
      <span class="ui-cal-n">${d}</span>
      ${ev.slice(0, max).map(e => `<span class="ui-cal-e c-${uiEsc(e.color || 'gold')}">${uiEsc(e.texto)}</span>`).join('')}
      ${ev.length > max ? `<span class="ui-cal-mas">+${ev.length - max} más</span>` : ''}
    </div>`);
  }
  while (celdas.length % 7) celdas.push('<div class="ui-cal-d fuera"></div>');
  return `<div class="ui-cal">
    <div class="ui-cal-sem">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<span>${x}</span>`).join('')}</div>
    <div class="ui-cal-g">${celdas.join('')}</div>
  </div>`;
}

/* ════════ modal ════════
   uiModalAbrir({titulo, sub?, cuerpo, acciones?:[{texto, onclick, pri?}], ancho?:'720px'}) · uiModalCerrar()
   Uno solo para todo el hub: se cierra con la X, con Escape o tocando afuera. */
function uiModalAbrir(o) {
  let m = document.getElementById('uiModal');
  if (!m) { m = document.createElement('div'); m.id = 'uiModal'; m.className = 'ui-modal-fondo'; document.body.appendChild(m); }
  m.innerHTML = `<div class="ui-modal" style="max-width:${uiEsc(o.ancho || '640px')}" role="dialog" aria-modal="true">
    <header><div><b>${uiEsc(o.titulo || '')}</b>${o.sub ? `<span>${uiEsc(o.sub)}</span>` : ''}</div>
      <div class="ui-modal-der">${o.der || ''}<button type="button" class="ui-modal-x" onclick="uiModalCerrar()" aria-label="Cerrar">${uiIco('x', 18)}</button></div></header>
    <div class="ui-modal-b">${o.cuerpo || ''}</div>
    ${(o.acciones || []).length ? `<footer>${o.acciones.map(a => `<button type="button" class="btn${a.pri ? ' primary' : ''}" onclick="${uiEsc(a.onclick)}">${uiEsc(a.texto)}</button>`).join('')}</footer>` : ''}
  </div>`;
  m.classList.add('open');
  document.body.classList.add('con-modal');
}
function uiModalCerrar() {
  const m = document.getElementById('uiModal');
  if (m) { m.classList.remove('open'); m.innerHTML = ''; }
  document.body.classList.remove('con-modal');
}

/* ════════ cajón lateral (notificaciones) ════════ */
function uiCajonAbrir(o) {
  let c = document.getElementById('uiCajon');
  if (!c) { c = document.createElement('div'); c.id = 'uiCajon'; c.className = 'ui-cajon-fondo'; document.body.appendChild(c); }
  c.innerHTML = `<section class="ui-cajon"><header><b>${uiEsc(o.titulo || '')}</b>${o.badge != null ? `<em>${uiEsc(o.badge)}</em>` : ''}
    <div class="ui-cajon-der">${o.der || ''}<button type="button" class="ui-modal-x" onclick="uiCajonCerrar()" aria-label="Cerrar">${uiIco('x', 18)}</button></div></header>
    <div class="ui-cajon-b">${o.cuerpo || ''}</div></section>`;
  requestAnimationFrame(() => c.classList.add('open'));
}
function uiCajonCerrar() { const c = document.getElementById('uiCajon'); if (c) c.classList.remove('open'); }

/* ════════ aviso flotante ════════ */
function uiToast(texto, tipo = '') {
  let t = document.getElementById('uiToast');
  if (!t) { t = document.createElement('div'); t.id = 'uiToast'; document.body.appendChild(t); }
  t.className = 'ui-toast ' + tipo; t.textContent = texto;
  t.classList.add('open');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('open'), 2600);
}

/* ════════ delegados (una sola vez) ════════ */
if (!window.__uiAtlas) {
  window.__uiAtlas = true;
  // tooltip universal: cualquier elemento con data-tip (texto; las líneas se separan con \n y la
  // primera va en negrita). Sigue al cursor y es fijo a la ventana, así no lo corta el borde de
  // ninguna tarjeta.
  let tipEl = null;
  const tipCrear = () => { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ui-tip'; document.body.appendChild(tipEl); } return tipEl; };
  window.uiTipMostrar = (html, cx, cy) => {
    const t = tipCrear();
    if (t._html !== html) { t.innerHTML = html; t._html = html; }
    t.classList.add('open');
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = cx + 14, y = cy - h - 12;
    if (x + w > innerWidth - 8) x = cx - w - 14;
    if (y < 8) y = cy + 18;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  };
  window.uiTipOcultar = () => { if (tipEl) tipEl.classList.remove('open'); };
  const tipHtml = (txt) => { const ls = String(txt).split('\n'); return `<b>${uiEsc(ls[0])}</b>${ls.slice(1).map(l => `<span>${uiEsc(l)}</span>`).join('')}`; };

  document.addEventListener('mousemove', (e) => {
    const plot = e.target.closest && e.target.closest('.ui-g-plot');
    document.querySelectorAll('.ui-graf.hov').forEach(g => { if (!plot || !g.contains(plot)) g.classList.remove('hov'); });
    if (plot) {
      const graf = plot.closest('.ui-graf'); const G = graf && UI_GRAF[graf.dataset.g];
      if (G) {
        const r = plot.getBoundingClientRect();
        const n = G.etiquetas.length;
        const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / r.width * (n - 1))));
        const xPct = n > 1 ? i / (n - 1) * 100 : 50;
        graf.classList.add('hov');
        const hov = plot.querySelector('.ui-g-hover');
        hov.style.setProperty('--x', xPct + '%');
        hov.querySelectorAll('.ui-g-dot').forEach(d => d.remove());
        const vivas = G.series.filter(s => !s.off);
        vivas.forEach(s => { const d = document.createElement('b'); d.className = 'ui-g-dot c-' + s.color; d.style.top = s.yPct[i] + '%'; hov.appendChild(d); });
        const fmtS = (s) => (s.fmt || (s.eje === 'der' ? G.fmtD : G.fmt) || uiNum);
        const titulo = G.tituloTip ? G.tituloTip(i) : G.etiquetas[i];
        const filas = vivas.map(s => `<span><i class="c-${uiEsc(s.color)}"></i>${uiEsc(s.nombre)}<em>${uiEsc(fmtS(s)(s.valores[i]))}</em></span>`).join('');
        if (G.flotante) {
          uiTipMostrar(`<b>${uiEsc(titulo)}</b>${filas}`, e.clientX, e.clientY);
        } else {
          const tip = hov.querySelector('.ui-g-tip');
          if (tip) { tip.innerHTML = `<b>${uiEsc(titulo)}</b>` + filas; tip.classList.toggle('izq', xPct > 62); }
        }
        graf.querySelectorAll('.ui-g-x span').forEach(sp => sp.classList.toggle('on', Number(sp.dataset.i) === i));
        return;
      }
    }
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && t.dataset.tip) { uiTipMostrar(tipHtml(t.dataset.tip), e.clientX, e.clientY); return; }
    uiTipOcultar();
  });
  document.addEventListener('mouseleave', uiTipOcultar);
  document.addEventListener('scroll', uiTipOcultar, true);
  // anillos (uiDona): pasar sobre un segmento o su fila de leyenda lo resalta y cambia el centro
  document.addEventListener('mouseover', (e) => {
    const seg = e.target.closest && e.target.closest('.ui-dona [data-seg]');
    document.querySelectorAll('.ui-dona.hov').forEach(dn => { if (!seg || !dn.contains(seg)) uiDonaReset(dn); });
    if (!seg) return;
    const dn = seg.closest('.ui-dona'), k = seg.dataset.seg;
    dn.classList.add('hov');
    dn.querySelectorAll('[data-seg]').forEach(el => el.classList.toggle('on', el.dataset.seg === k));
    const c = dn.querySelector('.ui-dona-centro');
    if (c && seg.dataset.cv != null) {
      if (c.dataset.orig == null) c.dataset.orig = c.innerHTML;
      c.innerHTML = `<b>${uiEsc(seg.dataset.cv)}</b><span>${uiEsc(seg.dataset.cl || '')}</span>`;
    }
  });
  // modal y cajón: Escape y clic afuera
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { uiModalCerrar(); uiCajonCerrar(); } });
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'uiModal') uiModalCerrar();
    if (e.target && e.target.id === 'uiCajon') uiCajonCerrar();
  });
  // kanban: arrastrar y soltar
  let arrastrando = null;
  document.addEventListener('dragstart', (e) => { const t = e.target.closest && e.target.closest('.ui-kb-t'); if (!t) return; arrastrando = t; t.classList.add('mov'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.dataset.id); } catch (er) { } });
  document.addEventListener('dragend', () => { if (arrastrando) arrastrando.classList.remove('mov'); arrastrando = null; document.querySelectorAll('.ui-kb-col.sobre').forEach(c => c.classList.remove('sobre')); });
  document.addEventListener('dragover', (e) => { const c = e.target.closest && e.target.closest('.ui-kb-col'); if (!c || !arrastrando) return; e.preventDefault(); document.querySelectorAll('.ui-kb-col.sobre').forEach(x => x !== c && x.classList.remove('sobre')); c.classList.add('sobre'); });
  document.addEventListener('drop', (e) => {
    const c = e.target.closest && e.target.closest('.ui-kb-col'); if (!c || !arrastrando) return; e.preventDefault();
    const kb = c.closest('.ui-kb'); const fn = kb && kb.dataset.mover;
    const id = arrastrando.dataset.id, col = c.dataset.col;
    c.querySelector('.ui-kb-l').appendChild(arrastrando);
    const v = c.querySelector('.ui-kb-vacio'); if (v) v.remove();
    c.classList.remove('sobre');
    if (fn && typeof window[fn] === 'function') window[fn](id, col);
  });
}

/* ════════ interacción de leyendas ════════ */
function uiGrafSerie(id, si) {
  const G = UI_GRAF[id]; if (!G || !G.series[si]) return;
  const vivas = G.series.filter(s => !s.off).length;
  if (!G.series[si].off && vivas <= 1) return;          // siempre queda al menos una serie
  G.series[si].off = !G.series[si].off;
  document.querySelectorAll(`.ui-graf[data-g="${id}"] [data-s="${si}"]`).forEach(el => el.classList.toggle('off', G.series[si].off));
}
function uiRadarSerie(id, si) {
  const r = document.getElementById(id); if (!r) return;
  r.querySelectorAll(`[data-s="${si}"]`).forEach(el => el.classList.toggle('off'));
}
function uiDonaReset(dn) {
  dn.classList.remove('hov');
  dn.querySelectorAll('[data-seg].on').forEach(el => el.classList.remove('on'));
  const c = dn.querySelector('.ui-dona-centro');
  if (c && c.dataset.orig != null) { c.innerHTML = c.dataset.orig; delete c.dataset.orig; }
}

/* ════════ KPI chico (ICP, Agendas, KPIs) ════════
   o = {ico?, etiqueta, valor, prefijo?, sub?, color?, variante?:'tinte'|'plano', valorColor?} */
function uiKpi(o) {
  const c = o.color || 'gris';
  return `<div class="ui-kpi ${uiEsc(o.variante || '')} c-${uiEsc(c)}"${o.valorColor ? ` style="--kc:var(--${uiEsc(o.valorColor)})"` : ''}>
    <div class="ui-kpi-l">${o.ico ? uiIco(o.ico, 16) : ''}${uiEsc(o.etiqueta)}</div>
    <div class="ui-kpi-v">${o.prefijo ? `<small>${uiEsc(o.prefijo)}</small>` : ''}<b>${uiEsc(o.valor)}</b>${o.delta != null ? uiDeltaB(o.delta) : ''}</div>
    ${o.sub ? `<div class="ui-kpi-s">${uiEsc(o.sub)}</div>` : ''}
  </div>`;
}
