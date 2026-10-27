// Accesos desde la terminal (§5.1, §7.3.14): crea una persona con su código o le genera uno nuevo a alguien que ya está.
//
//   node scripts/nuevo-acceso.mjs <nombre> <rol>     rol: equipo, cliente o closer (el nombre puede ir sin comillas)
//   node scripts/nuevo-acceso.mjs --codigo <uid>     código nuevo: el viejo deja de andar y se cierran sus sesiones;
//                                                    si estaba dada de baja, vuelve a estar activa
//   node scripts/nuevo-acceso.mjs --lista            las personas con su uid
//
// El código se muestra UNA sola vez, con el link para entrar; en la base queda solo su hash (HMAC con SESION_SECRETO,
// que tiene que ser el mismo del servidor). Usa la misma lógica que la pantalla Equipo (lib/app/personas.mjs): nombre
// único entre las activas, código que no tiene nadie y bloqueo optimista. Lee .env igual que scripts/dev.mjs.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));

// ── .env: CLAVE=valor, # comentario; no pisa lo que ya viene del entorno (como scripts/dev.mjs) ──
function cargarEnv(archivo) {
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m || linea.trim().startsWith('#')) continue;
    let v = m[2].trim();
    v = /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
cargarEnv(path.join(RAIZ, '.env'));

const lib = (m) => import(pathToFileURL(path.join(RAIZ, 'netlify', 'lib', m)).href);
const { obtener, listar, driver } = await lib('almacen.mjs');
const { ROLES } = await lib('sesion.mjs');
const { acciones } = await lib('app/personas.mjs');

const USO = `Uso:
  npm run acceso -- "<nombre>" <rol>     (rol: ${ROLES.join(', ')})
  npm run acceso -- --codigo <uid>
  npm run acceso -- --lista
(npm run acceso -- … es lo mismo que node scripts/nuevo-acceso.mjs …)`;
// quien "pide" desde la terminal: equipo, para poder crear y tocar a cualquiera (uid vacío: nunca es la persona tocada)
const TERMINAL = { uid: '', nombre: 'terminal', rol: 'equipo', closer: '' };
const BASE = (process.env.SITIO_URL || `http://localhost:${Number(process.env.PORT) || 8888}`).trim().replace(/\/+$/, '');

function salir(mensaje) {
  console.error('✗ ' + mensaje);
  process.exit(1);
}

async function lista() {
  const ps = await listar('personas');
  if (!ps.length) return console.log('Todavía no hay personas: la primera entra con CODIGO_INICIAL o se crea con este script.');
  for (const p of ps) console.log(`  ${p.id.padEnd(24)} ${String(p.rol).padEnd(8)} ${p.activo === false ? 'de baja ' : 'activa  '} ${p.nombre}`);
}

function mostrar(p, clave) {
  console.log(`✓ ${p.nombre} (${p.rol}) · uid ${p.id || p.uid}`);
  console.log(`  Código: ${clave}   ← se muestra solo esta vez: en la base queda su hash`);
  console.log(`  Link:   ${BASE}/app/#k=${clave}`);
}

const args = process.argv.slice(2);
if ((process.env.SESION_SECRETO || '').length < 32) salir('Falta SESION_SECRETO (32 caracteres o más) en .env o en el entorno.');

try {
  if (!args.length || args.includes('--ayuda') || args.includes('-h')) {
    console.log(USO);
  } else if (args[0] === '--lista') {
    await lista();
  } else if (args[0] === '--codigo') {
    const uid = args[1] || '';
    const p = uid ? await obtener('personas', uid).catch(() => null) : null;
    if (!p) {
      console.error(`✗ No existe la persona ${uid ? `"${uid}"` : '(falta el uid)'}. Estas son las que hay:`);
      await lista();
      process.exit(1);
    }
    const { clave } = await acciones.persona.fn({ cuerpo: { codigo: uid }, yo: TERMINAL, req: null });
    mostrar(p, clave);
    if (p.activo === false) console.log('  Estaba de baja: ahora está activa otra vez.');
  } else {
    const rol = args.at(-1);
    const nombre = args.slice(0, -1).join(' ');
    if (args.length < 2 || !ROLES.includes(rol)) salir('Falta el nombre o el rol.\n' + USO);
    const primera = !(await listar('personas')).length;
    const { persona, clave } = await acciones.persona.fn({ cuerpo: { crear: { nombre, rol } }, yo: TERMINAL, req: null });
    mostrar(persona, clave);
    if (primera) console.log('  Era la primera persona: desde ahora CODIGO_INICIAL ya no sirve para entrar.');
  }
} catch (e) {
  // los HttpError traen el texto para la persona (nombre repetido, rol inválido…); lo demás es un error de verdad
  if (e && Number.isInteger(e.status) && e.status < 500) salir(e.message);
  console.error(e);
  salir(`No pude guardar (driver ${driver()}): ${e?.message || e}`);
}
