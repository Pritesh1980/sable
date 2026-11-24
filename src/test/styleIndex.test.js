import { describe, it, expect, vi, beforeEach } from 'vitest'

// The embedder pulls in @huggingface/transformers (tens of MB of model at
// runtime) — always mocked in tests. Vectors are keyed by image src.
vi.mock('../data/embedder', () => ({
  EMBEDDING_MODEL_ID: 'test-model',
  getEmbedder: vi.fn(async () => async (src) => (src.includes('a') ? [1, 0] : [0, 1])),
  getTextEmbedder: vi.fn(async () => async (text) => (text === 'skull' ? [1, 0] : [0, 1])),
}))

import { buildStyleIndex, loadVectors, vectorFor, textVectorFor, clearStyleIndex } from '../data/styleIndex'
import { getEmbedder, getTextEmbedder } from '../data/embedder'
import { refIdentity } from '../data/imageRef'

const artists = [
  { id: 'a', images: ['/img/a1.jpg', '/img/a2.jpg'] },
  { id: 'b', images: ['/img/b1.jpg'] },
]

beforeEach(async () => {
  await clearStyleIndex()
  vi.clearAllMocks()
})

describe('styleIndex', () => {
  it('build embeds every collection image and load round-trips the vectors', async () => {
    const progress = vi.fn()
    await buildStyleIndex(artists, { onProgress: progress })
    const vectors = await loadVectors(artists)
    expect(vectors.size).toBe(3)
    expect(vectors.get(refIdentity('/img/a1.jpg'))).toEqual([1, 0])
    expect(vectors.get(refIdentity('/img/b1.jpg'))).toEqual([0, 1])
    expect(progress).toHaveBeenLastCalledWith({ done: 3, total: 3 })
  })

  it('is incremental: a rebuild only embeds images not already indexed', async () => {
    await buildStyleIndex(artists)
    const embedCalls = []
    getEmbedder.mockResolvedValueOnce(async (src) => {
      embedCalls.push(src)
      return [0.5, 0.5]
    })
    await buildStyleIndex([...artists, { id: 'c', images: ['/img/c1.jpg'] }])
    expect(embedCalls).toEqual(['/img/c1.jpg'])
  })

  it('a failed image is skipped, not fatal to the whole build', async () => {
    getEmbedder.mockResolvedValueOnce(async (src) => {
      if (src === '/img/a2.jpg') throw new Error('decode failed')
      return [1, 0]
    })
    await buildStyleIndex(artists)
    const vectors = await loadVectors(artists)
    expect(vectors.size).toBe(2)
    expect(vectors.has(refIdentity('/img/a2.jpg'))).toBe(false)
  })
})

describe('vectorFor (one-off embeddings, e.g. concept images)', () => {
  it('embeds once and serves the cached vector by stable key afterwards', async () => {
    const first = await vectorFor('/img/a-concept.png', 'concept:c1')
    expect(first).toEqual([1, 0])
    // Same key, different (e.g. re-resolved object) URL: must hit the cache,
    // not the embedder.
    getEmbedder.mockImplementationOnce(async () => {
      throw new Error('should not re-embed a cached key')
    })
    const second = await vectorFor('blob:whatever', 'concept:c1')
    expect(second).toEqual([1, 0])
  })

  it('returns null instead of throwing when the image cannot be embedded', async () => {
    getEmbedder.mockResolvedValueOnce(async () => {
      throw new Error('decode failed')
    })
    expect(await vectorFor('/img/broken.png', 'concept:bad')).toBeNull()
  })
})

describe('textVectorFor (search by words, #186)', () => {
  it('embeds a phrase and keeps it, so the same search works again without the model', async () => {
    expect(await textVectorFor('skull')).toEqual([1, 0])
    expect(await textVectorFor('skull')).toEqual([1, 0])
    expect(getTextEmbedder).toHaveBeenCalledTimes(1)
  })

  it('keeps the phrase in the model\'s own namespace, beside the photo vectors', async () => {
    await textVectorFor('skull')
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('tattoo-style-index-v2', 1)
      req.onsuccess = () => resolve(req.result)
    })
    const kept = await new Promise((resolve) => {
      const req = db.transaction('vectors').objectStore('vectors').get('test-model:text:skull')
      req.onsuccess = () => resolve(req.result)
    })
    db.close()
    expect(kept).toEqual([1, 0])
  })

  it('passes the model download progress through', async () => {
    const onProgress = vi.fn()
    await textVectorFor('wolf', { onProgress })
    expect(getTextEmbedder).toHaveBeenCalledWith({ onProgress })
  })

  it('with cachedOnly, answers from the kept phrases and never loads the model', async () => {
    expect(await textVectorFor('owl', { cachedOnly: true })).toBeNull()
    expect(getTextEmbedder).not.toHaveBeenCalled()
    await textVectorFor('skull')
    expect(await textVectorFor('skull', { cachedOnly: true })).toEqual([1, 0])
  })

  it('throws when the model cannot load, so the search can say so', async () => {
    getTextEmbedder.mockRejectedValueOnce(new Error('offline'))
    await expect(textVectorFor('raven')).rejects.toThrow('offline')
  })
})

describe('lazy-loading contract', () => {
  it('nothing outside the embedder statically imports @huggingface/transformers', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const offenders = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(js|jsx)$/.test(name) && !p.includes('/test/')) {
          const src = readFileSync(p, 'utf8')
          if (/^\s*import\s[^\n]*['"]@huggingface\/transformers['"]/m.test(src)) offenders.push(p)
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    // Only dynamic `import('@huggingface/transformers')` inside the embedder is
    // allowed — a static import anywhere would drag the ML runtime into the
    // eager bundle and undo the route-splitting work.
    expect(offenders).toEqual([])
    const embedder = readFileSync(join(process.cwd(), 'src/data/embedder.js'), 'utf8')
    expect(embedder).toMatch(/await import\(\s*['"]@huggingface\/transformers['"]\s*\)/)
  })
})
