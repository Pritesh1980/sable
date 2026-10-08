import { getImageNote, getImageUrl } from './planning'
import { stripEditGen } from '../backend/sync'
import { keyForUrl } from './blobUrls'
import { refIdentity, refKey } from './imageRef'
import { resolveImageBlob } from './imageResolver'
import { blobToDataUrl, needsStaging, stageImage } from './imageStaging'

// v1 backups hold image refs and whatever display urls were in memory — for a
// Supabase account those are signed urls that expire within the hour. v2
// (#114) embeds the bytes of every blob-backed photo as a data url, so a backup
// restores on any account or device. The importer accepts both.
export const BACKUP_VERSION = 2
const REFS_ONLY_VERSION = 1

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
    const label = (refKey(image) || url.startsWith('data:')) ? '[uploaded photo]' : url
    return `${index + 1}. ${label}${note ? `\n   Note: ${note}` : ''}`
  }).join('\n')
}

// The structure of a backup, with images left as the refs/urls in memory (a v1
// document). createBackupWithImages turns it into a self-contained v2 one.
export function createBackup({ artists = [], ideas = [], boards = [], concepts = [], conventionOverrides = {} }, exportedAt = new Date().toISOString()) {
  return {
    version: REFS_ONLY_VERSION,
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

const urlOf = (image) => (typeof image === 'string' ? image : image?.url)

// A photo whose bytes live in blob storage or this browser (a key, a registered
// display url, a local blob:) and so cannot be restored from the ref alone.
// Static paths, external urls and inline data urls are already portable.
function isEmbeddable(image) {
  if (refKey(image)) return true
  const url = urlOf(image)
  if (typeof url !== 'string' || !url || url.startsWith('data:')) return false
  return url.startsWith('blob:') || Boolean(keyForUrl(url))
}

// Every image slot in the backup: artist and idea photos, concept images and
// their variants' images. `map(image, { scope, id })` is awaited one slot at a
// time, so a large collection never holds more than one photo's bytes in flight.
// A slot mapped to null is removed from its list (or blanked, for a concept).
async function mapBackupImages(data, map) {
  const withImages = async (rows, scope) => {
    const out = []
    for (const row of rows || []) {
      if (!Array.isArray(row?.images)) { out.push(row); continue }
      const images = []
      for (const image of row.images) {
        const next = await map(image, { scope, id: row.id })
        if (next !== null) images.push(next)
      }
      out.push({ ...row, images })
    }
    return out
  }
  const concepts = []
  for (const concept of data.concepts || []) {
    const ctx = { scope: 'concepts', id: concept.id }
    const next = { ...concept }
    if (typeof concept.imageUrl === 'string') next.imageUrl = (await map(concept.imageUrl, ctx)) ?? ''
    if (Array.isArray(concept.variants)) {
      next.variants = []
      for (const variant of concept.variants) {
        next.variants.push(
          typeof variant?.imageUrl === 'string'
            ? { ...variant, imageUrl: (await map(variant.imageUrl, ctx)) ?? '' }
            : variant,
        )
      }
    }
    concepts.push(next)
  }
  return {
    ...data,
    artists: await withImages(data.artists, 'artists'),
    ideas: await withImages(data.ideas, 'ideas'),
    concepts,
  }
}

// The self-contained export (v2): embeds each blob-backed photo as a data url.
// A photo whose bytes cannot be read right now (offline, a missing blob) is
// left as the ref it was and counted in `skipped`, so the caller can say so.
export async function createBackupWithImages(state, { exportedAt, onProgress } = {}) {
  const base = createBackup(state, exportedAt)
  let total = 0
  await mapBackupImages(base.data, async (image) => {
    if (isEmbeddable(image)) total += 1
    return image
  })

  const cache = new Map() // identity -> data url | null, so one photo is read once
  let done = 0
  let skipped = 0
  const embed = async (image) => {
    if (!isEmbeddable(image)) return image
    const id = refIdentity(image)
    if (!cache.has(id)) {
      const blob = await resolveImageBlob(image)
      cache.set(id, blob ? await blobToDataUrl(blob) : null)
    }
    done += 1
    onProgress?.(done, total)
    const dataUrl = cache.get(id)
    if (!dataUrl) {
      skipped += 1
      return image
    }
    if (typeof image === 'string') return dataUrl
    // The old account's key is meaningless elsewhere; the bytes are the photo.
    const out = { ...image, url: dataUrl }
    delete out.key
    return out
  }
  const data = await mapBackupImages(base.data, embed)
  return { backup: { ...base, version: BACKUP_VERSION, data }, skipped }
}

// Sends the photos a backup carries as data urls through the normal staging and
// upload path, so they gain keys of the importing account. Signed out there is
// nowhere to upload to and the data is returned as it came. A photo that cannot
// be staged is dropped — its base64 must not reach persisted state — and counted.
export async function restoreBackupImages(data, { userId } = {}) {
  if (!userId) return { data, failed: 0 }
  let failed = 0
  const out = await mapBackupImages(data, async (image, { scope, id }) => {
    if (!needsStaging(image, { userId })) return image
    const staged = await stageImage(urlOf(image), { userId, scope, id })
    if (staged.failed) {
      failed += 1
      return null
    }
    // Idea state holds stored refs, so an idea photo comes back as its key.
    if (scope === 'ideas' && staged.key) {
      return { key: staged.key, note: (typeof image === 'object' && image.note) || '' }
    }
    return typeof image === 'string' ? staged.url : { ...image, url: staged.url }
  })
  return { data: out, failed }
}

export function parseBackup(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file is empty or invalid.')
  }
  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Sable. Update the app, then import it again.')
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
