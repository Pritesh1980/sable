// Where artist photos lived before they were blobs, and the one-time moves out
// of it (moved verbatim from useArtistStorage, #112):
//   - IndexedDB `tattoo-images-v1` is the display cache — the only place a
//     legacy photo's data URL exists until the migration uploads it;
//   - `tattoo_artists` was the pre-split localStorage key that held photos inline.
// Nothing here knows about sync; artistsPolicy.js decides when each runs.

import { backend } from '../backend'
import { keyForUrl, registerBlobUrl } from './blobUrls'
import { dataUrlToBlob } from './imageStaging'

export const OLD_KEY = 'tattoo_artists'
export const MIGRATED_FLAG = 'tattoo_img_migrated_v1'
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

// What the IndexedDB display cache keeps of an artist's photos. Its only reader
// is the legacy overlay below, which shows a cached data URL that has no key —
// so a photo that *has* a key goes in as its ref, never as the data URL it was
// added with. Otherwise, on a backend whose URLs are not the bytes (Supabase
// signs one per key), a reload resolves the key to a new URL, the cached data
// URL no longer maps back to it, and the photo shows twice (#115).
export function displayCacheImages(images = []) {
  return images.map((img) => {
    const url = typeof img === 'string' ? img : img?.url
    const key = typeof url === 'string' ? keyForUrl(url) : null
    if (!key) return img
    return typeof img === 'object' && img.addedAt ? { key, addedAt: img.addedAt } : { key }
  })
}

// D2 (#116): a photo that exists only as an un-keyed data url in the legacy
// IndexedDB cache (never migrated) still has to show. Prepended like the old
// buildArtists legacy path; retired by the #118 sweep. A data url that is
// registered to a key is NOT legacy — the local backend resolves every blob to
// one, and showing it as well as its { key } would duplicate the photo.
export function withLegacyLocalPhotos(artist, idbImages) {
  const have = new Set(artist.images || [])
  const legacy = Array.isArray(idbImages)
    ? idbImages.filter((s) => typeof s === 'string' && s.startsWith('data:') && !keyForUrl(s) && !have.has(s))
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

// One-time migration: upload every legacy data-URL sitting in IndexedDB to the
// blob store and register key↔url so canonicalizeImages can map them to { key }.
// Local data-URLs are left in IndexedDB (display cache) and not deleted here.
// Returns the { artistId, key } pairs it actually uploaded, so the caller can
// fold them into the artists' `images` — otherwise a freshly-migrated image is
// registered (has a key), so the legacy overlay no longer shows it, but is not
// yet in any artist's images, and would be dropped from display and from the
// metadata pushed right after.
export async function migrateLegacyImages(userId, imageMap) {
  const migrated = []
  for (const [artistId, images] of Object.entries(imageMap)) {
    if (!Array.isArray(images)) continue
    for (const img of images) {
      if (typeof img !== 'string' || !img.startsWith('data:')) continue
      if (keyForUrl(img)) continue
      const key = `user/${userId}/artists/${artistId}/${crypto.randomUUID?.() || Date.now()}.jpg`
      try {
        // Bytes, not the data-URL text: a string body is stored verbatim by a
        // real blob store (#110); the local adapter merely tolerated it.
        await backend.blobs.upload(userId, key, dataUrlToBlob(img), 'image/jpeg')
        registerBlobUrl(key, img)
        migrated.push({ artistId, key })
      } catch (e) {
        console.error('[tattoo] image migration failed for', artistId, e)
      }
    }
  }
  return migrated
}
