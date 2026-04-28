import { useMemo, useState } from 'react';
import type { Organizacion, Profesor, Marca } from '../../types';
import { OrganizacionForm } from './OrganizacionForm';

interface Props {
  organizaciones: Organizacion[];
  profesores: Profesor[];
  marcas: Marca[];
  onCrear: (data: Omit<Organizacion, 'id' | 'creadaEn' | 'actualizadaEn'>) => void;
  onActualizar: (id: string, patch: Partial<Omit<Organizacion, 'id' | 'creadaEn'>>) => void;
  onEliminar: (id: string) => void;
}

export function OrganizacionesView({
  organizaciones,
  profesores,
  marcas,
  onCrear,
  onActualizar,
  onEliminar,
}: Props) {
  const [modo, setModo] = useState<'lista' | 'crear' | 'editar'>('lista');
  const [editando, setEditando] = useState<Organizacion | null>(null);
  const [filtro, setFiltro] = useState('');

  // Conteos por organización: muestra el "peso" de datos antes de eliminar.
  const conteos = useMemo(() => {
    const m = new Map<string, { profesores: number; marcas: number }>();
    for (const p of profesores) {
      const c = m.get(p.organizacionId) ?? { profesores: 0, marcas: 0 };
      c.profesores++;
      m.set(p.organizacionId, c);
    }
    for (const ma of marcas) {
      const c = m.get(ma.organizacionId) ?? { profesores: 0, marcas: 0 };
      c.marcas++;
      m.set(ma.organizacionId, c);
    }
    return m;
  }, [profesores, marcas]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return organizaciones;
    return organizaciones.filter(
      (o) =>
        o.nombre.toLowerCase().includes(q) ||
        o.codigo.toLowerCase().includes(q) ||
        o.direccionRegional.toLowerCase().includes(q),
    );
  }, [organizaciones, filtro]);

  function handleEliminar(o: Organizacion) {
    const c = conteos.get(o.id);
    if (c && (c.profesores > 0 || c.marcas > 0)) {
      alert(
        `No se puede eliminar "${o.nombre}": tiene ${c.profesores} profesores y ${c.marcas} marcas asociadas. Primero migre o elimine sus datos.`,
      );
      return;
    }
    if (!confirm(`¿Eliminar la organización "${o.nombre}"? Esta acción no se puede deshacer.`)) return;
    onEliminar(o.id);
  }

  function handleSubmit(data: Omit<Organizacion, 'id' | 'creadaEn' | 'actualizadaEn'>) {
    // Unicidad de código.
    const conflicto = organizaciones.find(
      (o) => o.codigo === data.codigo && o.id !== editando?.id,
    );
    if (conflicto) {
      alert(`El código "${data.codigo}" ya está en uso por "${conflicto.nombre}".`);
      return;
    }
    if (modo === 'editar' && editando) {
      onActualizar(editando.id, data);
    } else {
      onCrear(data);
    }
    setModo('lista');
    setEditando(null);
  }

  if (modo !== 'lista') {
    return (
      <section className="view">
        <header className="view-header">
          <div>
            <h2>Organizaciones</h2>
            <p className="view-sub">{modo === 'editar' ? 'Editando organización' : 'Creando nueva organización'}</p>
          </div>
        </header>
        <OrganizacionForm
          initial={editando}
          onSubmit={handleSubmit}
          onCancel={() => {
            setModo('lista');
            setEditando(null);
          }}
        />
      </section>
    );
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h2>Organizaciones</h2>
          <p className="view-sub">
            Administre todos los tenants del sistema. {organizaciones.length} en total.
          </p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-primary" onClick={() => setModo('crear')}>
            + Nueva organización
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="input-search"
          type="search"
          placeholder="Buscar por nombre, código o regional…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Regional</th>
              <th>Circuito</th>
              <th>Estado</th>
              <th>Datos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
                  No hay organizaciones que coincidan.
                </td>
              </tr>
            )}
            {filtradas.map((o) => {
              const c = conteos.get(o.id);
              return (
                <tr key={o.id}>
                  <td><code>{o.codigo}</code></td>
                  <td>{o.nombre}</td>
                  <td>{o.direccionRegional || '—'}</td>
                  <td>{o.circuito || '—'}</td>
                  <td>
                    <span className={`badge ${o.activa ? 'badge-ok' : 'badge-warn'}`}>
                      {o.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    {c ? `${c.profesores} prof. · ${c.marcas} marcas` : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => {
                        setEditando(o);
                        setModo('editar');
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn-icon danger"
                      onClick={() => handleEliminar(o)}
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
