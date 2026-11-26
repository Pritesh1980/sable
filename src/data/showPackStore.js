import { backend as defaultBackend } from '../backend'

// Where offline show packs live (#209): one IndexedDB database on this device,
// never synced, deleted on sign-out (src/backend/purge.js).
//
//   packs   [ownerId, editionKey] -> the pack: snapshot text, photo refs,
//           the last run's results and the last check of the bytes
//   photos  [ownerId, identity]   -> { type, size, sha256, bytes: ArrayBuffer }
//
// Every key starts with the owner, and every read is scoped to one, so a pack
// prepared by one account is invisible to the next even if a purge failed.
// Photos are shared between one owner's packs (an artist going to two shows
// is stored once); removing a pack only drops photos no other pack of that
// owner still lists (showPackPrepare.js). Bytes are an ArrayBuffer rather than
// a Blob: it survives structured cloning everywhere, Safari included.
//
// These are copies. Nothing here is the original of anything: the library's
// photos stay where they are (blob storage, staged copies, static files), and
// nothing in this module can reach them.

export const SHOW_PACKS_DB = 'tattoo-show-packs-v1'
const PACKS = 'packs'
const PHOTOS = 'photos'

function requireOwner(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId) throw new Error('A show pack needs an owner')
  return ownerId
}

// Every key of one owner, whatever the second part: arrays sort after strings
// in IndexedDB, so [owner, []] is past every [owner, '<string>'].
const ownerRange = (ownerId) => IDBKeyRange.bound([ownerId, ''], [ownerId, []])

export function createShowPackStore({ dbName = SHOW_PACKS_DB } = {}) {
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(PACKS)) db.createObjectStore(PACKS)
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS)
      }
      req.onsuccess = (e) => {
        const db = e.target.result
        // Never let a connection block sign-out's deleteDatabase.
        db.onversionchange = () => db.close()
        resolve(db)
      }
      req.onerror = () => reject(req.error)
    })
  }

  // One short transaction per call, closed when it settles. A quota failure
  // surfaces as the transaction's error (QuotaExceededError), so callers can
  // tell a full disk from anything else.
  async function run(storeName, mode, work) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      let result
      try {
        const tx = db.transaction(storeName, mode)
        const req = work(tx.objectStore(storeName))
        if (req) req.onsuccess = () => { result = req.result }
        tx.oncomplete = () => { db.close(); resolve(result) }
        tx.onerror = () => { db.close(); reject(tx.error) }
        tx.onabort = () => { db.close(); reject(tx.error) }
      } catch (error) {
        db.close()
        reject(error)
      }
    })
  }

  const owned = (ownerId) => (record) => (record && record.ownerId === ownerId ? record : null)

  return {
    async getPack(ownerId, editionKey) {
      requireOwner(ownerId)
      return owned(ownerId)(await run(PACKS, 'readonly', (s) => s.get([ownerId, editionKey]))) || null
    },
    async putPack(pack) {
      requireOwner(pack?.ownerId)
      await run(PACKS, 'readwrite', (s) => s.put(pack, [pack.ownerId, pack.editionKey]))
    },
    async deletePack(ownerId, editionKey) {
      requireOwner(ownerId)
      await run(PACKS, 'readwrite', (s) => s.delete([ownerId, editionKey]))
    },
    async listPacks(ownerId) {
      requireOwner(ownerId)
      const all = await run(PACKS, 'readonly', (s) => s.getAll(ownerRange(ownerId)))
      return (all || []).filter(owned(ownerId))
    },
    async getPhoto(ownerId, id) {
      requireOwner(ownerId)
      return owned(ownerId)(await run(PHOTOS, 'readonly', (s) => s.get([ownerId, id]))) || null
    },
    async putPhoto(record) {
      requireOwner(record?.ownerId)
      await run(PHOTOS, 'readwrite', (s) => s.put(record, [record.ownerId, record.id]))
    },
    async deletePhotos(ownerId, ids = []) {
      requireOwner(ownerId)
      if (!ids.length) return
      await run(PHOTOS, 'readwrite', (s) => { for (const id of ids) s.delete([ownerId, id]) })
    },
    async listPhotoIds(ownerId) {
      requireOwner(ownerId)
      const keys = await run(PHOTOS, 'readonly', (s) => s.getAllKeys(ownerRange(ownerId)))
      return (keys || []).map((key) => key[1])
    },
  }
}

export const showPackStore = createShowPackStore()

// The owner a pack belongs to, captured once per action: `assertCurrent`
// throws as soon as someone else is signed in, so a run started by one account
// can never write into the next one's packs. null when nobody owns anything.
export function currentPackOwner(backend = defaultBackend) {
  try {
    const snapshot = backend.ownerScope.capture()
    return { ownerId: snapshot.ownerId, assertCurrent: () => backend.ownerScope.assertCurrent(snapshot) }
  } catch {
    return null
  }
}
