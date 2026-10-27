// Acción `registros` de /api/app: la pantalla Registros de un webinar (totales, por día, por fuente, envíos y
// la tabla de personas). Devuelve todas las filas, de la más nueva a la más vieja, con pocos campos.
import { HttpError } from '../http.mjs';
import { negocio } from '../config.mjs';
import { idSeguro, texto } from '../normalizar.mjs';
import { obtenerWebinar } from '../webinars.mjs';
import { cargarRegistros, resumen, utmCompleta } from '../registros.mjs';

// Sin paginar, el tamaño de la respuesta depende de lo que manda cualquiera desde la landing (UTM de hasta 300):
// se recorta lo que la tabla solo muestra (fuente · campaña y el error en el title) para no acercarse a los 6 MB.
const UTM_MAX = 100, ERROR_MAX = 120;

// el estado de un envío tal como lo pinta la tabla: null = "—", {ok:true} = ✓, {ok:false, error} = ✗
const envio = (x) => (!x || typeof x !== 'object' ? null : x.ok === true ? { ok: true } : { ok: false, error: texto(x.error, ERROR_MAX) || 'Falló el envío' });
const iso = (s) => (typeof s === 'string' && !Number.isNaN(Date.parse(s)) ? s : new Date(0).toISOString());
const utmCorta = (u) => Object.fromEntries(Object.entries(utmCompleta(u)).map(([k, v]) => [k, v.slice(0, UTM_MAX)]));

const fila = (r) => ({
  creado: iso(r.creado),
  nombre: String(r.nombre || ''),
  email: String(r.email || ''),
  whatsapp: String(r.whatsapp || ''),
  utm: utmCorta(r.utm),
  calificado: r.calificado === true ? true : r.calificado === false ? false : null,
  ac: envio(r.ac),
  meta: envio(r.meta),
});

export const acciones = {
  registros: {
    roles: ['equipo', 'cliente'],
    fn: async ({ cuerpo }) => {
      const id = typeof cuerpo.id === 'string' ? cuerpo.id : '';
      const w = idSeguro(id) ? await obtenerWebinar(id) : null;
      if (!w) throw new HttpError(404, 'No existe ese webinar');
      const [neg, regs] = await Promise.all([negocio(), cargarRegistros({ w: id })]);
      const r = resumen(regs, neg.zona);
      const filas = regs.map(fila).sort((a, b) => (a.creado < b.creado ? 1 : a.creado > b.creado ? -1 : 0));
      return {
        total: r.total, porDia: r.porDia, porFuente: r.porFuente,
        calificados: r.calificados, respondieron: r.respondieron, envios: r.envios, filas,
      };
    },
  },
};
