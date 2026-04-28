import { useMemo, useRef, useState } from 'react';
import type { Creatable, Marca, Periodo, Profesor, TipoMarca } from '../types';
import { descargarJson, importarJson } from '../storage/datastore';
import { formatFecha, formatHHmm } from '../utils/time';
import { buildNameMapping, parseMarcasExcel } from '../utils/excelImport';
import {
  construirPeriodo,
  detectarPeriodo,
  rangoFechasMarcas,
  type DeteccionPeriodo,
} from '../utils/periodo';
import { ImportPeriodoDialog, type ImportAction } from './ImportPeriodoDialog';

interface Props {
  profesores: Profesor[];
  marcas: Marca[];
  periodos: Periodo[];
  /** Tenant activo — null deshabilita la importación. */
  tenantId: string | null;
  onAdd: (m: Creatable<Marca>) => void;
  onAddMany: (m: Creatable<Marca>[]) => void;
  onRemove: (id: string) => void;
  onRemoveManyByRange: (fechaInicio: string, fechaFin: string) => void;
  onReplaceAll: (data: Marca[]) => void;
  onUpsertPeriodo: (p: Creatable<Periodo>) => void;
  onRemovePeriodo: (id: string) => void;
}

/** Estado pendiente de la importación (mientras el usuario decide en el diálogo). */
interface PendienteImport {
  marcas: Creatable<Marca>[];
  origen: string;
  deteccion: DeteccionPeriodo;
  unmatchedNames: string[];
}

const PAGE_SIZE = 50;

export function MarcasView({
  profesores,
  marcas,
  periodos,
  tenantId,
  onAdd,
  onAddMany,
  onRemove,
  onRemoveManyByRange,
  onReplaceAll,
  onUpsertPeriodo,
  onRemovePeriodo,
}: Props) {
  const [filtroPersona, setFiltroPersona] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [nuevoNombre, setNuevoNombre] = useState(profesores[0]?.nombre ?? '');
  const [nuevaFecha, setNuevaFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nuevaHora, setNuevaHora] = useState(() => new Date().toTimeString().slice(0, 5));
  const [nuevoTipo, setNuevoTipo] = useState<TipoMarca>('Entrada');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<PendienteImport | null>(null);
  const fileJsonRef = useRef<HTMLInputElement>(null);
  const fileExcelRef = useRef<HTMLInputElement>(null);

  // Unique list of people seen in marcas (used for dropdown, in case a marca's
  // name doesn't match a profesor yet)
  const personas = useMemo(() => {
    const set = new Set<string>();
    for (const p of profesores) set.add(p.nombre);
    for (const m of marcas) set.add(m.nombre);
    return [...set].sort();
  }, [profesores, marcas]);

  const filtradas = useMemo(() => {
    return marcas
      .filter((m) => (filtroPersona ? m.nombre === filtroPersona : true))
      .filter((m) => (filtroDesde ? m.fechaHora.slice(0, 10) >= filtroDesde : true))
      .filter((m) => (filtroHasta ? m.fechaHora.slice(0, 10) <= filtroHasta : true))
      .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  }, [marcas, filtroPersona, filtroDesde, filtroHasta]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * PAGE_SIZE;
  const fin = inicio + PAGE_SIZE;
  const pageItems = filtradas.slice(inicio, fin);

  // Reset page when filters change
  const filterKey = `${filtroPersona}|${filtroDesde}|${filtroHasta}`;
  const prevFilterKey = useRef(filterKey);
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (pagina !== 1) setPagina(1);
  }

  function limpiarFiltros() {
    setFiltroPersona('');
    setFiltroDesde('');
    setFiltroHasta('');
  }

  const hayFiltros = filtroPersona || filtroDesde || filtroHasta;

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!nuevoNombre || !nuevaFecha || !nuevaHora) return;
    onAdd({
      id: `m${Date.now()}`,
      nombre: nuevoNombre,
      fechaHora: `${nuevaFecha}T${nuevaHora}:00`,
      tipo: nuevoTipo,
    });
    setNuevaHora(new Date().toTimeString().slice(0, 5));
  }

  function handleImportJson(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    importarJson<Marca[]>(f)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Formato inválido');
        if (confirm(`Reemplazar ${marcas.length} marcas actuales con ${data.length} importadas?`)) {
          onReplaceAll(data);
        }
      })
      .catch((err) => alert(`Error al importar: ${err.message}`));
    ev.target.value = '';
  }

  async function handleImportExcel(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    ev.target.value = '';
    if (!tenantId) {
      alert('Selecciona una organización antes de importar marcas.');
      return;
    }

    setImportStatus('Procesando archivo Excel…');
    try {
      const result = await parseMarcasExcel(f);
      if (result.marcas.length === 0) {
        setImportStatus(null);
        alert('El archivo no contiene marcas reconocibles.');
        return;
      }

      // Mapeo de nombres del reloj a nombres registrados
      const registeredNames = profesores.map((p) => p.nombre);
      const nameMap = buildNameMapping(result.nombres, registeredNames);
      const unmatched = result.nombres.filter((n) => !nameMap.has(n));
      const mapped = result.marcas.map((m) => ({
        ...m,
        nombre: nameMap.get(m.nombre) ?? m.nombre,
      }));

      // Detección de periodo
      const rango = rangoFechasMarcas(mapped);
      if (!rango) {
        setImportStatus(null);
        alert('No fue posible determinar el rango de fechas del archivo.');
        return;
      }
      const deteccion = detectarPeriodo(rango, periodos);

      setPendiente({
        marcas: mapped,
        origen: f.name,
        deteccion,
        unmatchedNames: unmatched,
      });
      setImportStatus(null);
    } catch (err) {
      setImportStatus(null);
      alert(`Error al procesar el archivo Excel: ${(err as Error).message}`);
    }
  }

  /** Aplica la decisión del usuario sobre el periodo y registra las marcas. */
  function resolverImport(action: ImportAction) {
    if (!pendiente || !tenantId) {
      setPendiente(null);
      return;
    }
    if (action.tipo === 'cancelar') {
      setPendiente(null);
      setImportStatus('Importación cancelada.');
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    const { marcas: nuevasMarcas, origen, unmatchedNames } = pendiente;

    if (action.tipo === 'reemplazar') {
      const periodo = periodos.find((p) => p.id === action.periodoId);
      if (periodo) onRemoveManyByRange(periodo.fechaInicio, periodo.fechaFin);
    }

    onAddMany(nuevasMarcas);

    if (action.tipo === 'crear') {
      const nuevoPeriodo = construirPeriodo(tenantId, {
        nombre: action.nombre,
        fechaInicio: action.fechaInicio,
        fechaFin: action.fechaFin,
        marcasCount: nuevasMarcas.length,
        origen,
      });
      onUpsertPeriodo(nuevoPeriodo);
    } else {
      // Existente: actualiza marcasCount + extiende rango si aplica
      const periodo = periodos.find((p) => p.id === action.periodoId);
      if (periodo) {
        const nuevoCount =
          action.tipo === 'reemplazar' ? nuevasMarcas.length : periodo.marcasCount + nuevasMarcas.length;
        onUpsertPeriodo({
          ...periodo,
          marcasCount: nuevoCount,
          fechaInicio:
            pendiente.deteccion.rango.fechaInicio < periodo.fechaInicio
              ? pendiente.deteccion.rango.fechaInicio
              : periodo.fechaInicio,
          fechaFin:
            pendiente.deteccion.rango.fechaFin > periodo.fechaFin
              ? pendiente.deteccion.rango.fechaFin
              : periodo.fechaFin,
        });
      }
    }

    let msg = `${nuevasMarcas.length} marcas registradas`;
    if (action.tipo === 'crear') msg += ` en el nuevo periodo "${action.nombre}".`;
    else if (action.tipo === 'reemplazar') msg += ` (reemplazando las anteriores del periodo).`;
    else msg += ` (agregadas al periodo existente).`;
    if (unmatchedNames.length > 0) {
      msg += ` ${unmatchedNames.length} nombre(s) no coincidieron con Registro Personal.`;
    }
    setImportStatus(msg);
    setPendiente(null);
    setTimeout(() => setImportStatus(null), 6000);
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h2>Marcas del Reloj</h2>
          <p className="view-sub">{marcas.length.toLocaleString('es-CR')} registros almacenados</p>
        </div>
        <div className="view-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => fileExcelRef.current?.click()}
          >
            Importar desde Excel
          </button>
          <input
            ref={fileExcelRef}
            type="file"
            accept=".xls,.xlsx,.xlsm"
            onChange={handleImportExcel}
            hidden
          />
          <button className="btn btn-ghost" type="button" onClick={() => fileJsonRef.current?.click()}>
            Importar JSON
          </button>
          <input
            ref={fileJsonRef}
            type="file"
            accept="application/json"
            onChange={handleImportJson}
            hidden
          />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => descargarJson('marcas.json', marcas)}
          >
            Guardar JSON
          </button>
        </div>
      </header>

      {importStatus && (
        <div className="alert alert-info">{importStatus}</div>
      )}

      {pendiente && (
        <ImportPeriodoDialog
          deteccion={pendiente.deteccion}
          marcasCount={pendiente.marcas.length}
          origen={pendiente.origen}
          onResolve={resolverImport}
        />
      )}

      <PeriodosPanel
        periodos={periodos}
        onRemove={onRemovePeriodo}
        onFiltrar={(p) => {
          setFiltroDesde(p.fechaInicio);
          setFiltroHasta(p.fechaFin);
          setFiltroPersona('');
          setPagina(1);
        }}
      />

      <form className="form-card form-inline" onSubmit={handleSubmit}>
        <h3>Registrar marca manual</h3>
        <div className="form-grid form-grid-4">
          <label className="field">
            <span className="field-label">Funcionario</span>
            <select
              className="input"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              required
            >
              {profesores.map((p) => (
                <option key={p.id} value={p.nombre}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Fecha</span>
            <input
              type="date"
              className="input"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Hora</span>
            <input
              type="time"
              className="input"
              value={nuevaHora}
              onChange={(e) => setNuevaHora(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Tipo</span>
            <select
              className="input"
              value={nuevoTipo}
              onChange={(e) => setNuevoTipo(e.target.value as TipoMarca)}
            >
              <option value="Entrada">Entrada</option>
              <option value="Salida">Salida</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Agregar marca</button>
        </div>
      </form>

      <div className="filters">
        <label className="field">
          <span className="field-label">Persona</span>
          <select
            className="input"
            value={filtroPersona}
            onChange={(e) => setFiltroPersona(e.target.value)}
          >
            <option value="">— Todas —</option>
            {personas.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Desde</span>
          <input
            type="date"
            className="input"
            value={filtroDesde}
            onChange={(e) => setFiltroDesde(e.target.value)}
            max={filtroHasta || undefined}
          />
        </label>
        <label className="field">
          <span className="field-label">Hasta</span>
          <input
            type="date"
            className="input"
            value={filtroHasta}
            onChange={(e) => setFiltroHasta(e.target.value)}
            min={filtroDesde || undefined}
          />
        </label>
        {hayFiltros && (
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Funcionario</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Tipo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr><td colSpan={5} className="empty">Sin marcas que coincidan con el filtro</td></tr>
            )}
            {pageItems.map((m) => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>{formatFecha(m.fechaHora)}</td>
                <td>{formatHHmm(m.fechaHora)}</td>
                <td>
                  <span className={`badge ${m.tipo === 'Entrada' ? 'badge-ok' : 'badge-info'}`}>
                    {m.tipo}
                  </span>
                </td>
                <td className="col-actions">
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() => {
                      if (confirm('Eliminar esta marca?')) onRemove(m.id);
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtradas.length > 0 && (
          <Paginacion
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            total={filtradas.length}
            desde={inicio + 1}
            hasta={Math.min(fin, filtradas.length)}
            onChange={setPagina}
          />
        )}
      </div>
    </section>
  );
}

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  desde: number;
  hasta: number;
  onChange: (p: number) => void;
}

function Paginacion({ pagina, totalPaginas, total, desde, hasta, onChange }: PaginacionProps) {
  const esPrimera = pagina <= 1;
  const esUltima = pagina >= totalPaginas;

  return (
    <div className="paginacion">
      <span className="paginacion-info">
        Mostrando <strong>{desde.toLocaleString('es-CR')}</strong>–
        <strong>{hasta.toLocaleString('es-CR')}</strong> de{' '}
        <strong>{total.toLocaleString('es-CR')}</strong>
      </span>
      <div className="paginacion-controls">
        <button
          type="button"
          className="btn-icon"
          disabled={esPrimera}
          onClick={() => onChange(1)}
          aria-label="Primera página"
        >
          «
        </button>
        <button
          type="button"
          className="btn-icon"
          disabled={esPrimera}
          onClick={() => onChange(pagina - 1)}
          aria-label="Página anterior"
        >
          ‹
        </button>
        <span className="paginacion-page">
          Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
        </span>
        <button
          type="button"
          className="btn-icon"
          disabled={esUltima}
          onClick={() => onChange(pagina + 1)}
          aria-label="Página siguiente"
        >
          ›
        </button>
        <button
          type="button"
          className="btn-icon"
          disabled={esUltima}
          onClick={() => onChange(totalPaginas)}
          aria-label="Última página"
        >
          »
        </button>
      </div>
    </div>
  );
}

/* ===== Periodos registrados ===== */
interface PeriodosPanelProps {
  periodos: Periodo[];
  onRemove: (id: string) => void;
  onFiltrar: (p: Periodo) => void;
}

function PeriodosPanel({ periodos, onRemove, onFiltrar }: PeriodosPanelProps) {
  if (periodos.length === 0) {
    return (
      <div className="periodos-panel periodos-empty">
        <h3>Periodos registrados</h3>
        <p className="view-sub">
          Aún no hay periodos. Al importar marcas desde Excel se detectará el rango y
          podrás registrar el periodo correspondiente.
        </p>
      </div>
    );
  }
  return (
    <div className="periodos-panel">
      <h3>Periodos registrados ({periodos.length})</h3>
      <ul className="periodos-list">
        {periodos.map((p) => (
          <li key={p.id} className="periodo-chip">
            <div className="periodo-chip-main">
              <strong>{p.nombre}</strong>
              <span className="periodo-chip-sub">
                {fmtFecha(p.fechaInicio)} – {fmtFecha(p.fechaFin)} ·{' '}
                {p.marcasCount.toLocaleString('es-CR')} marcas
                {p.origen ? ` · ${p.origen}` : ''}
              </span>
            </div>
            <div className="periodo-chip-actions">
              <button
                type="button"
                className="btn-icon"
                onClick={() => onFiltrar(p)}
                title="Filtrar marcas por este periodo"
              >
                Filtrar
              </button>
              <button
                type="button"
                className="btn-icon danger"
                onClick={() => {
                  if (confirm(`¿Eliminar el registro del periodo "${p.nombre}"? Las marcas no se borran, solo el periodo.`)) {
                    onRemove(p.id);
                  }
                }}
                title="Borrar el registro del periodo (no afecta marcas)"
              >
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmtFecha(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
