-- =============================================================================
-- Row Level Security — aislamiento por tenant + roles
-- =============================================================================
-- Política general:
--   - SUPER_ADMIN: lee y escribe TODO.
--   - ORG_ADMIN / USER: leen y escriben SOLO datos de su `organizacion_id`.
--   - Las tablas `usuarios` y `organizaciones` tienen reglas algo distintas
--     (solo SUPER_ADMIN modifica; cada uno se ve a sí mismo / su org).
--
-- Importante: el helper `public.user_rol()` es SECURITY DEFINER, por lo que
-- puede leer `usuarios` aunque las policies bloqueen al caller.
-- =============================================================================

-- --------- organizaciones ---------
alter table organizaciones enable row level security;

create policy organizaciones_select on organizaciones for select using (
  public.user_rol() = 'SUPER_ADMIN'
  or id = public.user_org_id()
);
create policy organizaciones_modify on organizaciones for all using (
  public.user_rol() = 'SUPER_ADMIN'
) with check (
  public.user_rol() = 'SUPER_ADMIN'
);

-- --------- usuarios ---------
alter table usuarios enable row level security;

-- Cualquier usuario autenticado puede leer su propia fila (para mostrar perfil).
-- SUPER_ADMIN lee todas.
create policy usuarios_select on usuarios for select using (
  public.user_rol() = 'SUPER_ADMIN'
  or id = auth.uid()
);

-- Solo SUPER_ADMIN crea, edita o elimina usuarios (flujo (a) — sin auto-registro).
create policy usuarios_modify on usuarios for all using (
  public.user_rol() = 'SUPER_ADMIN'
) with check (
  public.user_rol() = 'SUPER_ADMIN'
);

-- --------- Macro DO-BLOCK que aplica el patrón estándar a las tablas tenant-scoped ---------
-- Para cada tabla con columna `organizacion_id`, crea 4 policies (select/insert/update/delete)
-- con la misma lógica: SUPER_ADMIN ve todo, los demás solo su organización.
do $$
declare
  tabla text;
  tablas text[] := array[
    'profesores', 'marcas', 'periodos', 'incidentes',
    'observaciones', 'excepciones', 'configuracion'
  ];
begin
  foreach tabla in array tablas loop
    execute format('alter table %I enable row level security', tabla);

    execute format($p$
      create policy %I_select on %I for select using (
        public.user_rol() = 'SUPER_ADMIN'
        or organizacion_id = public.user_org_id()
      );
    $p$, tabla, tabla);

    execute format($p$
      create policy %I_insert on %I for insert with check (
        public.user_rol() = 'SUPER_ADMIN'
        or organizacion_id = public.user_org_id()
      );
    $p$, tabla, tabla);

    execute format($p$
      create policy %I_update on %I for update using (
        public.user_rol() = 'SUPER_ADMIN'
        or organizacion_id = public.user_org_id()
      ) with check (
        public.user_rol() = 'SUPER_ADMIN'
        or organizacion_id = public.user_org_id()
      );
    $p$, tabla, tabla);

    execute format($p$
      create policy %I_delete on %I for delete using (
        public.user_rol() = 'SUPER_ADMIN'
        or organizacion_id = public.user_org_id()
      );
    $p$, tabla, tabla);
  end loop;
end $$;
