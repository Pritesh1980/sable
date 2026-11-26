// Offline show packs (#209): before a convention, copy the artists you mean to
// see, their photos and the ideas linked to them onto this phone, so they open
// in a hall with no signal. This module is the pure part: who and what goes
// in a pack, and what a stored pack honestly says about itself. Reading and
// storing the bytes is showPackPrepare.js; the IndexedDB store is
// showPackStore.js.
//
// A pack is a snapshot. It holds the text it needs (artist details, the booth
// note from the show's line-up, idea text) and a list of photo refs exactly as
// the library stores them: blob keys, base-relative static paths, external
// urls. Never a resolved display url (#101): those expire, and the bytes live
// beside the pack, keyed by the photo's identity.

import { refIdentity, refKey } from './imageRef'
import { isSameOrigin } from './imageResolver'
import { keyForUrl } from './blobUrls'
import { getImageNote } from './planning'
import { indexLineup } from './lineup'
import { parseBooth } from './showPlan'
import { trimEndChars } from './textTrim'

const artistLabel = (artist) => artist?.name || (artist?.handle ? `@${artist.handle}` : 'Unnamed artist')
const text = (value) => (typeof value === 'string' ? value.trim() : '')
const list = (value) => (Array.isArray(value) ? value : [])
const rankOf = (artist) => (Number.isFinite(artist?.rank) ? artist.rank : Infinity)

// The saved artists worth offering for a show: the ones marked attending,
// the ones its line-up lists, and any the pack already holds (so unmarking
// someone never silently drops them from a pack you prepared).
export function packArtistChoices(artists = [], { attendingIds = [], entries = [], selectedIds = [] } = {}) {
  const onLineup = new Set(indexLineup(entries, artists).map((e) => e.savedArtistId).filter(Boolean))
  const going = (a) => attendingIds.includes(a.id)
  return artists
    .filter((a) => going(a) || onLineup.has(a.id) || selectedIds.includes(a.id))
    .sort((a, b) => Number(going(b)) - Number(going(a)) || rankOf(a) - rankOf(b) || artistLabel(a).localeCompare(artistLabel(b)))
    .map((a) => ({ id: a.id, label: artistLabel(a), attending: going(a), onLineup: onLineup.has(a.id) }))
}

// Open ideas linked to any of the chosen artists. A done idea is a tattoo you
// already have: nothing to discuss at the show.
export function linkedIdeas(ideas = [], artistIds = []) {
  if (!artistIds.length) return []
  return ideas.filter((idea) => idea?.status !== 'done' && list(idea?.linkedArtists).some((id) => artistIds.includes(id)))
}

export function defaultPackSelection({ artists = [], ideas = [], attendingIds = [] } = {}) {
  const artistIds = artists.filter((a) => attendingIds.includes(a.id)).map((a) => a.id)
  return { artistIds, ideaIds: linkedIdeas(ideas, artistIds).map((i) => i.id) }
}

// What is kept of a ref: the key for a blob-backed photo, the path or url
// string otherwise. Notes and crops belong to the snapshot, not the ref.
function storedRef(ref) {
  const key = refKey(ref)
  if (key) return { key }
  return typeof ref === 'string' ? ref : ref?.url
}

// A photo on another site is never fetched: the browser would ask that site
// for it, and CORS would refuse the bytes anyway (#209 guardrail).
function isExternal(ref) {
  if (refKey(ref)) return false
  const raw = typeof ref === 'string' ? ref : ref?.url
  return typeof raw !== 'string' || !isSameOrigin(raw)
}

// A display url this session resolved from a blob key goes back to that key,
// so an expiring url is never what the pack keeps (#110, #117).
function canonical(ref) {
  if (refKey(ref)) return ref
  const raw = typeof ref === 'string' ? ref : ref?.url
  const key = typeof raw === 'string' ? keyForUrl(raw) : null
  return key ? { key } : ref
}

export function planShowPack({ edition = {}, artists = [], ideas = [], entries = [], studios = [], selection = {} } = {}) {
  const photos = new Map()
  const addPhoto = (original) => {
    const ref = canonical(original)
    const id = refIdentity(ref)
    if (!id) return null
    if (!photos.has(id)) photos.set(id, { id, ref: storedRef(ref), external: isExternal(ref) })
    return id
  }

  const wanted = new Set(list(selection.artistIds))
  const chosen = artists.filter((a) => wanted.has(a.id))
  const lineup = new Map(indexLineup(entries, artists).filter((e) => e.savedArtistId).map((e) => [e.savedArtistId, e]))
  const studioName = (id) => studios.find((s) => s.id === id)?.name || ''

  const packedArtists = chosen.map((a) => {
    const note = text(lineup.get(a.id)?.note)
    return {
      id: a.id,
      label: artistLabel(a),
      handle: text(a.handle),
      rank: Number.isFinite(a.rank) ? a.rank : null,
      tags: list(a.tags),
      styleNote: text(a.styleNote),
      notes: text(a.notes),
      studio: studioName(a.studio),
      // Only what the show's own list recorded. No line-up, no booth: Sable
      // never places an artist on the floor itself.
      booth: parseBooth(note)?.raw || '',
      lineupNote: note,
      photos: list(a.images).map(addPhoto).filter(Boolean),
    }
  })

  const ideaIds = new Set(list(selection.ideaIds))
  const packedArtistIds = packedArtists.map((a) => a.id)
  const packedIdeas = ideas.filter((idea) => ideaIds.has(idea.id)).map((idea) => ({
    id: idea.id,
    title: text(idea.title) || 'Untitled idea',
    description: text(idea.description),
    placement: text(idea.placement),
    status: text(idea.status),
    tags: list(idea.tags),
    artistIds: list(idea.linkedArtists).filter((id) => packedArtistIds.includes(id)),
    photos: list(idea.images)
      .map((ref) => ({ id: addPhoto(ref), note: getImageNote(ref) }))
      .filter((p) => p.id),
  }))

  const plan = {
    editionKey: edition.editionKey || '',
    edition: { label: edition.label || edition.name || '', dates: edition.dates || '', location: edition.location || '' },
    selection: { artistIds: packedArtistIds, ideaIds: packedIdeas.map((i) => i.id) },
    artists: packedArtists,
    ideas: packedIdeas,
    photos: [...photos.values()],
  }
  return { ...plan, signature: packSignature(plan) }
}

// The rest of a line-up note once its booth is shown on its own: "No Regrets
// Studios, Booth 315A" -> "No Regrets Studios". A note with no booth stays whole.
export function lineupDetail(note = '') {
  const s = String(note || '')
  const at = s.search(/\bBooth\b/i)
  return at < 0 ? s.trim() : trimEndChars(s.slice(0, at), ',;:-–—', { whitespace: true })
}

// FNV-1a over the packed content: a cheap fingerprint of what the pack holds,
// so a later change to the library (a new photo, an edited idea, a different
// choice of artists) reads as "changed since you prepared it".
export function packSignature(plan) {
  const source = JSON.stringify([plan.selection, plan.artists, plan.ideas, plan.photos.map((p) => p.id)])
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function packFreshness(pack, plan) {
  if (!pack || !plan) return { stale: false }
  return { stale: pack.signature !== plan.signature }
}

// What a stored pack can honestly claim. Ready means: the last run finished,
// and the last check read every photo that can be saved back off this device
// with the bytes it was saved with. Anything less is not ready, and says why.
export function packStatus(pack, { running = false } = {}) {
  if (!pack) return { state: 'none' }
  const photos = list(pack.photos)
  const savable = photos.filter((p) => !p.external)
  const check = pack.verification || null
  const present = new Set(list(check?.present))
  const base = {
    total: photos.length,
    savable: savable.length,
    saved: savable.filter((p) => present.has(p.id)).length,
    external: photos.length - savable.length,
    bytes: check?.bytes || 0,
    checkedAt: check?.checkedAt || null,
  }
  if (running) return { ...base, state: 'preparing' }
  if (pack.state !== 'done') return { ...base, state: 'interrupted' }

  const results = pack.results || {}
  const missing = new Set(list(check?.missing))
  const damaged = new Set(list(check?.damaged))
  const problems = savable.filter((p) => !present.has(p.id)).map((p) => {
    if (damaged.has(p.id)) return { id: p.id, why: 'damaged' }
    const result = results[p.id]
    return { id: p.id, why: result && result !== 'saved' ? result : 'missing' }
  })
  if (check && problems.length === 0) return { ...base, state: 'ready' }

  let reason = 'unavailable'
  if (!check) reason = 'unchecked'
  else if (pack.stoppedBy === 'quota') reason = 'quota'
  else if (problems.some((p) => p.why === 'damaged' || (p.why === 'missing' && (missing.has(p.id) || results[p.id] === 'saved')))) reason = 'lost'
  else if (problems.some((p) => p.why === 'offline')) reason = 'offline'
  return { ...base, state: 'incomplete', reason, problems }
}

// Photo identity -> where it appears in the pack ("Mora Vane, photo 2"), so a
// photo that could not be saved can be named rather than counted.
export function photoPlaces(pack) {
  const places = new Map()
  const add = (id, where) => places.set(id, [...(places.get(id) || []), where])
  for (const artist of list(pack?.artists)) artist.photos.forEach((id, i) => add(id, `${artist.label}, photo ${i + 1}`))
  for (const idea of list(pack?.ideas)) idea.photos.forEach((p, i) => add(p.id, `${idea.title}, photo ${i + 1}`))
  return places
}

// "26 Nov, 14:02" (or "26 Nov"): when a pack was last checked, in the phone's
// own time zone.
export function formatPackTime(iso, { time = true } = {}) {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', time
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short' })
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
