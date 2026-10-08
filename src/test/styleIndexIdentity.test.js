import { describe, it, expect, beforeEach, vi } from 'vitest'

const embed = vi.fn(async (src) => [String(src).length, 1])
vi.mock('../data/embedder', () => ({
  EMBEDDING_MODEL_ID: 'test-model',
  getEmbedder: async () => embed,
}))
const getUrl = vi.fn()
vi.mock('../backend', () => ({ backend: { blobs: { getUrl: (...a) => getUrl(...a) } } }))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { loadVectors, buildStyleIndex, clearStyleIndex } = await import('../data/styleIndex')

const artist = (images) => ({ id: 'a', images })

beforeEach(async () => {
  await clearStyleIndex()
  clearBlobUrls()
  embed.mockClear()
  getUrl.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('style index keyed by photo identity (#116)', () => {
  it('embeds a static photo once, keyed by its identity', async () => {
    const artists = [artist(['images/artists/a/1.jpg'])]
    await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledWith('/images/artists/a/1.jpg')
    expect([...(await loadVectors(artists)).keys()]).toEqual(['path:/images/artists/a/1.jpg'])
  })

  it('embeds a blob-key photo from its resolved url, and does not re-embed it when next session signs a new url', async () => {
    const artists = [artist([{ key: 'user/u1/artists/a/1.jpg' }])]
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=1')
    await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledTimes(1)
    expect(embed).toHaveBeenCalledWith('https://signed.example/a?t=1')

    clearBlobUrls() // a new session
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=2')
    const vectors = await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledTimes(1)
    expect(vectors.has('key:user/u1/artists/a/1.jpg')).toBe(true)
  })

  it('still works while state holds a display url string (before the flip): keyed by that url', async () => {
    const artists = [artist(['https://signed.example/a?t=1'])]
    await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledWith('https://signed.example/a?t=1')
    expect([...(await loadVectors(artists)).keys()]).toEqual(['url:https://signed.example/a?t=1'])
  })

  it('skips a photo it cannot resolve, keeps going, and still finishes its progress', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    const onProgress = vi.fn()
    const artists = [artist([{ key: 'user/u1/artists/a/gone.jpg' }, 'images/artists/a/2.jpg'])]
    const vectors = await buildStyleIndex(artists, { onProgress })
    expect(embed).toHaveBeenCalledTimes(1)
    expect(embed).toHaveBeenCalledWith('/images/artists/a/2.jpg')
    expect([...vectors.keys()]).toEqual(['path:/images/artists/a/2.jpg'])
    expect(onProgress).toHaveBeenLastCalledWith({ done: 2, total: 2 })
  })

  it('opens the v2 database and removes the legacy v1 one', async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('tattoo-style-index-v1', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('vectors')
      req.onsuccess = () => { req.result.close(); resolve() }
      req.onerror = () => reject(req.error)
    })
    await loadVectors([artist(['images/a.jpg'])])
    await vi.waitFor(async () => {
      const names = (await indexedDB.databases()).map((d) => d.name)
      expect(names).toContain('tattoo-style-index-v2')
      expect(names).not.toContain('tattoo-style-index-v1')
    })
  })
})
