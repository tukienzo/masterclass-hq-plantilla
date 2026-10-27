// Calendly (§8.4): probar el token y traer las reservas (eventos e invitados) para el sync de agendas (§7.5.4).
// Bearer <token>, base https://api.calendly.com. Con fetch y timeout; ningún secreto se loguea.
// Los Error que tira llevan legible: true (el mensaje es para la persona); el sync muestra solo esos.

const BASE = 'https://api.calendly.com';
const NO_RESPONDE = 'El servicio no respondió: probá de nuevo';
const SIN_PERMISO = 'Calendly no deja hacer este pedido con esta clave: revisá los permisos de la cuenta';
// listar los eventos de una organización (organization=) pide ser admin o dueño de la organización en Calendly
const SIN_PERMISO_ORG = 'Calendly no deja ver los eventos de la organización con esta cuenta: conectá la clave de un admin o del dueño';
const MAX_TIMEOUT = 15000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const legible = (mensaje) => Object.assign(new Error(mensaje), { legible: true });

// GET con presupuesto: {datos} | {corte:true} (se acabó el tiempo o un 429 que se repitió). Errores → Error legible.
// 401 = la clave no sirve; 403 = la clave sirve pero no alcanza para ese pedido (mensaje propio con sin403).
async function pedir(url, clave, limite, sin403 = SIN_PERMISO) {
  for (let intento = 0; ; intento++) {
    const resta = limite - Date.now();
    if (resta < 800) return { corte: true };
    let r;
    try {
      r = await fetch(url, {
        headers: { Authorization: 'Bearer ' + clave, Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.min(MAX_TIMEOUT, resta)),
      });
    } catch {
      if (Date.now() >= limite - 100) return { corte: true };
      throw legible(NO_RESPONDE);
    }
    if (r.status === 429) {
      const h = r.headers.get('retry-after');
      const espera = Math.min(3000, h != null && Number.isFinite(Number(h)) ? Math.max(0, Number(h)) * 1000 : 3000);
      if (intento || Date.now() + espera > limite - 800) return { corte: true };
      await dormir(espera);
      continue;
    }
    if (r.status === 401) throw legible('La clave no es válida');
    if (r.status === 403) throw legible(sin403);
    if (r.status >= 500) throw legible(NO_RESPONDE);
    let datos = null;
    try { datos = await r.json(); } catch { if (r.ok) throw legible(NO_RESPONDE); }
    if (!r.ok) {
      const m = String((datos && (datos.message || datos.title)) || '').slice(0, 140);
      throw legible(`Calendly rechazó el pedido (${r.status})${m ? ': ' + m : ''}`);
    }
    return { datos: datos || {} };
  }
}

async function yo(clave, limite) {
  const r = await pedir(BASE + '/users/me', clave, limite);
  if (r.corte) throw legible('Calendly está limitando los pedidos: probá en un minuto');
  const u = (r.datos && r.datos.resource) || {};
  if (!u.current_organization) throw legible('Calendly no devolvió la organización del usuario');
  return u;
}

// cred = {clave} → {detalle, extra: {org, usuario}}
export async function probar(cred) {
  const clave = String((cred && cred.clave) || '').trim();
  if (!clave) throw legible('Pegá la clave');
  const u = await yo(clave, Date.now() + MAX_TIMEOUT);
  const usuario = String(u.name || u.email || '').trim();
  return { detalle: usuario ? `Usuario ${usuario}` : 'Conectada', extra: { org: String(u.current_organization), usuario } };
}

const uuid = (uri) => String(uri || '').split('/').filter(Boolean).pop() || '';

function aReserva(ev, inv) {
  const id = uuid(inv.uri);
  if (!id) return null;
  const tr = inv.tracking || {};
  return {
    fuenteId: 'calendly:' + id,
    CalendlyID: id,
    Nombre: String(inv.name || [inv.first_name, inv.last_name].filter(Boolean).join(' ')).trim(),
    Email: String(inv.email || ''),
    WhatsApp: String(inv.text_reminder_number || ''),
    inicio: ev.start_time,
    Evento: String(ev.name || ''),
    Closer: String((ev.event_memberships && ev.event_memberships[0] && ev.event_memberships[0].user_name) || ''),
    Timestamp: String(inv.created_at || ''),
    cancelada: inv.status === 'canceled' || ev.status === 'canceled',
    respuestas: (inv.questions_and_answers || []).map((x) => ({ pregunta: String((x && x.question) || ''), respuesta: String((x && x.answer) || '') })),
    utm: { utm_source: tr.utm_source || '', utm_medium: tr.utm_medium || '', utm_campaign: tr.utm_campaign || '', utm_content: tr.utm_content || '', utm_term: tr.utm_term || '' },
    eventoActualizado: String(ev.updated_at || ''),
    eventoUri: String(ev.uri || ''),
  };
}

// Los invitados de un evento, todas las páginas. null = se cortó a la mitad (el evento queda para la próxima).
async function invitados(ev, clave, limite) {
  const out = [];
  let token = '';
  do {
    const q = new URLSearchParams({ count: '100' });
    if (token) q.set('page_token', token);
    const r = await pedir(`${ev.uri}/invitees?${q}`, clave, limite);
    if (r.corte) return null;
    out.push(...(r.datos.collection || []));
    token = (r.datos.pagination && r.datos.pagination.next_page_token) || '';
  } while (token);
  return out;
}

// opciones = {desde, hasta (ISO), presupuestoMs, vistos: Map uri del evento → updated_at ya procesado}
// → {reservas, parcial}. Si algo falla tira Error(mensaje) con e.reservas = lo que ya había llegado.
export async function traer({ desde, hasta, presupuestoMs = 20000, vistos = new Map() } = {}, integ) {
  const limite = Date.now() + presupuestoMs;
  const clave = integ.clave;
  const reservas = [];
  let parcial = false;
  try {
    const org = integ.org || (await yo(clave, limite)).current_organization;
    let token = '';
    pagina: do {
      const q = new URLSearchParams({ organization: org, min_start_time: desde, max_start_time: hasta, count: '100', sort: 'start_time:asc' });
      if (token) q.set('page_token', token);
      const r = await pedir(`${BASE}/scheduled_events?${q}`, clave, limite, SIN_PERMISO_ORG);
      if (r.corte) { parcial = true; break; }
      for (const ev of r.datos.collection || []) {
        if (!ev || !ev.uri) continue;
        if (vistos && vistos.get(ev.uri) === ev.updated_at) continue;   // ya procesado y sin cambios
        const invs = await invitados(ev, clave, limite);
        if (!invs) { parcial = true; break pagina; }
        for (const inv of invs) { const x = inv && aReserva(ev, inv); if (x) reservas.push(x); }
      }
      token = (r.datos.pagination && r.datos.pagination.next_page_token) || '';
    } while (token);
  } catch (e) {
    e.reservas = reservas;
    throw e;
  }
  return { reservas, parcial };
}
