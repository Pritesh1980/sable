// What is specific to the artists collection, handed to the sync engine as a
// policy (#112; the hooks are documented in src/sync/collectionStore.js). The
// protocol itself — stamping, pending deletes, generations, flush chain, epochs —
// is the engine's; this file holds only the artist rules, moved from the old
// useArtistStorage hook without rewriting:
//   - first paint and owner seeding (#25),
//   - the legacy IndexedDB photo cache and its one-time migration (#115),
//   - unresolved refs kept through an offline start (#101, #102),
//   - image tombstones (#55),
//   - the empty-remote seed push and the post-migration restamp.
// buildArtists/canonicalizeArtist remain the temporary codec until artist
// photos move to the shared image codec.

import { DEFAULT_ARTISTS } from './artists'
import { resolveAssetPath } from './assetPath'
import { reconcileRecords, nowStamp } from '../backend/sync'
import { resolveBlobKey, keyForUrl } from './blobUrls'
import {
  dbPut,
  dbGetAll,
  displayCacheImages,
  importOldArtistsKey,
  migrateLegacyImages,
  MIGRATED_FLAG,
} from './legacyArtistImages'

export const META_KEY = 'tattoo_artists_meta'

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

// `unresolvedImages` holds canonical refs that aren't in the display list right
// now, each with its position: every ref before hydration, and afterwards any
// key that couldn't be resolved (offline, a failed signed-URL fetch). They are
// not shown, but they are still the artist's photos, so writing the cache or
// pushing the remote puts them back in place. Dropping them is how opening the
// app offline used to strip a user's own photos from their data (#101).
export function canonicalizeArtist(a) {
  const { unresolvedImages, ...rest } = a
  const images = canonicalizeImages(a.images)
  if (!unresolvedImages?.length) return { ...rest, images }
  const present = new Set(images.map(refIdentity).filter(Boolean))
  for (const { ref, index } of [...unresolvedImages].sort((x, y) => x.index - y.index)) {
    const id = refIdentity(ref)
    if (id && present.has(id)) continue
    images.splice(Math.min(index, images.length), 0, ref)
    if (id) present.add(id)
  }
  return { ...rest, images }
}

// An artist as first painted, before any photo has been resolved: nothing to
// show yet, every ref pending. `pending` keeps these from being drawn as
// "available when online" placeholders (#102) — they are just loading.
function unhydrated(a) {
  const refs = Array.isArray(a.images) ? a.images : []
  return { ...a, images: [], unresolvedImages: refs.map((ref, index) => ({ ref, index, pending: true })) }
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
// carrying `addedAt` through as { url, addedAt } wherever the ref has one. A
// key that can't be resolved right now is left out of `display` but returned
// in `unresolved` with its position, so it can be written back (#101).
async function resolveImageRefs(refs = []) {
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
  const unresolved = []
  items.forEach((item, index) => {
    if (!item && refs[index]?.key) unresolved.push({ ref: refs[index], index })
  })
  return { display: items.filter(Boolean), unresolved }
}

export async function displayFromCanonical(refs = []) {
  return (await resolveImageRefs(refs)).display
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
      const { display: resolved, unresolved } = await resolveImageRefs(Array.isArray(a.images) ? a.images : [])
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
      const built = { ...a, images: display }
      if (unresolved.length) built.unresolvedImages = unresolved
      else delete built.unresolvedImages
      return built
    })
  )
}

// ── The policy ───────────────────────────────────────────────────────────────

// One per store: it owns the IndexedDB image map that toDisplay reads, filled by
// onMount and refreshed before each first pull.
export function createArtistsPolicy() {
  let imageMap = {}

  const codec = {
    toCanonical: (v) => v.map(canonicalizeArtist),
    // Canonical, so rows still unhydrated contribute their pending refs rather
    // than their empty first-paint images (#101).
    toDisplay: (v, ctx) => buildArtists(v.map(canonicalizeArtist), imageMap, ctx?.owner),
    // Artist photos upload at add time (src/data/imageStaging.js); nothing is
    // left to move at flush.
    ensureUploaded: async () => 0,
  }

  const policy = {
    // Paint the same baseline the pull starts from: the raw cache, with
    // DEFAULT_ARTISTS folded in only for the owner. Painting owner defaults for
    // a non-owner put artists on screen that the reconcile then removed — a
    // flash of someone else's list (#25). Membership parity with the cache, not
    // with the final state: a later pull can still add remote rows, and images
    // hydrate separately (`unhydrated`).
    initial(rawCache, ctx) {
      const meta = rawCache
        ? (ctx.owner ? applyDefaults(rawCache) : rawCache)
        : (ctx.owner ? DEFAULT_ARTISTS : [])
      return meta.map(unhydrated)
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
      // Fold in refs migrateLegacyImages just uploaded, before buildArtists
      // runs — otherwise they're registered (have a key) but not yet in any
      // artist's canonical images, and would be dropped rather than shown.
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
          byArtist.has(a.id) ? { ...a, images: [...byArtist.get(a.id), ...(a.images || [])] } : a
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
      return stamped.map((a) => {
        const prevA = prevById.get(a?.id)
        if (!a || !prevA || prevA.images === a.images) {
          // A new artist's photos still reach the display cache.
          if (a && !prevA) cacheImages(a)
          return a
        }
        cacheImages(a)
        const liveIds = new Set(canonicalizeImages(a.images || []).map(refIdentity).filter(Boolean))
        const survivors = (a.removedImages || []).filter((t) => !liveIds.has(refIdentity(t.ref)))
        const fresh = removedImageTombstones(prevA.images, a.images, at)
        if (survivors.length === (a.removedImages || []).length && !fresh.length) return a
        return { ...a, removedImages: [...survivors, ...fresh] }
      })
    },
  }

  return { policy, codec }
}

function cacheImages(a) {
  dbPut(a.id, displayCacheImages(a.images || [])).catch((e) =>
    console.error(`[tattoo] Failed to save images for ${a.id}:`, e)
  )
}
