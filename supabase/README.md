# Supabase backend

Esta carpeta contiene las migraciones SQL para el backend en Supabase.

## Aplicar la primera vez

1. Abre el SQL Editor del proyecto:
   https://supabase.com/dashboard/project/xwzebwdeuhysvvlscqow/sql/new

2. **Migración 1 — Schema** (`migrations/0001_schema.sql`):
   - Copia el archivo COMPLETO al SQL Editor.
   - Click en `Run` (o `Ctrl+Enter`).
   - Verifica en `Database → Tables` que aparezcan: organizaciones, usuarios,
     profesores, marcas, periodos, incidentes, observaciones, excepciones,
     configuracion.

3. **Migración 2 — RLS** (`migrations/0002_rls.sql`):
   - Mismo procedimiento.
   - Verifica en `Authentication → Policies` que cada tabla tenga 4 policies
     (`*_select`, `*_insert`, `*_update`, `*_delete`).

## Crear el primer SUPER_ADMIN

Con RLS activado nadie puede insertar en `usuarios` excepto un SUPER_ADMIN
existente — por lo que el primero hay que crearlo a mano:

1. **Authentication → Users → Add user → Create new user** (con email y password).
   Copia el UUID que te da.

2. En el SQL Editor, inserta el perfil saltándose RLS con el rol de servicio
   (el SQL Editor del dashboard ya corre como `postgres` superuser, no respeta RLS):

   ```sql
   insert into usuarios (id, username, nombre_completo, email, rol, organizacion_id, activo)
   values (
     '<UUID-COPIADO-ARRIBA>',
     'admin',
     'Administrador General',
     '<email-del-paso-1>',
     'SUPER_ADMIN',
     null,
     true
   );
   ```

3. A partir de ahí, el SUPER_ADMIN puede crear organizaciones y demás usuarios
   desde la UI.

## Rehacer todo desde cero (solo en pruebas)

```sql
-- ⚠ borra TODOS los datos
drop schema public cascade;
create schema public;
grant all on schema public to postgres;
grant all on schema public to anon, authenticated;
```

Luego vuelve a aplicar 0001 y 0002.
