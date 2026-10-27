// /api/app: inicio, webinar (la ficha), proyectar, guardarWebinar, activar, borrarWebinar y tarea (§7.3.1-7.3.7).
// Los cambios a un webinar van con bloqueo optimista (campo v): dos tildes seguidos de la checklist no se pisan.
import { purgeCache } from '@netlify/functions';
import { obtener, guardar, borrar, reemplazarSiVersion } from '../almacen.mjs';
import { HttpError } from '../http.mjs';
import { negocio, opciones, webinarActivoId, fijarWebinarActivo } from '../config.mjs';
import { hoyLocal, esFecha, esHora, difDias } from '../fechas.mjs';
import { texto, slug, azar } from '../normalizar.mjs';
import { leerIntegracion } from '../integraciones/estado.mjs';
import { obtenerWebinar, listarWebinars, duracionDe } from '../webinars.mjs';
import { calcular, parsearEntrada } from '../proyeccion.mjs';
import { armarTareas, ordenar, progreso, correrFechas, nuevaTarea } from '../checklist.mjs';
import { LANDING_DEFECTO, parsearLanding, completarLanding } from '../landing.mjs';

const T = ['equipo', 'cliente', 'closer'];
const EC = ['equipo', 'cliente'];
const NO_EXISTE = 'No existe ese webinar';
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

// /api/publico cachea 60 s en el CDN: al cambiar lo que muestra la landing se purga (en local no hace nada)
async function purgarPublico() {
  try { await purgeCache({ tags: ['publico'] }); } catch (e) { console.warn('purgeCache:', e.message); }
}

// el activo, solo si existe ese webinar
async function activoValido() {
  const id = await webinarActivoId();
  return id && (await obtenerWebinar(id)) ? id : null;
}

/* ── validaciones de lo que manda el editor ── */
// Texto de un campo: string o número; null/undefined = ''. Un objeto o array no es texto: tira 400 con el mensaje del campo.
function str(v, mensaje) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  throw new HttpError(400, mensaje);
}
function nombreDe(v) {
  const n = str(v, 'Poné el nombre del webinar');
  if (!n) throw new HttpError(400, 'Poné el nombre del webinar');
  if (n.length > 120) throw new HttpError(400, 'El nombre puede tener hasta 120 caracteres');
  return n;
}
function fechaDe(v) {
  const f = str(v, 'Elegí la fecha del vivo');
  if (!esFecha(f)) throw new HttpError(400, 'Elegí la fecha del vivo');
  return f;
}
// 'HH:MM' (acepta '9:00' y 'HH:MM:SS'); '' → ''
function horaDe(v, mensaje) {
  const s = str(v, mensaje);
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  const h = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  if (!esHora(h)) throw new HttpError(400, mensaje);
  return h;
}
// null o sin fecha → sin pop-up; con fecha y sin hora → la hora del vivo
function popupDe(p, horaVivo) {
  const o = objeto(p);
  const fecha = str(o?.fecha, 'Revisá la fecha del pop-up');
  if (!fecha) return null;
  if (!esFecha(fecha)) throw new HttpError(400, 'Revisá la fecha del pop-up');
  return { fecha, hora: horaDe(o.hora, 'Revisá la hora del pop-up (HH:MM)') || horaVivo };
}
// entero como número o como dígitos ('7'); '0x10', '1e1', '7.5' o [8] no
function enteroDe(v, min, max, mensaje) {
  const s = typeof v === 'string' ? v.trim() : '';
  const n = typeof v === 'number' ? v : /^\d+$/.test(s) ? Number(s) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, mensaje);
  return n;
}

/* ── la ficha (§7.3.2) ── */
// neg: para la duración de un webinar que no tiene la suya (la del negocio, como /api/publico y /api/registro)
function vista(w, neg) {
  const popup = objeto(w.popup);
  return {
    id: w.id, nombre: w.nombre || '', fecha: w.fecha, hora: w.hora,
    popup: popup && esFecha(popup.fecha) ? { fecha: popup.fecha, hora: popup.hora || w.hora } : null,
    formato: w.formato || '', cierre: w.cierre || '', ventana: Number(w.ventana) || 10,
    etiqueta: w.etiqueta || `webinar-${w.fecha}`, duracionMin: duracionDe(w, neg),
    proyeccion: parsearEntrada(w.proyeccion), tareas: ordenar(w.tareas), landing: completarLanding(w.landing),
  };
}

async function ficha(w) {
  const [neg, ops, activo] = await Promise.all([negocio(), opciones(), webinarActivoId()]);
  const v = vista(w, neg);
  return { webinar: v, proyeccion: calcular(v.proyeccion, ops.vara), progreso: progreso(v.tareas, hoyLocal(neg.zona)), activo: activo === w.id };
}

// Lee, aplica `cambio` sobre una copia y guarda solo si nadie lo cambió en el medio (si no, espera un poco al azar
// y reintenta: así varios tildes seguidos entran todos)
const esperar = (i) => new Promise((r) => setTimeout(r, Math.random() * 25 * (i + 1)));
async function cambiarWebinar(id, cambio) {
  for (let i = 0; i < 12; i++) {
    if (i) await esperar(i);
    const w = await obtenerWebinar(id);
    if (!w) throw new HttpError(404, NO_EXISTE);
    const v = Number.isInteger(w.v) ? w.v : 0;
    const nuevo = await cambio(structuredClone(w));
    const r = await reemplazarSiVersion('webinars', id, { ...nuevo, v: v + 1 }, v);
    if (r) return r;
  }
  throw new HttpError(409, 'Alguien más estaba guardando este webinar: probá de nuevo');
}

/* ── guardarWebinar: crear, datos, proyección o landing (§7.3.5) ── */
async function crear(d) {
  const [neg, ops, activo] = await Promise.all([negocio(), opciones(), activoValido()]);
  const nombre = nombreDe(d.nombre);
  const fecha = fechaDe(d.fecha);
  const hora = horaDe(d.hora, 'Revisá la hora del vivo (HH:MM)') || neg.horaPorDefecto;
  const popup = popupDe(d.popup, hora);
  const base = activo ? (await obtenerWebinar(activo))?.landing : null;
  let id;
  do id = `w${fecha.replace(/-/g, '')}${azar(4)}`; while (await obtener('webinars', id));
  const w = await guardar('webinars', {
    id, nombre, fecha, hora, popup, formato: ops.formatos[0], cierre: ops.cierres[0], ventana: 10,
    etiqueta: `webinar-${fecha}`, duracionMin: neg.duracionMin, proyeccion: {}, tareas: armarTareas(fecha, 10),
    landing: completarLanding(structuredClone(base || LANDING_DEFECTO)), v: 0,
  });
  if (!activo) { await fijarWebinarActivo(id); await purgarPublico(); }
  return w;
}

async function datos(d) {
  const ops = await opciones();
  return cambiarWebinar(d.id, (w) => {
    if (d.nombre !== undefined) w.nombre = nombreDe(d.nombre);
    if (d.fecha !== undefined) {
      const f = fechaDe(d.fecha);
      if (esFecha(w.fecha) && f !== w.fecha) w.tareas = correrFechas(w.tareas, difDias(w.fecha, f));
      w.fecha = f;
    }
    if (d.hora !== undefined) w.hora = horaDe(d.hora, 'Revisá la hora del vivo (HH:MM)') || w.hora;
    if (d.popup !== undefined) w.popup = popupDe(d.popup, w.hora);
    if (d.formato !== undefined) {
      if (!ops.formatos.includes(d.formato)) throw new HttpError(400, 'Elegí un formato de la lista');
      w.formato = d.formato;
    }
    if (d.cierre !== undefined) {
      if (!ops.cierres.includes(d.cierre)) throw new HttpError(400, 'Elegí un cierre de la lista');
      w.cierre = d.cierre;
    }
    if (d.ventana !== undefined) w.ventana = enteroDe(d.ventana, 1, 60, 'La ventana va de 1 a 60 días');
    if (d.etiqueta !== undefined) w.etiqueta = slug(str(d.etiqueta, 'Revisá la etiqueta')) || `webinar-${w.fecha}`;
    if (d.duracionMin !== undefined) w.duracionMin = enteroDe(d.duracionMin, 30, 600, 'La duración va de 30 a 600 minutos');
    return w;
  });
}

async function guardarWebinar({ cuerpo }) {
  const d = objeto(cuerpo.webinar);
  if (!d) throw new HttpError(400, 'Pedido inválido');
  if (d.id == null || d.id === '') return ficha(await crear(d));

  const tocaProy = d.proyeccion !== undefined, tocaLanding = d.landing !== undefined;
  if (tocaLanding && !objeto(d.landing)) throw new HttpError(400, 'Pedido inválido');
  let w;
  if (tocaProy || tocaLanding) {
    w = await cambiarWebinar(d.id, (x) => {
      if (tocaProy) x.proyeccion = parsearEntrada(d.proyeccion);
      if (tocaLanding) x.landing = parsearLanding(d.landing, x.landing);
      return x;
    });
  } else {
    w = await datos(d);
  }
  // lo que cambia en la landing pública (textos, fecha, hora, formato) aparece en menos de un minuto
  if ((tocaLanding || !tocaProy) && (await webinarActivoId()) === w.id) await purgarPublico();
  return ficha(w);
}

/* ── activar y borrar (§7.3.6) ── */
async function activar({ cuerpo }) {
  const w = await obtenerWebinar(cuerpo.id);
  if (!w) throw new HttpError(404, NO_EXISTE);
  await fijarWebinarActivo(w.id);
  await purgarPublico();
  return {};
}

async function borrarWebinar({ cuerpo }) {
  const w = await obtenerWebinar(cuerpo.id);
  if (!w) throw new HttpError(404, NO_EXISTE);
  const eraActivo = (await webinarActivoId()) === w.id;
  await borrar('webinars', w.id);
  // los registros quedan con su w (siguen contando en "todos"); la asistencia y el ICP de ese webinar se van
  await Promise.all([borrar('webinar-asistencia', w.id), borrar('icp-ia', w.id)]);
  if (eraActivo) {
    const [neg, ws] = await Promise.all([negocio(), listarWebinars()]);
    const hoy = hoyLocal(neg.zona);
    const otro = ws.find((x) => String(x.fecha) >= hoy) || ws.at(-1) || null;
    await fijarWebinarActivo(otro ? otro.id : null);
    await purgarPublico();
  }
  return {};
}

/* ── la checklist (§7.3.7) ── */
async function tarea({ cuerpo: c }) {
  const w = await cambiarWebinar(c.id, (x) => {
    let ts = Array.isArray(x.tareas) ? x.tareas : [];
    if (c.tarea !== undefined) {
      const t = ts.find((y) => y.id === c.tarea);
      if (!t) throw new HttpError(404, 'No existe esa tarea');
      t.hecha = c.hecha === true;
    } else if (c.borrar !== undefined) {
      ts = ts.filter((y) => y.id !== c.borrar);
    } else if (objeto(c.nueva)) {
      const n = c.nueva;
      const t = str(n.texto, 'Escribí la tarea');
      if (!t) throw new HttpError(400, 'Escribí la tarea');
      if (t.length > 200) throw new HttpError(400, 'La tarea puede tener hasta 200 caracteres');
      const bloque = texto(str(n.bloque, 'Escribí el bloque como texto'), 80) || 'Otras';
      // vence vacío o inválido (también si no es texto) → el día del vivo
      const vence = typeof n.vence === 'string' ? n.vence.trim() : '';
      ts.push(nuevaTarea({ bloque, texto: t, vence: esFecha(vence) ? vence : x.fecha }));
    } else {
      throw new HttpError(400, 'Pedido inválido');
    }
    x.tareas = ordenar(ts);
    return x;
  });
  const neg = await negocio();
  const tareas = ordenar(w.tareas);
  return { tareas, progreso: progreso(tareas, hoyLocal(neg.zona)) };
}

/* ── inicio (§7.3.1): barato, lo piden base.js y mhq.js en cada arranque ── */
async function inicio({ yo }) {
  const [neg, ops, ws, meta, activo] = await Promise.all([negocio(), opciones(), listarWebinars(), leerIntegracion('meta'), webinarActivoId()]);
  return {
    // horaPorDefecto: la que propone el formulario de webinar nuevo (WEBINAR_HORA o ajustes/negocio, '20:00' si no)
    cliente: { nombre: neg.nombre, color: neg.color, moneda: neg.moneda, zona: neg.zona, locale: neg.locale, pais: neg.pais,
      prefijoTel: neg.prefijoTel, horaPorDefecto: neg.horaPorDefecto },
    yo: { uid: yo.uid, nombre: yo.nombre, rol: yo.rol },
    webinars: ws.slice().reverse().map((w) => {
      const p = objeto(w.popup);
      return { id: w.id, nombre: w.nombre || '', fecha: w.fecha, hora: w.hora, popup: p && esFecha(p.fecha) ? { fecha: p.fecha, hora: p.hora || w.hora } : null };
    }),
    webinarActivo: ws.some((w) => w.id === activo) ? activo : null,
    metaPrueba: !!meta.testCode,
    opciones: { formatos: ops.formatos, cierres: ops.cierres, vara: ops.vara, roles: ops.roles, origenesPauta: ops.origenesPauta },
  };
}

async function webinar({ cuerpo }) {
  const w = await obtenerWebinar(cuerpo.id);
  if (!w) throw new HttpError(404, NO_EXISTE);
  return ficha(w);
}

async function proyectar({ cuerpo }) {
  const ops = await opciones();
  return { proyeccion: calcular(parsearEntrada(cuerpo.proyeccion), ops.vara) };
}

export const acciones = {
  inicio: { roles: T, fn: inicio },
  webinar: { roles: T, fn: webinar },
  proyectar: { roles: T, fn: proyectar },
  guardarWebinar: { roles: EC, fn: guardarWebinar },
  activar: { roles: EC, fn: activar },
  borrarWebinar: { roles: EC, fn: borrarWebinar },
  tarea: { roles: EC, fn: tarea },
};
