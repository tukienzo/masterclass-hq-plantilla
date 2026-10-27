// Respuestas, errores y lectura de pedidos: lo que comparten todas las funciones.
// Regla de oro: una respuesta exitosa nunca lleva `error` ni `ok:false`; los errores van con status no 2xx.

export class HttpError extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra || {};
  }
}

const esHttpError = (e) => e instanceof HttpError || (e && e.name === 'HttpError' && Number.isInteger(e.status));

// headers: objeto (un valor array = varias líneas, p. ej. dos Set-Cookie), array de pares o Headers
function sumarHeaders(h, extra) {
  if (!extra) return;
  const pares = extra instanceof Headers || Array.isArray(extra) ? [...extra] : Object.entries(extra);
  for (const [k, v] of pares) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => h.append(k, String(x)));
    else h.append(k, String(v));
  }
}

// 200 por defecto. Content-type JSON y cache-control ('no-store' salvo que se pida otro; null = sin header).
// NO agrega ok:true: lo pone quien llama.
export function json(datos, { status = 200, headers = {}, cache = 'no-store' } = {}) {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  if (cache) h.set('cache-control', cache);
  sumarHeaders(h, headers);
  return new Response(JSON.stringify(datos), { status, headers: h });
}

export function error(status, mensaje, extra = {}) {
  return json({ ...extra, ok: false, error: String(mensaje || 'Algo falló: probá de nuevo') }, { status });
}

// El cuerpo como objeto JSON. Vacío → {}. Se puede llamar más de una vez con el mismo req.
const leidos = new WeakMap();
export function leerJSON(req, { max = 256 * 1024 } = {}) {
  if (!leidos.has(req)) leidos.set(req, leer(req, max));
  return leidos.get(req);
}
async function leer(req, max) {
  const largo = Number(req.headers.get('content-length') || 0);
  if (largo > max) throw new HttpError(400, 'Pedido inválido');
  let txt;
  try { txt = await req.text(); } catch { throw new HttpError(400, 'Pedido inválido'); }
  if (Buffer.byteLength(txt) > max) throw new HttpError(400, 'Pedido inválido');
  if (!txt.trim()) return {};
  let j;
  try { j = JSON.parse(txt); } catch { throw new HttpError(400, 'Pedido inválido'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new HttpError(400, 'Pedido inválido');
  return j;
}

// 405 si el método no está permitido (lo responde manejar con cache-control no-store)
export function metodo(req, permitidos) {
  if (!permitidos.includes(req.method)) throw new HttpError(405, 'Método no permitido');
}

export const query = (req) => new URL(req.url).searchParams;

export function ipDe(req, context) {
  const xff = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || xff || '0.0.0.0';
}

export function esHttps(req) {
  try { if (new URL(req.url).protocol === 'https:') return true; } catch { /* url rara */ }
  return (req.headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

// Envuelve un handler: HttpError → su status y mensaje; cualquier otra cosa → log + 500 genérico.
export function manejar(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (e) {
      if (esHttpError(e)) return error(e.status, e.message, e.extra);
      console.error(e);
      return error(500, 'Algo falló: probá de nuevo');
    }
  };
}
