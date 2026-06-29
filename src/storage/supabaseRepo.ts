import { supabase } from './supabase';

/**
 * Repositorio async sobre una tabla tenant-scoped en Supabase.
 *
 * Reemplaza el `tenantRepository.ts` localStorage-sync. Las firmas son
 * granulares (upsert/remove individual) en lugar de "guardar el array
 * completo" para no malgastar ancho de banda ni provocar races con realtime.
 *
 * Conversión camelCase ↔ snake_case via mapper inyectado por entidad.
 */
export interface TenantScopedRepo<T extends { id: string; organizacionId: string }> {
  /** Lee TODOS los registros del tenant. */
  loadForTenant(orgId: string): Promise<T[]>;
  /** Lee TODOS los registros sin filtrar por tenant (SUPER_ADMIN consolidado). */
  loadAll(): Promise<T[]>;
  /** Upsert por id. */
  upsert(item: T): Promise<void>;
  /** Insert masivo (sin upsert). Usado por el script de migración. */
  insertMany(items: T[]): Promise<void>;
  /** Elimina por id. */
  remove(id: string): Promise<void>;
  /** Elimina todos los del tenant (cascade al borrar la org se encarga sola en DB). */
  removeAllForTenant(orgId: string): Promise<void>;
  /**
   * Suscripción realtime: re-fetcha y notifica al callback cuando hay
   * cualquier cambio en la tabla filtrado por tenant (o sin filtro si
   * orgId es null). Devuelve una función para cancelar.
   */
  subscribe(orgId: string | null, onChange: (items: T[]) => void): () => void;
}

export interface Mapper<T, Row> {
  toDb: (item: T) => Row;
  fromDb: (row: Row) => T;
}

export function createSupabaseRepo<
  T extends { id: string; organizacionId: string },
  Row extends Record<string, unknown> = Record<string, unknown>,
>(table: string, mapper: Mapper<T, Row>): TenantScopedRepo<T> {
  if (!supabase) {
    throw new Error(
      `Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ` +
        `No se puede crear el repo "${table}".`,
    );
  }
  const client = supabase;

  /**
   * PostgREST limita cada respuesta a `db-max-rows` filas (1000 por defecto
   * en Supabase) y trunca en silencio sin marcar error (HTTP 200 con menos
   * filas de las que existen). Tablas como `marcas` superan eso por tenant,
   * así que hay que paginar con `.range()` hasta agotar los resultados.
   */
  const PAGE_SIZE = 1000;

  async function fetchAllPages(
    build: () => ReturnType<ReturnType<typeof client.from>['select']>,
  ): Promise<Row[]> {
    const out: Row[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`[${table}] fetch: ${error.message}`);
      const page = (data ?? []) as Row[];
      out.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return out;
  }

  async function loadForTenant(orgId: string): Promise<T[]> {
    const rows = await fetchAllPages(() => client.from(table).select('*').eq('organizacion_id', orgId));
    return rows.map((r) => mapper.fromDb(r));
  }

  async function loadAll(): Promise<T[]> {
    const rows = await fetchAllPages(() => client.from(table).select('*'));
    return rows.map((r) => mapper.fromDb(r));
  }

  async function upsert(item: T): Promise<void> {
    const { error } = await client.from(table).upsert(mapper.toDb(item) as never);
    if (error) throw new Error(`[${table}] upsert: ${error.message}`);
  }

  async function insertMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const rows = items.map((i) => mapper.toDb(i));
    const { error } = await client.from(table).insert(rows as never);
    if (error) throw new Error(`[${table}] insertMany (${items.length}): ${error.message}`);
  }

  async function remove(id: string): Promise<void> {
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) throw new Error(`[${table}] remove ${id}: ${error.message}`);
  }

  async function removeAllForTenant(orgId: string): Promise<void> {
    const { error } = await client.from(table).delete().eq('organizacion_id', orgId);
    if (error) throw new Error(`[${table}] removeAllForTenant ${orgId}: ${error.message}`);
  }

  function subscribe(orgId: string | null, onChange: (items: T[]) => void): () => void {
    const channelName = `${table}-${orgId ?? 'all'}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = client.channel(channelName);

    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'postgres_changes' as any,
      {
        event: '*',
        schema: 'public',
        table,
        ...(orgId ? { filter: `organizacion_id=eq.${orgId}` } : {}),
      },
      async () => {
        try {
          const items = orgId ? await loadForTenant(orgId) : await loadAll();
          onChange(items);
        } catch (err) {

          console.error(`[${table}] subscribe refetch failed:`, err);
        }
      },
    );

    channel.subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }

  return {
    loadForTenant,
    loadAll,
    upsert,
    insertMany,
    remove,
    removeAllForTenant,
    subscribe,
  };
}
