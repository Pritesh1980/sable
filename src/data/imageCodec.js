import { warmImageCache } from './imageResolver'
import { stageInlineOnce } from './imageStaging'

// Image codecs for the document collections that carry images (ideas, concepts).
//
// Both hold the stored form in memory — an idea photo is { key, note } /
// { url, note }, a concept's or variant's imageUrl is a blob key, an external
// URL or '' — and every consumer resolves where it renders (#117). So a codec
// only warms the URL cache and moves inline photos stored before staging existed.
//
//   toCanonical(value)            in-memory → stored
//   toDisplay(value)  → Promise   stored → in-memory
//   ensureUploaded(value, ctx)    upload any inline data-URLs → { value, moved }

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

// ── concepts: imageUrl string at top level and on each variant — state holds
// the stored string ───────────────────────────────────────────────────────────

const conceptRefs = (concepts) => concepts.flatMap((c) => [c.imageUrl, ...(c.variants || []).map((v) => v.imageUrl)])
const isInline = (url) => typeof url === 'string' && url.startsWith('data:')

export const conceptsCodec = {
  toCanonical: (concepts = []) => concepts,
  toDisplay: async (concepts = []) => {
    warmImageCache(conceptRefs(concepts))
    return concepts
  },
  ensureUploaded: async (concepts = [], { userId }) => {
    let moved = 0
    const stage = async (url, id) => {
      if (!isInline(url)) return url
      const key = await stageInlineOnce(url, { userId, scope: 'concepts', id: id || 'misc' })
      if (!key) return url
      moved += 1
      return key
    }
    const next = []
    for (const c of concepts) {
      const imageUrl = await stage(c.imageUrl, c.id)
      let variants = c.variants
      if (Array.isArray(c.variants)) {
        const staged = []
        for (const v of c.variants) {
          const url = await stage(v.imageUrl, c.id)
          staged.push(url === v.imageUrl ? v : { ...v, imageUrl: url })
        }
        if (staged.some((v, i) => v !== c.variants[i])) variants = staged
      }
      next.push(imageUrl === c.imageUrl && variants === c.variants ? c : { ...c, imageUrl, ...(variants ? { variants } : {}) })
    }
    return { value: moved ? next : concepts, moved }
  },
}
