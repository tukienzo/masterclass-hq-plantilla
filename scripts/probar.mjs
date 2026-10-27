// Pruebas de contrato del backend (SPEC §11.1, casos 1 a 44) contra un servidor que ya está levantado.
// Cada caso mira status y forma (claves y tipos), no valores exactos, e imprime ✓ o ✗ con lo esperado y lo que llegó.
//
//   node scripts/semilla.mjs --reset     la demo recién cargada: los casos usan sus códigos y el 30 la pide así
//   DEMO_META=1 node scripts/dev.mjs     en otra terminal
//   node scripts/probar.mjs              (o npm run probar) · BASE_URL=http://localhost:8888 por defecto
//
// El caso 25 pide un servidor SIN DEMO_META: si el de BASE_URL está en modo demo se saltea, salvo que BASE_URL_SIN_DEMO
// apunte a otro servidor con la misma semilla y sin DEMO_META. Con DATOS_DIR (driver archivo) el caso 40 además mira
// la copia en crm-borrados.json. Node puro, sin dependencias. Sale con 1 si falla alguno.
//
// Lo que escribe se borra o se deja como estaba al final (agendas, ventas, webinar y persona de prueba, metas,
// anun-config, programas, el link UTM borrado, el webinar activo). Quedan: un registro nuevo en el webinar activo
// (registros no se borran desde la API), la persona de prueba dada de baja y el estado del sync de agendas, así que
// para volver a correrla entera hay que recargar la semilla con --reset (el caso 30 lo necesita).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const BASE = (process.env.BASE_URL || 'http://localhost:8888').replace(/\/+$/, '');
const BASE_SIN_DEMO = (process.env.BASE_URL_SIN_DEMO || '').replace(/\/+$/, '');
const CORRIDA = Date.now().toString(36);   // para nombres, mails y teléfonos que no choquen entre corridas
const CODIGOS = { equipo: 'DEMO-EQPO', laura: 'DEMO-LAUR' };
const LAURA = 'Laura Gómez', DIEGO = 'Diego Ruiz';
const ESTADOS = ['Pendiente', 'Confirmada', 'Re-agenda', 'Presentada', 'No-show', 'Cerrada', 'Cancelada', 'Descalificada'];
const CLAVES_PROY = ['presupuesto', 'registros', 'pctCalificados', 'pctAsistencia', 'pctAgenda', 'pctShow', 'pctCierre',
  'ticket', 'roasObjetivo', 'llamadasPorCloser', 'diasLlamadas'];
const INTEGRACIONES = ['meta', 'calendly', 'iclosed', 'fathom', 'ia', 'ac'];

/* ════════ utilidades ════════ */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const objeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const esISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s) && !Number.isNaN(Date.parse(s));
const hoyEn = (zona) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sumarDias = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mismo = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// una IP inventada por uso: los límites de acceso y de registro van por IP (scripts/dev.mjs toma x-nf-client-connection-ip)
const ipAzar = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
const digitos = (n) => String(parseInt(CORRIDA, 36) % 10 ** n).padStart(n, '0');

function mostrar(x, max = 240) {
  let s;
  try { s = typeof x === 'string' ? x : JSON.stringify(x); } catch { s = String(x); }
  if (s === undefined) s = String(x);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/* ════════ frasco de cookies (respeta Set-Cookie, también Max-Age=0 y Expires vencido) ════════ */
class Frasco {
  constructor() { this.c = new Map(); }
  guardar(lineas) {
    for (const linea of lineas) {
      const [par, ...attrs] = linea.split(';');
      const i = par.indexOf('=');
      if (i < 1) continue;
      const nombre = par.slice(0, i).trim(), valor = par.slice(i + 1).trim();
      let vencida = false;
      for (const a of attrs) {
        const j = a.indexOf('=');
        const k = (j < 0 ? a : a.slice(0, j)).trim().toLowerCase(), v = j < 0 ? '' : a.slice(j + 1).trim();
        if (k === 'max-age' && Number(v) <= 0) vencida = true;
        if (k === 'expires' && Date.parse(v) <= Date.now()) vencida = true;
      }
      if (vencida) this.c.delete(nombre); else this.c.set(nombre, valor);
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
  tiene(nombre) { return this.c.has(nombre); }
}

/* ════════ pedidos ════════ */
async function pedir(frasco, metodo, ruta, cuerpo, { ip, base = BASE } = {}) {
  const headers = { accept: 'application/json' };
  if (cuerpo !== undefined) headers['content-type'] = 'application/json';
  const cookie = frasco ? frasco.header() : '';
  if (cookie) headers.cookie = cookie;
  if (ip) headers['x-nf-client-connection-ip'] = ip;
  let res;
  try {
    res = await fetch(base + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(60000) });
  } catch (e) {
    return { status: 0, json: null, texto: `sin respuesta (${e.cause?.code || e.message})`, headers: new Headers(), setCookie: [] };
  }
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (frasco) frasco.guardar(setCookie);
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no era JSON */ }
  return { status: res.status, json, texto, headers: res.headers, setCookie };
}
const app = (f, accion, extra = {}, op) => pedir(f, 'POST', '/api/app', { accion, ...extra }, op);
const panel = (f, cuerpo) => pedir(f, 'POST', '/api/panel', cuerpo);
const crmPost = (f, cuerpo) => pedir(f, 'POST', '/api/crm', cuerpo);
const dbPost = (f, cuerpo) => pedir(f, 'POST', '/api/db', cuerpo);
const dbGet = (f, col) => pedir(f, 'GET', `/api/db?col=${encodeURIComponent(col)}`);
const entrar = (f, clave, op) => pedir(f, 'POST', '/api/acceso', { accion: 'entrar', clave }, op);
const de = (r) => `${r.status} ${mostrar(r.json ?? r.texto)}`;

/* ════════ casos ════════ */
class Falla extends Error {
  constructor(esperado, llego) { super(esperado); this.esperado = esperado; this.llego = llego; }
}
function exigir(cond, esperado, llego) {
  if (!cond) throw new Falla(esperado, typeof llego === 'string' ? llego : mostrar(llego));
}
function status(r, esperado, que = '') {
  exigir(r.status === esperado, `${que ? que + ' → ' : ''}${esperado}`, (que ? que + ' → ' : '') + de(r));
}
// 2xx con ok:true y sin error (la regla de oro de §6.1)
function exito(r, que = '') {
  exigir(r.status === 200 && r.json && r.json.ok === true && !('error' in r.json), `${que ? que + ' → ' : ''}200 {ok:true}`, (que ? que + ' → ' : '') + de(r));
  return r.json;
}
// status de error con `error` string legible
function falla(r, esperado, que = '', texto = null) {
  const bien = r.status === esperado && r.json && typeof r.json.error === 'string' && r.json.error.trim() && (texto == null || r.json.error === texto);
  exigir(bien, `${que ? que + ' → ' : ''}${esperado}${texto != null ? ` {error:'${texto}'}` : ' con error'}`, (que ? que + ' → ' : '') + de(r));
}
const hecho = (esperado, llego) => ({ esperado, llego });

const resultados = [];
async function caso(n, titulo, fn) {
  let r, e = null;
  try { r = await fn(); } catch (x) { e = x; }
  const num = String(n).padStart(2);
  if (!e && r && r.saltear) {
    resultados.push({ n, estado: 'saltado' });
    console.log(`–  ${num}  ${titulo}\n       salteado: ${r.saltear}`);
  } else if (!e) {
    resultados.push({ n, estado: 'ok' });
    console.log(`✓  ${num}  ${titulo}\n       esperado: ${r?.esperado ?? '—'} · llegó: ${r?.llego ?? '—'}`);
  } else {
    resultados.push({ n, estado: 'falla' });
    const esperado = e instanceof Falla ? e.esperado : 'que el caso corra sin tirar';
    const llego = e instanceof Falla ? e.llego : `tiró ${e?.stack || e}`;
    console.log(`✗  ${num}  ${titulo}\n       esperado: ${esperado} · llegó: ${llego}`);
  }
}

// lo que se deja como estaba al final, en orden inverso (los errores de limpieza solo se avisan)
const limpiezas = [];
const alFinal = (que, fn) => limpiezas.push([que, fn]);

const ctx = {};

/* ════════ arranque: servidor y códigos de la demo ════════ */
const E = new Frasco(), L = new Frasco();   // equipo y closer (Laura); el cliente de prueba lo crea el caso 29
{
  const r = await pedir(null, 'GET', '/api/publico');
  if (r.status === 0) {
    console.error(`✗ No hay servidor en ${BASE} (${r.texto}). Levantalo con node scripts/dev.mjs o pasá BASE_URL.`);
    process.exit(1);
  }
  const ip = ipAzar();   // si alguna corrida anterior dejó la IP local cortada por el límite, estos dos igual entran
  const ingresos = await Promise.all([entrar(E, CODIGOS.equipo, { ip }), entrar(L, CODIGOS.laura, { ip })]);
  const malos = ingresos.map((x, i) => [[CODIGOS.equipo, CODIGOS.laura][i], x]).filter(([, x]) => x.status !== 200);
  if (malos.length) {
    console.error(`✗ No pude entrar con los códigos de la demo (${malos.map(([c, x]) => `${c}: ${de(x)}`).join(' · ')}).`);
    console.error('  Cargá la semilla con el mismo SESION_SECRETO que el servidor: node scripts/semilla.mjs --reset');
    process.exit(1);
  }
  console.log(`Pruebas de contrato contra ${BASE} · corrida ${CORRIDA}\n`);
}

try {
  await correr();
} finally {
  for (const [que, fn] of limpiezas.reverse()) {
    try {
      const r = await fn();
      // un 404 es que ya lo había sacado el caso
      if (r && typeof r.status === 'number' && (r.status === 0 || (r.status >= 400 && r.status !== 404))) console.log(`  (no pude dejar como estaba: ${que} → ${de(r)})`);
    } catch (e) {
      console.log(`  (no pude dejar como estaba: ${que} → ${e.message})`);
    }
  }
}

const n = (estado) => resultados.filter((r) => r.estado === estado);
const nums = (estado) => n(estado).map((r) => r.n).sort((a, b) => a - b).join(', ');
console.log(`\n${n('ok').length} pasan · ${n('falla').length} fallan${n('falla').length ? ` (${nums('falla')})` : ''}`
  + `${n('saltado').length ? ` · ${n('saltado').length} salteados (${nums('saltado')})` : ''}`);
process.exit(n('falla').length ? 1 : 0);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function correr() {
  /* ── acceso y sesión ── */
  await caso(1, 'Endpoints protegidos sin cookie', async () => {
    const sin = new Frasco();
    const A = (accion) => ['POST', '/api/app', { accion }];
    const pedidos = [
      ['POST', '/api/acceso', { accion: 'yo' }],
      ...['inicio', 'webinar', 'proyectar', 'guardarWebinar', 'activar', 'borrarWebinar', 'tarea', 'registros', 'integraciones',
        'conectar', 'desconectar', 'probar', 'personas', 'persona'].map(A),
      ['GET', '/api/panel'], ['POST', '/api/panel', { row: 'ag_x', field: 'Notas', value: 'x' }],
      ...['add', 'adel', 'crmsync', 'finanzasget', 'liqpago', 'comisiones'].map((action) => ['POST', '/api/panel', { action }]),
      ['GET', '/api/agendas-sync'], ['POST', '/api/agendas-sync', {}],
      ['GET', '/api/crm'], ...['guardar', 'borrar', 'cierre', 'metas'].map((accion) => ['POST', '/api/crm', { accion }]),
      ['GET', '/api/db?col=utm-links'], ['POST', '/api/db', { col: 'utm-links', doc: { nombre: 'x' } }], ['DELETE', '/api/db?col=utm-links&id=x'],
      ['GET', '/api/icp?w=todos'], ['GET', '/api/meta-ads'], ['GET', '/api/meta-ads?anuncios=1'], ['GET', '/api/meta-ads?resumen=1'],
      ['GET', '/api/tablero'], ['GET', '/.netlify/functions/salud'],
    ];
    const malos = [];
    for (const [m, ruta, cuerpo] of pedidos) {
      const r = await pedir(sin, m, ruta, cuerpo);
      if (r.status !== 401 || typeof r.json?.error !== 'string' || !r.json.error.trim()) {
        malos.push(`${m} ${ruta}${cuerpo?.accion ? ' ' + cuerpo.accion : cuerpo?.action ? ' ' + cuerpo.action : ''} → ${de(r)}`);
      }
    }
    exigir(!malos.length, '401 con error en todos', malos.join(' | '));
    return hecho('401 con error (también /api/app inicio)', `${pedidos.length} pedidos, todos 401 con error`);
  });

  await caso(2, 'acceso entrar con el código en minúsculas y sin guion', async () => {
    const f = new Frasco();
    const r = await entrar(f, CODIGOS.equipo.toLowerCase().replace('-', ''), { ip: ipAzar() });
    exito(r, 'entrar');
    const sc = r.setCookie.find((s) => /^mhq_s=[^;]+/.test(s)) || '';
    exigir(sc && /;\s*httponly/i.test(sc), 'Set-Cookie: mhq_s=…; HttpOnly', r.setCookie.join(' / ') || 'sin Set-Cookie');
    exigir(r.json.yo?.rol === 'equipo', "yo.rol === 'equipo'", r.json.yo);
    return hecho("200, cookie mhq_s HttpOnly, yo.rol 'equipo'", `200, ${sc.split(';')[0].slice(0, 14)}…; HttpOnly, rol ${r.json.yo.rol}`);
  });

  await caso(3, '11 códigos malos seguidos', async () => {
    // sin cookie: con la IP cortada, acceso.mjs deja pasar solo a quien ya tiene sesión y pone su propio código
    const f = new Frasco(), ip = ipAzar();
    const vistos = [];
    for (let i = 1; i <= 11; i++) {
      const r = await entrar(f, `ZZZZ-ZZ${String(i).padStart(2, '0')}`, { ip });
      vistos.push(r.status);
      if (i < 11) exigir(r.status === 401, `intento ${i} → 401`, `intento ${i} → ${de(r)}`);
      else falla(r, 429, 'intento 11');
    }
    return hecho('el 11.º da 429', vistos.join(' '));
  });

  await caso(4, 'acceso yo / salir / yo', async () => {
    const f = new Frasco();
    exito(await entrar(f, CODIGOS.equipo, { ip: ipAzar() }), 'entrar');
    const y1 = await pedir(f, 'POST', '/api/acceso', { accion: 'yo' });
    exito(y1, 'yo');
    exigir(y1.json.yo?.uid && y1.json.yo?.rol === 'equipo', 'yo con uid y rol', y1.json);
    const s = await pedir(f, 'POST', '/api/acceso', { accion: 'salir' });
    exito(s, 'salir');
    const borra = s.setCookie.find((x) => /^mhq_s=/.test(x)) || '';
    exigir(/max-age=0/i.test(borra) && !f.tiene('mhq_s'), 'salir: Set-Cookie mhq_s=; Max-Age=0 y el frasco sin la cookie', s.setCookie.join(' / ') || 'sin Set-Cookie');
    const y2 = await pedir(f, 'POST', '/api/acceso', { accion: 'yo' });
    falla(y2, 401, 'yo después de salir');
    return hecho('200 / 200 + cookie borrada / 401', `${y1.status} / ${s.status} + ${borra.split(';').slice(0, 2).join(';')} / ${y2.status}`);
  });

  await caso(30, 'agendas-sync GET con la semilla recién cargada (antes del caso 13)', async () => {
    const r = await pedir(E, 'GET', '/api/agendas-sync');
    exito(r, 'GET /api/agendas-sync');
    exigir('estado' in r.json && r.json.estado === null, '{ok:true, estado:null}',
      `${de(r)} (si ya corriste el caso 13 antes, recargá la semilla con --reset)`);
    return hecho('{ok:true, estado:null}', mostrar(r.json));
  });

  /* ── inicio, roles y lecturas ── */
  await caso(6, 'inicio', async () => {
    const j = exito(await app(E, 'inicio'), 'inicio');
    exigir(objeto(j.yo) && j.yo.uid && j.yo.nombre && j.yo.rol === 'equipo', 'yo {uid, nombre, rol}', j.yo);
    exigir(Array.isArray(j.webinars), 'webinars array', j.webinars);
    const fechas = j.webinars.map((w) => `${w.fecha} ${w.hora}`);
    exigir(fechas.every((f, i) => i === 0 || fechas[i - 1] >= f), 'webinars por fecha descendente', fechas);
    exigir(objeto(j.opciones?.vara) && mismo(Object.keys(j.opciones.vara).sort(), [...CLAVES_PROY].sort()), 'opciones.vara con las 11 claves', j.opciones?.vara);
    const { moneda, zona } = j.cliente || {};
    let validos = /^[A-Z]{3}$/.test(moneda || '') && typeof zona === 'string';
    try { new Intl.NumberFormat('es', { style: 'currency', currency: moneda }); new Intl.DateTimeFormat('es', { timeZone: zona }); } catch { validos = false; }
    exigir(validos, 'cliente.moneda y cliente.zona válidos', j.cliente);
    // lo que usan los demás casos
    Object.assign(ctx, { zona, hoy: hoyEn(zona), activo: j.webinarActivo, webinars: j.webinars });
    ctx.mes = ctx.hoy.slice(0, 7);
    const faro = j.webinars.filter((w) => /faro$/.test(w.id));
    const lista = (faro.length >= 3 ? faro : j.webinars).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const pasados = lista.filter((w) => w.fecha < ctx.hoy);
    ctx.W2 = pasados.at(-1)?.id || null;
    ctx.W1 = pasados.at(-2)?.id || null;
    ctx.W3 = j.webinarActivo;
    exigir(ctx.W2 && ctx.W3, 'la semilla con un webinar pasado y uno activo', j.webinars);
    return hecho('yo, webinars desc, vara con 11 claves, moneda/zona válidas', `${j.webinars.length} webinars, activo ${j.webinarActivo}, ${moneda} · ${zona}`);
  });

  await caso(5, 'closer: lo que no puede y lo que sí', async () => {
    const prohibidos = [
      ['app registros', () => app(L, 'registros', { id: ctx.W2 })],
      ['app integraciones', () => app(L, 'integraciones')],
      ['app personas', () => app(L, 'personas')],
      ['/api/meta-ads', () => pedir(L, 'GET', '/api/meta-ads')],
      ['/api/meta-ads?anuncios=1', () => pedir(L, 'GET', '/api/meta-ads?anuncios=1')],
      ['/api/meta-ads?resumen=1', () => pedir(L, 'GET', '/api/meta-ads?resumen=1')],
      ['/api/icp', () => pedir(L, 'GET', '/api/icp?w=todos')],
      ['/api/tablero', () => pedir(L, 'GET', '/api/tablero')],
      ['panel adel', () => panel(L, { action: 'adel', row: 'ag_no_existe' })],
      ['panel finanzasget', () => panel(L, { action: 'finanzasget' })],
      ['crm borrar', () => crmPost(L, { accion: 'borrar', id: 'v_no_existe', tipo: 'venta', mes: ctx.mes })],
      ['/api/db?col=utm-links', () => dbGet(L, 'utm-links')],
    ];
    const permitidos = [
      ['app webinar', () => app(L, 'webinar', { id: ctx.W3 })],
      ['GET /api/panel', () => pedir(L, 'GET', '/api/panel')],
      ['GET /api/crm', () => pedir(L, 'GET', '/api/crm')],
      ['GET /api/db?col=ag-evaluaciones', () => dbGet(L, 'ag-evaluaciones')],
    ];
    const malos = [];
    for (const [que, fn] of prohibidos) {
      const r = await fn();
      if (r.status !== 403 || typeof r.json?.error !== 'string') malos.push(`${que} → ${de(r)} (esperaba 403)`);
    }
    for (const [que, fn] of permitidos) {
      const r = await fn();
      if (r.status !== 200 || r.json?.ok !== true) malos.push(`${que} → ${de(r)} (esperaba 200)`);
    }
    exigir(!malos.length, '403 en los 12 prohibidos y 200 en los 4 permitidos', malos.join(' | '));
    return hecho('403 en registros, integraciones, personas, meta-ads, icp, tablero, adel, finanzasget, crm borrar, db utm-links; 200 en webinar, panel, crm, db ag-evaluaciones',
      `${prohibidos.length} × 403 y ${permitidos.length} × 200`);
  });

  await caso(9, 'GET /api/panel', async () => {
    const j = exito(await pedir(E, 'GET', '/api/panel'), 'GET /api/panel');
    exigir(mismo(j.estados, ESTADOS), 'estados = los 8', j.estados);
    exigir(Array.isArray(j.rows) && j.rows.length, 'rows con las agendas de la semilla', mostrar(j.rows));
    const mala = j.rows.find((f) => !(typeof f._row === 'string' && f._row === f._id && /^[\w-]+$/.test(f._row)
      && esFecha(f['Fecha call']) && /^(\d{2}:\d{2})?$/.test(f.Hora) && (f._registro === null || objeto(f._registro))));
    exigir(!mala, "cada fila: _row === _id [\\w-], Fecha call YYYY-MM-DD, Hora HH:MM, _registro objeto o null", mala);
    const sinHora = j.rows.filter((f) => f.Hora === '').length;
    const conReg = j.rows.filter((f) => f._registro).length;
    return hecho('ok:true, 8 estados, filas con _row/_id, fecha, hora y _registro',
      `${j.rows.length} filas${sinHora ? ` (${sinHora} con Hora '', como deja el alta tolerante de R-05)` : ''}, ${conReg} con _registro`);
  });

  /* ── la landing pública y el registro ── */
  await caso(20, '/api/publico', async () => {
    const r = await pedir(null, 'GET', '/api/publico');
    const j = exito(r, 'GET /api/publico');
    exigir(objeto(j.webinar) && typeof j.webinar.inicio === 'string' && j.webinar.inicio.endsWith('Z') && !Number.isNaN(Date.parse(j.webinar.inicio)),
      'webinar.inicio ISO que termina en Z', j.webinar);
    const ps = j.webinar.landing?.preguntas;
    exigir(Array.isArray(ps) && ps.every((p) => !('calificadas' in p)) && !JSON.stringify(j).includes('"calificadas"'), 'landing sin calificadas', ps);
    const cdn = r.headers.get('netlify-cdn-cache-control');
    exigir(!!cdn, 'header Netlify-CDN-Cache-Control', [...r.headers.keys()].join(', '));
    return hecho('inicio …Z, sin calificadas, Netlify-CDN-Cache-Control', `inicio ${j.webinar.inicio}, ${ps.length} preguntas sin calificadas, CDN: ${cdn}`);
  });

  await caso(21, '/api/registro: alta, paso 2 calificado, duplicado, honeypot, 405 y firma mala', async () => {
    const ip = ipAzar();
    const reg = (cuerpo) => pedir(null, 'POST', '/api/registro', cuerpo, { ip });
    const total = async () => exito(await app(E, 'registros', { id: ctx.activo }), 'registros').total;
    const ficha = exito(await app(E, 'webinar', { id: ctx.activo }), 'webinar activo');
    const ps = ficha.webinar.landing.preguntas.filter((p) => p.opciones?.length);
    exigir(ps.some((p) => p.calificadas?.length), 'el webinar activo con una pregunta calificada (semilla)', ps);
    const t0 = await total();
    const alta = { nombre: 'Prueba Registro', email: `registro-${CORRIDA}@example.com`, pais: 'CO', whatsapp: `300555${digitos(4)}`, hp: '',
      utm: { utm_source: 'probar', utm_medium: 'test' }, eventId: `probar-${CORRIDA}-lead`, fbp: '', fbc: '', url: `${BASE}/`, ref: '' };
    const r1 = await reg(alta);
    const j1 = exito(r1, 'paso 1');
    exigir(j1.nuevo === true && /^r_[\w-]+$/.test(j1.ref || '') && typeof j1.firma === 'string' && j1.firma && j1.eventId === alta.eventId,
      'nuevo:true, ref r_…, firma y el mismo eventId', j1);
    const respuestas = Object.fromEntries(ps.map((p) => [p.id, p.calificadas?.[0] || p.opciones[0]]));
    const r2 = await reg({ paso: 'respuestas', ref: j1.ref, firma: j1.firma, respuestas });
    const j2 = exito(r2, 'paso 2');
    exigir(j2.calificado === true && typeof j2.eventId === 'string' && j2.eventId.endsWith('-cr'), "calificado:true y eventId que termina en '-cr'", j2);
    const t1 = await total();
    exigir(t1 === t0 + 1, `el total sube 1 (${t0} → ${t0 + 1})`, `${t0} → ${t1}`);
    const r3 = await reg(alta);
    const j3 = exito(r3, 'repetir el alta');
    // registro.mjs: el duplicado responde ref:'' y firma:'' (con el mail de otro no se contesta su paso 2)
    exigir(j3.nuevo === false && typeof j3.ref === 'string' && typeof j3.firma === 'string', 'nuevo:false (ref y firma string)', j3);
    const r4 = await reg({ ...alta, hp: 'soy un bot', email: `hp-${CORRIDA}@example.com`, whatsapp: `300556${digitos(4)}`, eventId: `probar-${CORRIDA}-hp` });
    exito(r4, 'honeypot');
    const t2 = await total();
    exigir(t2 === t1, 'honeypot sin guardar (el total no cambia)', `${t1} → ${t2}`);
    const r5 = await pedir(null, 'GET', '/api/registro');
    falla(r5, 405, 'GET /api/registro');
    const r6 = await reg({ paso: 'respuestas', ref: j1.ref, firma: 'x'.repeat(22), respuestas });
    falla(r6, 403, 'firma mala');
    return hecho("nuevo:true + ref + firma; calificado:true, eventId …-cr; total +1; duplicado nuevo:false; honeypot 200 sin guardar; GET 405; firma mala 403",
      `${j1.ref}; ${j2.eventId}; ${t0}→${t1}; nuevo:${j3.nuevo} (ref '${j3.ref}'); hp ${r4.status} total ${t2}; GET ${r5.status}; firma ${r6.status}`);
  });

  await caso(22, '/api/registro con el webinar terminado', async () => {
    exigir(ctx.W2, 'un webinar pasado en la semilla', ctx.webinars);
    exito(await app(E, 'activar', { id: ctx.W2 }), `activar ${ctx.W2}`);
    alFinal('volver a activar el webinar de la semilla', () => app(E, 'activar', { id: ctx.W3 }));
    try {
      const r = await pedir(null, 'POST', '/api/registro', { nombre: 'Prueba Cerrado', email: `cerrado-${CORRIDA}@example.com`, pais: 'CO',
        whatsapp: `300557${digitos(4)}`, hp: '', utm: {} }, { ip: ipAzar() });
      falla(r, 410, 'alta', 'cerrado');
      return hecho("410 {error:'cerrado'}", de(r));
    } finally {
      await app(E, 'activar', { id: ctx.W3 });
    }
  });

  await caso(31, 'activar W2 y después W3', async () => {
    const vuelta = [];
    for (const id of [ctx.W2, ctx.W3]) {
      exito(await app(E, 'activar', { id }), `activar ${id}`);
      const ini = exito(await app(E, 'inicio'), 'inicio');
      exigir(ini.webinarActivo === id, `inicio.webinarActivo === ${id}`, ini.webinarActivo);
      const pub = exito(await pedir(null, 'GET', '/api/publico'), 'publico');
      exigir(pub.webinar?.id === id, `publico webinar.id === ${id}`, pub.webinar?.id);
      vuelta.push(id);
    }
    const r = await app(E, 'activar', { id: `wno${CORRIDA}` });
    falla(r, 404, 'activar un id inexistente');
    return hecho('inicio y publico siguen a cada uno; inexistente 404', `${vuelta.join(' → ')}; inexistente ${r.status}`);
  });

  /* ── un webinar de prueba: ficha, tareas, landing, borrar ── */
  const esFicha = (j) => j && j.ok === true && objeto(j.webinar) && typeof j.webinar.id === 'string' && Array.isArray(j.webinar.tareas)
    && objeto(j.webinar.landing) && Array.isArray(j.webinar.landing.preguntas) && objeto(j.proyeccion) && objeto(j.proyeccion.entrada)
    && objeto(j.progreso) && ['hechas', 'total', 'vencidas', 'pct'].every((k) => typeof j.progreso[k] === 'number') && typeof j.activo === 'boolean';
  const fichaDe = (r, que) => { exigir(r.status === 200 && esFicha(r.json), `${que} → la Ficha {webinar, proyeccion, progreso, activo}`, `${que} → ${de(r)}`); return r.json; };

  await caso(7, 'webinar / proyectar / guardarWebinar (crear, datos, proyección, landing)', async () => {
    const fecha = sumarDias(ctx.hoy, 60);
    const f0 = fichaDe(await app(E, 'guardarWebinar', { webinar: { nombre: `Prueba probar ${CORRIDA}`, fecha, hora: '19:00', popup: null } }), 'crear');
    ctx.T = f0.webinar.id;
    alFinal('borrar el webinar de prueba', async () => { if (ctx.T) await app(E, 'borrarWebinar', { id: ctx.T }); });
    fichaDe(await app(E, 'webinar', { id: ctx.T }), 'webinar');
    const pr = exito(await app(E, 'proyectar', { proyeccion: { presupuesto: '1500', registros: '1200', pctCierre: '22,5', ticket: '' } }), 'proyectar');
    exigir(objeto(pr.proyeccion?.entrada) && mismo(Object.keys(pr.proyeccion.entrada).sort(), [...CLAVES_PROY].sort()) && pr.proyeccion.entrada.pctCierre === 22.5
      && pr.proyeccion.cpl === 1.25, 'proyectar: entrada con las 11 claves, pctCierre 22.5 y cpl 1.25', pr.proyeccion);
    // datos con cambio de fecha: todas las vence se corren +3
    const antes = new Map(f0.webinar.tareas.map((t) => [t.id, t.vence]));
    const f1 = fichaDe(await app(E, 'guardarWebinar', { webinar: { id: ctx.T, nombre: f0.webinar.nombre, fecha: sumarDias(fecha, 3), hora: '19:00', ventana: '7' } }), 'datos');
    const corridas = f1.webinar.tareas.filter((t) => antes.has(t.id) && t.vence === sumarDias(antes.get(t.id), 3)).length;
    exigir(f1.webinar.fecha === sumarDias(fecha, 3) && corridas === antes.size && antes.size > 0, `las ${antes.size} vence corridas +3`,
      `fecha ${f1.webinar.fecha}, ${corridas} de ${antes.size} corridas +3`);
    // proyección guardada numérica ('' borra la clave)
    const f2 = fichaDe(await app(E, 'guardarWebinar', { webinar: { id: ctx.T, proyeccion: { presupuesto: '1500', registros: '1.200', ticket: '900', pctCierre: '' } } }), 'proyección');
    const pg = f2.webinar.proyeccion;
    exigir(objeto(pg) && pg.presupuesto === 1500 && pg.ticket === 900 && typeof pg.registros === 'number' && Object.values(pg).every((v) => typeof v === 'number') && !('pctCierre' in pg),
      'proyeccion guardada numérica (sin la clave vacía)', pg);
    // landing: preguntas con id, opciones y calificadas
    const landing = { ...f2.webinar.landing, preguntas: [{ texto: '¿Ya vendés online?', opciones: 'Todavía no\n* Sí, poco\n* Sí, bastante' }] };
    const f3 = fichaDe(await app(E, 'guardarWebinar', { webinar: { id: ctx.T, landing } }), 'landing');
    const p = f3.webinar.landing.preguntas[0];
    exigir(p && typeof p.id === 'string' && /^[\w-]+$/.test(p.id) && Array.isArray(p.opciones) && p.opciones.length === 3 && mismo(p.calificadas, ['Sí, poco', 'Sí, bastante']),
      'pregunta con id, opciones (3) y calificadas (las de *)', p);
    return hecho('siempre la Ficha; vence +3; proyección numérica; preguntas con id/opciones/calificadas',
      `${ctx.T}: ${corridas} vence +3, proyección ${mostrar(pg)}, pregunta ${p.id}`);
  });

  await caso(8, 'tarea: marcar, nueva con bloque vacío y borrar', async () => {
    exigir(ctx.T, 'el webinar de prueba del caso 7', 'no se creó');
    const f = fichaDe(await app(E, 'webinar', { id: ctx.T }), 'webinar');
    const forma = (j) => j && j.ok === true && Array.isArray(j.tareas) && objeto(j.progreso) && typeof j.progreso.pct === 'number';
    const t0 = f.webinar.tareas[0];
    const r1 = await app(E, 'tarea', { id: ctx.T, tarea: t0.id, hecha: true });
    exigir(forma(r1.json) && r1.json.tareas.find((t) => t.id === t0.id)?.hecha === true, 'marcar → {tareas, progreso} con la tarea hecha', de(r1));
    const texto = `Tarea de prueba ${CORRIDA}`;
    const r2 = await app(E, 'tarea', { id: ctx.T, nueva: { texto, bloque: '', vence: '' } });
    exigir(forma(r2.json), 'nueva → {tareas, progreso}', de(r2));
    const ultima = r2.json.tareas.at(-1);
    exigir(ultima?.texto === texto && ultima.bloque === 'Otras' && ultima.vence === f.webinar.fecha, "la nueva al final, en el bloque 'Otras' y con vence = el día del vivo", ultima);
    const r3 = await app(E, 'tarea', { id: ctx.T, borrar: ultima.id });
    exigir(forma(r3.json) && !r3.json.tareas.some((t) => t.id === ultima.id), 'borrar → {tareas, progreso} sin la tarea', de(r3));
    return hecho("{tareas, progreso}; bloque 'Otras' al final", `marcada ${t0.id}, nueva en '${ultima.bloque}' (última de ${r2.json.tareas.length}), borrada; progreso ${r3.json.progreso.pct} %`);
  });

  await caso(39, 'landing con 3 preguntas y después sin la 2.ª (R-03)', async () => {
    exigir(ctx.T, 'el webinar de prueba del caso 7', 'no se creó');
    const f = fichaDe(await app(E, 'webinar', { id: ctx.T }), 'webinar');
    const A = { texto: '¿Cuál es tu rubro?', opciones: 'Servicios\n* Comercio' };
    const B = { texto: '¿Cuántas personas trabajan con vos?', opciones: 'Solo yo\nDe 2 a 5' };
    const Cq = { texto: '¿Cuándo querés empezar?', opciones: '* Ya mismo\nEn unos meses' };
    const f1 = fichaDe(await app(E, 'guardarWebinar', { webinar: { id: ctx.T, landing: { ...f.webinar.landing, preguntas: [A, B, Cq] } } }), 'con 3');
    const ids = f1.webinar.landing.preguntas.map((p) => p.id);
    exigir(ids.length === 3 && new Set(ids).size === 3, '3 preguntas con id distinto', f1.webinar.landing.preguntas);
    const f2 = fichaDe(await app(E, 'guardarWebinar', { webinar: { id: ctx.T, landing: { ...f1.webinar.landing, preguntas: [A, Cq] } } }), 'sin la 2.ª');
    const ids2 = f2.webinar.landing.preguntas.map((p) => p.id);
    exigir(ids2.length === 2 && ids2[1] === ids[2] && ids2[0] === ids[0], `la 3.ª conserva su id (${ids[2]})`, ids2);
    return hecho('la 3.ª conserva su id', `${ids.join(', ')} → ${ids2.join(', ')}`);
  });

  await caso(32, 'guardarWebinar de prueba, activarlo y borrarWebinar', async () => {
    exigir(ctx.T, 'el webinar de prueba del caso 7', 'no se creó');
    exito(await dbPost(E, { col: 'webinar-asistencia', doc: { id: ctx.T, asistentes: 12 } }), 'asistencia del webinar de prueba');
    exito(await app(E, 'activar', { id: ctx.T }), 'activar');
    const ini0 = exito(await app(E, 'inicio'), 'inicio');
    exigir(ini0.webinarActivo === ctx.T, `activo = ${ctx.T}`, ini0.webinarActivo);
    exito(await app(E, 'borrarWebinar', { id: ctx.T }), 'borrarWebinar');
    const borrado = ctx.T;
    ctx.T = null;
    const ini = exito(await app(E, 'inicio'), 'inicio');
    // §7.3.6: el próximo con fecha >= hoy (el más cercano); si no hay, el más reciente
    const asc = ini.webinars.slice().sort((a, b) => (`${a.fecha} ${a.hora}` < `${b.fecha} ${b.hora}` ? -1 : 1));
    const esperado = (asc.find((w) => w.fecha >= ctx.hoy) || asc.at(-1))?.id || null;
    exigir(ini.webinarActivo === esperado && ini.webinarActivo !== borrado, `el activo pasa a ${esperado} (§7.3.6)`, ini.webinarActivo);
    const w = await app(E, 'webinar', { id: borrado });
    falla(w, 404, 'webinar con ese id');
    const asis = exito(await dbGet(E, 'webinar-asistencia'), 'GET webinar-asistencia');
    exigir(!asis.docs.some((d) => d.id === borrado), `webinar-asistencia/${borrado} ya no está`, asis.docs.map((d) => d.id));
    if (ini.webinarActivo !== ctx.W3) await app(E, 'activar', { id: ctx.W3 });
    return hecho('el activo pasa a otro; webinar 404; sin su asistencia', `activo ${ini.webinarActivo}; webinar ${w.status}; asistencia borrada`);
  });

  /* ── registros, tablero, ICP y Meta ── */
  await caso(33, 'registros de W2', async () => {
    const j = exito(await app(E, 'registros', { id: ctx.W2 }), 'registros');
    exigir(typeof j.total === 'number' && objeto(j.porDia) && objeto(j.porFuente) && typeof j.porFuente['(sin UTM)'] === 'number',
      "total número, porDia objeto, porFuente['(sin UTM)'] número", { total: j.total, porFuente: j.porFuente });
    const env = (x) => objeto(x) && typeof x.ok === 'number' && typeof x.mal === 'number';
    exigir(env(j.envios?.ac) && env(j.envios?.meta), 'envios.ac y envios.meta con ok/mal', j.envios);
    exigir(Array.isArray(j.filas) && j.filas.length === j.total, 'filas = todas las del webinar', `${j.filas?.length} filas, total ${j.total}`);
    const mala = j.filas.find((f, i) => typeof f.whatsapp !== 'string' || !esISO(f.creado) || (i && j.filas[i - 1].creado < f.creado));
    exigir(!mala, 'filas de la más nueva a la más vieja, whatsapp string y creado ISO', mala);
    return hecho("total, porDia, porFuente['(sin UTM)'], envios, filas desc", `total ${j.total}, (sin UTM) ${j.porFuente['(sin UTM)']}, ${j.filas[0]?.creado} … ${j.filas.at(-1)?.creado}`);
  });

  await caso(27, '/api/tablero', async () => {
    const j = exito(await pedir(E, 'GET', '/api/tablero'), 'GET /api/tablero');
    exigir(Array.isArray(j.webinars) && j.webinars.length, 'webinars', j);
    const fechas = j.webinars.map((w) => `${w.fecha} ${w.hora}`);
    exigir(fechas.every((f, i) => i === 0 || fechas[i - 1] <= f), 'webinars por fecha ascendente', fechas);
    const conRegs = j.webinars.filter((w) => w.registros?.total > 0);
    exigir(conRegs.length && conRegs.every((w) => '(sin UTM)' in (w.registros.porFuente || {})), "registros.porFuente['(sin UTM)'] (la semilla tiene 8 % sin fuente)",
      j.webinars.map((w) => ({ id: w.id, porFuente: Object.keys(w.registros?.porFuente || {}) })));
    exigir(j.webinars.every((w) => typeof w.proyeccion?.entrada?.pctCierre === 'number'), 'proyeccion.entrada.pctCierre número', j.webinars.map((w) => w.proyeccion?.entrada));
    return hecho("webinars asc, porFuente['(sin UTM)'], pctCierre número", `${j.webinars.length} webinars, ${conRegs.length} con registros y (sin UTM)`);
  });

  await caso(23, '/api/icp?w=todos y ?w=W2', async () => {
    const vistos = [];
    for (const w of ['todos', ctx.W2]) {
      const j = exito(await pedir(E, 'GET', `/api/icp?w=${encodeURIComponent(w)}`), `icp ${w}`);
      exigir(j.w === w, `w === '${w}'`, j.w);
      const dims = j.utm?.dims;
      exigir(objeto(dims) && ['utm_source', 'utm_campaign', 'utm_content'].every((k) => Array.isArray(dims[k])), 'utm.dims con las 3 claves (arrays)', dims && Object.keys(dims));
      exigir(objeto(j.ia) && ['hayKey', 'estado', 'pid', 'error', 'resultado'].every((k) => k in j.ia), 'ia presente', j.ia);
      const malos = [];
      cadenas({ utm: j.utm, icp: j.icp }, '', malos);
      exigir(!malos.length, 'n ≥ agendaron ≥ presentaron ≥ compraron en cada grupo', malos.slice(0, 4).join(' | '));
      vistos.push(`${w}: n ${j.utm.totales?.n}, compraron ${j.utm.totales?.compraron}`);
    }
    return hecho('w igual al pedido, 3 dims, ia, n ≥ agendaron ≥ presentaron ≥ compraron', vistos.join(' · '));
  });

  await caso(24, 'icp-generar-background sin la integración ia', async () => {
    const pid = `pr${CORRIDA}`;
    const r = await pedir(E, 'POST', `/.netlify/functions/icp-generar-background?w=${encodeURIComponent(ctx.W2)}&pid=${pid}`);
    exigir(r.status === 202, '202', de(r));
    let ia = null;
    for (let i = 0; i < 40; i++) {
      await dormir(250);
      const j = exito(await pedir(E, 'GET', `/api/icp?w=${encodeURIComponent(ctx.W2)}`), 'icp');
      ia = j.ia;
      if (ia?.pid === pid && ia.estado !== 'working') break;
    }
    exigir(ia?.pid === pid && ia.estado === 'error' && typeof ia.error === 'string' && ia.error, `ia.estado 'error' con pid ${pid}`, ia);
    return hecho("202; después ia.estado 'error' con el pid pedido", `${r.status}; ${ia.estado} · ${ia.pid} · «${ia.error}»`);
  });

  // ¿el servidor corre con DEMO_META=1? (el 25 lo pide sin; el 26 con)
  const integ = await app(E, 'integraciones');
  ctx.demo = integ.json?.meta?.detalle === 'Modo demo';

  await caso(25, '/api/meta-ads sin DEMO_META', async () => {
    let f = E, base = BASE;
    if (ctx.demo) {
      if (!BASE_SIN_DEMO) return { saltear: `el servidor de ${BASE} corre con DEMO_META=1: pasá BASE_URL_SIN_DEMO (otro servidor con la misma semilla) para correrlo` };
      f = new Frasco();
      base = BASE_SIN_DEMO;
      const r = await entrar(f, CODIGOS.equipo, { ip: ipAzar(), base });
      exito(r, `entrar en ${BASE_SIN_DEMO}`);
    }
    for (const q of ['', '?anuncios=1', '?resumen=1']) {
      const r = await pedir(f, 'GET', '/api/meta-ads' + q, undefined, { base });
      const j = exito(r, `meta-ads${q}`);
      exigir(j.configurado === false && mismo(j.falta, ['token', 'cuenta']), `meta-ads${q} → {configurado:false, falta:['token','cuenta']}`, de(r));
    }
    return hecho("los 3 modos {configurado:false, falta:['token','cuenta']}", `3 × {configurado:false, falta:[token, cuenta]} en ${base}`);
  });

  await caso(26, '/api/meta-ads con DEMO_META=1', async () => {
    if (!ctx.demo) return { saltear: `el servidor de ${BASE} no corre con DEMO_META=1` };
    const d = exito(await pedir(E, 'GET', '/api/meta-ads?diario=1'), 'diario');
    exigir(d.configurado === true && objeto(d.rango) && esFecha(d.rango.desde) && esFecha(d.rango.hasta) && objeto(d.landing?.porDia) && Array.isArray(d.cuenta?.porDia),
      'diario: rango objeto y landing.porDia objeto', { rango: d.rango, landing: d.landing && Object.keys(d.landing) });
    const a = exito(await pedir(E, 'GET', '/api/meta-ads?anuncios=1'), 'anuncios');
    exigir(objeto(a.permisos) && Array.isArray(a.anuncios) && a.anuncios.length && a.anuncios.every((x) => objeto(x.campana) && x.campana.id),
      'anuncios=1: permisos y campana {id} en cada anuncio', { permisos: a.permisos, anuncios: a.anuncios?.slice(0, 2) });
    const s = exito(await pedir(E, 'GET', '/api/meta-ads?resumen=1'), 'resumen');
    exigir(typeof s.gasto === 'number' && Number.isFinite(s.gasto), 'resumen=1: gasto número', s);
    return hecho('diario con rango y landing.porDia; anuncios con permisos y campana; resumen con gasto',
      `rango ${d.rango.desde}…${d.rango.hasta}, ${a.anuncios.length} anuncios, gasto ${s.gasto}`);
  });

  await caso(43, '/api/meta-ads con desde > hasta', async () => {
    const r = await pedir(E, 'GET', '/api/meta-ads?desde=2026-10-10&hasta=2026-10-01');
    falla(r, 400, 'meta-ads', 'Rango de fechas inválido');
    return hecho("400 {error:'Rango de fechas inválido'}", de(r));
  });

  /* ── el pipeline ── */
  const filaDe = async (row) => exito(await pedir(E, 'GET', '/api/panel'), 'GET /api/panel').rows.find((f) => f._row === row);
  const agendaDePrueba = async (datos, que) => {
    const r = await panel(E, { action: 'add', 'Fecha call': ctx.hoy, ...datos });
    const j = exito(r, que);
    exigir(typeof j.row === 'string' && j.row, `${que} → {ok:true, row}`, de(r));
    alFinal(`borrar la agenda ${j.row}`, () => panel(E, { action: 'adel', row: j.row }));
    return j.row;
  };

  await caso(10, "POST /api/panel: Monto '1.500' y Estado 'Cerrada'", async () => {
    ctx.agEd = await agendaDePrueba({ Nombre: `Prueba Edición ${CORRIDA}`, Hora: '11:00', Email: `edicion-${CORRIDA}@example.com`, Closer: DIEGO, Estado: 'Pendiente' }, 'alta');
    exito(await panel(E, { row: ctx.agEd, field: 'Monto', value: '1.500' }), 'Monto');
    const f1 = await filaDe(ctx.agEd);
    exigir(f1?.Monto === 1500, 'Monto: 1500', f1?.Monto);
    exigir(!f1['Fecha cierre'], 'Fecha cierre vacía antes de cerrar', f1['Fecha cierre']);
    exito(await panel(E, { row: ctx.agEd, field: 'Estado', value: 'Cerrada' }), 'Estado');
    const f2 = await filaDe(ctx.agEd);
    exigir(f2?.Estado === 'Cerrada' && esFecha(f2['Fecha cierre']), "Estado 'Cerrada' con Fecha cierre YYYY-MM-DD", f2);
    return hecho("Monto 1500; 'Cerrada' llena Fecha cierre", `Monto ${f1.Monto}; Fecha cierre ${f2['Fecha cierre']}`);
  });

  await caso(11, 'un closer edita una fila de otro closer', async () => {
    exigir(ctx.agEd, 'la agenda del caso 10 (de Diego)', 'no se creó');
    const r = await panel(L, { row: ctx.agEd, field: 'Notas', value: 'la tomo yo' });
    falla(r, 403, 'Laura en una agenda de Diego');
    return hecho('403', de(r));
  });

  await caso(12, 'add dos veces la misma (email + fecha)', async () => {
    // las dos con la misma Hora: agendas.mjs toma otra hora el mismo día como otra llamada (re-agendó), no como duplicada
    const datos = { Nombre: `Prueba Duplicada ${CORRIDA}`, Hora: '12:00', Email: `duplicada-${CORRIDA}@example.com` };
    ctx.agDup = await agendaDePrueba(datos, 'primera');
    const n1 = exito(await pedir(E, 'GET', '/api/panel'), 'panel').rows.length;
    const r2 = await panel(E, { action: 'add', 'Fecha call': ctx.hoy, ...datos });
    const j2 = exito(r2, 'segunda');
    const n2 = exito(await pedir(E, 'GET', '/api/panel'), 'panel').rows.length;
    exigir(j2.duplicada === true && j2.row === ctx.agDup && n2 === n1, 'la segunda duplicada:true con el mismo row, sin fila nueva',
      `${mostrar(j2)}, filas ${n1} → ${n2}`);
    return hecho('duplicada:true, sin fila nueva', `row ${j2.row}, filas ${n1} → ${n2}`);
  });

  await caso(37, 'adel (equipo) sobre la agenda del caso 12, dos veces', async () => {
    exigir(ctx.agDup, 'la agenda del caso 12', 'no se creó');
    exito(await panel(E, { action: 'adel', row: ctx.agDup }), 'adel');
    const sigue = await filaDe(ctx.agDup);
    exigir(!sigue, 'la fila ya no sale en GET /api/panel', sigue);
    const r = await panel(E, { action: 'adel', row: ctx.agDup });
    falla(r, 404, 'adel otra vez');
    return hecho('200 y sin la fila / 404', `200, fuera del panel / ${r.status}`);
  });

  await caso(38, "add como el import: Capital '1500' y Hora '9'", async () => {
    const r = await panel(E, { action: 'add', Nombre: 'Prueba CSV', 'Fecha call': ctx.hoy, Capital: '1500', Hora: '9' });
    const j = exito(r, 'add');
    alFinal(`borrar la agenda ${j.row}`, () => panel(E, { action: 'adel', row: j.row }));
    const f = await filaDe(j.row);
    exigir(f && f.Capital === '1-2K' && f.Hora === '', "la fila con Capital '1-2K' y Hora ''", f && { Capital: f.Capital, Hora: f.Hora });
    return hecho("200; Capital '1-2K' y Hora ''", `Capital '${f.Capital}', Hora '${f.Hora}'`);
  });

  await caso(13, 'agendas-sync POST sin integraciones y después GET', async () => {
    const r = await pedir(E, 'POST', '/api/agendas-sync', {});
    const j = exito(r, 'POST');
    exigir(typeof j.cuando === 'string' && esISO(j.cuando) && !('estado' in j), 'POST sin envoltorio estado y con cuando ISO', j);
    exigir(mismo(j.iclosed, { fuente: 'iclosed', saltado: true }) && mismo(j.calendly, { fuente: 'calendly', saltado: true }),
      "iclosed {fuente:'iclosed', saltado:true} y calendly {fuente:'calendly', saltado:true}", { iclosed: j.iclosed, calendly: j.calendly });
    const g = exito(await pedir(E, 'GET', '/api/agendas-sync'), 'GET');
    exigir(objeto(g.estado) && g.estado.cuando && objeto(g.estado.iclosed) && objeto(g.estado.calendly), 'GET {ok:true, estado:{cuando, iclosed, calendly}}', g);
    return hecho('POST {cuando, iclosed, calendly} saltados; GET {ok, estado}', `POST ${mostrar(j)}; GET estado.cuando ${g.estado.cuando}`);
  });

  /* ── /api/db ── */
  await caso(14, '/api/db: merge, null que pisa, colección reservada e id con comilla', async () => {
    const orig = exito(await dbGet(E, 'anun-config'), 'GET anun-config').docs.find((d) => d.id === 'atribucion');
    alFinal('anun-config/atribucion como estaba', () => (orig
      ? dbPost(E, { col: 'anun-config', doc: { id: 'atribucion', tc: orig.tc ?? null, origenes: orig.origenes ?? null } })
      : pedir(E, 'DELETE', '/api/db?col=anun-config&id=atribucion')));
    exito(await dbPost(E, { col: 'anun-config', doc: { id: 'atribucion', tc: 2 } }), 'tc:2');
    const d2 = exito(await dbPost(E, { col: 'anun-config', doc: { id: 'atribucion', origenes: ['X'] } }), 'origenes').doc;
    exigir(d2?.tc === 2 && mismo(d2.origenes, ['X']), 'la 2.ª trae tc:2 y origenes', d2);
    const idA = `prueba-${CORRIDA}`;
    alFinal('borrar la asistencia de prueba', () => pedir(E, 'DELETE', `/api/db?col=webinar-asistencia&id=${idA}`));
    exito(await dbPost(E, { col: 'webinar-asistencia', doc: { id: idA, asistentes: 40 } }), 'asistentes:40');
    const a2 = exito(await dbPost(E, { col: 'webinar-asistencia', doc: { id: idA, asistentes: null } }), 'asistentes:null').doc;
    exigir(a2 && a2.asistentes === null, 'asistentes:null pisa', a2);
    const p = await dbPost(E, { col: 'personas', doc: { nombre: 'x' } });
    falla(p, 403, 'colección personas');
    const c = await dbPost(E, { col: 'utm-links', doc: { id: "x'y", nombre: 'x' } });
    falla(c, 400, 'id con comilla');
    return hecho('tc:2 y origenes; null pisa; personas 403; comilla 400', `${mostrar({ tc: d2.tc, origenes: d2.origenes })}; ${a2.asistentes}; ${p.status}; ${c.status}`);
  });

  await caso(42, '/api/db: programas en lote, rename cruzado y DELETE', async () => {
    const progs = () => dbGet(E, 'programas').then((r) => exito(r, 'GET programas').docs);
    const antes = await progs();
    const r1 = await dbPost(E, { col: 'programas', docs: [{ nombre: `Programa ${CORRIDA}` }, { nombre: `programa ${CORRIDA} ` }] });
    falla(r1, 409, 'dos nombres iguales por norm');
    const despues = await progs();
    exigir(despues.length === antes.length && !despues.some((p) => norm(p.nombre) === norm(`Programa ${CORRIDA}`)), 'no se guarda ninguno', despues.map((p) => p.nombre));
    exigir(antes.length >= 2, 'los dos programas de la semilla', antes.map((p) => p.nombre));
    const [a, b] = antes;
    const r2 = await dbPost(E, { col: 'programas', docs: [{ id: a.id, nombre: b.nombre }, { id: b.id, nombre: a.nombre }] });
    const j2 = exito(r2, 'rename cruzado');
    alFinal('los nombres de los programas como estaban', () => dbPost(E, { col: 'programas', docs: [{ id: a.id, nombre: a.nombre }, { id: b.id, nombre: b.nombre }] }));
    exigir(Array.isArray(j2.docs) && j2.docs.find((d) => d.id === a.id)?.nombre === b.nombre, 'el rename quedó guardado', j2.docs);
    exito(await dbPost(E, { col: 'programas', docs: [{ id: a.id, nombre: a.nombre }, { id: b.id, nombre: b.nombre }] }), 'deshacer el rename');
    const links = exito(await dbGet(E, 'utm-links'), 'GET utm-links').docs;
    const uno = links.find((d) => d.id === 'u_demo_bio') || links[0];
    exigir(uno, 'un link UTM de la semilla', links);
    const { creado, actualizado, ...copia } = uno;
    alFinal(`devolver el link UTM ${uno.id}`, () => dbPost(E, { col: 'utm-links', doc: copia }));
    exito(await pedir(E, 'DELETE', `/api/db?col=utm-links&id=${encodeURIComponent(uno.id)}`), 'DELETE');
    const quedan = exito(await dbGet(E, 'utm-links'), 'GET utm-links').docs;
    exigir(!quedan.some((d) => d.id === uno.id), `${uno.id} ya no está en el GET`, quedan.map((d) => d.id));
    exito(await pedir(E, 'DELETE', `/api/db?col=utm-links&id=no-existe-${CORRIDA}`), 'DELETE de un id que no existe');
    return hecho('409 sin guardar · 200 · 200 y fuera del GET · 200', `${r1.status} · ${r2.status} · ${uno.id} borrado · 200`);
  });

  /* ── el CRM ── */
  await caso(15, 'GET /api/crm (equipo y closer)', async () => {
    const j = exito(await pedir(E, 'GET', `/api/crm?mes=${ctx.mes}`), 'equipo');
    exigir(/^\d{4}-\d{2}$/.test(j.hoy || ''), 'hoy = YYYY-MM', j.hoy);
    exigir(objeto(j.yo) && j.yo.rol === 'equipo' && j.yo.closer === '', "yo {rol:'equipo', closer:''}", j.yo);
    const lb = j.leaderboard?.closers;
    exigir(Array.isArray(lb) && lb.every((c, i) => typeof c.k?.cash === 'number' && (i === 0 || lb[i - 1].k.cash >= c.k.cash)), 'leaderboard.closers ordenado por cash', lb?.map((c) => [c.closer, c.k?.cash]));
    exigir(Array.isArray(j.registros), 'registros array', j.registros);
    const l = exito(await pedir(L, 'GET', `/api/crm?mes=${ctx.mes}`), 'closer');
    const ajenos = (l.registros || []).filter((r) => norm(r.closer) !== norm(LAURA));
    exigir(Array.isArray(l.registros) && !ajenos.length && norm(l.yo?.closer) === norm(LAURA), 'el closer ve solo lo suyo', ajenos.slice(0, 3));
    return hecho('hoy YYYY-MM, yo, leaderboard por cash; closer solo lo suyo',
      `hoy ${j.hoy}, ${lb.map((c) => `${c.closer} ${c.k.cash}`).join(' / ')}; Laura ve ${l.registros.length} de ${j.registros.length}`);
  });

  // la venta de prueba de los casos 16, 41, 17, 18 y 40 (con su agenda, para la conciliación)
  let venta = null;
  const ventaDePrueba = async () => {
    if (venta) return venta;
    const nombre = `Prueba Cierre ${CORRIDA}`, mail = `cierre-${CORRIDA}@example.com`;
    ctx.agCierre = await agendaDePrueba({ Nombre: nombre, Hora: '13:00', Email: mail, Closer: LAURA, Estado: 'Presentada' }, 'agenda de la venta');
    const r = await crmPost(E, { accion: 'guardar', registro: { tipo: 'venta', mes: ctx.mes, nombre, mail, closer: LAURA, fecha: ctx.hoy, presento: 'Sí', califica: 'Sí', agenda: ctx.agCierre } });
    const j = exito(r, 'crear la venta');
    exigir(objeto(j.registro) && /^v_/.test(j.registro.id || '') && j.registro.v === 1, 'la venta nueva con id v_… y v 1', j.registro);
    venta = j.registro;
    alFinal(`borrar la venta ${venta.id}`, () => crmPost(E, { accion: 'borrar', id: venta.id, tipo: 'venta', mes: ctx.mes }));
    return venta;
  };

  await caso(16, 'crm guardar con base vieja', async () => {
    const v = await ventaDePrueba();
    const r = await crmPost(E, { accion: 'guardar', base: v.v - 1, registro: { id: v.id, tipo: 'venta', notas: 'cambio con base vieja' } });
    falla(r, 409, 'guardar');
    exigir(objeto(r.json.registro) && r.json.registro.id === v.id, '409 con registro (el actual)', r.json);
    return hecho('409 con registro', `${r.status} «${r.json.error}», registro ${r.json.registro.id} v${r.json.registro.v}`);
  });

  const plan = () => ({ programa: 'Programa Insignia', total: 900, filas: [
    { concepto: 'Adentro en Llamada', monto: 450, fecha: ctx.hoy, pagado: true, medio: 'Transferencia' },
    { concepto: 'Cuota 2', monto: 450, fecha: sumarDias(ctx.hoy, 30), pagado: false, medio: '' }] });

  await caso(41, 'crm cierre con una fila sin fecha y con total 0', async () => {
    const v = await ventaDePrueba();
    const p1 = plan();
    delete p1.filas[1].fecha;
    const r1 = await crmPost(E, { accion: 'cierre', id: v.id, mes: ctx.mes, plan: p1 });
    falla(r1, 400, 'fila sin fecha', 'Revisá la fecha de cada pago');
    const r2 = await crmPost(E, { accion: 'cierre', id: v.id, mes: ctx.mes, plan: { ...plan(), total: 0 } });
    falla(r2, 400, 'total 0', 'Poné el precio total');
    return hecho("400 'Revisá la fecha de cada pago' / 400 'Poné el precio total'", `${de(r1)} / ${de(r2)}`);
  });

  await caso(17, 'crm cierre con 2 filas (una impaga) y segundo cierre', async () => {
    const v = await ventaDePrueba();
    const p = plan();
    const r = await crmPost(E, { accion: 'cierre', id: v.id, mes: ctx.mes, plan: p });
    const j = exito(r, 'cierre');
    exigir(typeof j.registro?.plan?.mensaje === 'string' && j.registro.plan.mensaje.trim(), 'venta con plan.mensaje', j.registro?.plan);
    venta = j.registro;
    const mesCuota = p.filas[1].fecha.slice(0, 7);
    const m = exito(await pedir(E, 'GET', `/api/crm?mes=${mesCuota}`), `GET /api/crm?mes=${mesCuota}`);
    const cuota = m.registros.find((x) => x.tipo === 'cuota' && x.venta === v.id);
    if (cuota) alFinal(`borrar la cuota ${cuota.id}`, () => crmPost(E, { accion: 'borrar', id: cuota.id, tipo: 'cuota', mes: mesCuota }));
    exigir(cuota && cuota.mes === mesCuota && cuota.porCobrar === 450 && cuota.fecha === p.filas[1].fecha, `la cuota en ${mesCuota} (el mes en que vence) con venta = ${v.id}`, cuota || m.registros.filter((x) => x.tipo === 'cuota').map((x) => x.venta));
    const r2 = await crmPost(E, { accion: 'cierre', id: v.id, mes: ctx.mes, plan: p });
    falla(r2, 409, 'segundo cierre');
    return hecho('plan.mensaje; cuota en el mes de vencimiento; segundo cierre 409', `mensaje de ${j.registro.plan.mensaje.split('\n').length} líneas; cuota ${cuota.id} en ${cuota.mes}; ${r2.status}`);
  });

  await caso(18, 'crmsync después de cargar la venta', async () => {
    exigir(venta?.plan, 'la venta con su cierre (caso 17)', venta);
    const j = exito(await panel(E, { action: 'crmsync', previo: false }), 'crmsync');
    exigir(typeof j.actualizados === 'number' && j.actualizados >= 1, 'actualizados ≥ 1', j);
    const f = await filaDe(ctx.agCierre);
    exigir(f?.Estado === 'Cerrada' && typeof f.Monto === 'number' && f.Monto === 450, "la fila Cerrada con Monto 450 (el cash de la venta)", f && { Estado: f.Estado, Monto: f.Monto });
    return hecho("actualizados ≥ 1; la fila 'Cerrada' con Monto", `actualizados ${j.actualizados}; ${f.Estado}, Monto ${f.Monto}, Programa ${f.Programa}`);
  });

  await caso(40, 'crm metas y crm borrar', async () => {
    const antes = exito(await pedir(E, 'GET', `/api/crm?mes=${ctx.mes}`), 'GET /api/crm').metas;
    alFinal('las metas como estaban', () => crmPost(E, { accion: 'metas', metas: antes || {} }));
    exito(await crmPost(E, { accion: 'metas', metas: { objetivoMes: 20000 } }), 'metas');
    const despues = exito(await pedir(E, 'GET', `/api/crm?mes=${ctx.mes}`), 'GET /api/crm').metas;
    exigir(mismo(despues, { objetivoMes: 20000 }), 'metas exactamente {objetivoMes:20000}', despues);
    exito(await crmPost(E, { accion: 'metas', metas: antes || {} }), 'devolver las metas');
    const v = await ventaDePrueba();
    exito(await crmPost(E, { accion: 'borrar', id: v.id, tipo: 'venta', mes: ctx.mes }), 'borrar');
    const sigue = exito(await pedir(E, 'GET', `/api/crm?mes=${ctx.mes}`), 'GET /api/crm').registros.some((x) => x.id === v.id);
    exigir(!sigue, 'la venta ya no está en el mes', v.id);
    const b = await dbGet(E, 'crm-borrados');
    falla(b, 403, '/api/db?col=crm-borrados');
    // con el driver archivo se puede mirar la copia en el disco (DATOS_DIR, relativo a la raíz del repo, como el driver)
    let copia = 'sin mirar el disco (DATOS_DIR no está en el entorno)';
    if (process.env.DATOS_DIR) {
      const archivo = path.join(path.resolve(RAIZ, process.env.DATOS_DIR), 'crm-borrados.json');
      exigir(existsSync(archivo), 'la copia en crm-borrados', `no existe ${archivo}`);
      const docs = JSON.parse(readFileSync(archivo, 'utf8'));
      const k = Object.keys(docs).find((x) => x.startsWith(v.id + '-'));
      exigir(k && docs[k].data?.original?.id === v.id, `crm-borrados/${v.id}-<ms> con original`, Object.keys(docs).slice(-3));
      copia = `copia ${k}`;
    }
    return hecho('metas exactamente {objetivoMes:20000} · borrar 200 con copia en crm-borrados (db → 403)', `${mostrar(despues)} · borrada, db ${b.status}, ${copia}`);
  });

  /* ── finanzas ── */
  await caso(19, 'finanzasget / liqpago / comisiones', async () => {
    const f = exito(await panel(E, { action: 'finanzasget' }), 'finanzasget');
    exigir(objeto(f.meses) && objeto(f.metas) && objeto(f.liq) && objeto(f.comisiones) && typeof f.comisiones.def === 'number' && objeto(f.comisiones.pct),
      'finanzasget {meses, metas, comisiones {def, pct}, liq}', Object.keys(f));
    const malMes = Object.entries(f.meses).find(([k, m]) => m.mes !== k || !Array.isArray(m.ventas) || !Array.isArray(m.cuotas)
      || m.cuotas.some((c) => typeof c.v !== 'number' || typeof c.de !== 'string')
      || m.ventas.some((v) => typeof v.total !== 'number' || typeof v.programa !== 'string'));
    exigir(!malMes, 'cada mes {mes, ventas (programa, total), cuotas (v, de)}', malMes);
    // liqpago en un mes sin liquidaciones: el pct lo pone el servidor; después se vuelve a dejar vacío
    const mesLiq = '2020-01';
    const l = exito(await panel(E, { action: 'liqpago', mes: mesLiq, closer: DIEGO, pago: { monto: 120, fecha: ctx.hoy } }), 'liqpago');
    alFinal('borrar la liquidación de prueba', () => panel(E, { action: 'liqpago', mes: mesLiq, closer: DIEGO, pago: null }));
    const pago = l.liq?.[norm(DIEGO)];
    exigir(objeto(pago) && pago.monto === 120 && typeof pago.pct === 'number' && pago.fecha === ctx.hoy, 'liqpago guarda pct sin que el cliente lo mande', l.liq);
    const vacio = exito(await panel(E, { action: 'liqpago', mes: mesLiq, closer: DIEGO, pago: null }), 'liqpago null');
    exigir(mismo(vacio.liq, {}), 'pago:null lo saca ({})', vacio.liq);
    const c = exito(await panel(E, { action: 'comisiones', comisiones: f.comisiones }), 'comisiones');
    exigir(mismo(c.comisiones, f.comisiones), 'comisiones devuelve lo guardado', c.comisiones);
    return hecho('formas de §7.7; liqpago con pct del servidor', `${Object.keys(f.meses).length} meses; pago Diego pct ${pago.pct}; comisiones ${mostrar(c.comisiones)}`);
  });

  /* ── salud ── */
  await caso(28, 'salud', async () => {
    const j = exito(await pedir(E, 'GET', '/.netlify/functions/salud'), 'salud');
    exigir(Array.isArray(j.servicios) && j.servicios.length && j.servicios.every((s) => typeof s.nombre === 'string' && ['ok', 'mal', 'pendiente'].includes(s.estado)),
      'servicios con estado ∈ {ok, mal, pendiente}', j.servicios);
    return hecho('servicios array con estado ok/mal/pendiente', j.servicios.map((s) => `${s.nombre}: ${s.estado}`).join(' · '));
  });

  await caso(44, 'salud como closer y como equipo', async () => {
    const r = await pedir(L, 'GET', '/.netlify/functions/salud');
    falla(r, 403, 'closer');
    const j = exito(await pedir(E, 'GET', '/.netlify/functions/salud'), 'equipo');
    const nombres = (j.servicios || []).map((s) => s.nombre);
    exigir(nombres.includes('Base de datos') && nombres.includes('Sesiones'), '"Base de datos" y "Sesiones" en servicios', nombres);
    return hecho('403 / 200 con Base de datos y Sesiones', `${r.status} / 200 con ${nombres.join(', ')}`);
  });

  /* ── personas ── */
  await caso(29, 'persona: cliente crea equipo / código propio y re-entrar / baja propia', async () => {
    const cr = exito(await app(E, 'persona', { crear: { nombre: `Prueba Cliente ${CORRIDA}`, rol: 'cliente' } }), 'crear la persona de prueba');
    exigir(objeto(cr.persona) && cr.persona.uid && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cr.clave || ''), 'persona {uid} y clave XXXX-XXXX', cr);
    const uid = cr.persona.uid;
    alFinal('dar de baja a la persona de prueba', () => app(E, 'persona', { baja: uid }));
    const P = new Frasco(), ip = ipAzar();
    exito(await entrar(P, cr.clave, { ip }), 'entrar con su código');
    const r1 = await app(P, 'persona', { crear: { nombre: `Prueba Equipo ${CORRIDA}`, rol: 'equipo' } });
    falla(r1, 403, 'cliente crea equipo');
    const r2 = await app(P, 'persona', { codigo: uid });
    const j2 = exito(r2, 'código propio');
    exigir(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(j2.clave || '') && j2.clave !== cr.clave, 'un código nuevo', j2);
    const P2 = new Frasco();
    const r3 = await entrar(P2, j2.clave, { ip });
    exito(r3, 'entrar con el código nuevo');
    exigir(r3.json.yo?.uid === uid, 'entra la misma persona', r3.json.yo);
    const viejo = await entrar(new Frasco(), cr.clave, { ip });
    exigir(viejo.status === 401, 'el código viejo ya no entra (401)', de(viejo));
    const r4 = await app(P2, 'persona', { baja: uid });
    falla(r4, 400, 'baja a sí mismo');
    return hecho('403 / 200 y entrar con el código nuevo funciona / 400', `${r1.status} / ${r2.status}, entra con el nuevo (el viejo ${viejo.status}) / ${r4.status}`);
  });

  /* ── integraciones ── */
  await caso(34, 'integraciones', async () => {
    const j = exito(await app(E, 'integraciones'), 'integraciones');
    exigir(mismo(Object.keys(j).sort(), ['ok', ...INTEGRACIONES].sort()), 'exactamente las 6 claves más ok', Object.keys(j));
    const malo = INTEGRACIONES.find((c) => {
      const x = j[c];
      return !objeto(x) || !['sin', 'incompleta', 'error', 'ok'].includes(x.estado) || !Array.isArray(x.falta)
        || typeof x.clave !== 'string' || !(x.clave === '' || /^….{4}$/u.test(x.clave));
    });
    exigir(!malo, "cada una con estado ∈ {sin, incompleta, error, ok}, falta array y clave '' o '…xxxx'", malo && { [malo]: j[malo] });
    return hecho("6 claves + ok; estado válido, falta array, clave '' o …xxxx", INTEGRACIONES.map((c) => `${c} ${j[c].estado}${j[c].clave ? ' ' + j[c].clave : ''}`).join(' · '));
  });

  await caso(36, "probar {testCode:'x'} · probar {salir:true} · desconectar calendly dos veces", async () => {
    const r1 = await app(E, 'probar', { testCode: 'x' });
    falla(r1, 400, "probar testCode 'x'");
    const r2 = await app(E, 'probar', { salir: true });
    const j2 = exito(r2, 'probar salir');
    exigir(typeof j2.detalle === 'string' && j2.detalle.trim(), 'salir con detalle', j2);
    const d1 = await app(E, 'desconectar', { cual: 'calendly' });
    const d2 = await app(E, 'desconectar', { cual: 'calendly' });
    exito(d1, 'desconectar 1');
    exito(d2, 'desconectar 2');
    return hecho('400 · 200 con detalle · 200 las dos', `${r1.status} «${r1.json.error}» · ${r2.status} «${j2.detalle}» · ${d1.status} ${d2.status}`);
  });

  await caso(35, 'conectar: integración que no existe, calendly sin clave, iclosed con clave mala', async () => {
    const r1 = await app(E, 'conectar', { cual: 'otra', clave: 'x' });
    falla(r1, 400, "cual 'otra'");
    const r2 = await app(E, 'conectar', { cual: 'calendly', clave: '' });
    falla(r2, 400, 'calendly sin clave', 'Pegá la clave');
    const antes = exito(await app(E, 'integraciones'), 'integraciones').iclosed?.estado;
    exigir(antes === 'sin', "iclosed arranca 'sin' (nada guardado ni en el entorno)", antes);
    const r3 = await app(E, 'conectar', { cual: 'iclosed', clave: 'mala' });
    falla(r3, 400, 'iclosed con clave mala');
    const despues = exito(await app(E, 'integraciones'), 'integraciones').iclosed?.estado;
    exigir(despues === 'sin', "integraciones.iclosed.estado sigue 'sin'", despues);
    return hecho("400 / 400 'Pegá la clave' / 400 legible y iclosed sigue 'sin'", `${r1.status} «${r1.json.error}» / ${r2.status} / ${r3.status} «${r3.json.error}», ${despues}`);
  });
}

// n ≥ agendaron ≥ presentaron ≥ compraron en todo objeto con `n` (las claves que tenga de esas)
function cadenas(x, ruta, malos) {
  if (Array.isArray(x)) { x.forEach((y, i) => cadenas(y, `${ruta}[${i}]`, malos)); return; }
  if (!objeto(x)) return;
  if (typeof x.n === 'number') {
    const ks = ['n', 'agendaron', 'presentaron', 'compraron'].filter((k) => typeof x[k] === 'number');
    for (let i = 1; i < ks.length; i++) if (x[ks[i - 1]] < x[ks[i]]) malos.push(`${ruta}: ${ks[i - 1]} ${x[ks[i - 1]]} < ${ks[i]} ${x[ks[i]]}`);
  }
  for (const [k, v] of Object.entries(x)) cadenas(v, ruta ? `${ruta}.${k}` : k, malos);
}
