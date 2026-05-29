// Curated shortlist of UK tattoo conventions worth Pritesh's time:
// the biggest English shows + the local Milton Keynes fest + the big Manchester show.
// These recur annually — `dates` is the most recent known edition and `recurring`
// describes when it lands each year, so the entry stays useful after the date passes.
//
// `popular: true`     largest / most prestigious shows.
// `distanceMiles`     approximate driving distance from Milton Keynes (0 = local).
// `endDate`           ISO YYYY-MM-DD of the last day; null when not yet announced.
// `attendingArtistIds` artist IDs from your saved list confirmed attending (kept for
//                      the cross-reference on other pages; populate later if you want).

export const CONVENTIONS = [
  {
    id: 'uk-tattoo-fest',
    name: 'UK Tattoo Fest',
    location: 'Marshall Arena, Milton Keynes',
    dates: '14–15 March 2026',
    recurring: 'Annually, mid-March',
    url: 'https://www.uktattoofest.co.uk/',
    summary: 'Your home-town show. 250+ award-winning artists and traders over two days at Marshall Arena — the easiest one to get to and a great place to meet artists in person.',
    popular: true,
    distanceMiles: 0,
    endDate: '2026-03-15',
    attendingArtistIds: [],
  },
  {
    id: 'big-london',
    name: 'Big London Tattoo Show',
    location: 'ExCeL London',
    dates: '4–6 September 2026',
    recurring: 'Annually, early September',
    url: 'https://www.biglondontattooshow.com/',
    summary: 'Three-day flagship at London\'s biggest indoor venue. 450 of the best international artists, plus funfair, sideshows, fire performers and alternative markets.',
    popular: true,
    distanceMiles: 55,
    endDate: '2026-09-06',
    attendingArtistIds: [],
  },
  {
    id: 'london-international',
    name: 'The London Tattoo Convention',
    location: 'Tobacco Dock, London',
    dates: 'September 2026 (TBC)',
    recurring: 'Annually, late September',
    url: 'https://www.thelondontattooconvention.com/',
    summary: 'The most prestigious show in the country — a heavily curated international line-up in a Victorian dockside venue. Smaller and more exclusive than the arena shows.',
    popular: true,
    distanceMiles: 55,
    endDate: null,
    attendingArtistIds: [],
  },
  {
    id: 'brighton',
    name: 'Brighton Tattoo Convention',
    location: 'The Brighton Centre, Brighton',
    dates: '28 February – 1 March 2026',
    recurring: 'Annually, late February',
    url: 'https://www.brightontattoo.com/',
    summary: '17th edition. 375+ hand-picked artists and studios, 50+ vendors, live music and competitions by the seafront. One of the longest-running UK shows.',
    popular: true,
    distanceMiles: 95,
    endDate: '2026-03-01',
    attendingArtistIds: [],
  },
  {
    id: 'docks-liverpool',
    name: 'The Docks Liverpool Tattoo & Arts Expo',
    location: 'Exhibition Centre Liverpool',
    dates: 'May 2026 (dates TBC)',
    recurring: 'Annually, May',
    url: 'https://www.thedockstattooexpo.com/',
    summary: 'Built by tattoo artists for tattoo artists, on Liverpool\'s King\'s Dock waterfront. The north-west\'s main destination show.',
    distanceMiles: 175,
    endDate: null,
    attendingArtistIds: [],
  },
  {
    id: 'tattoo-freeze',
    name: 'Tattoo Freeze',
    location: 'Telford International Centre',
    dates: '31 January – 1 February 2026',
    recurring: 'Annually, late January',
    url: 'https://www.tattoofreeze.com/',
    summary: 'The UK\'s first big show of the year, now merged with the Great British Tattoo Show. A warm indoor escape and a strong international line-up to start the calendar.',
    distanceMiles: 68,
    endDate: '2026-02-01',
    attendingArtistIds: [],
  },
  {
    id: 'uktta-manchester',
    name: 'UKTTA Manchester',
    location: 'Depot Mayfield, Manchester',
    dates: '8–9 August 2026',
    recurring: 'Annually, August',
    url: 'https://uktta.co.uk/uktta-manchester-2026/',
    summary: 'Billed as the UK\'s biggest tattoo convention — 400+ artists in a vast converted railway depot. The major northern show.',
    popular: true,
    distanceMiles: 130,
    endDate: '2026-08-09',
    attendingArtistIds: [],
  },
]

export function mergeConventionOverrides(overrides = {}) {
  return CONVENTIONS.map((c) => ({
    ...c,
    attendingArtistIds: overrides[c.id] ?? c.attendingArtistIds ?? [],
  }))
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
