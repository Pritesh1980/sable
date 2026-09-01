// Convention line-ups: the flat A–Z artist list a big show publishes (the Big
// London Tattoo Show fields ~500 artists), turned into something you can
// actually work — searchable, cross-referenced against your own gallery, and
// one tap from adding an artist you spot in it.
//
// The list arrives by paste rather than by fetch. A show's artist page is a
// client-rendered site with no feed, and scraping it would put third-party
// portfolio data in the repo; copying the page text into the import box keeps
// the data the user's own, works offline, and re-imports in seconds when the
// show updates its line-up.
//
// Parsing is deliberately strict and forgiving in the same places as
// screenshotIntake: handles are validated against Instagram's alphabet rather
// than trusted, and anything that does not look like an artist row (index
// letters, nav chrome, prose) is dropped instead of becoming a fake entry.

// A paste is user input; a stuck key or a whole-page copy should not write
// megabytes into localStorage (and through it, into sync).
export const MAX_LINEUP_ENTRIES = 1000

// Longer than any plausible "Name @handle — Studio, Country" row: prose.
const MAX_LINE_LENGTH = 120

// Page furniture that sits in the same copied block as the artist rows.
const CHROME = new Set([
  'artist list', 'artists', 'artist', 'tattoo artists', 'the artists', 'line up', 'lineup',
  'home', 'tickets', 'search', 'menu', 'close', 'back to top', 'top', 'a-z', 'a–z',
  'book now', 'read more', 'more info', 'load more', 'show more', 'all', 'exhibitors',
])

// Where the line-up for a given convention is published, shown next to the
// import box so the list is one tap away on the phone.
export const LINEUP_SOURCES = {
  'big-london': 'https://www.biglondontattooshow.com/tattoo-artists/artist-list',
  'uk-tattoo-fest': 'https://www.uktattoofest.co.uk/',
  'london-international': 'https://www.thelondontattooconvention.com/',
  brighton: 'https://www.brightontattoo.com/',
  'uktta-manchester': 'https://uktta.co.uk/',
}

// Instagram handles are strictly [a-z0-9._], max 30 — same allowlist as
// screenshot intake. Anything else is text, not a handle.
export function normaliseHandle(raw = '') {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  const urlMatch = trimmed.match(/instagram\.com\/([^/?#\s]+)/i)
  const candidate = (urlMatch ? urlMatch[1] : trimmed).replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(candidate)) return ''
  // A run of dots/underscores is punctuation someone copied, not a handle.
  if (!/[a-z0-9]/.test(candidate)) return ''
  return candidate
}

function normaliseName(name = '') {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Dedupe key: the handle identifies an artist when there is one, the name
// otherwise. Two handle-less rows for the same name collapse; two artists who
// share a name but list different handles stay separate.
function entryKey(entry) {
  return entry.handle ? `@${entry.handle}` : normaliseName(entry.name)
}

// A row is richer when it carries more of the three fields — used so a second
// paste that includes names upgrades a first one that was handles only.
function richness(entry) {
  return (entry.name ? 2 : 0) + (entry.handle ? 4 : 0) + (entry.note ? 1 : 0)
}

function parseLine(line) {
  const raw = line.trim()
  if (!raw || raw.length > MAX_LINE_LENGTH) return null
  if (CHROME.has(raw.toLowerCase())) return null
  // Single characters are the A–Z index headings running down the page.
  if (raw.replace(/[^a-z0-9]/gi, '').length < 2) return null

  // Pull the first thing that looks like a handle out of the row; whatever is
  // left is the name (and, after the first separator, the studio/country).
  let handle = ''
  let rest = raw
  // The URL form consumes its trailing slash/query too, so no orphan
  // punctuation is left behind to be read as the artist's name.
  const handleMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^/?#\s)]+[/?#]?\S*|@[^\s)|,]+/i)
  if (handleMatch) {
    const found = normaliseHandle(handleMatch[0])
    if (found) {
      handle = found
      rest = raw.replace(handleMatch[0], ' ')
    }
  }

  // Separators a show's list uses between name, studio and country.
  const [namePart = '', ...noteParts] = rest.split(/\s+[–—|·•]\s+|\s+-\s+/)
  const clean = (s) => s.replace(/[()[\]]/g, ' ').replace(/[\s,;:.\-–—|·•]+$/, '').replace(/^[\s,;:\-–—|·•]+/, '').replace(/\s+/g, ' ').trim()
  const name = clean(namePart)
  const note = clean(noteParts.join(' — '))

  // Neither a handle nor a usable name: nothing to index.
  if (!handle && normaliseName(name).length < 2) return null
  return { name: handle && name.toLowerCase() === handle ? '' : name, handle, note }
}

// Pasted page text → line-up entries, deduped, capped, richest row wins.
export function parseLineup(text = '') {
  const byKey = new Map()
  for (const line of String(text || '').split(/\r?\n/)) {
    const entry = parseLine(line)
    if (!entry) continue
    const key = entryKey(entry)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      if (byKey.size >= MAX_LINEUP_ENTRIES) break
      byKey.set(key, entry)
    } else if (richness(entry) > richness(existing)) {
      byKey.set(key, entry)
    }
  }
  return Array.from(byKey.values())
}

// A re-import when the show adds artists: keep what you had, add what is new,
// and let a richer row (a name where you only had a handle) win.
export function mergeLineupEntries(existing = [], incoming = []) {
  const byKey = new Map()
  for (const entry of [...existing, ...incoming]) {
    const key = entryKey(entry)
    if (!key) continue
    const current = byKey.get(key)
    if (!current || richness(entry) >= richness(current)) byKey.set(key, entry)
  }
  return Array.from(byKey.values()).slice(0, MAX_LINEUP_ENTRIES)
}

// Cross-reference against the gallery: which of these 500 do you already have?
// Handle (or saved id) first, normalised name as the fallback for a list that
// prints names only. Each saved artist is claimed once, so a second row with
// the same name cannot double-count against the same record.
export function indexLineup(entries = [], artists = []) {
  const byHandle = new Map()
  const byName = new Map()
  for (const a of artists) {
    const handle = String(a.handle || '').toLowerCase()
    if (handle) byHandle.set(handle, a)
    const id = String(a.id || '').toLowerCase()
    if (id && !byHandle.has(id)) byHandle.set(id, a)
    const name = normaliseName(a.name)
    if (name && !byName.has(name)) byName.set(name, a)
  }

  const claimed = new Set()
  return entries.map((entry) => {
    const viaHandle = entry.handle ? byHandle.get(entry.handle) : null
    const viaName = !viaHandle && entry.name ? byName.get(normaliseName(entry.name)) : null
    const match = viaHandle || viaName
    const artist = match && !claimed.has(match.id) ? match : null
    if (artist) claimed.add(artist.id)
    return {
      ...entry,
      label: entry.name || (entry.handle ? `@${entry.handle}` : ''),
      savedArtistId: artist ? artist.id : null,
      artist: artist || null,
    }
  })
}

export function filterLineup(indexed = [], { query = '', view = 'all' } = {}) {
  const q = String(query || '').trim().toLowerCase().replace(/^@/, '')
  return indexed.filter((entry) => {
    if (view === 'saved' && !entry.savedArtistId) return false
    if (view === 'new' && entry.savedArtistId) return false
    if (!q) return true
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.handle.includes(q) ||
      entry.note.toLowerCase().includes(q)
    )
  })
}

// A–Z sections, the way the show prints its own list; anything not starting
// with a letter falls into a trailing '#' group.
export function groupLineup(indexed = []) {
  const groups = new Map()
  for (const entry of indexed) {
    const first = entry.label.replace(/^@/, '').charAt(0).toUpperCase()
    const letter = /[A-Z]/.test(first) ? first : '#'
    if (!groups.has(letter)) groups.set(letter, [])
    groups.get(letter).push(entry)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map(([letter, entries]) => ({
      letter,
      entries: entries.sort((x, y) => x.label.localeCompare(y.label, undefined, { sensitivity: 'base' })),
    }))
}

export function lineupCounts(indexed = []) {
  const saved = indexed.filter((e) => e.savedArtistId).length
  return { total: indexed.length, saved, fresh: indexed.length - saved }
}

// Draft for createArtist when you add someone straight from the index. Tags
// are left empty on purpose — the show's list says nothing about style, and a
// guessed tag would pollute the matching that Brief and Concepts run on.
export function lineupArtistDraft(entry, conventionName = '') {
  return {
    handle: entry.handle,
    name: entry.name || '',
    tags: [],
    status: 'researching',
    styleNote: '',
    images: [],
    note: conventionName ? `Spotted in the ${conventionName} line-up.` : '',
  }
}
