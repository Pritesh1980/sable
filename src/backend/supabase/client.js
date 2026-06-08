import { createClient } from '@supabase/supabase-js'

// The ONLY module that constructs the Supabase client. Lazily created so the SDK
// is never instantiated unless the supabase backend is actually selected, and so
// a missing env config fails loudly at use-time rather than import-time.
let client

export function getSupabaseClient() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Supabase backend selected but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.'
    )
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return client
}
