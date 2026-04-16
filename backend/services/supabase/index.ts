import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[Supabase] Client initialized.');
  } catch (err: any) {
    console.error('[Supabase] Error initializing client:', err.message);
  }
} else {
  console.warn('[Supabase] Missing credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). Database logging and Auth will be disabled.');
}

export default supabase;
