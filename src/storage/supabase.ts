import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente único de Supabase para toda la app.
 *
 * Las credenciales se leen del bundle (vite expone `import.meta.env.VITE_*`).
 * Si faltan, el cliente NO se crea y el resto del código debe degradar al
 * modo localStorage. Esto permite desarrollar/probar sin tocar la nube.
 *
 * La `anon key` es JWT segura para exposición pública: la protección real
 * la da Row Level Security en Postgres. NUNCA poner aquí la `service_role` key.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (!supabaseEnabled && import.meta.env.DEV) {

  console.warn(
    '[supabase] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no definidas — modo localStorage únicamente.',
  );
}
