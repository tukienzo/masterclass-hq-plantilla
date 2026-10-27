// /api/tablero — lo que necesitan Inicio, KPIs y Funnel: cada webinar (del más viejo al más nuevo) con su
// proyección calculada contra la vara y los agregados de sus registros. Solo equipo y cliente.
import { manejar, json, metodo } from '../lib/http.mjs';
import { requerir } from '../lib/sesion.mjs';
import { negocio, opciones, webinarActivoId } from '../lib/config.mjs';
import { listarWebinars } from '../lib/webinars.mjs';
import { calcular } from '../lib/proyeccion.mjs';
import { cargarRegistros, resumen } from '../lib/registros.mjs';

const porFecha = (a, b) => {
  const x = `${a.fecha || ''} ${a.hora || ''}`, y = `${b.fecha || ''} ${b.hora || ''}`;
  return x < y ? -1 : x > y ? 1 : 0;
};

export default manejar(async (req) => {
  metodo(req, ['GET']);
  await requerir(req, ['equipo', 'cliente']);
  const [neg, opc, ws, regs, activo] = await Promise.all([negocio(), opciones(), listarWebinars(), cargarRegistros(), webinarActivoId()]);

  const porWebinar = new Map();
  for (const r of regs) {
    if (!porWebinar.has(r.w)) porWebinar.set(r.w, []);
    porWebinar.get(r.w).push(r);
  }

  const webinars = [...ws].sort(porFecha).map((w) => {
    const r = resumen(porWebinar.get(w.id) || [], neg.zona);
    return {
      id: w.id, nombre: String(w.nombre || ''), fecha: w.fecha, hora: w.hora || '',
      ventana: Number(w.ventana) || 10,
      popup: w.popup && w.popup.fecha ? w.popup : null,
      proyeccion: calcular(w.proyeccion || {}, opc.vara),
      registros: { total: r.total, calificados: r.calificados, respondieron: r.respondieron, porFuente: r.porFuenteDet, porDia: r.porDiaCal },
    };
  });

  return json({ ok: true, webinarActivo: webinars.some((w) => w.id === activo) ? activo : null, webinars });
});

export const config = { path: '/api/tablero', method: ['GET'] };
