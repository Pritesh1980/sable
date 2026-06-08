// createBackend() — the single seam the app talks to. Selects an adapter set by
// VITE_BACKEND ('local' | 'supabase' | 'aws'), defaulting to 'local' so dev and
// tests stay fully offline. The supabase adapter is loaded lazily so its SDK is
// only pulled in when actually selected; 'aws' is a reserved future slot.

import { createLocalAuth } from './local/localAuth'
import { createLocalStore } from './local/localStore'
import { createLocalBlobs } from './local/localBlobs'
import { createSupabaseAuth } from './supabase/supabaseAuth'
import { createSupabaseStore } from './supabase/supabaseStore'
import { createSupabaseBlobs } from './supabase/supabaseBlobs'

function createLocalBackend() {
  return {
    kind: 'local',
    auth: createLocalAuth(),
    store: createLocalStore(),
    blobs: createLocalBlobs(),
  }
}

export function createBackend(kind = import.meta.env?.VITE_BACKEND || 'local') {
  switch (kind) {
    case 'supabase':
      return createSupabaseBackend()
    case 'aws':
      throw new Error('AWS backend not implemented yet — see src/backend/aws/')
    case 'local':
    default:
      return createLocalBackend()
  }
}

// The supabase client itself is constructed lazily inside these factories
// (getSupabaseClient), so selecting 'local' never touches the SDK or env config.
function createSupabaseBackend() {
  return {
    kind: 'supabase',
    auth: createSupabaseAuth(),
    store: createSupabaseStore(),
    blobs: createSupabaseBlobs(),
  }
}

// App-wide singleton. Hooks/contexts import this; tests can call createBackend()
// directly to get a fresh instance.
export const backend = createBackend()
