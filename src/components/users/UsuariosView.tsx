import { useMemo, useState } from 'react';
import type { Organizacion, Rol, Usuario } from '../../types';
import { ROL_LABEL } from '../../types';
import { useAuth, type NuevoUsuarioInput } from '../../auth/AuthContext';
import { UsuarioForm } from './UsuarioForm';

interface Props {
  organizaciones: Organizacion[];
}

export function UsuariosView({ organizaciones }: Props) {
  const { users, session, crearUsuario, actualizarUsuario, eliminarUsuario } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const [modo, setModo] = useState<'lista' | 'crear' | 'editar'>('lista');
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [filtro, setFiltro] = useState('');
  const [filtroRol, setFiltroRol] = useState<'TODOS' | Rol>('TODOS');
  const [filtroOrg, setFiltroOrg] = useState<'TODAS' | string>('TODAS');
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const orgsById = useMemo(
    () => new Map(organizaciones.map((o) => [o.id, o])),
    [organizaciones],
  );

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return users.filter((u) => {
      if (filtroRol !== 'TODOS' && u.rol !== filtroRol) return false;
      if (filtroOrg !== 'TODAS' && (u.organizacionId ?? '') !== filtroOrg) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.nombreCompleto.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, filtro, filtroRol, filtroOrg]);

  function handleEliminar(u: Usuario) {
    setErrorAccion(null);
    if (!confirm(`¿Eliminar al usuario "${u.username}"? Esta acción no se puede deshacer.`)) return;
    try {
      eliminarUsuario(u.id);
    } catch (err) {
      setErrorAccion((err as Error).message);
    }
  }

  async function handleToggleActivo(u: Usuario) {
    setErrorAccion(null);
    try {
      await actualizarUsuario(u.id, { activo: !u.activo });
    } catch (err) {
      setErrorAccion((err as Error).message);
    }
  }

  async function handleSubmitNuevo(data: NuevoUsuarioInput) {
    await crearUsuario(data);
    setModo('lista');
  }

  async function handleSubmitEdicion(
    id: string,
    patch: Partial<Omit<Usuario, 'id' | 'passwordHash'>> & { password?: string },
  ) {
    await actualizarUsuario(id, patch);
    setModo('lista');
    setEditando(null);
  }

  if (modo !== 'lista') {
    return (
      <section className="view">
        <header className="view-header">
          <div>
            <h2>Usuarios</h2>
            <p className="view-sub">{modo === 'editar' ? 'Editando usuario' : 'Creando nuevo usuario'}</p>
          </div>
        </header>
        <UsuarioForm
          initial={editando}
          organizaciones={organizaciones}
          currentUserId={currentUserId}
          onSubmitNuevo={handleSubmitNuevo}
          onSubmitEdicion={handleSubmitEdicion}
          onCancel={() => {
            setModo('lista');
            setEditando(null);
          }}
        />
      </section>
    );
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h2>Usuarios</h2>
          <p className="view-sub">
            Administre todas las cuentas y sus roles. {users.length} usuarios en total.
          </p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-primary" onClick={() => setModo('crear')}>
            + Nuevo usuario
          </button>
        </div>
      </header>

      {errorAccion && (
        <div className="auth-error" role="alert">{errorAccion}</div>
      )}

      <div className="toolbar">
        <input
          className="input-search"
          type="search"
          placeholder="Buscar por cuenta, nombre o correo…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as 'TODOS' | Rol)}>
          <option value="TODOS">Todos los roles</option>
          <option value="SUPER_ADMIN">{ROL_LABEL.SUPER_ADMIN}</option>
          <option value="ORG_ADMIN">{ROL_LABEL.ORG_ADMIN}</option>
          <option value="USER">{ROL_LABEL.USER}</option>
        </select>
        <select value={filtroOrg} onChange={(e) => setFiltroOrg(e.target.value)}>
          <option value="TODAS">Todas las organizaciones</option>
          <option value="">— Sin organización —</option>
          {organizaciones.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Organización</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
                  No hay usuarios que coincidan.
                </td>
              </tr>
            )}
            {filtrados.map((u) => {
              const org = u.organizacionId ? orgsById.get(u.organizacionId) : null;
              const esYo = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td><code>{u.username}</code>{esYo && <span className="badge badge-ok" style={{ marginLeft: 6 }}>tú</span>}</td>
                  <td>{u.nombreCompleto}</td>
                  <td>{u.email ?? '—'}</td>
                  <td>{ROL_LABEL[u.rol]}</td>
                  <td>{org ? org.nombre : u.rol === 'SUPER_ADMIN' ? 'Global' : '—'}</td>
                  <td>
                    <span className={`badge ${u.activo ? 'badge-ok' : 'badge-warn'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => {
                        setEditando(u);
                        setModo('editar');
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleToggleActivo(u)}
                      disabled={esYo}
                      title={esYo ? 'No puedes desactivar tu propio usuario' : ''}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="btn-icon danger"
                      onClick={() => handleEliminar(u)}
                      disabled={esYo}
                      title={esYo ? 'No puedes eliminar tu propio usuario' : ''}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
