// Persistent on-device cache of image style embeddings (issue #19).
// Device-local by design — like tattoo_theme / API keys, embeddings are
// derivable from the images, so they are never synced; each device builds its
// own index. Keyed by `${modelId}:${imageSrc}` so a model swap silently starts
// a fresh index instead of mixing incompatible vector spaces.
//
// Same hand-rolled IndexedDB pattern as backend/local/localBlobs.js.
import { getImageUrl } from './planning'
import { EMBEDDING_MODEL_ID, getEmbedder } from './embedder'

const DB_NAME = 'tattoo-style-index-v1'
const STORE = 'vectors'

// One cached connection per session — also lets clearStyleIndex close it, so
// deleteDatabase isn't blocked forever by our own open handle.
let dbPromise = null

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
      req.onsuccess = (e) => resolve(e.target.result)
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

const vecKey = (src) => `${EMBEDDING_MODEL_ID}:${src}`

const collectSrcs = (artists) => {
  const srcs = []
  for (const artist of artists) {
    for (const image of artist.images || []) {
      const src = getImageUrl(image)
      if (src) srcs.push(src)
    }
  }
  return [...new Set(srcs)]
}

// Map of image src → vector for every already-indexed image in the collection.
export async function loadVectors(artists) {
  const srcs = collectSrcs(artists)
  const rows = await dbGetMany(srcs.map(vecKey))
  const out = new Map()
  for (const src of srcs) {
    const vec = rows.get(vecKey(src))
    if (vec) out.set(src, vec)
  }
  return out
}

// Embed every not-yet-indexed image in the collection. Incremental (existing
// vectors are skipped) and fault-tolerant (one bad image doesn't kill the
// build). Returns the full src → vector map when done.
export async function buildStyleIndex(artists, { onProgress } = {}) {
  const srcs = collectSrcs(artists)
  const existing = await loadVectors(artists)
  const missing = srcs.filter((src) => !existing.has(src))
  const total = srcs.length
  let done = total - missing.length
  onProgress?.({ done, total })
  if (!missing.length) return existing

  const embed = await getEmbedder()
  for (const src of missing) {
    try {
      const vec = await embed(src)
      await dbPut(vecKey(src), vec)
      existing.set(src, vec)
    } catch (e) {
      console.error('[tattoo] style-index embed failed:', src, e)
    }
    done++
    onProgress?.({ done, total })
  }
  return existing
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
