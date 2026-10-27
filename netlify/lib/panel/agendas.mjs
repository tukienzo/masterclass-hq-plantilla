// Acciones de /api/panel sobre el pipeline (§7.4): GET (__listar), editar un campo (__editar), alta e importación
// (add) y borrar (adel). El despacho y el {ok:true} los pone functions/panel.mjs.
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { HttpError } from '../http.mjs';
import { ROLES } from '../sesion.mjs';
import { obtener, listar, guardar, fusionar, fusionarSi, borrar } from '../almacen.mjs';
import { ESTADOS, negocio, opciones } from '../config.mjs';
import { hoyLocal, esFecha, esHora } from '../fechas.mjs';
import { norm, email, tel8, monto, texto, idSeguro } from '../normalizar.mjs';
import { normalizarLibre } from '../telefono.mjs';
import { cargarRegistros } from '../registros.mjs';
import { cargarAgendas, indexarRegistros, cruzar, aFila, capitalTramo, BORRADAS } from '../pipeline.mjs';

const EC = ['equipo', 'cliente'];
// los que se editan campo por campo (y los que acepta el alta, más Estado)
const EDITABLES = ['Estado', 'Monto', 'Closer', 'Setter', 'Programa', 'Origen', 'Evento', 'Gatillo', 'Notas', 'Nombre', 'Instagram',
  'Negocio', 'Facturacion', 'Objetivo', 'Traba', 'Urgencia', 'Decisor', 'Email', 'WhatsApp', 'Capital', 'Fecha call', 'Fecha cierre', 'Hora'];
const DEL_CLOSER = ['Estado', 'Monto', 'Gatillo', 'Notas', 'Programa', 'Closer'];   // §5.5
const NO_ESTA = 'No encontré esa agenda';

const OTRO_CLOSER = 'Otro closer la tomó recién: recargá la pantalla';
const CAMBIO = 'La agenda cambió mientras guardabas: probá de nuevo';

const vacio = (v) => v == null || String(v).trim() === '';
const esSuya = (ag, yo) => !norm(ag.Closer) || norm(ag.Closer) === norm(yo.closer);
// el valor guardado tal cual, como lo compara fusionarSi ('' = vacío o ausente)
const crudo = (v) => (v == null ? '' : String(v));

async function agendaDe(row) {
  const id = typeof row === 'string' || typeof row === 'number' ? String(row) : '';
  const ag = idSeguro(id) ? await obtener('agendas', id) : null;
  if (!ag) throw new HttpError(404, NO_ESTA);
  return ag;
}

const tramosDe = (op) => (op.capitalTramos || []).map((t) => String(t.k));

// Edición campo por campo: validación estricta (§7.4.4)
function validar(campo, valor, neg, op) {
  const s = texto(valor);
  switch (campo) {
    case 'Estado':
      if (!ESTADOS.includes(s)) throw new HttpError(400, 'Estado inválido');
      return s;
    case 'Monto': {
      if (!s) return '';
      const n = monto(valor);
      if (n == null) throw new HttpError(400, 'El monto tiene que ser un número');
      return n;
    }
    case 'Origen': return s.toUpperCase();
    case 'Email': return email(s);
    case 'WhatsApp': return normalizarLibre(s, neg.pais) || s;
    case 'Capital': {
      const ks = tramosDe(op);
      if (s && !ks.includes(s)) throw new HttpError(400, `Elegí un capital de la lista: ${ks.join(', ')}`);
      return s;
    }
    case 'Fecha call':
      if (!esFecha(s)) throw new HttpError(400, 'La fecha tiene que ser AAAA-MM-DD');
      return s;
    case 'Fecha cierre':
      if (s && !esFecha(s)) throw new HttpError(400, 'La fecha de cierre tiene que ser AAAA-MM-DD');
      return s;
    case 'Hora':
      if (!esHora(s)) throw new HttpError(400, 'La hora tiene que ser HH:MM');
      return s;
    default: return s;
  }
}

// Alta e importación: solo Nombre y Fecha call dan 400; lo demás se normaliza sin rechazar (R-05)
function normalizarAlta(campo, valor, neg, op) {
  const s = texto(valor);
  switch (campo) {
    case 'Estado': return ESTADOS.includes(s) ? s : 'Pendiente';
    case 'Monto': { const n = monto(valor); return n == null ? '' : n; }
    case 'Capital': return tramosDe(op).includes(s) ? s : capitalTramo(s, op.capitalTramos);
    case 'Hora': return esHora(s) ? s : '';
    case 'Fecha cierre': return esFecha(s) ? s : '';
    default: return validar(campo, valor, neg, op);
  }
}

const escalar = (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v);

const porFechaHora = (a, b) => {
  const x = `${a['Fecha call']} ${a.Hora}`, y = `${b['Fecha call']} ${b.Hora}`;
  if (x !== y) return x < y ? -1 : 1;
  return a.Timestamp < b.Timestamp ? -1 : a.Timestamp > b.Timestamp ? 1 : a._row < b._row ? -1 : a._row > b._row ? 1 : 0;
};

// Netlify corta las respuestas de más de 6 MB (unas 5.400 agendas de calendario): desde los 4 MB la lista sale
// comprimida con gzip si el navegador la acepta (6.000 agendas ≈ 130 KB). Debajo de eso sale como siempre.
const GZIP_DESDE = 4 * 1024 * 1024;
const comprimir = promisify(gzip);
async function lista(datos, req) {
  const acepta = /\bgzip\b/i.test((req && req.headers && req.headers.get('accept-encoding')) || '');
  if (!acepta) return datos;
  const txt = JSON.stringify({ ...datos, ok: true });
  if (Buffer.byteLength(txt) < GZIP_DESDE) return datos;
  return new Response(await comprimir(txt), { headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-encoding': 'gzip', vary: 'Accept-Encoding' } });
}

// id fijo de un alta por fecha, hora y contacto: dos altas iguales a la vez (doble clic en Guardar) escriben la
// misma agenda en vez de dos (el dedupe de abajo no alcanza a ver la otra)
const idAlta = (fecha, hora, e, t) => 'ag_' + createHash('sha256')
  .update(['alta', fecha, hora, e ? 'e:' + e : 't:' + t].join('|')).digest('hex').slice(0, 20);

export const acciones = {
  // GET /api/panel: dos lecturas (agendas y registros) y el cruce en memoria. Sin registros, igual sale el pipeline.
  __listar: {
    roles: ROLES,
    fn: async ({ req }) => {
      const [agendas, regs] = await Promise.all([
        cargarAgendas(),
        Promise.resolve().then(() => cargarRegistros()).catch((e) => { console.error('pipeline: no pude leer los registros', e); return []; }),
      ]);
      const indice = indexarRegistros(Array.isArray(regs) ? regs : []);
      const rows = agendas.map((a) => aFila(a, cruzar(a, indice))).sort(porFechaHora);
      return lista({ estados: [...ESTADOS], rows }, req);
    },
  },

  // POST {row, field, value}. Se escribe con fusionarSi: nunca recrea una agenda borrada en el medio (404) y, si es un
  // closer, solo si sigue siendo suya o sin closer: dos closers que la toman a la vez → entra uno y el otro recibe 409.
  __editar: {
    roles: ROLES,
    fn: async ({ cuerpo, yo }) => {
      const { row, field, value } = cuerpo;
      if (typeof field !== 'string' || !EDITABLES.includes(field)) throw new HttpError(400, 'Ese campo no se puede editar');
      if (!escalar(value)) throw new HttpError(400, 'Pedido inválido');
      let ag = await agendaDe(row);
      const closer = yo.rol === 'closer';
      if (closer && !esSuya(ag, yo)) throw new HttpError(403, 'Esa agenda es de otro closer');
      if (closer && !DEL_CLOSER.includes(field)) throw new HttpError(403, 'Ese campo no lo podés cambiar');
      const [neg, op] = await Promise.all([negocio(), opciones()]);
      let valor = validar(field, value, neg, op);
      if (closer && field === 'Closer') {
        if (valor && norm(valor) !== norm(yo.closer)) throw new HttpError(403, 'Ese campo no lo podés cambiar');
        valor = valor ? yo.closer : '';
      }
      for (let intento = 0; intento < 3; intento++) {
        const cambios = { [field]: valor }, si = {};
        // §5.5 al escribir: Closer vacío, el que se leyó (ya pasó esSuya) o el suyo
        if (closer) si.Closer = ['', crudo(ag.Closer), yo.closer];
        // Fecha cierre se completa solo si sigue vacía (una puesta a mano en el medio no se pisa)
        if (field === 'Estado' && valor === 'Cerrada' && vacio(ag['Fecha cierre'])) {
          cambios['Fecha cierre'] = hoyLocal(neg.zona);
          si['Fecha cierre'] = ['', crudo(ag['Fecha cierre'])];
        }
        if (await fusionarSi('agendas', ag.id, cambios, Object.keys(si).length ? si : null)) return {};
        const ahora = await obtener('agendas', ag.id);
        if (!ahora) throw new HttpError(404, NO_ESTA);
        if (closer && !esSuya(ahora, yo)) throw new HttpError(409, OTRO_CLOSER);
        ag = ahora;   // cambió otra cosa de la condición: se decide de nuevo con lo que hay
      }
      throw new HttpError(409, CAMBIO);
    },
  },

  // POST {action:'add', ...campos}: alta manual o una fila del import (hasta 100 en serie), con dedupe.
  // El alta acepta cualquier Closer, también de un closer (§5.4: add es T; §5.5 limita la edición, no el alta).
  add: {
    roles: ROLES,
    fn: async ({ cuerpo, yo }) => {
      const nombre = escalar(cuerpo.Nombre) ? texto(cuerpo.Nombre) : '';
      if (!nombre) throw new HttpError(400, 'Falta el nombre');
      const fecha = escalar(cuerpo['Fecha call']) ? texto(cuerpo['Fecha call']) : '';
      if (!esFecha(fecha)) throw new HttpError(400, 'Falta la fecha de la llamada');
      const [neg, op] = await Promise.all([negocio(), opciones()]);
      const data = {};
      for (const c of EDITABLES) {
        if (c === 'Nombre' || c === 'Fecha call' || !Object.hasOwn(cuerpo, c) || !escalar(cuerpo[c])) continue;
        const v = normalizarAlta(c, cuerpo[c], neg, op);
        if (!vacio(v)) data[c] = v;
      }
      Object.assign(data, { Nombre: nombre, 'Fecha call': fecha, Estado: data.Estado || 'Pendiente' });
      if (yo.rol === 'closer' && data.Closer && norm(data.Closer) === norm(yo.closer)) data.Closer = yo.closer;
      if (data.Estado === 'Cerrada' && !data['Fecha cierre']) data['Fecha cierre'] = hoyLocal(neg.zona);

      // misma Fecha call, mismo email o tel8 y la misma hora (o alguna de las dos sin hora) → se completan los campos
      // vacíos de la que ya estaba. Con otra hora es otra llamada (re-agendó el mismo día) y va como alta.
      const e = data.Email || '', t = tel8(data.WhatsApp), hora = data.Hora || '';
      if (e || t) {
        const mismas = await listar('agendas', { donde: { 'Fecha call': fecha } });
        let dup = mismas.find((a) => ((e && email(a.Email) === e) || (t && tel8(a.WhatsApp) === t))
          && (!hora || !a.Hora || a.Hora === hora));
        // se completan solo los campos que siguen vacíos al escribir; si la borraron en el medio, va como alta nueva
        for (let intento = 0; dup; intento++) {
          if (intento === 3) throw new HttpError(409, CAMBIO);
          const llenar = Object.fromEntries(Object.entries(data).filter(([k]) => vacio(dup[k])));
          const si = {};
          if (yo.rol === 'closer') {
            // §5.5: un closer completa solo lo que puede editar, en agendas suyas o sin closer, y Closer solo con su nombre
            if (!esSuya(dup, yo)) return { row: dup.id, duplicada: true };
            for (const k of Object.keys(llenar)) if (!DEL_CLOSER.includes(k)) delete llenar[k];
            if (llenar.Closer && norm(llenar.Closer) !== norm(yo.closer)) delete llenar.Closer;
            si.Closer = ['', crudo(dup.Closer), yo.closer];
          }
          if (!Object.keys(llenar).length) return { row: dup.id, duplicada: true };
          for (const k of Object.keys(llenar)) si[k] = ['', crudo(dup[k])];
          if (await fusionarSi('agendas', dup.id, llenar, si)) return { row: dup.id, duplicada: true };
          dup = await obtener('agendas', dup.id);
        }
      }
      // el Timestamp del cliente viene en UTC sin T: se guarda el del servidor
      const doc = { ...data, Timestamp: new Date().toISOString(), CalendlyID: '', _fuente: 'manual' };
      if (e || t) {
        const id = idAlta(fecha, hora, e, t);
        // si ya existe con ese id es otra agenda (le cambiaron el contacto o la hora después): va con id nuevo
        if (!(await obtener('agendas', id))) {
          await fusionar('agendas', id, doc);
          return { row: id };
        }
      }
      const nueva = await guardar('agendas', doc, { prefijo: 'ag_' });
      return { row: nueva.id };
    },
  },

  // POST {action:'adel', row}. Si vino de un calendario, se anota su fuenteId para que el sync no la vuelva a traer.
  adel: {
    roles: EC,
    fn: async ({ cuerpo }) => {
      const ag = await agendaDe(cuerpo.row);
      if (ag.fuenteId) await fusionar('ajustes', BORRADAS, { [String(ag.fuenteId)]: new Date().toISOString() });
      await borrar('agendas', ag.id);
      return {};
    },
  },
};
