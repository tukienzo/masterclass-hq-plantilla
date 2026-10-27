// Configuración del negocio: valores por defecto ← variables de entorno (§3.2) ← documento ajustes/negocio.
import { obtener, fusionar } from './almacen.mjs';
import { PAISES, esPais } from './telefono.mjs';
import { esHora } from './fechas.mjs';
import { monto } from './normalizar.mjs';

export const ESTADOS = ['Pendiente', 'Confirmada', 'Re-agenda', 'Presentada', 'No-show', 'Cerrada', 'Cancelada', 'Descalificada'];
export const INTEGRACIONES = ['meta', 'calendly', 'iclosed', 'fathom', 'ia', 'ac'];

export function env(nombre, porDefecto = '') {
  const v = process.env[nombre];
  return v == null || String(v).trim() === '' ? porDefecto : String(v).trim();
}

// En Netlify desplegado (no en `netlify dev` ni en scripts/dev.mjs)
export function enNetlify() {
  if (process.env.NETLIFY_DEV || process.env.NETLIFY_LOCAL) return false;
  return !!(process.env.NETLIFY || process.env.SITE_ID || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

const OPCIONES = {
  formatos: ['Masterclass en vivo', 'Webinar con Q&A', 'Taller práctico', 'Clase grabada'],
  cierres: ['Llamada', 'Checkout', 'Checkout + llamada'],
  roles: { equipo: 'Equipo', cliente: 'Cliente', closer: 'Closer' },
  vara: {   // referencias genéricas editables; las 11 claves siempre presentes (number | null)
    presupuesto: null, registros: null, pctCalificados: 30, pctAsistencia: 25, pctAgenda: 3,
    pctShow: 65, pctCierre: 20, ticket: null, roasObjetivo: 3, llamadasPorCloser: 7, diasLlamadas: 4 },
  listas: {
    siNo: ['Sí', 'No'],
    situacionVenta: ['Adentro en Llamada', 'Adentro en Seguimiento', 'Cerrado en 2 llamadas', 'Fee',
      'Seguimiento', 'Reagendó', 'Lo va a pensar', 'No cerró', 'No se presentó'],
    situacionCuota: ['Por Cobrar', 'Cobrado', 'Pago Dividido', 'Paga tarde', 'Completó PIF', 'No Paga'],
    cuota: ['Cuota 1', 'Cuota 2', 'Cuota 3', 'Cuota 4', 'Completó PIF', 'Adentro en Seguimiento', 'Fee'],
    conceptoEntrada: ['Adentro en Llamada', 'Adentro en Seguimiento', 'Fee'],
    conceptoDespues: ['Cuota 2', 'Cuota 3', 'Cuota 4', 'Completó PIF', 'Adentro en Seguimiento'] },
  medios: ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'USDT', 'Efectivo'],
  capitalTramos: [{ k: '>3K', desde: 3001 }, { k: '2-3K', desde: 2000 }, { k: '1-2K', desde: 1000 }, { k: '<1K', desde: 0 }],
  camposAgenda: ['Capital', 'Negocio', 'Urgencia', 'Decisor', 'Facturacion'],
  origenesPauta: ['MASTERCLASS', 'WEBINAR'],
  mapeoForm: [   // pregunta del form de agenda (minúsculas, sin tildes) contiene → campo de la fila
    { contiene: ['capital', 'invertir', 'inversion', 'presupuesto'], campo: 'Capital' },
    // Facturacion antes que Negocio: «¿Cuánto factura tu negocio?» es Facturacion (pipeline también elige por posición)
    { contiene: ['factur', 'ingres', 'ganas'], campo: 'Facturacion' },
    { contiene: ['negocio', 'dedicas', 'trabajas', 'ocupacion'], campo: 'Negocio' },
    { contiene: ['objetivo', 'lograr', 'meta'], campo: 'Objetivo' },
    { contiene: ['frena', 'traba', 'impide', 'problema'], campo: 'Traba' },
    { contiene: ['urgen', 'cuando', 'empezar'], campo: 'Urgencia' },
    { contiene: ['decid', 'socio', 'pareja'], campo: 'Decisor' },
    { contiene: ['instagram'], campo: 'Instagram' },
    { contiene: ['whatsapp', 'telefono', 'celular'], campo: 'WhatsApp' }],
};

// ajustes/negocio con caché de 30 s (lo leen inicio, publico, registro… en cada pedido)
let guardado = { t: 0, valor: null };
async function ajustesNegocio() {
  if (Date.now() - guardado.t < 30000 && guardado.valor) return guardado.valor;
  const doc = (await obtener('ajustes', 'negocio')) || {};
  guardado = { t: Date.now(), valor: doc };
  return doc;
}

const valida = (ok, v, porDefecto) => (v != null && v !== '' && ok(v) ? v : porDefecto);
const esColor = (v) => /^#[0-9a-f]{6}$/i.test(String(v));
function esMoneda(v) {
  const m = String(v).toUpperCase();
  if (!/^[A-Z]{3}$/.test(m)) return false;
  try { return Intl.supportedValuesOf ? Intl.supportedValuesOf('currency').includes(m) : !!new Intl.NumberFormat('es', { style: 'currency', currency: m }); } catch { return false; }
}
function esZona(v) {
  try { new Intl.DateTimeFormat('en', { timeZone: String(v) }); return true; } catch { return false; }
}
function esLocale(v) {
  try { return Intl.getCanonicalLocales(String(v)).length === 1; } catch { return false; }
}
const entero = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max; };

// Negocio = {nombre, color, moneda, zona, pais, locale, prefijoTel, duracionMin, horaPorDefecto}
export async function negocio() {
  const a = await ajustesNegocio();
  const de = (campo, variable, porDefecto) => (a[campo] != null && a[campo] !== '' ? a[campo] : env(variable, porDefecto));
  const pais = String(valida(esPais, de('pais', 'NEGOCIO_PAIS', 'AR'), 'AR')).toUpperCase();
  const prefPais = pais === 'AR' ? '549' : PAISES.find((p) => p[0] === pais)[2];
  const nombre = String(de('nombre', 'NEGOCIO_NOMBRE', 'Mi Negocio')).trim().slice(0, 80) || 'Mi Negocio';
  return {
    nombre,
    color: String(valida(esColor, de('color', 'NEGOCIO_COLOR', '#3b82f6'), '#3b82f6')).toLowerCase(),
    moneda: String(valida(esMoneda, de('moneda', 'NEGOCIO_MONEDA', 'USD'), 'USD')).toUpperCase(),
    zona: String(valida(esZona, de('zona', 'NEGOCIO_ZONA', 'America/Argentina/Buenos_Aires'), 'America/Argentina/Buenos_Aires')),
    pais,
    locale: String(valida(esLocale, de('locale', 'NEGOCIO_LOCALE', 'es-AR'), 'es-AR')),
    prefijoTel: String(valida((v) => /^\d{1,4}$/.test(String(v)), de('prefijoTel', 'NEGOCIO_PREFIJO_TEL', prefPais), prefPais)),
    duracionMin: Number(valida((v) => entero(v, 30, 600), de('duracionMin', 'WEBINAR_DURACION_MIN', 180), 180)),
    horaPorDefecto: String(valida(esHora, de('horaPorDefecto', 'WEBINAR_HORA', '20:00'), '20:00')),
  };
}

const lista = (v, porDefecto) => (Array.isArray(v) && v.length ? v : porDefecto);
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Opciones = {formatos, cierres, roles, vara, listas, medios, capitalTramos, camposAgenda, mapeoForm, origenesPauta}
export async function opciones() {
  const a = structuredClone(await ajustesNegocio());
  const o = structuredClone(OPCIONES);
  const vara = { ...o.vara };
  // con monto(): '20,5' = 20.5 y '1.500' = 1500 (con Number daban NaN y 1.5); lo que no se entiende deja el default
  for (const [k, v] of Object.entries(objeto(a.vara))) if (k in vara) vara[k] = v === '' || v == null ? null : (monto(v) ?? vara[k]);
  return {
    formatos: lista(a.formatos, o.formatos),
    cierres: lista(a.cierres, o.cierres),
    roles: { ...o.roles, ...objeto(a.roles) },
    vara,
    listas: { ...o.listas, ...objeto(a.listas) },
    medios: lista(a.medios, o.medios),
    capitalTramos: lista(a.capitalTramos, o.capitalTramos),
    camposAgenda: lista(a.camposAgenda, o.camposAgenda),
    mapeoForm: lista(a.mapeoForm, o.mapeoForm),
    origenesPauta: lista(a.origenesPauta, o.origenesPauta),
  };
}

export async function webinarActivoId() {
  const e = await obtener('ajustes', 'estado');
  return (e && e.webinarActivo) || null;
}

export async function fijarWebinarActivo(id) {
  await fusionar('ajustes', 'estado', { webinarActivo: id || null });
}
