import { describe, it, expect, vi, beforeEach } from 'vitest'

// The embedder pulls in @huggingface/transformers (tens of MB of model at
// runtime) — always mocked in tests. Vectors are keyed by image src.
vi.mock('../data/embedder', () => ({
  EMBEDDING_MODEL_ID: 'test-model',
  getEmbedder: vi.fn(async () => async (src) => (src.includes('a') ? [1, 0] : [0, 1])),
}))

import { buildStyleIndex, loadVectors, clearStyleIndex } from '../data/styleIndex'
import { getEmbedder } from '../data/embedder'

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
    expect(vectors.get('/img/a1.jpg')).toEqual([1, 0])
    expect(vectors.get('/img/b1.jpg')).toEqual([0, 1])
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
    expect(vectors.has('/img/a2.jpg')).toBe(false)
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
