// La checklist del webinar: plantilla propia de 8 bloques (fases 0 a 7) con vencimientos contados desde el vivo.
// Tarea = {id: 't…', bloque, texto, vence: 'YYYY-MM-DD', hecha, offset: días respecto del vivo | null (a mano)}
import { sumarDias, esFecha } from './fechas.mjs';
import { nuevoId } from './normalizar.mjs';

const V = 'ventana';   // el offset de la última tarea es la ventana de cierre
export const PLANTILLA = [
  ['Fase 0 · Estrategia', [
    ['Definir la promesa y a quién le habla la clase', -30],
    ['Definir la oferta del final y su precio', -28],
    ['Cargar la proyección del webinar', -27]]],
  ['Fase 1 · Landing y registro', [
    ['Escribir la landing y las preguntas de calificación', -24],
    ['Conectar el píxel y probar los eventos', -22],
    ['Crear el grupo de WhatsApp y cargar el link', -21],
    ['Probar el registro de punta a punta', -20]]],
  ['Fase 2 · Mails y recordatorios', [
    ['Secuencia de confirmación en el email marketing', -19],
    ['Recordatorios de 24 h, 1 h y "estamos en vivo"', -17],
    ['Video para la página de gracias', -15]]],
  ['Fase 3 · Anuncios', [
    ['Grabar los creativos', -21],
    ['Armar las campañas con UTM', -18],
    ['Lanzar los anuncios', -14]]],
  ['Fase 4 · Captación', [
    ['Revisar costo por registro y calificados cada día', -10],
    ['Contenido orgánico de la semana del vivo', -7],
    ['Ajustar presupuesto según el costo por registro', -3]]],
  ['Fase 5 · Presentación', [
    ['Guion de la clase y de la oferta', -10],
    ['Ensayo completo', -3],
    ['Prueba técnica de la plataforma de transmisión', -1]]],
  ['Fase 6 · El vivo', [
    ['Abrir la sala 15 minutos antes', 0],
    ['Cargar la asistencia en el Inicio', 1]]],
  ['Fase 7 · Cierre y seguimiento', [
    ['Llamar a las agendas en menos de 24 h', 1],
    ['Seguimiento a los que no agendaron', 2],
    ['Cargar ventas y planes de pago en Ventas', 3],
    ['Revisión: qué funcionó y qué no', V]]],
];
const ORDEN = new Map(PLANTILLA.map(([b], i) => [b, i]));

export const nuevaTarea = ({ bloque, texto, vence, offset = null }) => ({ id: nuevoId('t'), bloque, texto, vence, hecha: false, offset });

export function armarTareas(fecha, ventana = 10) {
  const v = Number.isInteger(Number(ventana)) && Number(ventana) > 0 ? Number(ventana) : 10;
  return PLANTILLA.flatMap(([bloque, tareas]) => tareas.map(([texto, d]) => {
    const offset = d === V ? v : d;
    return nuevaTarea({ bloque, texto, vence: sumarDias(fecha, offset), offset });
  }));
}

// Bloques de la plantilla en orden de fase; los demás (p. ej. "Otras") después, en el orden en que aparecen.
// Dentro de cada bloque, por vencimiento (estable).
export function ordenar(tareas) {
  const lista = Array.isArray(tareas) ? tareas : [];
  const rango = new Map();
  for (const t of lista) if (!rango.has(t.bloque)) rango.set(t.bloque, ORDEN.has(t.bloque) ? ORDEN.get(t.bloque) : 100 + rango.size);
  return lista
    .map((t, i) => [t, i])
    .sort(([a, i], [b, j]) => rango.get(a.bloque) - rango.get(b.bloque) || String(a.vence).localeCompare(String(b.vence)) || i - j)
    .map(([t]) => t);
}

export function progreso(tareas, hoy) {
  const lista = Array.isArray(tareas) ? tareas : [];
  const hechas = lista.filter((t) => t.hecha === true).length;
  const vencidas = lista.filter((t) => t.hecha !== true && String(t.vence) < hoy).length;
  return { hechas, total: lista.length, vencidas, pct: lista.length ? Math.round((100 * hechas) / lista.length) : 0 };
}

// Mover el vivo n días corre todos los vencimientos lo mismo (el offset respecto del vivo no cambia)
export function correrFechas(tareas, dias) {
  const n = Number(dias) || 0;
  return (Array.isArray(tareas) ? tareas : []).map((t) => (n && esFecha(t.vence) ? { ...t, vence: sumarDias(t.vence, n) } : { ...t }));
}
