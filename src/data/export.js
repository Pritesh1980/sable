import { getImageNote, getImageUrl } from './planning'
import { stripEditGen } from '../backend/sync'

const BACKUP_VERSION = 1

// editGen is internal sync bookkeeping (#84) that must never leak into a
// user-facing artifact — a backup export reads straight from in-memory
// state, which still carries it until confirmRowGenerations clears it.
function stripRows(rows) {
  return rows.map(stripEditGen)
}

function compactList(items) {
  return items.filter(Boolean).join('\n')
}

function formatArtist(artist) {
  if (!artist) return ''
  const label = artist.name ? `${artist.name} (@${artist.handle})` : `@${artist.handle}`
  const tags = artist.tags?.length ? ` - ${artist.tags.join(', ')}` : ''
  const status = artist.status ? `\n  Status: ${artist.status}` : ''
  const notes = artist.notes ? `\n  Notes: ${artist.notes}` : ''
  return `- ${label}${tags}${status}${notes}`
}

function formatImageList(images = []) {
  if (!images.length) return 'None added'
  return images.map((image, index) => {
    const url = getImageUrl(image)
    const note = getImageNote(image)
    const label = url.startsWith('data:') ? '[uploaded photo]' : url
    return `${index + 1}. ${label}${note ? `\n   Note: ${note}` : ''}`
  }).join('\n')
}

export function createBackup({ artists = [], ideas = [], boards = [], concepts = [], conventionOverrides = {} }, exportedAt = new Date().toISOString()) {
  return {
    version: BACKUP_VERSION,
    exportedAt,
    data: {
      artists: stripRows(artists),
      ideas: stripRows(ideas),
      boards: stripRows(boards),
      concepts: stripRows(concepts),
      conventionOverrides,
    },
  }
}

// Initiation is observable; completion of a browser download is not. Delay URL
// cleanup so Safari has time to consume the object URL after the synthetic click.
export function requestBackupDownload(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = `tattoo-backup-${backup.exportedAt.slice(0, 10)}.json`
    document.body.append(link)
    link.click()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  } finally {
    link.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function parseBackup(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file is empty or invalid.')
  }

  const data = parsed.data || parsed
  const arrayKeys = ['artists', 'ideas', 'boards', 'concepts']
  const out = {}

  arrayKeys.forEach((key) => {
    if (data[key] === undefined) {
      out[key] = []
    } else if (Array.isArray(data[key])) {
      out[key] = data[key]
    } else {
      throw new Error(`Backup field "${key}" must be an array.`)
    }
  })

  out.conventionOverrides = (data.conventionOverrides && typeof data.conventionOverrides === 'object' && !Array.isArray(data.conventionOverrides))
    ? data.conventionOverrides
    : {}

  return out
}

export function buildIdeaBrief(idea, artists = []) {
  const linked = artists.filter((artist) => idea.linkedArtists?.includes(artist.id))

  return compactList([
    `Tattoo idea: ${idea.title || 'Untitled idea'}`,
    idea.status ? `Status: ${idea.status}` : '',
    idea.placement ? `Placement: ${idea.placement}` : '',
    idea.tags?.length ? `Style: ${idea.tags.join(', ')}` : '',
    idea.description ? `\nConcept\n${idea.description}` : '',
    `\nReference images\n${formatImageList(idea.images)}`,
    linked.length ? `\nLinked artists\n${linked.map(formatArtist).join('\n')}` : '\nLinked artists\nNone selected',
  ])
}

export function buildBoardBrief(board, ideas = [], artists = []) {
  const byId = new Map(ideas.map((idea) => [idea.id, idea]))
  const boardIdeas = board.ideaIds?.map((id) => byId.get(id)).filter(Boolean) || []

  return compactList([
    `Tattoo board: ${board.name || 'Untitled board'}`,
    board.description ? `\nTheme\n${board.description}` : '',
    boardIdeas.length
      ? `\nIdeas\n${boardIdeas.map((idea, index) => {
          const linked = artists.filter((artist) => idea.linkedArtists?.includes(artist.id))
          return compactList([
            `${index + 1}. ${idea.title || 'Untitled idea'}`,
            idea.placement ? `   Placement: ${idea.placement}` : '',
            idea.tags?.length ? `   Style: ${idea.tags.join(', ')}` : '',
            idea.description ? `   Concept: ${idea.description}` : '',
            linked.length ? `   Artists: ${linked.map((a) => a.name || `@${a.handle}`).join(', ')}` : '',
          ])
        }).join('\n\n')}`
      : '\nIdeas\nNone added',
  ])
}
