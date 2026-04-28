import type { DiaSemana } from '../types';

const JS_DAY_TO_DIA: DiaSemana[] = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
];

export function diaSemanaFromDate(date: Date): DiaSemana {
  return JS_DAY_TO_DIA[date.getDay()];
}

/** "HH:mm" -> minutes since midnight */
export function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h * 60 + mm;
}

export function minutesToHHmm(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return '';
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format a Date or ISO string as HH:mm in local time. */
export function formatHHmm(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** YYYY-MM-DD for a Date in local time. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Inclusive range of dates between two YYYY-MM-DD strings. */
export function rangoFechas(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const start = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function isoDatePart(iso: string): string {
  return iso.slice(0, 10);
}
