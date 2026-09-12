import { createClient } from "@supabase/supabase-js";

// VITE_SUPABASE_ANON_KEY est sûre à exposer côté client : la protection vient des policies RLS
// côté Postgres (voir supabase/migrations/), pas du secret de cette clé. La clé service_role,
// elle, ne doit JAMAIS apparaître ici ni dans aucun fichier de src/parent/.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Configuration Supabase manquante : renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local"
  );
}

export const supabase = createClient(url, anonKey);
