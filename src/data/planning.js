export const ARTIST_STATUSES = [
  { value: 'researching', label: 'Researching', tone: 'text-cream-muted' },
  { value: 'shortlisted', label: 'Shortlisted', tone: 'text-cream' },
  { value: 'contact-next', label: 'Contact next', tone: 'text-accent' },
  { value: 'contacted', label: 'Contacted', tone: 'text-blue-300' },
  { value: 'maybe', label: 'Maybe', tone: 'text-cream-muted' },
  { value: 'pass', label: 'Pass', tone: 'text-cream-muted/60' },
]

export const DEFAULT_ARTIST_STATUS = 'researching'

export function normalizeArtistStatus(status) {
  return ARTIST_STATUSES.some((s) => s.value === status) ? status : DEFAULT_ARTIST_STATUS
}

export function getImageUrl(image) {
  return typeof image === 'string' ? image : image?.url || ''
}

export function getImageNote(image) {
  return typeof image === 'string' ? '' : image?.note || ''
}

export function normalizeReferenceImages(images = []) {
  return images
    .map((image) => {
      if (typeof image === 'string') return { url: image, note: '' }
      return { url: image?.url || '', note: image?.note || '' }
    })
    .filter((image) => image.url)
}

export function scoreArtistForIdea(artist, idea) {
  const ideaTags = idea?.tags || []
  const artistTags = artist?.tags || []
  const overlapTags = ideaTags.filter((tag) => artistTags.includes(tag))
  const status = normalizeArtistStatus(artist?.status)
  const statusBoost = status === 'contact-next'
    ? 3
    : status === 'shortlisted'
      ? 2
      : status === 'contacted'
        ? 1
        : status === 'pass'
          ? -4
          : 0
  const rankBoost = Math.max(0, 31 - (artist?.rank || 31)) / 10

  return {
    artist,
    overlap: overlapTags.length,
    overlapTags,
    status,
    score: overlapTags.length * 10 + statusBoost + rankBoost,
  }
}

export function matchArtistsForIdea(idea, artists = []) {
  if (!idea?.tags?.length) return []

  return artists
    .map((artist) => scoreArtistForIdea(artist, idea))
    .filter((match) => match.overlap > 0)
    .sort((a, b) => b.score - a.score || (a.artist.rank || 999) - (b.artist.rank || 999))
}

export function buildDashboardSummary({ artists = [], ideas = [], boards = [] }) {
  const activeIdeas = ideas.filter((idea) => (idea.status || 'idea') !== 'done')
  const exportReadyIdeas = ideas.filter((idea) => (
    idea.title &&
    idea.description &&
    idea.linkedArtists?.length > 0
  ))
  const nextArtists = artists
    .filter((artist) => normalizeArtistStatus(artist.status) === 'contact-next')
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))

  return {
    activeIdeas,
    exportReadyIdeas,
    nextArtists,
    topArtists: artists.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, 5),
    openBoards: boards.filter((board) => board.ideaIds?.length > 0),
  }
}
