import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { withStagedImages, stageImageRefs, stageInlineOnce } from '../data/imageStaging'
import { warmImageCache } from '../data/imageResolver'
import { clearBlobUrls, getCachedBlobUrl } from '../data/blobUrls'
import { backend } from '../backend'

const PHOTO = 'data:image/jpeg;base64,QUJD'
const ctx = { userId: 'u1', scope: 'ideas', id: 'i1' }

// A photo that can be neither kept on this device nor uploaded; returns the undo.
function failStagingOnce() {
  const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('IndexedDB unavailable') })
  const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  return () => {
    open.mockRestore()
    upload.mockRestore()
  }
}

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('staging hands back keys', () => {
  it('gives commit the key staged for each inline photo, in order', async () => {
    const commit = vi.fn()
    await withStagedImages(['https://example.com/a.jpg', PHOTO], ctx, commit)
    const [keys] = commit.mock.calls[0]
    expect(keys[0]).toBe('')
    expect(keys[1]).toMatch(/^user\/u1\/ideas\/i1\/.+\.jpg$/)
  })

  it('commits at once, with no keys, when nothing needs staging', () => {
    const commit = vi.fn()
    expect(withStagedImages(['https://example.com/a.jpg'], ctx, commit)).toBeUndefined()
    expect(commit).toHaveBeenCalledWith([''])
  })

  it('stageImageRefs returns a { key } per photo', async () => {
    const refs = await stageImageRefs([PHOTO], ctx)
    expect(refs).toHaveLength(1)
    expect(refs[0].key).toMatch(/^user\/u1\/ideas\/i1\//)
    expect(refs[0].url).toBeUndefined()
  })

  it('stageImageRefs returns the url itself when signed out', async () => {
    expect(await stageImageRefs([PHOTO], { scope: 'ideas', id: 'i1' })).toEqual([{ url: PHOTO }])
  })

  it('stageInlineOnce tries again after a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('alert', vi.fn())
    const other = 'data:image/jpeg;base64,UkVUUlk='
    const restore = failStagingOnce()
    expect(await stageInlineOnce(other, ctx)).toBeNull()
    restore()
    expect(await stageInlineOnce(other, ctx)).toMatch(/^user\/u1\//)
  })

  it('stageInlineOnce reuses the key for the same photo', async () => {
    const first = await stageInlineOnce(PHOTO, ctx)
    const second = await stageInlineOnce(PHOTO, ctx)
    expect(first).toMatch(/^user\/u1\//)
    expect(second).toBe(first)
  })
})

describe('warmImageCache', () => {
  it('resolves every blob key and ignores everything else', async () => {
    const key = 'user/u1/ideas/i1/warm.jpg'
    await backend.blobs.upload('u1', key, PHOTO, 'image/jpeg')
    warmImageCache([{ key }, 'images/demo/a.jpg', { url: 'https://example.com/a.jpg' }, null])
    await vi.waitFor(() => expect(getCachedBlobUrl(key)).toBeTruthy())
  })

  it('does not throw when a key cannot be resolved', () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => warmImageCache([{ key: 'user/u1/ideas/i1/gone.jpg' }])).not.toThrow()
  })
})
