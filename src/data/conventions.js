// Curated shortlist of UK tattoo conventions worth Pritesh's time:
// the biggest English shows + the local Milton Keynes fest + the big Manchester show.
//
// Every show recurs, so a show holds a list of `editions`, one per year (#178).
// Attendance, line-ups and winners belong to an edition, not to the show: stored
// by show id alone, moving the dates on a year would claim everyone who went to
// Big London 2026 is going in 2027. A card opens on the current edition (the
// first one not yet over) and keeps the earlier ones as a record.
//
// Show fields:
// `popular: true`     largest / most prestigious shows.
// `distanceMiles`     approximate driving distance from Milton Keynes (0 = local).
// `recurring`         when it usually lands, so a TBC edition still reads usefully.
//
// Edition fields:
// `year`              the edition's year; `${id}@${year}` is its storage key.
// `dates`             display text. Month-only editions say "(TBC)".
// `startDate`         ISO YYYY-MM-DD of the first day; null when only the month is known.
// `endDate`           ISO YYYY-MM-DD of the last day; null when only the month is known.
// `endMonth`          ISO YYYY-MM, only when `endDate` is null — enough to tell
//                     that the edition is over (isPastEdition).
// `unconfirmed: true` the days come from a listings site, not the show itself.
// `attendingArtistIds` artist IDs from your saved list confirmed attending. The
//                      user's own toggles (tattoo_convention_attending) override it.
//
// Never guess a day. When a show hasn't announced dates, give the usual month
// and say TBC; when only a listings site has them, mark the edition unconfirmed.

export const CONVENTIONS = [
  {
    id: 'uk-tattoo-fest',
    name: 'UK Tattoo Fest',
    location: 'Marshall Arena, Milton Keynes',
    recurring: 'Annually, mid-March',
    url: 'https://www.uktattoofest.co.uk/',
    summary: 'Your home-town show. 250+ award-winning artists and traders over two days at Marshall Arena — the easiest one to get to and a great place to meet artists in person.',
    popular: true,
    distanceMiles: 0,
    editions: [
      { year: 2026, dates: '14–15 March 2026', startDate: '2026-03-14', endDate: '2026-03-15', attendingArtistIds: [] },
      // Listed by worldtattooevents.com (checked 2026-11-05). The show's own
      // site could not be reached to confirm it.
      { year: 2027, dates: '13–14 March 2027', startDate: '2027-03-13', endDate: '2027-03-14', unconfirmed: true, attendingArtistIds: [] },
    ],
  },
  {
    id: 'big-london',
    name: 'Big London Tattoo Show',
    location: 'ExCeL London',
    recurring: 'Annually, early September',
    url: 'https://www.biglondontattooshow.com/',
    summary: 'Three-day flagship at London\'s biggest indoor venue. 450 of the best international artists, plus funfair, sideshows, fire performers and alternative markets.',
    popular: true,
    distanceMiles: 55,
    editions: [
      {
        year: 2026,
        dates: '4–6 September 2026',
        startDate: '2026-09-04',
        endDate: '2026-09-06',
        // Cross-referenced 2026-08-25 against the official 2026 exhibitor list
        // (biglondontattooshow.com). List was marked incomplete — a few artists
        // had no Instagram handle listed, so `andro` was matched by name + studio
        // (No Regrets) rather than handle; re-check if the organiser list updates.
        attendingArtistIds: ['carlosvalera', 'berkbosveren', 'tattoo_amir', 'silas_balaio', 'johndarktattoo', 'andro'],
      },
      // Not announced: the show's homepage still describes 2026 (checked
      // 2026-11-05), and ExCeL's calendar lists no 2027 tattoo show yet.
      { year: 2027, dates: 'September 2027 (TBC)', startDate: null, endDate: null, endMonth: '2027-09', attendingArtistIds: [] },
    ],
  },
  {
    id: 'london-international',
    name: 'The London Tattoo Convention',
    location: 'Tobacco Dock, London',
    recurring: 'Annually, late September',
    // Deliberately no url: thelondontattooconvention.com's root now serves an
    // unrelated affiliate page (checked 2026-09-12 by fetching it directly,
    // not inferred from search snippets — a sub-path like /trade-enquiries/
    // still resolves to the real convention, so this reads as a compromised
    // or repurposed install rather than a plain expired domain). "More info"
    // hides itself rather than send anyone there; see Conventions.jsx. Restore
    // once a verified current URL exists — don't guess a social handle in.
    url: '',
    summary: 'The most prestigious show in the country — a heavily curated international line-up in a Victorian dockside venue. Smaller and more exclusive than the arena shows.',
    popular: true,
    distanceMiles: 55,
    editions: [
      { year: 2026, dates: 'September 2026 (TBC)', startDate: null, endDate: null, endMonth: '2026-09', attendingArtistIds: [] },
      // Nothing found for 2027 (checked 2026-11-05) — nor a dated edition since
      // 2019. Worth asking whether this show belongs on the list at all.
      { year: 2027, dates: 'September 2027 (TBC)', startDate: null, endDate: null, endMonth: '2027-09', attendingArtistIds: [] },
    ],
  },
  {
    id: 'brighton',
    name: 'Brighton Tattoo Convention',
    location: 'The Brighton Centre, Brighton',
    recurring: 'Annually, late February',
    url: 'https://www.brightontattoo.com/',
    summary: '375+ hand-picked artists and studios, 50+ vendors, live music and competitions by the seafront. One of the longest-running UK shows.',
    popular: true,
    distanceMiles: 95,
    editions: [
      { year: 2026, dates: '28 February – 1 March 2026', startDate: '2026-02-28', endDate: '2026-03-01', attendingArtistIds: [] },
      // The 18th edition, listed by worldtattooevents.com and cantonfair.net
      // (checked 2026-11-05). The show's own site could not be reached to confirm it.
      { year: 2027, dates: '27–28 February 2027', startDate: '2027-02-27', endDate: '2027-02-28', unconfirmed: true, attendingArtistIds: [] },
    ],
  },
  {
    id: 'docks-liverpool',
    name: 'The Docks Liverpool Tattoo & Arts Expo',
    location: 'Exhibition Centre Liverpool',
    recurring: 'Annually, May',
    url: 'https://www.thedockstattooexpo.com/',
    summary: 'Built by tattoo artists for tattoo artists, on Liverpool\'s King\'s Dock waterfront. The north-west\'s main destination show.',
    distanceMiles: 175,
    editions: [
      { year: 2026, dates: 'May 2026 (dates TBC)', startDate: null, endDate: null, endMonth: '2026-05', attendingArtistIds: [] },
      // Not announced anywhere found (checked 2026-11-05); past editions ran mid-May.
      { year: 2027, dates: 'May 2027 (dates TBC)', startDate: null, endDate: null, endMonth: '2027-05', attendingArtistIds: [] },
    ],
  },
  {
    id: 'tattoo-freeze',
    name: 'Tattoo Freeze',
    location: 'Telford International Centre',
    recurring: 'Annually, late January',
    url: 'https://www.tattoofreeze.com/',
    summary: 'The UK\'s first big show of the year, now merged with the Great British Tattoo Show. A warm indoor escape and a strong international line-up to start the calendar.',
    distanceMiles: 68,
    editions: [
      { year: 2026, dates: '31 January – 1 February 2026', startDate: '2026-01-31', endDate: '2026-02-01', attendingArtistIds: [] },
      // Listed by inkppl.com (checked 2026-11-05). The show's own site could
      // not be reached to confirm it.
      { year: 2027, dates: '30–31 January 2027', startDate: '2027-01-30', endDate: '2027-01-31', unconfirmed: true, attendingArtistIds: [] },
    ],
  },
  {
    id: 'uktta-manchester',
    name: 'UKTTA Manchester',
    location: 'Depot Mayfield, Manchester',
    recurring: 'Annually, August',
    // The 2026 page: the last one verified. Swap in the 2027 page once it exists.
    url: 'https://uktta.co.uk/uktta-manchester-2026/',
    summary: 'Billed as the UK\'s biggest tattoo convention — 400+ artists in a vast converted railway depot. The major northern show.',
    popular: true,
    distanceMiles: 130,
    editions: [
      { year: 2026, dates: '8–9 August 2026', startDate: '2026-08-08', endDate: '2026-08-09', attendingArtistIds: [] },
      // Not announced anywhere found (checked 2026-11-05). 2025 ran in late
      // July and 2026 in August, so watch for either.
      { year: 2027, dates: 'August 2027 (TBC)', startDate: null, endDate: null, endMonth: '2027-08', attendingArtistIds: [] },
    ],
  },
]

// Every attendance override, line-up import and winners board stored before
// #178 is keyed by bare show id, and all of them are about the 2026 editions —
// the only ones the app knew. So a bare id means its 2026 edition, everywhere.
export const LEGACY_EDITION = 2026

const SHOW_IDS = new Set(CONVENTIONS.map((c) => c.id))

export const editionKey = (conventionId, year) => `${conventionId}@${year}`

export function normaliseEditionKey(key) {
  return SHOW_IDS.has(key) ? editionKey(key, LEGACY_EDITION) : key
}

// Moves bare-id keys onto their 2026 edition. Read-time only: callers run it
// before reading and before writing, so a map is rewritten on the next real
// edit rather than on load (a write with nothing changed would stamp the
// synced attendance map and could outrank a real edit made on another device).
// An edition key that is already there wins over a bare one. Keys it doesn't
// recognise are kept, never deleted. Same object back when there's nothing to do.
export function migrateEditionMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {}
  const legacy = Object.keys(map).filter((k) => SHOW_IDS.has(k))
  if (legacy.length === 0) return map
  const next = { ...map }
  for (const id of legacy) {
    const key = editionKey(id, LEGACY_EDITION)
    if (!(key in next)) next[key] = map[id]
    delete next[id]
  }
  return next
}

const pad2 = (n) => String(n).padStart(2, '0')

// Whether an edition is over: true from the day after `endDate` (local time,
// so a show is still on until midnight on its last day), or from the month
// after `endMonth` when only the month is known. An edition with neither is
// never called past — there is nothing to say it is (#160).
export function isPastEdition(edition, now = new Date()) {
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(edition?.endDate || '')) return edition.endDate < today
  if (/^\d{4}-\d{2}$/.test(edition?.endMonth || '')) return edition.endMonth < today.slice(0, 7)
  return false
}

// The edition a card opens on: the first one not yet over, or the latest once
// they all are.
export function currentEdition(convention, now = new Date()) {
  const editions = [...(convention?.editions || [])].sort((a, b) => a.year - b.year)
  return editions.find((e) => !isPastEdition(e, now)) || editions[editions.length - 1] || null
}

// A show seen as one of its editions: the show's own fields plus that edition's
// dates and attendance, flattened so every page can read `c.dates` and
// `c.attendingArtistIds` without knowing editions exist.
function asEdition(show, edition) {
  return {
    ...show,
    year: edition.year,
    editionKey: edition.key,
    label: `${show.name} ${edition.year}`,
    dates: edition.dates,
    startDate: edition.startDate ?? null,
    endDate: edition.endDate ?? null,
    endMonth: edition.endMonth ?? null,
    unconfirmed: Boolean(edition.unconfirmed),
    attendingArtistIds: edition.attendingArtistIds,
  }
}

// Every show as its current edition, with each edition's attendance resolved
// (the user's override if there is one, else the shipped list) under `editions`.
export function mergeConventionOverrides(overrides = {}, now = new Date()) {
  const stored = migrateEditionMap(overrides)
  return CONVENTIONS.map(({ editions: raw = [], ...show }) => {
    const editions = raw
      .map((e) => {
        const key = editionKey(show.id, e.year)
        return { ...e, key, attendingArtistIds: stored[key] ?? e.attendingArtistIds ?? [] }
      })
      .sort((a, b) => a.year - b.year)
    return asEdition({ ...show, editions }, currentEdition({ editions }, now))
  })
}

// The same show seen as another of its editions — what a card shows when you
// switch year. A year it doesn't have falls back to the current edition.
export function viewEdition(merged, year) {
  const edition = merged.editions.find((e) => e.year === year)
    || merged.editions.find((e) => e.key === merged.editionKey)
  return asEdition(merged, edition)
}

// Past editions an artist was at, newest first: history, kept apart from the
// shows ahead. The current edition is left out even once it's over, since the
// "attending" list already shows it (with its passed note).
export function pastAttendance(merged = [], artistId, now = new Date()) {
  return merged
    .flatMap((c) => c.editions
      .filter((e) => e.key !== c.editionKey && isPastEdition(e, now) && e.attendingArtistIds.includes(artistId))
      .map((e) => viewEdition(c, e.year)))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
}

// Toggle one artist's attendance at an edition, returning the next overrides
// map. `currentIds` is the merged current attendee list (override-or-base) so
// the first edit seeds from base data rather than wiping it. Bare-id keys are
// migrated on the way, so the stored map ends up all edition keys.
export function toggleConventionAttendee(overrides = {}, key, artistId, currentIds = []) {
  const next = currentIds.includes(artistId)
    ? currentIds.filter((id) => id !== artistId)
    : [...currentIds, artistId]
  return { ...migrateEditionMap(overrides), [key]: next }
}

export function getConventionFavicon(convention) {
  if (!convention.url) return ''
  try {
    const { hostname } = new URL(convention.url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`
  } catch {
    return ''
  }
}
