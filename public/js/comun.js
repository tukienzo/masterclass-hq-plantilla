// Lo que comparten la landing y la página de gracias. Todo el texto del cliente se pinta con textContent
// (nunca innerHTML): lo carga gente desde la app y lo ve el público.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h != null) n.append(h);
  return n;
}

// "Tu promesa y *el resultado*" → lo de entre asteriscos va con el color de acento
export function conAcento(nodo, texto) {
  nodo.replaceChildren(...String(texto || '').split('*').map((t, i) => (i % 2 ? el('span', { class: 'acento', text: t }) : t)));
}

export async function publico() {
  const r = await fetch('/api/publico');
  if (!r.ok) throw new Error('publico ' + r.status);
  return r.json();
}

// el color del cliente como acento, con texto negro o blanco según cuál se lea mejor encima
export function aplicarMarca(cliente) {
  const c = /^#[0-9a-f]{6}$/i.test(cliente?.color || '') ? cliente.color : '#3b82f6';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  document.documentElement.style.setProperty('--acento', c);
  document.documentElement.style.setProperty('--acento-ink', lum > 0.32 ? '#0a0a0a' : '#ffffff');
}

/* ── países y horarios (los mismos 20 países que valida el servidor, lib/telefono.mjs) ── */
export const PAISES = [
  ['AR', 'Argentina', '54'], ['BO', 'Bolivia', '591'], ['CL', 'Chile', '56'], ['CO', 'Colombia', '57'], ['CR', 'Costa Rica', '506'],
  ['DO', 'Rep. Dominicana', '1'], ['EC', 'Ecuador', '593'], ['ES', 'España', '34'], ['GT', 'Guatemala', '502'], ['HN', 'Honduras', '504'],
  ['MX', 'México', '52'], ['NI', 'Nicaragua', '505'], ['PA', 'Panamá', '507'], ['PE', 'Perú', '51'], ['PR', 'Puerto Rico', '1'],
  ['PY', 'Paraguay', '595'], ['SV', 'El Salvador', '503'], ['US', 'Estados Unidos', '1'], ['UY', 'Uruguay', '598'], ['VE', 'Venezuela', '58'],
];
export const bandera = (code) => String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
const ZONAS = {
  'America/Argentina': 'AR', 'America/Buenos_Aires': 'AR', 'America/Cordoba': 'AR', 'America/La_Paz': 'BO', 'America/Santiago': 'CL',
  'America/Bogota': 'CO', 'America/Costa_Rica': 'CR', 'America/Santo_Domingo': 'DO', 'America/Guayaquil': 'EC', 'Europe/Madrid': 'ES',
  'Atlantic/Canary': 'ES', 'America/Guatemala': 'GT', 'America/Tegucigalpa': 'HN', 'America/Mexico_City': 'MX', 'America/Monterrey': 'MX',
  'America/Merida': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX', 'America/Chihuahua': 'MX', 'America/Managua': 'NI',
  'America/Panama': 'PA', 'America/Lima': 'PE', 'America/Puerto_Rico': 'PR', 'America/Asuncion': 'PY', 'America/El_Salvador': 'SV',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Montevideo': 'UY', 'America/Caracas': 'VE',
};
export const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires';
export const paisDeZona = (z = ZONA) => ZONAS[z] || ZONAS[Object.keys(ZONAS).find((k) => z.startsWith(k + '/'))] || '';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "Martes 3 de noviembre · 20:00 h" en la zona que se pida
export function fechaLarga(iso, zona = ZONA) {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zona }).format(d).replace(',', '');
  const hora = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(d);
  return `${cap(dia)} · ${hora} h`;
}
export function etiquetaZona() {
  const p = PAISES.find(([c]) => c === paisDeZona());
  return p ? `hora de ${p[1]}` : 'tu hora local';
}

// "20:00 h · Argentina, Uruguay, Chile y Paraguay" para la pregunta "¿A qué hora es en mi país?"
const FRANJAS = [
  ['Argentina', 'America/Argentina/Buenos_Aires'], ['Uruguay', 'America/Montevideo'], ['Chile', 'America/Santiago'], ['Paraguay', 'America/Asuncion'],
  ['Venezuela', 'America/Caracas'], ['Bolivia', 'America/La_Paz'], ['Rep. Dominicana', 'America/Santo_Domingo'],
  ['Colombia', 'America/Bogota'], ['Perú', 'America/Lima'], ['Ecuador', 'America/Guayaquil'], ['Miami', 'America/New_York'],
  ['México', 'America/Mexico_City'], ['Centroamérica', 'America/Guatemala'], ['España', 'Europe/Madrid'],
];
const unir = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs.at(-1) : xs[0]);
export function franjas(iso) {
  const d = new Date(iso);
  const diaBase = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: FRANJAS[0][1] }).format(d);
  const grupos = new Map();
  for (const [lugar, zona] of FRANJAS) {
    const hora = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(d);
    const dia = new Intl.DateTimeFormat('es', { weekday: 'long', timeZone: zona }).format(d);
    const k = `${hora} h${dia !== diaBase ? ` del ${dia}` : ''}`;
    grupos.set(k, [...(grupos.get(k) || []), lugar]);
  }
  return [...grupos].map(([k, lugares]) => `${k} · ${unir(lugares)}`).join('\n');
}

// pinta {d, h, m, s} cada segundo; fin = true cuando ya empezó
export function cuentaRegresiva(iso, pintar) {
  const t = Date.parse(iso);
  const tic = () => {
    const ms = Math.max(0, t - Date.now());
    pintar({ d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60, fin: ms === 0 });
    if (!ms) clearInterval(id);
  };
  const id = setInterval(tic, 1000);
  tic();
}
export const dos = (n) => String(n).padStart(2, '0');

export function pintarReloj(contenedor, x) {
  contenedor.replaceChildren(...[[x.d, 'Días'], [x.h, 'Horas'], [x.m, 'Min'], [x.s, 'Seg']].map(([n, t]) => el('div', {}, el('b', { text: dos(n) }), el('span', { text: t }))));
}

// el píxel de Meta, solo si el cliente lo cargó en Integraciones
export function cargarPixel(id) {
  if (!/^\d{5,20}$/.test(id || '') || window.fbq) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', id);
  window.fbq('track', 'PageView');
}
export const evento = (nombre, eventID) => { if (window.fbq) window.fbq('track', nombre, {}, { eventID }); };
