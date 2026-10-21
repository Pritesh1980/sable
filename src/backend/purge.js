import { clearBlobUrls } from '../data/blobUrls'
import { DEVICE_COPIES_KEY, STAGED_IMAGES_DB, UPLOAD_OUTBOX_KEY } from '../data/stagedImageStore'
import { purgeDirtySidecars } from './dirty'
import { SHARE_CACHE } from '../sw/shareTarget'
import { pendingImageJobs } from '../data/imageJobs/pendingJobs'

// Local caches that hold the signed-in user's data. Cleared on sign-out so the
// next account on a shared device never sees the previous user's content.
// NOT cleared: device preferences (theme/font) and device-local API keys, and —
// importantly — the local backend's simulated "remote" (tattoo_remote_*,
// tattoo-blobs-v1), which is the source of truth under VITE_BACKEND=local.
// Owner-scoped tattoo_backup_status_* and tattoo_persistence_ack_* stay with
// that owner's library; the signed-out app shell unmounts their indicators.
const PURGE_KEYS = [
  'tattoo_ideas',
  'tattoo_concepts',
  'tattoo_boards',
  'tattoo_artists_meta',
  'tattoo_convention_attending',
  // Winners, but not tattoo_convention_lineups: a line-up is a show's published
  // exhibitor list, the same for everyone and no one's private data. A winners
  // board carries photos the user took of the winning pieces, so it leaves with
  // them.
  'tattoo_convention_winners',
  // Retired with the legacy photo cache (#149), still cleared on devices that
  // set them: the one-time migration flag and the sweep's ledger (#118).
  'tattoo_img_migrated_v1',
  'tattoo_legacy_sweep_v1',
  // Photos still waiting to upload (#115): the queue here, the bytes in
  // STAGED_IMAGES_DB below. Unsynced, like the dirty sidecars, so they go too.
  UPLOAD_OUTBOX_KEY,
  DEVICE_COPIES_KEY,
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
  await pendingImageJobs.clearAll()
  // Display image cache only — canonical rows (tattoo_remote_<owner>_*) and
  // tattoo-blobs-v1 stay. Private adapters enforce their captured owner; these
  // are the only durable copy for real-auth/local-storage accounts, not caches.
  await deleteDatabaseAsync('tattoo-images-v1')
  await deleteDatabaseAsync(STAGED_IMAGES_DB)
  // An uncollected shared screenshot is this user's content sitting in an
  // origin-scoped cache — without this, A shares, closes before collecting,
  // and B signs in and picks up A's image from /share.
  try {
    await globalThis.caches?.delete?.(SHARE_CACHE)
  } catch (e) {
    console.error('[tattoo] purge share cache failed:', e)
  }
}
