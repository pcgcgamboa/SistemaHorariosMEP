import { useEffect, useState } from 'react';
import type { Creatable, DiaSemana, HorarioProfesor, HorarioSemanal, Profesor } from '../types';
import { DIAS_LABEL, DIAS_SEMANA } from '../types';

interface Props {
  profesor: Profesor | null;
  onCancel: () => void;
  onSave: (p: Creatable<Profesor>) => void;
}

interface DiaFormState {
  libre: boolean;
  entrada: string;
  salida: string;
}

interface HorarioFormState {
  id: string;
  tipo: 'permanente' | 'periodo';
  fechaInicio: string;
  fechaFin: string;
  dias: Record<DiaSemana, DiaFormState>;
}

interface FormState {
  nombre: string;
  cargo: string;
  horarios: HorarioFormState[];
}

function emptyDias(): Record<DiaSemana, DiaFormState> {
  const o = {} as Record<DiaSemana, DiaFormState>;
  for (const d of DIAS_SEMANA) o[d] = { libre: true, entrada: '07:00', salida: '16:10' };
  return o;
}

function horarioToFormState(h: HorarioProfesor): HorarioFormState {
  const dias = emptyDias();
  for (const d of DIAS_SEMANA) {
    const r = h.horario[d];
    if (r) dias[d] = { libre: false, entrada: r.entrada, salida: r.salida };
  }
  const tieneFechas = Boolean(h.fechaInicio || h.fechaFin);
  return {
    id: h.id,
    tipo: tieneFechas ? 'periodo' : 'permanente',
    fechaInicio: h.fechaInicio ?? '',
    fechaFin: h.fechaFin ?? '',
    dias,
  };
}

function nuevoHorarioForm(tipo: 'permanente' | 'periodo'): HorarioFormState {
  return {
    id: `h${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tipo,
    fechaInicio: '',
    fechaFin: '',
    dias: emptyDias(),
  };
}

function toFormState(profesor: Profesor | null): FormState {
  if (!profesor) {
    return {
      nombre: '',
      cargo: '',
      horarios: [nuevoHorarioForm('permanente')],
    };
  }
  return {
    nombre: profesor.nombre,
    cargo: profesor.cargo,
    horarios: profesor.horarios.length > 0
      ? profesor.horarios.map(horarioToFormState)
      : [nuevoHorarioForm('permanente')],
  };
}

export function ProfesorForm({ profesor, onCancel, onSave }: Props) {
  const [state, setState] = useState<FormState>(() => toFormState(profesor));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setState(toFormState(profesor));
    setErrors({});
  }, [profesor]);

  function updateHorario(idx: number, patch: Partial<HorarioFormState>) {
    setState((s) => {
      const copy = s.horarios.slice();
      copy[idx] = { ...copy[idx], ...patch };
      return { ...s, horarios: copy };
    });
  }

  function setDia(idx: number, dia: DiaSemana, patch: Partial<DiaFormState>) {
    setState((s) => {
      const copy = s.horarios.slice();
      copy[idx] = {
        ...copy[idx],
        dias: { ...copy[idx].dias, [dia]: { ...copy[idx].dias[dia], ...patch } },
      };
      return { ...s, horarios: copy };
    });
  }

  function agregarHorario(tipo: 'permanente' | 'periodo') {
    setState((s) => ({ ...s, horarios: [...s.horarios, nuevoHorarioForm(tipo)] }));
  }

  function eliminarHorario(idx: number) {
    setState((s) => ({ ...s, horarios: s.horarios.filter((_, i) => i !== idx) }));
  }

  function copiarLunesATodos(idx: number) {
    setState((s) => {
      const copy = s.horarios.slice();
      const lunes = copy[idx].dias.lunes;
      const dias = { ...copy[idx].dias };
      for (const d of DIAS_SEMANA) {
        if (d === 'sabado' || d === 'domingo') continue;
        dias[d] = { ...lunes };
      }
      copy[idx] = { ...copy[idx], dias };
      return { ...s, horarios: copy };
    });
  }

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!state.nombre.trim()) e.nombre = 'El nombre es obligatorio';
    if (state.horarios.length === 0) e.horarios = 'Debe definir al menos un horario';

    // Solo puede haber 1 horario permanente
    const permanentes = state.horarios.filter((h) => h.tipo === 'permanente');
    if (permanentes.length > 1) {
      e.horarios = 'Solo puede haber un horario permanente';
    }

    state.horarios.forEach((h, idx) => {
      if (h.tipo === 'periodo') {
        if (!h.fechaInicio || !h.fechaFin) {
          e[`h${idx}.fechas`] = 'Fecha de inicio y fin son requeridas';
        } else if (h.fechaInicio > h.fechaFin) {
          e[`h${idx}.fechas`] = 'La fecha fin debe ser posterior a la inicio';
        }
      }
      for (const d of DIAS_SEMANA) {
        const r = h.dias[d];
        if (r.libre) continue;
        if (!r.entrada || !r.salida) {
          e[`h${idx}.${d}`] = 'Hora de entrada y salida son requeridas';
        } else if (r.entrada >= r.salida) {
          e[`h${idx}.${d}`] = 'La salida debe ser posterior a la entrada';
        }
      }
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validar()) return;

    const horarios: HorarioProfesor[] = state.horarios.map((hf) => {
      const horario: HorarioSemanal = {} as HorarioSemanal;
      for (const d of DIAS_SEMANA) {
        const r = hf.dias[d];
        horario[d] = r.libre ? null : { entrada: r.entrada, salida: r.salida };
      }
      return {
        id: hf.id,
        fechaInicio: hf.tipo === 'periodo' ? hf.fechaInicio : null,
        fechaFin: hf.tipo === 'periodo' ? hf.fechaFin : null,
        horario,
      };
    });

    onSave({
      id: profesor?.id ?? `p${Date.now()}`,
      nombre: state.nombre.trim().toUpperCase(),
      cargo: state.cargo.trim(),
      horarios,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <header className="form-header">
        <h2>{profesor ? 'Editar profesor' : 'Nuevo profesor'}</h2>
      </header>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Nombre del funcionario *</span>
          <input
            type="text"
            value={state.nombre}
            onChange={(e) => setState((s) => ({ ...s, nombre: e.target.value }))}
            placeholder="APELLIDO APELLIDO NOMBRE NOMBRE"
            required
            autoFocus
          />
          {errors.nombre && <span className="field-error">{errors.nombre}</span>}
        </label>
        <label className="field">
          <span className="field-label">Cargo</span>
          <input
            type="text"
            value={state.cargo}
            onChange={(e) => setState((s) => ({ ...s, cargo: e.target.value }))}
            placeholder="MATEMÁTICA, INFORMÁTICA, …"
          />
        </label>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h3>Horarios</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => agregarHorario('permanente')}
              disabled={state.horarios.some((h) => h.tipo === 'permanente')}
              title="Solo se permite un horario permanente"
            >
              + Permanente
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => agregarHorario('periodo')}
            >
              + Por periodo
            </button>
          </div>
        </div>
        {errors.horarios && <span className="field-error">{errors.horarios}</span>}

        {state.horarios.map((h, idx) => (
          <HorarioBlock
            key={h.id}
            horario={h}
            errors={errors}
            errorPrefix={`h${idx}`}
            canDelete={state.horarios.length > 1}
            onUpdate={(patch) => updateHorario(idx, patch)}
            onSetDia={(dia, patch) => setDia(idx, dia, patch)}
            onCopiarLunes={() => copiarLunesATodos(idx)}
            onDelete={() => eliminarHorario(idx)}
          />
        ))}
      </div>

      <footer className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Guardar
        </button>
      </footer>
    </form>
  );
}

interface HorarioBlockProps {
  horario: HorarioFormState;
  errors: Record<string, string>;
  errorPrefix: string;
  canDelete: boolean;
  onUpdate: (patch: Partial<HorarioFormState>) => void;
  onSetDia: (dia: DiaSemana, patch: Partial<DiaFormState>) => void;
  onCopiarLunes: () => void;
  onDelete: () => void;
}

function HorarioBlock({
  horario,
  errors,
  errorPrefix,
  canDelete,
  onUpdate,
  onSetDia,
  onCopiarLunes,
  onDelete,
}: HorarioBlockProps) {
  const isPeriodo = horario.tipo === 'periodo';
  return (
    <div className={`horario-block ${isPeriodo ? 'horario-block-periodo' : ''}`}>
      <div className="horario-block-header">
        <div className="horario-block-title">
          <span className={`badge ${isPeriodo ? 'badge-info' : 'badge-ok'}`}>
            {isPeriodo ? 'Por periodo' : 'Permanente'}
          </span>
          {isPeriodo && (
            <div className="horario-fechas">
              <label className="field">
                <span className="field-label">Desde</span>
                <input
                  type="date"
                  value={horario.fechaInicio}
                  onChange={(e) => onUpdate({ fechaInicio: e.target.value })}
                  max={horario.fechaFin || undefined}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Hasta</span>
                <input
                  type="date"
                  value={horario.fechaFin}
                  onChange={(e) => onUpdate({ fechaFin: e.target.value })}
                  min={horario.fechaInicio || undefined}
                  required
                />
              </label>
            </div>
          )}
        </div>
        <div className="horario-block-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCopiarLunes}>
            Copiar lunes a L–V
          </button>
          {canDelete && (
            <button type="button" className="btn-icon danger" onClick={onDelete}>
              Eliminar
            </button>
          )}
        </div>
      </div>
      {errors[`${errorPrefix}.fechas`] && (
        <span className="field-error">{errors[`${errorPrefix}.fechas`]}</span>
      )}

      <div className="horario-grid">
        {DIAS_SEMANA.map((d) => {
          const r = horario.dias[d];
          return (
            <div key={d} className={`horario-row ${r.libre ? 'libre' : ''}`}>
              <div className="horario-dia">{DIAS_LABEL[d]}</div>
              <label className="horario-toggle">
                <input
                  type="checkbox"
                  checked={!r.libre}
                  onChange={(e) => onSetDia(d, { libre: !e.target.checked })}
                />
                <span>Labora</span>
              </label>
              <label className="horario-time">
                <span>Entrada</span>
                <input
                  type="time"
                  value={r.entrada}
                  disabled={r.libre}
                  onChange={(e) => onSetDia(d, { entrada: e.target.value })}
                />
              </label>
              <label className="horario-time">
                <span>Salida</span>
                <input
                  type="time"
                  value={r.salida}
                  disabled={r.libre}
                  onChange={(e) => onSetDia(d, { salida: e.target.value })}
                />
              </label>
              {errors[`${errorPrefix}.${d}`] && (
                <span className="field-error">{errors[`${errorPrefix}.${d}`]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
