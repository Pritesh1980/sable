import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Pixel consumers (STL relief, the WebGL crossfade) read an image's pixels, and
// a cross-origin <img> without CORS taints the canvas — which is every Supabase
// signed url (#114). They resolve the ref to bytes first: a same-origin blob:
// copy that can always be read, or '' when the photo is not available.

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { resolveImageBytes } = await import('../data/imageResolver')
const { default: useImageBytes } = await import('../hooks/useImageBytes')

let revoke
beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  revoke = vi.fn()
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:copy-${(n += 1)}`),
    revokeObjectURL: revoke,
  }))
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) })))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('resolveImageBytes', () => {
  it('hands back a same-origin source as it is, with nothing to fetch or release', async () => {
    for (const ref of ['images/a.jpg', '/images/a.jpg', 'data:image/png;base64,AAAA', 'blob:http://localhost/abc', { url: 'images/a.jpg', addedAt: 'x' }]) {
      const { src, release } = await resolveImageBytes(ref)
      expect(src).toMatch(/^(\/images\/a\.jpg|data:|blob:)/)
      release()
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })

  it('copies a cross-origin url into a same-origin blob: url, and release revokes it', async () => {
    const { src, release } = await resolveImageBytes('https://signed.example/a?t=1')
    expect(src).toBe('blob:copy-1')
    expect(fetch).toHaveBeenCalledWith('https://signed.example/a?t=1')
    expect(revoke).not.toHaveBeenCalled()
    release()
    expect(revoke).toHaveBeenCalledWith('blob:copy-1')
  })

  it('resolves a blob key over the backend, then copies it', async () => {
    getUrl.mockResolvedValue('https://signed.example/key')
    const { src } = await resolveImageBytes({ key: 'user/u1/a.jpg' })
    expect(src).toBe('blob:copy-1')
    expect(fetch).toHaveBeenCalledWith('https://signed.example/key')
  })

  it('reports "" with a harmless release when the bytes cannot be read', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    const { src, release } = await resolveImageBytes('https://signed.example/a')
    expect(src).toBe('')
    expect(() => release()).not.toThrow()
    expect(revoke).not.toHaveBeenCalled()
  })

  it('reports "" for an empty ref and for an unresolvable key', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    expect((await resolveImageBytes(null)).src).toBe('')
    expect((await resolveImageBytes({ key: 'user/u1/gone.jpg' })).src).toBe('')
  })
})

describe('useImageBytes', () => {
  it('is "none" for an empty ref and ready at once for a same-origin source', () => {
    expect(renderHook(() => useImageBytes(null)).result.current).toEqual({ src: '', status: 'none' })
    expect(renderHook(() => useImageBytes('images/a.jpg')).result.current).toEqual({ src: '/images/a.jpg', status: 'ready' })
  })

  it('goes loading -> ready with a copy for a cross-origin url, and revokes it on unmount', async () => {
    const { result, unmount } = renderHook(() => useImageBytes('https://signed.example/a'))
    expect(result.current).toEqual({ src: '', status: 'loading' })
    await waitFor(() => expect(result.current).toEqual({ src: 'blob:copy-1', status: 'ready' }))
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:copy-1')
  })

  it('goes loading -> unavailable when the bytes cannot be read', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useImageBytes('https://signed.example/a'))
    await waitFor(() => expect(result.current).toEqual({ src: '', status: 'unavailable' }))
  })

  it('revokes the previous copy and never shows it under a new ref', async () => {
    const { result, rerender } = renderHook(({ image }) => useImageBytes(image), {
      initialProps: { image: 'https://signed.example/a' },
    })
    await waitFor(() => expect(result.current.src).toBe('blob:copy-1'))
    rerender({ image: 'https://signed.example/b' })
    expect(result.current).toEqual({ src: '', status: 'loading' })
    await waitFor(() => expect(result.current.src).toBe('blob:copy-2'))
    expect(revoke).toHaveBeenCalledWith('blob:copy-1')
  })

  it('reads a registered blob key as a copy of the cached url', async () => {
    registerBlobUrl('user/u1/a.jpg', 'https://signed.example/cached')
    const { result } = renderHook(() => useImageBytes({ key: 'user/u1/a.jpg' }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fetch).toHaveBeenCalledWith('https://signed.example/cached')
  })
})
