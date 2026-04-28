/**
 * Repositorio tenant-scoped genérico.
 *
 * Cada entidad multi-tenant (Profesor, Marca, Excepción, Observación,
 * Configuración) usa una instancia de este repo. La clave de localStorage
 * es jerárquica: `sistemaControlReloj.tenants.<orgId>.<entidad>`.
 *
 * Beneficios:
 *   - Escala con la cantidad de organizaciones (cada tenant es independiente).
 *   - El espejo en disco (vía File System Access API) produce carpetas reales.
 *   - Eliminar una organización = `delete()` cascada por entidad, sin tocar al
 *     resto de tenants.
 *   - Es swap-in: para migrar a un backend, solo se reemplaza esta clase.
 */

export const STORAGE_ROOT = 'sistemaControlReloj';
export const TENANT_PREFIX = `${STORAGE_ROOT}.tenants.`;

export interface TenantRepo<T> {
  /** Carga los items de un tenant. Devuelve [] si no existe. */
  load(orgId: string): T[];
  /** Reemplaza los items de un tenant. */
  save(orgId: string, items: T[]): void;
  /** Borra todo el dataset de un tenant. */
  delete(orgId: string): void;
  /** Devuelve los IDs de tenants que tienen datos persistidos para esta entidad. */
  listTenants(): string[];
  /** Carga todos los items de todos los tenants en un único array (lectura global). */
  loadAllTenants(): T[];
  /**
   * Persiste un array global, particionándolo por `byOrgFn`. Borra tenants
   * que ya no tengan items.
   */
  saveAllTenants(items: T[], byOrgFn: (item: T) => string): void;
  /** Path lógico (filename + folder) que se exporta a la carpeta sincronizada. */
  pathFor(orgId: string): string;
}

export function createTenantRepo<T>(entityName: string): TenantRepo<T> {
  const suffix = `.${entityName}`;
  const keyFor = (orgId: string): string => `${TENANT_PREFIX}${orgId}${suffix}`;
  const pathFor = (orgId: string): string => `tenants/${orgId}/${entityName}.json`;

  function listTenants(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(TENANT_PREFIX) && k.endsWith(suffix)) {
        const orgId = k.slice(TENANT_PREFIX.length, k.length - suffix.length);
        // Validar que no haya puntos extra (evita colisión con otra entidad).
        if (!orgId.includes('.')) out.push(orgId);
      }
    }
    return out;
  }

  return {
    load(orgId) {
      const raw = localStorage.getItem(keyFor(orgId));
      if (!raw) return [];
      try {
        return JSON.parse(raw) as T[];
      } catch {
        return [];
      }
    },

    save(orgId, items) {
      localStorage.setItem(keyFor(orgId), JSON.stringify(items));
    },

    delete(orgId) {
      localStorage.removeItem(keyFor(orgId));
    },

    listTenants,

    loadAllTenants() {
      const out: T[] = [];
      for (const orgId of listTenants()) {
        const raw = localStorage.getItem(keyFor(orgId));
        if (!raw) continue;
        try {
          const arr = JSON.parse(raw) as T[];
          out.push(...arr);
        } catch {
          /* skip malformed tenant blob */
        }
      }
      return out;
    },

    saveAllTenants(items, byOrgFn) {
      const groups = new Map<string, T[]>();
      for (const it of items) {
        const orgId = byOrgFn(it);
        const arr = groups.get(orgId) ?? [];
        arr.push(it);
        groups.set(orgId, arr);
      }
      // Borrar tenants que ya no tienen items (cascade).
      for (const orgId of listTenants()) {
        if (!groups.has(orgId)) {
          localStorage.removeItem(keyFor(orgId));
        }
      }
      // Escritura diff-aware: omite tenants cuya serialización no cambió. Esto
      // mantiene O(tenants_modificados) en lugar de O(N_tenants) cuando una
      // mutación toca un solo tenant — clave para escalar a muchos tenants.
      for (const [orgId, arr] of groups) {
        const json = JSON.stringify(arr);
        const k = keyFor(orgId);
        if (localStorage.getItem(k) !== json) {
          localStorage.setItem(k, json);
        }
      }
    },

    pathFor,
  };
}

/** Path global (no tenant-scoped) — users, organizaciones. */
export function globalKey(name: string): string {
  return `${STORAGE_ROOT}.global.${name}`;
}
export function globalPath(name: string): string {
  return `global/${name}.json`;
}
