// Approximate driving distance from Milton Keynes for UK cities a guest spot is
// likely to be in (#183). Curated, not computed: an unknown city returns null
// and the UI says "distance unknown" rather than guessing. Numbers match the
// studio and convention tables (a test keeps them in step).
export const UK_PLACES = [
  { city: 'Milton Keynes', distanceMiles: 0 },
  { city: 'Northampton', distanceMiles: 20 },
  { city: 'Bedford', distanceMiles: 20 },
  { city: 'Luton', distanceMiles: 25 },
  { city: 'Aylesbury', distanceMiles: 20 },
  { city: 'Hemel Hempstead', distanceMiles: 30 },
  { city: 'St Albans', distanceMiles: 35 },
  { city: 'High Wycombe', distanceMiles: 35 },
  { city: 'Stevenage', distanceMiles: 35 },
  { city: 'Watford', distanceMiles: 40 },
  { city: 'Leamington Spa', distanceMiles: 45 },
  { city: 'Oxford', distanceMiles: 45 },
  { city: 'Coventry', distanceMiles: 45 },
  { city: 'Birmingham', distanceMiles: 50 },
  { city: 'Cambridge', distanceMiles: 50 },
  { city: 'London', distanceMiles: 55 },
  { city: 'Leicester', distanceMiles: 55 },
  { city: 'Cheltenham', distanceMiles: 55 },
  { city: 'Reading', distanceMiles: 60 },
  { city: 'Peterborough', distanceMiles: 60 },
  { city: 'Worcester', distanceMiles: 65 },
  { city: 'Telford', distanceMiles: 68 },
  { city: 'Gloucester', distanceMiles: 70 },
  { city: 'Nottingham', distanceMiles: 80 },
  { city: 'Bristol', distanceMiles: 80 },
  { city: 'Derby', distanceMiles: 85 },
  { city: 'Brighton', distanceMiles: 95 },
  { city: 'Bath', distanceMiles: 95 },
  { city: 'Colchester', distanceMiles: 95 },
  { city: 'Southampton', distanceMiles: 105 },
  { city: 'Stoke-on-Trent', distanceMiles: 105 },
  { city: 'Ipswich', distanceMiles: 105 },
  { city: 'Cardiff', distanceMiles: 110 },
  { city: 'Portsmouth', distanceMiles: 115 },
  { city: 'Norwich', distanceMiles: 115 },
  { city: 'Sheffield', distanceMiles: 120 },
  { city: 'Canterbury', distanceMiles: 125 },
  { city: 'Margate', distanceMiles: 130 },
  { city: 'Manchester', distanceMiles: 130 },
  { city: 'Bournemouth', distanceMiles: 130 },
  { city: 'Swansea', distanceMiles: 150 },
  { city: 'Leeds', distanceMiles: 155 },
  { city: 'Hull', distanceMiles: 160 },
  { city: 'York', distanceMiles: 165 },
  { city: 'Liverpool', distanceMiles: 175 },
  { city: 'Exeter', distanceMiles: 175 },
  { city: 'Plymouth', distanceMiles: 220 },
  { city: 'Newcastle', distanceMiles: 240 },
  { city: 'Edinburgh', distanceMiles: 350 },
  { city: 'Glasgow', distanceMiles: 360 },
]

// London areas where studios cluster. Announcements often name the area, not
// the city ("Hackney · 14–16 Feb"), and a guest spot there is a London trip.
export const LONDON_AREAS = [
  'Hackney', 'Shoreditch', 'Dalston', 'Camden', 'Islington', 'Soho', 'Brixton',
  'Peckham', 'Walthamstow', 'Stoke Newington', 'Bethnal Green', 'Whitechapel',
  'Clapham', 'Croydon', 'Kingston', 'Greenwich', 'Deptford', 'Covent Garden',
  'Notting Hill', 'Kentish Town', 'Bermondsey', 'Hoxton',
]

const LONDON = UK_PLACES.find((p) => p.city === 'London').distanceMiles
const BY_NAME = new Map([
  ...UK_PLACES.map((p) => [p.city.toLowerCase(), p.distanceMiles]),
  ...LONDON_AREAS.map((area) => [area.toLowerCase(), LONDON]),
])
const COUNTRY_SUFFIXES = new Set(['uk', 'united kingdom', 'england', 'scotland', 'wales', 'gb'])

// "Shoreditch, London, England, UK" → ['shoreditch', 'london']
function placeParts(city) {
  const parts = String(city ?? '').toLowerCase().split(',')
    .map((part) => part.trim().replaceAll(/\s+/g, ' '))
    .filter(Boolean)
  while (parts.length > 1 && COUNTRY_SUFFIXES.has(parts.at(-1))) parts.pop()
  return parts
}

// Whole name first, then the last part ("Northern Quarter, Manchester").
export function distanceFromMiltonKeynes(city) {
  const parts = placeParts(city)
  if (parts.length === 0) return null
  const whole = parts.join(', ')
  if (BY_NAME.has(whole)) return BY_NAME.get(whole)
  const last = parts.at(-1)
  return parts.length > 1 && BY_NAME.has(last) ? BY_NAME.get(last) : null
}
