// POST /.netlify/functions/icp-generar-background?w=<w>&pid=<pid> — arma los perfiles de comprador con Claude
// (§7.9.2). Background por el sufijo del nombre y SIN config.path (D11-D12): Netlify responde 202 al instante.
// Nunca tira (si tira, Netlify la reintenta): todo error queda escrito en icp-ia/<w> con el pid pedido.
import { query } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { obtener, fusionar, incrementar, reemplazarSiVersion } from '../lib/almacen.mjs';
import { leerIntegracion } from '../lib/integraciones/estado.mjs';
import { armarICP, pedidoIA, validarIA, alcanceValido } from '../lib/icp-core.mjs';
import { generarPerfiles } from '../lib/integraciones/llm.mjs';

const RE_PID = /^[a-z0-9]{6,32}$/;
const FINALES = ['done', 'error'];
const ahora = () => new Date().toISOString();

async function correr(req) {
  // solo POST: un GET llega con la cookie en una navegación desde otro sitio (SameSite=Lax) y gastaría la clave
  if (req.method !== 'POST') return;
  try { await requerir(req, ['equipo', 'cliente']); } catch { return; }
  const q = query(req);
  const w = q.get('w') || 'todos', pid = q.get('pid') || '';
  if (!RE_PID.test(pid) || !alcanceValido(w)) return;

  // nro = orden de arranque de este cálculo (atómico); el estado guarda el nro de quien lo escribió
  const nro = await incrementar('icp-ia', w, 'corridas');
  await fusionar('icp-ia', w, { estado: 'working', pid, desde: ahora(), error: '', nro });
  // Cada cálculo deja su resultado con su pid, aunque otro siga corriendo (así su pestaña lo ve). Solo no pisa el
  // resultado de uno que arrancó después. La escritura es condicional (v): si otro escribió en el medio, se relee.
  const terminar = async (parcial) => {
    for (let i = 0; i < 6; i++) {
      const actual = await obtener('icp-ia', w);
      if (!actual) return;   // se borró el webinar mientras tanto
      if (FINALES.includes(actual.estado) && (Number(actual.nro) || 0) > nro) return;
      const v = Number(actual.v) || 0;
      if (await reemplazarSiVersion('icp-ia', w, { ...actual, ...parcial, pid, nro, v: v + 1 }, v)) return;
    }
    console.error('icp-generar-background: no pude guardar el estado de', w, '(muchas escrituras encimadas)');
  };

  try {
    const integ = await leerIntegracion('ia');
    if (!integ.conectada || !integ.clave) return terminar({ estado: 'error', error: 'Falta la clave de Anthropic en Integraciones' });
    if (w !== 'todos' && !(await obtener('webinars', w))) return terminar({ estado: 'error', error: 'No encontré ese webinar: elegí otro y probá de nuevo' });
    const datos = await armarICP(w);
    if (!datos.icp.base.registros.n && !datos.icp.base.pipeline.n) {
      return terminar({ estado: 'error', error: 'Todavía no hay registros ni agendas para armar perfiles' });
    }
    const pedido = pedidoIA(datos);
    let r;
    try {
      r = await generarPerfiles(pedido, integ.clave, { modelo: integ.modelo });
    } catch (e) {
      return terminar({ estado: 'error', error: String(e?.message || 'La IA no respondió: probá de nuevo').slice(0, 200) });
    }
    return terminar({ estado: 'done', error: '', resultado: { ...validarIA(r, pedido), generado_at: ahora() } });
  } catch (e) {
    console.error('icp-generar-background:', e?.message || e);
    return terminar({ estado: 'error', error: 'Algo falló armando los perfiles: probá de nuevo' });
  }
}

export default async (req) => {
  try {
    await correr(req);
  } catch (e) {
    console.error('icp-generar-background (sin poder guardar el estado):', e?.message || e);
  }
  return new Response(null, { status: 202 });
};
