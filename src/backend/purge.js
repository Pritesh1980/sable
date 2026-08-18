import { clearBlobUrls } from '../data/blobUrls'
import { purgeDirtySidecars } from './dirty'
import { SHARE_CACHE } from '../sw/shareTarget'

// Local caches that hold the signed-in user's data. Cleared on sign-out so the
// next account on a shared device never sees the previous user's content.
// NOT cleared: device preferences (theme/font) and device-local API keys, and —
// importantly — the local backend's simulated "remote" (tattoo_remote_*,
// tattoo-blobs-v1), which is the source of truth under VITE_BACKEND=local.
const PURGE_KEYS = [
  'tattoo_ideas',
  'tattoo_concepts',
  'tattoo_boards',
  'tattoo_artists_meta',
  'tattoo_convention_attending',
  'tattoo_img_migrated_v1',
]

// Deletes an IndexedDB database and waits for the outcome instead of firing
// and forgetting. A blocked delete (another connection still open on the DB)
// would otherwise hang forever with no signal — resolve anyway and log it, so
// callers awaiting purge don't stall on a lingering connection somewhere else.
function deleteDatabaseAsync(name) {
  return new Promise((resolve) => {
    let req
    try {
      req = indexedDB.deleteDatabase(name)
    } catch (e) {
      console.error(`[tattoo] purge IndexedDB (${name}) failed:`, e)
      resolve()
      return
    }
    req.onsuccess = () => resolve()
    req.onerror = () => {
      console.error(`[tattoo] purge IndexedDB (${name}) failed:`, req.error)
      resolve()
    }
    req.onblocked = () => {
      console.error(`[tattoo] purge IndexedDB (${name}) blocked by an open connection`)
      resolve()
    }
  })
}

export async function purgeLocalUserData() {
  try {
    PURGE_KEYS.forEach((k) => localStorage.removeItem(k))
    // Dirty-state sidecars (tattoo_dirty_*, tattoo_pending_delete_*,
    // tattoo_stamp_*) describe the signed-out user's unsynced edits.
    purgeDirtySidecars()
  } catch (e) {
    console.error('[tattoo] purge localStorage failed:', e)
  }
  clearBlobUrls()
  // Display image cache only — the simulated remote (tattoo-blobs-v1) stays;
  // its blob keys are already per-user-namespaced (user/<userId>/...) so it
  // doesn't leak between accounts the way an unnamespaced cache would.
  await deleteDatabaseAsync('tattoo-images-v1')
  // An uncollected shared screenshot is this user's content sitting in an
  // origin-scoped cache — without this, A shares, closes before collecting,
  // and B signs in and picks up A's image from /share.
  try {
    await globalThis.caches?.delete?.(SHARE_CACHE)
  } catch (e) {
    console.error('[tattoo] purge share cache failed:', e)
  }
}
