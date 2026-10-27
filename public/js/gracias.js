// Página de gracias: un solo objetivo, que entre al grupo de WhatsApp (por ahí llega el link del directo).
// Estructura: "no cierres esta página", progreso
// incompleto con el nombre, pasos numerados, video opcional y agregar al calendario.
import { $, el, publico, aplicarMarca, fechaLarga, etiquetaZona, cuentaRegresiva, pintarReloj, cargarPixel } from './comun.js';

// link de YouTube / Vimeo / Wistia / Loom o un .mp4 → cómo se embebe
export function embed(u) {
  try {
    const x = new URL(u);
    const ultimo = x.pathname.split('/').filter(Boolean).pop() || '';
    if (/(^|\.)youtube\.com$|^youtu\.be$/.test(x.hostname)) {
      const id = x.searchParams.get('v') || (x.hostname === 'youtu.be' || /^\/(shorts|live|embed)\//.test(x.pathname) ? ultimo : '');
      if (/^[\w-]{6,20}$/.test(id)) return { iframe: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` };
    }
    if (/(^|\.)vimeo\.com$/.test(x.hostname) && /^\d+$/.test(ultimo)) return { iframe: `https://player.vimeo.com/video/${ultimo}` };
    if (/wistia\.(com|net)$/.test(x.hostname) && /^\w+$/.test(ultimo)) return { iframe: `https://fast.wistia.net/embed/iframe/${ultimo}?videoFoam=true` };
    if (/(^|\.)loom\.com$/.test(x.hostname) && /^\w+$/.test(ultimo)) return { iframe: `https://www.loom.com/embed/${ultimo}` };
    if (/\.(mp4|webm|mov)$/i.test(x.pathname)) return { video: u };
  } catch { /* link raro: no se muestra */ }
  return null;
}

const basico = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20261103T230000Z
// RFC 5545: cada línea hasta 75 octetos; lo que sigue va en la próxima con un espacio adelante (sin partir una letra)
const utf8 = new TextEncoder();
function plegar(linea) {
  const partes = [];
  let actual = '', octetos = 0;
  for (const c of linea) {
    const n = utf8.encode(c).length;
    if (octetos + n > (partes.length ? 74 : 75)) { partes.push(actual); actual = ''; octetos = 0; }
    actual += c; octetos += n;
  }
  return [...partes, actual].join('\r\n ');
}
function calendario(w, titulo, detalle) {
  const fin = new Date(Date.parse(w.inicio) + (Number(w.duracionMin) > 0 ? w.duracionMin * 6e4 : 2 * 36e5)).toISOString();
  const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${basico(w.inicio)}/${basico(fin)}`, details: detalle });
  const e = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const alarma = (t, txt) => ['BEGIN:VALARM', `TRIGGER:-${t}`, 'ACTION:DISPLAY', `DESCRIPTION:${txt}`, 'END:VALARM'];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Masterclass HQ//ES', 'BEGIN:VEVENT', `UID:${w.id}@masterclass-hq`, `DTSTAMP:${basico(new Date().toISOString())}`,
    `DTSTART:${basico(w.inicio)}`, `DTEND:${basico(fin)}`, `SUMMARY:${e(titulo)}`, `DESCRIPTION:${e(detalle)}`,
    ...alarma('PT1H', 'La clase empieza en 1 hora'), ...alarma('PT10M', 'La clase empieza en 10 minutos'), 'END:VEVENT', 'END:VCALENDAR'].map(plegar).join('\r\n') + '\r\n';
  return { google, ics: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })) };
}

// la barra de progreso al 100 % (también para los lectores de pantalla)
function completar() {
  $('#progreso-barra').style.width = '100%';
  $('#progreso-barra').parentNode.setAttribute('aria-valuenow', '100');
  $('#progreso-texto').textContent = 'Registro completo';
}

async function arrancar() {
  let datos;
  try { datos = await publico(); } catch { datos = null; }
  const w = datos?.webinar;
  if (!w) {
    // sin webinar no hay grupo ni calendario, y va la marca si se conoce. Si se registró en esta pestaña, el registro
    // se da por completo; si llegó directo, dice lo mismo que la landing (no hay ningún registro que confirmar)
    if (datos?.cliente) {
      aplicarMarca(datos.cliente);
      document.querySelectorAll('[data-marca]').forEach((n) => (n.textContent = datos.cliente.nombre));
    }
    let registrado = false;
    try { registrado = !!sessionStorage.getItem('mhq_nombre'); } catch {}
    $('.aviso').hidden = true;
    if (registrado) {
      $('#titulo').textContent = 'Tu registro quedó guardado.';
      completar();
    } else {
      $('#titulo').textContent = 'No hay una clase abierta en este momento.';
      $('.progreso').hidden = true;
    }
    return;
  }
  const L = w.landing;
  aplicarMarca(datos.cliente);
  cargarPixel(datos.pixel);
  let nombre = '';
  try { nombre = sessionStorage.getItem('mhq_nombre') || ''; } catch {}
  $('#titulo').textContent = nombre ? `${nombre}, te falta un paso` : 'Te falta un paso';
  $('#cuando').replaceChildren(fechaLarga(w.inicio), ' ', el('small', { text: `(${etiquetaZona()})` }));
  $('#disclaimer').textContent = L.disclaimer || '';
  document.querySelectorAll('[data-marca]').forEach((n) => (n.textContent = datos.cliente.nombre));

  let n = 0;
  const numerar = (paso) => { paso.hidden = false; paso.querySelector('.n').textContent = String(++n); };

  // 1 · el grupo (si no está cargado, no hay paso: queda la confirmación de que está anotado)
  const grupo = $('#paso-grupo');
  if (L.whatsapp) {
    numerar(grupo);
    const b = $('#btn-grupo');
    b.href = L.whatsapp;
    b.addEventListener('click', () => {
      grupo.classList.add('hecho');
      completar();
      $('#grupo-otra').hidden = false;
    });
  } else {
    $('#titulo').textContent = nombre ? `${nombre}, tu lugar está reservado` : 'Tu lugar está reservado';
    completar();
  }
  // 2 · el mail (solo si la secuencia lo pide)
  if (L.pasoMail) { numerar($('#paso-mail')); $('#mail-texto').textContent = L.pasoMail; }
  // 3 · el video
  const v = L.video && embed(L.video);
  if (v) {
    numerar($('#paso-video'));
    $('#video').append(v.iframe
      ? el('iframe', { src: v.iframe, title: 'Video antes de la clase', allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, loading: 'lazy' })
      : el('video', { src: v.video, controls: true, playsinline: true, preload: 'metadata' }));
  }
  // 4 · el calendario
  numerar($('#paso-agenda'));
  const titulo = (L.titulo || 'Clase en vivo').replace(/\*/g, '');
  const cal = calendario(w, titulo, L.whatsapp ? `El link del directo llega por el grupo de WhatsApp: ${L.whatsapp}` : 'Clase gratuita en vivo.');
  $('#cal-google').href = cal.google;
  $('#cal-ics').href = cal.ics;

  cuentaRegresiva(w.inicio, (x) => pintarReloj($('#reloj'), x));
  // si se va a otra pestaña sin entrar al grupo, el título se lo recuerda
  const original = document.title;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden && L.whatsapp && !grupo.classList.contains('hecho') ? '(1) Te falta un paso' : original;
  });
}

arrancar();
