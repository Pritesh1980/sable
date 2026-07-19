import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_ARTISTS } from '../data/artists'
import { backend } from '../backend'
import { useAuth } from '../context/useAuth'
import { isOwner } from '../backend/owner'
import { reconcileRecords, nowStamp } from '../backend/sync'
import {
  stampChangedRows,
  setDirty,
  isDirty,
  clearDirty,
  readPendingDeletes,
  addPendingDeletes,
  clearPendingDeletes,
} from '../backend/dirty'
import { resolveBlobKey, keyForUrl, registerBlobUrl } from '../data/blobUrls'

const META_KEY = 'tattoo_artists_meta'
const OLD_KEY = 'tattoo_artists'
const COLLECTION = 'artistsMeta'
const MIGRATED_FLAG = 'tattoo_img_migrated_v1'
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

// Turn in-memory display images (URL strings, or { url/key, addedAt } refs from
// the quick-add/drop-zone flows) into canonical, syncable refs: blob-backed
// URLs → { key } (small), static paths / external URLs → string — carrying
// `addedAt` through wherever it's present. Un-migrated data-URLs (no key yet)
// are dropped from the synced/cached metadata so base64 never lands in
// localStorage or the remote store — they remain in IndexedDB for local
// display until the one-time migration uploads them.
export function canonicalizeImages(images = []) {
  const out = []
  for (const img of images) {
    if (img && typeof img === 'object') {
      if (img.key) { out.push(img); continue }
      if (typeof img.url === 'string') {
        const key = keyForUrl(img.url)
        if (key) { out.push(img.addedAt ? { key, addedAt: img.addedAt } : { key }); continue }
        if (img.url.startsWith('data:')) continue
        out.push(img.addedAt ? { url: img.url, addedAt: img.addedAt } : img.url)
        continue
      }
      out.push(img)
      continue
    }
    if (typeof img !== 'string') continue
    const key = keyForUrl(img)
    if (key) out.push({ key })
    else if (img.startsWith('data:')) continue
    else out.push(img)
  }
  return out
}

function canonicalizeArtist(a) {
  return { ...a, images: canonicalizeImages(a.images) }
}

function saveMeta(artists) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(artists.map(canonicalizeArtist)))
  } catch (e) {
    console.error('[tattoo] Failed to save artist metadata:', e)
  }
}

// Resolve canonical refs to displayable URL strings (awaiting blob keys),
// carrying `addedAt` through as { url, addedAt } wherever the ref has one.
export async function displayFromCanonical(refs = []) {
  const items = await Promise.all(
    refs.map(async (ref) => {
      if (typeof ref === 'string') return ref
      let url = ''
      if (ref?.key) url = (await resolveBlobKey(ref.key)) || ''
      else if (ref?.url) url = ref.url
      if (!url) return ''
      return ref.addedAt ? { url, addedAt: ref.addedAt } : url
    })
  )
  return items.filter(Boolean)
}

// Build display-ready artists from metadata + the IndexedDB image map. Prefer the
// local IndexedDB cache (instant, offline); otherwise resolve canonical refs from
// the record (cross-device). DEFAULT_ARTISTS static paths are merged in.
async function buildArtists(metaList, imageMap) {
  return Promise.all(
    metaList.map(async (a) => {
      const def = DEFAULT_ARTISTS.find((d) => d.id === a.id)
      const idbImages = imageMap[a.id]
      let display
      if (Array.isArray(idbImages) && idbImages.length) {
        const staticImages = def?.images || []
        const idbStatic = new Set(
          idbImages.filter((s) => typeof s === 'string' && !s.startsWith('data:'))
        )
        display = [...idbImages, ...staticImages.filter((s) => !idbStatic.has(s))]
      } else {
        const canonical = Array.isArray(a.images) && a.images.length ? a.images : (def?.images || [])
        display = await displayFromCanonical(canonical)
      }
      return { ...a, images: display }
    })
  )
}

// One-time migration: upload every legacy data-URL sitting in IndexedDB to the
// blob store and register key↔url so canonicalizeImages can map them to { key }.
// Local data-URLs are left in IndexedDB (display cache) and not deleted here.
async function migrateLegacyImages(userId, imageMap) {
  for (const [artistId, images] of Object.entries(imageMap)) {
    if (!Array.isArray(images)) continue
    for (const img of images) {
      if (typeof img !== 'string' || !img.startsWith('data:')) continue
      if (keyForUrl(img)) continue
      const key = `user/${userId}/artists/${artistId}/${crypto.randomUUID?.() || Date.now()}.jpg`
      try {
        await backend.blobs.upload(userId, key, img, 'image/jpeg')
        registerBlobUrl(key, img)
      } catch (e) {
        console.error('[tattoo] image migration failed for', artistId, e)
      }
    }
  }
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
  const editSeq = useRef(0)
  // Flushes are chained so two can never be in flight at once — with a real
  // async backend an older flush completing last would overwrite newer remote
  // rows and regress the synced baseline.
  const flushChain = useRef(Promise.resolve())

  useEffect(() => { artistsRef.current = artists }, [artists])

  // On mount: migrate images from the old localStorage key, then load from
  // IndexedDB and merge them onto whatever metadata is current (offline path).
  useEffect(() => {
    let cancelled = false
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
        const built = await buildArtists(artistsRef.current, imageMap)
        if (!cancelled) setArtistsRaw(built)
      } catch (e) {
        console.error('[tattoo] Failed to load images:', e)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // Sync metadata once the user is known. Owner-only seeding: the owner keeps the
  // curated DEFAULT_ARTISTS (migrating any local edits up); everyone else starts
  // from whatever is in their own remote collection (empty for a fresh account).
  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    ;(async () => {
      try {
        // One-time migration of legacy IndexedDB data-URLs → blob storage so they
        // gain keys and can sync across devices.
        const imageMap = await dbGetAll()
        imageMapRef.current = imageMap
        let didMigrate = false
        if (!localStorage.getItem(MIGRATED_FLAG)) {
          await migrateLegacyImages(user.id, imageMap)
          localStorage.setItem(MIGRATED_FLAG, '1')
          didMigrate = true
        }

        // Artists deleted locally but not yet remotely must not ride back in
        // on the pull; the remove is retried after reconcile. A pending delete
        // for a handle present in the local cache was superseded by a re-add.
        const cachedIds = new Set((initialRawCache || []).map((a) => a.id))
        const allPending = readPendingDeletes(META_KEY)
        const superseded = allPending.filter((id) => cachedIds.has(id))
        if (superseded.length) clearPendingDeletes(META_KEY, superseded)
        const pendingDeletes = allPending.filter((id) => !cachedIds.has(id))
        const remoteAll = await backend.store.list(COLLECTION)
        if (cancelled) return
        const remote = pendingDeletes.length
          ? remoteAll.filter((r) => !pendingDeletes.includes(r.id))
          : remoteAll
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
          nextMeta = owner
            ? (localMeta.length ? applyDefaults(localMeta) : applyDefaults([]))
            : localMeta
        }
        // Rows that predate edit-time stamping (legacy cache, fresh defaults)
        // get their stamp exactly once, HERE — and the same stamped rows go to
        // state, cache, baseline and the seeding push. Stamping throwaway
        // copies would leave every later flush fallback-restamping untouched
        // rows, outranking genuine cross-device edits.
        const seedAt = nowStamp()
        nextMeta = nextMeta.map((a) => (a.updatedAt ? a : { ...a, updatedAt: seedAt }))
        if (remote.length === 0 && nextMeta.length) {
          await backend.store.upsert(COLLECTION, nextMeta)
        }

        if (cancelled) return
        syncedRef.current = nextMeta
        const built = await buildArtists(nextMeta, imageMapRef.current)
        if (cancelled) return
        setArtistsRaw(built)

        // After migrating legacy images, push the now-keyed metadata so the keys
        // reach the remote store (and other devices can resolve them). Only
        // artists whose canonical image refs actually changed get a fresh
        // stamp — restamping the rest would outrank cross-device edits made
        // between our pull and this push.
        if (didMigrate) {
          const at = nowStamp()
          const beforeImages = new Map(
            nextMeta.map((a) => [a.id, JSON.stringify(canonicalizeImages(a.images || []))])
          )
          const canonical = built.map(canonicalizeArtist)
          const rows = canonical.map((a) => {
            const imagesChanged = JSON.stringify(a.images) !== beforeImages.get(a.id)
            return imagesChanged || !a.updatedAt ? { ...a, updatedAt: at } : a
          })
          await backend.store.upsert(COLLECTION, rows)
          syncedRef.current = rows
        }

        if (pendingDeletes.length) {
          backend.store
            .remove(COLLECTION, pendingDeletes)
            .then(() => clearPendingDeletes(META_KEY, pendingDeletes))
            .catch((e) => console.error('[tattoo] retry artist delete failed:', e))
        }
        // A dirty flag means an edit never fully reached the remote (failed
        // push, killed tab) — push the reconciled state up once it has
        // committed to artistsRef via the debounce window.
        if (!cancelled && isDirty(META_KEY)) {
          clearTimeout(pushTimer.current)
          pushTimer.current = setTimeout(() => {
            flushMetaRef.current?.().catch((e) =>
              console.error('[tattoo] artist meta push failed:', e)
            )
          }, 500)
        }
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

  const runFlushMeta = useCallback(async () => {
    if (!user) return
    const meta = artistsRef.current.map(canonicalizeArtist)
    const at = nowStamp()
    // Rows keep the stamp set when the edit happened; `at` only fills rows
    // that never got one (restamping all would outrank other devices' edits).
    const rows = meta.map((a) => ({ ...a, updatedAt: a.updatedAt || at }))
    const seq = editSeq.current

    // Record deletions durably BEFORE attempting them, and retry any that a
    // previous flush failed to land; syncedRef advances only on success, so a
    // failed write stays visible to the next flush or mount.
    const prev = syncedRef.current
    const live = new Set(rows.map((r) => r.id))
    const removed = Array.isArray(prev)
      ? prev.map((r) => r.id).filter((id) => !live.has(id))
      : []
    const allPending = addPendingDeletes(META_KEY, removed)
    // A pending delete whose handle is live again was superseded by a re-add —
    // drop it, or the late remove could destroy the recreated artist.
    const superseded = allPending.filter((id) => live.has(id))
    if (superseded.length) clearPendingDeletes(META_KEY, superseded)
    const pendingDeletes = allPending.filter((id) => !live.has(id))

    const tasks = [backend.store.upsert(COLLECTION, rows)]
    if (pendingDeletes.length) tasks.push(backend.store.remove(COLLECTION, pendingDeletes))
    await Promise.all(tasks)

    syncedRef.current = meta
    clearPendingDeletes(META_KEY, pendingDeletes)
    // A newer edit may have arrived while the writes were in flight; its own
    // flush is already scheduled, so only that flush may clear the flag.
    if (editSeq.current === seq) clearDirty(META_KEY)
  }, [user])

  const flushMeta = useCallback(() => {
    const p = flushChain.current.then(runFlushMeta, runFlushMeta)
    flushChain.current = p.then(() => {}, () => {})
    return p
  }, [runFlushMeta])

  const flushMetaRef = useRef(null)
  useEffect(() => { flushMetaRef.current = flushMeta }, [flushMeta])

  function setArtists(updater) {
    const at = nowStamp()
    setArtistsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      // Stamp what changed at edit time — saveMeta persists the stamp
      // immediately, so the edit survives a reload and wins last-write-wins
      // against older remote rows even if no push succeeds.
      const stamped = stampChangedRows(prev, next, at)
      // Tombstones become durable at the edit, not at the flush 500ms later —
      // a tab closed inside the debounce window must not lose the delete.
      const liveIds = new Set(stamped.map((a) => a?.id))
      const removed = prev
        .map((a) => (a && typeof a === 'object' ? a.id : undefined))
        .filter((id) => id !== undefined && !liveIds.has(id))
      if (removed.length) addPendingDeletes(META_KEY, removed)
      // Save any changed image arrays to IndexedDB (the stamping spread keeps
      // image array references, so this comparison still sees real changes).
      for (const a of stamped) {
        const prevA = prev.find((p) => p.id === a.id)
        if (!prevA || prevA.images !== a.images) {
          dbPut(a.id, a.images || []).catch((e) =>
            console.error(`[tattoo] Failed to save images for ${a.id}:`, e)
          )
        }
      }
      return stamped
    })
    editSeq.current += 1
    setDirty(META_KEY)
    if (user) {
      clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(() => {
        flushMetaRef.current?.().catch((e) =>
          console.error('[tattoo] artist meta push failed:', e)
        )
      }, 500)
    }
  }

  useEffect(() => () => clearTimeout(pushTimer.current), [])

  return [artists, setArtists]
}
