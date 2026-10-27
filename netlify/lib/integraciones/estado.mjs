// Estado de las integraciones: lo guardado en integraciones/<cual> (cifrado) pisa a las variables de entorno,
// campo por campo. Los secretos nunca salen de acá en claro hacia el navegador (solo …últimos4).
import { obtener, fusionar, borrar } from '../almacen.mjs';
import { cifrar, descifrar, enmascarar } from '../cifrado.mjs';
import { INTEGRACIONES, env } from '../config.mjs';
import { HttpError } from '../http.mjs';

export const REQUISITOS = {
  meta: [['cuenta', 'la cuenta publicitaria'], ['pixel', 'el píxel']],
  calendly: [], iclosed: [], ia: [],
  fathom: [['equipo', 'el equipo de los closers']],
  ac: [['url', 'la URL de la API'], ['lista', 'la lista']],
};

// variable de la clave y campos resueltos de cada servicio: [campo, variable de entorno, por defecto]
const CLAVE_ENV = { meta: 'META_TOKEN', calendly: 'CALENDLY_TOKEN', iclosed: 'ICLOSED_API_KEY', fathom: 'FATHOM_API_KEY', ia: 'ANTHROPIC_API_KEY', ac: 'AC_KEY' };
const CAMPOS = {
  meta: [['cuenta', 'META_CUENTA'], ['pixel', 'META_PIXEL'], ['testCode'], ['capiToken', 'META_CAPI_TOKEN'],
    ['version', 'META_API_VERSION', 'v26.0'], ['cuentaNombre'], ['moneda'], ['zonaCuenta'], ['pixelNombre']],
  calendly: [['org'], ['usuario']],
  iclosed: [],
  fathom: [['equipo', 'FATHOM_EQUIPO']],
  ia: [['modelo', 'ICP_MODELO', 'claude-opus-5-5']],
  ac: [['url', 'AC_URL'], ['lista', 'AC_LISTA'], ['listaNombre']],
};
// los que van siempre en estadoPublico (como string)
const PUBLICOS = { meta: ['cuenta', 'pixel', 'testCode'], calendly: [], iclosed: [], fathom: ['equipo'], ia: [], ac: ['url', 'lista'] };

function validar(cual) {
  if (!INTEGRACIONES.includes(cual)) throw new HttpError(400, 'Integración desconocida');
}
const demoMeta = () => env('DEMO_META') === '1';

// Etiquetas de lo que falta para que el servicio quede completo (vacío = completo)
export const faltan = (cual, campos) => (REQUISITOS[cual] || []).filter(([k]) => !campos[k]).map(([, etiqueta]) => etiqueta);

// Integracion = {cual, conectada, clave, origen, doc, ...campos resueltos}
// conectada = hay clave y están los requisitos (o modo demo de Meta). Un estado 'error' no la desconecta.
export async function leerIntegracion(cual) {
  validar(cual);
  const guardado = await obtener('integraciones', cual);
  let doc = null, claveGuardada = '';
  if (guardado) {
    const { claveCifrada, ...resto } = guardado;
    doc = resto;
    if (claveCifrada) {
      try { claveGuardada = descifrar(claveCifrada); } catch { claveGuardada = ''; }   // la clave cambió: como si no hubiera
    }
  }
  const campos = {};
  for (const [k, variable, porDefecto = ''] of CAMPOS[cual]) {
    const g = doc?.[k];
    campos[k] = g != null && g !== '' ? String(g) : variable ? env(variable, porDefecto) : porDefecto;
  }
  if (cual === 'ac') campos.tags = doc?.tags && typeof doc.tags === 'object' ? doc.tags : {};

  if (cual === 'meta' && demoMeta()) {
    return { cual, conectada: true, clave: 'demo', origen: 'demo', doc, ...campos, cuenta: 'act_demo', pixel: '' };
  }
  const claveEnv = env(CLAVE_ENV[cual]);
  const clave = claveGuardada || claveEnv || null;
  const origen = claveGuardada ? 'guardada' : claveEnv ? 'env' : null;
  return { cual, conectada: !!clave && !faltan(cual, campos).length, clave, origen, doc, ...campos };
}

// parcial = {clave?, ...campos, estado, error, detalle, probado}; la clave se guarda solo cifrada
export async function guardarIntegracion(cual, parcial = {}) {
  validar(cual);
  const { clave, claveCifrada, ultimos4, ...resto } = parcial;
  const k = typeof clave === 'string' ? clave.trim() : '';
  if (k) Object.assign(resto, { claveCifrada: cifrar(k), ultimos4: k.slice(-4) });
  await fusionar('integraciones', cual, resto);
}

export async function borrarIntegracion(cual) {
  validar(cual);
  await borrar('integraciones', cual);
}

// Lo que devuelve /api/app {accion:'integraciones'} para un servicio (§7.3.9). Sin llamadas externas.
export async function estadoPublico(cual) {
  const i = await leerIntegracion(cual);
  const r = { estado: 'sin', detalle: '', error: '', falta: [], clave: '' };
  for (const k of PUBLICOS[cual]) r[k] = String(i[k] ?? '');
  if (i.origen === 'demo') return { ...r, estado: 'ok', detalle: 'Modo demo', clave: enmascarar(i.clave) };
  if (!i.clave) return r;

  r.clave = enmascarar(i.clave);
  const d = i.doc || {};
  const falta = faltan(cual, i);
  if (d.estado === 'error') {
    Object.assign(r, { estado: 'error', detalle: d.detalle || '', error: d.error || 'La clave no es válida' });
  } else if (falta.length) {
    const nombre = cual === 'meta' ? 'Token' : 'Clave';
    Object.assign(r, { estado: 'incompleta', falta, detalle: d.detalle || `${nombre} ${r.clave} · elegí ${falta.join(' y ')}` });
  } else {
    Object.assign(r, { estado: 'ok', detalle: d.detalle || 'Conectada' });
  }
  if (i.origen === 'env') r.detalle = (r.detalle || 'Clave') + ' (variable de entorno)';
  return r;
}
