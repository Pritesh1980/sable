// Where artist photos lived before they were blobs (moved verbatim from
// useArtistStorage, #112):
//   - IndexedDB `tattoo-images-v1` was the display cache. Nothing writes it
//     any more (#118); what is left in it is read for the overlay below and
//     swept into blob storage by src/data/legacyPhotoSweep.js;
//   - `tattoo_artists` was the pre-split localStorage key that held photos
//     inline. Its one-time import is the last thing that puts photos in the
//     cache, so the sweep can pick them up.
// Nothing here knows about sync; artistsPolicy.js decides when each runs.

import { keyForUrl } from './blobUrls'
import { ledgerEntry } from './legacyPhotoSweep'

export const OLD_KEY = 'tattoo_artists'
const DB_NAME = 'tattoo-images-v1'
const STORE = 'artist-images'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
    req.onsuccess = (e) => {
      const db = e.target.result
      // If this connection outlives its own operation (an in-flight write
      // racing a sign-out), auto-close on versionchange so a purge's
      // deleteDatabase never blocks — a blocked delete stays queued and can
      // silently fire later, wiping whatever a new user has since written to
      // a recreated DB (#28 review, codex + agy).
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function dbPut(id, images) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(images, id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function dbGetAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const out = {}
    tx.objectStore(STORE).openCursor().onsuccess = (e) => {
      const c = e.target.result
      if (c) { out[c.key] = c.value; c.continue() }
      else { db.close(); resolve(out) }
    }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// Legacy-cache overlay (#116): a photo that exists only as an un-keyed data url in the legacy
// IndexedDB cache still has to show until the sweep stages it (#118). Prepended
// like the old buildArtists legacy path. A data url that is registered to a key
// is NOT legacy — the local backend resolves every blob to one, and showing it
// as well as its { key } would duplicate the photo. Nor is one the sweep's
// ledger has decided on: swept or matched (the artist holds its key) or
// deleted by the user while it was still inline.
export function withLegacyLocalPhotos(artist, idbImages, ledger = {}) {
  const have = new Set(artist.images || [])
  const legacy = Array.isArray(idbImages)
    ? idbImages.filter((s) =>
      typeof s === 'string' && s.startsWith('data:') && !keyForUrl(s) && !have.has(s) &&
      !ledgerEntry(ledger, artist.id, s))
    : []
  return legacy.length ? { ...artist, images: [...legacy, ...(artist.images || [])] } : artist
}

// Move artists (and their photos) out of the pre-split `tattoo_artists` key:
// photos into IndexedDB, metadata via `saveMeta` unless the new key already
// exists, then the old key is gone. A no-op when the old key is absent.
export async function importOldArtistsKey({ hasMeta, saveMeta }) {
  const oldRaw = localStorage.getItem(OLD_KEY)
  if (!oldRaw) return
  const old = JSON.parse(oldRaw)
  await Promise.all(
    old.filter((a) => a.images?.length).map((a) => dbPut(a.id, a.images))
  )
  if (!hasMeta()) saveMeta(old)
  localStorage.removeItem(OLD_KEY)
}
