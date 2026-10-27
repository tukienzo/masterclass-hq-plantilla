// Programada cada 15 min (UTC, §7.5.3): el mismo sync que el botón "Sincronizar", con 25 s de presupuesto
// (las programadas cortan a los 30 s). Guarda el estado que lee GET /api/agendas-sync. Nunca tira.
import { json } from '../lib/http.mjs';
import { sincronizar } from '../lib/pipeline.mjs';

export default async () => {
  try {
    return json({ ok: true, ...(await sincronizar({ presupuestoMs: 25000 })) });
  } catch (e) {
    console.error('agendas-sync-cron:', e);
    return json({ ok: false, error: 'La sincronización falló: se reintenta en 15 minutos' }, { status: 500 });
  }
};

export const config = { schedule: '*/15 * * * *' };
