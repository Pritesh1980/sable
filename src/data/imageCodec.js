import { keyForUrl, resolveBlobKey } from './blobUrls'
import { uploadDataUrl } from '../hooks/useImageUpload'

// Image codecs for the document collections that carry images (ideas, concepts).
// Each codec lets useStorage keep the in-memory value as displayable URLs — so
// every render/consumer (including concept STL export and variant rendering)
// stays unchanged — while persisting/syncing small canonical { key } refs and
// keeping bytes in blob storage.
//
//   toCanonical(value)            display → canonical (url → key) for storage
//   toDisplay(value)  → Promise   canonical → display (key → resolved url)
//   ensureUploaded(value, ctx)    upload any inline data-URLs, return count moved

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

// ── ideas: images is [{ url, note } | { key, note }] ──────────────────────────

function canonIdeaImages(images = []) {
  return images.map((img) => {
    if (typeof img === 'string') {
      const key = keyForUrl(img)
      return key ? { key } : { url: img, note: '' }
    }
    const url = img.url || ''
    const key = img.key || keyForUrl(url)
    return key ? { key, note: img.note || '' } : { url, note: img.note || '' }
  })
}

async function displayIdeaImages(images = []) {
  return Promise.all(
    images.map(async (img) => {
      if (typeof img === 'string') return { url: img, note: '' }
      if (img.key) return { url: (await resolveBlobKey(img.key)) || '', note: img.note || '', key: img.key }
      return { url: img.url || '', note: img.note || '' }
    })
  )
}

export const ideasCodec = {
  toCanonical: (ideas = []) => ideas.map((i) => ({ ...i, images: canonIdeaImages(i.images || []) })),
  toDisplay: async (ideas = []) =>
    Promise.all(ideas.map(async (i) => ({ ...i, images: await displayIdeaImages(i.images || []) }))),
  ensureUploaded: async (ideas = [], { userId }) => {
    let moved = 0
    for (const idea of ideas) {
      for (const img of idea.images || []) {
        const url = typeof img === 'string' ? img : img?.url
        if (url && url.startsWith('data:') && !keyForUrl(url)) {
          if (await uploadDataUrl(url, { userId, scope: 'ideas', id: idea.id || 'misc' })) moved += 1
        }
      }
    }
    return moved
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
    return moved
  },
}
