// Local BlobStore — stores uploaded images in their own IndexedDB database,
// keyed by the canonical blob key. Blobs are persisted as data-URL strings so
// getUrl can return a directly-usable, offline value with no Object URL
// lifecycle to manage (and so it works under jsdom/fake-indexeddb in tests).

const DB_NAME = 'tattoo-blobs-v1'
const STORE = 'blobs'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
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

async function dbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? '')
    req.onerror = () => reject(req.error)
  })
}

async function dbDelete(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

function blobToDataUrl(blob) {
  // Already a data-URL string? pass through (migration hands us these directly).
  if (typeof blob === 'string') return Promise.resolve(blob)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function createLocalBlobs() {
  return {
    async upload(_userId, key, blob) {
      await dbPut(key, await blobToDataUrl(blob))
      return { key }
    },
    async getUrl(key) {
      return dbGet(key)
    },
    async remove(key) {
      await dbDelete(key)
    },
  }
}
