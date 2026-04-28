import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await login(username.trim(), password);
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
            <span>Usuario</span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
          Sus credenciales se verifican localmente. La información mostrada
          luego se filtra por su organización.
        </p>
      </div>
    </div>
  );
}
