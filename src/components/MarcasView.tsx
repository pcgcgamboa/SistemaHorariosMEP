import { useMemo, useRef, useState } from 'react';
import type { Creatable, Marca, Periodo, Profesor, TipoMarca } from '../types';
import { descargarJson, importarJson } from '../storage/datastore';
import { formatFecha, formatHHmm } from '../utils/time';
import { buildNameMapping, parseMarcasExcel } from '../utils/excelImport';
import { horarioPorDefecto } from '../utils/profesor';
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
  onReassignByNombre: (nombreOrigen: string, nombreDestino: string) => void;
  onReplaceAll: (data: Marca[]) => void;
  onUpsertPeriodo: (p: Creatable<Periodo>) => void;
  onRemovePeriodo: (id: string) => void;
  onUpsertProfesor: (p: Creatable<Profesor>) => void;
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
  onReassignByNombre,
  onReplaceAll,
  onUpsertPeriodo,
  onRemovePeriodo,
  onUpsertProfesor,
}: Props) {
  // Filtros: dos copias por campo
  //   - draft*: lo que el usuario está editando en la toolbar
  //   - filtro*: lo que efectivamente se aplica a la lista (solo al pulsar Buscar)
  const [draftPersona, setDraftPersona] = useState('');
  const [draftDesde, setDraftDesde] = useState('');
  const [draftHasta, setDraftHasta] = useState('');
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
  const [mover, setMover] = useState<{ nombreOrigen: string } | null>(null);
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
    const q = filtroPersona.trim().toLowerCase();
    return marcas
      .filter((m) => (q ? m.nombre.toLowerCase().includes(q) : true))
      .filter((m) => (filtroDesde ? m.fechaHora.slice(0, 10) >= filtroDesde : true))
      .filter((m) => (filtroHasta ? m.fechaHora.slice(0, 10) <= filtroHasta : true))
      // Orden ascendente: marca más antigua primero.
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
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

  const [haBuscado, setHaBuscado] = useState(false);

  function buscar(ev?: React.FormEvent) {
    if (ev) ev.preventDefault();
    setFiltroPersona(draftPersona.trim());
    setFiltroDesde(draftDesde);
    setFiltroHasta(draftHasta);
    setPagina(1);
    setHaBuscado(true);
  }

  function limpiarFiltros() {
    setDraftPersona('');
    setDraftDesde('');
    setDraftHasta('');
    setFiltroPersona('');
    setFiltroDesde('');
    setFiltroHasta('');
    setPagina(1);
    setHaBuscado(false);
  }

  const hayFiltros = filtroPersona || filtroDesde || filtroHasta;
  const hayDraft = draftPersona || draftDesde || draftHasta;

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

      // Auto-crea colaboradores para los nombres no reconocidos, con un
      // horario por defecto (L–V 07:00–16:10). El usuario los puede editar
      // luego desde "Horario de Colaboradores".
      const creados: string[] = [];
      for (const nombre of unmatched) {
        const id = `p${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        onUpsertProfesor({
          id,
          nombre,
          cargo: '',
          horarios: [
            {
              id: `h${id}`,
              fechaInicio: null,
              fechaFin: null,
              horario: horarioPorDefecto(),
            },
          ],
        });
        creados.push(nombre);
      }
      // Los nombres recién creados se "auto-mapean" a sí mismos.
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
        unmatchedNames: creados,
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
      msg += ` Se crearon ${unmatchedNames.length} colaborador(es) nuevos con horario por defecto: ${unmatchedNames.join(', ')}.`;
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

      {mover && (
        <MoverMarcasDialog
          profesores={profesores}
          nombreOrigen={mover.nombreOrigen}
          cantidad={marcas.filter((m) => m.nombre === mover.nombreOrigen).length}
          onCancel={() => setMover(null)}
          onConfirm={(nombreDestino) => {
            onReassignByNombre(mover.nombreOrigen, nombreDestino);
            setMover(null);
            setImportStatus(`Marcas movidas de "${mover.nombreOrigen}" a "${nombreDestino}".`);
            setTimeout(() => setImportStatus(null), 4000);
          }}
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
            <span className="field-label">Colaborador</span>
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

      <form className="filters" onSubmit={buscar}>
        <label className="field">
          <span className="field-label">Colaborador</span>
          <input
            type="search"
            className="input"
            list="marcas-colaboradores-list"
            placeholder="Nombre completo o parcial…"
            value={draftPersona}
            onChange={(e) => setDraftPersona(e.target.value)}
          />
          <datalist id="marcas-colaboradores-list">
            {personas.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">Desde</span>
          <input
            type="date"
            className="input"
            value={draftDesde}
            onChange={(e) => setDraftDesde(e.target.value)}
            max={draftHasta || undefined}
          />
        </label>
        <label className="field">
          <span className="field-label">Hasta</span>
          <input
            type="date"
            className="input"
            value={draftHasta}
            onChange={(e) => setDraftHasta(e.target.value)}
            min={draftDesde || undefined}
          />
        </label>
        <div className="field" style={{ justifyContent: 'flex-end', flexDirection: 'row', gap: 8 }}>
          <button type="submit" className="btn btn-primary">
            Buscar
          </button>
          {(hayFiltros || hayDraft) && (
            <button type="button" className="btn btn-ghost" onClick={limpiarFiltros}>
              Limpiar
            </button>
          )}
        </div>
      </form>

      {haBuscado && (
        <div className="filtros-aplicados">
          Resultados: <strong>{filtradas.length.toLocaleString('es-CR')}</strong> marca{filtradas.length === 1 ? '' : 's'}
          {' · '}
          {filtroPersona ? <>colaborador contiene <code>{filtroPersona}</code></> : <>todos los colaboradores</>}
          {' · '}
          {filtroDesde || filtroHasta ? (
            <>
              {filtroDesde ? <>desde {filtroDesde}</> : <>sin fecha inicial</>}
              {' · '}
              {filtroHasta ? <>hasta {filtroHasta}</> : <>sin fecha final</>}
            </>
          ) : (
            <>todas las fechas</>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Colaborador</th>
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
                    className="btn-icon"
                    onClick={() => setMover({ nombreOrigen: m.nombre })}
                    title="Mover todas las marcas de este colaborador a otro"
                  >
                    Mover…
                  </button>
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

interface MoverMarcasDialogProps {
  profesores: Profesor[];
  nombreOrigen: string;
  cantidad: number;
  onCancel: () => void;
  onConfirm: (nombreDestino: string) => void;
}

function MoverMarcasDialog({
  profesores,
  nombreOrigen,
  cantidad,
  onCancel,
  onConfirm,
}: MoverMarcasDialogProps) {
  const candidatos = useMemo(
    () => profesores.filter((p) => p.nombre !== nombreOrigen).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profesores, nombreOrigen],
  );
  const [destino, setDestino] = useState(candidatos[0]?.nombre ?? '');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-header">
          <h3>Mover marcas a otro colaborador</h3>
        </header>
        <div className="modal-body">
          <p className="modal-lead">
            Se moverán las <strong>{cantidad}</strong> marca{cantidad === 1 ? '' : 's'} de{' '}
            <strong>{nombreOrigen}</strong> al colaborador seleccionado.
          </p>
          {candidatos.length === 0 ? (
            <p className="field-error">No hay otros colaboradores registrados.</p>
          ) : (
            <label className="field">
              <span className="field-label">Colaborador destino</span>
              <select
                className="input"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              >
                {candidatos.map((p) => (
                  <option key={p.id} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <footer className="modal-footer" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!destino}
            onClick={() => destino && onConfirm(destino)}
          >
            Mover marcas
          </button>
        </footer>
      </div>
    </div>
  );
}
