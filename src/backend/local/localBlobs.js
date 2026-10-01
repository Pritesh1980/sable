// Local BlobStore — stores uploaded images in their own IndexedDB database,
// keyed by the canonical blob key. Blobs are persisted as data-URL strings so
// getUrl can return a directly-usable, offline value with no Object URL
// lifecycle to manage (and so it works under jsdom/fake-indexeddb in tests).

import { createOwnerScope } from '../ownerScope'

const DB_NAME = 'tattoo-blobs-v1'
const STORE = 'blobs'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
    req.onsuccess = (e) => {
      const db = e.target.result
      // See the matching comment in useArtistStorage.js's openDB() — auto-close
      // on versionchange so a purge's deleteDatabase never blocks (#28 review).
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(key, value, assertCurrent) {
  const db = await openDB()
  try { assertCurrent() } catch (e) { db.close(); throw e }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function dbGet(key, assertCurrent) {
  const db = await openDB()
  try { assertCurrent() } catch (e) { db.close(); throw e }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => { db.close(); resolve(req.result ?? '') }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

async function dbDelete(key, assertCurrent) {
  const db = await openDB()
  try { assertCurrent() } catch (e) { db.close(); throw e }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
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

export function createLocalBlobs({ ownerScope, allowLegacy = !ownerScope } = {}) {
  const scope = ownerScope || createOwnerScope({ privateMode: !allowLegacy, getOwnerId: () => null })
  function capture(key, upload) {
    const snapshot = scope.capture()
    if (!allowLegacy && (typeof key !== 'string' || !key.startsWith(`user/${snapshot.ownerId}/`) ||
        (upload && upload.userId !== snapshot.ownerId))) {
      throw Object.assign(new Error('Blob owner mismatch'), { code: 'owner_changed' })
    }
    return () => scope.assertCurrent(snapshot)
  }
  return {
    async upload(userId, key, blob) {
      const assertCurrent = capture(key, { userId })
      const data = await blobToDataUrl(blob)
      assertCurrent()
      await dbPut(key, data, assertCurrent)
      assertCurrent()
      return { key }
    },
    async getUrl(key) {
      const assertCurrent = capture(key)
      const url = await dbGet(key, assertCurrent)
      assertCurrent()
      return url
    },
    async remove(key) {
      const assertCurrent = capture(key)
      await dbDelete(key, assertCurrent)
      assertCurrent()
    },
  }
}
