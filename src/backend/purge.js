import { clearBlobUrls } from '../data/blobUrls'

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

export function purgeLocalUserData() {
  try {
    PURGE_KEYS.forEach((k) => localStorage.removeItem(k))
  } catch (e) {
    console.error('[tattoo] purge localStorage failed:', e)
  }
  clearBlobUrls()
  try {
    // Display image cache only — the simulated remote (tattoo-blobs-v1) stays.
    indexedDB.deleteDatabase('tattoo-images-v1')
  } catch (e) {
    console.error('[tattoo] purge IndexedDB failed:', e)
  }
}
