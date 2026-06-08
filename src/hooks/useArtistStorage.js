import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_ARTISTS } from '../data/artists'
import { backend } from '../backend'
import { useAuth } from '../context/useAuth'
import { isOwner } from '../backend/owner'
import { reconcileRecords, nowStamp } from '../backend/sync'

const META_KEY = 'tattoo_artists_meta'
const OLD_KEY = 'tattoo_artists'
const COLLECTION = 'artistsMeta'
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
  return artists.map((artist) => {
    const rest = { ...artist }
    delete rest.images
    return rest
  })
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

function saveMeta(artists) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(stripImages(artists)))
  } catch (e) {
    console.error('[tattoo] Failed to save artist metadata:', e)
  }
}

// Re-attach images (from the IndexedDB map + DEFAULT_ARTISTS static paths) onto a
// list of stripped metadata records.
function mergeImages(metaList, imageMap) {
  return metaList.map((a) => {
    const def = DEFAULT_ARTISTS.find((d) => d.id === a.id)
    const idbImages = imageMap[a.id] || []
    const staticImages = def?.images || []
    const idbStatic = new Set(
      idbImages.filter((s) => typeof s === 'string' && !s.startsWith('data:'))
    )
    const merged = [...idbImages, ...staticImages.filter((s) => !idbStatic.has(s))]
    return { ...a, images: merged.length ? merged : staticImages }
  })
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useArtistStorage() {
  const auth = useAuth()
  const user = auth?.user || null

  // Raw cached metadata (no applyDefaults) captured once — this is the user's
  // actual stored data, distinct from the DEFAULT_ARTISTS fallback used only for
  // instant first render. The sync effect applies owner rules against this.
  const [initialRawCache] = useState(() => {
    try {
      const s = localStorage.getItem(META_KEY)
      return s ? JSON.parse(s) : null
    } catch {
      return null
    }
  })

  const [artists, setArtistsRaw] = useState(() => {
    const meta = initialRawCache ? applyDefaults(initialRawCache) : DEFAULT_ARTISTS
    return meta.map((a) => ({ ...a, images: [] }))
  })

  const artistsRef = useRef(artists)
  const imageMapRef = useRef({})
  const syncedRef = useRef(null) // last metadata list known in sync with remote
  const pushTimer = useRef(null)

  useEffect(() => { artistsRef.current = artists }, [artists])

  // On mount: migrate images from the old localStorage key, then load from
  // IndexedDB and merge them onto whatever metadata is current.
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
        imageMapRef.current = imageMap
        setArtistsRaw((prev) => mergeImages(stripImages(prev), imageMap))
      } catch (e) {
        console.error('[tattoo] Failed to load images:', e)
      }
    }
    init()
  }, [])

  // Sync metadata once the user is known. Owner-only seeding: the owner keeps the
  // curated DEFAULT_ARTISTS (migrating any local edits up); everyone else starts
  // from whatever is in their own remote collection (empty for a fresh account).
  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const remote = await backend.store.list(COLLECTION)
        if (cancelled) return
        const owner = isOwner(user)
        // Baseline = the user's own raw cache (never the default seed). The owner
        // additionally gets DEFAULT_ARTISTS folded in; non-owners never do.
        const localMeta = initialRawCache || []
        let nextMeta

        if (remote.length > 0) {
          const merged = reconcileRecords(
            localMeta.map((a) => ({ ...a, updatedAt: a.updatedAt || '' })),
            remote
          )
          nextMeta = owner ? applyDefaults(merged) : merged
        } else {
          // Remote empty → seed/migrate local data up. Owner seeds the curated
          // defaults (preserving any local edits); a non-owner keeps only their
          // own data.
          const base = owner
            ? (localMeta.length ? applyDefaults(localMeta) : applyDefaults([]))
            : localMeta
          nextMeta = base
          syncedRef.current = nextMeta
          if (base.length) {
            const at = nowStamp()
            await backend.store.upsert(
              COLLECTION,
              base.map((a) => ({ ...a, updatedAt: a.updatedAt || at }))
            )
          }
        }

        if (cancelled) return
        syncedRef.current = nextMeta
        setArtistsRaw(mergeImages(nextMeta, imageMapRef.current))
      } catch (e) {
        console.error('[tattoo] artist meta sync failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [user, initialRawCache])

  // Persist metadata to the offline cache on every change.
  useEffect(() => {
    saveMeta(artists)
  }, [artists])

  const flushMeta = useCallback(() => {
    if (!user) return
    const meta = stripImages(artistsRef.current)
    const at = nowStamp()
    const rows = meta.map((a) => ({ ...a, updatedAt: at }))
    const prev = syncedRef.current
    syncedRef.current = meta

    const tasks = [backend.store.upsert(COLLECTION, rows)]
    if (Array.isArray(prev)) {
      const live = new Set(rows.map((r) => r.id))
      const removed = prev.map((r) => r.id).filter((id) => !live.has(id))
      if (removed.length) tasks.push(backend.store.remove(COLLECTION, removed))
    }
    Promise.all(tasks).catch((e) =>
      console.error('[tattoo] artist meta push failed:', e)
    )
  }, [user])

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
    if (user) {
      clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(flushMeta, 500)
    }
  }

  useEffect(() => () => clearTimeout(pushTimer.current), [])

  return [artists, setArtists]
}
