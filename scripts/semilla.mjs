// Semilla de demo (SPEC §10): "Academia Faro", un negocio ficticio que alcanza para pintar las 20 pantallas de la
// app con datos verosímiles. Escribe con la fachada `almacen`, así anda igual con archivo y con Supabase.
//
//   node scripts/semilla.mjs                     carga la demo, o la pone al día (correrla dos veces no duplica nada)
//   node scripts/semilla.mjs --borrar            saca solo lo que cargó la semilla y termina
//   node scripts/semilla.mjs --reset             vacía todas las colecciones (§4) y carga la demo de cero
//   node scripts/semilla.mjs --hoy=2026-10-27    fija el "hoy" (pruebas reproducibles)
//   --si-supabase                                hace falta para correrla contra Supabase (para no pisar datos reales)
//
// Lee .env igual que scripts/dev.mjs (SESION_SECRETO tiene que ser el mismo que usa el servidor: con él se guardan
// los códigos). Las fechas son relativas a hoy en la zona del negocio, así la demo siempre se ve viva, y el azar es
// mulberry32 sembrado con 'faro': el mismo hoy da los mismos datos. Sin personas ni marcas reales: nombres
// combinados de listas comunes, mails @example.com y teléfonos del rango 555.
import { existsSync, readFileSync, promises as fs } from 'node:fs';
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

// las librerías se importan después de leer .env
const lib = (m) => import(pathToFileURL(path.join(RAIZ, 'netlify', 'lib', m)).href);
const { obtener, listar, guardar, fusionar, fusionarVarios, borrar, driver } = await lib('almacen.mjs');
const { hashCodigo } = await lib('sesion.mjs');
const { negocio, fijarWebinarActivo } = await lib('config.mjs');
const { hoyLocal, horaLocal, aUTC, sumarDias, mesSig, esFecha } = await lib('fechas.mjs');
const { norm, slug, tel8 } = await lib('normalizar.mjs');
const { armarTareas } = await lib('checklist.mjs');
const { parsearLanding } = await lib('landing.mjs');
const { calificar } = await lib('registros.mjs');
const { armarCierre, r2 } = await lib('crm-core.mjs');

/* ════════ argumentos ════════ */
const ARGS = process.argv.slice(2);
const FLAGS = ['reset', 'borrar', 'si-supabase'];
const otros = ARGS.filter((a) => !(a.startsWith('--') && FLAGS.includes(a.slice(2))) && !a.startsWith('--hoy='));
if (otros.length) salir(`No entiendo ${otros.join(' ')}. Uso: node scripts/semilla.mjs [--reset | --borrar] [--hoy=AAAA-MM-DD] [--si-supabase]`);
const flag = (n) => ARGS.includes('--' + n);
if (flag('reset') && flag('borrar')) salir('Usá --reset o --borrar, no los dos.');

function salir(mensaje) {
  console.error('✗ ' + mensaje);
  process.exit(1);
}

/* ════════ el negocio ficticio ════════ */
const NEGOCIO = { nombre: 'Academia Faro', color: '#2563eb', moneda: 'USD', zona: 'America/Bogota', pais: 'CO', prefijoTel: '57' };
const Z = NEGOCIO.zona;
const PERSONAS = [
  { id: 'u_demo_ana', nombre: 'Ana Demo', rol: 'equipo', codigo: 'DEMO-EQPO' },
  { id: 'u_demo_carla', nombre: 'Carla Demo', rol: 'cliente', codigo: 'DEMO-CLTE' },
  { id: 'u_demo_laura', nombre: 'Laura Gómez', rol: 'closer', codigo: 'DEMO-LAUR' },
  { id: 'u_demo_diego', nombre: 'Diego Ruiz', rol: 'closer', codigo: 'DEMO-DIEG' },
  { id: 'u_demo_tomas', nombre: 'Tomás Vera', rol: 'closer', codigo: null },   // dado de baja, sin código
];
const EQUIPO = 'Ana Demo';
const CLOSERS = ['Laura Gómez', 'Diego Ruiz'];
const SETTERS = ['Sofía Paz', 'Martín Sosa'];
const PROGRAMAS = [
  { id: 'pr_demo_insignia', nombre: 'Programa Insignia', precio: 900, orden: 0 },
  { id: 'pr_demo_mentoria', nombre: 'Mentoría Grupal', precio: 450, orden: 1 },
];
const HORA_VIVO = '19:00';

const P1 = {
  id: 'cuanto-podes-invertir', texto: '¿Cuánto podés invertir en tu formación?',
  opciones: ['Nada por ahora', 'Menos de 500', '500 a 1.000', 'Más de 1.000'], calificadas: ['500 a 1.000', 'Más de 1.000'],
};
const P2 = {
  id: 'que-te-trae-a-la-clase', texto: '¿Qué te trae a la clase?',
  opciones: ['Conseguir más clientes', 'Tener un ingreso extra', 'Aprender un método', 'Ver de qué se trata'], calificadas: [],
};
const PREGUNTAS = [P1, P2];

const LANDING = {
  eyebrow: 'Clase gratuita en vivo',
  titulo: 'Conseguí clientes todas las semanas *sin depender del boca a boca*',
  subtitulo: 'En una clase en vivo te mostramos el método con el que nuestros alumnos llenan la agenda con clientes que ya vienen decididos.',
  cta: 'Reservar mi lugar gratis',
  microcopy: 'Es en vivo: el link para entrar te llega por WhatsApp.',
  piezasTitulo: 'Lo que vas a ver en la clase',
  piezas: [
    { titulo: 'El diagnóstico', texto: 'Por qué el boca a boca te deja la agenda llena un mes y vacía el siguiente.' },
    { titulo: 'La oferta', texto: 'Cómo armar un servicio que se entiende en una frase y que la gente quiere comprar.' },
    { titulo: 'El sistema', texto: 'Los tres pasos para que lleguen consultas todas las semanas.' }],
  regalo: { titulo: 'Plantilla de seguimiento', texto: 'La planilla que usamos para no perder a nadie entre la primera consulta y la venta.' },
  paraQuien: ['Quien tiene un servicio y quiere más clientes sin bajar el precio.', 'Quien puede dedicarle unas horas por semana a aplicar lo que ve.'],
  noParaQuien: ['Quien busca resultados sin hacer nada.', 'Quien todavía no sabe qué quiere vender.'],
  presentador: {
    nombre: 'Ana Demo', foto: '', numeros: ['+1.200 alumnos', '8 años enseñando', '40 clases en vivo'],
    bio: 'Fundadora de Academia Faro. Hace ocho años que ayuda a profesionales y dueños de negocios chicos a vender sus servicios.' },
  faq: [
    { titulo: '¿Cuánto cuesta?', texto: 'Nada. Es gratuita y en vivo.' },
    { titulo: '¿Queda grabada?', texto: 'No: la clase es una sola vez y en vivo.' },
    { titulo: '¿Necesito experiencia previa?', texto: 'No. Arranca desde cero.' },
    { titulo: '¿Cuánto dura?', texto: 'Unas dos horas, con preguntas al final.' }],
  cierre: 'Una clase. En vivo. Una sola vez.',
  disclaimer: 'Los resultados dependen del trabajo de cada persona. No prometemos ingresos ni resultados.',
  video: '', whatsapp: 'https://chat.whatsapp.com/DEMO0000000000000000', pasoMail: '',
  preguntas: PREGUNTAS,
};

const NOMBRES = ['Sofía', 'Valentina', 'Camila', 'Martina', 'Lucía', 'Isabella', 'Mariana', 'Daniela', 'Gabriela', 'Paula',
  'Andrea', 'Carolina', 'Juliana', 'Natalia', 'Florencia', 'Victoria', 'Agustina', 'Julieta', 'Elena', 'Clara', 'Renata',
  'Emilia', 'Antonella', 'Micaela', 'Laura', 'Mateo', 'Santiago', 'Sebastián', 'Nicolás', 'Matías', 'Juan', 'Andrés',
  'Felipe', 'Tomás', 'Lucas', 'Martín', 'Diego', 'Joaquín', 'Alejandro', 'Gabriel', 'Daniel', 'Pablo', 'Manuel',
  'Federico', 'Esteban', 'Ricardo', 'Camilo', 'David', 'Javier', 'Hernán'];
const APELLIDOS = ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores',
  'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales', 'Ortiz', 'Gutiérrez', 'Chávez', 'Ramos', 'Ruiz', 'Mendoza', 'Castillo',
  'Vargas', 'Romero', 'Herrera', 'Medina', 'Aguilar', 'Castro', 'Vega', 'Rojas', 'Molina', 'Silva', 'Suárez', 'Navarro',
  'Cabrera', 'Ríos', 'Paredes', 'Acosta', 'Peña', 'Cardona', 'Quintero', 'Ospina', 'Restrepo', 'Salazar', 'Arias'];
const NEGOCIOS = ['Estudio contable', 'Tienda online', 'Consultorio', 'Agencia de marketing', 'Empleado', 'Freelance de diseño',
  'Gimnasio', 'Inmobiliaria', 'Restaurante', 'Profesor particular'];
const FACTURACION = ['Menos de 1.000', '1.000 a 3.000', '3.000 a 5.000', 'Más de 5.000'];
const OBJETIVOS = ['Sumar clientes sin depender del boca a boca', 'Tener un segundo ingreso', 'Ordenar las ventas del negocio',
  'Dejar de cambiar horas por plata', 'Vender un servicio online', 'Llegar a clientes de otras ciudades'];
const TRABAS = ['No tengo tiempo', 'No sé por dónde empezar', 'Probé solo y no me funcionó', 'Me da miedo invertir y no recuperarlo',
  'Me falta un método', 'No sé cómo ponerle precio'];
const URGENCIAS = ['Ya mismo', 'En las próximas semanas', 'En unos meses', 'Sin apuro'];
const DECISORES = ['Sí, decido solo', 'Lo hablo con mi socio', 'Lo hablo con mi pareja'];
const GATILLOS = ['La clase en vivo', 'El caso que mostraron en la clase', 'La oferta del final', 'El recordatorio por WhatsApp'];
const NOTAS = ['Pidió el plan en dos pagos', 'Volver a escribirle el jueves', 'Llegó tarde a la llamada', 'Vino con el socio'];
const MEDIOS = ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal'];
const UAS = ['Mozilla/5.0 (Linux; Android 14) demo', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) demo',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) demo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Los anuncios del modo demo de Meta, de integraciones/meta-ads.mjs: por campaña, [número, días desde que arranca].
// La campaña de cada webinar se llama webinar-<mes del vivo> y arranca 21 días antes del vivo (los de VIVOS_DEMO).
const { ANUNCIOS_DEMO, VIVOS_DEMO } = await lib('integraciones/meta-ads.mjs');
const ANUNCIOS = VIVOS_DEMO.map((_, ci) => ANUNCIOS_DEMO.filter(([, c]) => c === ci).map(([k, , desde]) => [k, desde]));

/* ════════ azar determinista ════════ */
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const azar = mulberry32(hash32('faro'));
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const uno = (xs) => xs[Math.floor(azar() * xs.length)];
const sale = (p) => azar() < p;
// [[valor, peso], ...] → un valor
function pesado(pares) {
  let r = azar() * pares.reduce((s, [, p]) => s + p, 0);
  for (const [v, p] of pares) if ((r -= p) < 0) return v;
  return pares[pares.length - 1][0];
}
function mezclar(xs) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// total repartido proporcional a los pesos (resto mayor): la suma da exacta
function repartir(total, pesos) {
  const s = pesos.reduce((a, b) => a + b, 0);
  const crudo = pesos.map((p) => (total * p) / s);
  const r = crudo.map(Math.floor);
  const falta = total - r.reduce((a, b) => a + b, 0);
  crudo.map((c, i) => [c - r[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, falta).forEach(([, i]) => r[i]++);
  return r;
}
const hex = (n) => Array.from({ length: n }, () => Math.floor(azar() * 16).toString(16)).join('');
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${uno(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
const pad = (n, k) => String(n).padStart(k, '0');

/* ════════ fechas ════════ */
const instante = (fecha, hora) => Date.parse(aUTC(fecha, hora, Z));
const hhmm = (min) => `${pad(Math.floor(min / 60), 2)}:${pad(min % 60, 2)}`;
const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const iso = (ms) => new Date(ms).toISOString();
const mesNombre = (fecha) => MESES[Number(fecha.slice(5, 7)) - 1];
const ultimoDiaDelMes = (mes) => sumarDias(mesSig(mes, 1) + '-01', -1);

/* ════════ el almacén ════════ */
const ARCHIVO = driver() === 'archivo';

// `creado` lo pone el almacén al escribir. Con el driver archivo, la semilla escribe los registros con el reloj corrido
// a su fecha de alta, así la tabla de Registros, el cruce con las agendas y los recorridos de Trazabilidad se ven como
// en un negocio real. Con Supabase lo pone la base (now()): queda el día de la carga (`dia` sí es el real).
const FechaReal = Date;
async function conReloj(ms, fn) {
  class FechaFija extends FechaReal {
    constructor(...a) { super(...(a.length ? a : [ms])); }
    static now() { return ms; }
  }
  globalThis.Date = FechaFija;
  try { return await fn(); } finally { globalThis.Date = FechaReal; }
}

async function enParalelo(xs, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) await fn(xs[i++]); }));
}
async function borrarIds(col, ids) {
  if (!ids.length) return;
  if (ids.length > 50) console.log(`  borrando ${ids.length} de ${col}…`);
  await enParalelo(ids, 8, (id) => borrar(col, id));
}

// docs nuevos con su fecha de alta: con el driver archivo, un lote por instante; los que ya están conservan su creado
async function escribirConFecha(col, items /* [{doc, creado}] */) {
  const ya = new Set((await listar(col)).map((d) => d.id));
  const viejos = items.filter((x) => ya.has(x.doc.id)).map((x) => x.doc);
  if (viejos.length) await fusionarVarios(col, viejos);
  const nuevos = items.filter((x) => !ya.has(x.doc.id));
  if (!ARCHIVO) { if (nuevos.length) await fusionarVarios(col, nuevos.map((x) => x.doc)); return; }
  const porInstante = new Map();
  for (const x of nuevos) {
    const t = Date.parse(x.creado);
    if (!porInstante.has(t)) porInstante.set(t, []);
    porInstante.get(t).push(x.doc);
  }
  for (const [t, docs] of [...porInstante].sort((a, b) => a[0] - b[0])) await conReloj(t, () => fusionarVarios(col, docs));
}
// reemplaza cada doc entero (guardar): lo que se tocó a mano en la demo vuelve a como lo dejó la semilla
async function escribir(col, docs) {
  await enParalelo(docs, 8, (d) => guardar(col, d));
}

const COLECCIONES = ['personas', 'webinars', 'ajustes', 'registros', 'agendas', 'crm', 'crm-borrados', 'integraciones', 'icp-ia',
  'cache', 'limites', 'cola', 'ag-evaluaciones', 'ag-config', 'anun-config', 'anun-plan', 'anun-audiencias', 'utm-links',
  'kpis-fijados', 'webinar-asistencia', 'programas'];

// --reset: con archivo se borra la carpeta de datos entera (SPEC §10); con Supabase, doc por doc
async function vaciarTodo() {
  if (ARCHIVO) {
    const dir = path.resolve(RAIZ, process.env.DATOS_DIR || '.datos');
    const raiz = path.resolve(RAIZ);
    if (dir === path.parse(dir).root || raiz.startsWith(dir + path.sep) || dir === raiz) salir(`DATOS_DIR apunta a ${dir}: no la borro.`);
    let archivos = [];
    try { archivos = await fs.readdir(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const raros = archivos.filter((a) => !/\.json(\.tmp)?$/.test(a));
    if (raros.length) salir(`${dir} tiene archivos que no son del almacén (${raros.slice(0, 3).join(', ')}): no la borro.`);
    await fs.rm(dir, { recursive: true, force: true });
    console.log(`· Vacié ${path.relative(RAIZ, dir) || dir}`);
    return;
  }
  for (const col of COLECCIONES) await borrarIds(col, (await listar(col)).map((d) => d.id));
  console.log('· Vacié todas las colecciones');
}

/* ════════ arranque ════════ */
if (driver() === 'supabase' && !flag('si-supabase')) {
  salir('ALMACEN es Supabase: la semilla pisaría datos reales. Si es una base de prueba, corré con --si-supabase.');
}
if ((process.env.SESION_SECRETO || '').length < 32) {
  salir('Falta SESION_SECRETO (32 caracteres o más) en .env o en el entorno: con él se guardan los códigos de acceso.');
}

if (flag('borrar')) {
  const m = await obtener('ajustes', 'semilla');
  if (!m) { console.log('No hay una demo cargada: no hay nada que borrar.'); process.exit(0); }
  for (const [col, ids] of Object.entries(m.ids || {})) await borrarIds(col, ids);
  await borrar('ajustes', 'semilla');
  const n = Object.values(m.ids || {}).reduce((s, ids) => s + ids.length, 0);
  console.log(`✓ Saqué la demo (${n} documentos). Lo que no cargó la semilla quedó como estaba.`);
  process.exit(0);
}
if (flag('reset')) await vaciarTodo();

const hoyArg = (ARGS.find((a) => a.startsWith('--hoy=')) || '').slice(6);
if (hoyArg && !esFecha(hoyArg)) salir('--hoy tiene que ser AAAA-MM-DD');
const H = hoyArg || hoyLocal(Z);
const D = (n) => sumarDias(H, n);
// "ahora" de la demo: la hora en punto real si H es hoy (dos corridas en la misma hora dan lo mismo); si no, el
// mediodía de H. Nada de la demo pasa después de esto.
const AHORA = H === hoyLocal(Z) ? Math.floor(Date.now() / 3600000) * 3600000 : instante(H, '12:00');
const MES = H.slice(0, 7), MES_ANT = mesSig(MES, -1);
const BASE = (process.env.SITIO_URL || `http://localhost:${Number(process.env.PORT) || 8888}`).trim().replace(/\/+$/, '');

console.log(`Semilla de demo · hoy ${H} (${Z}) · driver ${driver()}`);
const anterior = await obtener('ajustes', 'semilla');

// el negocio primero: negocio() lo lee para la moneda y el formato del mensaje del cierre
await guardar('ajustes', { id: 'negocio', ...NEGOCIO });
const NEG = await negocio();

/* ════════ personas del pool (los leads) ════════ */
const RESERVADOS = new Set([...PERSONAS.map((p) => norm(p.nombre)), ...SETTERS.map(norm)]);
const COMBOS = mezclar(NOMBRES.flatMap((n) => APELLIDOS.map((a) => [n, a]))).filter(([n, a]) => !RESERVADOS.has(norm(`${n} ${a}`)));
let iCombo = 0, iTel = 0;
function nuevaPersona(prefijo = '300') {
  const [n, a] = COMBOS[iCombo++];
  const whatsapp = `+57${prefijo}555${pad(iTel++, 4)}`;
  return { nombre: `${n} ${a}`, email: `${slug(n).replace(/-/g, '')}.${slug(a).replace(/-/g, '')}@example.com`, whatsapp, tel8: tel8(whatsapp) };
}

/* ════════ webinars ════════ */
const WEBS = [
  { k: 'w1', d: -45, popup: null, proyeccion: { presupuesto: 1200, registros: 900, ticket: 900 }, registros: 650 },
  { k: 'w2', d: -9, popup: -7, proyeccion: { presupuesto: 1500, registros: 1200, pctCierre: 22, ticket: 900 }, registros: 820 },
  { k: 'w3', d: 8, popup: null, proyeccion: { presupuesto: 1800, registros: 1400, ticket: 900 }, registros: 230 },
].map((x, i) => {
  const fecha = D(x.d);
  return { ...x, i, fecha, id: `w${fecha.replace(/-/g, '')}faro`, mes: mesNombre(fecha) };
});
const [W1, W2, W3] = WEBS;
if (WEBS.some((w, i) => w.d !== VIVOS_DEMO[i])) throw new Error('semilla: los días de los webinars no coinciden con VIVOS_DEMO de integraciones/meta-ads.mjs');
const LANDING_OK = parsearLanding(LANDING, null);

function tareasDe(w) {
  const ts = armarTareas(w.fecha, 10).map((t, i) => ({ ...t, id: `t${w.k}${pad(i, 2)}` }));
  const pasadas = ts.filter((t) => t.vence < H);
  if (w === W1) ts.forEach((t) => { t.hecha = true; });
  if (w === W2) {
    const vencidas = new Set(mezclar(pasadas).slice(0, 3));
    pasadas.forEach((t) => { t.hecha = !vencidas.has(t); });
  }
  if (w === W3) mezclar(pasadas).slice(0, Math.round(pasadas.length * 0.7)).forEach((t) => { t.hecha = true; });
  return ts;
}
const repetidos = new Map();   // nombre del webinar → para no repetir "Clase en vivo · octubre" si dos caen en el mismo mes
const webinars = WEBS.map((w) => {
  let nombre = `Clase en vivo · ${w.mes}`;
  if (repetidos.has(nombre)) nombre = `Clase en vivo · ${Number(w.fecha.slice(8))} de ${w.mes}`;
  repetidos.set(nombre, true);
  return {
    id: w.id, nombre, fecha: w.fecha, hora: HORA_VIVO, popup: w.popup == null ? null : { fecha: D(w.popup), hora: HORA_VIVO },
    formato: 'Masterclass en vivo', cierre: 'Llamada', ventana: 10, etiqueta: `webinar-${w.fecha}`, duracionMin: 120,
    proyeccion: w.proyeccion, tareas: tareasDe(w), landing: structuredClone(LANDING_OK), v: 1,
  };
});

/* ════════ registros ════════ */
const FUENTES = [['fb', 60], ['ig', 20], ['youtube', 6], ['email', 6], ['', 8]];
const MEDIO = { fb: 'paid', ig: 'paid', youtube: 'organic', email: 'newsletter', '': '' };
const HORAS = [[7, 1], [8, 2], [9, 3], [10, 3], [11, 3], [12, 4], [13, 4], [14, 3], [15, 3], [16, 3], [17, 4], [18, 5], [19, 6],
  [20, 7], [21, 6], [22, 4], [23, 2]];
const minAhora = minutos(horaLocal(iso(AHORA), Z));

// minuto del día de un alta, sin pasarse de `tope`
function minutoAlta(tope) {
  const horas = HORAS.filter(([h]) => h * 60 <= tope);
  const h = pesado(horas.length ? horas : [[7, 1]]);
  return Math.min(tope, h * 60 + entre(0, 59));
}

function nuevoRegistro(w, n, dia, minuto, persona) {
  const creado = iso(instante(dia, hhmm(minuto)) + entre(0, 59) * 1000);
  const src = pesado(FUENTES), pago = MEDIO[src] === 'paid';
  const arranque = sumarDias(w.fecha, -21);
  const activos = ANUNCIOS[w.i].filter(([, desde]) => sumarDias(arranque, desde) <= dia).map(([k]) => k);
  const utm = { utm_source: src, utm_medium: MEDIO[src], utm_campaign: pago ? `webinar-${w.mes}` : '',
    utm_content: pago ? `anuncio-${uno(activos.length ? activos : [ANUNCIOS[w.i][0][0]])}` : '', utm_term: '' };
  const query = Object.entries(utm).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const respondio = sale(0.62);
  const respuestas = respondio ? {
    [P1.id]: pesado(P1.opciones.map((o, i) => [o, [25, 35, 25, 15][i]])),
    [P2.id]: pesado(P2.opciones.map((o, i) => [o, [35, 25, 25, 15][i]])),
  } : {};
  const calificado = respondio ? calificar(PREGUNTAS, respuestas) : null;
  const eventId = uuid(), t = Date.parse(creado);
  const doc = {
    id: `r_demo${pad(n, 4)}`, w: w.id, dia, nombre: persona.nombre, email: persona.email, pais: 'CO',
    whatsapp: persona.whatsapp, tel8: persona.tel8, utm, eventId, eventIdCR: calificado === true ? eventId + '-cr' : null,
    fbp: sale(0.7) ? `fb.1.${t - entre(0, 86400) * 1000}.${entre(100000000, 999999999)}` : '',
    fbc: src === 'fb' ? `fb.1.${t}.demo${hex(16)}` : '',
    url: `${BASE}/${query ? '?' + query : ''}`, referrer: '', ip: `203.0.113.${entre(1, 254)}`, ua: uno(UAS), paisGeo: 'CO',
    respuestas, respondio, calificado, ac: null, meta: null, metaCR: null,
  };
  return { doc, creado };
}

const registros = [];   // [{doc, creado}]
let nReg = 0;
const personasW1 = [];
for (const w of WEBS) {
  const desde = sumarDias(w.fecha, -21);
  let hasta = w.fecha < H ? w.fecha : H;
  if (hasta === H && minAhora < 7 * 60 + 30) hasta = D(-1);   // muy temprano: hoy todavía no se anotó nadie
  const dias = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
  // más altas a medida que se acerca el vivo
  const cuantos = repartir(w.registros, dias.map((_, i) => (1 + 3 * (i / Math.max(1, dias.length - 1)) ** 2) * (0.75 + 0.5 * azar())));
  // W2 repite 15 personas de W1 (vinieron a las dos clases), cada una una sola vez
  const repite = w === W2 ? new Set(mezclar([...Array(w.registros).keys()]).slice(0, 15)) : new Set();
  const repetibles = w === W2 ? mezclar(personasW1).slice(0, 15) : [];
  let j = 0;
  dias.forEach((dia, i) => {
    let tope = 23 * 60 + 59;
    if (dia === w.fecha) tope = Math.min(tope, minutos(HORA_VIVO) - 1);
    if (dia === H) tope = Math.min(tope, minAhora - 1);
    const minutosDia = Array.from({ length: cuantos[i] }, () => minutoAlta(tope)).sort((a, b) => a - b);
    for (const m of minutosDia) {
      const persona = repite.has(j++) && repetibles.length ? repetibles.pop() : nuevaPersona();
      if (w === W1) personasW1.push(persona);
      registros.push(nuevoRegistro(w, ++nReg, dia, m, persona));
    }
  });
}
const regsDe = (w) => registros.filter((r) => r.doc.w === w.id);

/* ════════ agendas ════════ */
// quién agenda y quién compra según lo que contestó en la landing (así el ICP tiene algo que mostrar): compra el que
// puede invertir y viene por clientes; el que viene por un ingreso extra agenda, pero compra poco
const PESO_RESP = {
  Cerrada: { 'Más de 1.000': 8, '500 a 1.000': 5, 'Menos de 500': 1, 'Nada por ahora': 0.2, '': 0.6 },
  Presentada: { 'Más de 1.000': 4, '500 a 1.000': 3, 'Menos de 500': 1.5, 'Nada por ahora': 0.5, '': 1 },
  otro: { 'Más de 1.000': 2, '500 a 1.000': 2, 'Menos de 500': 1.5, 'Nada por ahora': 1, '': 1 },
};
const PESO_MOTIVO = {
  Cerrada: { 'Conseguir más clientes': 3, 'Aprender un método': 1.2, 'Tener un ingreso extra': 0.4, 'Ver de qué se trata': 0.3, '': 1 },
  Presentada: { 'Conseguir más clientes': 1.5, 'Aprender un método': 1, 'Tener un ingreso extra': 1.3, 'Ver de qué se trata': 0.6, '': 1 },
  otro: { 'Conseguir más clientes': 1, 'Aprender un método': 1, 'Tener un ingreso extra': 1.6, 'Ver de qué se trata': 1, '': 1 },
};
const CAPITAL = {
  Cerrada: [['1-2K', 4], ['2-3K', 3], ['>3K', 2], ['<1K', 1]],
  Presentada: [['<1K', 3], ['1-2K', 4], ['2-3K', 2], ['>3K', 1]],
  otro: [['<1K', 5], ['1-2K', 3], ['2-3K', 1], ['>3K', 1]],
};
const CON_RESULTADO = ['Presentada', 'Cerrada', 'No-show', 'Cancelada', 'Descalificada', 'Re-agenda'];
// las pasadas con resultado: Presentada 25 %, Cerrada 20 %, No-show 25 %, Cancelada 10 %, Descalificada 5 %, Re-agenda 5 %
const conResultado = (n) => mezclar(repartir(n, [25, 20, 25, 10, 5, 5]).flatMap((k, i) => Array(k).fill(CON_RESULTADO[i])));

// n llamadas entre dos días, en turnos de media hora de 9 a 20:30 (sin repetir día y hora), ordenadas
const ocupados = new Set();
function turnos(desde, hasta, n) {
  const dias = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
  const r = [];
  while (r.length < n) {
    const t = { fecha: uno(dias), hora: hhmm(9 * 60 + 30 * entre(0, 23)) };
    if (ocupados.has(t.fecha + t.hora)) continue;
    ocupados.add(t.fecha + t.hora);
    r.push(t);
  }
  return r.sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
}
// un Re-agenda que caiga al final del grupo no tiene "la siguiente": se cambia con uno de la primera mitad
function reagendaTemprano(estados) {
  estados.forEach((e, i) => {
    if (e !== 'Re-agenda' || i < estados.length * 0.6) return;
    const j = estados.findIndex((x, k) => k < estados.length * 0.6 && x !== 'Re-agenda');
    if (j > -1) [estados[i], estados[j]] = [estados[j], estados[i]];
  });
  return estados;
}

const GRUPOS = [
  { w: W1, desde: D(-44), hasta: D(-35), estados: reagendaTemprano(conResultado(26)) },
  { w: W2, desde: D(-8), hasta: D(-1), estados: mezclar([...conResultado(25), 'Pendiente', 'Pendiente', 'Pendiente', 'Confirmada']) },
  { w: W2, desde: H, hasta: H, estados: ['Confirmada', 'Pendiente', 'Pendiente'], sinCloser: [1, 2] },
  { w: W2, desde: D(1), hasta: D(3), estados: mezclar(['Pendiente', 'Pendiente', 'Pendiente', 'Confirmada', 'Confirmada', 'Confirmada']) },
  { w: null, origen: 'IG', desde: D(-20), hasta: D(-2), estados: ['Cerrada', 'Presentada', 'Presentada', 'No-show', 'Cancelada'] },
  { w: null, origen: 'WPP', desde: D(1), hasta: D(4), estados: ['Pendiente', 'Confirmada', 'Pendiente'] },
];

const usados = new Set();
function registroPara(w, estado) {
  const p1 = PESO_RESP[estado] || PESO_RESP.otro, p2 = PESO_MOTIVO[estado] || PESO_MOTIVO.otro;
  const libres = regsDe(w).filter((r) => !usados.has(r.doc.id));
  const r = pesado(libres.map((x) => [x, p1[x.doc.respuestas[P1.id] || ''] * p2[x.doc.respuestas[P2.id] || '']]));
  usados.add(r.doc.id);
  return r;
}

const agendas = [];
const regDeAgenda = new Map();   // id de agenda → {doc, creado} (para el CRM y el ICP)
let nAg = 0;
for (const g of GRUPOS) {
  const ts = turnos(g.desde, g.hasta, g.estados.length);
  g.estados.forEach((Estado, i) => {
    const { fecha, hora } = ts[i];
    const inicio = instante(fecha, hora);
    const reg = g.w ? registroPara(g.w, Estado) : null;
    const p = reg ? reg.doc : nuevaPersona('301');
    const calendly = sale(0.6);
    const form = sale(0.8);
    const tipo = CAPITAL[Estado] ? Estado : 'otro';
    // reservó de 1 a 3 días después de anotarse (o de 1 a 4 antes de la llamada), nunca después de la llamada ni de "ahora"
    const reservo = reg ? Date.parse(reg.creado) + entre(24, 72) * 3600000 + entre(0, 59) * 60000 : inicio - entre(24, 96) * 3600000;
    const Timestamp = iso(Math.min(reservo, inicio - 3 * 3600000, AHORA - 30 * 60000));
    const CalendlyID = calendly ? uuid() : '';
    const presento = Estado === 'Presentada' || Estado === 'Cerrada';
    const ag = {
      id: `ag_demo${pad(++nAg, 3)}`, Nombre: p.nombre, WhatsApp: p.whatsapp, Email: p.email,
      Instagram: !reg || sale(0.3) ? `demo.${slug(p.nombre).replace(/-/g, '')}` : '',
      'Fecha call': fecha, Hora: hora, Estado,
      Closer: g.sinCloser && g.sinCloser.includes(i) ? '' : pesado([[CLOSERS[0], 55], [CLOSERS[1], 45]]),
      Setter: sale(0.5) ? uno(SETTERS) : '', Monto: '', Programa: '', 'Fecha cierre': '',
      Gatillo: presento ? uno(GATILLOS) : '', Notas: sale(0.15) ? uno(NOTAS) : '',
      Capital: form ? pesado(CAPITAL[tipo]) : '', Origen: g.w ? 'WEBINAR' : g.origen,
      Evento: calendly ? 'Llamada de admisión' : '', Timestamp, CalendlyID,
      Negocio: form ? uno(NEGOCIOS) : '', Facturacion: form ? uno(FACTURACION) : '', Objetivo: form ? uno(OBJETIVOS) : '',
      Traba: form ? uno(TRABAS) : '', Urgencia: form ? uno(URGENCIAS) : '', Decisor: form ? uno(DECISORES) : '',
      _fuente: calendly ? 'calendly' : 'manual', ...(calendly ? { fuenteId: `calendly:${CalendlyID}` } : {}),
    };
    agendas.push(ag);
    if (reg) regDeAgenda.set(ag.id, reg);
  });
}

// quien reagendó vuelve en una llamada posterior (la misma persona en dos agendas): en W1 la siguiente con
// resultado, en W2 una de las que vienen
for (const ag of agendas.filter((a) => a.Estado === 'Re-agenda')) {
  const reg = regDeAgenda.get(ag.id);
  if (!reg) continue;
  const despues = agendas.find((b) => b !== ag && b['Fecha call'] > sumarDias(ag['Fecha call'], 1) && regDeAgenda.get(b.id)?.doc.w === reg.doc.w
    && !b.reagendada && (reg.doc.w === W1.id ? ['Presentada', 'Cerrada'].includes(b.Estado) : b['Fecha call'] > H));
  if (!despues) continue;
  // la nueva reserva se hizo después de la llamada que se reagendó
  const reservo = Math.max(Date.parse(despues.Timestamp), instante(ag['Fecha call'], ag.Hora) + 2 * 3600000);
  const Timestamp = iso(Math.min(reservo, instante(despues['Fecha call'], despues.Hora) - 3 * 3600000, AHORA - 30 * 60000));
  Object.assign(despues, { Nombre: ag.Nombre, WhatsApp: ag.WhatsApp, Email: ag.Email, Instagram: ag.Instagram, Timestamp, reagendada: true });
  regDeAgenda.set(despues.id, reg);
}
agendas.forEach((a) => { delete a.reagendada; });

/* ════════ CRM: una venta por llamada pasada con resultado; las Cerradas con su plan (armarCierre) ════════ */
// Cancelada y Descalificada no llevan venta: crmsync las pasaría a No-show / Presentada (§7.7.1)
const PRESENTO = { Presentada: 'Sí', Cerrada: 'Sí', 'No-show': 'No', 'Re-agenda': '' };
const situacionDe = (e) => (e === 'No-show' ? 'No se presentó' : e === 'Re-agenda' ? 'Reagendó'
  : pesado([['Seguimiento', 2], ['No cerró', 2], ['Lo va a pensar', 1]]));
const ALTO = new Set(['1-2K', '2-3K', '>3K']);

function planDe(tipo, fecha, vence2) {
  const medio = uno(MEDIOS);
  const fila0 = (monto) => ({ concepto: 'Adentro en Llamada', monto, fecha, pagado: true, medio });
  if (tipo === 'mentoria') return { programa: 'Mentoría Grupal', total: 450, filas: [fila0(450)] };
  if (tipo === 'pif') return { programa: 'Programa Insignia', total: 900, filas: [fila0(900)] };
  return { programa: 'Programa Insignia', total: 900,
    filas: [fila0(450), { concepto: 'Cuota 2', monto: 450, fecha: vence2 || sumarDias(fecha, 30), pagado: false, medio: '' }] };
}

const crm = [];
let nV = 0, especiales = 0;
const sinCobrar = new Set();   // las dos cuotas del mes anterior sin cobrar (para "traer cuotas")
for (const ag of [...agendas].sort((a, b) => `${a['Fecha call']} ${a.Hora}`.localeCompare(`${b['Fecha call']} ${b.Hora}`))) {
  const presento = PRESENTO[ag.Estado];
  if (presento === undefined || ag['Fecha call'] >= H) continue;
  const reg = regDeAgenda.get(ag.id);
  const t0 = instante(ag['Fecha call'], ag.Hora) + 50 * 60000;
  let venta = {
    id: `v_demo${pad(++nV, 3)}`, tipo: 'venta', mes: ag['Fecha call'].slice(0, 7), v: 1, nombre: ag.Nombre, telefono: ag.WhatsApp,
    mail: ag.Email, instagram: ag.Instagram, fecha: ag['Fecha call'], closer: ag.Closer, notas: '', situacion: '', de: '',
    historial: [{ t: iso(t0), q: ag.Closer, c: 'Creó el registro' }], creadoPor: ag.Closer, presento,
    califica: presento !== 'Sí' ? '' : ag.Estado === 'Cerrada' || reg?.doc.calificado === true || ALTO.has(ag.Capital) ? 'Sí' : 'No',
    dia1: 0, seguimiento: 0, fuente: ag.Origen, setter: ag.Setter, agenda: ag.id,
  };
  if (ag.Estado !== 'Cerrada') {
    venta.situacion = situacionDe(ag.Estado);
    crm.push(venta);
    continue;
  }
  // las dos primeras Cerradas de W1 pagan la segunda cuota a fin del mes anterior y todavía no la pagaron
  const especial = reg?.doc.w === W1.id && especiales < 2;
  const vence2 = especial ? sumarDias(ultimoDiaDelMes(MES_ANT), -2 * especiales++) : '';
  const tipo = especial ? 'dos' : pesado([['pif', 3], ['dos', 4.5], ['mentoria', 2.5]]);
  const r = armarCierre(venta, planDe(tipo, ag['Fecha call'], vence2), { nombre: ag.Closer }, NEG, { ahora: iso(t0 + 10 * 60000) });
  venta = r.venta;
  crm.push(venta);
  for (const c of r.cuotas) {
    if (especial) { sinCobrar.add(c.id); crm.push(c); continue; }
    if (c.fecha < H) {
      const situacion = pesado([['Cobrado', 4], ['Pago Dividido', 1]]);
      const cobrado = situacion === 'Cobrado' ? c.porCobrar : 200;
      Object.assign(c, { situacion, cobrado, v: 2 });
      c.historial = [...c.historial, { t: iso(instante(c.fecha, '12:00')), q: EQUIPO, c: { cobrado: [0, cobrado], situacion: ['Por Cobrar', situacion] } }];
    }
    crm.push(c);
  }
  Object.assign(ag, { Monto: r2(venta.dia1 + venta.seguimiento), Programa: venta.programa, 'Fecha cierre': ag['Fecha call'] });
}

/* ════════ ajustes del CRM y de finanzas ════════ */
const COMISIONES = { def: 10, pct: { 'Laura Gómez': 12 } };
// la liquidación de Laura del mes anterior, ya pagada: 12 % de lo que cobró (ventas + cuotas a su nombre)
const baseLaura = crm.filter((d) => d.mes === MES_ANT && norm(d.closer) === norm('Laura Gómez'))
  .reduce((s, d) => s + (d.tipo === 'venta' ? (d.dia1 || 0) + (d.seguimiento || 0) : d.cobrado || 0), 0);
const pagoLiq = MES + '-05' <= H ? MES + '-05' : H;
const LIQ = baseLaura > 0 ? { [MES_ANT]: { [norm('Laura Gómez')]: { monto: r2(baseLaura * 0.12), fecha: pagoLiq, pct: 12, por: EQUIPO,
  t: iso(Math.min(instante(pagoLiq, '10:00'), AHORA)) } } } : {};
const AJUSTES = [
  { id: 'metas', objetivoMes: 15000, cierreGral: 0.25, showUp: 0.6, agendas: 30 },
  { id: 'comisiones', ...COMISIONES },
  { id: 'liq', ...LIQ },
];

/* ════════ colecciones genéricas de /api/db ════════ */
// 6 evaluaciones de llamadas de W2 que se presentaron (la clave es la de agendas.js: id de la reserva o "r" + fila, + la fecha)
const claveDe = (ag) => ((ag.CalendlyID || 'r' + ag.id).replace(/[^A-Za-z0-9_-]/g, '') + '_' + ag['Fecha call'].replace(/-/g, '')).slice(0, 64);
const NOTAS_EV = ['Buen diagnóstico; le faltó pedir la decisión al final.', 'Manejó bien la objeción de precio.',
  'Habló más que el lead: preguntar más y escuchar.', 'Cierre claro, con fecha para el segundo pago.',
  'Presentó el programa antes de entender el caso.', 'Buen ritmo; repasar cómo cerrar con el socio presente.'];
const medio = () => entre(10, 19) / 2;   // 5 a 9,5 de a medio punto
const evaluaciones = agendas
  .filter((a) => regDeAgenda.get(a.id)?.doc.w === W2.id && ['Presentada', 'Cerrada'].includes(a.Estado) && a['Fecha call'] <= D(-2))
  .slice(0, 6)
  .map((a, i) => ({
    doc: {
      id: claveDe(a), nombre: a.Nombre, fecha: a['Fecha call'], hora: a.Hora, closer: a.Closer, resultado: a.Estado,
      score: medio(), lead: a.Estado === 'Cerrada' ? Math.max(7, medio()) : medio(), interes: medio(), urgencia: medio(),
      por: EQUIPO, notas: NOTAS_EV[i], link: '', estado: 'evaluada',
    },
    creado: iso(instante(sumarDias(a['Fecha call'], 1), '11:00') + i * 60000),
  }));

const ACTIVA = (w) => `9${w.fecha.slice(0, 4)}${w.fecha.slice(5, 7)}00${w.i + 1}`;   // el id de su campaña en el modo demo
const GENERICAS = {
  programas: PROGRAMAS,
  'anun-config': [{ id: 'atribucion', tc: 1, origenes: ['MASTERCLASS', 'WEBINAR'] }],
  'anun-audiencias': [{ id: 'lookalike', ratio: 0.03, paises: ['CO', 'MX'] }],
  'anun-plan': [
    { id: 'p_demo1', nombre: 'Retargeting de registrados', objetivo: 'Retargeting', estado: 'planificada', presupuesto: '25',
      metaId: '', metaNombre: '', inicio: D(1), fin: W3.fecha, angulo: 'Recordatorio del vivo con el caso de un alumno',
      notas: 'Excluir a los que ya agendaron', orden: 0 },
    { id: 'p_demo2', nombre: 'Video nuevo · preguntas frecuentes', objetivo: 'Registros (webinar)', estado: 'revision',
      presupuesto: '30', metaId: '', metaNombre: '', inicio: D(2), fin: W3.fecha, angulo: 'Las tres dudas que más aparecen en las llamadas',
      notas: 'Falta aprobar el guion', orden: 0 },
    { id: 'p_demo3', nombre: `webinar-${W3.mes} · captación`, objetivo: 'Registros (webinar)', estado: 'activa', presupuesto: '60',
      metaId: ACTIVA(W3), metaNombre: `webinar-${W3.mes}`, inicio: sumarDias(W3.fecha, -21), fin: W3.fecha,
      angulo: 'Clase gratuita: el método en tres pasos', notas: 'Intereses amplios + público similar 3 %', orden: 0 },
    { id: 'p_demo4', nombre: `webinar-${W2.mes} · captación`, objetivo: 'Registros (webinar)', estado: 'pausada', presupuesto: '50',
      metaId: ACTIVA(W2), metaNombre: `webinar-${W2.mes}`, inicio: sumarDias(W2.fecha, -21), fin: W2.fecha,
      angulo: 'Clase gratuita: el método en tres pasos', notas: 'Terminó con el vivo', orden: 0 },
  ],
  'utm-links': [
    { id: 'u_demo_meta', nombre: 'Meta Ads · automático', destino: BASE + '/', source: '{{site_source_name}}', medium: 'paid',
      campaign: '{{campaign.name}}', content: '{{ad.name}}', tipo: 'anuncio', pieza_url: '', pieza_titulo: '' },
    { id: 'u_demo_historia', nombre: 'Historia IG · cuenta regresiva', destino: BASE + '/', source: 'ig', medium: 'historia',
      campaign: `webinar-${W3.mes}`, content: 'historia-1', tipo: 'historia', pieza_url: '', pieza_titulo: 'Faltan 7 días' },
    { id: 'u_demo_bio', nombre: 'Link en bio', destino: BASE + '/', source: 'ig', medium: 'bio', campaign: '', content: '',
      tipo: 'link', pieza_url: '', pieza_titulo: '' },
    { id: 'u_demo_mail', nombre: 'Mail a la lista', destino: BASE + '/', source: 'email', medium: 'newsletter',
      campaign: `webinar-${W3.mes}`, content: 'mail-1', tipo: 'mail', pieza_url: '', pieza_titulo: 'Invitación a la clase' },
  ],
  'kpis-fijados': [
    { id: 'cap-reg', tab: 'captacion', etiqueta: 'Registros', orden: instante(D(-3), '10:00') },
    { id: 'clo-cierre', tab: 'closer', etiqueta: 'Tasa de cierre', orden: instante(D(-3), '10:01') },
    { id: 'neg-cash', tab: 'negocio', etiqueta: 'Cash', orden: instante(D(-3), '10:02') },
  ],
  'webinar-asistencia': [{ id: W1.id, asistentes: 160 }, { id: W2.id, asistentes: 210 }],
  // los perfiles de IA de "Todos los webinars": n, compraron y cash los recuenta /api/icp en cada pedido
  'icp-ia': [{
    id: 'todos', estado: 'done', pid: 'demo', desde: iso(instante(D(-1), '16:00')), error: '',
    resultado: {
      generado_at: iso(instante(D(-1), '16:02')),
      lectura: 'Compran sobre todo quienes ya tienen con qué invertir y llegan con un negocio andando: la pregunta de la landing separa bien. Quien viene por un ingreso extra agenda mucho, pero cierra poco.',
      perfiles: [
        { titulo: 'Dueño de negocio con capital para invertir', descripcion: 'Tiene un servicio que ya vende, viene a la clase a conseguir clientes y puede invertir más de 1.000. Agenda rápido y decide en la llamada.',
          rasgos: [{ campo: P1.id, valor: 'Más de 1.000' }, { campo: P2.id, valor: 'Conseguir más clientes' }] },
        { titulo: 'Profesional que invierte en dos pagos', descripcion: 'Puede invertir de 500 a 1.000 y declara entre 1.000 y 2.000 de capital al agendar: suele pedir el plan en dos pagos.',
          rasgos: [{ campo: P1.id, valor: '500 a 1.000' }, { campo: 'Capital', valor: '1-2K' }] },
        { titulo: 'Empleado que busca un ingreso extra', descripcion: 'Se anota por un segundo ingreso: es el que más se registra y agenda, pero compra poco.',
          rasgos: [{ campo: P2.id, valor: 'Tener un ingreso extra' }] },
      ],
      deseos: [
        { titulo: 'Clientes todas las semanas', n: 14, frases: ['Sumar clientes sin depender del boca a boca', 'Llegar a clientes de otras ciudades'] },
        { titulo: 'Un segundo ingreso', n: 9, frases: ['Tener un segundo ingreso', 'Vender un servicio online'] },
        { titulo: 'Orden en las ventas', n: 7, frases: ['Ordenar las ventas del negocio', 'Dejar de cambiar horas por plata'] },
      ],
      dolores: [
        { titulo: 'Falta de tiempo', n: 12, frases: ['No tengo tiempo'] },
        { titulo: 'No saber por dónde arrancar', n: 10, frases: ['No sé por dónde empezar', 'Me falta un método'] },
        { titulo: 'Miedo a invertir', n: 6, frases: ['Me da miedo invertir y no recuperarlo', 'Probé solo y no me funcionó'] },
      ],
    },
  }],
};

/* ════════ escribir ════════ */
const NUEVOS = {
  personas: PERSONAS.map((p) => p.id),
  webinars: webinars.map((w) => w.id),
  ajustes: ['negocio', 'estado', ...AJUSTES.map((a) => a.id)],
  registros: registros.map((r) => r.doc.id),
  agendas: agendas.map((a) => a.id),
  crm: crm.map((d) => d.id),
  'ag-evaluaciones': evaluaciones.map((e) => e.doc.id),
  ...Object.fromEntries(Object.entries(GENERICAS).map(([col, docs]) => [col, docs.map((d) => d.id)])),
};

// lo que cargó una corrida anterior y esta ya no carga (p. ej. los webinars de otro día) se va. Si la demo era de otro
// día, con el driver archivo los registros y las evaluaciones se rehacen enteros: su `creado` tiene que ser el nuevo.
if (anterior?.ids) {
  const rehacer = ARCHIVO && anterior.hoy !== H ? new Set(['registros', 'ag-evaluaciones']) : new Set();
  if (rehacer.size) console.log(`· La demo cargada era del ${anterior.hoy}: rehago los registros con las fechas nuevas`);
  for (const [col, ids] of Object.entries(anterior.ids)) {
    const quedan = new Set(rehacer.has(col) ? [] : NUEVOS[col] || []);
    await borrarIds(col, ids.filter((id) => !quedan.has(id)));
  }
}

// personas: el código de demo vuelve a ser el de la demo; sesiones y último ingreso se conservan
for (const p of PERSONAS) {
  const ya = await obtener('personas', p.id);
  await fusionar('personas', p.id, {
    nombre: p.nombre, rol: p.rol, activo: !!p.codigo, codigoHash: p.codigo ? hashCodigo(p.codigo) : null,
    ...(ya ? {} : { sesionVer: 0, ultimoIngreso: null, v: 0 }),
  });
}
await escribir('programas', GENERICAS.programas);
await escribir('webinars', webinars);
await fijarWebinarActivo(W3.id);
console.log('· Personas, programas y webinars');
await escribirConFecha('registros', registros);
console.log(`· ${registros.length} registros`);
await escribir('agendas', agendas);
await escribir('crm', crm);
await escribir('ajustes', AJUSTES);
console.log(`· ${agendas.length} agendas y el CRM`);
await escribirConFecha('ag-evaluaciones', evaluaciones);
for (const [col, docs] of Object.entries(GENERICAS)) if (col !== 'programas') await escribir(col, docs);
await guardar('ajustes', { id: 'semilla', hoy: H, cuando: new Date().toISOString(), ids: NUEVOS });

/* ════════ resumen y accesos ════════ */
const cuenta = (xs, f) => xs.filter(f).length;
const ventas = crm.filter((d) => d.tipo === 'venta'), cuotas = crm.filter((d) => d.tipo === 'cuota');
const porEstado = Object.entries(agendas.reduce((m, a) => ({ ...m, [a.Estado]: (m[a.Estado] || 0) + 1 }), {}))
  .map(([e, n]) => `${e} ${n}`).join(' · ');
console.log(`
✓ Demo cargada: ${NEGOCIO.nombre}
  webinars    ${webinars.map((w) => `${w.nombre} (${w.fecha})`).join(' · ')} · en la landing: ${webinars[2].nombre}
  registros   ${regsDe(W1).length} + ${regsDe(W2).length} + ${regsDe(W3).length} = ${registros.length} (${cuenta(registros, (r) => r.doc.respondio)} contestaron, ${cuenta(registros, (r) => r.doc.calificado === true)} calificados)
  agendas     ${agendas.length}: ${porEstado}
  CRM         ${ventas.length} ventas (${cuenta(ventas, (v) => v.plan)} con cierre) · ${cuotas.length} cuotas (${cuenta(cuotas, (c) => c.cobrado > 0)} cobradas, ${sinCobrar.size} del mes anterior sin cobrar)
  además      ${evaluaciones.length} evaluaciones · ${GENERICAS['anun-plan'].length} campañas en Planificar · ${GENERICAS['utm-links'].length} links con UTM · ${GENERICAS['kpis-fijados'].length} KPIs fijados · perfiles de IA en "Todos los webinars"
${ARCHIVO ? '' : '  (Supabase pone la fecha de alta de cada documento: los registros quedan con la de hoy; su día real está en `dia`)\n'}
Accesos de demo (cada link entra directo):`);
for (const p of PERSONAS.filter((x) => x.codigo)) {
  console.log(`  ${p.rol.padEnd(8)} ${p.nombre.padEnd(12)} ${p.codigo}   ${BASE}/app/#k=${p.codigo}`);
}
console.log(`
Ojo: estos códigos son públicos (están en este script). Antes de usar el sitio con datos reales,
sacá la demo con  npm run semilla -- --borrar , entrá con tu CODIGO_INICIAL y creá los accesos desde Equipo.
CODIGO_INICIAL sirve solo si no queda ninguna persona, ni siquiera una dada de baja (npm run probar deja una):
si no entra, creá tu acceso con  npm run acceso -- "Tu nombre" equipo .
Para que Ads, Inicio, KPIs, Funnel y Finanzas muestren gasto: DEMO_META=1 en .env (y reiniciá el servidor).`);
