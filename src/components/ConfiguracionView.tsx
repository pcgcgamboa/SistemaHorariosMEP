import { useRef, useState } from 'react';
import type { Configuracion, Creatable, DiaSemana, Excepcion } from '../types';
import { DIAS_LABEL, DIAS_SEMANA } from '../types';
import { descargarJson, importarJson } from '../storage/datastore';
import { formatFecha } from '../utils/time';

interface Props {
  config: Configuracion;
  onUpdateConfig: (patch: Partial<Configuracion>) => void;
  excepciones: Excepcion[];
  onUpsertExcepcion: (e: Creatable<Excepcion>) => void;
  onRemoveExcepcion: (id: string) => void;
  onReplaceExcepciones: (data: Excepcion[]) => void;
}

export function ConfiguracionView({
  config,
  onUpdateConfig,
  excepciones,
  onUpsertExcepcion,
  onRemoveExcepcion,
  onReplaceExcepciones,
}: Props) {
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h2>Configuración</h2>
          <p className="view-sub">Parámetros generales de la herramienta</p>
        </div>
      </header>

      <InstitucionSection config={config} onUpdate={onUpdateConfig} />
      <ToleranciaSection config={config} onUpdate={onUpdateConfig} />
      <DiasLaboralesSection config={config} onUpdate={onUpdateConfig} />
      <EtiquetasSection config={config} onUpdate={onUpdateConfig} />
      <ExcepcionesSection
        excepciones={excepciones}
        onUpsert={onUpsertExcepcion}
        onRemove={onRemoveExcepcion}
        onReplaceAll={onReplaceExcepciones}
      />
    </section>
  );
}

/* ===== Institución ===== */
function InstitucionSection({ config, onUpdate }: { config: Configuracion; onUpdate: (p: Partial<Configuracion>) => void }) {
  return (
    <div className="form-card">
      <h3>Datos de la institución</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Nombre de la institución</span>
          <input
            type="text"
            value={config.institucion}
            onChange={(e) => onUpdate({ institucion: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Circuito</span>
          <input
            type="text"
            value={config.circuito}
            onChange={(e) => onUpdate({ circuito: e.target.value })}
          />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Dirección Regional</span>
        <input
          type="text"
          value={config.direccionRegional}
          onChange={(e) => onUpdate({ direccionRegional: e.target.value })}
        />
      </label>
    </div>
  );
}

/* ===== Tolerancias ===== */
function ToleranciaSection({ config, onUpdate }: { config: Configuracion; onUpdate: (p: Partial<Configuracion>) => void }) {
  function setTol(key: 'entradaMin' | 'salidaMin', val: string) {
    const n = Math.max(0, parseInt(val, 10) || 0);
    onUpdate({ tolerancia: { ...config.tolerancia, [key]: n } });
  }
  return (
    <div className="form-card">
      <h3>Tiempo perdonado</h3>
      <p className="view-sub" style={{ marginBottom: 12 }}>
        Minutos de tolerancia que no generan incidencia. Equivale a la configuración E8/F8 del Excel.
      </p>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Entrada (minutos)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={config.tolerancia.entradaMin}
            onChange={(e) => setTol('entradaMin', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Salida (minutos)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={config.tolerancia.salidaMin}
            onChange={(e) => setTol('salidaMin', e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/* ===== Días laborales ===== */
function DiasLaboralesSection({ config, onUpdate }: { config: Configuracion; onUpdate: (p: Partial<Configuracion>) => void }) {
  function toggle(dia: DiaSemana) {
    const current = config.diasLaborales;
    const next = current.includes(dia) ? current.filter((d) => d !== dia) : [...current, dia];
    onUpdate({ diasLaborales: next });
  }
  return (
    <div className="form-card">
      <h3>Días laborales de la semana</h3>
      <div className="dias-grid">
        {DIAS_SEMANA.map((d) => (
          <label key={d} className="dia-check">
            <input
              type="checkbox"
              checked={config.diasLaborales.includes(d)}
              onChange={() => toggle(d)}
            />
            <span>{DIAS_LABEL[d]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ===== Etiquetas ===== */
function EtiquetasSection({ config, onUpdate }: { config: Configuracion; onUpdate: (p: Partial<Configuracion>) => void }) {
  function setLabel(key: keyof Configuracion['etiquetas'], val: string) {
    onUpdate({ etiquetas: { ...config.etiquetas, [key]: val } });
  }
  return (
    <div className="form-card">
      <h3>Etiquetas de incidencia</h3>
      <p className="view-sub" style={{ marginBottom: 12 }}>
        Texto que se muestra en la columna de observaciones del reporte.
      </p>
      <div className="form-grid cfg-3col">
        <label className="field">
          <span className="field-label">Entrada tardía</span>
          <input
            type="text"
            value={config.etiquetas.entradaTardia}
            onChange={(e) => setLabel('entradaTardia', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Omisión de marca</span>
          <input
            type="text"
            value={config.etiquetas.omisionMarca}
            onChange={(e) => setLabel('omisionMarca', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Salida anticipada</span>
          <input
            type="text"
            value={config.etiquetas.salidaAnticipada}
            onChange={(e) => setLabel('salidaAnticipada', e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/* ===== Excepciones (Feriados, Vacaciones, etc.) ===== */
function ExcepcionesSection({
  excepciones,
  onUpsert,
  onRemove,
  onReplaceAll,
}: {
  excepciones: Excepcion[];
  onUpsert: (e: Creatable<Excepcion>) => void;
  onRemove: (id: string) => void;
  onReplaceAll: (data: Excepcion[]) => void;
}) {
  const [nombre, setNombre] = useState('FERIADO');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [editando, setEditando] = useState<Excepcion | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!nombre.trim() || !fechaInicio) return;
    const fin = fechaFin || fechaInicio;
    if (editando) {
      onUpsert({ ...editando, nombre: nombre.trim().toUpperCase(), fechaInicio, fechaFin: fin });
      setEditando(null);
    } else {
      onUpsert({
        id: `e${Date.now()}`,
        nombre: nombre.trim().toUpperCase(),
        fechaInicio,
        fechaFin: fin,
      });
    }
    setNombre('FERIADO');
    setFechaInicio('');
    setFechaFin('');
  }

  function startEdit(e: Excepcion) {
    setEditando(e);
    setNombre(e.nombre);
    setFechaInicio(e.fechaInicio);
    setFechaFin(e.fechaFin);
  }

  function cancelEdit() {
    setEditando(null);
    setNombre('FERIADO');
    setFechaInicio('');
    setFechaFin('');
  }

  function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    importarJson<Excepcion[]>(f)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Formato inválido');
        if (confirm(`Reemplazar ${excepciones.length} excepciones con ${data.length} importadas?`)) {
          onReplaceAll(data);
        }
      })
      .catch((err) => alert(`Error al importar: ${err.message}`));
    ev.target.value = '';
  }

  const sorted = [...excepciones].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));

  return (
    <div className="form-card">
      <div className="form-section-header">
        <h3>Excepciones (Feriados, Vacaciones, etc.)</h3>
        <div className="view-actions">
          <button className="btn btn-ghost" type="button" onClick={() => fileRef.current?.click()}>
            Importar JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json" onChange={handleImport} hidden />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => descargarJson('excepciones.json', excepciones)}
          >
            Guardar JSON
          </button>
        </div>
      </div>

      <p className="view-sub" style={{ marginBottom: 12 }}>
        Las fechas dentro de una excepción se excluyen del cálculo de asistencia (no generan incidencias).
      </p>

      <form className="form-inline exc-form" onSubmit={handleSubmit}>
        <div className="form-grid cfg-4col">
          <label className="field">
            <span className="field-label">Nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="FERIADO, VACACIONES…"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Fecha inicio</span>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => { setFechaInicio(e.target.value); if (!fechaFin) setFechaFin(e.target.value); }}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Fecha fin</span>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              min={fechaInicio}
            />
          </label>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            {editando && (
              <button type="button" className="btn btn-secondary" onClick={cancelEdit} style={{ marginBottom: 4 }}>
                Cancelar
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editando ? 'Actualizar' : 'Agregar'}
            </button>
          </div>
        </div>
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Fecha inicio</th>
              <th>Fecha fin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="empty">No hay excepciones registradas</td></tr>
            )}
            {sorted.map((e) => (
              <tr key={e.id}>
                <td>{e.nombre}</td>
                <td>{formatFecha(e.fechaInicio)}</td>
                <td>{formatFecha(e.fechaFin)}</td>
                <td className="col-actions">
                  <button type="button" className="btn-icon" onClick={() => startEdit(e)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() => { if (confirm(`Eliminar "${e.nombre}"?`)) onRemove(e.id); }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
