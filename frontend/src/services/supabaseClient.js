/**
 * services/supabaseClient.js
 * Single Supabase client instance for the entire frontend.
 * Import `supabase` anywhere you need auth or DB queries.
 */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
