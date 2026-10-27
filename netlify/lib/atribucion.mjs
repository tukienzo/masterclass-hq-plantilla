// Atribución por UTM (§7.10.5): un registro va a una campaña si su utm_content o su utm_campaign es el nombre o el
// id de la campaña o de uno de sus anuncios (el texto de la UI, ads.js:752). Orden: utm_content contra anuncios,
// utm_content contra campañas, utm_campaign contra anuncios, utm_campaign contra campañas. Primera coincidencia gana:
// un registro cuenta para una sola campaña y, como mucho, un anuncio.
import { normUtm } from './normalizar.mjs';

// la clave de búsqueda: normUtm (como se guardan las UTMs del registro); vacío o macro sin reemplazar ({{ad.name}}) no busca
function clave(v) {
  const s = normUtm(v);
  return s && !/^\{\{[\w.]+\}\}$/.test(s) ? s : '';
}
const poner = (mapa, k, valor) => { if (k && !mapa.has(k)) mapa.set(k, valor); };

// campanas: [{id, nombre}] · anuncios: [{id, nombre, campana: {id, nombre?}}] (o campanaId). Si dos comparten nombre,
// queda el primero de la lista: conviene pasar primero los que tuvieron entrega.
// Indice = {anuncios: Map(clave → {campanaId, anuncioId}), campanas: Map(clave → {campanaId, anuncioId: null})}
export function indiceCampanas(campanas = [], anuncios = []) {
  const porAnuncio = new Map(), porCampana = new Map();
  const sumarCampana = (c) => {
    if (!c || c.id == null || c.id === '') return;
    const v = { campanaId: String(c.id), anuncioId: null };
    poner(porCampana, clave(c.nombre ?? c.name), v);
    poner(porCampana, clave(c.id), v);
  };
  for (const c of campanas || []) sumarCampana(c);
  for (const a of anuncios || []) {
    const campanaId = a?.campana?.id ?? a?.campanaId;
    if (!a || a.id == null || a.id === '' || campanaId == null || campanaId === '') continue;
    const v = { campanaId: String(campanaId), anuncioId: String(a.id) };
    poner(porAnuncio, clave(a.nombre ?? a.name), v);
    poner(porAnuncio, clave(a.id), v);
    if (a.campana) sumarCampana(a.campana);
  }
  return { anuncios: porAnuncio, campanas: porCampana };
}

// {campanaId, anuncioId (null si coincidió con la campaña)} o null
export function asignar(registro, indice) {
  const ads = indice?.anuncios, camps = indice?.campanas;
  if (!registro || !ads || !camps) return null;
  const u = registro.utm || {};
  const contenido = clave(u.utm_content), campana = clave(u.utm_campaign);
  const hit = (contenido && (ads.get(contenido) || camps.get(contenido))) || (campana && (ads.get(campana) || camps.get(campana)));
  return hit ? { campanaId: hit.campanaId, anuncioId: hit.anuncioId || null } : null;
}

// Extra a §6.11: el reparto de una lista de registros → {campanas: {id: {registros, calificados}}, anuncios: {…}, asignados}
export function repartir(registros, indice) {
  const campanas = Object.create(null), anuncios = Object.create(null);   // ids de Meta como claves
  let asignados = 0;
  const contar = (o, id, cal) => {
    const x = o[id] || (o[id] = { registros: 0, calificados: 0 });
    x.registros++;
    if (cal) x.calificados++;
  };
  for (const r of registros || []) {
    const a = asignar(r, indice);
    if (!a) continue;
    asignados++;
    const cal = r.calificado === true;
    contar(campanas, a.campanaId, cal);
    if (a.anuncioId) contar(anuncios, a.anuncioId, cal);
  }
  return { campanas, anuncios, asignados };
}
