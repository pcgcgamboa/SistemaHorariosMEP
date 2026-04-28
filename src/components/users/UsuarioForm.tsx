import { useEffect, useState, type FormEvent } from 'react';
import type { Organizacion, Rol, Usuario } from '../../types';
import { ROL_LABEL } from '../../types';
import type { NuevoUsuarioInput } from '../../auth/AuthContext';

interface Props {
  /** Si está presente → modo edición (cuenta inmutable). */
  initial: Usuario | null;
  organizaciones: Organizacion[];
  /** Cuenta del usuario que ejecuta la acción (para autoprotegerlo). */
  currentUserId: string | null;
  onSubmitNuevo: (data: NuevoUsuarioInput) => Promise<void>;
  onSubmitEdicion: (
    id: string,
    patch: Partial<Omit<Usuario, 'id' | 'passwordHash'>> & { password?: string },
  ) => Promise<void>;
  onCancel: () => void;
}

const ROLES: Rol[] = ['SUPER_ADMIN', 'ORG_ADMIN', 'USER'];

interface FormState {
  username: string;
  nombreCompleto: string;
  email: string;
  rol: Rol;
  organizacionId: string;
  activo: boolean;
  password: string;
  passwordConfirm: string;
  cambiarClave: boolean;
}

const EMPTY: FormState = {
  username: '',
  nombreCompleto: '',
  email: '',
  rol: 'USER',
  organizacionId: '',
  activo: true,
  password: '',
  passwordConfirm: '',
  cambiarClave: false,
};

export function UsuarioForm({
  initial,
  organizaciones,
  currentUserId,
  onSubmitNuevo,
  onSubmitEdicion,
  onCancel,
}: Props) {
  const editando = initial !== null;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setForm({
        username: initial.username,
        nombreCompleto: initial.nombreCompleto,
        email: initial.email ?? '',
        rol: initial.rol,
        organizacionId: initial.organizacionId ?? '',
        activo: initial.activo,
        password: '',
        passwordConfirm: '',
        cambiarClave: false,
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
    setServerError(null);
  }, [initial]);

  const isSelf = editando && initial!.id === currentUserId;
  const requiereOrg = form.rol !== 'SUPER_ADMIN';

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!editando) {
      if (!form.username.trim()) e.username = 'Requerido';
      else if (!/^[a-zA-Z0-9._-]{3,32}$/.test(form.username.trim()))
        e.username = '3-32 caracteres: letras, números, . _ -';
    }
    if (!form.nombreCompleto.trim()) e.nombreCompleto = 'Requerido';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'Correo inválido';
    if (requiereOrg && !form.organizacionId) e.organizacionId = 'Seleccione una organización';

    const debeSetearClave = !editando || form.cambiarClave;
    if (debeSetearClave) {
      if (form.password.length < 6) e.password = 'Mínimo 6 caracteres';
      if (form.password !== form.passwordConfirm) e.passwordConfirm = 'Las claves no coinciden';
    }
    return e;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErrors(e);
    setServerError(null);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      if (editando) {
        const patch: Partial<Omit<Usuario, 'id' | 'passwordHash'>> & { password?: string } = {
          nombreCompleto: form.nombreCompleto.trim(),
          email: form.email.trim() || undefined,
          rol: form.rol,
          organizacionId: form.rol === 'SUPER_ADMIN' ? null : form.organizacionId,
          activo: form.activo,
        };
        if (form.cambiarClave && form.password) patch.password = form.password;
        await onSubmitEdicion(initial!.id, patch);
      } else {
        const nuevo: NuevoUsuarioInput = {
          username: form.username.trim().toLowerCase(),
          password: form.password,
          nombreCompleto: form.nombreCompleto.trim(),
          email: form.email.trim() || undefined,
          rol: form.rol,
          organizacionId: form.rol === 'SUPER_ADMIN' ? null : form.organizacionId,
        };
        await onSubmitNuevo(nuevo);
      }
    } catch (err) {
      setServerError((err as Error).message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  return (
    <form className="org-form" onSubmit={handleSubmit} noValidate>
      <h3>{editando ? 'Editar usuario' : 'Nuevo usuario'}</h3>

      <label className="field">
        <span>Cuenta *</span>
        <input
          type="text"
          autoComplete="username"
          value={form.username}
          disabled={editando}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          placeholder="ej. ggonzalez"
          required={!editando}
        />
        {editando && <em className="field-error" style={{ color: 'var(--text-muted)', fontStyle: 'normal' }}>La cuenta no se puede modificar.</em>}
        {errors.username && <em className="field-error">{errors.username}</em>}
      </label>

      <label className="field">
        <span>Nombre completo (incluye apellidos) *</span>
        <input
          type="text"
          value={form.nombreCompleto}
          onChange={(e) => setForm((f) => ({ ...f, nombreCompleto: e.target.value }))}
          placeholder="Nombre Apellido1 Apellido2"
          required
        />
        {errors.nombreCompleto && <em className="field-error">{errors.nombreCompleto}</em>}
      </label>

      <label className="field">
        <span>Correo electrónico</span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="usuario@dominio.com"
        />
        {errors.email && <em className="field-error">{errors.email}</em>}
      </label>

      <label className="field">
        <span>Rol *</span>
        <select
          value={form.rol}
          disabled={isSelf}
          onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as Rol }))}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROL_LABEL[r]}
            </option>
          ))}
        </select>
        {isSelf && (
          <em className="field-error" style={{ color: 'var(--text-muted)', fontStyle: 'normal' }}>
            No puedes cambiar tu propio rol.
          </em>
        )}
      </label>

      {requiereOrg && (
        <label className="field">
          <span>Organización *</span>
          <select
            value={form.organizacionId}
            onChange={(e) => setForm((f) => ({ ...f, organizacionId: e.target.value }))}
          >
            <option value="">— Seleccione —</option>
            {organizaciones
              .filter((o) => o.activa)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
          </select>
          {errors.organizacionId && <em className="field-error">{errors.organizacionId}</em>}
        </label>
      )}

      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={form.activo}
          disabled={isSelf}
          onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
        />
        <span>Usuario activo</span>
      </label>

      {/* Bloque de clave: requerido al crear, opcional (toggleable) al editar */}
      {!editando && (
        <>
          <label className="field">
            <span>Clave *</span>
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
            {errors.password && <em className="field-error">{errors.password}</em>}
          </label>
          <label className="field">
            <span>Confirmar clave *</span>
            <input
              type="password"
              autoComplete="new-password"
              value={form.passwordConfirm}
              onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
              required
            />
            {errors.passwordConfirm && <em className="field-error">{errors.passwordConfirm}</em>}
          </label>
        </>
      )}

      {editando && (
        <>
          <label className="field field-checkbox">
            <input
              type="checkbox"
              checked={form.cambiarClave}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  cambiarClave: e.target.checked,
                  password: '',
                  passwordConfirm: '',
                }))
              }
            />
            <span>Cambiar clave</span>
          </label>
          {form.cambiarClave && (
            <>
              <label className="field">
                <span>Nueva clave *</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                {errors.password && <em className="field-error">{errors.password}</em>}
              </label>
              <label className="field">
                <span>Confirmar nueva clave *</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.passwordConfirm}
                  onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                />
                {errors.passwordConfirm && <em className="field-error">{errors.passwordConfirm}</em>}
              </label>
            </>
          )}
        </>
      )}

      {serverError && <div className="auth-error" role="alert">{serverError}</div>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}
