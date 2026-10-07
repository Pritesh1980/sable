// What is specific to the artists collection, handed to the sync engine as a
// policy (#112; the hooks are documented in src/sync/collectionStore.js). The
// protocol itself — stamping, pending deletes, generations, flush chain, epochs —
// is the engine's; this file holds only the artist rules, moved from the old
// useArtistStorage hook without rewriting:
//   - first paint and owner seeding (#25),
//   - the legacy IndexedDB photo cache and its one-time migration (#115),
//   - image tombstones (#55),
//   - the empty-remote seed push and the post-migration restamp.
// State holds the stored refs themselves (#116): each tile resolves its own
// photo (useImageSrc), so an offline start keeps every ref in place (#101,
// #102). The codec is the identity apart from the legacy-cache overlay.

import { DEFAULT_ARTISTS } from './artists'
import { refIdentity, refKey } from './imageRef'
import { reconcileRecords, nowStamp } from '../backend/sync'
import { keyForUrl, resolveBlobKey } from './blobUrls'
import {
  dbPut,
  dbGetAll,
  displayCacheImages,
  importOldArtistsKey,
  migrateLegacyImages,
  MIGRATED_FLAG,
  withLegacyLocalPhotos,
} from './legacyArtistImages'

export const META_KEY = 'tattoo_artists_meta'

// ── Metadata (localStorage, no images) ───────────────────────────────────────

export function dedupeRefs(refs = []) {
  const seen = new Set()
  return refs.filter((ref) => {
    const id = refIdentity(ref)
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

// DEFAULT_ARTISTS' static photos are the owner's starter gallery. They go after
// the artist's own photos, never twice, and never back in once removed (#55).
export function withStarterPhotos(images = [], starters = [], removedImages = []) {
  const have = new Set(images.map(refIdentity).filter(Boolean))
  const doomed = new Set(removedImages.map((t) => refIdentity(t.ref)).filter(Boolean))
  const add = starters.filter((s) => {
    const id = refIdentity(s)
    return id && !have.has(id) && !doomed.has(id)
  })
  return add.length ? [...images, ...add] : images
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
    const images = withStarterPhotos(a.images, def.images, a.removedImages)
    if (images !== a.images) out.images = images
    return out
  })
  const storedIds = new Set(artists.map((a) => a.id))
  const nextRank = merged.length > 0 ? Math.max(...merged.map((a) => a.rank ?? 0)) + 1 : 1
  DEFAULT_ARTISTS.filter((d) => !storedIds.has(d.id)).forEach((d, i) => {
    merged.push({ ...d, rank: nextRank + i })
  })
  return merged
}

// Turn images into canonical, syncable refs: blob-backed display URLs (what
// the producers still emit, normalised here) → { key }, static paths / external URLs →
// string — carrying `addedAt` through wherever it's present. Un-keyed data URLs
// (legacy IndexedDB photos the migration has not uploaded, or a failed stage)
// are dropped from the persisted form so base64 never lands in localStorage or
// the remote store; `keepInline` keeps them for in-memory state (legacy overlay; never persisted).
export function canonicalizeImages(images = [], { keepInline = false } = {}) {
  const out = []
  for (const img of images) {
    if (img && typeof img === 'object') {
      if (img.key) { out.push(img); continue }
      if (typeof img.url === 'string') {
        const key = keyForUrl(img.url)
        if (key) { out.push(img.addedAt ? { key, addedAt: img.addedAt } : { key }); continue }
        if (img.url.startsWith('data:') && !keepInline) continue
        out.push(img.addedAt ? { url: img.url, addedAt: img.addedAt } : img.url)
        continue
      }
      out.push(img)
      continue
    }
    if (typeof img !== 'string') continue
    const key = keyForUrl(img)
    if (key) out.push({ key })
    else if (img.startsWith('data:') && !keepInline) continue
    else out.push(img)
  }
  return out
}

// What artist state holds (#116): refs, one per photo, first position wins.
export function normalizeArtistImages(images = []) {
  return dedupeRefs(canonicalizeImages(images, { keepInline: true }))
}

const sameList = (a, b) => Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])

// The persisted form of an artist. State already is this, apart from the legacy-cache
// legacy overlay, which persisting strips (inline data urls are never stored).
export function canonicalizeArtist(a) {
  return { ...a, images: canonicalizeImages(a.images) }
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

// ── The policy ───────────────────────────────────────────────────────────────

// One per store: it owns the IndexedDB image map that toDisplay reads, filled by
// onMount and refreshed before each first pull.
export function createArtistsPolicy() {
  let imageMap = {}

  const codec = {
    toCanonical: (v) => v.map(canonicalizeArtist),
    // Legacy-cache overlay: the only display-only addition until #118 retires the legacy cache.
    toDisplay: (v) => Promise.all(v.map(async (a) => {
      await registerOwnPhotos(a, imageMap[a.id])
      return withLegacyLocalPhotos(a, imageMap[a.id])
    })),
    // Artist photos upload at add time (src/data/imageStaging.js); nothing is
    // left to move at flush.
    ensureUploaded: async () => 0,
  }

  const policy = {
    // Paint the same baseline the pull starts from: the raw cache, with
    // DEFAULT_ARTISTS folded in only for the owner. Painting owner defaults for
    // a non-owner put artists on screen that the reconcile then removed — a
    // flash of someone else's list (#25). Membership parity with the cache, not
    // with the final state: a later pull can still add remote rows. The rows are
    // the stored refs, so every photo is in place from the first paint (#116).
    initial(rawCache, ctx) {
      if (!rawCache) return ctx.owner ? DEFAULT_ARTISTS : []
      return ctx.owner ? applyDefaults(rawCache) : rawCache
    },

    // Migrate the pre-split key, then load the IndexedDB photo cache. Once per
    // store (#32), signed in or not.
    async onMount() {
      await importOldArtistsKey({
        hasMeta: () => Boolean(localStorage.getItem(META_KEY)),
        saveMeta: (old) => saveMeta(applyDefaults(old)),
      })
      imageMap = await dbGetAll()
    },

    // One-time migration of legacy IndexedDB data-URLs → blob storage so they
    // gain keys and can sync across devices.
    async beforeFirstPull(ctx) {
      imageMap = await dbGetAll()
      let migratedRefs = []
      let didMigrate = false
      if (!localStorage.getItem(MIGRATED_FLAG)) {
        migratedRefs = await migrateLegacyImages(ctx.user.id, imageMap)
        localStorage.setItem(MIGRATED_FLAG, '1')
        didMigrate = true
      }
      return { migratedRefs, didMigrate }
    },

    // Owner-only seeding: the owner keeps the curated DEFAULT_ARTISTS
    // (migrating any local edits up); everyone else starts from whatever is in
    // their own remote collection (empty for a fresh account).
    merge({ local, remote, prep, ctx }) {
      const { migratedRefs = [], didMigrate = false } = prep || {}
      const localMeta = local.map(canonicalizeArtist)
      let nextMeta
      if (remote.length > 0) {
        const localForReconcile = localMeta.map((a) => ({ ...a, updatedAt: a.updatedAt || '' }))
        const merged = reconcileRecords(localForReconcile, remote)
        // A photo removed on one side must stay removed even when the other
        // side's whole record wins LWW on an unrelated field (#55).
        const withTombstones = applyImageTombstones(merged, localForReconcile, remote)
        nextMeta = ctx.owner ? applyDefaults(withTombstones) : withTombstones
      } else {
        // Remote empty → seed/migrate local data up. Owner seeds the curated
        // defaults (preserving any local edits); a non-owner keeps only their
        // own data.
        nextMeta = ctx.owner ? applyDefaults(localMeta) : localMeta
      }
      // Rows that predate edit-time stamping (legacy cache, fresh defaults) get
      // their stamp exactly once, HERE — and the same stamped rows go to state,
      // cache, baseline and the seeding push. Stamping throwaway copies would
      // leave every later flush fallback-restamping untouched rows, outranking
      // genuine cross-device edits.
      const seedAt = nowStamp()
      nextMeta = nextMeta.map((a) => (a.updatedAt ? a : { ...a, updatedAt: seedAt }))
      // Fold in refs migrateLegacyImages just uploaded — otherwise they're
      // registered (have a key), so the legacy overlay no longer shows them,
      // but not yet in any artist's images, and would be dropped.
      // Prepended, not appended: for an owner-seeded artist, `a.images` may
      // already hold DEFAULT_ARTISTS' own static paths (applyDefaults spreads
      // them straight in) — the migrated upload is the artist's own photo and
      // belongs ahead of the curated starter set.
      if (migratedRefs.length) {
        const byArtist = new Map()
        for (const { artistId, key } of migratedRefs) {
          if (!byArtist.has(artistId)) byArtist.set(artistId, [])
          byArtist.get(artistId).push({ key })
        }
        nextMeta = nextMeta.map((a) =>
          byArtist.has(a.id) ? { ...a, images: dedupeRefs([...byArtist.get(a.id), ...(a.images || [])]) } : a
        )
      }
      const result = { value: nextMeta }
      if (remote.length === 0 && nextMeta.length) result.push = nextMeta
      // After migrating legacy images, push the now-keyed metadata so the keys
      // reach the remote store (and other devices can resolve them). Only
      // artists whose canonical image refs actually changed get a fresh stamp —
      // restamping the rest would outrank cross-device edits made between our
      // pull and this push.
      if (didMigrate) {
        const beforeImages = new Map(
          nextMeta.map((a) => [a.id, JSON.stringify(canonicalizeImages(a.images || []))])
        )
        result.pushDisplay = (display) => {
          const at = nowStamp()
          return display.map(canonicalizeArtist).map((a) => {
            const imagesChanged = JSON.stringify(a.images) !== beforeImages.get(a.id)
            return imagesChanged || !a.updatedAt ? { ...a, updatedAt: at } : a
          })
        }
      }
      return result
    },

    // A removed photo becomes a durable tombstone at the edit too, so a stale
    // whole-record write from another device can't resurrect it during
    // reconciliation even if it otherwise wins LWW (#55). A ref that's back in
    // the new images also has its tombstone cleared — without this, a
    // deliberate re-add of the exact same photo would be silently stripped
    // right back out the next time reconciliation ran (#55 review, codex +
    // agy). Changed image arrays also go to the IndexedDB display cache.
    onEdit(prev, stamped, at) {
      const prevById = new Map((prev || []).map((p) => [p?.id, p]))
      return stamped.map((row) => {
        const prevA = prevById.get(row?.id)
        if (!row || (prevA && prevA.images === row.images)) return row
        // Whatever the producer emitted becomes refs here, once, at the edit boundary.
        const images = normalizeArtistImages(row.images)
        const a = sameList(images, row.images) ? row : { ...row, images }
        cacheImages(a)
        // Keep the in-memory legacy cache in step with what was just written, so a
        // legacy photo the user deleted is not re-shown by a later toDisplay.
        imageMap[a.id] = displayCacheImages(a.images || [])
        if (!prevA) return a
        const liveIds = new Set(a.images.map(refIdentity).filter(Boolean))
        const survivors = (a.removedImages || []).filter((t) => !liveIds.has(refIdentity(t.ref)))
        const fresh = removedImageTombstones(prevA.images, a.images, at)
        if (survivors.length === (a.removedImages || []).length && !fresh.length) return a
        return { ...a, removedImages: [...survivors, ...fresh] }
      })
    },
  }

  return { policy, codec }
}

// Whether a cached data url is "legacy" is read off the key<->url map, which is
// empty after a reload. On the local backend a keyed photo resolves to exactly
// the data url the cache may hold for it (every pre-#115 edit and every
// migrated upload left one there), so the artist's own keys are resolved —
// which registers them — before the overlay decides. buildArtists did the same
// by resolving every ref first. Only an artist whose cache holds a data url
// nothing recognises pays for it; resolveBlobKey never rejects, so offline the
// overlay simply behaves as before.
async function registerOwnPhotos(a, idbImages) {
  const unknown = Array.isArray(idbImages) &&
    idbImages.some((s) => typeof s === 'string' && s.startsWith('data:') && !keyForUrl(s))
  if (!unknown) return
  const keys = (a.images || []).map(refKey).filter(Boolean)
  await Promise.all(keys.map((key) => resolveBlobKey(key)))
}

function cacheImages(a) {
  dbPut(a.id, displayCacheImages(a.images || [])).catch((e) =>
    console.error(`[tattoo] Failed to save images for ${a.id}:`, e)
  )
}
