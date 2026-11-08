// Approximate driving distance from Milton Keynes for UK cities a guest spot is
// likely to be in (#183). Curated, not computed: an unknown city returns null
// and the UI says "distance unknown" rather than guessing. Numbers match the
// studio and convention tables (a test keeps them in step).
export const UK_PLACES = [
  { city: 'Milton Keynes', distanceMiles: 0 },
  { city: 'Northampton', distanceMiles: 20 },
  { city: 'Bedford', distanceMiles: 20 },
  { city: 'Luton', distanceMiles: 25 },
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

const BY_NAME = new Map(UK_PLACES.map((p) => [p.city.toLowerCase(), p.distanceMiles]))
const COUNTRY_SUFFIXES = ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'gb']

function placeKey(city) {
  let name = String(city ?? '').trim().toLowerCase().replaceAll(/\s+/g, ' ')
  const comma = name.lastIndexOf(',')
  if (comma !== -1 && COUNTRY_SUFFIXES.includes(name.slice(comma + 1).trim())) {
    name = name.slice(0, comma).trim()
  }
  return name
}

export function distanceFromMiltonKeynes(city) {
  const key = placeKey(city)
  return key && BY_NAME.has(key) ? BY_NAME.get(key) : null
}
