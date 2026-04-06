export const IDEA_STATUSES = [
  { value: 'idea', label: 'Idea', color: 'text-cream-muted' },
  { value: 'booked', label: 'Booked', color: 'text-accent' },
  { value: 'done', label: 'Done', color: 'text-green-400' },
]

/**
 * Returns artists that share at least one style tag with the idea,
 * ranked by number of overlapping tags (descending).
 */
export function matchArtistsToIdea(idea, artists) {
  if (!idea.tags?.length) return []

  return artists
    .map((artist) => {
      const artistTags = artist.tags || []
      const overlap = idea.tags.filter((t) => artistTags.includes(t)).length
      return { artist, overlap }
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map(({ artist }) => artist)
}
