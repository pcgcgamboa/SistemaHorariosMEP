-- =============================================================================
-- Sistema Control Reloj — Schema inicial
-- =============================================================================
-- Crea las tablas que reemplazan al localStorage. Convenciones:
--   - PKs `text` salvo `usuarios.id` (uuid, ligada a auth.users de Supabase).
--   - FKs con ON DELETE CASCADE cuando hay propiedad fuerte (org → datos del tenant).
--   - timestamps en TIMESTAMPTZ (UTC). Para fechas-de-calendario sin hora, DATE.
--   - JSONB para estructuras anidadas complejas (horarios, tolerancia, etiquetas).
--
-- Aplicar copiando este archivo completo al SQL Editor de Supabase y ejecutándolo.
-- RLS se habilita en la migración siguiente (0002_rls.sql).
-- =============================================================================

-- --------- Tipos enum ---------
create type rol_usuario as enum ('USER', 'ORG_ADMIN', 'SUPER_ADMIN');
create type tipo_marca  as enum ('Entrada', 'Salida');
create type tipo_incidente as enum (
  'AUSENTE', 'CONVOCATORIA', 'INCAPACIDAD', 'SINDICATO',
  'LLEGADA_TARDIA', 'MODIFICACION_HORARIO', 'RETIRO_ANTICIPADO', 'REBAJO_SALARIAL'
);
create type accion_observacion as enum ('limpiar', 'cambiar');

-- --------- Organizaciones ---------
create table organizaciones (
  id                   text primary key,
  nombre               text not null,
  codigo               text unique not null,
  direccion_regional   text not null default '',
  circuito             text not null default '',
  activa               boolean not null default true,
  creada_en            timestamptz not null default now(),
  actualizada_en       timestamptz not null default now()
);

-- --------- Usuarios (perfil) ---------
-- Cada fila se asocia 1:1 con un registro en auth.users (manejado por Supabase Auth).
-- Cuando SUPER_ADMIN elimina un usuario desde auth, esta fila cae por cascade.
create table usuarios (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             text unique not null,
  nombre_completo      text not null,
  email                text,
  rol                  rol_usuario not null default 'USER',
  organizacion_id      text references organizaciones(id) on delete set null,
  activo               boolean not null default true,
  creado_en            timestamptz not null default now()
);
create index usuarios_org_idx on usuarios(organizacion_id);

-- --------- Colaboradores (profesores) ---------
create table profesores (
  id                   text primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  nombre               text not null,
  cargo                text not null default '',
  activo               boolean not null default true,
  horarios             jsonb not null default '[]'::jsonb
);
create index profesores_org_idx        on profesores(organizacion_id);
create index profesores_org_nombre_idx on profesores(organizacion_id, nombre);

-- --------- Marcas del reloj ---------
create table marcas (
  id                   text primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  nombre               text not null,
  fecha_hora           timestamptz not null,
  tipo                 tipo_marca not null
);
create index marcas_org_fecha_idx        on marcas(organizacion_id, fecha_hora);
create index marcas_org_nombre_fecha_idx on marcas(organizacion_id, nombre, fecha_hora);

-- --------- Periodos de marcas (rango cubierto por una importación) ---------
create table periodos (
  id                   text primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  nombre               text not null,
  fecha_inicio         date not null,
  fecha_fin            date not null,
  marcas_count         integer not null default 0,
  origen               text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index periodos_org_idx on periodos(organizacion_id);

-- --------- Incidentes (justificaciones por día) ---------
create table incidentes (
  id                   text primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  profesor_id          text not null references profesores(id) on delete cascade,
  fecha                date not null,
  tipo                 tipo_incidente not null,
  descripcion          text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  unique (profesor_id, fecha) -- 1 incidente por colaborador por día
);
create index incidentes_org_profesor_fecha_idx
  on incidentes(organizacion_id, profesor_id, fecha);

-- --------- Overrides de observación (columna "Mostrar en impresión") ---------
create table observaciones (
  id                   text primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  profesor_id          text not null references profesores(id) on delete cascade,
  fecha                date not null,
  accion               accion_observacion not null,
  texto                text,
  unique (profesor_id, fecha) -- 1 override por colaborador por día
);
create index observaciones_org_profesor_fecha_idx
  on observaciones(organizacion_id, profesor_id, fecha);

-- --------- Excepciones (feriados, semana santa, etc., a nivel organización) ---------
create table excepciones (
  id                   text primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  nombre               text not null,
  fecha_inicio         date not null,
  fecha_fin            date not null
);
create index excepciones_org_idx on excepciones(organizacion_id);

-- --------- Configuración (1 fila por organización) ---------
create table configuracion (
  organizacion_id      text primary key references organizaciones(id) on delete cascade,
  institucion          text not null,
  direccion_regional   text not null default '',
  circuito             text not null default '',
  dias_laborales       text[] not null default '{lunes,martes,miercoles,jueves,viernes}',
  tolerancia           jsonb not null default '{"entradaMin":5,"salidaMin":8}'::jsonb,
  etiquetas            jsonb not null default
    '{"entradaTardia":"Entrada Tardía","omisionMarca":"Omisión de Marca","salidaAnticipada":"Salida Anticipada"}'::jsonb
);

-- --------- Trigger: mantener actualizada_en/actualizado_en ---------
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  if (tg_table_name = 'organizaciones') then
    new.actualizada_en := now();
  else
    new.actualizado_en := now();
  end if;
  return new;
end;
$$;

create trigger organizaciones_updated before update on organizaciones
  for each row execute function public.set_updated_at();
create trigger periodos_updated before update on periodos
  for each row execute function public.set_updated_at();
create trigger incidentes_updated before update on incidentes
  for each row execute function public.set_updated_at();

-- --------- Helpers que leen el JWT para usarlos en RLS ---------
-- Definidos como SECURITY DEFINER para que puedan leer `usuarios` aunque RLS
-- restrinja el SELECT del caller. STABLE = se evalúa una vez por query.
create or replace function public.user_rol() returns rol_usuario
  language sql stable security definer set search_path = public as $$
  select rol from public.usuarios where id = auth.uid()
$$;

create or replace function public.user_org_id() returns text
  language sql stable security definer set search_path = public as $$
  select organizacion_id from public.usuarios where id = auth.uid()
$$;
