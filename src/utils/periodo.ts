import type { Marca, Periodo } from '../types';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Extrae el rango de fechas (YYYY-MM-DD) cubierto por un conjunto de marcas. */
export function rangoFechasMarcas(
  marcas: Pick<Marca, 'fechaHora'>[],
): { fechaInicio: string; fechaFin: string } | null {
  if (marcas.length === 0) return null;
  let min = marcas[0].fechaHora;
  let max = marcas[0].fechaHora;
  for (const m of marcas) {
    if (m.fechaHora < min) min = m.fechaHora;
    if (m.fechaHora > max) max = m.fechaHora;
  }
  return { fechaInicio: min.slice(0, 10), fechaFin: max.slice(0, 10) };
}

/** Sugiere un nombre legible para un rango de fechas. */
export function sugerirNombrePeriodo(fechaInicio: string, fechaFin: string): string {
  const [y1, m1] = fechaInicio.split('-').map(Number);
  const [y2, m2] = fechaFin.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${MESES[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${MESES[m1 - 1]} - ${MESES[m2 - 1]} ${y1}`;
  return `${MESES[m1 - 1]} ${y1} - ${MESES[m2 - 1]} ${y2}`;
}

/** True si dos rangos [F1,F2] se intersecan (inclusivo). */
export function rangosSeIntersectan(
  a: { fechaInicio: string; fechaFin: string },
  b: { fechaInicio: string; fechaFin: string },
): boolean {
  return !(a.fechaFin < b.fechaInicio || a.fechaInicio > b.fechaFin);
}

/**
 * Resultado de la detección al importar:
 *  - existente: el rango se intersecta con uno (o más) periodos ya registrados.
 *  - nuevo: no hay solapamiento; se sugiere crear uno.
 */
export type DeteccionPeriodo =
  | {
      tipo: 'existente';
      rango: { fechaInicio: string; fechaFin: string };
      coincidencias: Periodo[];
      /** Mejor candidato (mayor solapamiento). */
      principal: Periodo;
      sugerencia: { nombre: string; fechaInicio: string; fechaFin: string };
    }
  | {
      tipo: 'nuevo';
      rango: { fechaInicio: string; fechaFin: string };
      sugerencia: { nombre: string; fechaInicio: string; fechaFin: string };
    };

function diasSolapados(
  a: { fechaInicio: string; fechaFin: string },
  b: { fechaInicio: string; fechaFin: string },
): number {
  if (!rangosSeIntersectan(a, b)) return 0;
  const ini = a.fechaInicio > b.fechaInicio ? a.fechaInicio : b.fechaInicio;
  const fin = a.fechaFin < b.fechaFin ? a.fechaFin : b.fechaFin;
  return diferenciaDias(ini, fin) + 1;
}

function diferenciaDias(d1: string, d2: string): number {
  const [y1, m1, d1d] = d1.split('-').map(Number);
  const [y2, m2, d2d] = d2.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1d);
  const t2 = Date.UTC(y2, m2 - 1, d2d);
  return Math.round((t2 - t1) / 86_400_000);
}

/**
 * Dado el rango de una importación y los periodos ya registrados de la
 * organización, determina si la importación pertenece a un periodo existente
 * o si hay que crear uno nuevo.
 */
export function detectarPeriodo(
  rango: { fechaInicio: string; fechaFin: string },
  periodos: Periodo[],
): DeteccionPeriodo {
  const sugerencia = {
    nombre: sugerirNombrePeriodo(rango.fechaInicio, rango.fechaFin),
    fechaInicio: rango.fechaInicio,
    fechaFin: rango.fechaFin,
  };
  const coincidencias = periodos
    .filter((p) => rangosSeIntersectan(p, rango))
    .sort((a, b) => diasSolapados(b, rango) - diasSolapados(a, rango));

  if (coincidencias.length > 0) {
    return {
      tipo: 'existente',
      rango,
      coincidencias,
      principal: coincidencias[0],
      sugerencia,
    };
  }
  return { tipo: 'nuevo', rango, sugerencia };
}

/**
 * Crea un Periodo nuevo a partir de los datos de la importación.
 * `id` y timestamps se setean aquí.
 */
export function construirPeriodo(
  organizacionId: string,
  data: { nombre: string; fechaInicio: string; fechaFin: string; marcasCount: number; origen?: string },
): Periodo {
  const now = new Date().toISOString();
  return {
    id: `per-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    organizacionId,
    nombre: data.nombre,
    fechaInicio: data.fechaInicio,
    fechaFin: data.fechaFin,
    marcasCount: data.marcasCount,
    origen: data.origen,
    creadoEn: now,
    actualizadoEn: now,
  };
}
