import { getCachedBlobUrl } from './blobUrls'

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
  if (typeof image === 'string') return image
  if (image?.url) return image.url
  if (image?.key) return getCachedBlobUrl(image.key)
  return ''
}

export function getImageNote(image) {
  return typeof image === 'string' ? '' : image?.note || ''
}

export function normalizeReferenceImages(images = []) {
  return images
    .map((image) => {
      if (typeof image === 'string') return { url: image, note: '' }
      // Preserve a key alongside url/note so blob-backed entries survive a
      // normalize round-trip.
      const out = { url: image?.url || '', note: image?.note || '' }
      if (image?.key) out.key = image.key
      return out
    })
    .filter((image) => image.url || image.key)
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

function joinAnd(items) {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function buildMatchRationale(idea, match) {
  if (!match) return ''
  const shared = (match.overlapTags || []).join(' + ')
  const phrases = String(match.artist?.styleDescriptor || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2)
  const subject = idea?.placement ? `this ${idea.placement}` : 'this idea'
  const clause = joinAnd(phrases)

  if (shared && clause) return `Shares ${shared} — their ${clause} suit ${subject}.`
  if (shared) return `Shares ${shared} with ${subject}.`
  if (clause) return `Their ${clause} suit ${subject}.`
  return ''
}

// The three ACTIVE shortlist stages in workflow order. Contacted artists need no
// further attention, and maybe/pass are parked — both are excluded from the
// strip but surfaced as counts so artists never vanish.
const PIPELINE_STAGES = ['researching', 'shortlisted', 'contact-next']

export function buildPipelineSummary(artists = []) {
  const byStage = new Map(PIPELINE_STAGES.map((s) => [s, []]))
  let parked = 0
  let contacted = 0

  for (const artist of artists) {
    const status = normalizeArtistStatus(artist.status)
    if (byStage.has(status)) byStage.get(status).push(artist)
    else if (status === 'contacted') contacted += 1
    else parked += 1
  }

  const stages = PIPELINE_STAGES.map((status) => ({
    status,
    label: ARTIST_STATUSES.find((s) => s.value === status).label,
    artists: byStage.get(status).slice().sort((a, b) => (a.rank || 999) - (b.rank || 999)),
    count: byStage.get(status).length,
  }))

  return { stages, parked, contacted }
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

  // "Top 5" means current artists — contacted and parked (maybe/pass) drop out.
  const activeArtists = artists
    .filter((artist) => PIPELINE_STAGES.includes(normalizeArtistStatus(artist.status)))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))

  return {
    activeIdeas,
    exportReadyIdeas,
    nextArtists,
    topArtists: activeArtists.slice(0, 5),
    benchArtists: activeArtists.slice(5, 9),
    openBoards: boards.filter((board) => board.ideaIds?.length > 0),
  }
}
