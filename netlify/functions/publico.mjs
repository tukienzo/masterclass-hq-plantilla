// /api/publico — lo que lee la landing y la página de gracias: la marca, el píxel y el webinar que está "en la
// landing". Público, sin sesión ni cookies. El CDN de Netlify lo guarda 60 s (la app purga el tag "publico").
import { manejar, json } from '../lib/http.mjs';
import { negocio } from '../lib/config.mjs';
import { leerIntegracion } from '../lib/integraciones/estado.mjs';
import { inicioISO, popupISO, duracionDe } from '../lib/webinars.mjs';
import { landingPublica } from '../lib/landing.mjs';
import { webinarEnLanding, preguntasDe } from '../lib/registros.mjs';

const CACHE = {
  cache: 'public, max-age=0, must-revalidate',
  headers: {
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=60, stale-while-revalidate=300',
    'Netlify-Cache-Tag': 'publico',
  },
};

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// La landing sin el criterio de calificación, siempre objeto y con preguntas siempre array. Las preguntas salen
// de preguntasDe, igual que en /api/registro: mismos ids y ninguna sin opciones (trabaría el paso 2).
function landingDe(guardada) {
  const L = { ...objeto(landingPublica(objeto(guardada))) };
  L.preguntas = preguntasDe(guardada).map(({ id, texto, opciones }) => ({ id, texto, opciones }));
  return L;
}

function webinarPublico(w, neg) {
  if (!w) return null;
  try {
    const duracionMin = duracionDe(w, neg);
    return {
      id: w.id, formato: String(w.formato || ''), zona: neg.zona,
      inicio: inicioISO(w, neg.zona), popup: popupISO(w, neg.zona) || null,
      duracionMin, pais: neg.pais, landing: landingDe(w.landing),
    };
  } catch (e) {
    console.error('publico: el webinar activo tiene datos inválidos', w.id, e?.message);
    return null;
  }
}

export default manejar(async () => {
  const [neg, meta, w] = await Promise.all([negocio(), leerIntegracion('meta'), webinarEnLanding()]);
  const pixel = meta.origen !== 'demo' && /^\d{5,20}$/.test(String(meta.pixel || '')) ? String(meta.pixel) : null;
  return json({ ok: true, cliente: { nombre: neg.nombre, color: neg.color }, pixel, webinar: webinarPublico(w, neg) }, CACHE);
});

export const config = { path: '/api/publico', method: ['GET'] };
