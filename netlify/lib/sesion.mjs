// Sesión: cookie firmada mhq_s, códigos de acceso (solo su HMAC en la base) y roles.
// Esconder no es seguridad: cada función vuelve a llamar a requerir(req, roles).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, esHttps } from './http.mjs';
import { obtener, listar, guardar, fusionar, fusionarSi } from './almacen.mjs';
import { azar, nuevoId } from './normalizar.mjs';

export const ROLES = ['equipo', 'cliente', 'closer'];
const VISTAS_TODAS = ['ceo', 'anuncios', 'utms', 'traza', 'icp', 'registros', 'landing', 'embudos', 'closers', 'central',
  'analisis', 'pipeline', 'llamadas', 'precall', 'crm', 'finanzas', 'kpis', 'webinar', 'conexiones', 'equipo'];
export const PERFILVIEWS = {
  equipo: VISTAS_TODAS,
  cliente: VISTAS_TODAS,
  closer: ['closers', 'central', 'analisis', 'pipeline', 'llamadas', 'precall', 'crm', 'webinar'],
};
export const MENSAJE_401 = 'Tu sesión se cerró: entrá de nuevo con tu link.';

const COOKIE = 'mhq_s';
const DURACION = 30 * 86400;        // 30 días, en segundos
const RENOVAR = 7 * 86400;          // `yo` la renueva si le quedan menos de 7 días

function secreto() {
  const s = process.env.SESION_SECRETO || '';
  if (s.length < 32) throw new HttpError(500, 'Falta configurar SESION_SECRETO');
  return s;
}
const hmac = (texto) => createHmac('sha256', secreto()).update(texto);
const b64u = (x) => Buffer.from(x).toString('base64url');
function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function leerCookie(req) {
  const h = req.headers.get('cookie') || '';
  for (const parte of h.split(';')) {
    const i = parte.indexOf('=');
    if (i > -1 && parte.slice(0, i).trim() === COOKIE) return parte.slice(i + 1).trim();
  }
  return '';
}

// {u, v, e} si la firma es buena y no venció; si no, null
function cargaDe(req) {
  const valor = leerCookie(req);
  const [parte1, firma] = valor.split('.');
  if (!parte1 || !firma) return null;
  if (!iguales(firma, hmac('sesion:' + parte1).digest('base64url'))) return null;
  try {
    const c = JSON.parse(Buffer.from(parte1, 'base64url').toString('utf8'));
    return c && typeof c.u === 'string' && Number.isInteger(c.v) && c.e > Date.now() / 1000 ? c : null;
  } catch {
    return null;
  }
}

// sesionVer va no enumerable: no sale en las respuestas, pero alcanza para renovar con cookieSesion(yo, req)
const aYo = (p) => Object.defineProperty(
  { uid: p.id, nombre: p.nombre, rol: p.rol, closer: p.rol === 'closer' ? p.nombre : '' },
  'sesionVer', { value: p.sesionVer || 0, enumerable: false });

// Yo = {uid, nombre, rol, closer} | null
export async function sesionDe(req) {
  secreto();
  const c = cargaDe(req);
  if (!c) return null;
  const p = await obtener('personas', c.u);
  if (!p || p.activo === false || !ROLES.includes(p.rol) || (p.sesionVer || 0) !== c.v) return null;
  return aYo(p);
}

export async function requerir(req, roles = ROLES) {
  const yo = await sesionDe(req);
  if (!yo) throw new HttpError(401, MENSAJE_401);
  if (!roles.includes(yo.rol)) throw new HttpError(403, 'No tenés acceso a esto');
  return yo;
}

const flags = (req) => '; Path=/; HttpOnly; SameSite=Lax' + (esHttps(req) ? '; Secure' : '');

// Acepta el doc de la persona ({id, sesionVer}) o un Yo ({uid, sesionVer})
export function cookieSesion(persona, req) {
  const carga = { u: persona.id || persona.uid, v: persona.sesionVer || 0, e: Math.floor(Date.now() / 1000) + DURACION };
  const parte1 = b64u(JSON.stringify(carga));
  return `${COOKIE}=${parte1}.${hmac('sesion:' + parte1).digest('base64url')}; Max-Age=${DURACION}` + flags(req);
}

export const cookieBorrar = (req) => `${COOKIE}=; Max-Age=0` + flags(req);

export function quedaPoco(req) {
  const c = cargaDe(req);
  return !!c && c.e - Date.now() / 1000 < RENOVAR;
}

// trim, mayúsculas, sin espacios; 8 caracteres sin guion → guion después del 4.º. Válido = XXXX-XXXX.
// CODIGO_INICIAL puede tener otro formato (/^[A-Z0-9-]{6,32}$/): se acepta solo si es ese.
function limpiarCodigo(s) {
  let c = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z0-9]{8}$/.test(c)) c = c.slice(0, 4) + '-' + c.slice(4);
  return c;
}
export function normalizarCodigo(s) {
  const c = limpiarCodigo(s);
  if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return c;
  const inicial = limpiarCodigo(process.env.CODIGO_INICIAL);
  return inicial && c === inicial && /^[A-Z0-9-]{6,32}$/.test(c) ? c : null;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin I, O, 0 ni 1
export const generarCodigo = () => azar(4, ALFABETO) + '-' + azar(4, ALFABETO);

export const hashCodigo = (codigoNormalizado) => hmac('codigo:' + codigoNormalizado).digest('hex');

// Firmas cortas para otros usos (p. ej. la firma del registro): 22 caracteres base64url (128 bits)
export const firmar = (dominio, texto) => hmac(dominio + ':' + texto).digest('base64url').slice(0, 22);
export const verificarFirma = (dominio, texto, firma) => typeof firma === 'string' && iguales(firma, firmar(dominio, texto));

export const yoPublico = (yo) => ({ uid: yo.uid, nombre: yo.nombre, rol: yo.rol, pantallas: [...(PERFILVIEWS[yo.rol] || [])] });

// ── ayudas para entrar (las usa acceso.mjs; extras a §6.3) ──

// La persona activa con ese código (ya normalizado), o null
export async function personaPorCodigo(codigoNormalizado) {
  if (!codigoNormalizado) return null;
  const ps = await listar('personas', { donde: { codigoHash: hashCodigo(codigoNormalizado) } });
  return ps.find((p) => p.activo !== false) || null;
}

// Candado del arranque en ajustes/arranque = {dueno, desde}: lo toma un solo pedido a la vez, con fusionarSi
// (mirar y escribir es atómico). Se suelta al terminar, salga bien o mal; si la función murió con el candado tomado
// (corte a los 60 s), pasado CANDADO_VENCE otro lo puede sacar, también atómico (solo si el dueño sigue siendo ese).
const CANDADO = 'arranque';
const CANDADO_VENCE = 2 * 60 * 1000;

async function tomarCandado() {
  const toma = { dueno: nuevoId('a_'), desde: new Date().toISOString() };
  await fusionar('ajustes', CANDADO, {});   // fusionarSi no crea: que el documento exista
  if (await fusionarSi('ajustes', CANDADO, toma, { dueno: [''] })) return toma.dueno;
  const c = await obtener('ajustes', CANDADO);
  const vencido = c && c.dueno && !(Date.now() - Date.parse(c.desde) < CANDADO_VENCE);
  return vencido && (await fusionarSi('ajustes', CANDADO, toma, { dueno: [c.dueno] })) ? toma.dueno : null;
}

// Si soltar falla, el candado vence solo
const soltarCandado = (dueno) => fusionarSi('ajustes', CANDADO, { dueno: '', desde: null }, { dueno: [dueno] }).catch(() => null);

// Arranque (§5.3): sin personas y con el código igual a CODIGO_INICIAL, crea el primer admin y lo devuelve.
// En cualquier otro caso, null. Comparación de tiempo constante sobre los HMAC. Dos pedidos a la vez sobre la base
// vacía crean uno solo: el otro no consigue el candado (null) o lo consigue después y ya ve a la persona creada.
export async function primerIngreso(codigoNormalizado) {
  const inicial = normalizarCodigo(process.env.CODIGO_INICIAL);
  if (!codigoNormalizado || !inicial) return null;
  if (!iguales(hashCodigo(codigoNormalizado), hashCodigo(inicial))) return null;
  if ((await listar('personas')).length) return null;
  const dueno = await tomarCandado();
  if (!dueno) return null;
  try {
    if ((await listar('personas')).length) return null;   // se creó mientras esperaba el candado
    return await guardar('personas', {
      id: nuevoId('u_'), nombre: (process.env.ADMIN_NOMBRE || '').trim().slice(0, 60) || 'Admin', rol: 'equipo',
      activo: true, codigoHash: hashCodigo(inicial), sesionVer: 0, ultimoIngreso: null,
    });
  } finally {
    await soltarCandado(dueno);
  }
}
