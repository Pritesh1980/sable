import { resolveImageBlob } from './imageResolver'
import { stageImage } from './imageStaging'
import { keyForUrl } from './blobUrls'
import { refKey } from './imageRef'

const text = value => typeof value === 'string' ? value.trim() : ''
export const conceptIdeaNote = variant => text(variant?.title) || 'AI concept'

export function buildConceptIdeaDraft(concept, variant, { id, image, note } = {}) {
  const prompt = text(concept.prompt)
  const chosen = variant || concept
  const refinement = chosen.refinement
  const refinementText = refinement ? [
    `Change: ${text(refinement.change)}`, `Keep: ${text(refinement.keep)}`, `Palette: ${text(refinement.palette)}`,
  ].join('\n') : ''
  return {
    id, title: prompt.replace(/\s+/g, ' ').slice(0, 80) || 'AI concept',
    description: [prompt, text(chosen.response), text(chosen.notes), refinementText].filter(Boolean).join('\n\n'),
    status: 'idea', placement: '', tags: [...(concept.tags || [])], linkedArtists: [],
    images: [{ key: image.key, note: note === undefined ? conceptIdeaNote(variant) : note }],
  }
}

export function appendConceptIdeaImage(ideas, ideaId, image) {
  if (!ideas.some(idea => idea.id === ideaId)) return ideas
  return ideas.map(idea => idea.id === ideaId ? { ...idea, images: [...(idea.images || []), image] } : idea)
}

const safePart = part => typeof part === 'string' && !!part && !/[\\/]/.test(part) && part !== '.' && part !== '..'

export async function stageConceptIdeaImage(source, { userId, ideaId, assertCurrent }) {
  const guard = () => {
    try { assertCurrent() } catch { throw Object.assign(new Error('owner_changed'), { code: 'owner_changed' }) }
  }
  guard()
  if (!safePart(userId) || !safePart(ideaId)) throw new Error('Invalid image destination')
  const raw = typeof source === 'string' ? source : source?.url
  const key = refKey(source) || keyForUrl(raw)
  if (key && (!key.startsWith(`user/${userId}/concepts/`) || !key.split('/').every(safePart))) {
    throw new Error('Image does not belong to this concept owner')
  }
  const blob = await resolveImageBlob(key || source)
  guard()
  if (!blob?.size || !blob.type.startsWith('image/')) throw new Error('Could not read that image. Try again when it is available.')
  const staged = await stageImage(blob, { userId, scope: 'ideas', id: ideaId, assertCurrent: guard, registerIdentity: false })
  guard()
  if (staged.failed || !staged.key) throw new Error('Could not store that image on this device. Try again.')
  return { key: staged.key }
}
