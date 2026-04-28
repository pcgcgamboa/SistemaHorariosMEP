import type { HorarioProfesor, HorarioSemanal, Profesor } from '../types';
import { DIAS_SEMANA } from '../types';

/**
 * Migrate a profesor from the old shape (single `horario` field) to the new
 * shape (array of `horarios` with optional date ranges).
 *
 * The old shape is also accepted by buildDetalleAsistencia indirectly since
 * the migration creates a permanent schedule with no dates.
 */
/** Tenant por defecto para datos legacy sin organizacionId. */
export const LEGACY_TENANT_ID = 'org-lsjm';

export function migrateProfesor(raw: unknown, defaultOrgId: string = LEGACY_TENANT_ID): Profesor {
  const p = raw as Record<string, unknown>;
  const organizacionId = (p.organizacionId as string | undefined) ?? defaultOrgId;
  if (Array.isArray(p.horarios)) {
    const base = raw as Profesor;
    return base.organizacionId ? base : { ...base, organizacionId };
  }
  const horarioOld = (p.horario as HorarioSemanal | undefined) ?? emptyHorario();
  return {
    id: String(p.id ?? ''),
    organizacionId,
    nombre: String(p.nombre ?? ''),
    cargo: String(p.cargo ?? ''),
    horarios: [
      {
        id: `h${p.id ?? Date.now()}-1`,
        fechaInicio: null,
        fechaFin: null,
        horario: horarioOld,
      },
    ],
  };
}

export function migrateProfesores(raw: unknown[]): Profesor[] {
  return raw.map((r) => migrateProfesor(r));
}

export function emptyHorario(): HorarioSemanal {
  const o = {} as HorarioSemanal;
  for (const d of DIAS_SEMANA) o[d] = null;
  return o;
}

/**
 * Find the schedule that applies to a given date (YYYY-MM-DD).
 *
 * Period schedules (those with both fechaInicio and fechaFin) take precedence
 * over the permanent schedule (no dates). If multiple periods overlap, the
 * one with the most recent fechaInicio wins.
 *
 * Returns null if no schedule applies (no permanent and no matching period).
 */
export function getHorarioForDate(profesor: Profesor, fecha: string): HorarioSemanal | null {
  if (!profesor.horarios || profesor.horarios.length === 0) return null;

  // Period matches, sorted by fechaInicio desc (most recent first)
  const periodMatches = profesor.horarios
    .filter((h) => h.fechaInicio && h.fechaFin && fecha >= h.fechaInicio && fecha <= h.fechaFin)
    .sort((a, b) => (b.fechaInicio ?? '').localeCompare(a.fechaInicio ?? ''));

  if (periodMatches.length > 0) {
    return periodMatches[0].horario;
  }

  // Permanent
  const permanent = profesor.horarios.find((h) => !h.fechaInicio && !h.fechaFin);
  return permanent?.horario ?? null;
}

/**
 * Returns the schedule that should be displayed in a report header for a
 * given period [desde, hasta]. Prefers a period schedule fully overlapping
 * the report range; otherwise the permanent.
 */
export function getHorarioForPeriodo(
  profesor: Profesor,
  desde: string,
  hasta: string,
): { horario: HorarioSemanal | null; descripcion: string } {
  if (!profesor.horarios || profesor.horarios.length === 0) {
    return { horario: null, descripcion: 'Sin horario' };
  }

  // Find a period schedule that overlaps with [desde, hasta]
  const periodMatch = profesor.horarios
    .filter((h) => h.fechaInicio && h.fechaFin && h.fechaFin >= desde && h.fechaInicio <= hasta)
    .sort((a, b) => (b.fechaInicio ?? '').localeCompare(a.fechaInicio ?? ''))[0];

  if (periodMatch) {
    return {
      horario: periodMatch.horario,
      descripcion: `Periodo ${periodMatch.fechaInicio} – ${periodMatch.fechaFin}`,
    };
  }

  const permanent = profesor.horarios.find((h) => !h.fechaInicio && !h.fechaFin);
  if (permanent) return { horario: permanent.horario, descripcion: 'Permanente' };

  return { horario: null, descripcion: 'Sin horario' };
}

export function nuevoHorario(): HorarioProfesor {
  return {
    id: `h${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fechaInicio: null,
    fechaFin: null,
    horario: emptyHorario(),
  };
}
