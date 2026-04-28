import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Rol, Session, Usuario, UsuarioPublico } from '../types';
import { loadSession, loadUsers, saveSession, saveUsers } from '../storage/authStore';
import { hashPassword, verifyPassword } from './passwordHash';

/** Duración de sesión: 8 horas. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  users: Usuario[];
  /** Token incremental que cambia con cada mutación de usuarios — útil para folder sync. */
  usersVersion: number;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
  cambiarOrganizacionActiva: (organizacionId: string | null) => void;
  /** SUPER_ADMIN únicamente. */
  crearUsuario: (data: NuevoUsuarioInput) => Promise<Usuario>;
  /** SUPER_ADMIN únicamente. Patch incluye opcionalmente `password` para cambio de clave. */
  actualizarUsuario: (
    id: string,
    patch: Partial<Omit<Usuario, 'id' | 'passwordHash'>> & { password?: string },
  ) => Promise<void>;
  /** SUPER_ADMIN únicamente. */
  eliminarUsuario: (id: string) => void;
}

export interface NuevoUsuarioInput {
  username: string;
  password: string;
  nombreCompleto: string;
  email?: string;
  rol: Rol;
  organizacionId: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toPublico(u: Usuario): UsuarioPublico {
  const { passwordHash: _h, ...rest } = u;
  void _h;
  return rest;
}

/** Reglas de invariantes que protegen la integridad de cuentas. */
function assertSafeMutation(
  current: Usuario,
  next: Partial<Usuario>,
  all: Usuario[],
  acting: Usuario | null,
): void {
  // No degradar / desactivar al último SUPER_ADMIN.
  if (current.rol === 'SUPER_ADMIN') {
    const stillSuper = all.filter(
      (u) => u.rol === 'SUPER_ADMIN' && u.activo && u.id !== current.id,
    ).length;
    const willStaySuper = (next.rol ?? current.rol) === 'SUPER_ADMIN';
    const willStayActive = next.activo ?? current.activo;
    if ((!willStaySuper || !willStayActive) && stillSuper === 0) {
      throw new Error(
        'No se puede dejar el sistema sin un Administrador General activo.',
      );
    }
  }
  // El usuario actual no puede degradarse a sí mismo ni desactivarse.
  if (acting && acting.id === current.id) {
    if (next.rol && next.rol !== current.rol) {
      throw new Error('No puedes cambiar tu propio rol.');
    }
    if (next.activo === false) {
      throw new Error('No puedes desactivar tu propio usuario.');
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [usersVersion, setUsersVersion] = useState(0);

  // Bootstrap: hashea seed y restaura sesión vigente.
  useEffect(() => {
    (async () => {
      const loaded = await loadUsers();
      setUsers(loaded);
      const restored = loadSession();
      if (restored) {
        const stillValid = loaded.find((u) => u.id === restored.user.id && u.activo);
        setSession(stillValid ? restored : null);
        if (!stillValid) saveSession(null);
      }
      setReady(true);
    })();
  }, []);

  const persistUsers = useCallback((next: Usuario[]) => {
    setUsers(next);
    setUsersVersion((v) => v + 1);
    saveUsers(next);
  }, []);

  const login = useCallback<AuthContextValue['login']>(
    async (username, password) => {
      const u = users.find((x) => x.username === username);
      if (!u || !u.activo) return { ok: false, error: 'Usuario o clave inválidos' };
      const ok = await verifyPassword(password, u.passwordHash);
      if (!ok) return { ok: false, error: 'Usuario o clave inválidos' };

      const newSession: Session = {
        user: toPublico(u),
        organizacionActivaId: u.rol === 'SUPER_ADMIN' ? null : u.organizacionId,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      setSession(newSession);
      saveSession(newSession);
      return { ok: true };
    },
    [users],
  );

  const logout = useCallback(() => {
    setSession(null);
    saveSession(null);
  }, []);

  const cambiarOrganizacionActiva = useCallback(
    (organizacionActivaId: string | null) => {
      setSession((prev) => {
        if (!prev) return prev;
        if (prev.user.rol !== 'SUPER_ADMIN') return prev;
        const next: Session = { ...prev, organizacionActivaId };
        saveSession(next);
        return next;
      });
    },
    [],
  );

  const crearUsuario = useCallback<AuthContextValue['crearUsuario']>(
    async (data) => {
      const username = data.username.trim().toLowerCase();
      if (!username) throw new Error('La cuenta es obligatoria');
      if (!/^[a-z0-9._-]{3,32}$/.test(username))
        throw new Error('Cuenta inválida (3-32 caracteres: a-z, 0-9, . _ -)');
      if (!data.nombreCompleto.trim()) throw new Error('El nombre completo es obligatorio');
      if (data.password.length < 6) throw new Error('La clave debe tener al menos 6 caracteres');
      if (users.some((u) => u.username === username)) {
        throw new Error('El nombre de usuario ya existe');
      }
      if (data.rol !== 'SUPER_ADMIN' && !data.organizacionId) {
        throw new Error('Los roles distintos a Administrador General requieren una organización');
      }
      const passwordHash = await hashPassword(data.password);
      const nuevo: Usuario = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        username,
        passwordHash,
        nombreCompleto: data.nombreCompleto.trim(),
        email: data.email?.trim() || undefined,
        rol: data.rol,
        organizacionId: data.rol === 'SUPER_ADMIN' ? null : data.organizacionId,
        activo: true,
        creadoEn: new Date().toISOString(),
      };
      persistUsers([...users, nuevo]);
      return nuevo;
    },
    [users, persistUsers],
  );

  const actualizarUsuario = useCallback<AuthContextValue['actualizarUsuario']>(
    async (id, patch) => {
      const idx = users.findIndex((u) => u.id === id);
      if (idx === -1) throw new Error('Usuario no encontrado');
      const current = users[idx];
      const acting = session ? users.find((u) => u.id === session.user.id) ?? null : null;

      // Sanitización de patch.
      const cleaned: Partial<Usuario> = { ...patch };
      delete (cleaned as Partial<Usuario> & { password?: string }).password;
      if (cleaned.rol === 'SUPER_ADMIN') {
        cleaned.organizacionId = null;
      } else if (cleaned.rol && !cleaned.organizacionId && !current.organizacionId) {
        throw new Error('Los roles distintos a Administrador General requieren una organización');
      }

      assertSafeMutation(current, cleaned, users, acting);

      const next: Usuario = {
        ...current,
        ...cleaned,
        passwordHash: patch.password
          ? await hashPassword(patch.password)
          : current.passwordHash,
      };
      const arr = users.slice();
      arr[idx] = next;
      persistUsers(arr);
    },
    [users, session, persistUsers],
  );

  const eliminarUsuario = useCallback<AuthContextValue['eliminarUsuario']>(
    (id) => {
      const target = users.find((u) => u.id === id);
      if (!target) return;
      // No auto-eliminación.
      if (session && session.user.id === id) {
        throw new Error('No puedes eliminar tu propio usuario.');
      }
      // No eliminar al último SUPER_ADMIN.
      if (target.rol === 'SUPER_ADMIN') {
        const otrosSuper = users.filter(
          (u) => u.rol === 'SUPER_ADMIN' && u.activo && u.id !== id,
        ).length;
        if (otrosSuper === 0) {
          throw new Error(
            'No se puede eliminar al último Administrador General activo.',
          );
        }
      }
      persistUsers(users.filter((u) => u.id !== id));
    },
    [users, session, persistUsers],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      users,
      usersVersion,
      login,
      logout,
      cambiarOrganizacionActiva,
      crearUsuario,
      actualizarUsuario,
      eliminarUsuario,
    }),
    [
      ready,
      session,
      users,
      usersVersion,
      login,
      logout,
      cambiarOrganizacionActiva,
      crearUsuario,
      actualizarUsuario,
      eliminarUsuario,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
