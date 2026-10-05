import { describe, it, expect, beforeEach, vi } from 'vitest'

// The resolver is the one place a stored image ref becomes something an <img>
// can show (#113). Display strings pass straight through (state still holds
// them until #116/#117); blob keys are read from the URL cache synchronously
// and resolved over the backend otherwise.

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { resolveImageRef, resolveImage } = await import('../data/imageResolver')

beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('resolveImageRef (synchronous)', () => {
  it('reports "none" for a missing or empty ref', () => {
    for (const ref of [null, undefined, '', {}, { url: '' }]) {
      expect(resolveImageRef(ref)).toEqual({ status: 'none', src: '' })
    }
  })

  it('passes a display string through, applying the deploy base to a static path', () => {
    expect(resolveImageRef('images/artists/a/1.jpg')).toEqual({ status: 'ready', src: '/images/artists/a/1.jpg' })
    expect(resolveImageRef('https://example.com/a.jpg')).toEqual({ status: 'ready', src: 'https://example.com/a.jpg' })
    expect(resolveImageRef('blob:http://localhost/abc')).toEqual({ status: 'ready', src: 'blob:http://localhost/abc' })
  })

  it('unwraps a { url, addedAt } ref', () => {
    expect(resolveImageRef({ url: 'images/artists/a/1.jpg', addedAt: '2026-01-01T00:00:00Z' })).toEqual({
      status: 'ready',
      src: '/images/artists/a/1.jpg',
    })
  })

  it('shows the url of a mixed ref whose key is not a blob key', () => {
    expect(resolveImageRef({ key: 'blob-key', url: 'images/artists/a/1.jpg' })).toEqual({
      status: 'ready',
      src: '/images/artists/a/1.jpg',
    })
  })

  it('is ready on the first read when a blob key is already cached', () => {
    registerBlobUrl('user/u1/a.jpg', 'https://signed.example/a')
    expect(resolveImageRef({ key: 'user/u1/a.jpg' })).toEqual({ status: 'ready', src: 'https://signed.example/a' })
    expect(resolveImageRef('user/u1/a.jpg')).toEqual({ status: 'ready', src: 'https://signed.example/a' })
  })

  it('is "loading" with no src when a blob key is not cached yet', () => {
    expect(resolveImageRef({ key: 'user/u1/never-seen.jpg' })).toEqual({ status: 'loading', src: '' })
  })
})

describe('resolveImage (asynchronous)', () => {
  it('resolves a blob key over the backend', async () => {
    getUrl.mockResolvedValue('https://signed.example/b')
    expect(await resolveImage({ key: 'user/u1/b.jpg' })).toBe('https://signed.example/b')
  })

  it('resolves a display string to the same src the sync path gives', async () => {
    expect(await resolveImage('images/artists/a/1.jpg')).toBe('/images/artists/a/1.jpg')
    expect(await resolveImage({ url: 'https://example.com/a.jpg' })).toBe('https://example.com/a.jpg')
  })

  it('resolves to "" and never throws when the image is unavailable', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    await expect(resolveImage({ key: 'user/u1/gone.jpg' })).resolves.toBe('')
    await expect(resolveImage(null)).resolves.toBe('')
    await expect(resolveImage({})).resolves.toBe('')
  })
})
