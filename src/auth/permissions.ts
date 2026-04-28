import type { Rol, Session, Usuario } from '../types';

/**
 * Capability-based RBAC.
 *
 * Cada vista / acción consulta `can(session, capability, resource?)`. Centraliza
 * las reglas para que la UI y los stores compartan una sola fuente de verdad.
 */
export type Capability =
  // Organizaciones
  | 'org.view-all'
  | 'org.create'
  | 'org.edit'
  | 'org.delete'
  | 'org.switch-tenant'
  // Datos del tenant
  | 'tenant.read'
  | 'tenant.write'
  | 'tenant.configure';

interface ResourceContext {
  /** Tenant al que pertenece el recurso (si aplica). */
  organizacionId?: string | null;
}

const RULES: Record<Capability, (rol: Rol) => boolean> = {
  'org.view-all': (r) => r === 'SUPER_ADMIN',
  'org.create': (r) => r === 'SUPER_ADMIN',
  'org.edit': (r) => r === 'SUPER_ADMIN',
  'org.delete': (r) => r === 'SUPER_ADMIN',
  'org.switch-tenant': (r) => r === 'SUPER_ADMIN',
  'tenant.read': () => true,
  'tenant.write': (r) => r === 'ORG_ADMIN' || r === 'SUPER_ADMIN',
  'tenant.configure': (r) => r === 'ORG_ADMIN' || r === 'SUPER_ADMIN',
};

export function can(
  session: Session | null,
  capability: Capability,
  resource: ResourceContext = {},
): boolean {
  if (!session) return false;
  const { user } = session;
  if (!RULES[capability](user.rol)) return false;

  // Tenant scoping: si el recurso pertenece a una org, el usuario debe poder verla.
  if (resource.organizacionId !== undefined && resource.organizacionId !== null) {
    if (user.rol === 'SUPER_ADMIN') return true;
    return user.organizacionId === resource.organizacionId;
  }
  return true;
}

/**
 * Devuelve la organización efectiva que el usuario está visualizando.
 * - SUPER_ADMIN: la que tenga seleccionada (puede ser null = ver todas).
 * - Otros roles: siempre su organizacionId, sin importar la sesión.
 */
export function tenantActivo(session: Session | null): string | null {
  if (!session) return null;
  const { user, organizacionActivaId } = session;
  if (user.rol === 'SUPER_ADMIN') return organizacionActivaId;
  return user.organizacionId;
}

/**
 * Filtro genérico para colecciones tenant-scoped.
 * Si el tenant activo es null y el rol es SUPER_ADMIN devuelve todo;
 * en cualquier otro caso filtra por organizacionId.
 */
export function scopeByTenant<T extends { organizacionId: string }>(
  items: T[],
  session: Session | null,
): T[] {
  const tid = tenantActivo(session);
  if (tid === null) {
    // Solo SUPER_ADMIN puede llegar aquí con null → vista consolidada
    if (session?.user.rol === 'SUPER_ADMIN') return items;
    return [];
  }
  return items.filter((x) => x.organizacionId === tid);
}

/** True si el usuario puede acceder al tenant indicado. */
export function puedeAccederOrg(user: Usuario | null, organizacionId: string): boolean {
  if (!user) return false;
  if (user.rol === 'SUPER_ADMIN') return true;
  return user.organizacionId === organizacionId;
}
