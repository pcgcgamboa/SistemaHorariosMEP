import { useMemo, useState } from 'react';
import type {
  Configuracion,
  EstadoIncidencia,
  Excepcion,
  Incidente,
  Marca,
  ObservacionOverride,
  Profesor,
} from '../types';
import { DIAS_LABEL, DIAS_SEMANA } from '../types';
import {
  buildDetalleAsistencia,
  calcularResumen,
  composeObservacion,
  indexIncidentes,
  indexOverrides,
} from '../utils/asistencia';
import { getHorarioForPeriodo } from '../utils/profesor';
import { formatFecha, minutesToHHmm } from '../utils/time';

interface Props {
  profesores: Profesor[];
  marcas: Marca[];
  excepciones: Excepcion[];
  incidentes: Incidente[];
  config: Configuracion;
  observaciones: ObservacionOverride[];
  onSetObservacion: (profesorId: string, fecha: string, accion: 'limpiar' | 'cambiar' | null, texto?: string) => void;
}

function defaultRange(marcas: Marca[]): { desde: string; hasta: string } {
  if (marcas.length === 0) {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: toIso(inicio), hasta: toIso(fin) };
  }
  const fechas = marcas.map((m) => m.fechaHora.slice(0, 10)).sort();
  const ultima = fechas[fechas.length - 1];
  const fin = new Date(`${ultima}T00:00:00`);
  const inicio = new Date(fin.getFullYear(), fin.getMonth(), 1);
  return { desde: toIso(inicio), hasta: ultima };
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMinTardia(min: number): string {
  if (min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatFechaHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

const ESTADO_BADGE: Record<EstadoIncidencia, string> = {
  Normal: 'badge badge-ok',
  'Entrada Tardía': 'badge badge-warn',
  'Salida Anticipada': 'badge badge-warn',
  'Entrada Tardía y Salida Anticipada': 'badge badge-danger',
  'Omisión de Marca': 'badge badge-danger',
  'Entrada Tardía y Omisión de Marca': 'badge badge-danger',
  'Día Libre': 'badge badge-libre',
  'Sin Marcas': 'badge badge-muted',
};

export function DetalleAsistenciaView({
  profesores,
  marcas,
  excepciones,
  incidentes,
  config,
  observaciones,
  onSetObservacion,
}: Props) {
  const profesoresOrdenados = useMemo(
    () => [...profesores].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profesores],
  );

  const [profesorId, setProfesorId] = useState<string>(profesoresOrdenados[0]?.id ?? '');
  const rangoInicial = useMemo(() => defaultRange(marcas), [marcas]);
  const [desde, setDesde] = useState(rangoInicial.desde);
  const [hasta, setHasta] = useState(rangoInicial.hasta);

  const profesor = useMemo(
    () => profesoresOrdenados.find((p) => p.id === profesorId) ?? profesoresOrdenados[0],
    [profesoresOrdenados, profesorId],
  );

  const horarioPeriodo = useMemo(
    () => (profesor ? getHorarioForPeriodo(profesor, desde, hasta) : null),
    [profesor, desde, hasta],
  );

  const detalle = useMemo(() => {
    if (!profesor) return [];
    return buildDetalleAsistencia({
      profesor,
      marcas,
      desde,
      hasta,
      tolerancia: config.tolerancia,
      excepciones,
      config,
    });
  }, [profesor, marcas, desde, hasta, config, excepciones]);

  const resumen = useMemo(() => calcularResumen(detalle), [detalle]);

  // Per-day observation overrides keyed by YYYY-MM-DD
  const overridesMap = useMemo(
    () => (profesor ? indexOverrides(observaciones, profesor.id) : new Map()),
    [observaciones, profesor],
  );

  // Per-day incidentes registrados para este profesor
  const incidentesMap = useMemo(
    () => (profesor ? indexIncidentes(incidentes, profesor.id) : new Map()),
    [incidentes, profesor],
  );

  // Build marcas lookup by nombre+fecha for print: full timestamp strings
  const marcasPorFecha = useMemo(() => {
    if (!profesor) return new Map<string, { entrada: string; salida: string }>();
    const map = new Map<string, { entrada: string; salida: string }>();
    const filtered = marcas
      .filter((m) => m.nombre === profesor.nombre)
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    for (const m of filtered) {
      const fecha = m.fechaHora.slice(0, 10);
      if (fecha < desde || fecha > hasta) continue;
      const existing = map.get(fecha) ?? { entrada: '', salida: '' };
      if (m.tipo === 'Entrada' && !existing.entrada) {
        existing.entrada = formatFechaHora(m.fechaHora);
      }
      if (m.tipo === 'Salida') {
        existing.salida = formatFechaHora(m.fechaHora);
      }
      map.set(fecha, existing);
    }
    return map;
  }, [profesor, marcas, desde, hasta]);

  if (!profesor) {
    return (
      <section className="view">
        <header className="view-header">
          <div><h2>Detalle de Asistencia</h2></div>
        </header>
        <p className="empty">No hay profesores registrados. Agrega uno en "Horario de Profesores".</p>
      </section>
    );
  }

  const fechaHoy = new Date();
  const fechaImpresion = `${String(fechaHoy.getDate()).padStart(2, '0')}/${String(fechaHoy.getMonth() + 1).padStart(2, '0')}/${fechaHoy.getFullYear()}`;
  const periodoStr = `${formatFecha(desde)} – ${formatFecha(hasta)}`;

  return (
    <section className="view">
      {/* ===== SCREEN: encabezado estilo reporte ===== */}
      <div className="screen-report-header no-print">
        <div className="sr-header">
          <div className="sr-header-left">
            <div className="sr-inst">{config.institucion}</div>
            <div className="sr-dre">{config.direccionRegional}</div>
            <div className="sr-circuito">{config.circuito}</div>
            <div className="sr-title">Detalle de Asistencia</div>
            <div className="sr-field">
              <span className="sr-label">Nombre:</span>
              <span className="sr-value">{profesor.nombre}</span>
            </div>
            <div className="sr-field">
              <span className="sr-label">Puesto:</span>
              <span className="sr-value">{profesor.cargo || '—'}</span>
            </div>
          </div>
          <div className="sr-header-right">
            <div className="sr-meta-row">
              <span className="sr-label">Fecha</span>
              <span className="sr-value">{fechaImpresion}</span>
            </div>
            <div className="sr-meta-row">
              <span className="sr-label">Periodo</span>
              <span className="sr-value">{periodoStr}</span>
            </div>
            <table className="sr-horario-table">
              <caption>Horario del funcionario</caption>
              <thead>
                <tr><th>Día</th><th>Entrada</th><th>Salida</th></tr>
              </thead>
              <tbody>
                {DIAS_SEMANA.map((d) => {
                  const h = horarioPeriodo?.horario?.[d];
                  return (
                    <tr key={d}>
                      <td>{DIAS_LABEL[d]}</td>
                      <td>{h ? h.entrada : 'LIBRE'}</td>
                      <td>{h ? h.salida : 'LIBRE'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sr-controls">
          <div className="filters">
            <label className="field">
              <span className="field-label">Profesor</span>
              <select value={profesorId} onChange={(e) => setProfesorId(e.target.value)} className="input">
                {profesoresOrdenados.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
            </label>
            <label className="field">
              <span className="field-label">Hasta</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
            </label>
          </div>
          <div className="view-actions">
            <button className="btn btn-ghost" type="button" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="kpis no-print">
        <Kpi label="Días laborales" value={resumen.diasLaborales} />
        <Kpi label="Sin novedad" value={resumen.diasNormales} tone="ok" />
        <Kpi label="Entradas tardías" value={resumen.entradasTardias} tone="warn" />
        <Kpi label="Salidas anticipadas" value={resumen.salidasAnticipadas} tone="warn" />
        <Kpi label="Omisiones de marca" value={resumen.omisiones} tone="danger" />
        <Kpi label="Min. tardíos" value={minutesToHHmm(resumen.minutosTardios) || '00:00'} tone="warn" />
      </div>

      {/* ===== SCREEN: interactive table ===== */}
      <div className="table-wrap no-print">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Día</th>
              <th>Horario</th>
              <th>Marca Entrada</th>
              <th>Marca Salida</th>
              <th>Tardía</th>
              <th>Anticipada</th>
              <th>Estado (auto)</th>
              <th title="Controla qué se imprime en Observaciones. Replica columnas Q/R del Excel.">
                Mostrar en impresión
              </th>
            </tr>
          </thead>
          <tbody>
            {detalle.length === 0 && (
              <tr><td colSpan={9} className="empty">Sin registros en el rango seleccionado.</td></tr>
            )}
            {detalle.map((d) => {
              const override = overridesMap.get(d.fecha);
              const incidente = incidentesMap.get(d.fecha);
              const obsConIncidente = composeObservacion(d, undefined, incidente);
              return (
                <tr key={d.fecha} className={d.estado === 'Día Libre' ? 'row-muted' : ''}>
                  <td>{formatFecha(d.fecha)}</td>
                  <td>{DIAS_LABEL[d.dia]}</td>
                  <td className="muted">
                    {d.horarioEntrada && d.horarioSalida ? `${d.horarioEntrada} – ${d.horarioSalida}` : 'LIBRE'}
                  </td>
                  <td className={!d.marcaEntrada ? 'cell-missing' : ''}>{d.marcaEntrada ?? '—'}</td>
                  <td className={!d.marcaSalida && d.estado !== 'Día Libre' ? 'cell-missing' : ''}>
                    {d.marcaSalida ?? '—'}
                  </td>
                  <td>{d.diferenciaEntrada > 0 ? minutesToHHmm(d.diferenciaEntrada) : '—'}</td>
                  <td>{d.diferenciaSalida > 0 ? minutesToHHmm(d.diferenciaSalida) : '—'}</td>
                  <td><span className={ESTADO_BADGE[d.estado]}>{d.estado}</span></td>
                  <td className="col-override">
                    <OverrideEditor
                      profesorId={profesor.id}
                      fecha={d.fecha}
                      defaultText={obsConIncidente}
                      override={override}
                      onSet={onSetObservacion}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ===== PRINT-ONLY: Excel-format report ===== */}
      <div className="print-report">
        {/* Header block matching Excel rows 1–9 */}
        <div className="pr-header">
          {/* Row 1: Institución — full width, centered */}
          <div className="pr-row-inst">{config.institucion}</div>
          {/* Row 2: DRE */}
          <div className="pr-row-dre">{config.direccionRegional}</div>
          {/* Row 3: Circuito */}
          <div className="pr-row-circuito">{config.circuito}</div>

          {/* Row 4-5: Título a la izq, Fecha a la derecha */}
          <div className="pr-row-split">
            <div className="pr-title">Detalle de Asistencia</div>
            <div className="pr-side">
              <span className="pr-side-label">Fecha</span>
              <span className="pr-side-value">{fechaImpresion}</span>
            </div>
          </div>

          {/* Row 6-7: Nombre a la izq, (espacio a la derecha) */}
          <div className="pr-row-split">
            <div className="pr-field">
              <span className="pr-label">Nombre:</span>
              <span className="pr-value">{profesor.nombre}</span>
            </div>
            <div className="pr-side">
              <span className="pr-side-label">Periodo</span>
            </div>
          </div>

          {/* Row 8-9: Puesto a la izq, Periodo valor a la derecha */}
          <div className="pr-row-split">
            <div className="pr-field">
              <span className="pr-label">Puesto:</span>
              <span className="pr-value">{profesor.cargo || '—'}</span>
            </div>
            <div className="pr-side">
              <span className="pr-side-value">{periodoStr}</span>
            </div>
          </div>
        </div>

        {/* Column headers matching Excel row 12–13 visible cols */}
        <table className="pr-table">
          <thead>
            <tr className="pr-section-row">
              <th colSpan={2}>Fecha</th>
              <th colSpan={3}>Horario</th>
              <th colSpan={3}>Incidente</th>
            </tr>
            <tr>
              <th className="pr-col-fecha">Entrada(s)</th>
              <th className="pr-col-fecha">Salida(s)</th>
              <th className="pr-col-dia">Día</th>
              <th className="pr-col-hora">Entrada</th>
              <th className="pr-col-hora">Salida</th>
              <th className="pr-col-tardia">Entrada Tardía</th>
              <th className="pr-col-tardia">Salida Anticipada</th>
              <th className="pr-col-obs">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((d) => {
              const m = marcasPorFecha.get(d.fecha);
              const entradaTs = m?.entrada ?? '';
              const salidaTs = m?.salida ?? '';
              const override = overridesMap.get(d.fecha);
              const incidente = incidentesMap.get(d.fecha);
              // Default observation for print (excludes Normal / Día Libre when no incidente)
              const baseObs = d.estado !== 'Normal' && d.estado !== 'Día Libre'
                ? (d.observacion || d.estado)
                : '';
              const obsFinal = composeObservacion(
                { ...d, observacion: baseObs },
                override,
                incidente,
              );
              return (
                <tr key={d.fecha}>
                  <td className="pr-col-fecha">{entradaTs || (d.marcaEntrada ? `${formatFecha(d.fecha)} ${d.marcaEntrada}` : '')}</td>
                  <td className="pr-col-fecha">{salidaTs || (d.marcaSalida ? `${formatFecha(d.fecha)} ${d.marcaSalida}` : '')}</td>
                  <td className="pr-col-dia">{DIAS_LABEL[d.dia]}</td>
                  <td className="pr-col-hora">{d.horarioEntrada ?? 'LIBRE'}</td>
                  <td className="pr-col-hora">{d.horarioSalida ?? 'LIBRE'}</td>
                  <td className="pr-col-tardia">{formatMinTardia(d.diferenciaEntrada)}</td>
                  <td className="pr-col-tardia">{formatMinTardia(d.diferenciaSalida)}</td>
                  <td className="pr-col-obs">{obsFinal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Observations area matching Excel rows 103–106 */}
        <div className="pr-observaciones">
          <div className="pr-obs-label">Observaciones</div>
          <div className="pr-obs-body">&nbsp;</div>
        </div>

        {/* Signature lines matching Excel rows 108–109 */}
        <div className="pr-firmas">
          <div className="pr-firma">
            <div className="pr-firma-line"></div>
            <div className="pr-firma-nombre">Director(a)</div>
          </div>
          <div className="pr-firma">
            <div className="pr-firma-line"></div>
            <div className="pr-firma-nombre">Asistente de dirección</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

interface OverrideEditorProps {
  profesorId: string;
  fecha: string;
  defaultText: string;
  override: ObservacionOverride | undefined;
  onSet: (profesorId: string, fecha: string, accion: 'limpiar' | 'cambiar' | null, texto?: string) => void;
}

function OverrideEditor({ profesorId, fecha, defaultText, override, onSet }: OverrideEditorProps) {
  const accion: 'auto' | 'limpiar' | 'cambiar' = override?.accion ?? 'auto';
  const [texto, setTexto] = useState(override?.texto ?? '');

  // Keep local text in sync when the override changes externally
  useMemo(() => {
    setTexto(override?.texto ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override?.id, override?.texto]);

  function handleAccion(nueva: 'auto' | 'limpiar' | 'cambiar') {
    if (nueva === 'auto') {
      onSet(profesorId, fecha, null);
    } else if (nueva === 'limpiar') {
      onSet(profesorId, fecha, 'limpiar');
    } else {
      onSet(profesorId, fecha, 'cambiar', texto || defaultText);
    }
  }

  return (
    <div className="override-editor">
      <select
        className={`input input-xs override-select override-${accion}`}
        value={accion}
        onChange={(e) => handleAccion(e.target.value as 'auto' | 'limpiar' | 'cambiar')}
        title="Auto = usa el estado calculado. Limpiar = imprime en blanco. Cambiar = texto personalizado."
      >
        <option value="auto">Auto</option>
        <option value="limpiar">Limpiar</option>
        <option value="cambiar">Cambiar</option>
      </select>
      {accion === 'cambiar' && (
        <input
          type="text"
          className="input input-xs override-text"
          value={texto}
          placeholder="Texto personalizado…"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => onSet(profesorId, fecha, 'cambiar', texto)}
        />
      )}
    </div>
  );
}
