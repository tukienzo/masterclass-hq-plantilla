// /api/app: integraciones, conectar, desconectar y probar (SPEC §7.3.9-7.3.12). Cada servicio se prueba con el
// probar(cred) de su módulo (§6.11). Las claves nunca vuelven al navegador: solo …últimos4 (estadoPublico).
import { HttpError } from '../http.mjs';
import { INTEGRACIONES, negocio } from '../config.mjs';
import { leerIntegracion, guardarIntegracion, borrarIntegracion, estadoPublico, faltan } from '../integraciones/estado.mjs';
import { enmascarar } from '../cifrado.mjs';
import { idSeguro, httpsUrl, texto } from '../normalizar.mjs';
import * as meta from '../integraciones/meta-ads.mjs';
import * as calendly from '../integraciones/calendly.mjs';
import * as iclosed from '../integraciones/iclosed.mjs';
import * as fathom from '../integraciones/fathom.mjs';
import * as ia from '../integraciones/llm.mjs';
import * as ac from '../integraciones/activecampaign.mjs';
import * as capi from '../integraciones/meta-capi.mjs';

const EC = ['equipo', 'cliente'];
const MODULOS = { meta, calendly, iclosed, fathom, ia, ac };
const TIEMPO_PRUEBA = 40000;   // los probar tienen su timeout de 15 s por pedido; esto es por si alguno se cuelga

// lo que cada servicio deja elegir de una lista (siempre string) y cómo se valida lo que llega del modal
const SELECCION = { meta: ['cuenta', 'pixel'], fathom: ['equipo'], ac: ['lista'] };
const VALIDA = {
  cuenta: [(v) => /^act_\d{1,30}$/.test(v), 'Elegí la cuenta publicitaria de la lista'],
  pixel: [idSeguro, 'Elegí el píxel de la lista'],
  lista: [idSeguro, 'Elegí la lista de ActiveCampaign'],
  equipo: [(v) => v.length <= fathom.MAX_EQUIPO, 'Elegí el equipo de la lista'],
};
// una clave es texto ASCII visible: con un espacio, un salto o un invisible pegado, fetch no arma el header
const RE_CLAVE = /^[\x21-\x7E]+$/;
const INVISIBLES = /[\u200B-\u200D\u2060\uFEFF]/g;
// lo que un probar no puede pisar con extra/elegir
const PROTEGIDOS = new Set(['clave', 'claveCifrada', 'ultimos4', 'estado', 'error', 'detalle', 'probado', 'testCode']);

const textoDe = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function cualDe(cuerpo) {
  const c = cuerpo.cual;
  if (typeof c !== 'string' || !INTEGRACIONES.includes(c)) throw new HttpError(400, 'Esa integración no existe');
  return c;
}

// La URL de ActiveCampaign es el origen (https://<cuenta>.api-us1.com): se tolera la barra final o /api/3 pegados
function urlAC(s) {
  const u = httpsUrl(s);
  return u ? new URL(u).origin : '';
}

// el mensaje que ve la persona, sin la clave adentro aunque un servicio la repita
function legible(e, secretos = []) {
  let m = String(e?.message || '').trim() || 'No pude probar la conexión: probá de nuevo';
  for (const s of secretos) if (s && s.length >= 6) m = m.split(s).join(enmascarar(s));
  return m.slice(0, 300);
}

function conTiempo(promesa) {
  let t;
  const corte = new Promise((_, rechazar) => { t = setTimeout(() => rechazar(new Error('El servicio no respondió: probá de nuevo')), TIEMPO_PRUEBA); });
  return Promise.race([Promise.resolve(promesa), corte]).finally(() => clearTimeout(t));
}

// R-04: ids de las opciones y selecciones siempre como string (el modal compara con ===)
const opcionesTexto = (o) => Object.fromEntries(Object.entries(objeto(o)).map(([k, v]) => [k, !Array.isArray(v) ? v
  : v.map((x) => (x && typeof x === 'object' ? (x.id != null ? { ...x, id: String(x.id) } : { ...x }) : String(x ?? '')))]));
function camposDe(o, aTexto) {
  const r = {};
  for (const [k, v] of Object.entries(objeto(o))) {
    if (PROTEGIDOS.has(k) || v === undefined) continue;
    r[k] = aTexto ? (v == null ? '' : String(v)) : v;
  }
  return r;
}

async function conectar({ cuerpo }) {
  const cual = cualDe(cuerpo);
  const integ = await leerIntegracion(cual);
  if (integ.origen === 'demo') throw new HttpError(400, 'Meta está en modo demo: sacá DEMO_META del entorno para conectar una cuenta real');

  // 1) la clave: la nueva, o la guardada, o la del entorno
  const claveNueva = typeof cuerpo.clave === 'string' ? cuerpo.clave.replace(INVISIBLES, '').trim() : '';
  if (claveNueva.length > 4000) throw new HttpError(400, 'Esa clave es demasiado larga: pegá solo la clave');
  const clave = claveNueva || integ.clave;
  if (!clave) throw new HttpError(400, 'Pegá la clave');

  // 2) lo elegido en el modal ('' = no elegido: se usa lo guardado)
  const elegidas = {};
  for (const k of SELECCION[cual] || []) {
    const v = textoDe(cuerpo[k]);
    if (!v) continue;
    const [ok, mensaje] = VALIDA[k];
    if (!ok(v)) throw new HttpError(400, mensaje);
    elegidas[k] = v;
  }
  const cred = { clave };
  if (cual === 'ac') {
    const delCuerpo = textoDe(cuerpo.url);
    cred.url = urlAC(delCuerpo || integ.url);
    if (!cred.url) throw new HttpError(400, 'Pegá la URL de la API de ActiveCampaign');
    if (delCuerpo) elegidas.url = cred.url;
  }
  for (const k of SELECCION[cual] || []) cred[k] = elegidas[k] || integ[k] || '';

  // 3) probar contra el servicio
  let r;
  try {
    if (!RE_CLAVE.test(clave)) {
      throw new Error(claveNueva ? 'La clave tiene espacios o caracteres invisibles: copiala de nuevo del servicio'
        : integ.origen === 'env' ? 'La clave de la variable de entorno tiene espacios o caracteres raros: corregila en las variables del sitio'
          : 'La clave guardada tiene caracteres raros: pegala de nuevo');
    }
    r = objeto(await conTiempo(MODULOS[cual].probar(cred)));
  } catch (e) {
    const mensaje = legible(e, [clave]);
    // clave nueva que no anda: no se guarda nada. Reusando la guardada: queda el error a la vista
    if (!claveNueva) await guardarIntegracion(cual, { estado: 'error', error: mensaje, probado: new Date().toISOString() });
    throw new HttpError(400, mensaje);
  }

  // 4) guardar: selecciones del cuerpo, lo que eligió solo el servicio y sus datos extra
  const cambios = { ...elegidas, ...camposDe(r.elegir, true), ...camposDe(r.extra, false) };
  if (cual === 'meta') {
    // cambió la cuenta y el píxel que había no es de la cuenta nueva: se borra
    const cuentaAhora = cambios.cuenta ?? integ.cuenta;
    const pixelAhora = cambios.pixel ?? integ.pixel;
    const pixeles = Array.isArray(r.opciones?.pixeles) ? r.opciones.pixeles.map((p) => String(p?.id ?? p)) : null;
    if (cuentaAhora !== integ.cuenta && pixelAhora && pixeles && !pixeles.includes(pixelAhora)) Object.assign(cambios, { pixel: '', pixelNombre: '' });
    // el código de Eventos de prueba es de un píxel: si el píxel cambió o se vació, deja de valer (§7.3.12)
    if (integ.testCode && (cambios.pixel ?? integ.pixel) !== integ.pixel) cambios.testCode = '';
  }
  // los ids de etiquetas son de cada cuenta: se vacían solo si cambió la cuenta. Las dos URLs se comparan normalizadas
  // (la de una variable de entorno puede venir con /api/3 o con barra final y es la misma cuenta)
  if (cual === 'ac' && cambios.url && cambios.url !== urlAC(integ.url)) cambios.tags = {};

  let detalle = texto(r.detalle, 300) || 'Conectada';
  if (cual === 'meta') {
    const zona = cambios.zonaCuenta ?? integ.zonaCuenta;
    if ((cambios.cuenta ?? integ.cuenta) && zona && !detalle.includes('la cuenta usa')) {
      const n = await negocio();
      if (zona !== n.zona) detalle += ` · la cuenta usa ${zona}`;   // Meta corta los días en su zona
    }
  }

  const estadoDe = (campos) => (faltan(cual, campos).length ? 'incompleta' : 'ok');
  const estimado = estadoDe({ ...integ, ...cambios });
  await guardarIntegracion(cual, {
    ...(claveNueva ? { clave: claveNueva } : {}), ...cambios,
    estado: estimado, error: '', detalle, probado: new Date().toISOString(),
  });
  // lo vaciado vuelve a la variable de entorno si la hay: el estado se mide sobre lo que quedó de verdad
  const estado = estadoDe(await leerIntegracion(cual));
  if (estado !== estimado) await guardarIntegracion(cual, { estado });

  return { detalle, ...(r.opciones ? { opciones: opcionesTexto(r.opciones) } : {}) };
}

export const acciones = {
  // las 6 tarjetas, con lo guardado (sin llamadas externas)
  integraciones: {
    roles: EC,
    fn: async () => Object.fromEntries(await Promise.all(INTEGRACIONES.map(async (c) => [c, await estadoPublico(c)]))),
  },

  conectar: { roles: EC, fn: conectar },

  desconectar: {
    roles: EC,
    fn: async ({ cuerpo }) => {
      const cual = cualDe(cuerpo);
      await borrarIntegracion(cual);   // clave, selecciones y, en meta, el testCode
      const i = await leerIntegracion(cual);
      return {
        detalle: i.origen === 'env' ? 'Borré lo guardado: sigue conectada con la variable de entorno'
          : i.origen === 'demo' ? 'Borré lo guardado: Meta sigue en modo demo' : 'Desconectada',
      };
    },
  },

  // modo prueba del píxel: {testCode} manda un PageView de prueba; {salir:true} lo apaga
  probar: {
    roles: EC,
    fn: async ({ cuerpo }) => {
      const integ = await leerIntegracion('meta');
      if (cuerpo.salir === true) {
        if (integ.doc?.testCode) await guardarIntegracion('meta', { testCode: '' });
        return { detalle: 'Listo: los registros vuelven a contar para las campañas.' };
      }
      if (integ.origen === 'demo') throw new HttpError(400, 'En modo demo no se manda nada a Meta: conectá una cuenta real para probar el píxel');
      if (!integ.clave || !integ.pixel) throw new HttpError(400, 'Primero elegí el píxel');
      const testCode = textoDe(cuerpo.testCode);
      if (!/^[A-Za-z0-9]{4,30}$/.test(testCode)) throw new HttpError(400, 'Pegá el código de Eventos de prueba (letras y números)');
      await guardarIntegracion('meta', { testCode });   // queda aunque Meta rechace el evento
      try {
        await conTiempo(capi.eventoPrueba(testCode, { ...integ, testCode }));
      } catch (e) {
        throw new HttpError(400, legible(e, [integ.clave, integ.capiToken]));
      }
      return { detalle: 'Mandé un evento de prueba: buscalo en Eventos de prueba del Administrador de eventos.' };
    },
  },
};
