import { useState, useEffect } from 'react'
import { DEFAULT_ARTISTS } from '../data/artists'

const META_KEY = 'tattoo_artists_meta'
const OLD_KEY = 'tattoo_artists'
const DB_NAME = 'tattoo-images-v1'
const STORE = 'artist-images'

// ── IndexedDB ────────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(id, images) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(images, id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

async function dbGetAll() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const out = {}
    tx.objectStore(STORE).openCursor().onsuccess = (e) => {
      const c = e.target.result
      if (c) { out[c.key] = c.value; c.continue() }
      else resolve(out)
    }
    tx.onerror = () => reject(tx.error)
  })
}

// ── Metadata (localStorage, no images) ───────────────────────────────────────

export function stripImages(artists) {
  return artists.map(({ images: _images, ...rest }) => rest)
}

// Fill in any fields present in defaults but missing from a stored record,
// and append any DEFAULT_ARTISTS entries not yet in the stored list.
export function applyDefaults(artists) {
  const merged = artists.map((a) => {
    const def = DEFAULT_ARTISTS.find((d) => d.id === a.id)
    if (!def) return a
    const out = { ...a }
    for (const key of Object.keys(def)) {
      if (!(key in a)) out[key] = def[key]
    }
    return out
  })
  const storedIds = new Set(artists.map((a) => a.id))
  const nextRank = merged.length > 0 ? Math.max(...merged.map((a) => a.rank ?? 0)) + 1 : 1
  DEFAULT_ARTISTS.filter((d) => !storedIds.has(d.id)).forEach((d, i) => {
    merged.push({ ...d, rank: nextRank + i })
  })
  return merged
}

function loadMeta() {
  try {
    const stored = localStorage.getItem(META_KEY)
    if (stored) return applyDefaults(JSON.parse(stored))
  } catch {}
  return null
}

function saveMeta(artists) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(stripImages(artists)))
  } catch (e) {
    console.error('[tattoo] Failed to save artist metadata:', e)
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useArtistStorage() {
  const [artists, setArtistsRaw] = useState(() => {
    const meta = loadMeta() || DEFAULT_ARTISTS
    return meta.map((a) => ({ ...a, images: [] }))
  })

  // On mount: migrate images from old localStorage key, then load from IndexedDB
  useEffect(() => {
    async function init() {
      try {
        const oldRaw = localStorage.getItem(OLD_KEY)
        if (oldRaw) {
          const old = JSON.parse(oldRaw)
          await Promise.all(
            old.filter((a) => a.images?.length).map((a) => dbPut(a.id, a.images))
          )
          if (!localStorage.getItem(META_KEY)) {
            saveMeta(applyDefaults(old))
          }
          localStorage.removeItem(OLD_KEY)
        }

        const imageMap = await dbGetAll()
        setArtistsRaw((prev) =>
          prev.map((a) => {
            const def = DEFAULT_ARTISTS.find((d) => d.id === a.id)
            return { ...a, images: imageMap[a.id] || def?.images || [] }
          })
        )
      } catch (e) {
        console.error('[tattoo] Failed to load images:', e)
      }
    }
    init()
  }, [])

  // Persist metadata on every change
  useEffect(() => {
    saveMeta(artists)
  }, [artists])

  function setArtists(updater) {
    setArtistsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      // Save any changed image arrays to IndexedDB
      for (const a of next) {
        const prevA = prev.find((p) => p.id === a.id)
        if (!prevA || prevA.images !== a.images) {
          dbPut(a.id, a.images || []).catch((e) =>
            console.error(`[tattoo] Failed to save images for ${a.id}:`, e)
          )
        }
      }
      return next
    })
  }

  return [artists, setArtists]
}
