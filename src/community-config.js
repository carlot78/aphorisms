// Shared ratings database (Supabase). Leave both empty to run without it —
// the app then uses only the reader's own ratings.
//
// Both values are public by design: the anon key can only call the two
// functions and read the aggregate view defined in supabase/schema.sql.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
