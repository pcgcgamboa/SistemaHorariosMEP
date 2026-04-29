/**
 * Importa el contenido de `public/Control_Asistencia_2022_v71.xlsm` y
 * regenera los 4 JSONs de seed (`src/data/*.json`).
 *
 * Tenant fijo `org-lsjm` (Liceo San José de la Montaña), consistente con
 * el resto del seed.
 *
 * Uso:
 *   node scripts/import-v71.mjs
 */
import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ORG_ID = 'org-lsjm';

const wb = XLSX.read(readFileSync(resolve(ROOT, 'public/Control_Asistencia_2022_v71.xlsm')), {
  type: 'buffer',
});

// ============================================================================
// Helpers
// ============================================================================

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** Convierte una fracción Excel del día (0..1) a "HH:mm". */
function fracToHHmm(frac) {
  if (frac == null || frac === 'LIBRE' || typeof frac !== 'number') return null;
  const totalMin = Math.round(frac * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Excel serial → "YYYY-MM-DD" (base 1899-12-30, ignora horas). */
function serialToISODate(serial) {
  if (typeof serial !== 'number') return null;
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Parser tolerante de fechas en formato "D/M/YYYY HH:MM[:SS]". */
function parseFechaHora(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    // Excel datetime serial (días + fracción de día)
    const dayPart = Math.floor(raw);
    const timePart = raw - dayPart;
    const ms = Date.UTC(1899, 11, 30) + dayPart * 86400000 + Math.round(timePart * 86400 * 1000);
    const d = new Date(ms);
    return isoFromDate(d);
  }
  const s = String(raw).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return `${yyyy}-${pad2(+mm)}-${pad2(+dd)}T${pad2(+hh)}:${pad2(+mi)}:${pad2(+(ss || 0))}`;
}

function isoFromDate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Slugifica el nombre para construir un id estable por funcionario. */
function slugifyId(nombre) {
  return (
    'p-' +
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

function writeJson(relPath, data) {
  const full = resolve(ROOT, relPath);
  writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const size = JSON.stringify(data).length;
  console.log(`  ✓ ${relPath}  (${size.toLocaleString()} chars, ${Array.isArray(data) ? data.length : 1} item${Array.isArray(data) && data.length !== 1 ? 's' : ''})`);
}

// ============================================================================
// 1) profesores.json desde la hoja REGISTRO PERSONAL
// ============================================================================

console.log('▶ Procesando REGISTRO PERSONAL …');
const wsRP = wb.Sheets['REGISTRO PERSONAL'];
const rowsRP = XLSX.utils.sheet_to_json(wsRP, { header: 1, blankrows: false });
const profesores = [];
const idsUsados = new Set();

// Datos comienzan en la fila 3 (índice 3): row 0 título, row 1 meta, row 2 cabecera
for (let i = 3; i < rowsRP.length; i++) {
  const r = rowsRP[i] || [];
  const nombre = String(r[0] || '').trim();
  if (!nombre) continue;
  if (/\d/.test(nombre)) continue; // descarta filas basura ("93 93", "165 162A", etc.)

  const cargo = String(r[1] || '').trim().replace(/^\(|\)$/g, ''); // quita paréntesis si existen

  // Pares (entrada, salida) por día empezando en col 3
  const horarioSemanal = {};
  for (let d = 0; d < 7; d++) {
    const dia = DIAS[d];
    const entrada = fracToHHmm(r[3 + d * 2]);
    const salida = fracToHHmm(r[4 + d * 2]);
    horarioSemanal[dia] = entrada && salida ? { entrada, salida } : null;
  }

  // Id estable; resuelve colisiones añadiendo sufijo
  let id = slugifyId(nombre);
  let suffix = 2;
  while (idsUsados.has(id)) id = `${slugifyId(nombre)}-${suffix++}`;
  idsUsados.add(id);

  profesores.push({
    id,
    organizacionId: ORG_ID,
    nombre,
    cargo,
    horarios: [
      {
        id: `h-${id}-1`,
        fechaInicio: null,
        fechaFin: null,
        horario: horarioSemanal,
      },
    ],
  });
}
profesores.sort((a, b) => a.nombre.localeCompare(b.nombre));
writeJson('src/data/profesores.json', profesores);

// ============================================================================
// 2) excepciones.json
// ============================================================================

console.log('▶ Procesando EXCEPCIONES …');
const wsExc = wb.Sheets['EXCEPCIONES'];
const rowsExc = XLSX.utils.sheet_to_json(wsExc, { header: 1, blankrows: false });
const excepciones = [];
for (let i = 1; i < rowsExc.length; i++) {
  const r = rowsExc[i] || [];
  const nombreRaw = r[0] == null ? '' : String(r[0]).trim();
  const fechaInicio = serialToISODate(r[1]);
  const fechaFin = serialToISODate(r[2]);
  if (!fechaInicio || !fechaFin) continue;
  const nombre = (nombreRaw || 'EXCEPCIÓN').toUpperCase();
  excepciones.push({
    id: `e-${i}-${fechaInicio}`,
    organizacionId: ORG_ID,
    nombre,
    fechaInicio,
    fechaFin,
  });
}
excepciones.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
writeJson('src/data/excepciones.json', excepciones);

// ============================================================================
// 3) marcas.json desde la hoja MARCAS
// ============================================================================

console.log('▶ Procesando MARCAS …');
const wsM = wb.Sheets['MARCAS'];
const rowsM = XLSX.utils.sheet_to_json(wsM, { header: 1, blankrows: false });
const marcas = [];
let descartadas = 0;
const cuentaPorAnio = {};

for (let i = 1; i < rowsM.length; i++) {
  const r = rowsM[i];
  if (!r) continue;
  const nombre = String(r[0] || '').trim();
  const fechaHoraRaw = r[1];
  const tipoRaw = String(r[3] || '').trim();
  if (!nombre || !fechaHoraRaw) continue;
  const fechaHora = parseFechaHora(fechaHoraRaw);
  if (!fechaHora) {
    descartadas++;
    continue;
  }
  const tipo = tipoRaw === 'Entrada' || tipoRaw === 'Salida' ? tipoRaw : null;
  if (!tipo) {
    descartadas++;
    continue;
  }
  const anio = fechaHora.slice(0, 4);
  cuentaPorAnio[anio] = (cuentaPorAnio[anio] || 0) + 1;
  marcas.push({
    id: `m${i}`,
    organizacionId: ORG_ID,
    nombre,
    fechaHora,
    tipo,
  });
}
marcas.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
console.log(`  · marcas válidas: ${marcas.length} | descartadas: ${descartadas}`);
console.log(`  · por año:`, cuentaPorAnio);
writeJson('src/data/marcas.json', marcas);

// ============================================================================
// 4) configuracion.json — extrae desde CONFIGURACION + INFORMACIÓN
// ============================================================================

console.log('▶ Procesando CONFIGURACION …');
const wsCfg = wb.Sheets['CONFIGURACION'];
const rowsCfg = XLSX.utils.sheet_to_json(wsCfg, { header: 1, blankrows: false });

// Tolerancia: fila 7 col 4 (entrada) y col 5 (salida). Guardado como número.
const tolEntrada = Number(rowsCfg[7]?.[4]) || 5;
const tolSalida = Number(rowsCfg[7]?.[5]) || 8;

// Días laborales: la hoja CONFIGURACION del v71 enlista los 7 días por igual
// (sin distinguir laborales de no laborales). Inferimos a partir de los
// horarios de los profesores: un día es "laboral" si al menos un funcionario
// tiene horario asignado para ese día.
const diasLaborales = DIAS.filter((dia) =>
  profesores.some((p) => p.horarios[0].horario[dia] != null),
);

const configuracion = {
  organizacionId: ORG_ID,
  institucion: 'Liceo San José de la Montaña',
  direccionRegional: 'Dirección Regional de Educación de Heredia',
  circuito: 'Circuito 04',
  diasLaborales: diasLaborales.length > 0 ? diasLaborales : ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  tolerancia: { entradaMin: tolEntrada, salidaMin: tolSalida },
  etiquetas: {
    entradaTardia: 'Entrada Tardía',
    omisionMarca: 'Omisión de Marca',
    salidaAnticipada: 'Salida Anticipada',
  },
};
writeJson('src/data/configuracion.json', configuracion);

console.log('\n✔ Importación completa.');
console.log(`  Profesores: ${profesores.length}`);
console.log(`  Excepciones: ${excepciones.length}`);
console.log(`  Marcas: ${marcas.length}`);
console.log(`  Días laborales: ${configuracion.diasLaborales.join(', ')}`);
console.log(`  Tolerancia: entrada=${tolEntrada}min, salida=${tolSalida}min`);
