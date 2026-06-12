import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { login, backend } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usaEmail = backend === 'supabase';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await login(identifier.trim(), password);
    setSubmitting(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden>SC</div>
          <div>
            <h1>Sistema de Control de Asistencia</h1>
            <p className="brand-sub">Plataforma multi-organizacional</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="auth-form" noValidate>
          <label className="field">
            <span>{usaEmail ? 'Email' : 'Usuario'}</span>
            <input
              type={usaEmail ? 'email' : 'text'}
              autoComplete={usaEmail ? 'email' : 'username'}
              autoFocus
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={usaEmail ? 'tu@correo.com' : 'admin'}
            />
          </label>

          <label className="field">
            <span>Clave</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Verificando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="auth-hint">
          {usaEmail
            ? 'Las credenciales se verifican contra Supabase Auth. Si olvidaste tu clave, contacta al administrador.'
            : 'Sus credenciales se verifican localmente. La información mostrada luego se filtra por su organización.'}
        </p>
      </div>
    </div>
  );
}
