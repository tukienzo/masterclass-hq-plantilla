// /api/icp?w=<webinarId|todos> — UTM's, Trazabilidad e ICP (§7.9.1): agregados de registros y pipeline, los
// recorridos de cada persona y el estado de los perfiles con IA. La respuesta trae `w` igual al pedido: las tres
// pantallas descartan una respuesta de otro alcance.
import { manejar, json, metodo, query } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { armarICP, estadoIA } from '../lib/icp-core.mjs';

export default manejar(async (req) => {
  metodo(req, ['GET']);
  await requerir(req, ['equipo', 'cliente']);
  const w = query(req).get('w') || 'todos';
  const datos = await armarICP(w);
  const ia = await estadoIA(w, datos);
  return json({ ok: true, w, ...datos, ia });
});

export const config = { path: '/api/icp', method: ['GET'] };
