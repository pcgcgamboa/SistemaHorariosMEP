import { useMemo, useRef, useState } from 'react';
import type { Creatable, Profesor } from '../types';
import { DIAS_LABEL, DIAS_SEMANA } from '../types';
import { descargarJson, importarJson } from '../storage/datastore';
import { getHorarioForDate } from '../utils/profesor';
import { toIsoDate } from '../utils/time';
import { ProfesorForm } from './ProfesorForm';

interface Props {
  profesores: Profesor[];
  onUpsert: (p: Creatable<Profesor>) => void;
  onRemove: (id: string) => void;
  onReplaceAll: (data: Profesor[]) => void;
}

export function ProfesoresView({ profesores, onUpsert, onRemove, onReplaceAll }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Profesor | null>(null);
  const [creando, setCreando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hoyIso = toIsoDate(new Date());

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const data = q
      ? profesores.filter(
          (p) =>
            p.nombre.toLowerCase().includes(q) ||
            p.cargo.toLowerCase().includes(q),
        )
      : profesores;
    return [...data].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [profesores, busqueda]);

  function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    importarJson<Profesor[]>(f)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Formato inválido');
        if (
          confirm(
            `Reemplazar ${profesores.length} profesores actuales con ${data.length} importados?`,
          )
        ) {
          onReplaceAll(data);
        }
      })
      .catch((err) => alert(`Error al importar: ${err.message}`));
    ev.target.value = '';
  }

  if (creando || editando) {
    return (
      <ProfesorForm
        profesor={editando}
        onCancel={() => {
          setCreando(false);
          setEditando(null);
        }}
        onSave={(p) => {
          onUpsert(p);
          setCreando(false);
          setEditando(null);
        }}
      />
    );
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h2>Horario de Profesores</h2>
          <p className="view-sub">{profesores.length} funcionarios registrados</p>
        </div>
        <div className="view-actions">
          <button className="btn btn-ghost" type="button" onClick={() => fileRef.current?.click()}>
            Importar JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            hidden
          />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => descargarJson('profesores.json', profesores)}
          >
            Guardar JSON
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setCreando(true)}>
            + Nuevo profesor
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="input-search"
          placeholder="Buscar por nombre o cargo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar profesor"
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cargo</th>
              <th>Horarios</th>
              {DIAS_SEMANA.map((d) => (
                <th key={d} className="col-dia">{DIAS_LABEL[d].slice(0, 3)}</th>
              ))}
              <th aria-label="Acciones"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4 + DIAS_SEMANA.length} className="empty">
                  No se encontraron profesores
                </td>
              </tr>
            )}
            {filtrados.map((p) => {
              const horarioActivo = getHorarioForDate(p, hoyIso) ?? p.horarios[0]?.horario ?? null;
              const periodos = p.horarios.filter((h) => h.fechaInicio && h.fechaFin);
              const tienePermanente = p.horarios.some((h) => !h.fechaInicio && !h.fechaFin);
              return (
              <tr key={p.id}>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setEditando(p)}
                    title="Editar"
                  >
                    {p.nombre}
                  </button>
                </td>
                <td className="muted">{p.cargo}</td>
                <td>
                  <div className="horarios-summary">
                    {tienePermanente && (
                      <span className="badge badge-ok" title="Horario permanente">Permanente</span>
                    )}
                    {periodos.length > 0 && (
                      <span className="badge badge-info" title={periodos.map((h) => `${h.fechaInicio} → ${h.fechaFin}`).join('\n')}>
                        {periodos.length} {periodos.length === 1 ? 'periodo' : 'periodos'}
                      </span>
                    )}
                    {!tienePermanente && periodos.length === 0 && (
                      <span className="badge badge-muted">Sin horario</span>
                    )}
                  </div>
                </td>
                {DIAS_SEMANA.map((d) => {
                  const h = horarioActivo?.[d];
                  return (
                    <td key={d} className="col-dia">
                      {h ? (
                        <span className="cell-rango">
                          <span>{h.entrada}</span>
                          <span className="sep">–</span>
                          <span>{h.salida}</span>
                        </span>
                      ) : (
                        <span className="badge badge-libre">Libre</span>
                      )}
                    </td>
                  );
                })}
                <td className="col-actions">
                  <button
                    className="btn-icon"
                    type="button"
                    onClick={() => setEditando(p)}
                    aria-label={`Editar ${p.nombre}`}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-icon danger"
                    type="button"
                    onClick={() => {
                      if (confirm(`Eliminar a ${p.nombre}?`)) onRemove(p.id);
                    }}
                    aria-label={`Eliminar ${p.nombre}`}
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
