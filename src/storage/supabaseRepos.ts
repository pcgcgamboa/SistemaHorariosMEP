import { supabase } from './supabase';
import { createSupabaseRepo, type TenantScopedRepo } from './supabaseRepo';
import {
  configuracionMapper,
  excepcionMapper,
  incidenteMapper,
  marcaMapper,
  observacionMapper,
  organizacionMapper,
  periodoMapper,
  profesorMapper,
  usuarioMapper,
} from './mappers';
import type {
  Configuracion,
  Excepcion,
  Incidente,
  Marca,
  ObservacionOverride,
  Organizacion,
  Periodo,
  Profesor,
  Usuario,
} from '../types';

// =============================================================================
// Instancias de los repos tenant-scoped.
// =============================================================================
// El tipado de cada constante asegura que el resto del código consume el
// repo con su entidad concreta (sin `unknown`).

export const profesoresRepoSb: TenantScopedRepo<Profesor> =
  createSupabaseRepo<Profesor>('profesores', profesorMapper);

const marcasBaseRepo: TenantScopedRepo<Marca> =
  createSupabaseRepo<Marca>('marcas', marcaMapper);

/**
 * Repo de marcas con operaciones bulk adicionales que el código de la app
 * necesita: borrar por rango de fechas, borrar por nombre de colaborador,
 * reasignar todas las marcas de un colaborador a otro.
 */
export const marcasRepoSb = {
  ...marcasBaseRepo,
  async removeByRange(orgId: string, fechaInicio: string, fechaFin: string): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('marcas')
      .delete()
      .eq('organizacion_id', orgId)
      .gte('fecha_hora', fechaInicio)
      .lte('fecha_hora', `${fechaFin}T23:59:59`);
    if (error) throw new Error(`[marcas] removeByRange: ${error.message}`);
  },
  async removeByNombre(orgId: string, nombre: string): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('marcas')
      .delete()
      .eq('organizacion_id', orgId)
      .eq('nombre', nombre);
    if (error) throw new Error(`[marcas] removeByNombre: ${error.message}`);
  },
  async reassignByNombre(orgId: string, origen: string, destino: string): Promise<void> {
    if (origen === destino) return;
    const client = requireClient();
    const { error } = await client
      .from('marcas')
      .update({ nombre: destino })
      .eq('organizacion_id', orgId)
      .eq('nombre', origen);
    if (error) throw new Error(`[marcas] reassignByNombre: ${error.message}`);
  },
};

export const periodosRepoSb: TenantScopedRepo<Periodo> =
  createSupabaseRepo<Periodo>('periodos', periodoMapper);

export const incidentesRepoSb: TenantScopedRepo<Incidente> =
  createSupabaseRepo<Incidente>('incidentes', incidenteMapper);

export const observacionesRepoSb: TenantScopedRepo<ObservacionOverride> =
  createSupabaseRepo<ObservacionOverride>('observaciones', observacionMapper);

export const excepcionesRepoSb: TenantScopedRepo<Excepcion> =
  createSupabaseRepo<Excepcion>('excepciones', excepcionMapper);

// =============================================================================
// Configuración — 1 fila por organización, PK = organizacion_id.
// API simplificada: no tiene `id` propio, no admite `insertMany` arbitrario.
// =============================================================================

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase no está configurado — supabase client es null.');
  }
  return supabase;
}

export const configuracionRepoSb = {
  async loadForTenant(orgId: string): Promise<Configuracion | null> {
    const client = requireClient();
    const { data, error } = await client
      .from('configuracion')
      .select('*')
      .eq('organizacion_id', orgId)
      .maybeSingle();
    if (error) throw new Error(`[configuracion] loadForTenant: ${error.message}`);
    return data ? configuracionMapper.fromDb(data) : null;
  },

  async loadAll(): Promise<Configuracion[]> {
    const client = requireClient();
    const { data, error } = await client.from('configuracion').select('*');
    if (error) throw new Error(`[configuracion] loadAll: ${error.message}`);
    return (data ?? []).map(configuracionMapper.fromDb);
  },

  async upsert(c: Configuracion): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('configuracion').upsert(configuracionMapper.toDb(c));
    if (error) throw new Error(`[configuracion] upsert: ${error.message}`);
  },

  async insertMany(items: Configuracion[]): Promise<void> {
    if (items.length === 0) return;
    const client = requireClient();
    const rows = items.map(configuracionMapper.toDb);
    const { error } = await client.from('configuracion').insert(rows);
    if (error) throw new Error(`[configuracion] insertMany: ${error.message}`);
  },
};

// =============================================================================
// Repos globales: organizaciones y usuarios.
// =============================================================================
// No usan el factory tenant-scoped porque no tienen `organizacion_id`. Tienen
// API mínima propia (todas las operaciones requieren rol adecuado vía RLS).

export const organizacionesRepoSb = {
  async loadAll(): Promise<Organizacion[]> {
    const client = requireClient();
    const { data, error } = await client.from('organizaciones').select('*');
    if (error) throw new Error(`[organizaciones] loadAll: ${error.message}`);
    return (data ?? []).map(organizacionMapper.fromDb);
  },

  async upsert(o: Organizacion): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('organizaciones').upsert(organizacionMapper.toDb(o));
    if (error) throw new Error(`[organizaciones] upsert: ${error.message}`);
  },

  async insertMany(items: Organizacion[]): Promise<void> {
    if (items.length === 0) return;
    const client = requireClient();
    const rows = items.map(organizacionMapper.toDb);
    const { error } = await client.from('organizaciones').insert(rows);
    if (error) throw new Error(`[organizaciones] insertMany: ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('organizaciones').delete().eq('id', id);
    if (error) throw new Error(`[organizaciones] remove ${id}: ${error.message}`);
  },
};

export const usuariosRepoSb = {
  async loadAll(): Promise<Usuario[]> {
    const client = requireClient();
    const { data, error } = await client.from('usuarios').select('*');
    if (error) throw new Error(`[usuarios] loadAll: ${error.message}`);
    return (data ?? []).map(usuarioMapper.fromDb);
  },

  async findById(id: string): Promise<Usuario | null> {
    const client = requireClient();
    const { data, error } = await client
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`[usuarios] findById: ${error.message}`);
    return data ? usuarioMapper.fromDb(data) : null;
  },

  async upsert(u: Usuario): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('usuarios').upsert(usuarioMapper.toDb(u));
    if (error) throw new Error(`[usuarios] upsert: ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('usuarios').delete().eq('id', id);
    if (error) throw new Error(`[usuarios] remove ${id}: ${error.message}`);
  },
};
