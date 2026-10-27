// Programada cada 10 minutos (UTC): reintenta los envíos de registros que fallaron (ActiveCampaign y Meta CAPI)
// y limpia contadores viejos. Tiene 30 s: la limpieza va primero y la cola usa lo que queda hasta los 25 s.
import { json } from '../lib/http.mjs';
import { borrarViejos } from '../lib/almacen.mjs';
import { procesarCola } from '../lib/envios.mjs';

const HORA = 3600000;
const LIMPIEZA = [
  ['limites', 48 * HORA],   // límites de intentos por IP y candados de /api/registro
  ['cache', 24 * HORA],     // respuestas de Meta guardadas
  ['cola', 7 * 24 * HORA],  // envíos que se dejaron de reintentar o quedaron esperando una integración incompleta
];

export default async () => {
  const t0 = Date.now();
  const r = { procesados: 0, errores: 0, descartados: 0, borrados: {} };
  await Promise.all(LIMPIEZA.map(async ([col, ms]) => {
    try { r.borrados[col] = await borrarViejos(col, new Date(t0 - ms).toISOString()); }
    catch (e) { console.error(`envios-cron: no se pudo limpiar ${col}:`, e?.message || e); }
  }));
  try {
    Object.assign(r, await procesarCola({ max: 40, presupuestoMs: Math.max(5000, 25000 - (Date.now() - t0)) }));
  } catch (e) {
    console.error('envios-cron:', e?.message || e);
  }
  return json({ ok: true, ...r });
};

export const config = { schedule: '*/10 * * * *' };
