// /api/panel — el pipeline de agendas. GET = la lista (agendas.__listar); POST {row, field, value} = editar un
// campo (agendas.__editar); POST {action, ...} = la acción con ese nombre de lib/panel/agendas o finanzas.
import { manejar, json, leerJSON, metodo, HttpError } from '../lib/http.mjs';
import { requerir, ROLES } from '../lib/sesion.mjs';
import * as agendas from '../lib/panel/agendas.mjs';
import * as finanzas from '../lib/panel/finanzas.mjs';

// las que empiezan con __ son internas: no se piden por nombre
const PUBLICAS = Object.fromEntries(Object.entries({ ...agendas.acciones, ...finanzas.acciones }).filter(([k]) => !k.startsWith('__')));
const interna = (k) => (Object.hasOwn(agendas.acciones, k) ? agendas.acciones[k] : null);

export default manejar(async (req, context) => {
  metodo(req, ['GET', 'POST']);
  let a = null, cuerpo = {};
  if (req.method === 'GET') {
    a = interna('__listar');
  } else {
    cuerpo = await leerJSON(req);
    if (typeof cuerpo.action === 'string' && cuerpo.action) a = Object.hasOwn(PUBLICAS, cuerpo.action) ? PUBLICAS[cuerpo.action] : null;
    else if ('row' in cuerpo && 'field' in cuerpo) a = interna('__editar');
    else throw new HttpError(400, 'Pedido inválido');
  }
  if (!a) throw new HttpError(400, 'Acción desconocida');
  const yo = await requerir(req, a.roles || ROLES);
  const r = await a.fn({ cuerpo, yo, req, context });
  return r instanceof Response ? r : json({ ...(r || {}), ok: true });
});

export const config = { path: '/api/panel', method: ['GET', 'POST'] };
