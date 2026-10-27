// Meta Marketing API, solo lectura (§8.1): probar el token (cuentas y píxeles), las consultas de /api/meta-ads
// (por campaña, anuncio por anuncio y resumen) y el modo demo (D15). Base https://graph.facebook.com/<versión>, el
// token va en la query (access_token) y nunca se loguea ni vuelve en un mensaje. Las respuestas crudas de Meta y las
// del demo pasan por el mismo armado, así los tres modos tienen siempre la misma forma.
import { createHash } from 'node:crypto';
import { obtener, guardar } from '../almacen.mjs';
import { HttpError } from '../http.mjs';
import { env, negocio } from '../config.mjs';
import { enmascarar } from '../cifrado.mjs';
import { aUTC, diaLocal, difDias, esFecha, hoyLocal, sumarDias } from '../fechas.mjs';

const BASE = 'https://graph.facebook.com';
const VERSION = 'v26.0';
const PAGINAS = 20;            // tope de páginas por consulta (§8.1)
const ESPERA_MS = 15000;       // por pedido
const PLAZO_MS = 45000;        // toda una consulta de /api/meta-ads: la función sincrónica corta a los 60 s
const PLAZO_PROBAR_MS = 35000; // probar (conectar lo corta a los 40 s)
const POR_IDS = 50;            // ids por pedido en GET /?ids= (el máximo de la Graph API)
const CUENTA_S = 86400;        // los datos de la cuenta (nombre, moneda, zona) se guardan 24 h
const TARDE = 'Meta tardó demasiado: probá con un rango más corto';

// /ads y /campaigns se piden con effective_status explícito, sin DELETED: sin el filtro la Graph API puede dejar
// afuera los archivados (y los borrados). VERIFICAR en la primera conexión real qué devuelve /ads sin el filtro.
// Los anuncios con entrega que igual falten (borrados o más allá del tope) se completan por id (porIds).
const ESTADOS_ANUNCIO = JSON.stringify(['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'ARCHIVED', 'DISAPPROVED',
  'PENDING_REVIEW', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'IN_PROCESS', 'WITH_ISSUES']);
const ESTADOS_CAMPANA = JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_PROCESS', 'WITH_ISSUES']);
const CAMPOS_ANUNCIO = 'id,name,effective_status,created_time,campaign{id,name,objective},adset{id,name},creative{thumbnail_url}';

/* ════════ números y fechas ════════ */
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;
const r4 = (v) => Math.round(n(v) * 10000) / 10000;
const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const versionDe = (v) => (/^v\d{1,3}\.\d{1,2}$/.test(String(v || '').trim()) ? String(v).trim() : VERSION);

// 'act_<n>' o el número solo → 'act_<n>'; cualquier otra cosa → '' (no se arma una URL con eso)
export function cuentaDe(s) {
  const t = String(s ?? '').trim();
  if (/^\d{1,25}$/.test(t)) return 'act_' + t;
  return /^act_\d{1,25}$/.test(t) ? t : '';
}

// created_time de Meta ('2026-10-02T15:00:00+0000') → día en la zona; '' si no se entiende
function diaDe(hora, zona) {
  const t = Date.parse(String(hora || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (!Number.isFinite(t)) return '';
  try { return diaLocal(new Date(t), zona); } catch { return ''; }
}
const horaMeta = (iso) => iso.slice(0, 19) + '+0000';

/* ════════ pedidos a la Graph API ════════ */
class ErrorMeta extends Error {
  constructor(mensaje, { codigo = null, tipo = '', status = 0, red = false } = {}) {
    super(mensaje);
    this.name = 'ErrorMeta';
    Object.assign(this, { codigo, tipo, status, red });
  }
}
const esLimite = (c) => [4, 17, 32, 613].includes(c) || (c >= 80000 && c <= 80014);

function armarUrl(ruta, params, cred) {
  const u = new URL(`${BASE}/${versionDe(cred.version)}/${ruta}`);
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') u.searchParams.set(k, String(v));
  u.searchParams.set('access_token', cred.clave);
  return u.href;
}

// un mensaje sin el token aunque Meta lo repita ("Malformed access token <token>"), y corto
function tapar(msg, clave) {
  let m = String(msg || '');
  if (clave && clave.length >= 6) for (const s of new Set([clave, encodeURIComponent(clave)])) m = m.split(s).join(enmascarar(clave));
  return m.replace(/access_token=[^&\s"']+/g, 'access_token=…').slice(0, 300);
}

// un GET; los errores de Meta salen con su mensaje crudo y su código ("(#17) User request limit reached"), sin el
// token. cred.limite (ms) es el plazo de toda la consulta: cada pedido espera 15 s o lo que quede, lo que sea menos.
async function pedir(url, cred) {
  const resta = (cred.limite || Infinity) - Date.now();
  if (resta <= 0) throw new ErrorMeta(TARDE, { red: true });
  const espera = Math.min(ESPERA_MS, resta);
  const tarde = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError';
  const errTarde = () => new ErrorMeta(espera < ESPERA_MS ? TARDE : 'Meta tardó demasiado en responder', { red: true });
  let r;
  try {
    r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(espera) });
  } catch (e) {
    if (tarde(e)) throw errTarde();
    throw new ErrorMeta(`Sin conexión con Meta (${tapar(e?.message || 'error de red', cred.clave)})`, { red: true });
  }
  let j = null;
  try { j = await r.json(); } catch (e) { if (tarde(e)) throw errTarde(); j = null; }
  if (r.ok && j && typeof j === 'object' && !j.error) return j;
  const er = (j && j.error) || {};
  const codigo = er.code != null && Number.isFinite(Number(er.code)) ? Number(er.code) : null;
  let msg = er.message ? String(er.message) : `Meta respondió ${r.status}${j ? '' : ' sin JSON'}`;
  if (codigo != null && !/^\(#\d+\)/.test(msg)) msg = `(#${codigo}) ${msg}`;
  throw new ErrorMeta(tapar(msg, cred.clave), { codigo, tipo: String(er.type || ''), status: r.status, red: !er.message && (r.status >= 500 || !j) });
}

const uno = (ruta, params, cred) => pedir(armarUrl(ruta, params, cred), cred);

// todas las páginas (paging.next) hasta `tope`; solo se sigue un next que apunte a la Graph API. Si quedó una página
// sin pedir, la lista lleva `cortada: true` (la respuesta sale con parcial) y se avisa en el log.
async function todas(ruta, params, cred, { tope = PAGINAS } = {}) {
  const out = [];
  let siguiente = armarUrl(ruta, params, cred);
  for (let p = 0; siguiente && p < tope; p++) {
    const j = await pedir(siguiente, cred);
    if (Array.isArray(j.data)) out.push(...j.data.filter((x) => x && typeof x === 'object'));
    const nx = j.paging && typeof j.paging.next === 'string' ? j.paging.next : '';
    siguiente = nx.startsWith(BASE + '/') ? nx : '';
  }
  if (siguiente) {
    out.cortada = true;
    console.warn(`[meta-ads] ${ruta}: se cortó en ${tope} páginas, faltan datos`);
  }
  return out;
}

// anuncios por id (GET /?ids=…, de a 50): para los que tuvieron entrega y /ads no trajo. Si falla o son demasiados,
// siguen sin metadatos y vuelve parcial: true (no se cae toda la consulta por esto).
async function porIds(ids, cred) {
  const anuncios = [];
  const tandas = [];
  for (let i = 0; i < ids.length; i += POR_IDS) tandas.push(ids.slice(i, i + POR_IDS));
  const parcial = tandas.length > PAGINAS;
  for (const t of tandas.slice(0, PAGINAS)) {
    try {
      const j = await uno('', { ids: t.join(','), fields: CAMPOS_ANUNCIO }, cred);
      anuncios.push(...Object.values(j).filter((m) => m && typeof m === 'object' && m.id != null));
    } catch (e) {
      console.warn('[meta-ads] no pude leer anuncios por id:', e?.message);
      return { anuncios, parcial: true };
    }
  }
  if (parcial) console.warn(`[meta-ads] ${ids.length} anuncios sin metadatos: se leyeron ${PAGINAS * POR_IDS}`);
  return { anuncios, parcial };
}

/* ════════ caché en la colección cache: {exp: ms, valor} ════════ */
function cacheS() {
  const s = env('META_CACHE_S', '300');
  const x = Number(s);
  return Number.isFinite(x) && x >= 0 ? x : 300;
}
async function leerCache(id) {
  try {
    const d = await obtener('cache', id);
    return d && n(d.exp) > Date.now() ? d.valor : null;
  } catch (e) {
    console.warn('[meta-ads] no pude leer la caché:', e?.message);
    return null;
  }
}
async function escribirCache(id, valor, segundos) {
  if (!(segundos > 0)) return;
  try { await guardar('cache', { id, exp: Date.now() + segundos * 1000, valor }); } catch (e) { console.warn('[meta-ads] no pude guardar la caché:', e?.message); }
}

/* ════════ acciones de Meta → resultados (§7.10.4) ════════ */
const LISTAS = ['actions', 'action_values', 'video_play_actions', 'video_p75_watched_actions', 'video_thruplay_watched_actions'];
const nuevoAcum = () => ({ gasto: 0, impresiones: 0, clics: 0, ...Object.fromEntries(LISTAS.map((k) => [k, Object.create(null)])) });
// suma una fila cruda de insights: spend, impressions, clicks y cada action_type de las listas
function acumular(a, f) {
  a.gasto += n(f.spend);
  a.impresiones += n(f.impressions);
  a.clics += n(f.clicks);
  for (const k of LISTAS) {
    for (const x of Array.isArray(f[k]) ? f[k] : []) {
      const t = String(x?.action_type ?? '');
      a[k][t] = (a[k][t] || 0) + n(x?.value);
    }
  }
  return a;
}
const TIPO_POR_OBJETIVO = {
  OUTCOME_SALES: 'compras', CONVERSIONS: 'compras', OUTCOME_LEADS: 'leads', LEAD_GENERATION: 'leads',
  MESSAGES: 'conversaciones', OUTCOME_ENGAGEMENT: 'conversaciones',
};
function metricas(a, objetivo) {
  const v = (t) => a.actions[t] || 0, vv = (t) => a.action_values[t] || 0;
  const leadsPixel = v('offsite_conversion.fb_pixel_lead');
  let leads = v('onsite_conversion.lead_grouped');
  if (!leads && !('offsite_conversion.fb_pixel_lead' in a.actions)) leads = v('lead');
  const conversaciones = v('onsite_conversion.messaging_conversation_started_7d');
  const visitas = v('landing_page_view');
  const compras = Math.max(v('purchase'), v('offsite_conversion.fb_pixel_purchase'));
  const facturado = Math.max(vv('purchase'), vv('offsite_conversion.fb_pixel_purchase'));
  const tipoResultado = compras > 0 ? 'compras' : Math.max(leads, leadsPixel) > 0 ? 'leads' : conversaciones > 0 ? 'conversaciones'
    : TIPO_POR_OBJETIVO[String(objetivo || '').toUpperCase()] || null;
  const resultados = tipoResultado === 'compras' ? compras : tipoResultado === 'leads' ? Math.max(leads, leadsPixel)
    : tipoResultado === 'conversaciones' ? conversaciones : 0;
  const gasto = r2(a.gasto);
  return {
    gasto, impresiones: a.impresiones, clics: a.clics, ctr: a.impresiones ? r4((a.clics / a.impresiones) * 100) : 0,
    leads, leadsPixel, conversaciones, visitas, compras, facturado: r2(facturado), resultados, tipoResultado,
    costoPorResultado: resultados > 0 ? r4(gasto / resultados) : null,
  };
}
const sumaDe = (o) => Object.values(o).reduce((s, x) => s + x, 0);
function videoDe(a) {
  const v = { reproducciones: sumaDe(a.video_play_actions), p75: sumaDe(a.video_p75_watched_actions), thruplays: sumaDe(a.video_thruplay_watched_actions) };
  return v.reproducciones || v.p75 || v.thruplays ? v : null;
}
// filas con time_increment=1 → [{fecha, gasto, impresiones, clics}] por fecha (date_start), de la más vieja a la más nueva
function serieDiaria(filas) {
  const dias = new Map();
  for (const f of filas || []) {
    const fecha = String(f.date_start || '');
    if (!esFecha(fecha)) continue;
    const d = dias.get(fecha) || { fecha, gasto: 0, impresiones: 0, clics: 0 };
    d.gasto += n(f.spend); d.impresiones += n(f.impressions); d.clics += n(f.clicks);
    dias.set(fecha, d);
  }
  return [...dias.values()].map((d) => ({ ...d, gasto: r2(d.gasto) })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* ════════ armado: de lo crudo (Meta o demo) a la forma de §7.10 ════════ */
// lo que la atribución necesita y la respuesta no lleva: va como propiedad no enumerable (no sale en el JSON)
function conAtribucion(obj, atribucion) {
  return Object.defineProperty(obj, 'atribucion', { value: atribucion, enumerable: false, configurable: true });
}
// alguna lista de Meta se cortó en el tope de páginas: los números o la lista de anuncios pueden quedar cortos
const marca = (crudo) => (crudo.parcial ? { parcial: true } : {});
// metadatos de anuncios: sin los borrados ni los creados después de `hasta`
const vigentes = (lista, hasta, zona) => (lista || []).filter((m) => m && m.id != null && m.effective_status !== 'DELETED'
  && !(diaDe(m.created_time, zona) > hasta));
const paraIndice = (m) => ({ id: String(m.id), nombre: String(m.name || ''), campana: { id: String(m.campaign?.id ?? ''), nombre: String(m.campaign?.name || '') } });

function armarDiario(crudo, rango, generado) {
  const porCampana = new Map();
  for (const f of crudo.filasCampana || []) {
    const id = String(f.campaign_id ?? '');
    if (!id) continue;
    if (!porCampana.has(id)) porCampana.set(id, { id, nombre: String(f.campaign_name || ''), objetivo: f.objective, a: nuevoAcum() });
    acumular(porCampana.get(id).a, f);
  }
  const campanas = [...porCampana.values()].map((c) => {
    const m = metricas(c.a, c.objetivo);
    return {
      id: c.id, nombre: c.nombre, gasto: m.gasto, impresiones: m.impresiones, clics: m.clics, ctr: m.ctr, leads: m.leads,
      leadsPixel: m.leadsPixel, conversaciones: m.conversaciones, landings: m.visitas, compras: m.compras, facturado: m.facturado,
      resultados: m.resultados, tipoResultado: m.tipoResultado, costoPorResultado: m.costoPorResultado, registros: 0, calificados: 0,
    };
  }).sort((a, b) => b.gasto - a.gasto);
  const zona = crudo.cuenta.zona || 'UTC';
  return conAtribucion({
    generado, rango: { desde: rango.desde, hasta: rango.hasta },
    cuenta: { nombre: crudo.cuenta.nombre, moneda: crudo.cuenta.moneda, campanas, porDia: serieDiaria(crudo.filasDia) },
    ...marca(crudo),
  }, {
    campanas: campanas.map((c) => ({ id: c.id, nombre: c.nombre })),
    anuncios: vigentes(crudo.anuncios, rango.hasta, zona).map(paraIndice),
  });
}

function armarAnuncios(crudo, rango, generado) {
  const zona = crudo.cuenta.zona || 'UTC';
  const meta = new Map((crudo.anuncios || []).filter((m) => m && m.id != null).map((m) => [String(m.id), m]));
  const porAnuncio = new Map();
  for (const f of crudo.filasDia || []) {
    const id = String(f.ad_id ?? '');
    if (!id) continue;
    let x = porAnuncio.get(id);
    if (!x) {
      porAnuncio.set(id, x = { id, nombre: f.ad_name, conjunto: f.adset_name, campana: { id: f.campaign_id, nombre: f.campaign_name, objetivo: f.objective }, a: nuevoAcum(), dias: [] });
    }
    acumular(x.a, f);
    x.dias.push(f);
  }
  const alcance = new Map((crudo.filasAlcance || []).map((f) => [String(f.ad_id ?? ''), f]));
  const anuncio = (id, m, x) => {
    const a = x ? x.a : nuevoAcum();
    const camp = { id: String(m?.campaign?.id ?? x?.campana.id ?? ''), nombre: String(m?.campaign?.name ?? x?.campana.nombre ?? ''), objetivo: String(m?.campaign?.objective ?? x?.campana.objetivo ?? '') };
    const k = metricas(a, camp.objetivo);
    const porDia = x ? serieDiaria(x.dias) : [];
    const al = alcance.get(id) || {};
    return {
      id, nombre: String(m?.name ?? x?.nombre ?? ''), estado: m?.effective_status || null, creado: m?.created_time || null,
      primerDia: (porDia.find((d) => d.impresiones > 0) || {}).fecha || null,
      campana: camp, conjunto: { nombre: String(m?.adset?.name ?? x?.conjunto ?? '') }, creativo: { thumb: m?.creative?.thumbnail_url || null },
      gasto: k.gasto, impresiones: k.impresiones, alcance: n(al.reach), frecuencia: r2(al.frequency), clics: k.clics, ctr: k.ctr,
      cpm: k.impresiones ? r4((k.gasto / k.impresiones) * 1000) : 0, visitas: k.visitas, leads: k.leads, leadsPixel: k.leadsPixel,
      conversaciones: k.conversaciones, compras: k.compras, facturado: k.facturado, resultados: k.resultados, tipoResultado: k.tipoResultado,
      costoPorResultado: k.costoPorResultado, registros: 0, calificados: 0, video: videoDe(a), porDia,
    };
  };
  const anuncios = [];
  for (const [id, x] of porAnuncio) {
    if (!(x.a.impresiones > 0 || x.a.gasto > 0)) continue;
    const m = meta.get(id);
    if (m?.effective_status === 'DELETED') continue;
    anuncios.push(anuncio(id, m, x));
  }
  anuncios.sort((a, b) => b.gasto - a.gasto);
  // los creados dentro del rango que no tuvieron entrega (para los lanzamientos del calendario)
  const conEntrega = new Set(anuncios.map((a) => a.id));
  const resto = vigentes(crudo.anuncios, rango.hasta, zona).filter((m) => !conEntrega.has(String(m.id)));
  for (const m of resto) {
    const dia = diaDe(m.created_time, zona);
    if (dia && dia >= rango.desde && dia <= rango.hasta) anuncios.push(anuncio(String(m.id), m, null));
  }
  const campanas = (crudo.campanas || []).filter((c) => c && c.id != null && c.effective_status !== 'DELETED').slice(0, 500)
    .map((c) => ({ id: String(c.id), nombre: String(c.name || ''), estado: c.effective_status || null }));
  const fc = crudo.filaCuenta || {};
  const enLista = new Set(anuncios.map((a) => a.id));
  return conAtribucion({
    generado, rango: { desde: rango.desde, hasta: rango.hasta },
    cuenta: { id: crudo.cuenta.id, nombre: crudo.cuenta.nombre, moneda: crudo.cuenta.moneda, impresiones: n(fc.impressions), alcance: n(fc.reach), frecuencia: r2(fc.frequency) },
    permisos: crudo.permisos || { ads_read: true, ads_management: false },
    campanas, anuncios, ...marca(crudo),
  }, {
    campanas: campanas.map((c) => ({ id: c.id, nombre: c.nombre })),
    // primero los que tuvieron entrega: si dos anuncios se llaman igual, el registro va al que gastó
    anuncios: [...anuncios.map((a) => ({ id: a.id, nombre: a.nombre, campana: { id: a.campana.id, nombre: a.campana.nombre } })),
      ...resto.filter((m) => !enLista.has(String(m.id))).map(paraIndice)],
  });
}

function armarResumen(crudo, rango, generado) {
  const dias = serieDiaria(crudo.filasDia).map((d) => ({ fecha: d.fecha, gasto: d.gasto }));
  return conAtribucion({
    generado, gasto: r2(dias.reduce((s, d) => s + d.gasto, 0)), moneda: crudo.cuenta.moneda, dias,
    rango: { desde: rango.desde, hasta: rango.hasta }, ...marca(crudo),
  }, { campanas: [], anuncios: [] });
}

const ARMAR = { diario: armarDiario, anuncios: armarAnuncios, resumen: armarResumen };
function armar(modo, crudo, rango) {
  const fn = ARMAR[modo];
  if (!fn) throw new Error('meta-ads: modo desconocido ' + modo);
  return fn(crudo, rango, new Date().toISOString());
}

/* ════════ consultas reales ════════ */
async function datosCuenta(cred) {
  const id = 'meta:' + sha1('cuenta|' + cred.cuenta);
  const guardada = await leerCache(id);
  if (guardada) return guardada;
  const j = await uno(cred.cuenta, { fields: 'name,currency,timezone_name' }, cred);
  const c = { id: cred.cuenta, nombre: String(j.name || ''), moneda: String(j.currency || '').toUpperCase(), zona: String(j.timezone_name || '') };
  await escribirCache(id, c, CUENTA_S);
  return c;
}

// si /me/permissions falla, se asume un token de solo lectura
async function permisosDe(cred) {
  try {
    const l = await todas('me/permissions', { limit: 100 }, cred, { tope: 2 });
    const ok = (p) => l.some((x) => x && x.permission === p && x.status === 'granted');
    return { ads_read: ok('ads_read') || ok('ads_management'), ads_management: ok('ads_management') };
  } catch {
    return { ads_read: true, ads_management: false };
  }
}

const CAMPOS_ANUNCIO_DIA = 'ad_id,ad_name,adset_name,campaign_id,campaign_name,objective,spend,impressions,clicks,actions,action_values,'
  + 'video_play_actions,video_p75_watched_actions,video_thruplay_watched_actions';

// los ad_id con entrega en las filas que no están en la lista de /ads
function sinMetadatos(lista, filas) {
  const hay = new Set(lista.map((m) => String(m.id)));
  const ids = new Set();
  for (const f of filas) {
    const id = String(f.ad_id ?? '');
    if (/^\d{1,25}$/.test(id) && !hay.has(id) && (n(f.spend) > 0 || n(f.impressions) > 0)) ids.add(id);
  }
  return [...ids];
}
const cortada = (...listas) => listas.some((l) => l && l.cortada);

async function traer(modo, { desde, hasta }, cred) {
  const c = cred.cuenta;
  const time_range = JSON.stringify({ since: desde, until: hasta });
  const insights = (params, op) => todas(`${c}/insights`, { time_range, limit: 500, ...params }, cred, op);
  const listaAnuncios = (fields) => todas(`${c}/ads`, { fields, effective_status: ESTADOS_ANUNCIO, limit: 200 }, cred);
  if (modo === 'resumen') {
    const [cuenta, filasDia] = await Promise.all([datosCuenta(cred), insights({ time_increment: 1, fields: 'spend' })]);
    return { cuenta, filasDia, parcial: cortada(filasDia) };
  }
  if (modo === 'diario') {
    const [cuenta, filasCampana, filasDia, anuncios] = await Promise.all([
      datosCuenta(cred),
      insights({ level: 'campaign', fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,actions,action_values' }),
      insights({ time_increment: 1, fields: 'spend,impressions,clicks' }),
      listaAnuncios('id,name,effective_status,created_time,campaign{id,name}'),
    ]);
    return { cuenta, filasCampana, filasDia, anuncios, parcial: cortada(filasCampana, filasDia, anuncios) };
  }
  const [cuenta, filasDia, filasAlcance, totalCuenta, anuncios, campanas, permisos] = await Promise.all([
    datosCuenta(cred),
    insights({ level: 'ad', time_increment: 1, fields: CAMPOS_ANUNCIO_DIA }),
    insights({ level: 'ad', fields: 'ad_id,reach,frequency' }),
    todas(`${c}/insights`, { time_range, fields: 'impressions,reach,frequency' }, cred, { tope: 1 }),
    listaAnuncios(CAMPOS_ANUNCIO),
    todas(`${c}/campaigns`, { fields: 'id,name,effective_status,objective', effective_status: ESTADOS_CAMPANA, limit: 200 }, cred, { tope: 3 }),
    permisosDe(cred),
  ]);
  const faltan = sinMetadatos(anuncios, filasDia);
  const extra = faltan.length ? await porIds(faltan, cred) : { anuncios: [], parcial: false };
  return {
    cuenta, filasDia, filasAlcance, filaCuenta: totalCuenta[0] || {}, anuncios: [...anuncios, ...extra.anuncios], campanas, permisos,
    parcial: cortada(filasDia, filasAlcance, anuncios) || extra.parcial,
  };
}

// error de Meta → la respuesta de §7.10 (detalle = el mensaje de Meta, ya sin el token, para que el frontend detecte
// el límite)
function aHttp(e) {
  if (!(e instanceof ErrorMeta)) return e;
  const detalle = e.message;
  if (!e.red && esLimite(e.codigo)) return new HttpError(429, 'Meta pidió esperar', { detalle });
  if (!e.red && (e.codigo === 190 || e.tipo === 'OAuthException' || e.status === 401)) return new HttpError(502, 'El token de Meta no es válido o venció', { detalle });
  return new HttpError(502, 'Meta no respondió', { detalle });
}

// modo: 'diario' (por campaña) | 'anuncios' | 'resumen'. integ = leerIntegracion('meta'). Devuelve la forma de §7.10
// sin `ok`, `configurado` ni el bloque landing; `atribucion` ({campanas, anuncios}) va como propiedad no enumerable.
// Tira HttpError (429/502 con detalle) si Meta falla o no termina en 45 s. Si una lista se cortó en el tope de
// páginas, sale con parcial: true. En modo demo no hay red ni caché.
export async function consultar(modo, { desde, hasta, diario } = {}, integ) {
  if (!ARMAR[modo]) throw new Error('meta-ads: modo desconocido ' + modo);
  const rango = { desde, hasta };
  if (integ?.origen === 'demo') return datosDemo(modo, { desde, hasta, diario }, await negocio());
  const cuenta = cuentaDe(integ?.cuenta);
  if (!integ?.clave || !cuenta) throw new HttpError(400, 'Conectá tu cuenta de Meta en Integraciones');
  const cred = { clave: integ.clave, version: integ.version, cuenta, limite: Date.now() + PLAZO_MS };
  const id = 'meta:' + sha1([modo, cuenta, desde, hasta].join('|'));
  const ttl = cacheS();
  let guardado = ttl > 0 ? await leerCache(id) : null;
  if (!guardado || !guardado.valor) {
    let salida;
    try { salida = armar(modo, await traer(modo, rango, cred), rango); } catch (e) { throw aHttp(e); }
    guardado = { valor: salida, atribucion: salida.atribucion };
    await escribirCache(id, guardado, ttl);
  }
  return recortar(modo, guardado.valor, guardado.atribucion, diario);
}

// la serie diaria de la cuenta va solo con diario=1 (se guarda siempre: así una entrada de caché sirve para los dos)
function recortar(modo, valor, atribucion, diario) {
  const v = modo === 'diario' && !diario ? { ...valor, cuenta: { ...valor.cuenta, porDia: [] } } : { ...valor };
  return conAtribucion(v, atribucion || { campanas: [], anuncios: [] });
}

/* ════════ probar el token (lo usa /api/app conectar, §7.3.10) ════════ */
function mensajeProbar(e) {
  if (!(e instanceof ErrorMeta) || e.red || e.status >= 500) return 'El servicio no respondió: probá de nuevo';
  if (esLimite(e.codigo)) return 'Meta pidió esperar: probá de nuevo en unos minutos';
  if (e.codigo === 10 || (e.codigo >= 200 && e.codigo <= 299)) return 'Al token le falta el permiso ads_read: generalo de nuevo con ese permiso';
  if (e.codigo === 190 || e.tipo === 'OAuthException' || e.status === 401 || e.status === 403) return 'El token de Meta no es válido o venció: generá uno nuevo';
  return 'Meta rechazó el token: ' + e.message;
}

const datosDe = (c, id) => ({
  id: id || cuentaDe(c.account_id ?? c.id), nombre: String(c.name || ''), moneda: String(c.currency || '').toUpperCase(), zona: String(c.timezone_name || ''),
});

// cred = {clave, cuenta?, pixel?} → {detalle, opciones: {cuentas, pixeles}, elegir, extra}. Tira Error legible.
export async function probar(cred = {}) {
  const t = { clave: String(cred.clave || '').trim(), version: env('META_API_VERSION', VERSION), limite: Date.now() + PLAZO_PROBAR_MS };
  if (!t.clave) throw new Error('Pegá el token de Meta');
  let lista;
  try {
    lista = await todas('me/adaccounts', { fields: 'name,account_id,currency,timezone_name', limit: 100 }, t);
  } catch (e) {
    throw new Error(mensajeProbar(e));
  }
  const cuentas = lista.map((c) => datosDe(c)).filter((c) => c.id);
  if (!cuentas.length) throw new Error('El token no ve ninguna cuenta publicitaria: asignásela al usuario del sistema en el Business Manager');

  const pedida = cuentaDe(cred.cuenta);
  let cuenta = cuentas.find((c) => c.id === pedida) || null;
  if (!cuenta && pedida && lista.cortada) {
    // la lista se cortó en el tope: la guardada puede estar más allá, se confirma leyéndola
    try {
      cuenta = datosDe(await uno(pedida, { fields: 'name,account_id,currency,timezone_name' }, t), pedida);
      cuentas.push(cuenta);
    } catch (e) {
      // sin red, límite o caída: no se puede saber, no se toca nada. Otro error: no es de este token
      if (!(e instanceof ErrorMeta) || e.red || e.status >= 500 || esLimite(e.codigo)) throw new Error(mensajeProbar(e));
    }
  }
  if (!cuenta && cuentas.length === 1) cuenta = cuentas[0];
  const elegir = {};
  if (cuenta && cuenta.id !== String(cred.cuenta ?? '').trim()) elegir.cuenta = cuenta.id;   // también el número solo → 'act_<n>'
  if (!cuenta && pedida) elegir.cuenta = '';   // la guardada no es de este token: que elija otra

  let pixeles = [], sinPixeles = false;
  if (cuenta) {
    try {
      pixeles = (await todas(`${cuenta.id}/adspixels`, { fields: 'id,name', limit: 100 }, { ...t, cuenta: cuenta.id }))
        .filter((p) => p && p.id != null).map((p) => ({ id: String(p.id), nombre: String(p.name || '') }));
    } catch {
      sinPixeles = true;   // sin permiso sobre los píxeles: el de la CAPI se puede cargar igual
    }
  }
  const pedido = String(cred.pixel ?? '').trim();
  let pixel = pixeles.find((p) => p.id === pedido) || null;
  if (cuenta && !pixel && !sinPixeles && (pedido || pixeles.length === 1)) {
    // sin elegir, o el que había no es de esta cuenta: el único de la lista se elige solo; si no, que elija
    pixel = pixeles.length === 1 ? pixeles[0] : null;
    elegir.pixel = pixel ? pixel.id : '';
  }

  const neg = await negocio();
  let detalle;
  if (!cuenta) {
    detalle = pedida ? `La cuenta ${pedida} no está entre las de este token: elegí otra`
      : `${cuentas.length} cuentas publicitarias: elegí una`;
  } else {
    const partes = [`Cuenta ${cuenta.nombre || cuenta.id}`, cuenta.moneda];
    if (pixel) partes.push(`píxel ${pixel.nombre || pixel.id}`);
    else if (sinPixeles) partes.push(pedido ? `píxel ${pedido}` : 'no pude leer los píxeles');
    else partes.push(pixeles.length ? 'elegí el píxel' : 'la cuenta no tiene píxeles');
    if (cuenta.zona && cuenta.zona !== neg.zona) partes.push(`la cuenta usa ${cuenta.zona}`);
    detalle = partes.filter(Boolean).join(' · ');
  }
  const extra = cuenta
    ? { cuentaNombre: cuenta.nombre, moneda: cuenta.moneda, zonaCuenta: cuenta.zona, pixelNombre: pixel ? pixel.nombre : '' }
    : { cuentaNombre: '', moneda: '', zonaCuenta: '', pixelNombre: '' };
  return {
    detalle,
    opciones: { cuentas: cuentas.map(({ id, nombre, moneda }) => ({ id, nombre, moneda })), pixeles },
    elegir, extra,
  };
}

/* ════════ modo demo (DEMO_META=1, D15): datos sintéticos deterministas, sin red ════════
   Imita a la semilla: tres campañas "webinar-<mes del vivo>" con los vivos en hoy−45, hoy−9 y hoy+8, cada una con
   gasto en los 21 días previos a su vivo, y los anuncios anuncio-1…anuncio-8 repartidos entre ellas. Los números de
   cada día salen de un hash de la fecha y el anuncio: el mismo día da lo mismo en cualquier rango. */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const VIVOS_DEMO = [-45, -9, 8];
// [número, campaña, días después del arranque de la campaña, video, conjunto]. La semilla lee esta tabla y VIVOS_DEMO:
// cada registro pago lleva un anuncio de la campaña de su webinar que ya estaba activo ese día. Los anuncios se cargan
// hacia las campañas recientes, así el mes en curso casi no deja registros "sin campaña".
export const ANUNCIOS_DEMO = [
  [1, 0, 0, true, 'Intereses amplios'],
  [2, 1, 0, true, 'Intereses amplios'], [3, 1, 2, false, 'Público similar 3 %'], [4, 1, 6, true, 'Retargeting de visitas'],
  [5, 2, 0, true, 'Intereses amplios'], [6, 2, 2, false, 'Público similar 3 %'], [7, 2, 4, true, 'Retargeting de visitas'],
  [8, 2, 7, false, 'Público similar 3 %'],
];

// [0, 1) a partir de un texto (FNV-1a con mezcla final)
function azarDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const entre = (min, max, h) => min + (max - min) * h;

function mundoDemo(neg) {
  const hoy = hoyLocal(neg.zona);
  const campanas = VIVOS_DEMO.map((d, i) => {
    const vivo = sumarDias(hoy, d);
    return {
      id: `9${vivo.slice(0, 4)}${vivo.slice(5, 7)}00${i + 1}`, name: `webinar-${MESES[Number(vivo.slice(5, 7)) - 1]}`,
      objective: 'OUTCOME_LEADS', effective_status: vivo < hoy ? 'PAUSED' : 'ACTIVE', inicio: sumarDias(vivo, -21), fin: vivo,
    };
  });
  const anuncios = ANUNCIOS_DEMO.map(([k, ci, desfase, video, conjunto]) => {
    const c = campanas[ci], desde = sumarDias(c.inicio, desfase);
    return {
      id: `${c.id}${String(k).padStart(2, '0')}`, name: `anuncio-${k}`,
      effective_status: c.effective_status === 'ACTIVE' ? 'ACTIVE' : 'CAMPAIGN_PAUSED',
      created_time: horaMeta(aUTC(desde, '10:00', neg.zona)),
      campaign: { id: c.id, name: c.name, objective: c.objective }, adset: { id: `${c.id}9${k}`, name: conjunto },
      creative: { thumbnail_url: null }, desde, hasta: c.fin < hoy ? c.fin : hoy, video,
    };
  });
  return { hoy, campanas, anuncios };
}

// una fila de insights por anuncio y por día, como las devuelve Meta (números como texto)
function filaDemo(a, fecha, gasto) {
  const h = (k) => azarDe(`${k}|${fecha}|${a.name}`), base = (k) => azarDe(`${k}|${a.name}`);
  const impresiones = Math.max(1, Math.round((gasto / entre(6, 14, 0.75 * base('cpm') + 0.25 * h('cpm'))) * 1000));
  const fatiga = Math.max(0.6, 1 - 0.012 * difDias(a.desde, fecha));
  const ctr = Math.min(2.5, Math.max(0.8, entre(0.9, 2.3, base('ctr')) * fatiga * entre(0.9, 1.1, h('ctr'))));
  const clics = Math.round((impresiones * ctr) / 100);
  const visitas = Math.round(clics * entre(0.62, 0.82, h('lpv')));
  const leads = Math.round(visitas * entre(0.22, 0.4, h('lead')));
  const accion = (action_type, value) => ({ action_type, value: String(value) });
  const f = {
    ad_id: a.id, ad_name: a.name, adset_name: a.adset.name, campaign_id: a.campaign.id, campaign_name: a.campaign.name,
    objective: a.campaign.objective, date_start: fecha, date_stop: fecha, spend: gasto.toFixed(2), impressions: String(impresiones),
    clicks: String(clics),
    actions: [accion('link_click', clics), accion('landing_page_view', visitas), accion('offsite_conversion.fb_pixel_lead', leads), accion('lead', leads)],
  };
  if (a.video) {
    const repro = Math.round(impresiones * entre(0.3, 0.5, h('vid')));
    f.video_play_actions = [accion('video_view', repro)];
    f.video_p75_watched_actions = [accion('video_view', Math.round(repro * entre(0.08, 0.2, h('p75'))))];
    f.video_thruplay_watched_actions = [accion('video_view', Math.round(repro * entre(0.18, 0.3, h('tp'))))];
  }
  return f;
}

// filas de los días del rango (hasta hoy): la cuenta gasta entre 20 y 90 por día, repartido entre los anuncios activos
function filasDemo(mundo, desde, hasta) {
  const filas = [];
  if (!mundo.anuncios.length) return filas;
  const fin = hasta < mundo.hoy ? hasta : mundo.hoy;
  const primero = mundo.anuncios.reduce((m, a) => (a.desde < m ? a.desde : m), mundo.anuncios[0].desde);
  for (let f = desde > primero ? desde : primero; f <= fin; f = sumarDias(f, 1)) {
    const activos = mundo.anuncios.filter((a) => a.desde <= f && f <= a.hasta);
    if (!activos.length) continue;
    const total = entre(20, 90, azarDe('gasto|' + f));
    const pesos = activos.map((a) => 0.5 + azarDe(`peso|${f}|${a.name}`));
    const suma = pesos.reduce((s, p) => s + p, 0);
    activos.forEach((a, i) => filas.push(filaDemo(a, f, r2((total * pesos[i]) / suma))));
  }
  return filas;
}

// alcance y frecuencia del rango (sin time_increment): la frecuencia sube con los días de entrega
function alcanceDemo(filas) {
  const porAnuncio = new Map();
  for (const f of filas) {
    const x = porAnuncio.get(f.ad_id) || { ad_id: f.ad_id, nombre: f.ad_name, impresiones: 0, dias: 0 };
    x.impresiones += n(f.impressions); x.dias++;
    porAnuncio.set(f.ad_id, x);
  }
  const filasAlcance = [...porAnuncio.values()].map((x) => {
    const frec = Math.min(4.2, 1.15 + 0.09 * x.dias) * entre(0.9, 1.1, azarDe('frec|' + x.nombre));
    const reach = Math.max(1, Math.round(x.impresiones / frec));
    return { ad_id: x.ad_id, reach: String(reach), frequency: String(x.impresiones / reach) };
  });
  const impresiones = filas.reduce((s, f) => s + n(f.impressions), 0);
  const reach = impresiones ? Math.max(1, Math.round(filasAlcance.reduce((s, f) => s + n(f.reach), 0) * 0.82)) : 0;
  return { filasAlcance, filaCuenta: impresiones ? { impressions: String(impresiones), reach: String(reach), frequency: String(impresiones / reach) } : {} };
}

const sinPrivados = ({ desde, hasta, video, inicio, fin, ...m }) => m;

// modo: 'diario' | 'anuncios' | 'resumen'; rango = {desde, hasta, diario}; negocio = config.negocio()
export function datosDemo(modo, rango, neg) {
  if (!ARMAR[modo]) throw new Error('meta-ads: modo desconocido ' + modo);
  const r = { desde: rango.desde, hasta: rango.hasta };
  const mundo = mundoDemo(neg);
  const filas = filasDemo(mundo, r.desde, r.hasta);
  const cuenta = { id: 'act_demo', nombre: neg.nombre, moneda: neg.moneda, zona: neg.zona };
  const anuncios = mundo.anuncios.map(sinPrivados);
  const crudo = modo === 'resumen' ? { cuenta, filasDia: filas }
    : modo === 'diario' ? { cuenta, filasCampana: filas, filasDia: filas, anuncios }
      : { cuenta, filasDia: filas, ...alcanceDemo(filas), anuncios, campanas: mundo.campanas.map(sinPrivados), permisos: { ads_read: true, ads_management: false } };
  const salida = armar(modo, crudo, r);
  return modo === 'diario' && !rango.diario ? recortar(modo, salida, salida.atribucion, false) : salida;
}
