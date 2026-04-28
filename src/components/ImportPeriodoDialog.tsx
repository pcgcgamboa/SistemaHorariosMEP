import { useEffect, useState } from 'react';
import type { DeteccionPeriodo } from '../utils/periodo';

/**
 * Acción que el usuario eligió en el diálogo.
 *
 * - `crear`: crear un nuevo periodo y agregar las marcas.
 * - `agregar`: usar el periodo existente y agregar las marcas (puede causar
 *   duplicados si el archivo ya fue importado).
 * - `reemplazar`: borrar las marcas del periodo existente y dejar solo las del
 *   archivo importado (re-import limpio).
 * - `cancelar`: descartar la importación.
 */
export type ImportAction =
  | { tipo: 'crear'; nombre: string; fechaInicio: string; fechaFin: string }
  | { tipo: 'agregar'; periodoId: string }
  | { tipo: 'reemplazar'; periodoId: string }
  | { tipo: 'cancelar' };

interface Props {
  deteccion: DeteccionPeriodo;
  marcasCount: number;
  origen?: string;
  onResolve: (action: ImportAction) => void;
}

export function ImportPeriodoDialog({ deteccion, marcasCount, origen, onResolve }: Props) {
  const [nombre, setNombre] = useState(deteccion.sugerencia.nombre);
  const [fechaInicio, setFechaInicio] = useState(deteccion.sugerencia.fechaInicio);
  const [fechaFin, setFechaFin] = useState(deteccion.sugerencia.fechaFin);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    setNombre(deteccion.sugerencia.nombre);
    setFechaInicio(deteccion.sugerencia.fechaInicio);
    setFechaFin(deteccion.sugerencia.fechaFin);
    setEditando(false);
  }, [deteccion]);

  const esExistente = deteccion.tipo === 'existente';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-header">
          <h3>Importación de marcas</h3>
        </header>

        <div className="modal-body">
          <p className="modal-lead">
            Se procesarán <strong>{marcasCount.toLocaleString('es-CR')}</strong> marcas
            entre <strong>{fmt(deteccion.rango.fechaInicio)}</strong> y{' '}
            <strong>{fmt(deteccion.rango.fechaFin)}</strong>
            {origen && (
              <>
                {' '}desde <code>{origen}</code>
              </>
            )}
            .
          </p>

          {esExistente ? (
            <div className="modal-section">
              <h4>Periodo existente detectado</h4>
              <p>
                El rango se solapa con el periodo registrado{' '}
                <strong>«{deteccion.principal.nombre}»</strong>{' '}
                ({fmt(deteccion.principal.fechaInicio)} – {fmt(deteccion.principal.fechaFin)},{' '}
                {deteccion.principal.marcasCount.toLocaleString('es-CR')} marcas).
              </p>
              {deteccion.coincidencias.length > 1 && (
                <p className="modal-hint">
                  Otros periodos también solapan: {deteccion.coincidencias.slice(1).map((p) => p.nombre).join(', ')}.
                </p>
              )}

              <div className="modal-actions-stack">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    onResolve({ tipo: 'reemplazar', periodoId: deteccion.principal.id })
                  }
                >
                  Reemplazar marcas del periodo
                  <small>Borra las marcas existentes en este rango y deja solo las del archivo.</small>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    onResolve({ tipo: 'agregar', periodoId: deteccion.principal.id })
                  }
                >
                  Agregar al periodo
                  <small>Suma estas marcas a las que ya tiene el periodo (puede duplicar).</small>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditando((v) => !v)}
                >
                  {editando ? 'Ocultar' : 'O crear un periodo distinto'}
                </button>
              </div>

              {editando && (
                <CrearPeriodoForm
                  nombre={nombre}
                  fechaInicio={fechaInicio}
                  fechaFin={fechaFin}
                  onChangeNombre={setNombre}
                  onChangeFechaInicio={setFechaInicio}
                  onChangeFechaFin={setFechaFin}
                  onSubmit={() => onResolve({ tipo: 'crear', nombre, fechaInicio, fechaFin })}
                  onCancel={() => setEditando(false)}
                />
              )}
            </div>
          ) : (
            <div className="modal-section">
              <h4>Periodo nuevo</h4>
              <p>
                El rango no coincide con ningún periodo registrado. Se creará uno nuevo
                y se registrarán las marcas allí.
              </p>
              <CrearPeriodoForm
                nombre={nombre}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                onChangeNombre={setNombre}
                onChangeFechaInicio={setFechaInicio}
                onChangeFechaFin={setFechaFin}
                onSubmit={() => onResolve({ tipo: 'crear', nombre, fechaInicio, fechaFin })}
                onCancel={() => onResolve({ tipo: 'cancelar' })}
                ctaLabel="Crear periodo y registrar marcas"
              />
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => onResolve({ tipo: 'cancelar' })}>
            Cancelar importación
          </button>
        </footer>
      </div>
    </div>
  );
}

interface CrearProps {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  onChangeNombre: (v: string) => void;
  onChangeFechaInicio: (v: string) => void;
  onChangeFechaFin: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  ctaLabel?: string;
}

function CrearPeriodoForm({
  nombre,
  fechaInicio,
  fechaFin,
  onChangeNombre,
  onChangeFechaInicio,
  onChangeFechaFin,
  onSubmit,
  onCancel,
  ctaLabel = 'Crear periodo',
}: CrearProps) {
  const valido = Boolean(
    nombre.trim() && fechaInicio && fechaFin && fechaInicio <= fechaFin,
  );
  return (
    <div className="periodo-form">
      <label className="field">
        <span>Nombre del periodo</span>
        <input
          type="text"
          value={nombre}
          onChange={(e) => onChangeNombre(e.target.value)}
        />
      </label>
      <div className="periodo-form-row">
        <label className="field">
          <span>Desde</span>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => onChangeFechaInicio(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => onChangeFechaFin(e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" disabled={!valido} onClick={onSubmit}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

function fmt(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
