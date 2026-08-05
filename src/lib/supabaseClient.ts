import { createClient } from "@supabase/supabase-js";

// Diese Werte kommen aus der .env Datei (siehe .env.example).
// Der "anon"/"publishable" Key ist bewusst öffentlich - Sicherheit kommt
// ausschließlich über Row Level Security (siehe supabase/schema.sql), nicht
// über Geheimhaltung dieses Keys.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen. Bitte .env Datei anlegen (siehe .env.example)."
  );
}

export const supabase = createClient(url, anonKey);
