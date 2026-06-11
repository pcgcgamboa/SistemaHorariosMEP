import type {
  Configuracion,
  Excepcion,
  HorarioProfesor,
  Incidente,
  Marca,
  ObservacionOverride,
  Organizacion,
  Periodo,
  Profesor,
  Usuario,
} from '../types';
import type { Mapper } from './supabaseRepo';

// =============================================================================
// Mappers entre tipos TS (camelCase) y filas de Postgres (snake_case).
// =============================================================================
// Notas de conversión:
//  - DATE en Postgres se serializa como string 'YYYY-MM-DD' por supabase-js → directo.
//  - TIMESTAMPTZ se serializa como ISO con offset (ej. '2025-10-01T12:34:56+00:00'),
//    que `new Date()` y los comparadores de string aceptan sin cambios.
//  - JSONB se serializa como su objeto JS → directo.
//  - El tipo `unknown` se usa en las filas porque supabase-js devuelve `any`.

type Row = Record<string, unknown>;

// --------- Helpers de extracción defensiva ---------
const str   = (v: unknown): string => (v == null ? '' : String(v));
const strOpt = (v: unknown): string | undefined => (v == null ? undefined : String(v));
const strNull = (v: unknown): string | null => (v == null ? null : String(v));
const bool  = (v: unknown, def = true): boolean => (typeof v === 'boolean' ? v : def);

// =============================================================================
// Tenant-scoped: implementan { id, organizacionId, ...resto }.
// =============================================================================

export const profesorMapper: Mapper<Profesor, Row> = {
  toDb: (p) => ({
    id: p.id,
    organizacion_id: p.organizacionId,
    nombre: p.nombre,
    cargo: p.cargo,
    activo: p.activo ?? true,
    horarios: p.horarios,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    organizacionId: str(r.organizacion_id),
    nombre: str(r.nombre),
    cargo: str(r.cargo),
    activo: bool(r.activo, true),
    horarios: (r.horarios as HorarioProfesor[]) ?? [],
  }),
};

export const marcaMapper: Mapper<Marca, Row> = {
  toDb: (m) => ({
    id: m.id,
    organizacion_id: m.organizacionId,
    nombre: m.nombre,
    fecha_hora: m.fechaHora,
    tipo: m.tipo,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    organizacionId: str(r.organizacion_id),
    nombre: str(r.nombre),
    // El formato local del proyecto es 'YYYY-MM-DDTHH:mm:ss'. Postgres devuelve
    // con offset (e.g. '+00:00'); recortamos a los primeros 19 caracteres.
    fechaHora: str(r.fecha_hora).slice(0, 19),
    tipo: r.tipo as Marca['tipo'],
  }),
};

export const periodoMapper: Mapper<Periodo, Row> = {
  toDb: (p) => ({
    id: p.id,
    organizacion_id: p.organizacionId,
    nombre: p.nombre,
    fecha_inicio: p.fechaInicio,
    fecha_fin: p.fechaFin,
    marcas_count: p.marcasCount,
    origen: p.origen ?? null,
    creado_en: p.creadoEn,
    actualizado_en: p.actualizadoEn,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    organizacionId: str(r.organizacion_id),
    nombre: str(r.nombre),
    fechaInicio: str(r.fecha_inicio),
    fechaFin: str(r.fecha_fin),
    marcasCount: Number(r.marcas_count ?? 0),
    origen: strOpt(r.origen),
    creadoEn: str(r.creado_en),
    actualizadoEn: str(r.actualizado_en),
  }),
};

export const incidenteMapper: Mapper<Incidente, Row> = {
  toDb: (i) => ({
    id: i.id,
    organizacion_id: i.organizacionId,
    profesor_id: i.profesorId,
    fecha: i.fecha,
    tipo: i.tipo,
    descripcion: i.descripcion ?? null,
    creado_en: i.creadoEn,
    actualizado_en: i.actualizadoEn,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    organizacionId: str(r.organizacion_id),
    profesorId: str(r.profesor_id),
    fecha: str(r.fecha),
    tipo: r.tipo as Incidente['tipo'],
    descripcion: strOpt(r.descripcion),
    creadoEn: str(r.creado_en),
    actualizadoEn: str(r.actualizado_en),
  }),
};

export const observacionMapper: Mapper<ObservacionOverride, Row> = {
  toDb: (o) => ({
    id: o.id,
    organizacion_id: o.organizacionId,
    profesor_id: o.profesorId,
    fecha: o.fecha,
    accion: o.accion,
    texto: o.texto ?? null,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    organizacionId: str(r.organizacion_id),
    profesorId: str(r.profesor_id),
    fecha: str(r.fecha),
    accion: r.accion as ObservacionOverride['accion'],
    texto: strOpt(r.texto),
  }),
};

export const excepcionMapper: Mapper<Excepcion, Row> = {
  toDb: (e) => ({
    id: e.id,
    organizacion_id: e.organizacionId,
    nombre: e.nombre,
    fecha_inicio: e.fechaInicio,
    fecha_fin: e.fechaFin,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    organizacionId: str(r.organizacion_id),
    nombre: str(r.nombre),
    fechaInicio: str(r.fecha_inicio),
    fechaFin: str(r.fecha_fin),
  }),
};

// =============================================================================
// Configuración — caso especial (PK = organizacion_id, NO tiene `id` propio).
// El supabaseRepo genérico exige `id`; la configuración tiene su propia API
// abajo en `configuracionApi`.
// =============================================================================

export const configuracionMapper: Mapper<Configuracion, Row> = {
  toDb: (c) => ({
    organizacion_id: c.organizacionId,
    institucion: c.institucion,
    direccion_regional: c.direccionRegional,
    circuito: c.circuito,
    dias_laborales: c.diasLaborales,
    tolerancia: c.tolerancia,
    etiquetas: c.etiquetas,
  }),
  fromDb: (r) => ({
    organizacionId: str(r.organizacion_id),
    institucion: str(r.institucion),
    direccionRegional: str(r.direccion_regional),
    circuito: str(r.circuito),
    diasLaborales: (r.dias_laborales as Configuracion['diasLaborales']) ?? [],
    tolerancia: (r.tolerancia as Configuracion['tolerancia']) ?? { entradaMin: 5, salidaMin: 8 },
    etiquetas: (r.etiquetas as Configuracion['etiquetas']) ?? {
      entradaTardia: 'Entrada Tardía',
      omisionMarca: 'Omisión de Marca',
      salidaAnticipada: 'Salida Anticipada',
    },
  }),
};

// =============================================================================
// Globales: organizaciones y usuarios (no son tenant-scoped).
// =============================================================================

export const organizacionMapper: Mapper<Organizacion, Row> = {
  toDb: (o) => ({
    id: o.id,
    nombre: o.nombre,
    codigo: o.codigo,
    direccion_regional: o.direccionRegional,
    circuito: o.circuito,
    activa: o.activa,
    creada_en: o.creadaEn,
    actualizada_en: o.actualizadaEn,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    nombre: str(r.nombre),
    codigo: str(r.codigo),
    direccionRegional: str(r.direccion_regional),
    circuito: str(r.circuito),
    activa: bool(r.activa, true),
    creadaEn: str(r.creada_en),
    actualizadaEn: str(r.actualizada_en),
  }),
};

export const usuarioMapper: Mapper<Usuario, Row> = {
  toDb: (u) => ({
    id: u.id,
    username: u.username,
    // `passwordHash` NO se guarda en Supabase — Auth lo gestiona aparte.
    nombre_completo: u.nombreCompleto,
    email: u.email ?? null,
    rol: u.rol,
    organizacion_id: u.organizacionId,
    activo: u.activo,
    creado_en: u.creadoEn,
  }),
  fromDb: (r) => ({
    id: str(r.id),
    username: str(r.username),
    // El hash NO viene de Supabase; mantenemos campo por compat con el tipo.
    passwordHash: '',
    nombreCompleto: str(r.nombre_completo),
    email: strOpt(r.email),
    rol: r.rol as Usuario['rol'],
    organizacionId: strNull(r.organizacion_id),
    activo: bool(r.activo, true),
    creadoEn: str(r.creado_en),
  }),
};
