// La landing de registro. Los textos salen del webinar que está "en la landing" (/api/publico); el form es de
// dos pasos: el registro se guarda con los datos de contacto y recién después vienen las
// preguntas de calificación (un toque cada una).
import { $, $$, el, conAcento, publico, aplicarMarca, PAISES, bandera, paisDeZona, fechaLarga, etiquetaZona, franjas, cuentaRegresiva, pintarReloj, dos, cargarPixel, evento } from './comun.js';

const DURACION_MS = 3 * 36e5;   // pasado esto desde el inicio, la clase se da por terminada
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ERRORES = { nombre: 'Falta tu nombre.', email: 'El email parece incompleto.', whatsapp: 'Falta tu WhatsApp (sin el código de país).', demasiados: 'Demasiados intentos desde esta conexión. Probá de nuevo en un rato.', cerrado: 'Las inscripciones están cerradas.' };
// el servidor rechazó un número que sí se escribió: casi siempre es el país equivocado
const errorTel = (pais) => { const p = PAISES.find(([c]) => c === pais); return `Ese número no es válido para ${p ? `${p[1]} (+${p[2]})` : 'ese país'}: revisá el país y el número.`; };

function guardarUtm() {
  const q = new URLSearchParams(location.search);
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid']) if (q.get(k)) utm[k] = q.get(k).slice(0, 300);
  try { if (Object.keys(utm).length) sessionStorage.setItem('mhq_utm', JSON.stringify(utm)); return JSON.parse(sessionStorage.getItem('mhq_utm') || '{}'); }
  catch { return utm; }
}
const galleta = (n) => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1] || '';

function pintarTextos(w, cliente) {
  const L = w.landing;
  document.title = `${(L.titulo || cliente.nombre).replace(/\*/g, '')} · Clase gratuita en vivo`;
  $$('[data-marca]').forEach((n) => (n.textContent = cliente.nombre));
  $$('[data-cta]').forEach((n) => (n.textContent = L.cta || 'Reservar mi lugar gratis'));
  $$('[data-cuando]').forEach((n) => (n.textContent = fechaLarga(w.inicio)));
  $('#eyebrow').textContent = L.eyebrow || 'Clase gratuita en vivo';
  $('#fecha').replaceChildren(fechaLarga(w.inicio), ' ', el('small', { text: `(${etiquetaZona()})` }));
  conAcento($('#titulo'), L.titulo);
  $('#bajada').textContent = L.subtitulo;
  $('#micro-texto').textContent = L.microcopy || 'El acceso al directo te llega por WhatsApp.';

  const piezas = L.piezas || [];
  $('#sec-piezas').hidden = !piezas.length;
  conAcento($('#piezas-titulo'), L.piezasTitulo || 'Lo que vas a ver en la clase');
  $('#piezas').replaceChildren(...piezas.map((p, i) => el('article', { class: 'pieza' }, el('div', { class: 'num', text: dos(i + 1) }), el('h3', { text: p.titulo }), p.texto ? el('p', { text: p.texto }) : null)));
  $('#regalo').hidden = !L.regalo?.titulo;
  $('#regalo-titulo').textContent = L.regalo?.titulo || '';
  $('#regalo-texto').textContent = L.regalo?.texto || '';

  const si = L.paraQuien || [], no = L.noParaQuien || [];
  $('#sec-quien').hidden = !si.length && !no.length;
  $('#lista-si').hidden = !si.length;
  $('#lista-no').hidden = !no.length;
  $('#si').replaceChildren(...si.map((t) => el('li', { text: t })));
  $('#no').replaceChildren(...no.map((t) => el('li', { text: t })));

  const pr = L.presentador || {};
  $('#sec-presentador').hidden = !pr.nombre;
  $('#pr-nombre').textContent = pr.nombre || '';
  $('#pr-bio').textContent = pr.bio || '';
  const foto = $('#pr-foto');
  foto.hidden = !pr.foto;
  if (pr.foto) { foto.src = pr.foto; foto.alt = pr.nombre || ''; }
  $('#pr-numeros').replaceChildren(...(pr.numeros || []).map((t) => el('span', { text: t })));

  const faq = [...(L.faq || []), { titulo: '¿A qué hora es en mi país?', texto: franjas(w.inicio) }];
  $('#faq').replaceChildren(...faq.map((f) => el('details', {}, el('summary', { text: f.titulo }), el('p', { text: f.texto }))));
  conAcento($('#cierre-titulo'), L.cierre || 'Una clase. En vivo. Una sola vez.');
  $('#disclaimer').textContent = L.disclaimer || 'Los resultados dependen del trabajo de cada persona: no prometemos ingresos y los números que se muestran son ejemplos.';
}

function armarForm(w) {
  const sel = $('#pais');
  const def = paisDeZona() || w.pais || 'AR';
  sel.replaceChildren(...PAISES.map(([c, n, cc]) => el('option', { value: c, selected: c === def, text: `${bandera(c)} +${cc}` })));
  sel.setAttribute('aria-label', 'Código de país');
  const utm = guardarUtm();
  const form = $('#form');
  const err = (campo, msg) => {
    const i = form.elements[campo];
    if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false');
    $(`#err-${campo}`).textContent = msg || '';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const datos = { nombre: f.nombre.value.trim(), email: f.email.value.trim(), pais: f.pais.value, whatsapp: f.whatsapp.value.trim() };
    err('nombre', datos.nombre.length < 2 && ERRORES.nombre);
    err('email', !EMAIL.test(datos.email) && ERRORES.email);
    err('whatsapp', datos.whatsapp.replace(/\D/g, '').length < 6 && ERRORES.whatsapp);
    const mal = $$('[aria-invalid=true]', form)[0];
    if (mal) { mal.focus(); return; }

    const boton = $('#enviar');
    boton.disabled = true;
    boton.textContent = 'Reservando tu lugar…';
    const { fbclid, ...utms } = utm;
    const eventId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    try {
      const r = await fetch('/api/registro', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...datos, hp: f.web.value, utm: utms, eventId, fbp: galleta('_fbp'), fbc: galleta('_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : ''), url: location.href.split('#')[0], ref: document.referrer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === 'whatsapp' && datos.whatsapp) err('whatsapp', errorTel(datos.pais));
        else if (['nombre', 'email', 'whatsapp'].includes(j.error)) err(j.error, ERRORES[j.error]);
        else $('#err-form').textContent = ERRORES[j.error] || 'No pudimos guardar tu registro. Probá de nuevo.';
        boton.disabled = false;
        boton.textContent = w.landing.cta || 'Reservar mi lugar gratis';
        return;
      }
      try { sessionStorage.setItem('mhq_nombre', datos.nombre.split(' ')[0]); } catch {}
      if (j.nuevo) evento('Lead', j.eventId);
      if (j.nuevo && j.preguntas) pasoDos(w, j);
      else setTimeout(() => location.assign('/gracias'), 350);   // un respiro para que salga el píxel
    } catch {
      $('#err-form').textContent = 'Se cortó la conexión. Probá de nuevo.';
      boton.disabled = false;
      boton.textContent = w.landing.cta || 'Reservar mi lugar gratis';
    }
  });
}

// paso 2: las preguntas de calificación; al contestar la última se manda y se va a la página de gracias
function pasoDos(w, reg) {
  const respuestas = {};
  const ps = w.landing.preguntas;
  const final = async () => {
    $('#paso2-estado').textContent = 'Reservando tu lugar…';
    try {
      const r = await fetch('/api/registro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paso: 'respuestas', ref: reg.ref, firma: reg.firma, respuestas }) });
      const j = await r.json().catch(() => ({}));
      if (j.calificado) evento('CompleteRegistration', j.eventId);
    } catch { /* el registro ya está guardado: las respuestas son un extra */ }
    setTimeout(() => location.assign('/gracias'), 350);
  };
  const bloque = el('div', { class: 'paso2' },
    el('h2', { text: 'Último paso' }),
    el('p', { class: 'sub', text: ps.length > 1 ? `${ps.length} preguntas para preparar la clase.` : 'Una pregunta para preparar la clase.' }),
    el('div', { class: 'barra' }, el('i')),
    ...ps.map((p) => el('div', { class: 'preg', role: 'group', 'aria-label': p.texto },
      el('b', { text: p.texto }),
      el('div', { class: 'opcs' }, ...p.opciones.map((o, i) => {
        const b = el('button', { type: 'button', class: 'opc', 'aria-pressed': 'false' }, el('em', { text: 'ABCDEFGH'[i] }), o);
        b.addEventListener('click', () => {
          respuestas[p.id] = o;
          $$('.opc', b.parentNode).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          if (ps.every((q) => respuestas[q.id])) final();
        });
        return b;
      })))),
    el('p', { class: 'form-pie', id: 'paso2-estado', role: 'status' }));
  $('#ticket-cuerpo').replaceChildren(bloque);
  $('.opc', bloque)?.focus();
}

async function arrancar() {
  let datos;
  try { datos = await publico(); } catch { datos = null; }
  if (!datos?.webinar) {
    if (datos?.cliente) {
      aplicarMarca(datos.cliente);
      $$('[data-marca]').forEach((n) => (n.textContent = datos.cliente.nombre));
    }
    $('#titulo').textContent = 'No hay una clase abierta en este momento.';
    $('#ticket').hidden = true;
    // sin clase no hay dónde reservar: fuera los botones, el aviso de "en vivo" y las secciones que quedarían vacías
    [...$$('a[href="#ticket"]'), $('.pill'), $('.micro'), $('#faq').closest('section'), $('section.cierre')].forEach((n) => { if (n) n.hidden = true; });
    return;
  }
  const w = datos.webinar;
  aplicarMarca(datos.cliente);
  cargarPixel(datos.pixel);
  pintarTextos(w, datos.cliente);
  armarForm(w);
  document.body.classList.add('listo');

  const termino = Date.now() > Date.parse(w.inicio) + (Number(w.duracionMin) > 0 ? w.duracionMin * 6e4 : DURACION_MS);
  if (termino) {
    $('#ticket-cuerpo').replaceChildren(el('p', { class: 'cerrado', text: 'Esta clase ya terminó. ¡Gracias por el interés!' }));
    $$('[data-cta]').forEach((n) => n.closest('a, button')?.setAttribute('hidden', ''));
  }
  cuentaRegresiva(w.inicio, (x) => {
    $$('[data-reloj]').forEach((c) => pintarReloj(c, x));
    $('#cuenta-texto').textContent = x.fin ? (termino ? '' : 'La clase ya empezó: registrate y entrá por el grupo.') : `Empieza en ${x.d} ${x.d === 1 ? 'día' : 'días'}, ${dos(x.h)} h ${dos(x.m)} min`;
  });

  // todos los botones llevan al form; en el celular, la barra fija aparece cuando el form no se ve
  $$('a[href="#ticket"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    $('#ticket').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => $('#form')?.elements.nombre?.focus({ preventScroll: true }), 450);
  }));
  const fija = $('#fija');
  if (!termino && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => fija.classList.toggle('ver', !e.isIntersecting), { threshold: 0 }).observe($('#ticket'));
  }
}

arrancar();
