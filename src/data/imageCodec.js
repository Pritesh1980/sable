import { keyForUrl, resolveBlobKey } from './blobUrls'
import { uploadDataUrl } from '../hooks/useImageUpload'
import { warmImageCache } from './imageResolver'
import { stageInlineOnce } from './imageStaging'

// Image codecs for the document collections that carry images (ideas, concepts).
//
// Ideas hold the stored form in memory — { key, note } / { url, note } — and
// every consumer resolves at render (#117); their codec only warms the URL
// cache and moves inline photos stored before staging existed. Concepts still
// keep a displayable URL in memory and persist the key.
//
//   toCanonical(value)            in-memory → stored
//   toDisplay(value)  → Promise   stored → in-memory
//   ensureUploaded(value, ctx)    upload any inline data-URLs → { value, moved }

// A bare blob key (e.g. user/<uid>/concepts/<id>/<uuid>.jpg) — i.e. not a
// data:/http(s)/blob: URL nor a static "/..." path.
function isBlobKey(s) {
  return (
    typeof s === 'string' &&
    s.length > 0 &&
    !s.startsWith('/') &&
    !/^(data:|https?:|blob:)/.test(s)
  )
}

const canonUrl = (url) => (url ? keyForUrl(url) || url : url)
const displayUrl = async (url) => (isBlobKey(url) ? (await resolveBlobKey(url)) || '' : url)

// ── ideas: images is [{ key, note } | { url, note }] — state holds this form ──

const ideaImage = (img) => {
  if (typeof img === 'string') return { url: img, note: '' }
  if (img?.key) return { key: img.key, note: img.note || '' }
  return { url: img?.url || '', note: img?.note || '' }
}
const ideaRefs = (ideas) => ideas.flatMap((i) => i.images || [])

export const ideasCodec = {
  toCanonical: (ideas = []) => ideas.map((i) => ({ ...i, images: (i.images || []).map(ideaImage) })),
  toDisplay: async (ideas = []) => {
    warmImageCache(ideaRefs(ideas))
    return ideas
  },
  ensureUploaded: async (ideas = [], { userId }) => {
    let moved = 0
    const next = []
    for (const idea of ideas) {
      let images = idea.images
      for (const [i, img] of (idea.images || []).entries()) {
        const url = typeof img === 'string' ? img : img?.url
        if (img?.key || typeof url !== 'string' || !url.startsWith('data:')) continue
        const key = await stageInlineOnce(url, { userId, scope: 'ideas', id: idea.id || 'misc' })
        if (!key) continue
        if (images === idea.images) images = [...idea.images]
        images[i] = { key, note: (typeof img === 'object' && img.note) || '' }
        moved += 1
      }
      next.push(images === idea.images ? idea : { ...idea, images })
    }
    return { value: moved ? next : ideas, moved }
  },
}

// ── concepts: imageUrl string at top level and on each variant ────────────────

// A blob key that can't be resolved right now (offline, a failed signed-URL
// fetch) displays as '' — nothing to show — but rides along as
// `unresolvedImageKey` so the cache and remote keep pointing at the photo.
// Without it, opening the app offline rewrote every concept's image to '' (#101).
// Ideas do the same by keeping `key` on each display image.
async function displayImage(item) {
  const imageUrl = await displayUrl(item.imageUrl)
  const next = { ...item, imageUrl }
  delete next.unresolvedImageKey
  if (!imageUrl && isBlobKey(item.imageUrl)) next.unresolvedImageKey = item.imageUrl
  return next
}

// A new image set since then (imageUrl no longer empty) wins over the old key.
function canonImage(item) {
  const next = { ...item, imageUrl: canonUrl(item.imageUrl) || item.unresolvedImageKey || item.imageUrl }
  delete next.unresolvedImageKey
  return next
}

export const conceptsCodec = {
  toCanonical: (concepts = []) =>
    concepts.map((c) => ({
      ...canonImage(c),
      ...(Array.isArray(c.variants) ? { variants: c.variants.map(canonImage) } : {}),
    })),
  toDisplay: async (concepts = []) =>
    Promise.all(
      concepts.map(async (c) => ({
        ...(await displayImage(c)),
        ...(Array.isArray(c.variants) ? { variants: await Promise.all(c.variants.map(displayImage)) } : {}),
      }))
    ),
  ensureUploaded: async (concepts = [], { userId }) => {
    let moved = 0
    const tryUpload = async (url, id) => {
      if (url && url.startsWith('data:') && !keyForUrl(url)) {
        if (await uploadDataUrl(url, { userId, scope: 'concepts', id: id || 'misc' })) moved += 1
      }
    }
    for (const c of concepts) {
      await tryUpload(c.imageUrl, c.id)
      for (const v of c.variants || []) {
        await tryUpload(v.imageUrl, c.id)
      }
    }
    return { value: concepts, moved }
  },
}
