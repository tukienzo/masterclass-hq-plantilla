// El pipeline de agendas (§7.4, §7.5): agendas → filas del frontend, el cruce con los registros de la landing,
// las personas (union-find por mail y teléfono), los tramos de capital y la sincronización con iClosed y Calendly.
import { createHash } from 'node:crypto';
import { obtener, listar, fusionarVarios, fusionarVariosSiExisten, fusionarSi, guardar } from './almacen.mjs';
import { negocio, opciones } from './config.mjs';
import { diaLocal, horaLocal } from './fechas.mjs';
import { norm, normUtm, email, tel8, monto, texto } from './normalizar.mjs';
import { normalizarLibre } from './telefono.mjs';
import { cruceDe } from './registros.mjs';
import { leerIntegracion } from './integraciones/estado.mjs';
import * as iclosed from './integraciones/iclosed.mjs';
import * as calendly from './integraciones/calendly.mjs';

// Los campos de una fila, con las claves literales del frontend (mayúscula inicial, una con espacio)
export const CAMPOS = ['Nombre', 'WhatsApp', 'Email', 'Instagram', 'Fecha call', 'Hora', 'Estado', 'Closer', 'Setter', 'Monto',
  'Programa', 'Fecha cierre', 'Gatillo', 'Notas', 'Capital', 'Origen', 'Evento', 'Timestamp', 'CalendlyID',
  'Negocio', 'Facturacion', 'Objetivo', 'Traba', 'Urgencia', 'Decisor'];
const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export const cargarAgendas = () => listar('agendas');

const ms = (s) => { const n = Date.parse(s); return Number.isFinite(n) ? n : -Infinity; };
const vacio = (v) => v == null || String(v).trim() === '';

// ── cruce agenda ↔ registro (§7.4.2) ──

// Indice = {porEmail: Map email → registros, porTel: Map tel8 → registros}
export function indexarRegistros(regs) {
  const porEmail = new Map(), porTel = new Map();
  const meter = (m, k, r) => { if (!k) return; const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); };
  for (const r of regs || []) {
    meter(porEmail, email(r.email), r);
    meter(porTel, r.tel8 || tel8(r.whatsapp), r);
  }
  return { porEmail, porTel };
}

// El más reciente con creado <= Timestamp de la agenda; si ninguno es anterior, el más reciente de todos
export function cruzar(agenda, indice) {
  if (!indice || !agenda) return null;
  const e = email(agenda.Email), t = tel8(agenda.WhatsApp);
  const cand = new Set([...((e && indice.porEmail.get(e)) || []), ...((t && indice.porTel.get(t)) || [])]);
  if (!cand.size) return null;
  const tope = Date.parse(agenda.Timestamp);
  let antes = null, todos = null;
  for (const r of cand) {
    const c = ms(r.creado);
    if (!todos || c > ms(todos.creado)) todos = r;
    if (Number.isFinite(tope) && c <= tope && (!antes || c > ms(antes.creado))) antes = r;
  }
  return antes || todos;
}

const montoFila = (v) => { const n = monto(v); return n == null ? '' : n; };

// La fila tal como la recibe el frontend: los campos de §4.3 ('' los ausentes), _row = _id, _fuente y _registro.
// Lo interno (fuenteId, eventoActualizado, eventoUri, utmAgenda, deFuente, canceladaFuente, creado, actualizado) no sale.
export function aFila(agenda, registro) {
  const id = String(agenda.id);
  const f = { _row: id, _id: id };
  for (const c of CAMPOS) f[c] = c === 'Monto' ? montoFila(agenda.Monto) : agenda[c] == null ? '' : String(agenda[c]);
  f._fuente = agenda._fuente ? String(agenda._fuente) : '';
  f._registro = registro ? cruceDe(registro) || null : null;
  return f;
}

// ── personas del pipeline (§7.4.3) ──

const reciente = (a, b) => {
  const x = `${a['Fecha call'] || ''} ${a.Hora || ''}`, y = `${b['Fecha call'] || ''} ${b.Hora || ''}`;
  return x < y ? 1 : x > y ? -1 : 0;
};

// Persona = {clave, filas (la más reciente primero), emails: Set, tels: Set (tel8), presento, compro, cash}
export function personas(agendas) {
  const lista = agendas || [];
  const padre = lista.map((_, i) => i);
  const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const visto = new Map();   // e:<email> · t:<tel8> · n:<nombre> → la primera agenda que lo tiene
  lista.forEach((a, i) => {
    const e = email(a.Email), t = tel8(a.WhatsApp);
    const ks = [e && 'e:' + e, t && 't:' + t].filter(Boolean);
    if (!ks.length) ks.push('n:' + (norm(a.Nombre) || 'id:' + a.id));   // sin contacto: la persona es el nombre
    for (const k of ks) {
      if (!visto.has(k)) { visto.set(k, i); continue; }
      const x = raiz(visto.get(k)), y = raiz(i);
      if (x !== y) padre[y] = x;
    }
  });
  const grupos = new Map();
  lista.forEach((a, i) => { const r = raiz(i); if (grupos.has(r)) grupos.get(r).push(a); else grupos.set(r, [a]); });
  return [...grupos.values()].map((filas) => {
    filas.sort(reciente);
    const emails = new Set(), tels = new Set();
    for (const a of filas) {
      const e = email(a.Email), t = tel8(a.WhatsApp);
      if (e) emails.add(e);
      if (t) tels.add(t);
    }
    const cerradas = filas.filter((a) => a.Estado === 'Cerrada');
    return {
      clave: [...emails].sort()[0] || [...tels].sort()[0] || norm(filas[0].Nombre) || String(filas[0].id),
      filas, emails, tels,
      presento: filas.some((a) => a.Estado === 'Presentada' || a.Estado === 'Cerrada'),
      compro: cerradas.length > 0,
      cash: cerradas.reduce((s, a) => s + (monto(a.Monto) || 0), 0),
    };
  }).sort((p, q) => reciente(p.filas[0], q.filas[0]));
}

// ── capital (§7.5.4) ──

// Texto libre del form ('1.000 a 2.000', 'Más de 3.000', '2k') → la clave del tramo, o '' si no hay número.
// Toma el primer número; "más de" / "+" suma 1 y "menos de" resta 1; el tramo es el primero con n >= desde.
export function capitalTramo(textoCap, tramos) {
  const s = String(textoCap == null ? '' : textoCap).trim();
  const lista = (Array.isArray(tramos) ? tramos : []).filter((t) => t && t.k != null && Number.isFinite(Number(t.desde)));
  if (!s || !lista.length) return '';
  const exacto = lista.find((t) => String(t.k).toLowerCase() === s.toLowerCase());
  if (exacto) return String(exacto.k);
  const nums = [...s.matchAll(/(\d[\d.,]*)(?:\s*(k|mil)(?![a-z]))?/gi)]
    .map((m) => ({ n: monto(m[1].replace(/[.,]+$/, '')), por: m[2] ? 1000 : 1 })).filter((x) => x.n != null);
  if (!nums.length) return '';
  let [{ n, por }] = nums;
  if (por === 1 && nums[1] && nums[1].por > 1 && n < nums[1].n) por = nums[1].por;   // "2 a 3K" = 2.000 a 3.000
  n *= por;
  const t = norm(s);
  if (/\bmas de\b/.test(t) || s.includes('+')) n += 1;
  else if (/\bmenos de\b/.test(t)) n -= 1;
  const tramo = [...lista].sort((a, b) => Number(b.desde) - Number(a.desde)).find((x) => n >= Number(x.desde));
  return tramo ? String(tramo.k) : '';
}

// ── sincronización con los calendarios (§7.5.4) ──

const FUENTES = { iclosed, calendly };
const NOMBRES = { iclosed: 'iClosed', calendly: 'Calendly' };
// ajustes/<BORRADAS> = {"<fuenteId>": ISO}: las agendas de un calendario que alguien borró (adel) no vuelven
export const BORRADAS = 'agendas-borradas';
const PISA = ['Nombre', 'Email', 'Fecha call', 'Hora', 'Evento', 'Timestamp', 'CalendlyID', '_fuente', 'fuenteId'];
const SI_VACIO = ['WhatsApp', 'Instagram', 'Closer', 'Origen', 'Capital', 'Negocio', 'Facturacion', 'Objetivo', 'Traba', 'Urgencia', 'Decisor'];
const CANCELABLES = ['Pendiente', 'Confirmada', 'Re-agenda'];
const VISIBLES = new Set([...PISA, ...SI_VACIO, 'Estado']);   // lo demás (deFuente, eventoActualizado…) es interno
const META = ['id', 'creado', 'actualizado'];
const DIA = 86400000;

// id estable por reserva: si el cron y el botón corren a la vez, escriben la misma agenda y no dos
const idDe = (fuenteId) => 'ag_' + createHash('sha256').update(String(fuenteId)).digest('hex').slice(0, 20);

const isoValido = (s) => { const n = Date.parse(s); return !vacio(s) && Number.isFinite(n) ? new Date(n).toISOString() : ''; };

// JSON con las claves ordenadas: jsonb (Supabase) no guarda el orden de las claves, así que con JSON.stringify a
// secas lo guardado y lo nuevo darían distinto siempre y se reescribiría lo mismo en cada corrida
const estable = (v) => JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((c) => [c, x[c]])) : x));

// El campo de opciones.mapeoForm para una pregunta ya normalizada: de las entradas que coinciden, la de la palabra
// que aparece primero ("cuanto factura tu negocio" → Facturacion, no Negocio). Empate → el orden de la lista.
function campoDe(q, mapeo) {
  let campo = null, pos = Infinity;
  for (const x of Array.isArray(mapeo) ? mapeo : []) {
    if (!x || !SI_VACIO.includes(x.campo) || !Array.isArray(x.contiene)) continue;
    for (const p of x.contiene) {
      const i = norm(p) ? q.indexOf(norm(p)) : -1;
      if (i > -1 && i < pos) { pos = i; campo = x.campo; }
    }
  }
  return campo;
}

// Respuestas del form de agenda → campos de la fila (si dos preguntas caen en el mismo campo, queda la primera)
function camposDelForm(respuestas, op, pais) {
  const out = {};
  for (const r of respuestas || []) {
    const q = norm(r && r.pregunta), v = texto(r && r.respuesta);
    if (!q || !v) continue;
    const campo = campoDe(q, op.mapeoForm);
    if (!campo || out[campo]) continue;
    out[campo] = campo === 'Capital' ? capitalTramo(v, op.capitalTramos)
      : campo === 'WhatsApp' ? normalizarLibre(v, pais) || v : v;
  }
  return out;
}

// Reserva (de iclosed.traer / calendly.traer) → lo que pisa siempre, lo que se llena solo si está vacío y lo interno.
// Internos: deFuente = lo último que trajo la fuente en cada campo de SI_VACIO; canceladaFuente = si venía cancelada.
function deReserva(cual, res, neg, op) {
  if (!res || vacio(res.fuenteId) || !Number.isFinite(Date.parse(res.inicio))) return null;
  const form = camposDelForm(res.respuestas, op, neg.pais);
  const utm = Object.fromEntries(UTMS.map((k) => [k, normUtm(res.utm && res.utm[k])]));
  const origen = String((res.utm && res.utm.utm_source) || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const tel = texto(res.WhatsApp);
  const siVacio = {
    ...form, WhatsApp: (tel && (normalizarLibre(tel, neg.pais) || tel)) || form.WhatsApp || '',
    Closer: texto(res.Closer) || form.Closer || '', Origen: origen || form.Origen || '',
  };
  return {
    pisa: {
      Nombre: texto(res.Nombre), Email: email(res.Email), 'Fecha call': diaLocal(res.inicio, neg.zona),
      Hora: horaLocal(res.inicio, neg.zona), Evento: texto(res.Evento), Timestamp: isoValido(res.Timestamp),
      CalendlyID: texto(res.CalendlyID), _fuente: cual, fuenteId: String(res.fuenteId),
    },
    siVacio,
    cancelada: !!res.cancelada,
    internos: {
      ...(UTMS.some((k) => utm[k]) ? { utmAgenda: utm } : {}),
      ...(res.eventoActualizado ? { eventoActualizado: String(res.eventoActualizado) } : {}),
      ...(res.eventoUri ? { eventoUri: String(res.eventoUri) } : {}),
      deFuente: Object.fromEntries(SI_VACIO.filter((k) => !vacio(siVacio[k])).map((k) => [k, siVacio[k]])),
      canceladaFuente: !!res.cancelada,
    },
  };
}

// Calendly: eventos ya procesados y sin cambios desde entonces (todas sus agendas con el mismo eventoActualizado)
function vistosCalendly(agendas) {
  const por = new Map();
  for (const a of agendas) {
    if (a._fuente !== 'calendly' || !a.eventoUri) continue;
    const v = String(a.eventoActualizado || '');
    por.set(a.eventoUri, por.has(a.eventoUri) && por.get(a.eventoUri) !== v ? '' : v);
  }
  return new Map([...por].filter(([, v]) => v));
}

// Lo que cambia en una agenda que ya estaba. SI_VACIO se completa solo si está vacío y la fuente trae algo distinto
// de la vez anterior (lo que alguien vació a mano queda vacío). La cancelación se aplica una vez, cuando la fuente
// pasa a cancelada: si el equipo la reabre, queda reabierta. Sin deFuente/canceladaFuente (agendas viejas) = como antes.
function cambiosDe(previa, r) {
  const p = {};
  for (const k of PISA) if (!vacio(r.pisa[k]) && String(previa[k] ?? '') !== r.pisa[k]) p[k] = r.pisa[k];
  const antes = previa.deFuente && typeof previa.deFuente === 'object' ? previa.deFuente : null;
  for (const k of SI_VACIO) {
    const v = r.siVacio[k];
    if (!vacio(v) && vacio(previa[k]) && (!antes || antes[k] !== v)) p[k] = v;
  }
  if (r.cancelada && previa.canceladaFuente !== true && CANCELABLES.includes(previa.Estado || 'Pendiente')) p.Estado = 'Cancelada';
  for (const [k, v] of Object.entries(r.internos)) if (estable(previa[k]) !== estable(v)) p[k] = v;
  return p;
}

// Lo que se decidió mirando la foto y puede haber cambiado a mano antes de escribir: la cancelación (solo si el
// Estado sigue cancelable) y SI_VACIO (solo si sigue vacío). Va como condición de fusionarSi; null = no depende.
function condicionDe(foto, c) {
  const si = {};
  if (c.Estado !== undefined) si.Estado = ['', ...CANCELABLES];
  for (const k of SI_VACIO) if (c[k] !== undefined) si[k] = ['', foto[k] == null ? '' : String(foto[k])];
  return Object.keys(si).length ? si : null;
}

// n tareas a la vez (los fusionarSi van de a uno por agenda)
export async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// Una agenda que ya estaba, con condición. Si alguien la tocó a mano entre la foto y la escritura (un 'Cerrada', un
// closer que la tomó), se mira cómo quedó y se saca lo que ya no corresponde; lo que la fuente pisa siempre y lo
// interno se escribe igual. Devuelve lo escrito, o null si la borraron (fusionarSi nunca la recrea).
async function actualizar(id, c, foto) {
  let si = condicionDe(foto, c);
  for (let intento = 0; intento < 3; intento++) {
    if (!Object.keys(c).length) return {};
    if (await fusionarSi('agendas', id, c, si)) return c;
    const ahora = await obtener('agendas', id);
    if (!ahora) return null;
    c = { ...c };
    if (c.Estado !== undefined && !CANCELABLES.includes(ahora.Estado || 'Pendiente')) delete c.Estado;
    for (const k of SI_VACIO) if (c[k] !== undefined && !vacio(ahora[k])) delete c[k];
    si = condicionDe(ahora, c);
  }
  // cambió tres veces en el medio: va solo lo que no depende de lo escrito
  const resto = Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'Estado' && !SI_VACIO.includes(k)));
  return Object.keys(resto).length && (await fusionarSi('agendas', id, resto)) ? resto : null;
}

// Upsert por fuenteId. Decide contra una foto de `agendas` leída recién, justo antes de escribir, y escribe sin pisar
// lo que se hizo a mano mientras tanto: las altas con fusionarVarios; las que ya estaban, solo si siguen existiendo
// (fusionarVariosSiExisten, o fusionarSi cuando el cambio depende de lo escrito). Lo que se borró no vuelve.
// Devuelve cuántas agendas son nuevas o cambiaron algo visible.
async function aplicar(cual, reservas, ctx) {
  const rs = (reservas || []).map((res) => deReserva(cual, res, ctx.neg, ctx.op)).filter(Boolean);
  if (!rs.length) return 0;
  const [agendas, borradasDoc] = await Promise.all([cargarAgendas(), obtener('ajustes', BORRADAS)]);
  const borradas = new Set(Object.keys(borradasDoc || {}).filter((k) => !META.includes(k)));
  const porFuenteId = new Map();
  for (const a of agendas) if (a.fuenteId) porFuenteId.set(String(a.fuenteId), a);
  const cambios = new Map(), altas = new Set(), fotos = new Map();
  for (const r of rs) {
    const previa = porFuenteId.get(r.pisa.fuenteId);
    if (!previa) {
      if (borradas.has(r.pisa.fuenteId)) continue;
      const doc = { ...r.pisa, Estado: r.cancelada ? 'Cancelada' : 'Pendiente', ...r.internos };
      for (const k of SI_VACIO) if (!vacio(r.siVacio[k])) doc[k] = r.siVacio[k];
      const id = idDe(r.pisa.fuenteId);
      cambios.set(id, doc);
      altas.add(id);
      porFuenteId.set(r.pisa.fuenteId, { ...doc, id });
      continue;
    }
    const p = cambiosDe(previa, r);
    if (!Object.keys(p).length) continue;
    if (!altas.has(previa.id) && !fotos.has(previa.id)) fotos.set(previa.id, { ...previa });   // como estaba escrita
    cambios.set(previa.id, { ...(cambios.get(previa.id) || {}), ...p });
    Object.assign(previa, p);
  }
  if (!cambios.size) return 0;

  const nuevas = [], directas = [], condicionadas = [];
  for (const [id, c] of cambios) {
    if (altas.has(id)) nuevas.push({ ...c, id });
    else if (condicionDe(fotos.get(id), c)) condicionadas.push([id, c]);
    else directas.push({ ...c, id });
  }
  const escritas = [];   // [id, lo escrito]
  if (nuevas.length) for (const d of await fusionarVarios('agendas', nuevas)) escritas.push([d.id, d]);
  if (directas.length) for (const d of await fusionarVariosSiExisten('agendas', directas)) escritas.push([d.id, cambios.get(d.id)]);
  await enParalelo(condicionadas, 8, async ([id, c]) => {
    const hecho = await actualizar(id, c, fotos.get(id));
    if (hecho) escritas.push([id, hecho]);
  });
  return escritas.filter(([id, c]) => altas.has(id) || Object.keys(c).some((k) => VISIBLES.has(k))).length;
}

async function correrFuente(cual, integ, ctx) {
  if (!integ || !integ.conectada) return { fuente: cual, saltado: true };
  let r, error = '';
  try {
    const ahora = Date.now();
    r = await FUENTES[cual].traer({
      desde: new Date(ahora - 30 * DIA).toISOString(), hasta: new Date(ahora + 60 * DIA).toISOString(),
      presupuestoMs: Math.max(0, ctx.limite - ctx.reserva - ahora),
      vistos: cual === 'calendly' ? ctx.vistos : new Map(),
    }, integ, ctx.neg);
  } catch (e) {
    // los mensajes de las integraciones son para la persona (e.legible); cualquier otra cosa es un error nuestro
    if (e && e.legible) error = e.message;
    else {
      console.error(`sync ${cual}:`, e);
      error = `${NOMBRES[cual]} devolvió algo que no entiendo: probá de nuevo en unos minutos`;
    }
    r = { reservas: (e && Array.isArray(e.reservas) && e.reservas) || [], parcial: false };   // lo que llegó se guarda igual
  }
  let guardadas = 0;
  try {
    guardadas = await aplicar(cual, r && r.reservas, ctx);
  } catch (e) {
    console.error(`sync ${cual}:`, e);
    error = error || 'No pude guardar las agendas: probá de nuevo';
  }
  return error ? { fuente: cual, saltado: false, error, guardadas, parcial: false }
    : { fuente: cual, saltado: false, error: '', guardadas, parcial: !!(r && r.parcial) };
}

// Trae iClosed y Calendly a la vez, guarda en `agendas` y deja el estado en ajustes/sync-agendas.
// Un error de una fuente no frena a la otra. Las dos van siempre en la respuesta, cada una con `fuente`.
// presupuestoMs incluye la escritura: a las fuentes les queda el total menos una reserva (hasta 5 s).
export async function sincronizar({ presupuestoMs = 20000 } = {}) {
  const limite = Date.now() + presupuestoMs;
  const leer = (cual) => leerIntegracion(cual).catch((e) => { console.error(`sync ${cual}:`, e); return { fallo: true }; });
  const [neg, op, integIc, integCa] = await Promise.all([negocio(), opciones(), leer('iclosed'), leer('calendly')]);
  // Calendly saltea los eventos ya procesados: para eso hace falta lo guardado. Lo demás se decide al escribir.
  const vistos = integCa.conectada ? vistosCalendly(await cargarAgendas()) : new Map();
  const ctx = { neg, op, vistos, limite, reserva: Math.min(5000, Math.round(presupuestoMs / 4)) };
  const fuente = (cual, integ) => (integ.fallo
    ? { fuente: cual, saltado: false, error: 'No pude leer la integración: probá de nuevo', guardadas: 0, parcial: false }
    : correrFuente(cual, integ, ctx));
  const [ic, ca] = await Promise.all([fuente('iclosed', integIc), fuente('calendly', integCa)]);
  const estado = { cuando: new Date().toISOString(), iclosed: ic, calendly: ca };
  await guardar('ajustes', { id: 'sync-agendas', ...estado });
  return estado;
}
