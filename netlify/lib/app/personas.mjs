// /api/app: personas y persona (§7.3.13-7.3.14). El código se devuelve en claro una sola vez; en la base, su HMAC.
// `cliente` no crea ni toca a alguien del `equipo`; nadie se da de baja a sí mismo.
// Los cambios a una persona van con bloqueo optimista (campo v): dos códigos nuevos a la vez no devuelven uno muerto.
import { obtener, listar, guardar, fusionarSi, borrar, reemplazarSiVersion } from '../almacen.mjs';
import { HttpError, json } from '../http.mjs';
import { ROLES, generarCodigo, hashCodigo, personaPorCodigo, cookieSesion } from '../sesion.mjs';
import { norm, nuevoId, idSeguro } from '../normalizar.mjs';

const EC = ['equipo', 'cliente'];
const ORDEN_ROL = { equipo: 0, cliente: 1, closer: 2 };
const SOLO_EQUIPO = 'Solo el equipo puede cambiar a alguien del equipo';
const REPETIDO = 'Ya hay alguien activo con ese nombre';
const activa = (p) => p.activo !== false;
const publica = (p) => ({ uid: p.id, nombre: p.nombre || '', rol: p.rol, activo: activa(p) });

// un código que no tenga nadie (32^8 combinaciones: el choque es casi imposible, pero se chequea)
async function codigoLibre() {
  for (;;) {
    const c = generarCodigo();
    if (!(await personaPorCodigo(c))) return c;
  }
}

// ¿hay otra persona activa con ese nombre (comparado con norm)?
const hayOtra = async (nombre, id) => (await listar('personas')).some((p) => p.id !== id && activa(p) && norm(p.nombre) === norm(nombre));

async function laPersona(uid, yo) {
  const p = idSeguro(uid) ? await obtener('personas', uid) : null;
  if (!p) throw new HttpError(404, 'No existe esa persona');
  if (yo.rol === 'cliente' && p.rol === 'equipo') throw new HttpError(403, SOLO_EQUIPO);
  return p;
}

// Escribe sobre la versión leída; si alguien la cambió en el medio, 409 en vez de pisarla
async function cambiar(p, cambios, mensaje) {
  const v = Number.isInteger(p.v) ? p.v : 0;
  const q = await reemplazarSiVersion('personas', p.id, { ...p, ...cambios, v: v + 1 }, v);
  if (!q) throw new HttpError(409, mensaje);
  return q;
}

async function personas() {
  const ps = (await listar('personas')).filter((p) => ROLES.includes(p.rol)).map(publica);
  ps.sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol] || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  return { personas: ps };
}

async function crear(d, yo) {
  const nombre = (typeof d?.nombre === 'string' ? d.nombre : '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 2 || nombre.length > 60) throw new HttpError(400, 'El nombre va de 2 a 60 caracteres');
  const rol = d?.rol;
  if (!ROLES.includes(rol)) throw new HttpError(400, 'Elegí el rol: equipo, cliente o closer');
  if (yo.rol === 'cliente' && rol === 'equipo') throw new HttpError(403, 'Solo el equipo puede sumar a alguien del equipo');
  if (await hayOtra(nombre)) throw new HttpError(409, REPETIDO);
  const clave = await codigoLibre();
  const p = await guardar('personas', {
    id: nuevoId('u_'), nombre, rol, activo: true, codigoHash: hashCodigo(clave), sesionVer: 0, ultimoIngreso: null, v: 0,
  });
  // se mira antes de escribir y otra vez después: si otra alta con el mismo nombre entró en el medio, esta se deshace
  if (await hayOtra(nombre, p.id)) {
    await borrar('personas', p.id);
    throw new HttpError(409, REPETIDO);
  }
  return { persona: publica(p), clave };
}

// Código nuevo (o reactivar): el viejo deja de andar y se cierran todas sus sesiones (sesionVer + 1).
// Si es el propio, la respuesta ya trae la cookie nueva (el frontend igual vuelve a entrar con el código).
async function codigoNuevo(uid, yo, req) {
  const p = await laPersona(uid, yo);
  const reactiva = !activa(p);
  if (reactiva && (await hayOtra(p.nombre, p.id))) throw new HttpError(409, REPETIDO);
  const clave = await codigoLibre();
  const q = await cambiar(p, { activo: true, codigoHash: hashCodigo(clave), sesionVer: (p.sesionVer || 0) + 1 },
    'Alguien más le cambió el código: recargá Equipo');
  if (reactiva && (await hayOtra(p.nombre, p.id))) {
    await fusionarSi('personas', p.id, { activo: false, codigoHash: null, v: q.v + 1 });
    throw new HttpError(409, REPETIDO);
  }
  if (q.id !== yo.uid) return { clave };
  return json({ ok: true, clave }, { headers: { 'set-cookie': cookieSesion(q, req) } });
}

async function baja(uid, yo) {
  if (uid === yo.uid) throw new HttpError(400, 'No te podés dar de baja a vos');
  const p = await laPersona(uid, yo);
  await cambiar(p, { activo: false, codigoHash: null, sesionVer: (p.sesionVer || 0) + 1 }, 'Alguien más cambió a esta persona: recargá Equipo');
  return {};
}

async function persona({ cuerpo, yo, req }) {
  if (cuerpo.crear !== undefined) return crear(cuerpo.crear, yo);
  if (cuerpo.codigo !== undefined) return codigoNuevo(cuerpo.codigo, yo, req);
  if (cuerpo.baja !== undefined) return baja(cuerpo.baja, yo);
  throw new HttpError(400, 'Pedido inválido');
}

export const acciones = {
  personas: { roles: EC, fn: personas },
  persona: { roles: EC, fn: persona },
};
