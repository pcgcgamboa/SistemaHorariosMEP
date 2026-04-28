import { useEffect, useMemo, useState } from 'react';
import type {
  DiaSemana,
  Excepcion,
  Incidente,
  Periodo,
  Profesor,
  TipoIncidente,
} from '../../types';
import { DIAS_LABEL, INCIDENTE_BY_TIPO, INCIDENTE_CATALOGO } from '../../types';
import { IncidenteEditor } from './IncidenteEditor';

interface Props {
  profesores: Profesor[];
  incidentes: Incidente[];
  excepciones: Excepcion[];
  periodos: Periodo[];
  onSetIncidente: (
    profesorId: string,
    fecha: string,
    tipo: TipoIncidente | null,
    descripcion?: string,
  ) => void;
}

interface CellSelection {
  profesor: Profesor;
  fecha: string;
  actual: Incidente | null;
}

/**
 * Reporte mensual consolidado: pivot funcionarios × días con visualización
 * de incidentes por celda y excepciones (feriados) en la cabecera del día.
 *
 * Filtros: mes/año (manual o desde un Periodo registrado), búsqueda por
 * funcionario, filtro por tipo de incidente.
 */
export function ReporteMensualView({
  profesores,
  incidentes,
  excepciones,
  periodos,
  onSetIncidente,
}: Props) {
  const hoy = new Date();
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth() + 1); // 1..12
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | TipoIncidente>('TODOS');
  const [seleccion, setSeleccion] = useState<CellSelection | null>(null);

  // Si hay periodos registrados, ofrecer seleccionarlos como atajo.
  const periodoSeleccionado = useMemo(
    () => periodos.find((p) => mesDe(p.fechaInicio) === `${year}-${pad2(month)}`) ?? null,
    [periodos, year, month],
  );

  const diasMes = diasEnMes(year, month);
  const fechasDelMes = useMemo(
    () => Array.from({ length: diasMes }, (_, i) => `${year}-${pad2(month)}-${pad2(i + 1)}`),
    [year, month, diasMes],
  );

  const profesoresFiltrados = useMemo(() => {
    const q = filtroNombre.trim().toLowerCase();
    return profesores
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .filter((p) => !q || p.nombre.toLowerCase().includes(q));
  }, [profesores, filtroNombre]);

  // Mapa rápido (profesorId|fecha) → Incidente
  const incidentesMap = useMemo(() => {
    const m = new Map<string, Incidente>();
    for (const i of incidentes) {
      if (i.fecha.slice(0, 7) === `${year}-${pad2(month)}`) {
        m.set(`${i.profesorId}|${i.fecha}`, i);
      }
    }
    return m;
  }, [incidentes, year, month]);

  // Excepciones aplicables al mes (intersectan con el rango)
  const excepcionesMes = useMemo(() => {
    const inicioMes = `${year}-${pad2(month)}-01`;
    const finMes = `${year}-${pad2(month)}-${pad2(diasMes)}`;
    return excepciones.filter((e) => !(e.fechaFin < inicioMes || e.fechaInicio > finMes));
  }, [excepciones, year, month, diasMes]);

  // Set de fechas con excepción
  const fechasExcepcion = useMemo(() => {
    const set = new Map<string, Excepcion>();
    for (const e of excepcionesMes) {
      let d = e.fechaInicio;
      while (d <= e.fechaFin) {
        if (d.slice(0, 7) === `${year}-${pad2(month)}`) set.set(d, e);
        d = nextDay(d);
      }
    }
    return set;
  }, [excepcionesMes, year, month]);

  // Resumen por funcionario: conteo por tipo
  const resumen = useMemo(() => {
    const out = new Map<string, Record<TipoIncidente, number>>();
    for (const p of profesoresFiltrados) {
      const counts = INCIDENTE_CATALOGO.reduce((acc, c) => {
        acc[c.tipo] = 0;
        return acc;
      }, {} as Record<TipoIncidente, number>);
      out.set(p.id, counts);
    }
    for (const [, inc] of incidentesMap) {
      const counts = out.get(inc.profesorId);
      if (counts) counts[inc.tipo] = (counts[inc.tipo] ?? 0) + 1;
    }
    return out;
  }, [profesoresFiltrados, incidentesMap]);

  function handleSelectCell(profesor: Profesor, fecha: string) {
    const actual = incidentesMap.get(`${profesor.id}|${fecha}`) ?? null;
    setSeleccion({ profesor, fecha, actual });
  }

  function handleSubmit(tipo: TipoIncidente, descripcion?: string) {
    if (!seleccion) return;
    onSetIncidente(seleccion.profesor.id, seleccion.fecha, tipo, descripcion);
    setSeleccion(null);
  }

  function handleClear() {
    if (!seleccion) return;
    onSetIncidente(seleccion.profesor.id, seleccion.fecha, null);
    setSeleccion(null);
  }

  // Cuando cambia el periodo seleccionado, sincroniza año/mes.
  useEffect(() => {
    if (periodoSeleccionado) {
      const [y, m] = periodoSeleccionado.fechaInicio.split('-').map(Number);
      if (y !== year) setYear(y);
      if (m !== month) setMonth(m);
    }
    // intencional: solo correr al elegir manualmente desde el select
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h2>Reporte Mensual</h2>
          <p className="view-sub">
            Estado consolidado de funcionarios — incidentes y eventos por día.
          </p>
        </div>
      </header>

      <div className="toolbar reporte-toolbar">
        <label className="field field-inline">
          <span>Mes</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{NOMBRE_MES[m - 1]}</option>
            ))}
          </select>
        </label>
        <label className="field field-inline">
          <span>Año</span>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: 90 }}
            min={2000}
            max={2100}
          />
        </label>
        {periodos.length > 0 && (
          <label className="field field-inline">
            <span>Periodo registrado</span>
            <select
              value={periodoSeleccionado?.id ?? ''}
              onChange={(e) => {
                const p = periodos.find((x) => x.id === e.target.value);
                if (p) {
                  const [y, m] = p.fechaInicio.split('-').map(Number);
                  setYear(y);
                  setMonth(m);
                }
              }}
            >
              <option value="">— Manual —</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
        )}
        <input
          className="input-search"
          type="search"
          placeholder="Buscar funcionario…"
          value={filtroNombre}
          onChange={(e) => setFiltroNombre(e.target.value)}
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as 'TODOS' | TipoIncidente)}
        >
          <option value="TODOS">Todos los tipos</option>
          {INCIDENTE_CATALOGO.map((c) => (
            <option key={c.tipo} value={c.tipo}>{c.label}</option>
          ))}
        </select>
      </div>

      <Leyenda />

      <div className="reporte-grid-wrap">
        <table className="reporte-grid">
          <thead>
            <tr>
              <th className="reporte-col-nombre">Funcionario</th>
              {fechasDelMes.map((f) => {
                const dow = diaSemana(f);
                const exc = fechasExcepcion.get(f);
                const esFinde = dow === 'sabado' || dow === 'domingo';
                return (
                  <th
                    key={f}
                    className={`reporte-col-dia ${esFinde ? 'is-finde' : ''} ${exc ? 'is-exc' : ''}`}
                    title={exc ? `${exc.nombre} — ${DIAS_LABEL[dow]}` : DIAS_LABEL[dow]}
                  >
                    <div className="dia-num">{Number(f.slice(8, 10))}</div>
                    <div className="dia-dow">{abreviado(dow)}</div>
                  </th>
                );
              })}
              <th className="reporte-col-total" title="Total de incidentes en el mes">∑</th>
            </tr>
          </thead>
          <tbody>
            {profesoresFiltrados.map((p) => {
              const counts = resumen.get(p.id);
              const totalMes = counts
                ? Object.values(counts).reduce((a, b) => a + b, 0)
                : 0;
              return (
                <tr key={p.id}>
                  <th className="reporte-col-nombre" scope="row">{p.nombre}</th>
                  {fechasDelMes.map((f) => {
                    const inc = incidentesMap.get(`${p.id}|${f}`);
                    const matchTipo = filtroTipo === 'TODOS' || inc?.tipo === filtroTipo;
                    const exc = fechasExcepcion.get(f);
                    const dow = diaSemana(f);
                    const esFinde = dow === 'sabado' || dow === 'domingo';
                    const cat = inc ? INCIDENTE_BY_TIPO[inc.tipo] : null;
                    return (
                      <td
                        key={f}
                        className={`reporte-cell ${esFinde ? 'is-finde' : ''} ${exc ? 'is-exc' : ''} ${!matchTipo ? 'is-dim' : ''}`}
                        style={
                          inc && matchTipo && cat
                            ? { background: cat.color, color: cat.colorTexto }
                            : undefined
                        }
                        onClick={() => handleSelectCell(p, f)}
                        role="button"
                        tabIndex={0}
                        title={cellTooltip(p.nombre, f, inc, exc)}
                      >
                        {inc && matchTipo && cat ? cat.codigo : ''}
                      </td>
                    );
                  })}
                  <td className="reporte-col-total">{totalMes || ''}</td>
                </tr>
              );
            })}
            {profesoresFiltrados.length === 0 && (
              <tr>
                <td colSpan={diasMes + 2} className="table-empty">No hay funcionarios.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ResumenTotales resumen={resumen} profesores={profesoresFiltrados} />

      {seleccion && (
        <IncidenteEditor
          profesorNombre={seleccion.profesor.nombre}
          fecha={seleccion.fecha}
          actual={seleccion.actual}
          onSubmit={handleSubmit}
          onClear={handleClear}
          onCancel={() => setSeleccion(null)}
        />
      )}
    </section>
  );
}

function Leyenda() {
  return (
    <div className="leyenda">
      {INCIDENTE_CATALOGO.map((c) => (
        <span key={c.tipo} className="leyenda-item">
          <span className="leyenda-codigo" style={{ background: c.color, color: c.colorTexto }}>
            {c.codigo}
          </span>
          {c.label}
        </span>
      ))}
      <span className="leyenda-item">
        <span className="leyenda-codigo leyenda-codigo-exc">·</span>
        Excepción / Feriado
      </span>
    </div>
  );
}

function ResumenTotales({
  resumen,
  profesores,
}: {
  resumen: Map<string, Record<TipoIncidente, number>>;
  profesores: Profesor[];
}) {
  const totalesPorTipo = useMemo(() => {
    const out = INCIDENTE_CATALOGO.reduce((acc, c) => {
      acc[c.tipo] = 0;
      return acc;
    }, {} as Record<TipoIncidente, number>);
    for (const [, counts] of resumen) {
      for (const c of INCIDENTE_CATALOGO) {
        out[c.tipo] += counts[c.tipo] ?? 0;
      }
    }
    return out;
  }, [resumen]);

  const total = Object.values(totalesPorTipo).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <div className="resumen-totales">
      <h3>Resumen del mes ({profesores.length} funcionarios)</h3>
      <div className="resumen-chips">
        {INCIDENTE_CATALOGO.map((c) => {
          const n = totalesPorTipo[c.tipo];
          if (!n) return null;
          return (
            <div key={c.tipo} className="resumen-chip">
              <span
                className="resumen-chip-codigo"
                style={{ background: c.color, color: c.colorTexto }}
              >
                {c.codigo}
              </span>
              <span>{c.label}</span>
              <strong>{n}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- helpers ----
const NOMBRE_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function diasEnMes(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}
function nextDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function diaSemana(fecha: string): DiaSemana {
  const [y, m, d] = fecha.split('-').map(Number);
  const idx = new Date(y, m - 1, d).getDay(); // 0=dom..6=sab
  const map: DiaSemana[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return map[idx];
}
function abreviado(d: DiaSemana): string {
  return ({
    lunes: 'L', martes: 'M', miercoles: 'X', jueves: 'J',
    viernes: 'V', sabado: 'S', domingo: 'D',
  } as Record<DiaSemana, string>)[d];
}
function cellTooltip(
  nombre: string,
  fecha: string,
  inc: Incidente | undefined,
  exc: Excepcion | undefined,
): string {
  const lines = [`${nombre} — ${fecha}`];
  if (exc) lines.push(`Excepción: ${exc.nombre}`);
  if (inc) {
    const cat = INCIDENTE_BY_TIPO[inc.tipo];
    lines.push(`Incidente: ${cat.label}`);
    if (inc.descripcion) lines.push(inc.descripcion);
  } else {
    lines.push('Click para registrar incidente');
  }
  return lines.join('\n');
}
