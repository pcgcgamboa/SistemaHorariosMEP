import { useEffect, useState } from 'react';
import type { Incidente, TipoIncidente } from '../../types';
import { INCIDENTE_CATALOGO } from '../../types';

interface Props {
  profesorNombre: string;
  fecha: string;
  actual: Incidente | null;
  onSubmit: (tipo: TipoIncidente, descripcion?: string) => void;
  onClear: () => void;
  onCancel: () => void;
}

/**
 * Editor de incidente para una celda (profesor × día) del Reporte Mensual.
 * Permite asignar uno de los tipos del catálogo, editar la descripción
 * o limpiar el incidente del día.
 */
export function IncidenteEditor({
  profesorNombre,
  fecha,
  actual,
  onSubmit,
  onClear,
  onCancel,
}: Props) {
  const [tipo, setTipo] = useState<TipoIncidente>(actual?.tipo ?? 'AUSENTE');
  const [descripcion, setDescripcion] = useState(actual?.descripcion ?? '');

  useEffect(() => {
    setTipo(actual?.tipo ?? 'AUSENTE');
    setDescripcion(actual?.descripcion ?? '');
  }, [actual]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-header">
          <h3>{actual ? 'Editar incidente' : 'Registrar incidente'}</h3>
          <p className="modal-lead">
            <strong>{profesorNombre}</strong> · {fmt(fecha)}
          </p>
        </header>

        <div className="modal-body">
          <div className="incidente-tipos">
            {INCIDENTE_CATALOGO.map((c) => (
              <button
                key={c.tipo}
                type="button"
                className={`incidente-tipo-chip ${tipo === c.tipo ? 'is-selected' : ''}`}
                style={{
                  background: tipo === c.tipo ? c.color : 'transparent',
                  color: tipo === c.tipo ? c.colorTexto : 'var(--text)',
                  borderColor: c.color,
                }}
                onClick={() => setTipo(c.tipo)}
              >
                <span className="incidente-tipo-codigo" style={{
                  background: c.color,
                  color: c.colorTexto,
                }}>{c.codigo}</span>
                {c.label}
              </button>
            ))}
          </div>

          <label className="field">
            <span>Descripción (opcional)</span>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle adicional…"
              maxLength={200}
            />
          </label>
        </div>

        <footer className="modal-footer modal-footer-spread">
          <div>
            {actual && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClear}
                style={{ color: 'var(--danger)' }}
              >
                Limpiar incidente
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onSubmit(tipo, descripcion)}>
              {actual ? 'Guardar' : 'Registrar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function fmt(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
