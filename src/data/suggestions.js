// Curated "consider also" pool + matching for the Wall's suggestion shelf.
//
// IMPORTANT for maintainers: these are real, established artists researched
// against the six house style tags — but Instagram handles change and this
// list ages. Every suggestion card links out to Instagram, and the user
// should verify the profile before adding. Refresh this list in a session
// periodically; keep it clear of anyone in DEFAULT_ARTISTS (a data test
// enforces that).

// Curated pool, biased toward the collection's centre of gravity
// (dark-illustrative / blackwork / surrealism) with a realism/fine-line tail.
export const SUGGESTED_ARTISTS = [
  { handle: 'kamilczapiga', name: 'Kamil Czapiga', tags: ['blackwork', 'dark-illustrative'], note: 'Stark black symbolism and texture experiments' },
  { handle: 'ien_levin', name: 'Ien Levin', tags: ['dark-illustrative', 'blackwork'], note: 'Dense dotwork linework, occult and folk motifs' },
  { handle: 'otheser_stc', name: 'Otheser', tags: ['blackwork', 'fine-line'], note: 'Sacred geometry and dotwork precision' },
  { handle: 'dotyk.tattoo', name: 'Paweł Indulski', tags: ['realism', 'dark-illustrative'], note: 'Dotwork realism with heavy negative space' },
  { handle: 'eliot.kohek', name: 'Eliot Kohek', tags: ['realism', 'dark-fantasy'], note: 'Cinematic dark realism' },
  { handle: 'anrijsstraume', name: 'Anrijs Straume', tags: ['dark-illustrative', 'realism'], note: 'UK-based dark trash realism' },
  { handle: 'oscar.hove', name: 'Oscar Hove', tags: ['surrealism', 'fine-line'], note: 'Abstract surreal linework' },
  { handle: 'gakkinx', name: 'Gakkin', tags: ['blackwork'], note: 'Large-scale freehand blackwork' },
  { handle: 'nissaco', name: 'Nissaco', tags: ['blackwork', 'fine-line'], note: 'Ornamental blackwork, flowing geometry' },
  { handle: 'jondix', name: 'Jondix', tags: ['blackwork', 'fine-line'], note: 'Sacred geometry and tibetan-influenced black' },
  { handle: 'coreydivine', name: 'Corey Divine', tags: ['blackwork', 'fine-line'], note: 'Ornamental / geometric flow' },
  { handle: 'balazsbercsenyi', name: 'Balázs Bercsényi', tags: ['fine-line'], note: 'Fine-line with graphic contrast' },
  { handle: 'inalbersekov', name: 'Inal Bersekov', tags: ['fine-line', 'realism'], note: 'Micro-realism fine line' },
  { handle: 'micotattoo', name: 'Mico', tags: ['dark-illustrative', 'realism'], note: 'Dark sketch-style portraits' },
  { handle: 'jesse_rix', name: 'Jesse Rix', tags: ['surrealism', 'realism'], note: '3D optical-illusion work' },
  { handle: 'coenmitchell', name: 'Coen Mitchell', tags: ['surrealism', 'fine-line'], note: 'Mosaic-flow transitions' },
  { handle: 'audeladureeltattoobysandry', name: 'Sandry Riffard', tags: ['realism', 'dark-fantasy'], note: 'Dark realism, skulls and smoke' },
]

// Ranks the pool against the collection's style-frequency profile: each
// suggestion scores the sum of how often its tags appear across the user's
// artists. Zero overlap → not suggested (an empty collection suggests
// nothing — there is no taste to match yet).
export function buildSuggestions(artists = [], { pool = SUGGESTED_ARTISTS, dismissed = [], limit = 8 } = {}) {
  const tagFrequency = new Map()
  const ownedHandles = new Set()
  for (const artist of artists) {
    ownedHandles.add(String(artist.handle || artist.id).toLowerCase())
    for (const tag of artist.tags || []) {
      tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1)
    }
  }
  const dismissedSet = new Set(dismissed.map((h) => h.toLowerCase()))

  return pool
    .filter((s) => !ownedHandles.has(s.handle.toLowerCase()))
    .filter((s) => !dismissedSet.has(s.handle.toLowerCase()))
    .map((s) => ({
      ...s,
      score: s.tags.reduce((sum, tag) => sum + (tagFrequency.get(tag) || 0), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
