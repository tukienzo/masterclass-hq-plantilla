// /api/agendas-sync (§7.5): GET = estado de la última corrida; POST = sincronizar iClosed y Calendly ya.
// Ojo, las dos formas son distintas (el frontend usa fetch crudo): GET {ok, estado} y POST {ok, cuando, iclosed, calendly}.
import { manejar, json, metodo } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { obtener } from '../lib/almacen.mjs';
import { sincronizar } from '../lib/pipeline.mjs';

export default manejar(async (req) => {
  metodo(req, ['GET', 'POST']);
  await requerir(req);
  if (req.method === 'GET') {
    const doc = await obtener('ajustes', 'sync-agendas');
    if (!doc) return json({ ok: true, estado: null });
    const { id, creado, actualizado, ...estado } = doc;
    return json({ ok: true, estado });
  }
  // sincrónica (60 s en Netlify): 20 s para las fuentes y la escritura; lo que no entra lo termina el cron
  const estado = await sincronizar({ presupuestoMs: 20000 });
  return json({ ok: true, ...estado });
});

export const config = { path: '/api/agendas-sync', method: ['GET', 'POST'] };
