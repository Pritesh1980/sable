// What is specific to the artists collection, handed to the sync engine as a
// policy (#112; the hooks are documented in src/sync/collectionStore.js). The
// protocol itself — stamping, pending deletes, generations, flush chain, epochs —
// is the engine's; this file holds only the artist rules, moved from the old
// useArtistStorage hook without rewriting:
//   - first paint and owner seeding (#25),
//   - image tombstones (#55),
//   - the empty-remote seed push.
// State holds the stored refs themselves (#116): each tile resolves its own
// photo (useImageSrc), so an offline start keeps every ref in place (#101,
// #102). The codec only canonicalises for persistence. The legacy IndexedDB
// photo cache and its sweep are gone (#149); sign-out still deletes the cache.

import { DEFAULT_ARTISTS } from './artists'
import { refIdentity } from './imageRef'
import { reconcileRecords, nowStamp } from '../backend/sync'
import { keyForUrl } from './blobUrls'

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
// (a producer that emitted bytes without staging them) are dropped from the
// persisted form so base64 never lands in localStorage or the remote store;
// `keepInline` keeps them for in-memory state (never persisted).
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

// This is the persisted form of an artist: images canonicalised, inline data URLs
// stripped, so base64 never reaches localStorage or the remote store.
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

// ── The policy ───────────────────────────────────────────────────────────────

export function createArtistsPolicy() {
  const codec = {
    toCanonical: (v) => v.map(canonicalizeArtist),
    // State already holds the stored refs; each tile resolves its own photo.
    toDisplay: async (v) => v,
    // Artist photos upload at add time (src/data/imageStaging.js); nothing is
    // left to move at flush.
    ensureUploaded: async (v) => ({ value: v, moved: 0 }),
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

    // Owner-only seeding: the owner keeps the curated DEFAULT_ARTISTS
    // (migrating any local edits up); everyone else starts from whatever is in
    // their own remote collection (empty for a fresh account).
    merge({ local, remote, ctx }) {
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
      // Rows that predate edit-time stamping (old caches, fresh defaults) get
      // their stamp exactly once, HERE — and the same stamped rows go to state,
      // cache, baseline and the seeding push. Stamping throwaway copies would
      // leave every later flush fallback-restamping untouched rows, outranking
      // genuine cross-device edits.
      const seedAt = nowStamp()
      nextMeta = nextMeta.map((a) => (a.updatedAt ? a : { ...a, updatedAt: seedAt }))
      const result = { value: nextMeta }
      if (remote.length === 0 && nextMeta.length) result.push = nextMeta
      return result
    },

    // A removed photo becomes a durable tombstone at the edit too, so a stale
    // whole-record write from another device can't resurrect it during
    // reconciliation even if it otherwise wins LWW (#55). A ref that's back in
    // the new images also has its tombstone cleared — without this, a
    // deliberate re-add of the exact same photo would be silently stripped
    // right back out the next time reconciliation ran (#55 review, codex +
    // agy).
    onEdit(prev, stamped, at) {
      const prevById = new Map((prev || []).map((p) => [p?.id, p]))
      return stamped.map((row) => {
        const prevA = prevById.get(row?.id)
        if (!row || (prevA && prevA.images === row.images)) return row
        // Whatever the producer emitted becomes refs here, once, at the edit boundary.
        const images = normalizeArtistImages(row.images)
        const a = sameList(images, row.images) ? row : { ...row, images }
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
