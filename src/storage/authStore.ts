import seedUsersRaw from '../data/users.json';
import type { Session, Usuario } from '../types';
import { hashPassword } from '../auth/passwordHash';
import { globalKey, globalPath, STORAGE_ROOT } from './tenantRepository';

const KEY_USERS = globalKey('users');
const KEY_SESSION = `${STORAGE_ROOT}.session`;

/** Path lógico para el espejo en disco. */
export const USERS_PATH = globalPath('users');

/** Forma del JSON de seed: permite `_seedPassword` en texto plano sólo en seed. */
type UsuarioSeed = Omit<Usuario, 'passwordHash'> & {
  passwordHash: string;
  _seedPassword?: string;
};

/** Migra clave plana legacy → global. Idempotente. */
function migrateLegacyUsersKey(): void {
  const legacyKey = `${STORAGE_ROOT}.users`;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return;
  if (!localStorage.getItem(KEY_USERS)) {
    localStorage.setItem(KEY_USERS, raw);
  }
  localStorage.removeItem(legacyKey);
}

/**
 * Carga + bootstrap de usuarios:
 *   - Migra desde clave legacy.
 *   - Si está vacío, usa el seed de `data/users.json`.
 *   - Si algún usuario aún tiene `_seedPassword`, lo hashea y persiste limpio.
 */
export async function loadUsers(): Promise<Usuario[]> {
  migrateLegacyUsersKey();
  const raw = localStorage.getItem(KEY_USERS);
  const list: UsuarioSeed[] = raw
    ? (JSON.parse(raw) as UsuarioSeed[])
    : (seedUsersRaw as UsuarioSeed[]);

  let migrated = false;
  const out: Usuario[] = [];
  for (const u of list) {
    if (u._seedPassword) {
      const passwordHash = await hashPassword(u._seedPassword);
      const { _seedPassword: _ignored, ...rest } = u;
      void _ignored;
      out.push({ ...rest, passwordHash });
      migrated = true;
    } else {
      const { _seedPassword: _ignored, ...rest } = u;
      void _ignored;
      out.push(rest);
    }
  }
  if (migrated || !raw) {
    localStorage.setItem(KEY_USERS, JSON.stringify(out));
  }
  return out;
}

export function saveUsers(users: Usuario[]): void {
  localStorage.setItem(KEY_USERS, JSON.stringify(users));
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(KEY_SESSION);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (s.expiresAt < Date.now()) {
      localStorage.removeItem(KEY_SESSION);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  if (session === null) {
    localStorage.removeItem(KEY_SESSION);
  } else {
    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
  }
}
