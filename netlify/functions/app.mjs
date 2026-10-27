// /api/app — despachador de las acciones de la app ({accion, ...}). Cada módulo de lib/app/ exporta
// `acciones = { nombre: { roles, fn } }`; acá se arma la unión, se chequea el rol y se envuelve en {ok:true}.
import { manejar, json, leerJSON, metodo, HttpError } from '../lib/http.mjs';
import { requerir, ROLES } from '../lib/sesion.mjs';
import * as webinars from '../lib/app/webinars.mjs';
import * as personas from '../lib/app/personas.mjs';
import * as registros from '../lib/app/registros.mjs';
import * as integraciones from '../lib/app/integraciones.mjs';

const ACCIONES = { ...webinars.acciones, ...personas.acciones, ...registros.acciones, ...integraciones.acciones };

export default manejar(async (req, context) => {
  metodo(req, ['POST']);
  const cuerpo = await leerJSON(req);
  const nombre = typeof cuerpo.accion === 'string' ? cuerpo.accion : '';
  const a = nombre && !nombre.startsWith('__') && Object.hasOwn(ACCIONES, nombre) ? ACCIONES[nombre] : null;
  if (!a) throw new HttpError(400, 'Acción desconocida');
  const yo = await requerir(req, a.roles || ROLES);
  const r = await a.fn({ cuerpo, yo, req, context });
  return r instanceof Response ? r : json({ ...(r || {}), ok: true });
});

export const config = { path: '/api/app', method: ['POST'] };
