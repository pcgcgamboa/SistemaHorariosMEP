export type DiaSemana =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

export const DIAS_SEMANA: DiaSemana[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
];

export const DIAS_LABEL: Record<DiaSemana, string> = {
  lunes: 'LUNES',
  martes: 'MARTES',
  miercoles: 'MIÉRCOLES',
  jueves: 'JUEVES',
  viernes: 'VIERNES',
  sabado: 'SÁBADO',
  domingo: 'DOMINGO',
};

export interface RangoHorario {
  entrada: string; // "HH:mm"
  salida: string; // "HH:mm"
}

export type HorarioSemanal = Record<DiaSemana, RangoHorario | null>;

/**
 * A schedule entry for a profesor.
 * - If both fechaInicio and fechaFin are null/undefined, the schedule is "permanente".
 * - Otherwise it applies only within the given date range (inclusive).
 *
 * When multiple schedules apply to the same date, period schedules take
 * precedence over the permanent schedule.
 */
export interface HorarioProfesor {
  id: string;
  fechaInicio?: string | null; // YYYY-MM-DD or null = permanent
  fechaFin?: string | null;    // YYYY-MM-DD or null = permanent
  horario: HorarioSemanal;
}

export interface Profesor {
  id: string;
  organizacionId: string;
  nombre: string;
  cargo: string;
  horarios: HorarioProfesor[];
}

export type TipoMarca = 'Entrada' | 'Salida';

export interface Marca {
  id: string;
  organizacionId: string;
  nombre: string;
  /** ISO local datetime: YYYY-MM-DDTHH:mm:ss */
  fechaHora: string;
  tipo: TipoMarca;
}

export type EstadoIncidencia =
  | 'Normal'
  | 'Entrada Tardía'
  | 'Salida Anticipada'
  | 'Entrada Tardía y Salida Anticipada'
  | 'Omisión de Marca'
  | 'Entrada Tardía y Omisión de Marca'
  | 'Día Libre'
  | 'Sin Marcas';

export interface DetalleDiaAsistencia {
  fecha: string; // YYYY-MM-DD
  dia: DiaSemana;
  horarioEntrada: string | null;
  horarioSalida: string | null;
  marcaEntrada: string | null; // HH:mm
  marcaSalida: string | null; // HH:mm
  diferenciaEntrada: number; // minutos
  diferenciaSalida: number; // minutos
  estado: EstadoIncidencia;
  observacion: string;
}

export interface ConfiguracionTolerancia {
  entradaMin: number;
  salidaMin: number;
}

export interface Excepcion {
  id: string;
  organizacionId: string;
  nombre: string; // "FERIADO", "SEMANA SANTA", etc.
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
}

/**
 * Per-day observation override for a profesor.
 * Mirrors columns Q/R of the original Excel DetalleAsistencia sheet:
 *   - "limpiar" (Q=X): hides the auto-computed observation (shows "")
 *   - "cambiar" (Q=C): replaces the observation with `texto`
 *   - absent: use the auto-computed observation
 */
export interface ObservacionOverride {
  id: string;
  organizacionId: string;
  profesorId: string;
  fecha: string; // YYYY-MM-DD
  accion: 'limpiar' | 'cambiar';
  texto?: string;
}

export type EstadoIncidenciaExtendido = EstadoIncidencia | 'Excepción';

/**
 * Periodo de marcas registrado por una organización.
 *
 * Cada importación masiva (Excel del reloj) declara el periodo cubierto. El
 * sistema detecta si la importación cae dentro de un periodo ya registrado
 * (solapamiento de rangos) y, de no ser así, propone crear uno nuevo.
 */
/**
 * Incidente o evento registrado a un funcionario en un día específico.
 *
 * Coexiste con Excepcion (a nivel organización: feriados, semana santa) sin
 * solaparse: una excepción aplica al tenant entero, un incidente es a un
 * profesor en un día concreto.
 *
 * Se integra en el detalle de asistencia: cuando hay un incidente registrado
 * para (profesor, fecha) prevalece sobre la incidencia auto-calculada.
 */
export type TipoIncidente =
  | 'AUSENTE'
  | 'CONVOCATORIA'
  | 'INCAPACIDAD'
  | 'SINDICATO'
  | 'LLEGADA_TARDIA'
  | 'MODIFICACION_HORARIO'
  | 'RETIRO_ANTICIPADO'
  | 'REBAJO_SALARIAL';

export interface IncidenteCatalogoEntry {
  tipo: TipoIncidente;
  /** Etiqueta para la UI. */
  label: string;
  /** Código corto de 1-3 caracteres para la grilla pivot. */
  codigo: string;
  /** Color base CSS para fondo de la celda. */
  color: string;
  /** Color de texto contrastado. */
  colorTexto: string;
}

export const INCIDENTE_CATALOGO: IncidenteCatalogoEntry[] = [
  { tipo: 'AUSENTE',              label: 'Ausente',              codigo: 'A',  color: '#dc2626', colorTexto: '#ffffff' },
  { tipo: 'CONVOCATORIA',         label: 'Convocatoria',         codigo: 'C',  color: '#2563eb', colorTexto: '#ffffff' },
  { tipo: 'INCAPACIDAD',          label: 'Incapacidad',          codigo: 'I',  color: '#9333ea', colorTexto: '#ffffff' },
  { tipo: 'SINDICATO',            label: 'Sindicato',            codigo: 'S',  color: '#ea580c', colorTexto: '#ffffff' },
  { tipo: 'LLEGADA_TARDIA',       label: 'Llegada tardía',       codigo: 'LT', color: '#facc15', colorTexto: '#1f2937' },
  { tipo: 'MODIFICACION_HORARIO', label: 'Modificación de horario', codigo: 'MH', color: '#64748b', colorTexto: '#ffffff' },
  { tipo: 'RETIRO_ANTICIPADO',    label: 'Retiro anticipado',    codigo: 'RA', color: '#f59e0b', colorTexto: '#1f2937' },
  { tipo: 'REBAJO_SALARIAL',      label: 'Rebajo salarial',      codigo: 'RS', color: '#1f2937', colorTexto: '#ffffff' },
];

export const INCIDENTE_BY_TIPO: Record<TipoIncidente, IncidenteCatalogoEntry> =
  Object.fromEntries(INCIDENTE_CATALOGO.map((c) => [c.tipo, c])) as Record<TipoIncidente, IncidenteCatalogoEntry>;

export interface Incidente {
  id: string;
  organizacionId: string;
  profesorId: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoIncidente;
  descripcion?: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Periodo {
  id: string;
  organizacionId: string;
  nombre: string; // "Octubre 2025", "Junio - Octubre 2025", etc.
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  /** Cantidad de marcas registradas para este periodo (cache informativo). */
  marcasCount: number;
  /** Nombre del archivo origen (informativo). */
  origen?: string;
  creadoEn: string;
  actualizadoEn: string;
}

/**
 * Forma "creable" de una entidad tenant-scoped: permite no setear
 * `organizacionId` desde la UI; los hooks del store lo inyectan a partir
 * del tenant activo. Mantener `organizacionId` requerido en la entidad
 * persistida garantiza que ningún registro quede sin tenant en disco.
 */
export type Creatable<T extends { organizacionId: string }> =
  Omit<T, 'organizacionId'> & { organizacionId?: string };

export interface Configuracion {
  /** Tenant al que pertenece esta configuración */
  organizacionId: string;
  /** Nombre de la institución */
  institucion: string;
  /** Dirección Regional */
  direccionRegional: string;
  /** Circuito */
  circuito: string;
  /** Días laborales de la semana */
  diasLaborales: DiaSemana[];
  /** Tolerancias en minutos */
  tolerancia: ConfiguracionTolerancia;
  /** Etiquetas personalizables */
  etiquetas: {
    entradaTardia: string;
    omisionMarca: string;
    salidaAnticipada: string;
  };
}

// ============================================================================
// Multi-tenancy + Auth
// ============================================================================

export type Rol = 'USER' | 'ORG_ADMIN' | 'SUPER_ADMIN';

export const ROL_LABEL: Record<Rol, string> = {
  USER: 'Usuario',
  ORG_ADMIN: 'Administrador de Organización',
  SUPER_ADMIN: 'Administrador General',
};

export interface Organizacion {
  id: string;
  nombre: string;
  /** Código corto único, útil para subdominios o integraciones futuras */
  codigo: string;
  direccionRegional: string;
  circuito: string;
  activa: boolean;
  /** ISO datetime */
  creadaEn: string;
  /** ISO datetime */
  actualizadaEn: string;
}

export interface Usuario {
  id: string;
  username: string;
  /** Hash hex (SHA-256). Nunca almacenar la clave en texto plano. */
  passwordHash: string;
  nombreCompleto: string;
  email?: string;
  rol: Rol;
  /** Tenant al que está asociado el usuario. null solo para SUPER_ADMIN. */
  organizacionId: string | null;
  activo: boolean;
  creadoEn: string;
}

/** Versión de Usuario sin información sensible, segura para exponer en sesión. */
export type UsuarioPublico = Omit<Usuario, 'passwordHash'>;

export interface Session {
  user: UsuarioPublico;
  /**
   * Organización activa para el contexto de datos.
   * - SUPER_ADMIN: puede cambiar entre todas (null = vista consolidada).
   * - ORG_ADMIN / USER: fija a su organizacionId.
   */
  organizacionActivaId: string | null;
  /** Epoch ms */
  expiresAt: number;
}
