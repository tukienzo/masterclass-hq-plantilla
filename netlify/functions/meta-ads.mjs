// /api/meta-ads (GET, equipo y cliente): Meta Ads en tres modos (§7.10). Por campaña ?desde&hasta[&diario=1] (con
// los registros de la landing del período), anuncio por anuncio ?anuncios=1 y el gasto ?resumen=1. Solo lectura: nunca
// escribe en Meta. Sin token o sin cuenta responde {configurado:false, falta}, que el frontend entiende en los tres.
import { manejar, json, metodo, query, HttpError } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { negocio } from '../lib/config.mjs';
import { diaLocal, difDias, esFecha, hoyLocal, sumarDias } from '../lib/fechas.mjs';
import { leerIntegracion } from '../lib/integraciones/estado.mjs';
import { consultar, cuentaDe } from '../lib/integraciones/meta-ads.mjs';
import { cargarRegistros } from '../lib/registros.mjs';
import { indiceCampanas, repartir } from '../lib/atribucion.mjs';

const MAX_DIAS = 400;
const si = (q, k) => ['1', 'true'].includes(String(q.get(k) || '').trim().toLowerCase());
const r4 = (v) => Math.round(v * 10000) / 10000;

// desde/hasta YYYY-MM-DD, desde ≤ hasta, hasta 400 días; si faltan, los últimos 30 días hasta hoy (zona del negocio)
export function leerRango(q, zona) {
  const d = String(q.get('desde') || '').trim(), h = String(q.get('hasta') || '').trim();
  if ((d && !esFecha(d)) || (h && !esFecha(h))) throw new HttpError(400, 'Rango de fechas inválido');
  const hasta = h || hoyLocal(zona);
  const desde = d || sumarDias(hasta, -29);
  if (desde > hasta || difDias(desde, hasta) >= MAX_DIAS) throw new HttpError(400, 'Rango de fechas inválido');
  return { desde, hasta };
}

// los registros de todos los webinars con `dia` en el rango (día local del negocio)
async function registrosDe({ desde, hasta }, zona) {
  const diaDe = (r) => {
    if (esFecha(r.dia)) return r.dia;
    try { return r.creado ? diaLocal(r.creado, zona) : ''; } catch { return ''; }
  };
  return (await cargarRegistros()).filter((r) => { const dia = diaDe(r); return dia >= desde && dia <= hasta; })
    .map((r) => ({ ...r, dia: diaDe(r) }));
}

// modo por campaña: el reparto en cada campaña y el bloque landing (§7.10.1)
function conLanding(meta, regs, rep, neg) {
  const campanas = meta.cuenta.campanas.map((c) => ({ ...c, registros: rep.campanas[c.id]?.registros || 0, calificados: rep.campanas[c.id]?.calificados || 0 }));
  const registros = regs.length;
  const calificados = regs.filter((r) => r.calificado === true).length;
  const porDia = {};
  for (const r of regs) {
    const d = porDia[r.dia] || (porDia[r.dia] = { registros: 0, calificados: 0 });
    d.registros++;
    if (r.calificado === true) d.calificados++;
  }
  const gasto = campanas.reduce((s, c) => s + (Number(c.gasto) || 0), 0);
  const misma = String(meta.cuenta.moneda || '').toUpperCase() === neg.moneda;
  return {
    ...meta, cuenta: { ...meta.cuenta, campanas },
    landing: {
      registros, calificados, respondieron: regs.filter((r) => r.respondio === true).length,
      asignados: rep.asignados, sinAsignar: registros - rep.asignados,
      cpl: misma && registros ? r4(gasto / registros) : null, cplCalificado: misma && calificados ? r4(gasto / calificados) : null,
      porDia,
    },
  };
}

export default manejar(async (req) => {
  metodo(req, ['GET']);
  await requerir(req, ['equipo', 'cliente']);
  const q = query(req);
  const neg = await negocio();
  const modo = si(q, 'anuncios') ? 'anuncios' : si(q, 'resumen') ? 'resumen' : 'diario';
  const rango = leerRango(q, neg.zona);

  const integ = await leerIntegracion('meta');
  const falta = [];
  if (!integ.clave) falta.push('token');
  if (integ.origen !== 'demo' && !cuentaDe(integ.cuenta)) falta.push('cuenta');   // en demo la cuenta es act_demo
  if (falta.length) return json({ ok: true, configurado: false, falta });

  const meta = await consultar(modo, { ...rango, diario: si(q, 'diario') }, integ);
  if (modo === 'resumen') return json({ ok: true, configurado: true, ...meta });

  const regs = await registrosDe(rango, neg.zona);
  const rep = repartir(regs, indiceCampanas(meta.atribucion?.campanas, meta.atribucion?.anuncios));
  if (modo === 'diario') return json({ ok: true, configurado: true, ...conLanding(meta, regs, rep, neg) });

  const anuncios = meta.anuncios.map((a) => ({ ...a, registros: rep.anuncios[a.id]?.registros || 0, calificados: rep.anuncios[a.id]?.calificados || 0 }));
  return json({ ok: true, configurado: true, ...meta, anuncios, landing: { campanas: { ...rep.campanas } } });
});

export const config = { path: '/api/meta-ads', method: ['GET'] };
