import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Rol, Session, Usuario, UsuarioPublico } from '../types';
import {
  loadSession,
  loadSupabaseOrgActiva,
  loadUsers,
  saveSession,
  saveSupabaseOrgActiva,
  saveUsers,
} from '../storage/authStore';
import { hashPassword, verifyPassword } from './passwordHash';
import { supabase, supabaseEnabled } from '../storage/supabase';
import { usuariosRepoSb } from '../storage/supabaseRepos';

/** Duración de sesión: 8 horas. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  users: Usuario[];
  /** Token incremental que cambia con cada mutación de usuarios — útil para folder sync. */
  usersVersion: number;
  /**
   * Inicia sesión. El primer argumento es:
   *  - en modo local: `username` (3-32 chars, a-z0-9._-)
   *  - en modo Supabase: `email` (RFC 5322).
   */
  login: (usernameOrEmail: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
  cambiarOrganizacionActiva: (organizacionId: string | null) => void;
  /** SUPER_ADMIN únicamente. En modo Supabase lanza error (se gestiona en dashboard). */
  crearUsuario: (data: NuevoUsuarioInput) => Promise<Usuario>;
  /** SUPER_ADMIN únicamente. En modo Supabase solo permite editar el perfil (no password ni rol crítico). */
  actualizarUsuario: (
    id: string,
    patch: Partial<Omit<Usuario, 'id' | 'passwordHash'>> & { password?: string },
  ) => Promise<void>;
  /** SUPER_ADMIN únicamente. En modo Supabase lanza error (se gestiona en dashboard). */
  eliminarUsuario: (id: string) => void;
  /** True si la auth se está manejando contra Supabase. La UI puede usarlo para
   *  ajustar etiquetas (Usuario → Email, ocultar botones de "Nuevo usuario"). */
  backend: 'local' | 'supabase';
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

/** Reglas de invariantes que protegen la integridad de cuentas (modo local). */
function assertSafeMutation(
  current: Usuario,
  next: Partial<Usuario>,
  all: Usuario[],
  acting: Usuario | null,
): void {
  if (current.rol === 'SUPER_ADMIN') {
    const stillSuper = all.filter(
      (u) => u.rol === 'SUPER_ADMIN' && u.activo && u.id !== current.id,
    ).length;
    const willStaySuper = (next.rol ?? current.rol) === 'SUPER_ADMIN';
    const willStayActive = next.activo ?? current.activo;
    if ((!willStaySuper || !willStayActive) && stillSuper === 0) {
      throw new Error('No se puede dejar el sistema sin un Administrador General activo.');
    }
  }
  if (acting && acting.id === current.id) {
    if (next.rol && next.rol !== current.rol) {
      throw new Error('No puedes cambiar tu propio rol.');
    }
    if (next.activo === false) {
      throw new Error('No puedes desactivar tu propio usuario.');
    }
  }
}

const DASHBOARD_ONLY_MSG =
  'En modo Supabase, los usuarios se gestionan desde el dashboard (Authentication → Users). Próxima iteración puede agregar una Edge Function para crearlos desde aquí.';

// ============================================================================
// Provider: Supabase Auth
// ============================================================================

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [usersVersion, setUsersVersion] = useState(0);
  // Recuerda la organización elegida por el SUPER_ADMIN entre reconstrucciones
  // de sesión (ver comentario en `saveSupabaseOrgActiva`).
  const orgActivaRef = useRef<string | null>(loadSupabaseOrgActiva());

  // Bootstrap + suscripción a cambios de sesión
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    async function buildSession(uid: string, expiresAt: number): Promise<Session | null> {
      const profile = await usuariosRepoSb.findById(uid);
      if (!profile || !profile.activo) return null;
      return {
        user: toPublico(profile),
        organizacionActivaId: profile.rol === 'SUPER_ADMIN' ? orgActivaRef.current : profile.organizacionId,
        expiresAt,
      };
    }

    async function refreshUsers() {
      try {
        const all = await usuariosRepoSb.loadAll();
        if (cancelled) return;
        setUsers(all);
        setUsersVersion((v) => v + 1);
      } catch (err) {
        if (!cancelled) {

          console.error('[supabase] No se pudo cargar la tabla usuarios:', err);
        }
      }
    }

    (async () => {
      const { data } = await supabase!.auth.getSession();
      if (data.session?.user) {
        const exp = (data.session.expires_at ?? Date.now() / 1000 + SESSION_TTL_MS / 1000) * 1000;
        const built = await buildSession(data.session.user.id, exp);
        if (cancelled) return;
        setSession(built);
        if (built) await refreshUsers();
      }
      if (!cancelled) setReady(true);
    })();

    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange(async (_event, supaSession) => {
      if (!supaSession?.user) {
        if (!cancelled) {
          setSession(null);
          setUsers([]);
        }
        return;
      }
      const exp = (supaSession.expires_at ?? Date.now() / 1000 + SESSION_TTL_MS / 1000) * 1000;
      const built = await buildSession(supaSession.user.id, exp);
      if (cancelled) return;
      setSession(built);
      if (built) await refreshUsers();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback<AuthContextValue['login']>(async (emailOrUsername, password) => {
    if (!supabase) return { ok: false, error: 'Supabase no está configurado' };
    if (!emailOrUsername.includes('@')) {
      return { ok: false, error: 'En modo Supabase debe usar su email para iniciar sesión.' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: emailOrUsername.trim(),
      password,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    if (!supabase) return;
    void supabase.auth.signOut();
    setSession(null);
    setUsers([]);
    orgActivaRef.current = null;
    saveSupabaseOrgActiva(null);
  }, []);

  const cambiarOrganizacionActiva = useCallback((organizacionActivaId: string | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (prev.user.rol !== 'SUPER_ADMIN') return prev;
      return { ...prev, organizacionActivaId };
    });
    orgActivaRef.current = organizacionActivaId;
    saveSupabaseOrgActiva(organizacionActivaId);
  }, []);

  const crearUsuario = useCallback<AuthContextValue['crearUsuario']>(async () => {
    throw new Error(DASHBOARD_ONLY_MSG);
  }, []);

  const actualizarUsuario = useCallback<AuthContextValue['actualizarUsuario']>(
    async (id, patch) => {
      // Permitimos editar el perfil (nombre, email, organización, activo, rol)
      // pero NO el password. Para password el usuario usa "Reset password" en Supabase
      // o el SUPER_ADMIN lo cambia desde el dashboard.
      if (patch.password) {
        throw new Error(
          'Para cambiar la clave use "Forgot password" o el dashboard de Supabase.',
        );
      }
      const target = users.find((u) => u.id === id);
      if (!target) throw new Error('Usuario no encontrado');
      const next: Usuario = {
        ...target,
        ...patch,
      };
      await usuariosRepoSb.upsert(next);
      setUsers((prev) => prev.map((u) => (u.id === id ? next : u)));
      setUsersVersion((v) => v + 1);
    },
    [users],
  );

  const eliminarUsuario = useCallback<AuthContextValue['eliminarUsuario']>(() => {
    throw new Error(DASHBOARD_ONLY_MSG);
  }, []);

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
      backend: 'supabase',
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

// ============================================================================
// Provider: Local (SHA-256 + localStorage)
// ============================================================================

function LocalAuthProvider({ children }: { children: ReactNode }) {
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
      if (session && session.user.id === id) {
        throw new Error('No puedes eliminar tu propio usuario.');
      }
      if (target.rol === 'SUPER_ADMIN') {
        const otrosSuper = users.filter(
          (u) => u.rol === 'SUPER_ADMIN' && u.activo && u.id !== id,
        ).length;
        if (otrosSuper === 0) {
          throw new Error('No se puede eliminar al último Administrador General activo.');
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
      backend: 'local',
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

// ============================================================================
// Fachada
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  return supabaseEnabled
    ? <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
    : <LocalAuthProvider>{children}</LocalAuthProvider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
