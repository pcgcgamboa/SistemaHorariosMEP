import profesoresIniciales from '../data/profesores.json';
import marcasIniciales from '../data/marcas.json';
import excepcionesIniciales from '../data/excepciones.json';
import observacionesIniciales from '../data/observaciones.json';
import configuracionInicial from '../data/configuracion.json';
import type {
  Configuracion,
  Excepcion,
  Incidente,
  Marca,
  ObservacionOverride,
  Periodo,
  Profesor,
} from '../types';
import { LEGACY_TENANT_ID, migrateProfesores } from '../utils/profesor';
import { createTenantRepo, STORAGE_ROOT, TENANT_PREFIX } from './tenantRepository';

// Repos por entidad (todos tenant-scoped).
const profesoresRepo = createTenantRepo<Profesor>('profesores');
const marcasRepo = createTenantRepo<Marca>('marcas');
const excepcionesRepo = createTenantRepo<Excepcion>('excepciones');
const observacionesRepo = createTenantRepo<ObservacionOverride>('observaciones');
const configuracionRepo = createTenantRepo<Configuracion>('configuracion');
const periodosRepo = createTenantRepo<Periodo>('periodos');
const incidentesRepo = createTenantRepo<Incidente>('incidentes');

export const repositories = {
  profesores: profesoresRepo,
  marcas: marcasRepo,
  excepciones: excepcionesRepo,
  observaciones: observacionesRepo,
  configuracion: configuracionRepo,
  periodos: periodosRepo,
  incidentes: incidentesRepo,
};

// ---------------------------------------------------------------------------
// Bootstrap: migración de claves planas legacy + seed inicial.
// ---------------------------------------------------------------------------

const LEGACY_FLAT_KEYS = [
  'profesores',
  'marcas',
  'excepciones',
  'observaciones',
  'configuracion',
] as const;

let bootDone = false;

/**
 * Garantiza que el almacenamiento esté:
 *  1) Migrado desde el formato plano legacy (sistemaControlReloj.<entidad>)
 *     al formato jerárquico (sistemaControlReloj.tenants.<orgId>.<entidad>).
 *  2) Sembrado con el tenant histórico `org-lsjm` si está completamente vacío.
 *
 * Idempotente: las llamadas posteriores son no-op.
 */
export function ensureBoot(): void {
  if (bootDone) return;
  migrateLegacyFlatKeys();
  seedIfEmpty();
  bootDone = true;
}

function migrateLegacyFlatKeys(): void {
  for (const name of LEGACY_FLAT_KEYS) {
    const flatKey = `${STORAGE_ROOT}.${name}`;
    const raw = localStorage.getItem(flatKey);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const arr = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [parsed as Record<string, unknown>];
      const groups = new Map<string, Array<Record<string, unknown>>>();
      for (const it of arr) {
        const orgId = (it.organizacionId as string | undefined) ?? LEGACY_TENANT_ID;
        const stamped = { ...it, organizacionId: orgId };
        const list = groups.get(orgId) ?? [];
        list.push(stamped);
        groups.set(orgId, list);
      }
      for (const [orgId, list] of groups) {
        const tenantKey = `${TENANT_PREFIX}${orgId}.${name}`;
        // Solo migrar si la clave por-tenant aún no existe (no pisar datos).
        if (!localStorage.getItem(tenantKey)) {
          localStorage.setItem(tenantKey, JSON.stringify(list));
        }
      }
      localStorage.removeItem(flatKey);
    } catch {
      // si el blob legacy está corrupto, lo dejamos para no perder datos
    }
  }
}

function seedIfEmpty(): void {
  const anyTenantData = LEGACY_FLAT_KEYS.some(
    (name) => createTenantRepo(name).listTenants().length > 0,
  );
  if (anyTenantData) return;

  const orgId = LEGACY_TENANT_ID;
  // Stamp + persist initial data del Liceo San José de la Montaña.
  const profSeed = migrateProfesores(profesoresIniciales as unknown[]).map((p) => ({
    ...p,
    organizacionId: p.organizacionId || orgId,
  }));
  const marcasSeed = (marcasIniciales as Marca[]).map((m) => ({
    ...m,
    organizacionId: m.organizacionId ?? orgId,
  }));
  const excSeed = (excepcionesIniciales as Excepcion[]).map((e) => ({
    ...e,
    organizacionId: e.organizacionId ?? orgId,
  }));
  const obsSeed = (observacionesIniciales as ObservacionOverride[]).map((o) => ({
    ...o,
    organizacionId: o.organizacionId ?? orgId,
  }));
  const configSeedRaw = configuracionInicial as Omit<Configuracion, 'organizacionId'>;
  const configSeed: Configuracion = { ...configSeedRaw, organizacionId: orgId };

  profesoresRepo.save(orgId, profSeed);
  marcasRepo.save(orgId, marcasSeed);
  excepcionesRepo.save(orgId, excSeed);
  observacionesRepo.save(orgId, obsSeed);
  configuracionRepo.save(orgId, [configSeed]);
}

// ---------------------------------------------------------------------------
// Facade load/save (mantiene la API plana para hooks/components existentes).
// ---------------------------------------------------------------------------

export function loadProfesores(): Profesor[] {
  ensureBoot();
  return migrateProfesores(profesoresRepo.loadAllTenants() as unknown[]);
}
export function saveProfesores(profesores: Profesor[]): void {
  profesoresRepo.saveAllTenants(profesores, (p) => p.organizacionId);
}

export function loadMarcas(): Marca[] {
  ensureBoot();
  return marcasRepo.loadAllTenants();
}
export function saveMarcas(marcas: Marca[]): void {
  marcasRepo.saveAllTenants(marcas, (m) => m.organizacionId);
}

export function loadExcepciones(): Excepcion[] {
  ensureBoot();
  return excepcionesRepo.loadAllTenants();
}
export function saveExcepciones(excepciones: Excepcion[]): void {
  excepcionesRepo.saveAllTenants(excepciones, (e) => e.organizacionId);
}

export function loadObservaciones(): ObservacionOverride[] {
  ensureBoot();
  return observacionesRepo.loadAllTenants();
}
export function saveObservaciones(observaciones: ObservacionOverride[]): void {
  observacionesRepo.saveAllTenants(observaciones, (o) => o.organizacionId);
}

export function loadConfiguraciones(): Configuracion[] {
  ensureBoot();
  return configuracionRepo.loadAllTenants();
}
export function saveConfiguraciones(configs: Configuracion[]): void {
  configuracionRepo.saveAllTenants(configs, (c) => c.organizacionId);
}

export function loadPeriodos(): Periodo[] {
  ensureBoot();
  return periodosRepo.loadAllTenants();
}
export function savePeriodos(periodos: Periodo[]): void {
  periodosRepo.saveAllTenants(periodos, (p) => p.organizacionId);
}

export function loadIncidentes(): Incidente[] {
  ensureBoot();
  return incidentesRepo.loadAllTenants();
}
export function saveIncidentes(incidentes: Incidente[]): void {
  incidentesRepo.saveAllTenants(incidentes, (i) => i.organizacionId);
}

/** Plantilla para crear configuración de una nueva organización. */
const CONFIG_DEFAULT_TEMPLATE: Omit<Configuracion, 'organizacionId' | 'institucion'> = {
  direccionRegional: '',
  circuito: '',
  diasLaborales: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  tolerancia: { entradaMin: 5, salidaMin: 8 },
  etiquetas: {
    entradaTardia: 'Entrada Tardía',
    omisionMarca: 'Omisión de Marca',
    salidaAnticipada: 'Salida Anticipada',
  },
};

export function nuevaConfiguracionPara(organizacionId: string, institucion: string): Configuracion {
  return { ...CONFIG_DEFAULT_TEMPLATE, organizacionId, institucion };
}

/**
 * Cascade-delete: borra todos los datos de un tenant (cuando se elimina la org).
 */
export function purgarTenant(orgId: string): void {
  profesoresRepo.delete(orgId);
  marcasRepo.delete(orgId);
  excepcionesRepo.delete(orgId);
  observacionesRepo.delete(orgId);
  configuracionRepo.delete(orgId);
  periodosRepo.delete(orgId);
  incidentesRepo.delete(orgId);
}

/**
 * Devuelve los paths lógicos (file paths relativos al folder de sync) para
 * cada dataset persistido. Útil para sincronizar con el File System Access
 * API en una estructura de carpetas anidadas.
 */
export function listarPathsTenant(orgId: string): string[] {
  return [
    profesoresRepo.pathFor(orgId),
    marcasRepo.pathFor(orgId),
    excepcionesRepo.pathFor(orgId),
    observacionesRepo.pathFor(orgId),
    configuracionRepo.pathFor(orgId),
    periodosRepo.pathFor(orgId),
    incidentesRepo.pathFor(orgId),
  ];
}

// ---------------------------------------------------------------------------
// Reset / utilidades JSON
// ---------------------------------------------------------------------------

export function resetTodo(): void {
  // Borra todas las claves bajo el namespace.
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(`${STORAGE_ROOT}.`)) toDelete.push(k);
  }
  for (const k of toDelete) localStorage.removeItem(k);
  bootDone = false;
}

export function descargarJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importarJson<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

export const exportarJson = descargarJson;
