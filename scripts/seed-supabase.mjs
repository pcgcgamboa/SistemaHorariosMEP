#!/usr/bin/env node
// =============================================================================
// Seed inicial de Supabase desde los JSON de src/data/
// =============================================================================
// Lee organizaciones, profesores, marcas, excepciones, configuracion y los
// inserta a la DB usando la SERVICE_ROLE_KEY (bypasa RLS).
//
// Uso:
//   1) Agrega a .env.local:
//        SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (de Supabase Settings → API → service_role)
//      NO usa el prefijo VITE_ — esta key NUNCA debe ir al bundle del navegador.
//   2) pnpm seed:supabase
//
// El script es IDEMPOTENTE: usa upsert por id, así que correrlo dos veces no
// duplica. Si querés empezar desde cero, primero corre desde el SQL Editor:
//     truncate organizaciones cascade;
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Carga .env.local
loadEnv({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Falta config en .env.local:');
  console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'AUSENTE');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SERVICE_ROLE_KEY ? 'OK' : 'AUSENTE');
  console.error('\nObtén la service_role key en:');
  console.error(`   ${SUPABASE_URL || 'tu-proyecto'}/settings/api → "service_role" secret`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --------- Mappers camelCase → snake_case ---------
function mapOrganizacion(o) {
  return {
    id: o.id,
    nombre: o.nombre,
    codigo: o.codigo,
    direccion_regional: o.direccionRegional ?? '',
    circuito: o.circuito ?? '',
    activa: o.activa ?? true,
    creada_en: o.creadaEn ?? new Date().toISOString(),
    actualizada_en: o.actualizadaEn ?? new Date().toISOString(),
  };
}
function mapProfesor(p) {
  return {
    id: p.id,
    organizacion_id: p.organizacionId,
    nombre: p.nombre,
    cargo: p.cargo ?? '',
    activo: p.activo ?? true,
    horarios: p.horarios ?? [],
  };
}
function mapMarca(m) {
  return {
    id: m.id,
    organizacion_id: m.organizacionId,
    nombre: m.nombre,
    fecha_hora: m.fechaHora,
    tipo: m.tipo,
  };
}
function mapExcepcion(e) {
  return {
    id: e.id,
    organizacion_id: e.organizacionId,
    nombre: e.nombre,
    fecha_inicio: e.fechaInicio,
    fecha_fin: e.fechaFin,
  };
}
function mapConfiguracion(c) {
  return {
    organizacion_id: c.organizacionId,
    institucion: c.institucion,
    direccion_regional: c.direccionRegional ?? '',
    circuito: c.circuito ?? '',
    dias_laborales: c.diasLaborales ?? ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    tolerancia: c.tolerancia ?? { entradaMin: 5, salidaMin: 8 },
    etiquetas: c.etiquetas ?? {
      entradaTardia: 'Entrada Tardía',
      omisionMarca: 'Omisión de Marca',
      salidaAnticipada: 'Salida Anticipada',
    },
  };
}

// --------- Helpers ---------
function readJson(filename) {
  return JSON.parse(readFileSync(join(projectRoot, 'src/data', filename), 'utf8'));
}

async function upsertBatch(table, rows, batchSize = 500) {
  if (rows.length === 0) {
    console.log(`  ${table}: 0 filas, skip`);
    return;
  }
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch);
    if (error) {
      console.error(`  ❌ ${table} [${i}..${i + batch.length}]: ${error.message}`);
      throw error;
    }
    done += batch.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
}

// --------- Main ---------
async function main() {
  console.log(`🟢 Conectando a ${SUPABASE_URL}\n`);

  // 1. Organizaciones (primero — todas las demás tablas referencian aquí)
  const orgs = readJson('organizaciones.json').map(mapOrganizacion);
  console.log('1/5 Organizaciones');
  await upsertBatch('organizaciones', orgs);

  // 2. Configuración (1 por org)
  const config = mapConfiguracion(readJson('configuracion.json'));
  console.log('2/5 Configuración');
  await upsertBatch('configuracion', [config]);

  // 3. Excepciones
  const excs = readJson('excepciones.json').map(mapExcepcion);
  console.log('3/5 Excepciones');
  await upsertBatch('excepciones', excs);

  // 4. Profesores
  const profs = readJson('profesores.json').map(mapProfesor);
  console.log('4/5 Colaboradores');
  await upsertBatch('profesores', profs);

  // 5. Marcas (mucho volumen, batches de 1000)
  const marcas = readJson('marcas.json').map(mapMarca);
  console.log('5/5 Marcas');
  await upsertBatch('marcas', marcas, 1000);

  console.log('\n✅ Seed completado.');
  console.log(`   Organizaciones: ${orgs.length}`);
  console.log(`   Configuración:  1`);
  console.log(`   Excepciones:    ${excs.length}`);
  console.log(`   Colaboradores:  ${profs.length}`);
  console.log(`   Marcas:         ${marcas.length}`);
}

main().catch((err) => {
  console.error('\n❌ Seed falló:', err.message);
  process.exit(1);
});
