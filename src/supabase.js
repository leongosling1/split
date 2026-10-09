import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Demo builds (VITE_DEMO=1) run with sample data, no sign-in and no cloud.
export const isDemo = import.meta.env.VITE_DEMO === '1';

export const supabaseConfigured = !isDemo && Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : null;
