import { nearbySoon, formatSpotDates, todayIso } from './guestSpots'

const artistLabel = (artist) => artist?.name || `@${artist?.handle}`

// Home's "next" line (#220): one thing worth doing now, most pressing first.
// Deliberately not the contact pipeline: the owner does not work that way.
export function nextStep({ artists = [], ideas = [], concepts = [], today = todayIso() } = {}) {
  if (artists.length === 0) {
    return { kind: 'add-artist', label: 'Add your first artist', detail: 'One photo of their work is enough to start.', to: '/gallery' }
  }

  // The only step with a date on it, so it outranks the rest while it lasts.
  const [nearby] = nearbySoon(artists, { today })
  if (nearby) {
    const { artist, spot } = nearby
    return {
      kind: 'nearby',
      label: `${artistLabel(artist)} is in ${spot.city}`,
      detail: formatSpotDates(spot),
      to: `/gallery?artist=${encodeURIComponent(artist.id)}#guest-spots`,
    }
  }

  if (ideas.length === 0) {
    return { kind: 'add-idea', label: 'Write down your first tattoo idea', detail: 'A title is enough. Sable suggests artists for it.', to: '/brief?new=1' }
  }

  const unmatched = ideas.find((idea) => idea.status !== 'done' && !(idea.linkedArtists?.length > 0))
  if (unmatched) {
    return {
      kind: 'match-idea',
      label: `Pick an artist for “${unmatched.title || 'your idea'}”`,
      detail: 'Open the idea to see who suits it.',
      to: `/brief?idea=${encodeURIComponent(unmatched.id)}`,
    }
  }

  if (concepts.length === 0) {
    return { kind: 'add-concept', label: 'Sketch an idea with AI', detail: 'Describe it and get a picture to show an artist.', to: '/concepts?new=1' }
  }

  return { kind: 'browse', label: 'Look through your wall', detail: 'Every photo you have saved, in one place.', to: '/gallery' }
}

// Home shows one photo per artist, so an artist with nothing to show goes last.
export function topArtists(artists = [], count = 6) {
  const byRank = artists.slice().sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  const withPhoto = byRank.filter((a) => a.images?.length > 0)
  const without = byRank.filter((a) => !(a.images?.length > 0))
  return [...withPhoto, ...without].slice(0, count)
}
