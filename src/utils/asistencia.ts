import type {
  Configuracion,
  ConfiguracionTolerancia,
  DetalleDiaAsistencia,
  EstadoIncidencia,
  Excepcion,
  Incidente,
  Marca,
  ObservacionOverride,
  Profesor,
} from '../types';
import { INCIDENTE_BY_TIPO } from '../types';
import {
  diaSemanaFromDate,
  formatHHmm,
  hhmmToMinutes,
  isoDatePart,
  rangoFechas,
} from './time';
import { getHorarioForDate } from './profesor';

export const TOLERANCIA_DEFAULT: ConfiguracionTolerancia = {
  entradaMin: 5,
  salidaMin: 8,
};

/** Build a Set of YYYY-MM-DD strings covered by the exception ranges. */
function buildExcepcionSet(excepciones: Excepcion[], desde: string, hasta: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const ex of excepciones) {
    // Only process if the exception range overlaps with the query range
    if (ex.fechaFin < desde || ex.fechaInicio > hasta) continue;
    const start = ex.fechaInicio < desde ? desde : ex.fechaInicio;
    const end = ex.fechaFin > hasta ? hasta : ex.fechaFin;
    const fechas = rangoFechas(start, end);
    for (const f of fechas) {
      map.set(f, ex.nombre);
    }
  }
  return map;
}

interface BuildArgs {
  profesor: Profesor;
  marcas: Marca[];
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  tolerancia?: ConfiguracionTolerancia;
  excepciones?: Excepcion[];
  config?: Configuracion;
}

/**
 * Build the per-day attendance detail for a profesor between two dates.
 * Mirrors the logic in the original "DetalleAsistencia" sheet.
 *
 * Exceptions (feriados, vacaciones, etc.) are treated similarly to "Día Libre":
 * the day is excluded from the attendance analysis and shows an informational row
 * with the exception name.
 */
export function buildDetalleAsistencia({
  profesor,
  marcas,
  desde,
  hasta,
  tolerancia = TOLERANCIA_DEFAULT,
  excepciones = [],
  config,
}: BuildArgs): DetalleDiaAsistencia[] {
  // Use config etiquetas if available, otherwise default
  const lbl = config?.etiquetas ?? {
    entradaTardia: 'Entrada Tardía',
    omisionMarca: 'Omisión de Marca',
    salidaAnticipada: 'Salida Anticipada',
  };

  const excepcionMap = buildExcepcionSet(excepciones, desde, hasta);

  const marcasPorFecha = new Map<string, Marca[]>();
  for (const m of marcas) {
    if (m.nombre !== profesor.nombre) continue;
    const fecha = isoDatePart(m.fechaHora);
    if (fecha < desde || fecha > hasta) continue;
    const arr = marcasPorFecha.get(fecha) ?? [];
    arr.push(m);
    marcasPorFecha.set(fecha, arr);
  }

  const fechas = rangoFechas(desde, hasta);
  const detalle: DetalleDiaAsistencia[] = [];

  for (const fecha of fechas) {
    const dia = diaSemanaFromDate(new Date(`${fecha}T00:00:00`));
    const horarioSemanal = getHorarioForDate(profesor, fecha);
    const horario = horarioSemanal?.[dia] ?? null;
    const marcasDia = (marcasPorFecha.get(fecha) ?? []).slice().sort((a, b) =>
      a.fechaHora.localeCompare(b.fechaHora),
    );

    // ---- Check if this date is an exception ----
    const excepcionNombre = excepcionMap.get(fecha);
    if (excepcionNombre) {
      detalle.push({
        fecha,
        dia,
        horarioEntrada: horario?.entrada ?? null,
        horarioSalida: horario?.salida ?? null,
        marcaEntrada: marcasDia.length > 0 ? formatHHmm(marcasDia[0].fechaHora) : null,
        marcaSalida:
          marcasDia.length > 1
            ? formatHHmm(marcasDia[marcasDia.length - 1].fechaHora)
            : null,
        diferenciaEntrada: 0,
        diferenciaSalida: 0,
        estado: 'Día Libre',
        observacion: excepcionNombre,
      });
      continue;
    }

    // ---- Día libre (no horario) ----
    if (!horario) {
      if (marcasDia.length === 0) continue;
      detalle.push({
        fecha,
        dia,
        horarioEntrada: null,
        horarioSalida: null,
        marcaEntrada: formatHHmm(marcasDia[0].fechaHora),
        marcaSalida:
          marcasDia.length > 1
            ? formatHHmm(marcasDia[marcasDia.length - 1].fechaHora)
            : null,
        diferenciaEntrada: 0,
        diferenciaSalida: 0,
        estado: 'Día Libre',
        observacion: 'Marca en día libre',
      });
      continue;
    }

    // ---- Normal working day ----
    const entradaProgramada = hhmmToMinutes(horario.entrada);
    const salidaProgramada = hhmmToMinutes(horario.salida);

    const primeraEntrada = marcasDia.find((m) => m.tipo === 'Entrada');
    const ultimaSalida = [...marcasDia].reverse().find((m) => m.tipo === 'Salida');

    const entradaMarca = primeraEntrada ?? marcasDia[0];
    const salidaMarca =
      ultimaSalida ??
      (marcasDia.length > 1 ? marcasDia[marcasDia.length - 1] : null);

    const entradaHHmm = entradaMarca ? formatHHmm(entradaMarca.fechaHora) : null;
    const salidaHHmm = salidaMarca && salidaMarca !== entradaMarca
      ? formatHHmm(salidaMarca.fechaHora)
      : null;

    const entradaMin = hhmmToMinutes(entradaHHmm);
    const salidaMin = hhmmToMinutes(salidaHHmm);

    let diffEntrada = 0;
    if (entradaMin != null && entradaProgramada != null) {
      const d = entradaMin - entradaProgramada;
      diffEntrada = d > tolerancia.entradaMin ? d : 0;
    }

    let diffSalida = 0;
    if (salidaMin != null && salidaProgramada != null) {
      const d = salidaProgramada - salidaMin;
      diffSalida = d > tolerancia.salidaMin ? d : 0;
    }

    let estado: EstadoIncidencia = 'Normal';
    const partes: string[] = [];

    if (marcasDia.length === 0) {
      estado = 'Sin Marcas';
    } else if (!salidaHHmm) {
      if (diffEntrada > 0) {
        estado = 'Entrada Tardía y Omisión de Marca';
        partes.push(lbl.entradaTardia, lbl.omisionMarca);
      } else {
        estado = 'Omisión de Marca';
        partes.push(lbl.omisionMarca);
      }
    } else {
      if (diffEntrada > 0) partes.push(lbl.entradaTardia);
      if (diffSalida > 0) partes.push(lbl.salidaAnticipada);
      if (partes.length === 2) estado = 'Entrada Tardía y Salida Anticipada';
      else if (partes.length === 1)
        estado = diffEntrada > 0 ? 'Entrada Tardía' : 'Salida Anticipada';
      else estado = 'Normal';
    }

    detalle.push({
      fecha,
      dia,
      horarioEntrada: horario.entrada,
      horarioSalida: horario.salida,
      marcaEntrada: entradaHHmm,
      marcaSalida: salidaHHmm,
      diferenciaEntrada: diffEntrada,
      diferenciaSalida: diffSalida,
      estado,
      observacion: estado === 'Normal' ? '' : partes.join(' y ') || estado,
    });
  }

  return detalle;
}

/**
 * Returns the observation that should be displayed for a day, honoring the
 * per-day override (limpiar → blank, cambiar → custom text). If no override
 * exists, returns the computed observation unchanged.
 */
export function applyObservacionOverride(
  detalle: DetalleDiaAsistencia,
  override: ObservacionOverride | undefined,
): string {
  if (!override) return detalle.observacion;
  if (override.accion === 'limpiar') return '';
  if (override.accion === 'cambiar') return override.texto ?? '';
  return detalle.observacion;
}

/** Index overrides by `${profesorId}|${fecha}` for O(1) lookup. */
export function indexOverrides(
  overrides: ObservacionOverride[],
  profesorId: string,
): Map<string, ObservacionOverride> {
  const map = new Map<string, ObservacionOverride>();
  for (const o of overrides) {
    if (o.profesorId !== profesorId) continue;
    map.set(o.fecha, o);
  }
  return map;
}

/** Index incidentes por fecha para un profesor específico. */
export function indexIncidentes(
  incidentes: Incidente[],
  profesorId: string,
): Map<string, Incidente> {
  const map = new Map<string, Incidente>();
  for (const i of incidentes) {
    if (i.profesorId !== profesorId) continue;
    map.set(i.fecha, i);
  }
  return map;
}

/**
 * Compone la observación final del día combinando:
 *  - El incidente registrado (si existe).
 *  - La observación auto-calculada por buildDetalleAsistencia.
 *  - El override manual del usuario, que tiene prioridad absoluta:
 *      * `cambiar` reemplaza todo con un texto explícito.
 *      * `limpiar` deja la observación vacía.
 */
export function composeObservacion(
  detalle: DetalleDiaAsistencia,
  override: ObservacionOverride | undefined,
  incidente: Incidente | undefined,
): string {
  if (override?.accion === 'cambiar') return override.texto ?? '';
  if (override?.accion === 'limpiar') return '';

  const partes: string[] = [];
  if (incidente) {
    const label = INCIDENTE_BY_TIPO[incidente.tipo].label.toUpperCase();
    partes.push(
      incidente.descripcion ? `${label} (${incidente.descripcion})` : label,
    );
  }
  if (detalle.observacion) partes.push(detalle.observacion);
  return partes.join(' · ');
}

export interface ResumenAsistencia {
  diasLaborales: number;
  diasNormales: number;
  entradasTardias: number;
  salidasAnticipadas: number;
  omisiones: number;
  sinMarcas: number;
  minutosTardios: number;
  minutosAnticipados: number;
  excepciones: number;
}

export function calcularResumen(detalle: DetalleDiaAsistencia[]): ResumenAsistencia {
  const r: ResumenAsistencia = {
    diasLaborales: 0,
    diasNormales: 0,
    entradasTardias: 0,
    salidasAnticipadas: 0,
    omisiones: 0,
    sinMarcas: 0,
    minutosTardios: 0,
    minutosAnticipados: 0,
    excepciones: 0,
  };
  for (const d of detalle) {
    if (d.estado === 'Día Libre') {
      r.excepciones += 1;
      continue;
    }
    r.diasLaborales += 1;
    if (d.estado === 'Normal') r.diasNormales += 1;
    if (d.diferenciaEntrada > 0) {
      r.entradasTardias += 1;
      r.minutosTardios += d.diferenciaEntrada;
    }
    if (d.diferenciaSalida > 0) {
      r.salidasAnticipadas += 1;
      r.minutosAnticipados += d.diferenciaSalida;
    }
    if (d.estado.includes('Omisión')) r.omisiones += 1;
    if (d.estado === 'Sin Marcas') r.sinMarcas += 1;
  }
  return r;
}
