// Persistent on-device cache of image style embeddings (issue #19).
// Device-local by design — like tattoo_theme / API keys, embeddings are
// derivable from the images, so they are never synced; each device builds its
// own index. Keyed by `${modelId}:${identity}` (identity = refIdentity of the
// stored photo, stable across sessions) so a model swap silently starts a
// fresh index instead of mixing incompatible vector spaces.
//
// Same hand-rolled IndexedDB pattern as backend/local/localBlobs.js.
import { refIdentity } from './imageRef'
import { resolveImage } from './imageResolver'
import { EMBEDDING_MODEL_ID, getEmbedder } from './embedder'

// v2 keys vectors by photo identity (refIdentity), not by display URL: a signed
// url changes every session, so the v1 index re-embedded every photo each time
// (#116). Vectors are derivable, so v1 is simply dropped.
const DB_NAME = 'tattoo-style-index-v2'
const LEGACY_DB_NAME = 'tattoo-style-index-v1'
const STORE = 'vectors'

// One cached connection per session — also lets clearStyleIndex close it, so
// deleteDatabase isn't blocked forever by our own open handle.
let dbPromise = null

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
      req.onsuccess = (e) => {
        resolve(e.target.result)
        indexedDB.deleteDatabase(LEGACY_DB_NAME) // fire and forget; vectors are derivable
      }
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function dbGetMany(keys) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out = new Map()
    for (const key of keys) {
      const req = store.get(key)
      req.onsuccess = () => {
        if (req.result) out.set(key, req.result)
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

async function dbPut(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

const vecKey = (identity) => `${EMBEDDING_MODEL_ID}:${identity}`

// identity -> the ref it came from (first seen), in collection order.
function collectRefs(artists) {
  const refs = new Map()
  for (const artist of artists) {
    for (const image of artist.images || []) {
      const id = refIdentity(image)
      if (id && !refs.has(id)) refs.set(id, image)
    }
  }
  return refs
}

// Map of photo identity → vector for every already-indexed photo.
export async function loadVectors(artists) {
  const ids = [...collectRefs(artists).keys()]
  const rows = await dbGetMany(ids.map(vecKey))
  const out = new Map()
  for (const id of ids) {
    const vec = rows.get(vecKey(id))
    if (vec) out.set(id, vec)
  }
  return out
}

// Embed every not-yet-indexed photo in the collection. Incremental (existing
// vectors are skipped) and fault-tolerant (one bad photo doesn't kill the
// build). Returns the full identity → vector map when done.
export async function buildStyleIndex(artists, { onProgress } = {}) {
  const refs = collectRefs(artists)
  const existing = await loadVectors(artists)
  const missing = [...refs].filter(([id]) => !existing.has(id))
  const total = refs.size
  let done = total - missing.length
  onProgress?.({ done, total })
  if (!missing.length) return existing

  const embed = await getEmbedder()
  for (const [id, ref] of missing) {
    try {
      // Resolved here, not stored: a photo that can't be fetched right now is
      // skipped and picked up by a later build.
      const src = await resolveImage(ref)
      if (src) {
        const vec = await embed(src)
        await dbPut(vecKey(id), vec)
        existing.set(id, vec)
      }
    } catch (e) {
      console.error('[tattoo] style-index embed failed:', id, e)
    }
    done++
    onProgress?.({ done, total })
  }
  return existing
}

// One-off embedding with a stable cache key, for images that aren't part of
// the artist library — e.g. a concept image, whose display URL may be a
// short-lived object URL that changes every session while the concept id does
// not. Returns null (rather than throwing) when the image can't be embedded,
// so callers can render a soft failure state.
export async function vectorFor(src, cacheKey) {
  const key = `${EMBEDDING_MODEL_ID}:${cacheKey}`
  const cached = await dbGetMany([key])
  if (cached.has(key)) return cached.get(key)
  try {
    const embed = await getEmbedder()
    const vec = await embed(src)
    await dbPut(key, vec)
    return vec
  } catch (e) {
    console.error('[tattoo] one-off embed failed:', cacheKey, e)
    return null
  }
}

// Test/reset helper: drops the whole index database (closing our own
// connection first so the delete isn't blocked by it).
export async function clearStyleIndex() {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null)
    db?.close()
    dbPromise = null
  }
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}
