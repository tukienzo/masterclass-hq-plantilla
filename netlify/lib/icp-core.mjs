// Agregados de /api/icp (UTM's, Trazabilidad e ICP) y el conteo en vivo de los perfiles de IA (§7.9).
// Sale de tres lecturas: los registros del alcance, las agendas del pipeline (unidas en personas por mail o
// WhatsApp, pipeline.personas) y las preguntas de la landing. De los registros no sale ningún dato personal.
//
// Cruce: cada persona del pipeline se queda con UN registro del alcance (el que tenía al agendar por primera vez;
// si ninguno es anterior, el más reciente). Si dos personas se quedan con el mismo registro (uno con el mail de una
// y el teléfono de otra), el registro prueba que son la misma y se unen. Así el cash no se cuenta dos veces, toda
// persona queda o en un registro o en sinRegistro y un registro tiene a lo sumo una persona.
import { obtener, listar, fusionar } from './almacen.mjs';
import { opciones as opcionesNegocio } from './config.mjs';
import { normUtm, norm, email, tel8, monto, idSeguro } from './normalizar.mjs';
import { cargarAgendas, personas as personasDe } from './pipeline.mjs';
import { leerIntegracion } from './integraciones/estado.mjs';

const DIMS = ['utm_source', 'utm_campaign', 'utm_content'];
const CTX = { utm_campaign: 'utm_source', utm_content: 'utm_campaign' };   // fuente dominante · campaña dominante
const ETIQUETAS = { Facturacion: 'Facturación' };
const LIBRES = ['Objetivo', 'Traba'];
const VENCE_MS = 16 * 60 * 1000;          // un 'working' más viejo que esto se da por cortado
const TOPE_TEXTOS = 300;                  // textos libres que viajan a la IA (entre Objetivo y Traba)

// 'todos' o un id de webinar (el id de icp-ia/<w>)
export const alcanceValido = (w) => w === 'todos' || idSeguro(w);

const txt = (v) => (v == null ? '' : String(v).trim());
// respuesta propia del registro: una pregunta con id 'constructor' no hereda nada de Object.prototype
const propia = (o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? txt(o[k]) : '');
const redondo = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : 0; };
const telDe = (r) => tel8(r?.tel8) || tel8(r?.whatsapp);
const esPresento = (f) => f.Estado === 'Presentada' || f.Estado === 'Cerrada';
const cuando = (f) => `${txt(f['Fecha call'])} ${txt(f.Hora)}`;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // por código, sin depender del idioma del servidor
const masReciente = (a, b) => cmp(cuando(b), cuando(a));

// union-find: items con las mismas claves (mail o tel8) quedan en el mismo grupo
function agrupar(items, clavesDe) {
  const padre = items.map((_, i) => i);
  const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const vista = new Map();
  items.forEach((it, i) => {
    for (const k of clavesDe(it)) {
      if (!k) continue;
      if (vista.has(k)) padre[raiz(i)] = raiz(vista.get(k));
      else vista.set(k, i);
    }
  });
  const grupos = new Map();
  items.forEach((it, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(it); });
  return [...grupos.values()];
}
const clavesReg = (r) => [email(r.email) && 'e:' + email(r.email), telDe(r) && 't:' + telDe(r)];

// ── contadores ──
const vacio = () => ({ n: 0, calificados: 0, respondieron: 0, agendaron: 0, presentaron: 0, compraron: 0, cash: 0 });
function sumar(a, s) { for (const k in a) a[k] += s[k] || 0; return a; }
const con = (a, claves) => Object.fromEntries(claves.map((k) => [k, k === 'cash' ? redondo(a[k]) : a[k]]));
const C_GRUPO = ['n', 'calificados', 'agendaron', 'presentaron', 'compraron', 'cash'];
const C_TOTAL = ['n', 'calificados', 'respondieron', 'agendaron', 'presentaron', 'compraron', 'cash'];
const C_OPCION = ['n', 'agendaron', 'presentaron', 'compraron', 'cash'];
const C_AGENDA = ['n', 'presentaron', 'compraron', 'cash'];
const C_COMBO = ['n', 'agendaron', 'compraron', 'cash'];

function masFrecuente(cuenta) {
  let mejor = '', n = -1;
  for (const [k, v] of cuenta) if (v > n || (v === n && k < mejor)) { mejor = k; n = v; }
  return mejor;
}

// preguntas de la landing, unidas por id; ws en orden de prioridad (el primero pone el texto y el orden)
function preguntasDe(ws) {
  const porId = new Map();
  for (const wb of ws) {
    for (const q of Array.isArray(wb?.landing?.preguntas) ? wb.landing.preguntas : []) {
      const id = txt(q?.id);
      if (!id) continue;
      const opciones = (Array.isArray(q.opciones) ? q.opciones : []).map(txt).filter(Boolean);
      const calificadas = (Array.isArray(q.calificadas) ? q.calificadas : []).map(txt).filter(Boolean);
      const p = porId.get(id);
      if (!p) porId.set(id, { id, texto: txt(q.texto) || id, opciones: [...new Set(opciones)], calificadas: new Set(calificadas) });
      else {
        for (const o of opciones) if (!p.opciones.includes(o)) p.opciones.push(o);
        calificadas.forEach((c) => p.calificadas.add(c));
      }
    }
  }
  return [...porId.values()];
}

// El cálculo entero, sin leer la base (lo prueban los scripts con datos armados a mano).
// regs = registros del alcance · ps = pipeline.personas(agendas) · preguntas = preguntasDe(...) · campos = camposAgenda
export function calcular({ regs = [], ps = [], preguntas = [], campos = [] }) {
  // persona con sus agendas (la más reciente primero), sus contactos y cómo terminó
  const persona = (filasIn, emailsIn, telsIn) => {
    const filas = [...filasIn].sort(masReciente);
    const cerradas = filas.filter((f) => f.Estado === 'Cerrada');
    const ag = {};
    for (const c of [...campos, ...LIBRES]) ag[c] = filas.map((f) => txt(f[c])).find(Boolean) || '';
    const emails = new Set([...(emailsIn || [])].map(email));
    const tels = new Set([...(telsIn || [])].map(tel8));
    for (const f of filas) { emails.add(email(f.Email)); tels.add(tel8(f.WhatsApp)); }
    emails.delete(''); tels.delete('');
    const ts = filas.map((f) => ms(f.Timestamp)).filter(Boolean);
    return {
      filas, ag, emails, tels, primera: ts.length ? Math.min(...ts) : 0, reg: null,
      presento: filas.some(esPresento), compro: cerradas.length > 0,
      cash: redondo(cerradas.reduce((a, f) => a + (monto(f.Monto) || 0), 0)),
    };
  };
  const P0 = ps.map((p) => persona(p.filas || [], p.emails, p.tels));

  // registro → personas candidatas (por mail o tel8); cada persona elige uno
  const porClave = new Map();
  const anotar = (k, i) => { if (!porClave.has(k)) porClave.set(k, new Set()); porClave.get(k).add(i); };
  P0.forEach((p, i) => { p.emails.forEach((e) => anotar('e:' + e, i)); p.tels.forEach((t) => anotar('t:' + t, i)); });
  const candidatos = P0.map(() => []);
  regs.forEach((r, j) => {
    const is = new Set();
    for (const k of clavesReg(r)) if (k) for (const i of porClave.get(k) || []) is.add(i);
    is.forEach((i) => candidatos[i].push(j));
  });
  P0.forEach((p, i) => {
    const js = candidatos[i];
    if (!js.length) return;
    const antes = p.primera ? js.filter((j) => ms(regs[j].creado) <= p.primera) : [];
    const de = antes.length ? antes : js;
    p.reg = de.reduce((a, j) => (ms(regs[j].creado) >= ms(regs[a].creado) ? j : a), de[0]);
  });

  // las que se quedaron con el mismo registro son una sola persona (en el lugar de la primera)
  const P = [], duenio = regs.map(() => null);
  for (const p of P0) {
    if (p.reg === null) { P.push(p); continue; }
    const otra = duenio[p.reg];
    if (!otra) { duenio[p.reg] = p; P.push(p); continue; }
    Object.assign(otra, persona([...otra.filas, ...p.filas], [...otra.emails, ...p.emails], [...otra.tels, ...p.tels]), { reg: p.reg });
  }

  // estado de cada registro: lo que respondió + cómo terminó la persona que se quedó con él
  const E = regs.map((r, j) => {
    const mias = duenio[j] ? [duenio[j]] : [];
    const ag = {};
    for (const c of campos) ag[c] = mias.map((p) => p.ag[c]).find(Boolean) || '';
    const utm = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) utm[k] = normUtm(r.utm?.[k]);
    const resp = r.respuestas && typeof r.respuestas === 'object' && !Array.isArray(r.respuestas) ? r.respuestas : {};
    // igual que registros.resumen: sin la marca, cuenta si tiene respuestas
    const respondio = r.respondio === true || (r.respondio == null && Object.keys(resp).length > 0);
    const s = {
      n: 1, calificados: r.calificado === true ? 1 : 0, respondieron: respondio ? 1 : 0,
      agendaron: mias.length ? 1 : 0, presentaron: mias.some((p) => p.presento) ? 1 : 0,
      compraron: mias.some((p) => p.compro) ? 1 : 0, cash: mias.reduce((a, p) => a + p.cash, 0),
    };
    return { r, utm, s, ag, resp };
  });

  // ── utm ──
  const totales = E.reduce((a, e) => sumar(a, e.s), vacio());
  const dims = {};
  for (const d of DIMS) {
    const g = new Map();
    for (const e of E) {
      const k = e.utm[d];
      if (!g.has(k)) g.set(k, { a: vacio(), ctx: new Map() });
      const x = g.get(k);
      sumar(x.a, e.s);
      if (CTX[d]) { const c = e.utm[CTX[d]]; x.ctx.set(c, (x.ctx.get(c) || 0) + 1); }
    }
    dims[d] = [...g].sort(([ka, a], [kb, b]) => b.a.n - a.a.n || cmp(ka, kb))
      .map(([k, x]) => ({ k, ...(CTX[d] ? { ctx: masFrecuente(x.ctx) } : {}), ...con(x.a, C_GRUPO) }));
  }
  const combos = new Map();
  for (const e of E) {
    const c = { source: e.utm.utm_source, medium: e.utm.utm_medium, campaign: e.utm.utm_campaign, content: e.utm.utm_content };
    const k = JSON.stringify(c);
    if (!combos.has(k)) combos.set(k, { c, a: vacio() });
    sumar(combos.get(k).a, e.s);
  }
  const sin = P.filter((p) => p.reg === null);

  // ── recorridos y montos (todo el pipeline) ──
  const idDe = (f) => String(f.id ?? f._id ?? '');
  const recorridos = [...P].sort((a, b) => masReciente(a.filas[0] || {}, b.filas[0] || {})).map((p) => {
    const e = p.reg === null ? null : E[p.reg];
    return {
      filas: p.filas.map(idDe).filter(Boolean), presento: p.presento, compro: p.compro, cash: p.cash,
      reg: e && {
        creado: e.r.creado || '',
        utm: { utm_source: e.utm.utm_source, utm_campaign: e.utm.utm_campaign, utm_content: e.utm.utm_content },
        calificado: e.r.calificado === true ? true : e.r.calificado === false ? false : null,
        respuestas: Object.fromEntries(Object.entries(e.resp).filter(([, v]) => typeof v === 'string')),
      },
    };
  });
  const montos = {};
  for (const p of P) for (const f of p.filas) if (f.Estado === 'Cerrada' && idDe(f)) montos[idDe(f)] = monto(f.Monto) ?? 0;

  // ── icp ──
  const landing = preguntas.map((q) => {
    const resp = vacio(), sinResp = vacio(), porOpcion = new Map();
    for (const e of E) {
      const v = propia(e.resp, q.id);
      if (!v) { sumar(sinResp, e.s); continue; }
      sumar(resp, e.s);
      if (!porOpcion.has(v)) porOpcion.set(v, vacio());
      sumar(porOpcion.get(v), e.s);
    }
    const fila = (opcion, vieja) => ({ opcion, ...con(porOpcion.get(opcion) || vacio(), C_OPCION), califica: q.calificadas.has(opcion), vieja });
    const viejas = [...porOpcion].filter(([v]) => !q.opciones.includes(v)).sort(([va, a], [vb, b]) => b.n - a.n || cmp(va, vb));
    return {
      id: q.id, texto: q.texto,
      opciones: [...q.opciones.map((o) => fila(o, false)), ...viejas.map(([v]) => fila(v, true))],
      respondieron: con(resp, C_OPCION), sinRespuesta: con(sinResp, C_OPCION),
    };
  });
  const stP = (p) => ({ n: 1, presentaron: p.presento ? 1 : 0, compraron: p.compro ? 1 : 0, cash: p.cash });
  const agenda = [];
  for (const campo of campos) {
    const resp = { n: 0, presentaron: 0, compraron: 0, cash: 0 }, g = new Map();
    for (const p of P) {
      const v = p.ag[campo];
      if (!v) continue;
      sumar(resp, stP(p));
      if (!g.has(v)) g.set(v, { n: 0, presentaron: 0, compraron: 0, cash: 0 });
      sumar(g.get(v), stP(p));
    }
    if (!resp.n) continue;
    agenda.push({
      campo, etiqueta: ETIQUETAS[campo] || campo,
      opciones: [...g].sort(([va, a], [vb, b]) => b.n - a.n || cmp(va, vb)).map(([respuesta, a]) => ({ respuesta, ...con(a, C_AGENDA) })),
      respondieron: con(resp, C_AGENDA),
    });
  }
  const texto = {};
  for (const c of LIBRES) { const n = P.filter((p) => p.ag[c]).length; if (n) texto[c] = n; }

  const tot = con(totales, C_TOTAL);
  const r = {
    utm: {
      totales: tot,
      dims,
      combos: [...combos.values()].sort((a, b) => b.a.n - a.a.n).map(({ c, a }) => ({ ...c, ...con(a, C_COMBO) })),
      sinRegistro: { agendas: sin.length, ventas: sin.filter((p) => p.compro).length, cash: redondo(sin.reduce((a, p) => a + p.cash, 0)) },
    },
    recorridos,
    montos,
    icp: {
      base: {
        registros: { ...tot },
        pipeline: { n: P.length, compraron: P.filter((p) => p.compro).length, cash: redondo(P.reduce((a, p) => a + p.cash, 0)) },
      },
      landing,
      agenda,
      texto,
    },
  };

  // para los perfiles de IA (no salen en el JSON): a quién se le cuenta cada perfil y los textos libres
  const soloCampos = (ag) => Object.fromEntries(campos.map((c) => [c, ag[c] || '']));
  const universo = [
    ...E.map((e) => ({ resp: e.resp, ag: soloCampos(e.ag), compro: e.s.compraron > 0, cash: e.s.cash })),
    ...sin.map((p) => ({ resp: {}, ag: soloCampos(p.ag), compro: p.compro, cash: p.cash })),
  ];
  const orden = [...P].sort((a, b) => (b.compro - a.compro) || (b.presento - a.presento));   // primero los que compraron
  const textos = Object.fromEntries(LIBRES.map((c) => [c, orden.map((p) => p.ag[c]).filter(Boolean)]));
  Object.defineProperty(r, 'universo', { value: universo, enumerable: false });
  Object.defineProperty(r, 'textos', { value: textos, enumerable: false });
  return r;
}

// Registros del alcance: los del webinar, o con 'todos' uno por persona (mismo mail o tel8: el más reciente).
// Un id que no existe es un alcance vacío (también si quedaron registros huérfanos de un webinar borrado).
export async function armarICP(w) {
  const [agendas, opc] = await Promise.all([cargarAgendas(), opcionesNegocio()]);
  let regs = [], ws = [];
  if (w === 'todos') {
    const [todos, webinars] = await Promise.all([listar('registros'), listar('webinars')]);
    regs = agrupar(todos, clavesReg).map((g) => g.reduce((a, b) => (ms(b.creado) >= ms(a.creado) ? b : a)));
    ws = webinars.sort((a, b) => cmp(`${txt(b.fecha)} ${txt(b.hora)}`, `${txt(a.fecha)} ${txt(a.hora)}`));   // el más nuevo manda
  } else if (idSeguro(w)) {
    const wb = await obtener('webinars', w);
    if (wb) { ws = [wb]; regs = await listar('registros', { donde: { w } }); }
  }
  const campos = (Array.isArray(opc.camposAgenda) ? opc.camposAgenda : []).map(txt).filter(Boolean);
  const ps = await personasDe(agendas || []);
  return calcular({ regs, ps: Array.isArray(ps) ? ps : [], preguntas: preguntasDe(ws), campos });
}

// Cuántos cumplen todos los rasgos de cada perfil, con los datos de hoy. universo = armarICP(w).universo
export function contarPerfiles(perfiles, universo) {
  return (Array.isArray(perfiles) ? perfiles : []).filter((p) => p && typeof p === 'object').map((p) => {
    const rasgos = (Array.isArray(p.rasgos) ? p.rasgos : []).filter((x) => x && txt(x.campo))
      .map((x) => ({ campo: txt(x.campo), valor: txt(x.valor) }));
    let n = 0, compraron = 0, cash = 0;
    if (rasgos.length) {
      for (const u of universo || []) {
        const cumple = rasgos.every((x) => (Object.hasOwn(u.ag, x.campo) ? u.ag[x.campo] : propia(u.resp, x.campo)) === x.valor);
        if (!cumple) continue;
        n++;
        if (u.compro) compraron++;
        cash += u.cash || 0;
      }
    }
    return { titulo: txt(p.titulo), descripcion: txt(p.descripcion), rasgos, n, compraron, cash: redondo(cash) };
  });
}

// El bloque `ia` de /api/icp: si hay clave y el estado de icp-ia/<w>, con los perfiles recontados.
export async function estadoIA(w, datos) {
  const integ = await leerIntegracion('ia');
  const ia = { hayKey: !!integ.conectada, estado: '', pid: '', error: '', resultado: null };
  if (!alcanceValido(w)) return ia;
  let doc = await obtener('icp-ia', w);
  if (!doc) return ia;
  if (doc.estado === 'working' && !(Date.now() - ms(doc.desde) <= VENCE_MS)) {
    doc = await fusionar('icp-ia', w, { estado: 'error', error: 'Se cortó el cálculo: probá de nuevo.' });
  }
  ia.estado = ['working', 'done', 'error'].includes(doc.estado) ? doc.estado : '';
  ia.pid = txt(doc.pid);
  ia.error = txt(doc.error);
  const r = doc.resultado;
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const temas = (L) => (Array.isArray(L) ? L : []).filter((t) => t && txt(t.titulo))
      .map((t) => ({ titulo: txt(t.titulo), n: Number(t.n) || 0, frases: (Array.isArray(t.frases) ? t.frases : []).map(txt).filter(Boolean) }));
    ia.resultado = {
      generado_at: txt(r.generado_at), lectura: txt(r.lectura),
      perfiles: contarPerfiles(r.perfiles, datos?.universo || []),
      deseos: temas(r.deseos), dolores: temas(r.dolores),
    };
  }
  return ia;
}

// ── lo que viaja a Claude: solo agregados y textos libres limpios ──

// links (con esquema, www., dominio con ruta como instagram.com/x o bit.ly/x, y .com/.net/.org sueltos), mails,
// @usuarios y teléfonos (7+ dígitos, con espacios, guiones, paréntesis, puntos o barras en el medio) → [dato].
// Un monto con puntos de miles (1.500.000) o una fecha (15/10/2026) no es un teléfono: queda como está.
// Mails y dominios arrancan solo al principio de su tramo (lookbehind): si no, un texto como 'a.a.a.a…' tarda
// cuadrático, porque se reintenta desde cada letra.
const noEsTel = (m) => /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(m)
  || /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/.test(m);
export function limpiarTexto(s, max = 300) {
  return txt(s)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[dato]')
    .replace(/(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[dato]')
    .replace(/(?<![a-z0-9.-])(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/gi, '[dato]')
    .replace(/(?<![a-z0-9.-])(?:[a-z0-9-]+\.)+(?:com|net|org)(?:\.[a-z]{2})?\b/gi, '[dato]')
    .replace(/@[\w.]{2,}/g, '[dato]')
    .replace(/\+?\d(?:[\s().\/-]{0,2}\d){6,}/g, (m) => (noEsTel(m) ? m : '[dato]'))
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
const sensible = (s) => limpiarTexto(s, 10000) !== txt(s).replace(/\s+/g, ' ');

// hasta `tope` textos entre los dos campos, mitad y mitad (lo que uno no usa lo toma el otro)
function repartir(textos, tope) {
  const L = LIBRES.map((c) => (textos?.[c] || []).map((t) => limpiarTexto(t)).filter((t) => t && t !== '[dato]'));
  const mitad = Math.floor(tope / L.length);
  const cupos = L.map((l) => Math.min(l.length, mitad));
  let resto = tope - cupos.reduce((a, b) => a + b, 0);
  L.forEach((l, i) => { const mas = Math.min(resto, l.length - cupos[i]); cupos[i] += mas; resto -= mas; });
  return Object.fromEntries(LIBRES.map((c, i) => [c, L[i].slice(0, cupos[i])]));
}

export function pedidoIA(d) {
  return {
    base: d.icp.base,
    landing: d.icp.landing.map((q) => ({
      id: q.id, texto: q.texto,
      opciones: q.opciones.filter((o) => !o.vieja || (o.n > 0 && !sensible(o.opcion)))
        .map(({ opcion, n, agendaron, presentaron, compraron, cash, califica }) => ({ opcion, n, agendaron, presentaron, compraron, cash, califica })),
      respondieron: q.respondieron, sinRespuesta: q.sinRespuesta,
    })),
    agenda: d.icp.agenda.map((c) => ({
      campo: c.campo, etiqueta: c.etiqueta,
      opciones: c.opciones.filter((o) => !sensible(o.respuesta)).slice(0, 40),   // los textos sueltos de a uno no suman
      respondieron: c.respondieron,
    })),
    textos: repartir(d.textos, TOPE_TEXTOS),
  };
}

// Lo que devolvió Claude, recortado a lo que se puede contar: rasgos que existen en el pedido (si no coincide
// exacto, se busca sin tildes ni mayúsculas), máx. 6 perfiles / 6 deseos / 6 dolores / 3 frases, y frases que de
// verdad salen de los textos que se mandaron.
export function validarIA(r, pedido) {
  const exactos = new Set(), flojos = new Map();
  const sumarPar = (campo, valor) => {
    exactos.add(campo + '\u0000' + valor);
    const k = norm(campo) + '\u0000' + norm(valor);
    flojos.set(k, flojos.has(k) && flojos.get(k)[1] !== valor ? null : [campo, valor]);
  };
  for (const q of pedido.landing) for (const o of q.opciones) sumarPar(q.id, o.opcion);
  for (const c of pedido.agenda) for (const o of c.opciones) sumarPar(c.campo, o.respuesta);
  const canonico = (campo, valor) => (exactos.has(campo + '\u0000' + valor) ? [campo, valor] : flojos.get(norm(campo) + '\u0000' + norm(valor)) || null);
  const corto = (s, max) => txt(s).replace(/\s+/g, ' ').slice(0, max);

  const perfiles = (Array.isArray(r?.perfiles) ? r.perfiles : []).map((p) => {
    const usados = new Set(), rasgos = [];
    for (const x of Array.isArray(p?.rasgos) ? p.rasgos : []) {
      const par = canonico(txt(x?.campo), txt(x?.valor));
      if (!par || usados.has(par[0])) continue;
      usados.add(par[0]);
      rasgos.push({ campo: par[0], valor: par[1] });
    }
    return { titulo: corto(p?.titulo, 80), descripcion: corto(limpiarTexto(p?.descripcion, 400), 400), rasgos: rasgos.slice(0, 6) };
  }).filter((p) => p.titulo && p.rasgos.length).slice(0, 6);

  const temas = (L, fuentes) => {
    if (!fuentes.length) return [];
    const base = fuentes.map(norm);
    return (Array.isArray(L) ? L : []).map((t) => ({
      titulo: corto(t?.titulo, 80),
      n: Math.max(0, Math.min(Math.round(Number(t?.n) || 0), fuentes.length)),
      frases: (Array.isArray(t?.frases) ? t.frases : []).map((f) => limpiarTexto(f))
        .filter((f) => f && norm(f) && base.some((b) => b.includes(norm(f)))).slice(0, 3),
    })).filter((t) => t.titulo && t.n > 0).slice(0, 6);
  };
  return {
    lectura: corto(limpiarTexto(r?.lectura, 1500), 1500),
    perfiles,
    deseos: temas(r?.deseos, pedido.textos.Objetivo || []),
    dolores: temas(r?.dolores, pedido.textos.Traba || []),
  };
}
