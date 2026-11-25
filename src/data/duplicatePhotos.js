import { refIdentity, refKey } from './imageRef'
import { getImageNote } from './planning'
import { isSameOrigin, resolveImageBlob } from './imageResolver'
import { isFavourite } from './favourites'

// Duplicate photo review (#210): the same reference uploaded more than once,
// under different keys or file names. Found on-device from the photos' own
// bytes (SHA-256), never from names, and never with a network service.
//
// Two notions of "same" meet here. refIdentity says two *refs* are one photo
// (same key or path); the fingerprint says two *photos* have one content. A
// duplicate group is two or more distinct identities with one fingerprint. One
// identity used in several places (a favourite, a photo in an idea and on an
// artist) is a single photo used twice, not a duplicate.
//
// The scan only produces fingerprints, keyed by identity. Groups are derived
// from the current library each time, so a removal, an undo or a sync pull
// reshapes the answer with no stale results, and a photo added after the scan
// counts as "not checked yet" rather than unique.
//
// Removal is offered only inside one record that keeps another copy: an
// artist's or an idea's photo list. A repeat across records can be on purpose
// (#204 copies a concept's bytes into an idea), and saying two artists share a
// photo is not saying who made it. Nothing here deletes bytes: the app never
// removes a blob (no caller of backend.blobs.remove), so dropping a ref cannot
// strand a photo another record still uses.

const LIST_KINDS = new Set(['artist', 'idea'])

function artistLabel(artist) {
  const name = typeof artist?.name === 'string' ? artist.name.trim() : ''
  if (name) return name
  return artist?.handle ? `@${artist.handle}` : 'Unnamed artist'
}

function titled(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

// Every photo slot in the library, each with where it is used. Favourites are
// not uses: they point at a photo that is already listed.
export function collectPhotoUses({ artists = [], ideas = [], concepts = [], saved = [] } = {}) {
  const uses = []
  const add = (ref, use) => {
    const id = refIdentity(ref)
    if (id) uses.push({ id, ref, ...use })
  }
  const fromList = (rows, kind, label) => {
    for (const row of rows || []) {
      const images = Array.isArray(row?.images) ? row.images : []
      images.forEach((ref, index) => add(ref, {
        kind, recordId: row.id, label: label(row), position: index + 1, of: images.length, note: getImageNote(ref),
      }))
    }
  }
  fromList(artists, 'artist', artistLabel)
  fromList(ideas, 'idea', (idea) => titled(idea.title, 'Untitled idea'))
  for (const concept of concepts || []) {
    const label = titled(concept?.title, titled(concept?.prompt, 'AI concept').slice(0, 60))
    add(concept?.imageUrl, { kind: 'concept', recordId: concept?.id, label, position: 1, of: 1, note: '' })
    const variants = Array.isArray(concept?.variants) ? concept.variants : []
    variants.forEach((variant, index) => add(variant?.imageUrl, {
      kind: 'variant', recordId: concept.id, label, position: index + 1, of: variants.length, note: '',
    }))
  }
  for (const row of saved || []) {
    add(row?.image, { kind: 'saved', recordId: row?.id, label: 'Saved photo', position: 1, of: 1, note: titled(row?.note, '') })
  }
  return uses
}

// A photo on another site (an external portfolio link) is never fetched: the
// browser would ask that site for it, and CORS would refuse the bytes anyway.
function isExternal(ref) {
  if (refKey(ref)) return false
  const raw = typeof ref === 'string' ? ref : ref?.url
  return typeof raw !== 'string' || !isSameOrigin(raw)
}

async function sha256(blob) {
  const buffer = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Stopped', 'AbortError')
}

// identity -> { hash } | { skipped: 'external' | 'unavailable' }. One photo at
// a time, each read once, so a large library never holds more than one
// photo's bytes in memory. A photo that cannot be read right now (offline, a
// missing blob, an empty file) is unscanned: neither unique nor a duplicate.
export async function fingerprintPhotos(refs = [], { readBlob = resolveImageBlob, signal, onProgress } = {}) {
  const pending = new Map()
  for (const ref of refs) {
    const id = refIdentity(ref)
    if (id && !pending.has(id)) pending.set(id, ref)
  }
  const prints = new Map()
  let done = 0
  for (const [id, ref] of pending) {
    throwIfAborted(signal)
    prints.set(id, isExternal(ref) ? { skipped: 'external' } : await fingerprint(ref, readBlob))
    done += 1
    onProgress?.(done, pending.size)
  }
  throwIfAborted(signal)
  return prints
}

async function fingerprint(ref, readBlob) {
  try {
    const blob = await readBlob(ref)
    if (!blob?.size) return { skipped: 'unavailable' }
    return { hash: await sha256(blob) }
  } catch {
    return { skipped: 'unavailable' }
  }
}

// How much of the current library the fingerprints cover.
export function scanSummary(uses = [], prints = new Map()) {
  const summary = { total: 0, checked: 0, external: 0, unavailable: 0, unchecked: 0 }
  for (const id of new Set(uses.map((u) => u.id))) {
    summary.total += 1
    const print = prints.get(id)
    if (!print) summary.unchecked += 1
    else if (print.hash) summary.checked += 1
    else if (print.skipped === 'external') summary.external += 1
    else summary.unavailable += 1
  }
  return summary
}

const recordOf = (use) => `${use.kind}:${use.recordId}`

// [{ hash, sameRecord, copies: [{ id, ref, uses }] }], copies in library order.
// Groups with two copies inside one record (the ones that can be tidied) first.
export function findDuplicateGroups(uses = [], prints = new Map()) {
  const byHash = new Map()
  for (const use of uses) {
    const hash = prints.get(use.id)?.hash
    if (!hash) continue
    if (!byHash.has(hash)) byHash.set(hash, new Map())
    const copies = byHash.get(hash)
    if (!copies.has(use.id)) copies.set(use.id, { id: use.id, ref: use.ref, uses: [] })
    copies.get(use.id).uses.push(use)
  }
  const groups = []
  for (const [hash, copies] of byHash) {
    if (copies.size < 2) continue
    const list = [...copies.values()]
    const seen = new Map()
    let sameRecord = false
    for (const copy of list) {
      for (const record of new Set(copy.uses.filter((u) => LIST_KINDS.has(u.kind)).map(recordOf))) {
        if (seen.has(record)) sameRecord = true
        seen.set(record, true)
      }
    }
    groups.push({ hash, sameRecord, copies: list })
  }
  return groups.sort((a, b) => Number(b.sameRecord) - Number(a.sameRecord))
}

// Whether `use` (one place `copy` appears) can come out. Only from an artist's
// or an idea's photo list that keeps another copy, and only when nothing would
// be lost: not a favourite, and not a note the remaining copy doesn't carry.
// reason: 'favourite' | 'note' when that is what keeps it; null when removal
// simply doesn't apply (another record, or a photo that *is* its record).
export function removalCheck(group, copy, use, { favourites = [] } = {}) {
  const no = (reason = null) => ({ removable: false, reason })
  if (!LIST_KINDS.has(use?.kind)) return no()
  const siblings = group.copies
    .filter((other) => other.id !== copy.id)
    .flatMap((other) => other.uses.filter((u) => recordOf(u) === recordOf(use)).map((u) => ({ copy: other, use: u })))
  if (!siblings.length) return no()
  if (isFavourite(favourites, copy.ref)) return no('favourite')
  const keep = use.note ? siblings.find((s) => s.use.note === use.note) : siblings[0]
  if (!keep) return no('note')
  return { removable: true, keepId: keep.copy.id }
}

// Removes copy `id` from one record's photos, keeping `keepId`. Returns
// { records, undo }, or null when the record no longer holds both (it changed
// since the check). A curation Keep flag (#187) moves to the copy that stays.
export function removeCopy(records = [], { recordId, id, keepId }) {
  const record = records.find((r) => r?.id === recordId)
  const images = Array.isArray(record?.images) ? record.images : null
  if (!images) return null
  const index = images.findIndex((ref) => refIdentity(ref) === id)
  if (index < 0 || !images.some((ref) => refIdentity(ref) === keepId)) return null

  const next = { ...record, images: images.filter((_, i) => i !== index) }
  const undo = { recordId, index, ref: images[index] }
  if (Array.isArray(record.keptImages) && record.keptImages.includes(id)) {
    const kept = record.keptImages.filter((k) => k !== id)
    next.keptImages = kept.includes(keepId) ? kept : [...kept, keepId]
    undo.keptImages = record.keptImages
  }
  return { records: records.map((r) => (r === record ? next : r)), undo }
}

// Puts a removed copy back where it was. A no-op (same array) when it is
// already there or its record has gone.
export function restoreCopy(records = [], undo) {
  const record = records.find((r) => r?.id === undo?.recordId)
  const images = Array.isArray(record?.images) ? record.images : null
  const id = refIdentity(undo?.ref)
  if (!images || !id || images.some((ref) => refIdentity(ref) === id)) return records
  const at = Math.min(undo.index, images.length)
  const next = { ...record, images: [...images.slice(0, at), undo.ref, ...images.slice(at)] }
  if (undo.keptImages) next.keptImages = undo.keptImages
  return records.map((r) => (r === record ? next : r))
}
