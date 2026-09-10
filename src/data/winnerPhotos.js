// Photos of the winning tattoos, kept out of localStorage on purpose.
//
// The first cut of the winners feature stored each photo as a data URL inside
// the `tattoo_convention_winners` record. That works for one small image and
// falls over for real use: the way winners actually reach this app is a handful
// of screenshots off Instagram, and a dozen of those blow the browser's ~5MB
// per-origin localStorage quota — taking the gallery's whole offline cache down
// with them, because they share the quota.
//
// So the split is the one the style index already uses: the synced-shaped record
// keeps a short id, and the bytes live in IndexedDB, which is measured in
// hundreds of megabytes rather than five. Device-local, never synced, and
// cleared on sign-out along with the rest of the winners data — the photos are
// someone's copyrighted work and, often, a photo of an identifiable person.
//
// Same hand-rolled IndexedDB pattern as backend/local/localBlobs.js.

const DB_NAME = 'tattoo-winner-photos-v1'
const STORE = 'photos'

// A post carries the piece from a few angles plus the trophy shot. More than
// this and it stops being a record of what won and starts being an album.
export const MAX_PHOTOS_PER_WINNER = 6

// One cached connection per session — also lets clearWinnerPhotos close it, so
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

export function newPhotoId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function putPhoto(id, dataUrl) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dataUrl, id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

// One transaction for the whole board rather than one per row: a convention card
// opens with every winner at once, and a request per photo is a request per row.
export async function loadPhotos(ids = []) {
  const out = new Map()
  if (!ids.length) return out
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    for (const id of ids) {
      const req = store.get(id)
      req.onsuccess = () => {
        if (req.result) out.set(id, req.result)
      }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

export async function deletePhoto(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearWinnerPhotos() {
  const db = await openDB().catch(() => null)
  if (!db) return
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export function withPhotoId(entry = {}, id) {
  const current = entry.photoIds || []
  if (current.includes(id)) return entry
  return { ...entry, photoIds: [...current, id].slice(0, MAX_PHOTOS_PER_WINNER) }
}

export function withoutPhotoId(entry = {}, id) {
  return { ...entry, photoIds: (entry.photoIds || []).filter((p) => p !== id) }
}

// Every id on a board, deduped, so a card loads its photos in one transaction.
export function photoIdsFor(entries = []) {
  const seen = []
  for (const entry of entries) {
    for (const id of entry.photoIds || []) if (!seen.includes(id)) seen.push(id)
  }
  return seen
}
