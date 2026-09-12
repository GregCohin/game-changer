import { createClient } from "@supabase/supabase-js";

// Même projet Supabase que l'app parent (src/parent/supabaseClient.js), mais client séparé côté
// staff : le staff a sa propre session (voir staff_profiles dans les migrations), distincte de
// celle d'un parent. VITE_SUPABASE_ANON_KEY est sûre à exposer côté client — la protection vient
// des policies RLS (is_staff()), pas du secret de cette clé.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseStaff = url && anonKey ? createClient(url, anonKey) : null;
