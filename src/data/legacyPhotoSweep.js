import { keyForUrl, registerBlobUrl } from './blobUrls'
import { refKey } from './imageRef'
import { resolveImage, resolveImageBlob } from './imageResolver'
import { blobToDataUrl, stageImage } from './imageStaging'

// The retry sweep for the legacy artist photo cache (#118).
//
// IndexedDB `tattoo-images-v1` was the display cache for artist photos before
// they were blobs. Nothing writes to it any more; what is left in it is either
// a copy of a photo that already has a key, or a photo that exists nowhere
// else — never migrated, or its one-time migration upload failed (#110). This
// sweep runs at every signed-in launch and moves the second kind into blob
// storage through the normal staging path, so a failed upload stays on the
// device and is retried by the outbox like any new photo.
//
// The ledger is what makes the sweep safe to repeat. After a reload nothing
// maps a cached data url back to the key it was uploaded under, so every
// decision is recorded against the photo's bytes: { key } once it is in blob
// storage (swept here, or matched to a key the artist already holds), or
// { removed: true } when the user deleted it while it was still only inline.
// Device-local and per user; purged at sign-out with the rest.
//
// Retired, with the cache itself, once every device has run it (#149).

export const SWEEP_LEDGER_KEY = 'tattoo_legacy_sweep_v1'

function isInlinePhoto(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.includes(';base64,')
}

// cyrb53: a fast 53-bit string hash. The ledger only tells this device's few
// cached photos apart, so a cryptographic digest would buy nothing.
function hash53(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// Identifies a photo by its bytes: the base64 payload, never the media type,
// which the old migration rewrote to image/jpeg on upload.
export function fingerprint(dataUrl) {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return `${hash53(payload)}.${payload.length}`
}

export function readLedger() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SWEEP_LEDGER_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLedger(ledger) {
  try {
    localStorage.setItem(SWEEP_LEDGER_KEY, JSON.stringify(ledger))
  } catch (e) {
    console.error('[tattoo] could not save the legacy photo ledger:', e)
  }
}

// Stored compactly: the key string, or 0 for a removed photo.
export function ledgerEntry(ledger, artistId, dataUrl) {
  const value = ledger?.[artistId]?.[fingerprint(dataUrl)]
  if (value === 0) return { removed: true }
  return typeof value === 'string' ? { key: value } : undefined
}

function setEntry(ledger, artistId, dataUrl, value) {
  ledger[artistId] = { ...ledger[artistId], [fingerprint(dataUrl)]: value }
}

// An inline photo in `prevImages` that is gone from `nextImages` was deleted
// by the user; record it so neither the overlay nor the sweep brings it back.
// What this replaces is the old write of the new image list into the cache.
export function recordRemovedInline(artistId, prevImages = [], nextImages = []) {
  const next = new Set(nextImages)
  const gone = prevImages.filter((img) => isInlinePhoto(img) && !next.has(img))
  if (!gone.length) return
  const ledger = readLedger()
  for (const img of gone) {
    if (!ledgerEntry(ledger, artistId, img)) setEntry(ledger, artistId, img, 0)
  }
  writeLedger(ledger)
}

// The cached photos of one artist that are still undecided: inline, with no
// key registered this session, and no ledger entry.
export function undecidedPhotos(artistId, cached, ledger = readLedger()) {
  if (!Array.isArray(cached)) return []
  return cached.filter((img) => isInlinePhoto(img) && !keyForUrl(img) && !ledgerEntry(ledger, artistId, img))
}

// The fingerprint of a keyed photo's bytes, or null when they cannot be read
// right now (offline, an expired url).
async function keyedFingerprint(ref) {
  const src = await resolveImage(ref)
  if (!src) return null
  if (isInlinePhoto(src)) return fingerprint(src)
  const blob = await resolveImageBlob(ref)
  if (!blob) return null
  try {
    return fingerprint(await blobToDataUrl(blob))
  } catch {
    return null
  }
}

// Sweeps one launch's worth of legacy photos. Resolves to { refs }, the
// { artistId, key } pairs to fold into the artists' images: freshly swept
// photos, and recorded ones that never reached the artist (unless the user has
// since removed them). Never rejects; a photo it cannot decide on is left for
// the next launch.
export async function sweepLegacyPhotos({ userId, artists = [], imageMap = {} }) {
  if (!userId) return { refs: [] }
  const ledger = readLedger()
  const byId = new Map(artists.map((a) => [a.id, a]))
  const refs = []
  let changed = false

  for (const [artistId, cached] of Object.entries(imageMap)) {
    if (!Array.isArray(cached)) continue
    const artist = byId.get(artistId)
    const held = new Set((artist?.images || []).map(refKey).filter(Boolean))
    const removed = new Set((artist?.removedImages || []).map((t) => refKey(t.ref)).filter(Boolean))

    for (const img of cached) {
      if (!isInlinePhoto(img)) continue
      const entry = ledgerEntry(ledger, artistId, img)
      if (!entry?.key) continue
      registerBlobUrl(entry.key, img)
      if (artist && !held.has(entry.key) && !removed.has(entry.key)) {
        refs.push({ artistId, key: entry.key })
        held.add(entry.key)
      }
    }

    const undecided = undecidedPhotos(artistId, cached, ledger)
    if (!undecided.length || !artist) continue

    // Match against the artist's own photos by bytes first: a photo uploaded
    // before this ledger existed must not go up a second time.
    const owned = new Map()
    let readable = true
    for (const key of held) {
      const fp = await keyedFingerprint({ key })
      if (fp === null) readable = false
      else owned.set(fp, key)
    }

    for (const img of undecided) {
      const matched = owned.get(fingerprint(img))
      if (matched) {
        setEntry(ledger, artistId, img, matched)
        registerBlobUrl(matched, img)
        changed = true
        continue
      }
      if (!readable) continue
      const { key } = await stageImage(img, { userId, scope: 'artists', id: artistId })
      if (!key) continue
      setEntry(ledger, artistId, img, key)
      refs.push({ artistId, key })
      changed = true
    }
  }

  if (changed) writeLedger(ledger)
  return { refs }
}
