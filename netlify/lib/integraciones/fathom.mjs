// Fathom: en esta versión solo se conecta (la UI dice "más adelante" para el análisis de las grabaciones).
// probar = GET /teams con X-Api-Key → los equipos, para elegir el de los closers (SPEC §8.5, §7.3.10).
const BASE = 'https://api.fathom.ai/external/v1';
const MAX_PAGINAS = 5;   // las cuentas tienen pocos equipos; el tope es por si el cursor no avanza
export const MAX_EQUIPO = 120;   // lo que conectar acepta como equipo: lo que se ofrece tiene que poder elegirse

// el nombre de un equipo, solo si es texto y entra en lo que se puede elegir
function nombreDe(x) {
  const n = typeof x === 'string' ? x : typeof x?.name === 'string' ? x.name : '';
  const t = n.trim();
  return t.length <= MAX_EQUIPO ? t : '';
}

async function pedir(url, clave) {
  let r;
  try {
    r = await fetch(url, { headers: { 'X-Api-Key': clave, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('El servicio no respondió: probá de nuevo');
  }
  if (r.status === 401 || r.status === 403) throw new Error('La clave no es válida');
  if (r.status === 429 || r.status >= 500) throw new Error('El servicio no respondió: probá de nuevo');
  if (!r.ok) throw new Error(`Fathom respondió ${r.status}: revisá la clave`);
  const j = await r.json().catch(() => null);
  // la respuesta trae items[] (con cursor) o es un array; de cada equipo sirve el nombre
  const items = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : null;
  if (!items) throw new Error('Fathom respondió algo inesperado: probá de nuevo');
  return { items, cursor: Array.isArray(j) ? '' : String(j.next_cursor || '') };
}

// cred = {clave, equipo?} → {detalle, opciones: {equipos: string[]}, elegir?}
export async function probar({ clave, equipo = '' } = {}) {
  if (!clave) throw new Error('Pegá la clave');
  // con un espacio o un carácter invisible fetch ni siquiera arma el header: no es un error de red
  if (!/^[\x21-\x7E]+$/.test(clave)) throw new Error('La clave tiene espacios o caracteres invisibles: copiala de nuevo de Fathom');
  const nombres = [];
  const vistos = new Set();
  let url = BASE + '/teams';
  for (let i = 0; i < MAX_PAGINAS && url; i++) {
    const { items, cursor } = await pedir(url, clave);
    for (const x of items) {
      const n = nombreDe(x);
      if (n && !nombres.includes(n)) nombres.push(n);
    }
    url = cursor && !vistos.has(cursor) ? `${BASE}/teams?cursor=${encodeURIComponent(cursor)}` : '';
    vistos.add(cursor);
  }

  const opciones = { equipos: nombres };
  const actual = typeof equipo === 'string' ? equipo.trim() : '';
  if (actual && nombres.includes(actual)) return { detalle: `Equipo ${actual}`, opciones };
  if (nombres.length === 1) return { detalle: `Equipo ${nombres[0]}`, opciones, elegir: { equipo: nombres[0] } };
  // el elegido ya no está en Fathom: se vacía para que la persona elija de la lista
  const elegir = actual ? { equipo: '' } : undefined;
  if (!nombres.length) return { detalle: 'La clave anda, pero Fathom no tiene equipos: creá el de los closers en Fathom', opciones, elegir };
  return { detalle: `La clave anda: elegí el equipo de los closers (hay ${nombres.length})`, opciones, elegir };
}
