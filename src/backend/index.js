// Storage and authentication are independent: real login need not enable sync.
// Default local/local is offline; cloud storage always requires real auth.

import { createLocalAuth } from './local/localAuth'
import { createLocalStore, currentUserNamespace } from './local/localStore'
import { createLocalBlobs } from './local/localBlobs'
import { createSupabaseAuth } from './supabase/supabaseAuth'
import { createSupabaseStore } from './supabase/supabaseStore'
import { createSupabaseBlobs } from './supabase/supabaseBlobs'
import { createOwnerScope } from './ownerScope'

export function createBackend(storageKind = import.meta.env?.VITE_BACKEND || 'local', options = {}) {
  const authKind = options.authKind || import.meta.env?.VITE_AUTH_BACKEND || storageKind
  if (!['local', 'supabase'].includes(storageKind) || !['local', 'supabase'].includes(authKind) ||
      (storageKind === 'supabase' && authKind === 'local')) {
    throw new Error('Unsupported auth/storage combination')
  }
  const privateMode = authKind === 'supabase'
  let identity = null
  const ownerScope = createOwnerScope({
    privateMode,
    getOwnerId: privateMode ? () => identity : currentUserNamespace,
  })
  const localOptions = privateMode ? { ownerScope, allowLegacy: false } : {}
  return {
    kind: storageKind,
    capabilities: { offlineAuth: authKind === 'local', realAuth: authKind === 'supabase' },
    privateOwnerId: options.ownerId ?? import.meta.env?.VITE_PRIVATE_OWNER_ID ?? '',
    ownerScope,
    setIdentity(userId) {
      const next = userId || null
      if (next === identity) return
      identity = next
      ownerScope.invalidate()
    },
    auth: authKind === 'local' ? createLocalAuth() : createSupabaseAuth(),
    store: storageKind === 'local' ? createLocalStore(localOptions) : createSupabaseStore(),
    blobs: storageKind === 'local' ? createLocalBlobs(localOptions) : createSupabaseBlobs(),
  }
}

// App-wide singleton. Hooks/contexts import this; tests can call createBackend()
// directly to get a fresh instance.
export const backend = createBackend()
