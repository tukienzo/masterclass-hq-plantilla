// La landing de un webinar: la de defecto, el parseo del editor (mhq.js) y la versión pública (sin el criterio).
// parsearLanding acepta el form del editor ("titulo | texto" por línea, "* opción" que califica) o la forma ya
// parseada (arrays), así que es idempotente. Lo que no viene en el form se toma de la guardada.
import { HttpError } from './http.mjs';
import { texto as recortar, httpsUrl, norm, slug, idSeguro } from './normalizar.mjs';

const TEXTOS = ['eyebrow', 'titulo', 'subtitulo', 'cta', 'microcopy', 'piezasTitulo', 'cierre', 'disclaimer', 'pasoMail'];
const MAX = { piezas: 4, faq: 8, numeros: 4, preguntas: 3, opciones: 8 };
const ERROR_LINK = {
  whatsapp: 'El link de WhatsApp tiene que empezar con https://',
  video: 'El link del video tiene que empezar con https://',
  foto: 'El link de la foto tiene que empezar con https://',
};

export const LANDING_DEFECTO = Object.freeze({
  eyebrow: 'Clase gratuita en vivo',
  titulo: 'Tu promesa en una línea y *el resultado en el color de la marca*',
  subtitulo: 'Contá en una o dos oraciones qué se lleva la persona de la clase y por qué le sirve ahora.',
  cta: 'Reservar mi lugar gratis',
  microcopy: 'El acceso al directo te llega por WhatsApp.',
  piezasTitulo: 'Lo que vas a ver en la clase',
  piezas: [
    { titulo: 'Tema 1', texto: 'Qué se lleva la persona de esta parte.' },
    { titulo: 'Tema 2', texto: 'Qué se lleva la persona de esta parte.' },
    { titulo: 'Tema 3', texto: 'Qué se lleva la persona de esta parte.' }],
  regalo: { titulo: '', texto: '' },
  paraQuien: ['Quien ya tiene claro el problema y busca un método para resolverlo.', 'Quien puede dedicarle tiempo a aplicar lo que ve.'],
  noParaQuien: ['Quien busca resultados sin hacer nada.'],
  presentador: { nombre: 'Tu nombre', bio: 'Quién sos y por qué podés enseñar esto, en dos o tres oraciones.', foto: '', numeros: [] },
  faq: [
    { titulo: '¿Cuánto cuesta?', texto: 'Nada. Es gratuita y en vivo.' },
    { titulo: '¿Necesito experiencia previa?', texto: 'No. La clase arranca desde cero.' }],
  cierre: 'Una clase. En vivo. Una sola vez.',
  disclaimer: 'Los resultados dependen del trabajo de cada persona. No prometemos ingresos ni resultados.',
  video: '', whatsapp: '', pasoMail: '',
  preguntas: [{
    id: 'cuanto-podes-invertir', texto: '¿Cuánto podés invertir en tu formación?',
    opciones: ['Nada por ahora', 'Menos de 500', '500 a 1.000', 'Más de 1.000'],
    calificadas: ['500 a 1.000', 'Más de 1.000'] }],
});

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
// texto con trim y tope de 2000; un objeto o array suelto no es texto
const texto = (v) => (v != null && typeof v === 'object' ? '' : recortar(v));
// string por líneas o array → líneas con trim, sin vacías (un objeto suelto no trae líneas)
const lineas = (v) => (Array.isArray(v) ? v : v != null && typeof v === 'object' ? [] : String(v ?? '').split(/\r?\n/))
  .map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x !== '' && x != null);

function link(v, cual, estricto) {
  const u = httpsUrl(texto(v));
  if (u !== null) return u;
  if (estricto) throw new HttpError(400, ERROR_LINK[cual]);
  return '';
}

// "titulo | texto" por línea (se corta en el primer |) o [{titulo, texto}]
function pares(v, max) {
  const r = [];
  for (const x of lineas(v)) {
    let p;
    if (typeof x === 'string') {
      const i = x.indexOf('|');
      p = i < 0 ? { titulo: texto(x), texto: '' } : { titulo: texto(x.slice(0, i)), texto: texto(x.slice(i + 1)) };
    } else {
      p = { titulo: texto(objeto(x).titulo), texto: texto(objeto(x).texto) };
    }
    if (p.titulo || p.texto) r.push(p);
  }
  return r.slice(0, max);
}

const textos = (v, max) => lineas(v).map((x) => texto(x)).filter(Boolean).slice(0, max);

// opciones por línea; "* opción" va a opciones y a calificadas (sin el *). Acepta también {opciones:[], calificadas:[]}.
function opcionesDe(p) {
  const marcadas = new Set(Array.isArray(p.calificadas) ? p.calificadas.map((x) => texto(x)) : []);
  const opciones = [], calificadas = [];
  for (const x of lineas(p.opciones)) {
    if (typeof x !== 'string') continue;
    const califica = /^\*/.test(x);
    const o = texto(x.replace(/^\*\s*/, ''));
    if (!o || opciones.includes(o)) continue;
    if (opciones.length >= MAX.opciones) break;
    opciones.push(o);
    if (califica || marcadas.has(o)) calificadas.push(o);
  }
  return { opciones, calificadas };
}

// El id de cada pregunta (R-03): 0) el que ya trae (forma parseada); 1) el de la guardada con el mismo texto;
// 2) si la cantidad no cambió, el de la guardada en la misma posición que nadie usó; 3) slug del texto (-2, -3…).
function preguntasDe(v, guardadas) {
  const nuevas = (Array.isArray(v) ? v : []).map(objeto)
    .map((p) => ({ id: idSeguro(p.id) ? p.id : '', texto: texto(p.texto), ...opcionesDe(p) }))
    .filter((p) => p.texto).slice(0, MAX.preguntas);
  const viejas = (Array.isArray(guardadas) ? guardadas : []).map(objeto).filter((p) => idSeguro(p.id));
  const usados = new Set();
  for (const p of nuevas) {
    if (p.id && !usados.has(p.id)) usados.add(p.id);
    else p.id = '';
  }
  for (const p of nuevas) {
    if (p.id) continue;
    const igual = viejas.find((g) => !usados.has(g.id) && norm(g.texto) === norm(p.texto));
    if (igual) { p.id = igual.id; usados.add(igual.id); }
  }
  if (nuevas.length === viejas.length) {
    nuevas.forEach((p, i) => {
      if (!p.id && !usados.has(viejas[i].id)) { p.id = viejas[i].id; usados.add(p.id); }
    });
  }
  for (const p of nuevas) {
    if (p.id) continue;
    const base = slug(p.texto) || 'pregunta';
    let id = base;
    for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
    p.id = id;
    usados.add(id);
  }
  return nuevas.map(({ id, texto: t, opciones, calificadas }) => ({ id, texto: t, opciones, calificadas }));
}

function armar(form, guardada, estricto) {
  const f = objeto(form), g = objeto(guardada);
  const de = (k) => (f[k] !== undefined ? f[k] : g[k]);
  const L = {};
  for (const k of TEXTOS) L[k] = texto(de(k));
  const regalo = { ...objeto(g.regalo), ...objeto(f.regalo) };
  L.piezas = pares(de('piezas'), MAX.piezas);
  L.regalo = { titulo: texto(regalo.titulo), texto: texto(regalo.texto) };
  L.paraQuien = textos(de('paraQuien'));
  L.noParaQuien = textos(de('noParaQuien'));
  const pr = { ...objeto(g.presentador), ...objeto(f.presentador) };
  L.presentador = { nombre: texto(pr.nombre), bio: texto(pr.bio), foto: link(pr.foto, 'foto', estricto), numeros: textos(pr.numeros, MAX.numeros) };
  L.faq = pares(de('faq'), MAX.faq);
  L.video = link(de('video'), 'video', estricto);
  L.whatsapp = link(de('whatsapp'), 'whatsapp', estricto);
  L.preguntas = preguntasDe(de('preguntas'), g.preguntas);
  return L;
}

// Tira HttpError(400) si un link no es https. Las claves desconocidas (p3, p4…) se descartan.
export const parsearLanding = (form, guardada) => armar(form, guardada, true);

// La que publica /api/publico: siempre objeto, preguntas siempre array y sin `calificadas` (no se publica el criterio)
export function landingPublica(landing) {
  const L = armar(landing, null, false);
  L.preguntas = L.preguntas.map(({ calificadas, ...p }) => p);
  return L;
}

// Una landing guardada con todas sus claves y tipos (sin tirar por links viejos): la que ve el editor en la ficha
export const completarLanding = (landing) => armar(landing, null, false);
