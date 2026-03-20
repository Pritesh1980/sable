export const STYLE_TAGS = [
  'dark-illustrative',
  'fine-line',
  'blackwork',
  'surrealism',
  'dark-fantasy',
  'realism',
]

export const TIERS = {
  FAVOURITE: 'favourite',
  ALSO_LIKE: 'also-like',
  STUDIO: 'studio',
}

export const DEFAULT_ARTISTS = [
  // Tier 1 — Favourites
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 1 },
  { id: 'tolgatemirlenk', handle: 'tolgatemirlenk.ink', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 2 },
  { id: 'keremtattz', handle: 'keremtattz', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 3 },
  { id: 'yuki_zerkjad', handle: 'yuki_zerkjad', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 4 },
  { id: 'carlosvalera', handle: 'carl245tattoo', name: 'Carlos Valera', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 5 },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 6 },
  { id: 'leoalbuquerque', handle: 'leoalbuquerque.tattoo', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 7 },
  { id: 'leon_del_cabo', handle: 'leon_del_cabo', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 8 },
  { id: 'berkbosveren', handle: 'berkbosveren', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 9 },
  { id: 'gody_tattoo', handle: 'gody_tattoo', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 10 },
  { id: 'inkfluid.joy', handle: 'inkfluid.joy', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 11 },
  { id: 'saadtattoo', handle: 'saadtattoo', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 12 },
  { id: 'm3.inkd', handle: 'm3.inkd', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 13 },
  { id: 'picciott_ink', handle: 'picciott_ink', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 14 },
  { id: 'victor_portugal', handle: 'victorportugal', name: 'Victor Portugal', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 15 },
  { id: 'patrick_shanty', handle: 'patrick_shanty', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 16 },
  { id: 'cagriesk', handle: 'cagriesk', name: '', tier: TIERS.FAVOURITE, tags: [], images: [], rank: 17 },

  // Tier 2 — Also Like
  { id: 'milanboros', handle: 'milanboros_tatts', name: '', tier: TIERS.ALSO_LIKE, tags: [], images: [], rank: 1 },
  { id: 'tattoo_amir', handle: 'tattoo_amir', name: '', tier: TIERS.ALSO_LIKE, tags: [], images: [], rank: 2 },
  { id: 'silas_balaio', handle: 'silas_balaio', name: '', tier: TIERS.ALSO_LIKE, tags: [], images: [], rank: 3 },
  { id: 'suenanki.tattoo', handle: 'suenanki', name: '', tier: TIERS.ALSO_LIKE, tags: [], images: [], rank: 4 },
  { id: 'nate_lights', handle: 'nate_lights', name: '', tier: TIERS.ALSO_LIKE, tags: [], images: [], rank: 5 },
]

export const DEFAULT_STUDIOS = [
  { id: 'no-regrets', name: 'No Regrets', confirmed: true, notes: '' },
  { id: 'london-glitch', name: 'London Glitch', confirmed: true, notes: '' },
  { id: 'straight-line', name: 'Straight Line', confirmed: false, notes: 'To be confirmed' },
  { id: 'fatfugu', name: 'Fatfugu', confirmed: false, notes: 'To be confirmed' },
]

export const PLACEMENTS = [
  'chest', 'back', 'upper arm', 'forearm', 'sleeve', 'thigh',
  'calf', 'ribs', 'neck', 'hand', 'foot', 'other',
]
