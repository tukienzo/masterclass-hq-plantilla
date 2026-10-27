// Servidor local sin netlify-cli: sirve public/, enruta las funciones de netlify/functions como Netlify
// (config.path o /.netlify/functions/<nombre>), respeta config.method, emula las background (202 y corre aparte)
// y deja disparar las programadas con POST /__cron/<nombre>. Uso: node scripts/dev.mjs  (lee .env si existe)
import http from 'node:http';
import { promises as fs, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const PUBLICO = path.join(RAIZ, 'public');
const FUNCIONES = path.join(RAIZ, 'netlify', 'functions');

// ── .env: CLAVE=valor, # comentario; no pisa lo que ya viene del entorno ──
function cargarEnv(archivo) {
  if (!existsSync(archivo)) return 0;
  let n = 0;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m || linea.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined) { process.env[m[1]] = v; n++; }
  }
  return n;
}
const leidas = cargarEnv(path.join(RAIZ, '.env'));
process.env.NETLIFY_LOCAL ??= 'true';   // así purgeCache de @netlify/functions no falla en local
process.env.NETLIFY_DEV ??= 'true';
const PORT = Number(process.env.PORT) || 8888;
const ORIGEN = `http://localhost:${PORT}`;

// ── funciones: netlify/functions/x.mjs, x/x.mjs o x/index.mjs ──
function archivosDeFunciones() {
  if (!existsSync(FUNCIONES)) return [];
  const r = [];
  for (const e of readdirSeguro(FUNCIONES)) {
    const p = path.join(FUNCIONES, e);
    if (e.endsWith('.mjs') && statSync(p).isFile()) r.push([e.slice(0, -4), p]);
    else if (statSync(p).isDirectory()) {
      const dentro = [path.join(p, e + '.mjs'), path.join(p, 'index.mjs')].find(existsSync);
      if (dentro) r.push([e, dentro]);
    }
  }
  return r;
}
function readdirSeguro(dir) {
  try { return readdirSync(dir).sort(); } catch { return []; }
}

const rutas = [];        // {patron, exacta, nombre, mod, metodos, background}
const programadas = new Map();
for (const [nombre, archivo] of archivosDeFunciones()) {
  let mod;
  try {
    mod = await import(pathToFileURL(archivo).href);
  } catch (e) {
    console.error(`✗ ${nombre}: no se pudo cargar →`, e.message);
    continue;
  }
  if (typeof mod.default !== 'function') { console.error(`✗ ${nombre}: no tiene export default`); continue; }
  const config = mod.config || {};
  const metodos = config.method ? [].concat(config.method).map((m) => String(m).toUpperCase()) : null;
  const background = nombre.endsWith('-background') || !!config.background;
  if (config.schedule) { programadas.set(nombre, { mod, schedule: config.schedule }); continue; }
  const paths = config.path ? [].concat(config.path) : [`/.netlify/functions/${nombre}`];
  for (const p of paths) {
    const comodin = p.endsWith('/*');
    rutas.push({ patron: comodin ? p.slice(0, -1) : p, comodin, nombre, mod, metodos, background });
  }
}
const buscarRuta = (ruta) => rutas.find((r) => (r.comodin ? ruta.startsWith(r.patron) || ruta === r.patron.slice(0, -1) : ruta === r.patron));

// ── el context de Netlify, versión local ──
// una cookie con un % roto ('otra=%E0%A4%A') no puede tumbar todas las funciones: queda el valor crudo
const decodificar = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
function armarContext(req, setCookies) {
  const cookiesReq = Object.fromEntries((req.headers.get('cookie') || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return i > -1 ? [c.slice(0, i).trim(), decodificar(c.slice(i + 1).trim())] : [c.trim(), ''];
  }).filter(([k]) => k));
  return {
    ip: req.headers.get('x-nf-client-connection-ip') || '127.0.0.1',
    geo: { country: { code: process.env.DEV_PAIS || 'AR' } },
    params: {},
    site: { url: ORIGEN },
    deploy: { context: 'dev' },
    requestId: randomUUID(),
    cookies: {
      get: (nombre) => cookiesReq[nombre],
      set: (a, b) => {
        const o = typeof a === 'object' ? a : { name: a, value: b };
        let s = `${o.name}=${encodeURIComponent(o.value ?? '')}; Path=${o.path || '/'}`;
        if (o.maxAge != null) s += `; Max-Age=${o.maxAge}`;
        if (o.expires) s += `; Expires=${new Date(o.expires).toUTCString()}`;
        if (o.domain) s += `; Domain=${o.domain}`;
        if (o.httpOnly) s += '; HttpOnly';
        if (o.secure) s += '; Secure';
        if (o.sameSite) s += `; SameSite=${o.sameSite}`;
        setCookies.push(s);
      },
      delete: (a) => setCookies.push(`${typeof a === 'object' ? a.name : a}=; Max-Age=0; Path=${(typeof a === 'object' && a.path) || '/'}`),
    },
    waitUntil: (p) => { Promise.resolve(p).catch((e) => console.error('waitUntil:', e)); },
  };
}

const SALTEAR = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length']);
async function leerCuerpo(nreq) {
  const partes = [];
  let total = 0;
  for await (const c of nreq) {
    total += c.length;
    if (total > 10 * 1024 * 1024) throw Object.assign(new Error('Pedido demasiado grande'), { status: 413 });
    partes.push(c);
  }
  return Buffer.concat(partes);
}
async function aRequest(nreq) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(nreq.headers)) if (!SALTEAR.has(k)) [].concat(v).forEach((x) => headers.append(k, x));
  const cuerpo = ['GET', 'HEAD'].includes(nreq.method) ? null : await leerCuerpo(nreq);
  return new Request(ORIGEN + nreq.url, { method: nreq.method, headers, body: cuerpo && cuerpo.length ? cuerpo : undefined, duplex: 'half' });
}

async function enviar(nres, res, setCookies = [], soloHeaders = false) {
  const h = {};
  res.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
  const cookies = [...res.headers.getSetCookie(), ...setCookies];
  if (cookies.length) h['set-cookie'] = cookies;
  const cuerpo = soloHeaders ? null : Buffer.from(await res.arrayBuffer());
  nres.writeHead(res.status, h);
  nres.end(cuerpo);
}

const textoPlano = (nres, status, texto) => { nres.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); nres.end(texto); };
const json405 = () => new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }),
  { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function correrFuncion(r, nreq, nres) {
  if (r.metodos && !r.metodos.includes(nreq.method)) return enviar(nres, json405());
  const req = await aRequest(nreq);
  const setCookies = [];
  const context = armarContext(req, setCookies);
  if (r.background) {
    Promise.resolve().then(() => r.mod.default(req, context))
      .catch((e) => console.error(`background ${r.nombre}:`, e));
    nres.writeHead(202);
    return nres.end();
  }
  let res;
  try {
    res = await r.mod.default(req, context);
  } catch (e) {
    console.error(`${r.nombre}:`, e);
    return textoPlano(nres, 500, 'La función tiró un error (mirá la consola)');
  }
  if (!(res instanceof Response)) res = new Response(null, { status: 204 });
  return enviar(nres, res, setCookies, nreq.method === 'HEAD');
}

async function correrCron(nombre, nreq, nres) {
  const p = programadas.get(nombre);
  if (!p) return textoPlano(nres, 404, `No hay una función programada "${nombre}"`);
  const req = new Request(`${ORIGEN}/.netlify/functions/${nombre}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ next_run: new Date(Date.now() + 60000).toISOString() }),
  });
  const setCookies = [];
  try {
    const res = await p.mod.default(req, armarContext(req, setCookies));
    return enviar(nres, res instanceof Response ? res : new Response(null, { status: 204 }), setCookies);
  } catch (e) {
    console.error(`cron ${nombre}:`, e);
    return textoPlano(nres, 500, 'La función programada tiró un error (mirá la consola)');
  }
}

// ── estáticos ──
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8', '.mp4': 'video/mp4', '.map': 'application/json; charset=utf-8',
};
const REESCRITURAS = { '/gracias': '/gracias.html' };   // las de netlify.toml

async function archivoDe(ruta) {
  const rel = decodeURIComponent(ruta);
  const p = path.normalize(path.join(PUBLICO, rel));
  if (p !== PUBLICO && !p.startsWith(PUBLICO + path.sep)) return null;
  const st = await fs.stat(p).catch(() => null);
  if (st?.isFile()) return { p };
  if (st?.isDirectory()) {
    if (!rel.endsWith('/')) return { redirigir: rel + '/' };
    const i = path.join(p, 'index.html');
    return existsSync(i) ? { p: i } : null;
  }
  if (!path.extname(p) && existsSync(p + '.html')) return { p: p + '.html' };   // URLs lindas, como Netlify
  return null;
}

async function servirEstatico(url, nreq, nres) {
  if (!['GET', 'HEAD'].includes(nreq.method)) return textoPlano(nres, 405, 'Método no permitido');
  let f;
  try { f = await archivoDe(REESCRITURAS[url.pathname] || url.pathname); } catch { f = null; }
  if (!f) return textoPlano(nres, 404, 'No encontrado');
  if (f.redirigir) { nres.writeHead(301, { location: f.redirigir + url.search }); return nres.end(); }
  const datos = await fs.readFile(f.p);
  nres.writeHead(200, {
    'content-type': TIPOS[path.extname(f.p).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache', 'x-content-type-options': 'nosniff',
  });
  nres.end(nreq.method === 'HEAD' ? null : datos);
}

// ── servidor ──
const servidor = http.createServer(async (nreq, nres) => {
  const t0 = Date.now();
  nres.on('finish', () => console.log(`${nreq.method} ${nreq.url} → ${nres.statusCode} (${Date.now() - t0} ms)`));
  try {
    const url = new URL(nreq.url, ORIGEN);
    const cron = url.pathname.match(/^\/__cron\/([\w-]+)$/);
    if (cron && nreq.method === 'POST') return await correrCron(cron[1], nreq, nres);
    const r = buscarRuta(url.pathname);
    if (r) return await correrFuncion(r, nreq, nres);
    return await servirEstatico(url, nreq, nres);
  } catch (e) {
    console.error(e);
    if (!nres.headersSent) textoPlano(nres, e.status || 500, e.status ? e.message : 'Error del servidor local');
    else nres.end();
  }
});

// ── programadas cada N minutos con DEV_CRON=1 (lectura simple: */N, @hourly, @daily) ──
function minutosDe(cron) {
  const s = String(cron).trim();
  if (s === '@hourly') return 60;
  if (s === '@daily' || s === '@midnight') return 1440;
  const m = s.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  return m ? Number(m[1]) : null;
}
if (process.env.DEV_CRON === '1') {
  for (const [nombre, p] of programadas) {
    const min = minutosDe(p.schedule);
    if (!min) { console.log(`· ${nombre}: no entiendo el cron "${p.schedule}"; disparala con POST /__cron/${nombre}`); continue; }
    setInterval(() => {
      const req = new Request(`${ORIGEN}/.netlify/functions/${nombre}`, { method: 'POST', body: '{}' });
      Promise.resolve().then(() => p.mod.default(req, armarContext(req, []))).catch((e) => console.error(`cron ${nombre}:`, e));
    }, min * 60000).unref();
  }
}

servidor.listen(PORT, () => {
  console.log(`Masterclass HQ en ${ORIGEN}  (app: ${ORIGEN}/app/)${leidas ? ` · .env: ${leidas} variables` : ''}`);
  for (const r of rutas) console.log(`  ${(r.metodos || ['*']).join(',').padEnd(9)} ${r.patron}${r.comodin ? '*' : ''} → ${r.nombre}${r.background ? ' (background)' : ''}`);
  for (const [n, p] of programadas) console.log(`  cron      ${p.schedule} → ${n}  (POST /__cron/${n})`);
});
