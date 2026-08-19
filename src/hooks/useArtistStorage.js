import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_ARTISTS } from '../data/artists'
import { resolveAssetPath } from '../data/assetPath'
import { backend } from '../backend'
import { useAuth } from '../context/useAuth'
import { seedsOwnerData } from '../backend/owner'
import { reconcileRecords, nowStamp, stripEditGen } from '../backend/sync'
import {
  stampChangedRows,
  readPendingDeletes,
  addPendingDeletes,
  clearPendingDeletes,
  writeRowGenerations,
  hasDirtyRows,
  confirmRowGenerations,
  dropRowGenerations,
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

async function dbPut(id, images) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(images, id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
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
      else { db.close(); resolve(out) }
    }
    tx.onerror = () => { db.close(); reject(tx.error) }
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

// Stable string identity for a canonical image ref, used only to compare
// refs for tombstone bookkeeping (#55) — never persisted or displayed.
function refIdentity(ref) {
  if (typeof ref === 'string') return resolveAssetPath(ref)
  if (ref?.key) return `key:${ref.key}`
  if (ref?.url) return `url:${ref.url}`
  return null
}

// Every canonical ref present before but missing after becomes a tombstone,
// so a removal survives even if the whole record it's part of later loses a
// whole-record LWW comparison to a stale copy that still has the photo (#55).
export function removedImageTombstones(prevImages, nextImages, at) {
  const prevCanonical = canonicalizeImages(prevImages || [])
  const nextIds = new Set(canonicalizeImages(nextImages || []).map(refIdentity).filter(Boolean))
  return prevCanonical
    .filter((ref) => {
      const id = refIdentity(ref)
      return id && !nextIds.has(id)
    })
    .map((ref) => ({ ref, removedAt: at }))
}

// Union two tombstone lists, keeping the later removedAt when both sides
// tombstone the same ref.
function mergeTombstones(a, b) {
  const byId = new Map()
  for (const t of [...(a || []), ...(b || [])]) {
    const id = refIdentity(t.ref)
    if (!id) continue
    const existing = byId.get(id)
    if (!existing || String(t.removedAt || '') > String(existing.removedAt || '')) byId.set(id, t)
  }
  return Array.from(byId.values())
}

// Applied after whole-record reconciliation picks a winner by LWW: an image
// tombstoned on *either* side stays out of the winning record's images, even
// when that record's whole-record content came from the other, stale side —
// e.g. device A removes a photo; device B, holding a stale copy, later edits
// only a note, and its newer-but-unrelated whole-record write would otherwise
// resurrect the removed photo (#55).
export function applyImageTombstones(mergedRecords, localRecords, remoteRecords) {
  const localById = new Map((localRecords || []).map((r) => [r.id, r]))
  const remoteById = new Map((remoteRecords || []).map((r) => [r.id, r]))
  return mergedRecords.map((rec) => {
    const tombstones = mergeTombstones(localById.get(rec.id)?.removedImages, remoteById.get(rec.id)?.removedImages)
    if (!tombstones.length) return rec
    const doomed = new Set(tombstones.map((t) => refIdentity(t.ref)))
    const images = Array.isArray(rec.images) ? rec.images.filter((ref) => !doomed.has(refIdentity(ref))) : rec.images
    return { ...rec, images, removedImages: tombstones }
  })
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

// Merge curated static paths into the IndexedDB display cache without
// duplicating. Comparison is on the *resolved* path: seed data is stored
// base-relative ("images/…") while legacy caches hold the root-absolute form
// ("/images/…"), and those are the same image.
export function mergeStaticImages(idbImages = [], staticImages = []) {
  const cached = new Set(
    idbImages
      .filter((s) => typeof s === 'string' && !s.startsWith('data:'))
      .map((s) => resolveAssetPath(s))
  )
  return [...idbImages, ...staticImages.filter((s) => !cached.has(resolveAssetPath(s)))]
}

// Build display-ready artists from metadata + the IndexedDB image map.
// Canonical (reconciled) `a.images` is always the source of *membership* for
// the artist's own photos. The IndexedDB cache is *not* trusted for
// membership: a device that hasn't reloaded since another device removed a
// photo would otherwise keep rendering (and could re-push) an image the
// reconciled record no longer has (#55). The one exception is a legacy
// un-migrated local upload — a raw data-URL with no registered blob key yet,
// because canonicalizeImages deliberately drops those until the one-time
// migration uploads them — which must still display locally in that window.
// `keyForUrl`, not merely "starts with data:", is what tells the two apart:
// the local backend resolves *every* blob (migrated or not) to a data-URL,
// so a stale-but-already-migrated image would otherwise be misidentified as
// legacy and resurrected right back in.
//
// DEFAULT_ARTISTS static paths are then appended (deduped by resolved path,
// mergeStaticImages) as a starter gallery on top of whatever the artist's own
// photos resolve to — never instead of them — but only on a build that ships
// them: with seeding off (the public demo) the curated images are absent,
// and falling back to them would produce exactly the broken requests the
// gate exists to prevent.
export async function buildArtists(metaList, imageMap, withDefaults = true) {
  return Promise.all(
    metaList.map(async (a) => {
      const def = withDefaults ? DEFAULT_ARTISTS.find((d) => d.id === a.id) : undefined
      const idbImages = imageMap[a.id]
      const resolved = await displayFromCanonical(Array.isArray(a.images) ? a.images : [])
      const legacyLocalOnly = Array.isArray(idbImages)
        ? idbImages.filter((s) => typeof s === 'string' && s.startsWith('data:') && !keyForUrl(s))
        : []
      const own = legacyLocalOnly.length ? [...legacyLocalOnly, ...resolved] : resolved
      // A tombstoned DEFAULT_ARTISTS image must not be merged back in —
      // DEFAULT_ARTISTS is a fixed static list, so without this a removed
      // curated photo reappeared on every call regardless of the removal or
      // its tombstone (#55 review, codex + agy).
      const doomed = new Set((a.removedImages || []).map((t) => refIdentity(t.ref)).filter(Boolean))
      const defImages = (def?.images || []).filter((img) => !doomed.has(refIdentity(img)))
      const display = mergeStaticImages(own, defImages)
      return { ...a, images: display }
    })
  )
}

// One-time migration: upload every legacy data-URL sitting in IndexedDB to the
// blob store and register key↔url so canonicalizeImages can map them to { key }.
// Local data-URLs are left in IndexedDB (display cache) and not deleted here.
// Returns the { artistId, key } pairs it actually uploaded, so the caller can
// fold them into canonical `images` before the next buildArtists — otherwise
// a freshly-migrated image is registered (has a key) but not yet represented
// in any artist's canonical images, and buildArtists's #55 fix (which no
// longer trusts the IndexedDB cache for anything already registered) would
// drop it from display and from the metadata pushed right after.
async function migrateLegacyImages(userId, imageMap) {
  const migrated = []
  for (const [artistId, images] of Object.entries(imageMap)) {
    if (!Array.isArray(images)) continue
    for (const img of images) {
      if (typeof img !== 'string' || !img.startsWith('data:')) continue
      if (keyForUrl(img)) continue
      const key = `user/${userId}/artists/${artistId}/${crypto.randomUUID?.() || Date.now()}.jpg`
      try {
        await backend.blobs.upload(userId, key, img, 'image/jpeg')
        registerBlobUrl(key, img)
        migrated.push({ artistId, key })
      } catch (e) {
        console.error('[tattoo] image migration failed for', artistId, e)
      }
    }
  }
  return migrated
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

  // Paint the same baseline the sync effect starts from: the raw cache, with
  // DEFAULT_ARTISTS folded in only for the owner (the rule the reconcile below
  // applies). Painting owner defaults for a non-owner put artists on screen that
  // the reconcile then removed — a flash of someone else's list (#25).
  //
  // This is membership parity with the cache, not with the final state: a later
  // pull can still add remote rows the cache had never seen, and images are
  // hydrated separately (see the `images: []` below), so both arrive after paint.
  // Those are hydration, not a flash of the wrong identities.
  //
  // Safe to read `user` here because App.jsx mounts AppShell inside
  // ProtectedRoute, which holds a spinner until the session resolves. A lazy
  // initializer captures that decision for the life of the mount; sign-out nulls
  // the user (unmounting AppShell) and purges the cache, so the next sign-in
  // re-runs this. A direct A→B session swap with no committed null in between
  // would keep A's decision until the effect re-runs — tracked in #28.
  const [artists, setArtistsRaw] = useState(() => {
    const owner = seedsOwnerData(user)
    const meta = initialRawCache
      ? (owner ? applyDefaults(initialRawCache) : initialRawCache)
      : (owner ? DEFAULT_ARTISTS : [])
    return meta.map((a) => ({ ...a, images: [] }))
  })

  const artistsRef = useRef(artists)
  const imageMapRef = useRef({})
  const syncedRef = useRef(null) // last metadata list known in sync with remote
  const pushTimer = useRef(null)
  // Flushes are chained so two can never be in flight at once — with a real
  // async backend an older flush completing last would overwrite newer remote
  // rows and regress the synced baseline.
  const flushChain = useRef(Promise.resolve())

  useEffect(() => { artistsRef.current = artists }, [artists])

  // On mount: migrate images from the old localStorage key, then load from
  // IndexedDB and merge them onto whatever metadata is current (offline path).
  // Deliberately mount-once (#32): `user` is read below, but safe to read
  // once — ProtectedRoute holds a spinner until the session resolves, so
  // it's already settled by mount (see the comment on the `artists` lazy
  // initializer above). Re-running on every identity change would re-migrate
  // and re-load on every sign-in, which is wrong, not just untidy — pinned
  // by a regression test in useArtistStorage.test.js. The remaining
  // direct-A-to-B-swap gap (no committed null in between, so this effect
  // never gets a fresh mount at all) is tracked separately in #28.
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
        const built = await buildArtists(artistsRef.current, imageMap, seedsOwnerData(user))
        if (!cancelled) setArtistsRaw(built)
      } catch (e) {
        console.error('[tattoo] Failed to load images:', e)
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        let migratedRefs = []
        if (!localStorage.getItem(MIGRATED_FLAG)) {
          migratedRefs = await migrateLegacyImages(user.id, imageMap)
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
        const owner = seedsOwnerData(user)
        // Baseline = the user's own raw cache (never the default seed). The owner
        // additionally gets DEFAULT_ARTISTS folded in; non-owners never do.
        const localMeta = initialRawCache || []
        let nextMeta

        if (remote.length > 0) {
          const localForReconcile = localMeta.map((a) => ({ ...a, updatedAt: a.updatedAt || '' }))
          const merged = reconcileRecords(localForReconcile, remote)
          // A photo removed on one side must stay removed even when the
          // other side's whole record wins LWW on an unrelated field (#55).
          const withTombstones = applyImageTombstones(merged, localForReconcile, remote)
          nextMeta = owner ? applyDefaults(withTombstones) : withTombstones
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
        // Fold in refs migrateLegacyImages just uploaded, before buildArtists
        // runs — otherwise they're registered (have a key) but not yet in any
        // artist's canonical images, and would be dropped rather than shown.
        // Prepended, not appended: for an owner-seeded artist, `a.images` at
        // this point may already hold DEFAULT_ARTISTS' own static paths
        // (applyDefaults spreads them straight in) — the migrated upload is
        // the artist's own photo and belongs ahead of the curated starter set.
        if (migratedRefs.length) {
          const byArtist = new Map()
          for (const { artistId, key } of migratedRefs) {
            if (!byArtist.has(artistId)) byArtist.set(artistId, [])
            byArtist.get(artistId).push({ key })
          }
          nextMeta = nextMeta.map((a) =>
            byArtist.has(a.id) ? { ...a, images: [...byArtist.get(a.id), ...(a.images || [])] } : a
          )
        }
        if (remote.length === 0 && nextMeta.length) {
          await backend.store.upsert(COLLECTION, nextMeta)
        }

        if (cancelled) return
        syncedRef.current = nextMeta
        const built = await buildArtists(nextMeta, imageMapRef.current, seedsOwnerData(user))
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
        // A tracked row means an edit never fully reached the remote (failed
        // push, killed tab) — push the reconciled state up once it has
        // committed to artistsRef via the debounce window (#84: per-row,
        // not a single per-key flag).
        if (!cancelled && hasDirtyRows(META_KEY)) {
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
    // Rows keep the stamp (and editGen) set when the edit happened; `at` only
    // fills rows that never got one (restamping all would outrank other
    // devices' edits). Kept un-stripped here so confirmRowGenerations below
    // can compare each row's own editGen against the shared sidecar —
    // editGen itself never reaches the remote store (stripped just below).
    const stampedMeta = meta.map((a) => ({ ...a, updatedAt: a.updatedAt || at }))
    const rows = stampedMeta.map(stripEditGen)

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
    // Per row instead of per key (#84): each row in `stampedMeta` carries the
    // editGen it had when *this tab* built this push. A row confirms only if
    // the shared sidecar's current value for it still matches — proof this
    // exact edit, not some other tab's, is what's now confirmed. A row this
    // tab never edited (no editGen) is skipped outright — confirming it
    // isn't this tab's call to make.
    confirmRowGenerations(META_KEY, stampedMeta)
  }, [user])

  const flushMeta = useCallback(() => {
    const p = flushChain.current.then(runFlushMeta, runFlushMeta)
    flushChain.current = p.then(() => {}, () => {})
    return p
  }, [runFlushMeta])

  const flushMetaRef = useRef(null)
  // Standard "latest ref" pattern (#32): stash the current flushMeta so the
  // async callbacks that call it via flushMetaRef.current?.() (lines above and
  // below) always run the freshest closure, not one captured when they were
  // scheduled. The write happens in an effect, after commit, never during
  // render — react-hooks/immutability's write-after-effect-read heuristic
  // doesn't distinguish that from a real mutation-during-render bug.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { flushMetaRef.current = flushMeta }, [flushMeta])

  function setArtists(updater) {
    const at = nowStamp()
    setArtistsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      // Stamp what changed at edit time — saveMeta persists the stamp
      // immediately, so the edit survives a reload and wins last-write-wins
      // against older remote rows even if no push succeeds.
      let stamped = stampChangedRows(prev, next, at)
      // A removed photo becomes a durable tombstone at the edit too, so a
      // stale whole-record write from another device can't resurrect it
      // during reconciliation even if it otherwise wins LWW (#55). A ref
      // that's back in the new images also has its tombstone cleared —
      // without this, a deliberate re-add of the exact same photo would be
      // silently stripped right back out the next time reconciliation ran,
      // since a tombstone was only ever added, never removed (#55 review,
      // codex + agy).
      stamped = stamped.map((a) => {
        const prevA = prev.find((p) => p.id === a.id)
        if (!prevA || prevA.images === a.images) return a
        const liveIds = new Set(canonicalizeImages(a.images || []).map(refIdentity).filter(Boolean))
        const survivors = (a.removedImages || []).filter((t) => !liveIds.has(refIdentity(t.ref)))
        const fresh = removedImageTombstones(prevA.images, a.images, at)
        if (survivors.length === (a.removedImages || []).length && !fresh.length) return a
        return { ...a, removedImages: [...survivors, ...fresh] }
      })
      // Tombstones become durable at the edit, not at the flush 500ms later —
      // a tab closed inside the debounce window must not lose the delete.
      const liveIds = new Set(stamped.map((a) => a?.id))
      const removed = prev
        .map((a) => (a && typeof a === 'object' ? a.id : undefined))
        .filter((id) => id !== undefined && !liveIds.has(id))
      if (removed.length) {
        addPendingDeletes(META_KEY, removed)
        // A deleted artist's tracked generation would otherwise linger
        // forever — nothing will ever push it again to confirm it (#84).
        dropRowGenerations(META_KEY, removed)
      }
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
      // Durable at edit time, same reasoning as the tombstones above — a tab
      // closed inside the debounce window must not lose track of which
      // artists still need confirming (#84, replacing the per-key generation;
      // see confirmRowGenerations in runFlushMeta).
      writeRowGenerations(META_KEY, stamped)
      return stamped
    })
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
