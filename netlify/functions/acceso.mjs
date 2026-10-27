// /api/acceso — entrar con el código personal, quién soy y salir (§7.2). La sesión va en la cookie mhq_s (HttpOnly).
// Límite: cada código malo suma 1 por IP en una ventana de 15 min; con ACCESO_LIMITE (10) se corta con 429.
import { timingSafeEqual } from 'node:crypto';
import { manejar, json, leerJSON, metodo, ipDe, HttpError } from '../lib/http.mjs';
import { ROLES, sesionDe, cookieSesion, cookieBorrar, quedaPoco, normalizarCodigo, hashCodigo, personaPorCodigo, primerIngreso, yoPublico } from '../lib/sesion.mjs';
import { fusionarSi, incrementar } from '../lib/almacen.mjs';
import { env } from '../lib/config.mjs';

const VENTANA_MS = 15 * 60 * 1000;
const limite = () => Number(env('ACCESO_LIMITE', '10')) || 10;
const ventana = () => Math.floor(Date.now() / VENTANA_MS);
const yoDe = (p) => ({ uid: p.id, nombre: p.nombre, rol: p.rol });

// ¿es CODIGO_INICIAL? (tiempo constante sobre los HMAC, como primerIngreso)
function esInicial(c) {
  const i = normalizarCodigo(process.env.CODIGO_INICIAL);
  return !!i && timingSafeEqual(Buffer.from(hashCodigo(c)), Buffer.from(hashCodigo(i)));
}

// Arranque (§5.3) de a uno: primerIngreso lee y después escribe, así que dos entrar a la vez con la base vacía
// crearían dos admin con el mismo código. El candado vive en limites y vence con la ventana; el que no lo toma, 401.
async function arranque(c) {
  if (!esInicial(c)) return null;
  const candado = `arranque:${ventana()}`;
  try {
    return (await incrementar('limites', candado, 'n', 1)) === 1 ? await primerIngreso(c) : null;
  } finally {
    await incrementar('limites', candado, 'n', -1);
  }
}

async function entrar(cuerpo, req, context) {
  const lim = `acc:${ipDe(req, context)}:${ventana()}`;
  const c = normalizarCodigo(typeof cuerpo.clave === 'string' ? cuerpo.clave : '');
  let p;
  // se cuenta antes de mirar el código y con la suma atómica: los pedidos en paralelo no se saltean el límite
  if ((await incrementar('limites', lim, 'n', 1)) > limite()) {
    // con la IP cortada solo pasa quien ya tiene sesión y pone su propio código (mhq.js:463, tras regenerarlo)
    const y = c ? await sesionDe(req) : null;
    p = y ? await personaPorCodigo(c) : null;
    if (!p || p.id !== y.uid) throw new HttpError(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
  } else {
    p = c ? (await personaPorCodigo(c)) || (await arranque(c)) : null;
    if (!p || !ROLES.includes(p.rol)) throw new HttpError(401, 'Código inválido o dado de baja');
  }
  await incrementar('limites', lim, 'n', -1);   // un ingreso correcto no suma
  // solo si sigue existiendo: si la borraron entre la lectura y acá, fusionar la recrearía con solo ultimoIngreso
  if (!(await fusionarSi('personas', p.id, { ultimoIngreso: new Date().toISOString() }))) {
    throw new HttpError(401, 'Código inválido o dado de baja');
  }
  return json({ ok: true, yo: yoPublico(yoDe(p)) }, { headers: { 'set-cookie': cookieSesion(p, req) } });
}

async function yo(req) {
  const y = await sesionDe(req);
  if (!y) throw new HttpError(401, 'Sin sesión');
  return json({ ok: true, yo: yoPublico(y) }, { headers: quedaPoco(req) ? { 'set-cookie': cookieSesion(y, req) } : {} });
}

export default manejar(async (req, context) => {
  metodo(req, ['POST']);
  const cuerpo = await leerJSON(req, { max: 8 * 1024 });
  if (cuerpo.accion === 'entrar') return entrar(cuerpo, req, context);
  if (cuerpo.accion === 'yo') return yo(req);
  // salir no pide sesión: siempre borra la cookie (el frontend recarga después)
  if (cuerpo.accion === 'salir') return json({ ok: true }, { headers: { 'set-cookie': cookieBorrar(req) } });
  throw new HttpError(400, 'Acción desconocida');
});

export const config = { path: '/api/acceso', method: ['POST'] };
