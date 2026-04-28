import * as XLSX from 'xlsx';
import type { Creatable, Marca } from '../types';

/**
 * Parse an Excel file exported from the attendance clock system.
 *
 * Expected format (like JUNIO 2025.xls):
 *   Col 0: Número (employee id — ignored)
 *   Col 1: Nombre (full name, may be in "NOMBRE APELLIDO" order)
 *   Col 2: Tiempo ("D/M/YYYY HH:MM:SS" or Excel date serial)
 *   Col 3: Estado (ignored)
 *   Col 4: Dispositivos (ignored)
 *   Col 5: Tipo de Registro (ignored)
 *
 * Marks are classified as Entrada/Salida by pairing them per person+day:
 * first mark of the day = Entrada, last mark = Salida, intermediate are ignored.
 */
export async function parseMarcasExcel(file: File): Promise<{
  marcas: Creatable<Marca>[];
  nombres: string[];
  errors: string[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no contiene hojas');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown as unknown[][];
  const errors: string[] = [];
  const nombresSet = new Set<string>();

  // Collect raw rows (skip header)
  interface RawMarca {
    nombre: string;
    fecha: string; // YYYY-MM-DD
    hora: string;  // HH:mm
    iso: string;   // YYYY-MM-DDTHH:mm:00
  }

  const rawMarks: RawMarca[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const nombreRaw = String(row[1] ?? '').trim().toUpperCase();
    if (!nombreRaw) continue;

    const tiempoRaw = row[2];
    const parsed = parseDateTime(tiempoRaw);
    if (!parsed) {
      errors.push(`Fila ${i + 1}: no se pudo parsear fecha/hora "${tiempoRaw}"`);
      continue;
    }

    nombresSet.add(nombreRaw);
    rawMarks.push({
      nombre: nombreRaw,
      fecha: parsed.fecha,
      hora: parsed.hora,
      iso: parsed.iso,
    });
  }

  // Group by nombre + fecha to assign Entrada/Salida
  const grouped = new Map<string, RawMarca[]>();
  for (const rm of rawMarks) {
    const key = `${rm.nombre}|${rm.fecha}`;
    const arr = grouped.get(key) ?? [];
    arr.push(rm);
    grouped.set(key, arr);
  }

  const marcas: Creatable<Marca>[] = [];
  let idCounter = Date.now();

  for (const [, group] of grouped) {
    group.sort((a, b) => a.iso.localeCompare(b.iso));

    if (group.length === 1) {
      // Single mark → Entrada
      marcas.push({
        id: `mi${idCounter++}`,
        nombre: group[0].nombre,
        fechaHora: group[0].iso,
        tipo: 'Entrada',
      });
    } else {
      // First = Entrada, Last = Salida
      marcas.push({
        id: `mi${idCounter++}`,
        nombre: group[0].nombre,
        fechaHora: group[0].iso,
        tipo: 'Entrada',
      });
      marcas.push({
        id: `mi${idCounter++}`,
        nombre: group[group.length - 1].nombre,
        fechaHora: group[group.length - 1].iso,
        tipo: 'Salida',
      });
    }
  }

  marcas.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));

  return {
    marcas,
    nombres: [...nombresSet].sort(),
    errors,
  };
}

function parseDateTime(raw: unknown): { fecha: string; hora: string; iso: string } | null {
  if (raw == null) return null;

  // Case 1: Excel date serial number
  if (typeof raw === 'number') {
    const d = excelSerialToDate(raw);
    if (!d) return null;
    return dateToResult(d);
  }

  // Case 2: String "D/M/YYYY HH:MM:SS" or "DD/MM/YYYY HH:MM:SS"
  const s = String(raw).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const hour = parseInt(m[4], 10);
    const min = parseInt(m[5], 10);
    const d = new Date(year, month - 1, day, hour, min);
    if (!isNaN(d.getTime())) return dateToResult(d);
  }

  return null;
}

function excelSerialToDate(serial: number): Date | null {
  // Excel serial: days since 1899-12-30
  const base = new Date(1899, 11, 30);
  const ms = base.getTime() + serial * 86400000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function dateToResult(d: Date): { fecha: string; hora: string; iso: string } {
  const fecha = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return { fecha, hora, iso: `${fecha}T${hora}:00` };
}

function p2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Names from the clock often come as "NOMBRE NOMBRE APELLIDO APELLIDO"
 * while REGISTRO PERSONAL uses "APELLIDO APELLIDO NOMBRE NOMBRE".
 * This returns a lookup map: clockName → registeredName.
 */
export function buildNameMapping(
  clockNames: string[],
  registeredNames: string[],
): Map<string, string> {
  const map = new Map<string, string>();

  // First pass: exact match
  const regSet = new Set(registeredNames);
  for (const cn of clockNames) {
    if (regSet.has(cn)) {
      map.set(cn, cn);
    }
  }

  // Second pass: try reversing word order for unmatched names
  const unmapped = clockNames.filter((cn) => !map.has(cn));
  if (unmapped.length === 0) return map;

  // Build a lookup from all permutations of registered names
  const regWords = new Map<string, string>(); // sorted-words → original
  for (const rn of registeredNames) {
    const key = rn.split(/\s+/).sort().join(' ');
    regWords.set(key, rn);
  }

  for (const cn of unmapped) {
    const key = cn.split(/\s+/).sort().join(' ');
    const match = regWords.get(key);
    if (match) {
      map.set(cn, match);
    }
  }

  return map;
}
