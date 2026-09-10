// Convention competition winners: the award board a show puts up on the last
// afternoon — Best of Show, Best Black & Grey, Best Large Colour — and the
// artists who won them.
//
// Why this sits next to the line-up index rather than inside it: a show's
// line-up is a haystack of ~500 names, while its results are the ten-to-twenty
// the judges just picked out of it. For someone deciding who to get tattooed
// by, that is the highest-signal list the convention produces, and it arrives
// already sorted into the style categories the gallery is tagged by.
//
// It arrives by paste, for the same reasons the line-up does (see lineup.js):
// results are posted as images and client-rendered pages, and third-party
// portfolio data does not belong in the repo. Parsing is strict in the same
// places — handles go through the one allowlist in lineup.js rather than a
// second copy of it, and anything that does not look like a result row is
// dropped instead of becoming a fake winner.
//
// The winning tattoo itself is a photo the user attaches (the shot everyone
// takes of the trophy table). It is theirs, it stays on the device, and it is
// never committed — same rule that keeps public/images/artists/ out of git.

import { normaliseHandle } from './lineup'

// A results board is tens of rows, not hundreds; this is headroom, not a target.
export const MAX_WINNER_ENTRIES = 200

// Longer than any plausible "1st — Name @handle — Studio, Country" row.
const MAX_LINE_LENGTH = 120

// A line with no handle, no placing and more words than this is a sentence —
// the "congratulations to everyone who entered" paragraph that sits in the same
// copied block as the results.
const MAX_HEADING_WORDS = 6

// Canonical award taxonomy, in the order a show reads them out: the two
// whole-show prizes first, then style categories, then size/placement, then the
// specials. Generic and factual — no person or studio data ships here.
export const AWARD_CATEGORIES = [
  'Best of Show',
  'Best of Day',
  'Best Black & Grey',
  'Best Colour',
  'Best Realism',
  'Best Portrait',
  'Best Traditional',
  'Best Neo-Traditional',
  'Best Japanese',
  'Best Blackwork',
  'Best Dotwork',
  'Best Fine Line',
  'Best Script & Lettering',
  'Best Dark Art',
  'Best Surrealism',
  'Best Horror',
  'Best Small',
  'Best Medium',
  'Best Large',
  'Best Sleeve',
  'Best Back Piece',
  'Best Cover-Up',
  'Best Newcomer',
  // The size × finish grid the UK shows actually judge on (Brighton, Freeze and
  // the UKTTA shows all run some version of it). Kept below the "Best …" awards
  // because a show that runs both treats those as the bigger prizes.
  'Small Colour',
  'Small Black & Grey',
  'Small Healed',
  'Small Decorative',
  'Large Colour',
  'Large Black & Grey',
  'Large Healed',
  'Large Decorative',
  'Project',
]

// A results heading is often prefixed with the day it was judged on
// ("Saturday - Small Healed"). The day is scheduling, not a category.
const DAY_PREFIX = /^(mon|tues|wednes|thurs|fri|satur|sun)day\s*[-–—:|]\s*/i

// The load-bearing phrase in a real results row. Everything before it is the
// collector wearing the tattoo; everything after is the artist who made it.
const TATTOOED_BY = /\s+tattooed\s+by\s+/i

// Rows in the copied block that are furniture rather than a result or a heading.
const CHROME = new Set([
  'results', 'result', 'winners', 'winner', 'competition', 'competitions',
  'award', 'awards', 'contest', 'contests', 'trophy', 'trophies', 'prize', 'prizes',
  'best', 'category', 'categories', 'judging', 'judges', 'congratulations',
  'day one', 'day two', 'day three', 'day 1', 'day 2', 'day 3',
  'friday', 'saturday', 'sunday', 'home', 'menu', 'close', 'back to top',
])

// '&' and 'and' are the same word here, and a show may spell colour either way.
function categoryKey(raw = '') {
  return String(raw || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\bcolors?\b/g, 'colour')
    .replace(/[^a-z0-9]/g, '')
    .replace(/color/g, 'colour')
}

// Built once: every canonical label answers to its own key, to the same key
// without the leading "best" (a board that just writes "Realism"), and to the
// short forms shows actually print.
const CATEGORY_LOOKUP = (() => {
  const map = new Map()
  for (const label of AWARD_CATEGORIES) {
    const key = categoryKey(label)
    map.set(key, label)
    const core = key.replace(/^best/, '')
    if (core && !map.has(core)) map.set(core, label)
  }
  for (const [alias, label] of [
    ['bg', 'Best Black & Grey'],
    ['bandg', 'Best Black & Grey'],
    ['blackgrey', 'Best Black & Grey'],
    ['bos', 'Best of Show'],
    ['bestinshow', 'Best of Show'],
    ['bestoftheshow', 'Best of Show'],
    ['bestoftheday', 'Best of Day'],
    ['lettering', 'Best Script & Lettering'],
    ['script', 'Best Script & Lettering'],
    ['neotrad', 'Best Neo-Traditional'],
    ['trad', 'Best Traditional'],
    ['coverup', 'Best Cover-Up'],
    ['backpiece', 'Best Back Piece'],
  ]) {
    map.set(alias, label)
  }
  return map
})()

const PLACINGS = new Map([
  ['1', 1], ['1st', 1], ['first', 1], ['winner', 1], ['gold', 1], ['🥇', 1],
  ['2', 2], ['2nd', 2], ['second', 2], ['runnerup', 2], ['silver', 2], ['🥈', 2],
  ['3', 3], ['3rd', 3], ['third', 3], ['bronze', 3], ['🥉', 3],
])

function tidy(raw = '') {
  return String(raw || '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[\s,;:.\-–—|·•]+$/, '')
    .replace(/^[\s,;:\-–—|·•]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normaliseName(name = '') {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// A canonical label when the taxonomy knows this category, the tidied text when
// it does not — a show's one-off "Best Tribal" is still a real award, and
// dropping it would lose a winner.
export function normaliseCategory(raw = '') {
  const clean = tidy(raw)
  if (!clean) return ''
  return CATEGORY_LOOKUP.get(categoryKey(clean)) || clean
}

export function normalisePlacing(raw = '') {
  // `u` matters: without it the medals decompose into surrogate halves inside
  // the character class, and a stray half would survive the strip.
  const key = String(raw || '').toLowerCase().replace(/[^a-z0-9🥇🥈🥉]/gu, '')
  if (!key) return null
  return PLACINGS.get(key) ?? null
}

// Two winners are the same row when the same artist won the same category.
// Category is part of the key on purpose: taking Best of Show *and* Best Large
// Colour is the good outcome, and collapsing those would erase the better half.
export function winnerKey(entry = {}) {
  const who = entry.handle ? `@${entry.handle}` : normaliseName(entry.name)
  if (!who) return ''
  return `${categoryKey(entry.category)}|${who}`
}

function richness(entry) {
  return (entry.name ? 2 : 0) + (entry.handle ? 4 : 0) + (entry.note ? 1 : 0) + (entry.placing ? 1 : 0)
}

const SEPARATOR = /\s*\|\s*|\s+[–—]\s+|\s+-\s+|\s*:\s+/

// "<artist>, <studio>, <town>" or "<artist> - <studio>, <town>": the artist runs
// up to whichever separator comes first, so a studio credited to two people
// ("K.Peanut & Gee Jenkins") survives intact while a dash-separated studio does
// not get glued onto the name.
function splitArtistFromStudio(text) {
  const comma = text.indexOf(',')
  const dash = text.search(/\s+[-–—]\s+/)
  const at = [comma, dash].filter((i) => i >= 0).sort((a, b) => a - b)[0]
  if (at === undefined) return { artist: tidy(text), note: '' }
  const skip = at === dash ? text.slice(at).match(/^\s+[-–—]\s+/)[0].length : 1
  return { artist: tidy(text.slice(0, at)), note: tidy(text.slice(at + skip)) }
}

function parseLine(line, runningCategory) {
  let raw = line.trim()
  if (!raw || raw.length > MAX_LINE_LENGTH) return null
  if (CHROME.has(raw.toLowerCase().replace(/[:.]+$/, ''))) return null
  raw = raw.replace(DAY_PREFIX, '')

  // The real-world row: "1st Place - Tia tattooed by Adam Blakey, New Mind,
  // Huddersfield." Handled ahead of the generic path because the phrase tells
  // us exactly which of the two names is the artist — guessing from position
  // gets it backwards, which is what the first version of this parser did.
  const byMatch = raw.split(TATTOOED_BY)
  if (byMatch.length === 2) {
    const [lead, credit] = byMatch
    // "1st Place - Tia" / "1st - Tia" / "Winner: Tia" — one match takes the
    // placing and leaves the collector behind it.
    const led = lead.match(/^\s*(1st|2nd|3rd|first|second|third|winner|🥇|🥈|🥉)\b\s*(?:place\b)?/iu)
    const placing = led ? normalisePlacing(led[1]) : null
    const collector = tidy((led ? lead.slice(led[0].length) : lead).replace(/^[\s\-–—:.]+/, ''))
    const { artist, note } = splitArtistFromStudio(credit)
    if (!artist) return null
    return {
      category: runningCategory,
      placing,
      name: artist,
      handle: '',
      note,
      ...(collector ? { collector } : {}),
    }
  }

  // Pull the handle out first so the separators below can't split it.
  let handle = ''
  let rest = raw
  const handleMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^/?#\s)]+[/?#]?\S*|@[^\s)|,]+/i)
  if (handleMatch) {
    const found = normaliseHandle(handleMatch[0])
    if (found) {
      handle = found
      rest = raw.replace(handleMatch[0], ' ')
    }
  }

  const parts = rest.split(SEPARATOR).map(tidy).filter(Boolean)
  if (!parts.length) {
    // The row was nothing but a handle: still a winner, under the running heading.
    return handle ? { category: runningCategory, placing: null, name: '', handle, note: '' } : null
  }

  // "Best Colour | 1st | Name" — an inline category only counts when the
  // taxonomy recognises it, so an artist called "Grace" can't become a heading.
  let category = runningCategory
  if (parts.length > 1 && CATEGORY_LOOKUP.has(categoryKey(parts[0]))) {
    category = normaliseCategory(parts.shift())
  }

  let placing = normalisePlacing(parts[0])
  if (placing !== null) {
    parts.shift()
  } else {
    // "1st Oscar Akermo" with no separator after the ordinal.
    const glued = parts[0].match(/^(1st|2nd|3rd|first|second|third|winner)\b[\s.)-]*/i)
    if (glued) {
      placing = normalisePlacing(glued[1])
      parts[0] = tidy(parts[0].slice(glued[0].length))
      if (!parts[0]) parts.shift()
    }
  }

  const name = tidy(parts[0] || '')
  const note = tidy(parts.slice(1).join(' — '))

  // No handle and no placing: this is probably a heading, not a row.
  if (!handle && placing === null) {
    const words = name.split(/\s+/).filter(Boolean).length
    if (!note && words > 0 && words <= MAX_HEADING_WORDS) {
      const known = CATEGORY_LOOKUP.has(categoryKey(name))
      // "Best <something>" is a heading even when the taxonomy hasn't met it.
      if (known || /^best\b/i.test(name)) return { heading: normaliseCategory(name) }
      // Otherwise it is undecidable from this line alone — shows invent
      // categories ("Asian Inspired", "Ornamental") that look exactly like a
      // person's name. parseWinners settles it by looking at what follows.
      return { maybeHeading: normaliseCategory(name) }
    }
    // A sentence, or a name with nothing to identify it by.
    if (words > MAX_HEADING_WORDS || normaliseName(name).length < 2) return null
    // Bare text with no handle, no placing and no heading above it has nothing
    // making it a result — it is the "Competition Winners" banner, not a winner.
    if (!runningCategory) return null
  }

  if (!handle && normaliseName(name).length < 2) return null
  return {
    category,
    placing,
    name: handle && name.toLowerCase() === handle ? '' : name,
    handle,
    note,
  }
}

// Pasted results board → winner rows, deduped, capped, richest row wins.
export function parseWinners(text = '') {
  const byKey = new Map()
  let category = ''
  const lines = String(text || '').split(/\r?\n/)

  // Does a real result row follow this line? That is what separates a category
  // the taxonomy has never met from an artist with no handle: a heading has
  // winners under it, a trailing "Thanks everyone" has nothing.
  const headsSomething = (from) => {
    for (let j = from + 1; j < lines.length; j += 1) {
      if (!lines[j].trim()) continue
      const next = parseLine(lines[j], category)
      if (!next) return false
      if (next.heading !== undefined || next.maybeHeading !== undefined) return false
      return Boolean(next.handle) || next.placing !== null
    }
    return false
  }

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseLine(lines[i], category)
    if (!parsed) continue
    if (parsed.maybeHeading !== undefined) {
      if (headsSomething(i)) category = parsed.maybeHeading
      continue
    }
    if (parsed.heading !== undefined) {
      category = parsed.heading
      continue
    }
    const key = winnerKey(parsed)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      if (byKey.size >= MAX_WINNER_ENTRIES) break
      byKey.set(key, parsed)
    } else if (richness(parsed) > richness(existing)) {
      byKey.set(key, parsed)
    }
  }
  return Array.from(byKey.values())
}

// A re-import after the show posts the rest of the results: keep what you had,
// add what is new, let a richer row win — but never drop a photo the user
// attached, which is the one part of a winner that isn't re-importable.
export function mergeWinnerEntries(existing = [], incoming = []) {
  const byKey = new Map()
  for (const entry of [...existing, ...incoming]) {
    const key = winnerKey(entry)
    if (!key) continue
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, entry)
      continue
    }
    // Photo ids are the one part of a winner a re-import cannot bring back, so
    // they survive whichever row wins on richness — and merge, because two
    // imports may each have picked up a different shot of the same piece.
    const photoIds = [...new Set([...(current.photoIds || []), ...(entry.photoIds || [])])]
    const richer = richness(entry) >= richness(current) ? entry : current
    byKey.set(key, photoIds.length ? { ...richer, photoIds } : richer)
  }
  return Array.from(byKey.values()).slice(0, MAX_WINNER_ENTRIES)
}

// Cross-reference against the gallery, the same handle-then-name way the
// line-up index does. Unlike the line-up there is no single-claim rule: one
// artist genuinely can appear in several categories, and each row should say so.
export function indexWinners(entries = [], artists = []) {
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

  return entries.map((entry) => {
    const viaHandle = entry.handle ? byHandle.get(entry.handle) : null
    const viaName = !viaHandle && entry.name ? byName.get(normaliseName(entry.name)) : null
    const inferred = !viaHandle && !viaName ? inferFromHandle(entry.name, artists) : null
    const artist = viaHandle || viaName || inferred || null
    return {
      ...entry,
      label: entry.name || (entry.handle ? `@${entry.handle}` : ''),
      savedArtistId: artist ? artist.id : null,
      artist,
      // Which evidence connected this row, so the UI can be honest about a
      // match it worked out rather than one the show published.
      matchedBy: viaHandle ? 'handle' : viaName ? 'name' : inferred ? 'name~handle' : null,
    }
  })
}

// Shortest name that is distinctive enough to risk this on. Below it, a common
// first name would start matching handles that merely begin the same way.
const MIN_INFERRED_NAME = 8

// A results board prints "Adam Blakey"; the gallery holds `adamblakeytattoos`
// with no name at all, because the owner saved a handle they follow. Neither
// exact test can bridge that, so the name is tried as the opening of a handle —
// artists overwhelmingly build handles out of their own name.
//
// Two guards keep it from inventing links: the name must be long enough to be
// distinctive, and it must single out exactly one artist. A near-miss (the
// "Blackey" typo on Brighton's own page) simply fails, which is the right
// outcome — attaching an award to the wrong artist is worse than missing one.
function inferFromHandle(name, artists) {
  const key = normaliseName(name)
  if (!key) return null

  // "Zoia Ink" against `zoia.ink` is the whole handle once punctuation goes —
  // exact evidence, just stored in the other field, so no length guard.
  const exact = artists.filter((a) => normaliseName(a.handle) === key)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null

  // A prefix is weaker evidence, so the name has to be distinctive first.
  if (key.length < MIN_INFERRED_NAME) return null
  const hits = artists.filter((a) => {
    const handle = normaliseName(a.handle)
    return handle && handle.startsWith(key)
  })
  return hits.length === 1 ? hits[0] : null
}

// Rows with no heading of their own still deserve to be shown.
const UNCATEGORISED = 'Other awards'

function categoryRank(category) {
  const index = AWARD_CATEGORIES.indexOf(category)
  if (index >= 0) return index
  // Everything the taxonomy doesn't know sorts after everything it does,
  // alphabetically among itself, with the no-category bucket dead last.
  return category === UNCATEGORISED ? Number.MAX_SAFE_INTEGER : AWARD_CATEGORIES.length
}

export function groupWinners(indexed = []) {
  const groups = new Map()
  for (const entry of indexed) {
    const category = entry.category || UNCATEGORISED
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(entry)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
    .map(([category, entries]) => ({
      category,
      entries: entries.slice().sort(
        (x, y) =>
          (x.placing ?? Infinity) - (y.placing ?? Infinity) ||
          String(x.label).localeCompare(String(y.label), undefined, { sensitivity: 'base' })
      ),
    }))
}

export function winnerCounts(indexed = []) {
  const saved = indexed.filter((e) => e.savedArtistId).length
  const photos = indexed.reduce((n, e) => n + (e.photoIds?.length || 0), 0)
  return { total: indexed.length, saved, fresh: indexed.length - saved, photos }
}

// Draft for createArtist when you add a winner straight from the board. Tags stay
// empty on purpose: an award category is a judging bracket, not one of the app's
// style tags, and guessing would pollute the matching Brief and Concepts run on.
export function winnerArtistDraft(entry, conventionName = '') {
  const award = [entry.category, entry.placing ? `${entry.placing}${['st', 'nd', 'rd'][entry.placing - 1]}` : '']
    .filter(Boolean)
    .join(' ')
  const where = conventionName ? ` at ${conventionName}` : ''
  return {
    handle: entry.handle,
    name: entry.name || '',
    tags: [],
    status: 'researching',
    styleNote: '',
    images: [],
    note: award ? `Won ${award}${where}.` : `Competition winner${where}.`,
  }
}
