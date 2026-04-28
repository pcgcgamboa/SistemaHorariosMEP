import type { Organizacion } from '../../types';

interface Props {
  organizaciones: Organizacion[];
  activaId: string | null;
  onChange: (id: string | null) => void;
}

/**
 * Selector de tenant activo. Solo se renderiza para SUPER_ADMIN.
 * Incluye una opción "Todas" para vista consolidada.
 */
export function OrgSwitcher({ organizaciones, activaId, onChange }: Props) {
  return (
    <label className="org-switcher">
      <span className="org-switcher-label">Organización</span>
      <select
        value={activaId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Todas (vista global) —</option>
        {organizaciones
          .filter((o) => o.activa)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
      </select>
    </label>
  );
}
