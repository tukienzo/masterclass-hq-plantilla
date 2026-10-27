// Claude para el ICP con IA (§8.6): probar la clave y pedir los perfiles de comprador con salida JSON estricta.
// La clave es siempre la de leerIntegracion('ia') y se le pasa explícita al SDK: así no busca otra en el entorno
// (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN). El SDK sí respeta ANTHROPIC_BASE_URL (sirve para probar con un falso).
import Anthropic, {
  APIError, APIConnectionError, APIConnectionTimeoutError, APIUserAbortError,
  AuthenticationError, PermissionDeniedError, RateLimitError, NotFoundError,
} from '@anthropic-ai/sdk';
import { env } from '../config.mjs';

export const MODELO_DEFECTO = 'claude-opus-5-5';
const modeloDe = (m) => String(m || '').trim() || env('ICP_MODELO', MODELO_DEFECTO);

const tema = {
  type: 'object',
  properties: { titulo: { type: 'string' }, n: { type: 'integer' }, frases: { type: 'array', items: { type: 'string' } } },
  required: ['titulo', 'n', 'frases'],
  additionalProperties: false,
};
export const ESQUEMA_ICP = {
  type: 'object',
  properties: {
    perfiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          rasgos: {
            type: 'array',
            items: {
              type: 'object',
              properties: { campo: { type: 'string' }, valor: { type: 'string' } },
              required: ['campo', 'valor'],
              additionalProperties: false,
            },
          },
        },
        required: ['titulo', 'descripcion', 'rasgos'],
        additionalProperties: false,
      },
    },
    lectura: { type: 'string' },
    deseos: { type: 'array', items: tema },
    dolores: { type: 'array', items: tema },
  },
  required: ['perfiles', 'lectura', 'deseos', 'dolores'],
  additionalProperties: false,
};

export const SISTEMA_ICP = `Sos un analista de ventas. Con estos agregados de registros y llamadas de un webinar, armá de 2 a 6 perfiles de comprador. Cada rasgo tiene que usar un \`campo\` y un \`valor\` que existan **exactamente** en la lista que te paso. Priorizá rasgos que separen a los que compraron. \`deseos\` agrupa los textos de Objetivo y \`dolores\` los de Traba: \`n\` es cuántos textos caen en el tema y \`frases\` son citas textuales cortas de esos textos. No inventes números.

No incluyas datos personales en ninguna parte: ni nombres, ni mails, ni teléfonos, ni usuarios, ni links. Si una cita tiene alguno (o tiene [dato]), elegí otra.

Qué te paso (JSON):
- base.registros: los registros de la landing (n, respondieron, calificados, agendaron, presentaron, compraron, cash). base.pipeline: las personas con al menos una agenda (n, compraron, cash).
- landing: las preguntas de la landing. En un rasgo de landing, campo = el id de la pregunta y valor = el texto exacto de una de sus opciones. En cada opción, n = registros que la eligieron, y de ellos cuántos agendaron, se presentaron y compraron, y el cash; califica = la opción cuenta como calificada.
- agenda: las respuestas del form de agenda, una por persona. En un rasgo de agenda, campo = el nombre del campo (por ejemplo Capital) y valor = el texto exacto de una de sus respuestas.
- textos.Objetivo (qué quiere lograr) y textos.Traba (qué lo frena): textos libres, ya sin datos personales.

Reglas:
- Un perfil tiene de 1 a 4 rasgos y se tienen que cumplir todos a la vez: no pongas dos valores del mismo campo en un perfil.
- titulo: corto (hasta 8 palabras). descripcion: una o dos oraciones sobre quién es y por qué compra.
- Con menos de 5 casos no saques conclusiones fuertes: decilo en la lectura.
- lectura: un párrafo corto (3 a 5 oraciones) con lo más importante para vender mejor.
- Hasta 6 deseos y 6 dolores, con hasta 3 frases cada uno. Si no hay textos de un tipo, ese array va vacío.
- Escribí en castellano rioplatense, claro y sin jerga.`;

function cliente(clave, { baseURL, fetch, timeout, maxRetries } = {}) {
  if (!clave) throw new Error('Falta la clave de Anthropic en Integraciones');
  return new Anthropic({ apiKey: clave, baseURL: baseURL || undefined, timeout, maxRetries, ...(fetch ? { fetch } : {}) });
}

// Error del SDK → texto corto para la persona (sin la clave ni detalles internos)
function legible(e, claveMala, modelo) {
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) return claveMala;
  if (e instanceof RateLimitError || e?.status === 529) return 'Anthropic está saturado: probá en un rato';
  if (e instanceof APIUserAbortError || e instanceof APIConnectionTimeoutError) return 'Anthropic tardó demasiado: probá de nuevo';
  if (e instanceof APIConnectionError || (e instanceof APIError && e.status >= 500)) return 'El servicio no respondió: probá de nuevo';
  if (e instanceof NotFoundError) return `El modelo ${modelo} no está disponible para esta clave`;
  if (e instanceof APIError) {
    const m = String(e.error?.error?.message || e.message || '').replace(/\s+/g, ' ').trim();
    if (/credit balance/i.test(m)) return 'La cuenta de Anthropic no tiene saldo: cargá crédito y probá de nuevo';
    return 'Anthropic rechazó el pedido' + (m ? ': ' + m.slice(0, 140) : '');
  }
  return String(e?.message || '').slice(0, 160) || 'Algo falló con la IA: probá de nuevo';
}

// cred = {clave, modelo?, baseURL?, fetch?} (§6.11). Tira Error(mensaje legible) si la clave no sirve.
export async function probar(cred = {}) {
  const modelo = modeloDe(cred.modelo);
  try {
    await cliente(cred.clave, { baseURL: cred.baseURL, fetch: cred.fetch, timeout: 15000, maxRetries: 1 }).models.list({ limit: 1 });
  } catch (e) {
    throw new Error(legible(e, 'La clave no es válida', modelo));
  }
  return { detalle: `Lista para el ICP (${modelo})` };
}

// datos = solo agregados (icp-core.pedidoIA). → {perfiles, lectura, deseos, dolores} tal cual los devolvió Claude
// (el que llama valida los rasgos). opciones = {modelo?, baseURL?, fetch?}.
export async function generarPerfiles(datos, clave, opciones = {}) {
  const modelo = modeloDe(opciones.modelo);
  let r;
  try {
    const c = cliente(clave, { baseURL: opciones.baseURL, fetch: opciones.fetch, timeout: 12 * 60000, maxRetries: 2 });
    r = await c.beta.messages.create({
      model: modelo,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_ICP } },
      system: SISTEMA_ICP,
      messages: [{ role: 'user', content: JSON.stringify(datos) }],
    }, { signal: AbortSignal.timeout(13 * 60000) });   // tope total con reintentos: la background tiene 15 min
  } catch (e) {
    throw new Error(legible(e, 'La clave de Anthropic no es válida', modelo));
  }
  if (r?.stop_reason === 'refusal') throw new Error('La IA no pudo responder este pedido');
  if (r?.stop_reason === 'max_tokens') throw new Error('La respuesta de la IA quedó cortada: probá de nuevo');
  const texto = (r?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let j = null;
  try { j = JSON.parse(texto); } catch { /* abajo */ }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('La IA devolvió algo que no se pudo leer: probá de nuevo');
  return j;
}
