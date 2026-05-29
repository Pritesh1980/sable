import { matchArtistsForIdea } from './planning'

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
  return matchArtistsForIdea(idea, artists).map(({ artist }) => artist)
}
