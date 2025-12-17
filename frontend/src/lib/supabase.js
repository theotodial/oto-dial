import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Check if Supabase is configured
const isSupabaseConfigured = supabaseUrl && supabaseAnonKey;

// Create a mock client if not configured to prevent app crash
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signUp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
        signOut: async () => ({ error: null }),
      },
    };

// Log warning if not configured
if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.error(
    '🚨 SUPABASE NOT CONFIGURED!\n\n' +
    'Login and authentication will NOT work.\n\n' +
    'Required environment variables:\n' +
    '- VITE_SUPABASE_URL\n' +
    '- VITE_SUPABASE_ANON_KEY\n\n' +
    'For Netlify deployment, add these in:\n' +
    'Netlify Dashboard → Site Settings → Environment Variables\n\n' +
    'See NETLIFY_SETUP.md for detailed instructions.'
  );
}

