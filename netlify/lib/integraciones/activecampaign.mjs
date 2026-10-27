// ActiveCampaign: probar la clave (y listar las listas) y meter cada registro como contacto en la lista elegida
// con la etiqueta del webinar (esa etiqueta dispara la automatización de mails). Header Api-Token, base <url>/api/3.
import { guardarIntegracion } from './estado.mjs';
import { httpsUrl } from '../normalizar.mjs';

const ESPERA = 15000;
const ahoraISO = () => new Date().toISOString();
const senal = (hasta) => AbortSignal.timeout(Math.max(1000, Math.min(ESPERA, hasta ? hasta - Date.now() : ESPERA)));

// acepta la URL con o sin /api/3 y con barra final
const base = (url) => String(url || '').trim().replace(/\/+$/, '').replace(/\/api\/3$/i, '') + '/api/3';

class ErrorAC extends Error {
  constructor(mensaje, status = 0, cuerpo = null) { super(mensaje); this.status = status; this.cuerpo = cuerpo; }
}

const MENSAJES = {
  probar: { clave: 'La clave no es válida', red: 'El servicio no respondió: probá de nuevo' },
  enviar: { clave: 'La clave de ActiveCampaign no es válida', red: 'ActiveCampaign no respondió: se vuelve a intentar' },
};
const NO_ES_LA_API = 'No encontré la API en esa URL: copiala de Configuración → Desarrollador en ActiveCampaign';
function mensaje(status, j, modo) {
  const m = MENSAJES[modo];
  if (status === 401 || status === 403) return m.clave;
  if (status === 404) return NO_ES_LA_API;
  if (status === 429 || status >= 500 || !status) return m.red;
  const t = j?.errors?.[0]?.title || j?.message;
  return t ? String(t).slice(0, 300) : `ActiveCampaign rechazó el pedido (${status})`;
}

async function pedir(integ, metodo, ruta, cuerpo, { hasta, modo = 'enviar' } = {}) {
  let r;
  try {
    r = await fetch(base(integ.url) + ruta, {
      method: metodo,
      headers: { 'Api-Token': integ.clave, accept: 'application/json', ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: senal(hasta),
    });
  } catch {
    throw new ErrorAC(MENSAJES[modo].red);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorAC(mensaje(r.status, j, modo), r.status, j);
  return j;
}

// cred = {clave, url, lista?} → {detalle, opciones:{listas:[{id, nombre}]}, elegir, extra}. Tira Error legible.
export async function probar(cred = {}) {
  const clave = String(cred.clave || '').trim();
  if (!clave) throw new Error('Pegá la clave');
  const url = httpsUrl(cred.url);
  if (!url) throw new Error('Pegá la URL de la API de ActiveCampaign');
  const j = await pedir({ clave, url }, 'GET', '/lists?limit=100', null, { modo: 'probar' });
  // un 200 sin `lists` (una página HTML, otra API) no es ActiveCampaign: la clave tampoco quedó probada
  if (!Array.isArray(j?.lists)) throw new Error(NO_ES_LA_API);
  const listas = j.lists.filter((l) => l && l.id != null)
    .map((l) => ({ id: String(l.id), nombre: String(l.name || `Lista ${l.id}`) }));
  const pedida = String(cred.lista || '');
  const elegir = {}, extra = {};
  let lista = pedida ? listas.find((l) => l.id === pedida) : null;
  // sin elegida, o la elegida ya no está, y en la cuenta hay una sola: esa (el modal no muestra un select de una)
  if (!lista && listas.length === 1) [lista] = listas;
  let detalle;
  if (lista) {
    if (lista.id !== pedida) elegir.lista = lista.id;
    extra.listaNombre = lista.nombre;
    detalle = `Lista ${lista.nombre} · ${lista.id}`;
  } else if (pedida) {
    elegir.lista = '';
    extra.listaNombre = '';
    detalle = listas.length ? 'La lista elegida ya no está en la cuenta: elegí otra' : 'La lista elegida ya no está en la cuenta: creá una en ActiveCampaign';
  } else {
    detalle = listas.length ? 'Cuenta conectada · elegí la lista' : 'Cuenta conectada · creá una lista en ActiveCampaign';
  }
  return { detalle, opciones: { listas }, elegir, extra };
}

const etiquetaDe = (webinar) => String(webinar?.etiqueta || (webinar?.fecha ? 'webinar-' + webinar.fecha : '')).trim();
const igual = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// id de la etiqueta: de integraciones/ac.tags; si no, la busca y si no existe la crea (y guarda el id)
async function idEtiqueta(integ, etiqueta, hasta, usarGuardada = true) {
  const guardada = usarGuardada && integ.tags && Object.hasOwn(integ.tags, etiqueta) && integ.tags[etiqueta];
  if (guardada) return { id: String(guardada), guardada: true };
  const buscar = async () => ((await pedir(integ, 'GET', '/tags?search=' + encodeURIComponent(etiqueta), null, { hasta }))?.tags || [])
    .find((t) => igual(t?.tag, etiqueta));
  let tag = await buscar();
  if (!tag) {
    try {
      tag = (await pedir(integ, 'POST', '/tags', { tag: { tag: etiqueta, tagType: 'contact', description: 'Webinar' } }, { hasta }))?.tag;
    } catch (e) {
      if (e.status !== 422) throw e;
      tag = await buscar();   // otro registro la creó recién
      if (!tag) throw e;
    }
  }
  if (tag?.id == null) throw new ErrorAC('ActiveCampaign no devolvió la etiqueta');
  const id = String(tag.id);
  integ.tags = { ...(integ.tags || {}), [etiqueta]: id };
  try { await guardarIntegracion('ac', { tags: integ.tags }); } catch (e) { console.error('ac: no se guardó la etiqueta', e?.message); }
  return { id, guardada: false };
}

const yaLaTiene = (e) => e.status === 422 && /duplicate|already/i.test(e.message + ' ' + JSON.stringify(e.cuerpo || ''));

async function etiquetar(integ, contacto, etiqueta, hasta) {
  let { id, guardada } = await idEtiqueta(integ, etiqueta, hasta);
  const asignar = () => pedir(integ, 'POST', '/contactTags', { contactTag: { contact: contacto, tag: id } }, { hasta });
  try {
    await asignar();
  } catch (e) {
    if (yaLaTiene(e)) return;
    if (!guardada || ![400, 404, 422].includes(e.status)) throw e;
    ({ id } = await idEtiqueta(integ, etiqueta, hasta, false));   // el id guardado ya no existe en la cuenta
    try { await asignar(); } catch (e2) { if (!yaLaTiene(e2)) throw e2; }
  }
}

const numeroSiSe = (v) => (/^\d+$/.test(String(v)) ? Number(v) : v);

// Contacto + lista + etiqueta del webinar. Nunca tira: {ok:true, t} | {ok:false, error, t}
export async function sincronizar(reg, webinar, integ, { hasta } = {}) {
  try {
    if (!integ?.clave || !httpsUrl(integ.url) || !integ.lista) throw new Error('A ActiveCampaign le falta la URL, la clave o la lista');
    if (!reg?.email) throw new Error('El registro no tiene email');
    const [firstName = '', ...resto] = String(reg.nombre || '').trim().split(/\s+/);
    const c = await pedir(integ, 'POST', '/contact/sync', {
      contact: { email: reg.email, firstName, lastName: resto.join(' '), phone: reg.whatsapp || '' },
    }, { hasta });
    const contacto = c?.contact?.id;
    if (contacto == null) throw new Error('ActiveCampaign no devolvió el contacto');
    await pedir(integ, 'POST', '/contactLists', { contactList: { list: numeroSiSe(integ.lista), contact: contacto, status: 1 } }, { hasta });
    const etiqueta = etiquetaDe(webinar);
    if (etiqueta) await etiquetar(integ, contacto, etiqueta, hasta);
    return { ok: true, t: ahoraISO() };
  } catch (e) {
    return { ok: false, error: String(e?.message || 'No se pudo mandar a ActiveCampaign'), t: ahoraISO() };
  }
}
