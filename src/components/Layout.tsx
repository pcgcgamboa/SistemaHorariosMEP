import type { ReactNode } from 'react';
import type { Organizacion, Session } from '../types';
import { ROL_LABEL } from '../types';
import { OrgSwitcher } from './organizations/OrgSwitcher';

export type Vista =
  | 'detalle'
  | 'reporte'
  | 'profesores'
  | 'marcas'
  | 'configuracion'
  | 'organizaciones'
  | 'usuarios';

interface NavItem {
  id: Vista;
  label: string;
  icon: string;
  /** Si true, requiere SUPER_ADMIN. */
  superAdmin?: boolean;
}

const NAV: NavItem[] = [
  { id: 'detalle', label: 'Detalle de Asistencia', icon: '📋' },
  { id: 'reporte', label: 'Reporte Mensual', icon: '📊' },
  { id: 'profesores', label: 'Horario de Profesores', icon: '👥' },
  { id: 'marcas', label: 'Marcas del Reloj', icon: '⏱️' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙️' },
  { id: 'organizaciones', label: 'Organizaciones', icon: '🏢', superAdmin: true },
  { id: 'usuarios', label: 'Usuarios', icon: '👤', superAdmin: true },
];

interface Props {
  vista: Vista;
  onChangeVista: (v: Vista) => void;
  session: Session;
  organizaciones: Organizacion[];
  organizacionActiva: Organizacion | null;
  onCambiarOrganizacion: (id: string | null) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({
  vista,
  onChangeVista,
  session,
  organizaciones,
  organizacionActiva,
  onCambiarOrganizacion,
  onLogout,
  children,
}: Props) {
  const isSuperAdmin = session.user.rol === 'SUPER_ADMIN';
  const navVisible = NAV.filter((n) => !n.superAdmin || isSuperAdmin);

  const subtitulo = organizacionActiva
    ? `${organizacionActiva.nombre} — ${organizacionActiva.direccionRegional || 'Sin regional'}`
    : isSuperAdmin
      ? 'Vista consolidada (todas las organizaciones)'
      : 'Sin organización asignada';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden>SC</div>
          <div>
            <h1>Sistema de Control de Asistencia</h1>
            <p className="brand-sub">{subtitulo}</p>
          </div>
        </div>

        <div className="app-header-tools">
          {isSuperAdmin && (
            <OrgSwitcher
              organizaciones={organizaciones}
              activaId={session.organizacionActivaId}
              onChange={onCambiarOrganizacion}
            />
          )}
          <div className="user-chip">
            <div className="user-chip-name">{session.user.nombreCompleto}</div>
            <div className="user-chip-role">{ROL_LABEL[session.user.rol]}</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Navegación principal">
        {navVisible.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${vista === item.id ? 'active' : ''}`}
            onClick={() => onChangeVista(item.id)}
            aria-current={vista === item.id ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        Plataforma multi-organizacional. Los datos se almacenan localmente y se filtran por organización.
      </footer>
    </div>
  );
}
