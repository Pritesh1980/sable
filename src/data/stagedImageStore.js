// Where a photo waits for its upload (#115). Two halves, both device-local:
//
//   - the bytes, in their own IndexedDB database, keyed by the photo's blob
//     key and held as a data-URL string (the same form the local adapter's
//     blob store uses, so getUrl-style reads hand back something displayable);
//   - the outbox, a small list in localStorage of the keys still to upload —
//     { key, userId, contentType, stagedAt }, never any bytes.
//
// Two small localStorage lists index them: the outbox (keys still to upload)
// and the device copies (every key whose bytes were kept here, uploaded or
// not, so an offline reload can still show it). Membership is a synchronous
// read, so resolving keys that were never staged on this device never touches
// IndexedDB at all.
//
// Neither half is synced, and sign-out purges both (src/backend/purge.js).

export const STAGED_IMAGES_DB = 'tattoo-staged-images-v1'
export const UPLOAD_OUTBOX_KEY = 'tattoo_upload_outbox'
export const DEVICE_COPIES_KEY = 'tattoo_device_copies'
const STORE = 'images'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STAGED_IMAGES_DB, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
    req.onsuccess = (e) => {
      const db = e.target.result
      // Same reason as the other stores' openDB: never let a connection that
      // outlives its operation block sign-out's deleteDatabase (#28 review).
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function request(mode, run) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const fail = (error) => { db.close(); reject(error) }
    try {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => { db.close(); resolve(req.result) }
      tx.onerror = () => fail(tx.error)
      tx.onabort = () => fail(tx.error)
    } catch (e) {
      fail(e)
    }
  }))
}

export function putStagedBytes(key, dataUrl) {
  return request('readwrite', (store) => store.put(dataUrl, key))
}

// '' when nothing is stored under the key; rejects when the store can't be read.
export async function getStagedBytes(key) {
  return (await request('readonly', (store) => store.get(key))) || ''
}

export function deleteStagedBytes(key) {
  return request('readwrite', (store) => store.delete(key))
}

export function readOutbox() {
  try {
    const entries = JSON.parse(localStorage.getItem(UPLOAD_OUTBOX_KEY))
    return Array.isArray(entries) ? entries : []
  } catch {
    return []
  }
}

// Throws when localStorage refuses the write (quota): staging treats that as
// "could not stage" rather than leaving bytes nobody knows to upload.
export function addToOutbox(entry) {
  const rest = readOutbox().filter((e) => e.key !== entry.key)
  localStorage.setItem(UPLOAD_OUTBOX_KEY, JSON.stringify([...rest, entry]))
}

export function removeFromOutbox(key) {
  const rest = readOutbox().filter((e) => e.key !== key)
  try {
    if (rest.length) localStorage.setItem(UPLOAD_OUTBOX_KEY, JSON.stringify(rest))
    else localStorage.removeItem(UPLOAD_OUTBOX_KEY)
  } catch (e) {
    console.error('[tattoo] could not update the upload outbox:', e)
  }
}

function readCopies() {
  try {
    const keys = JSON.parse(localStorage.getItem(DEVICE_COPIES_KEY))
    return Array.isArray(keys) ? keys : []
  } catch {
    return []
  }
}

// Throws on a refused write, like addToOutbox.
export function markDeviceCopy(key) {
  const keys = readCopies()
  if (!keys.includes(key)) localStorage.setItem(DEVICE_COPIES_KEY, JSON.stringify([...keys, key]))
}

export function isStaged(key) {
  return Boolean(key) && (readCopies().includes(key) || readOutbox().some((e) => e.key === key))
}

// The device copy for a key, for display: '' when this device never kept one
// (answered without opening IndexedDB) or it can't be read. Confirmed uploads
// keep their copy, so this is not tied to the outbox. Never rejects.
export async function readStagedImage(key) {
  if (!isStaged(key)) return ''
  try {
    return await getStagedBytes(key)
  } catch (e) {
    console.error('[tattoo] could not read a staged image:', key, e)
    return ''
  }
}
