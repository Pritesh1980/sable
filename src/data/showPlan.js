// Turns a convention's artist index into "who should I actually go and see" —
// a Top picks list, built entirely from data already on disk (no network, no
// Taste Engine, since line-up entries carry no images to score).
//
// The signal that works is your own gallery: an artist you've already saved
// scores highest, and a stablemate at the same studio (No Regrets, London's
// Glitch, …) is worth a look even if you've never heard of them. Style-tag
// overlap only ever fires for the handful of line-up entries that happen to
// match a saved artist, because the show's list carries no style data at all.
import { normalizeArtistStatus } from './planning'
import { indexLineup, parseLineup } from './lineup'

// "No Regrets, Booth 315" / "Some Studio, Booth T39" / "Studio, Booth 153 - 158".
const BOOTH_RE = /Booth\s+([A-Za-z]{0,2})(\d+)/i

export function parseBooth(note = '') {
  const m = BOOTH_RE.exec(String(note || ''))
  if (!m) return null
  const [, zone, digits] = m
  return { raw: `${zone}${digits}`, zone: zone.toUpperCase(), number: Number(digits) }
}

// Rank-weighted style-tag histogram over the saved gallery — same weighting as
// scoreArtistForIdea's rank boost, so a #2 artist's tags count for more than a
// #29 artist's. Descending by weight.
export function preferredStyles(artists = []) {
  const weight = new Map()
  for (const a of artists) {
    const boost = Math.max(0, 31 - (a.rank || 31)) / 10
    for (const tag of a.tags || []) weight.set(tag, (weight.get(tag) || 0) + 1 + boost)
  }
  return Array.from(weight, ([tag, w]) => ({ tag, weight: w })).sort((a, b) => b.weight - a.weight)
}

// A studio name off a line-up ("No Regrets Studios", "London's Glitch") has to
// match a saved studio id ("no-regrets-london") without an exact string match
// existing anywhere. Strip punctuation and the generic suffix words, then
// compare the leading run of tokens.
function normalizeStudioText(s = '') {
  return String(s)
    // A line-up entry's studio text is the lead-in of its note ("No Regrets
    // Studios, Booth 61") — drop the booth clause first, or it gets matched
    // against too and never lines up with a bare studio name.
    .split(/,?\s*Booth\b/i)[0]
    .toLowerCase()
    .replace(/[’']s\b/g, '')   // possessive: "London's" -> "London"
    .replace(/[’'.,]/g, '')
    .replace(/\b(studios?|tattoo|collective|parlour|ink)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Display form of a line-up entry's studio text: just the booth clause
// stripped off. The seeded/imported line-up is already properly cased ("No
// Regrets Studios, Booth 380"), so this is deliberately not run through
// normalizeStudioText — that form is for matching, not for showing the user.
function studioDisplayName(text = '') {
  return String(text).split(/,?\s*Booth\b/i)[0].trim()
}

export function buildStudioIndex(artists = [], studios = []) {
  const byId = new Map(studios.map((s) => [s.id, { id: s.id, name: s.name, artists: [] }]))
  for (const a of artists) {
    if (a.studio && byId.has(a.studio)) byId.get(a.studio).artists.push(a)
  }
  const normalized = studios.map((s) => ({ id: s.id, key: normalizeStudioText(s.name) })).filter((s) => s.key)

  // A line-up entry's studio text almost never carries the branch city ("No
  // Regrets Studios", not "No Regrets London"), so it can't be resolved to one
  // specific branch — and shouldn't be. Instead it's matched against every
  // studio whose name shares that leading brand, and the artists you follow
  // there are pooled: "you follow 12 artists across No Regrets" is a true
  // statement; picking one arbitrary branch to attribute them to would not be.
  function matchText(text) {
    const key = normalizeStudioText(text)
    if (!key) return undefined
    const hits = normalized.filter((s) => key.startsWith(s.key) || s.key.startsWith(key))
    if (hits.length === 0) return undefined
    const pooled = hits.flatMap((h) => byId.get(h.id).artists)
    // A single branch names itself. Pooled across several (six No Regrets
    // branches, say) there is no one branch to credit — naming one anyway
    // ("No Regrets Cheltenham — you follow 12 artists there") reads as a claim
    // about that specific branch, which it isn't, since the 12 are spread
    // across all six. Use the show's own text instead: it names the brand
    // without picking a city nobody actually confirmed.
    const single = hits.length === 1
    const label = single ? hits[0] : null
    return {
      id: single ? label.id : hits[0].id,
      name: single ? byId.get(label.id).name : studioDisplayName(text),
      artists: pooled,
    }
  }

  return { get: (id) => byId.get(id), matchText }
}

const STATUS_SCORE = { 'contact-next': 3, shortlisted: 2, contacted: 1, pass: -4 }
const STUDIO_STABLEMATE_CAP = 30

export function scoreShowEntry(entry, { artists = [], attendingIds = [], studioIndex, styles = [] } = {}) {
  const reasons = []
  let score = 0

  const artist = entry.artist || (entry.savedArtistId && artists.find((a) => a.id === entry.savedArtistId)) || null
  const status = artist ? normalizeArtistStatus(artist.status) : null

  if (artist && status === 'pass') {
    return { entry, artist, score: -Infinity, kind: 'skipped', savedArtistId: artist.id, reasons: ['Marked pass'] }
  }

  if (artist) {
    score += 100
    const rankBoost = Math.max(0, 31 - (artist.rank || 31)) / 10
    score += rankBoost
    if (artist.rank) reasons.push(`#${artist.rank} in your ranking`)
    const statusBoost = STATUS_SCORE[status] || 0
    score += statusBoost
    if (status && STATUS_SCORE[status]) reasons.push(`Status: ${status}`)
  }

  const studio = studioIndex?.matchText(entry.note)
  if (studio) {
    const count = studio.artists.length
    if (count > 0) {
      const boost = Math.min(STUDIO_STABLEMATE_CAP, 20 + count * 2)
      score += boost
      reasons.push(`${studio.name} — you follow ${count} artist${count === 1 ? '' : 's'} there`)
    }
  }

  if (artist && attendingIds.includes(artist.id)) {
    score += 5
    reasons.push('Already flagged attending')
  }

  if (artist?.tags?.length) {
    const overlap = artist.tags.filter((t) => styles.some((s) => s.tag === t))
    if (overlap.length) {
      score += overlap.length * 10
      reasons.push(`Matches your styles: ${overlap.join(', ')}`)
    }
  }

  const kind = artist ? 'mustSee' : studio ? 'suggested' : 'other'
  return { entry, artist, score, kind, savedArtistId: artist?.id || null, reasons }
}

// entries: raw line-up entries — indexed against the gallery here, so callers
// can pass seedEntriesFor()/parseLineup() output straight through.
export function buildShowPlan(entries = [], { artists = [], studios = [], attendingIds = [] } = {}) {
  if (entries.length === 0) return { mustSee: [], suggested: [], skipped: [] }

  const indexed = indexLineup(entries, artists)
  const studioIndex = buildStudioIndex(artists, studios)
  const styles = preferredStyles(artists)
  const ctx = { artists, attendingIds, studioIndex, styles }

  const mustSee = []
  const suggested = []
  const skipped = []

  for (const entry of indexed) {
    const scored = scoreShowEntry(entry, ctx)
    if (scored.kind === 'skipped') skipped.push(scored)
    else if (scored.kind === 'mustSee') mustSee.push(scored)
    else if (scored.kind === 'suggested') suggested.push(scored)
    // 'other' — no saved artist, no known studio — isn't a pick; it stays in
    // the plain A-Z index rather than cluttering Top picks with strangers.
  }

  const byScore = (a, b) => b.score - a.score
  mustSee.sort(byScore)
  suggested.sort(byScore)
  return { mustSee, suggested, skipped }
}

// Re-exported so callers of buildShowPlan don't also need to import parseLineup
// just to hand it seed text.
export { parseLineup }
