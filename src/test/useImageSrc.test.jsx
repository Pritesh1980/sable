import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { default: useImageSrc } = await import('../hooks/useImageSrc')

beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useImageSrc (#113)', () => {
  it('reports "none" for an empty ref', () => {
    const { result } = renderHook(() => useImageSrc(null))
    expect(result.current).toEqual({ src: '', status: 'none' })
  })

  it('is ready on the very first render for a display string', () => {
    const { result } = renderHook(() => useImageSrc('images/artists/a/1.jpg'))
    expect(result.current).toEqual({ src: '/images/artists/a/1.jpg', status: 'ready' })
  })

  it('is ready on the very first render for a cached blob key', () => {
    registerBlobUrl('user/u1/a.jpg', 'https://signed.example/a')
    const { result } = renderHook(() => useImageSrc({ key: 'user/u1/a.jpg' }))
    expect(result.current).toEqual({ src: 'https://signed.example/a', status: 'ready' })
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('goes loading -> ready for an uncached blob key', async () => {
    getUrl.mockResolvedValue('https://signed.example/b')
    const { result } = renderHook(() => useImageSrc({ key: 'user/u1/b.jpg' }))
    expect(result.current).toEqual({ src: '', status: 'loading' })
    await waitFor(() => expect(result.current).toEqual({ src: 'https://signed.example/b', status: 'ready' }))
  })

  it('goes loading -> unavailable when the key cannot be resolved', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useImageSrc({ key: 'user/u1/gone.jpg' }))
    await waitFor(() => expect(result.current).toEqual({ src: '', status: 'unavailable' }))
  })

  it('does not show the previous image while a new ref is still loading', async () => {
    registerBlobUrl('user/u1/a.jpg', 'https://signed.example/a')
    let resolveB
    getUrl.mockReturnValue(new Promise((r) => { resolveB = r }))
    const { result, rerender } = renderHook(({ image }) => useImageSrc(image), {
      initialProps: { image: { key: 'user/u1/a.jpg' } },
    })
    expect(result.current.src).toBe('https://signed.example/a')

    rerender({ image: { key: 'user/u1/b.jpg' } })
    expect(result.current).toEqual({ src: '', status: 'loading' })

    resolveB('https://signed.example/b')
    await waitFor(() => expect(result.current.src).toBe('https://signed.example/b'))
  })

  it('treats a re-created but identical ref as the same image (no re-resolve)', async () => {
    getUrl.mockResolvedValue('https://signed.example/c')
    const { result, rerender } = renderHook(({ image }) => useImageSrc(image), {
      initialProps: { image: { key: 'user/u1/c.jpg' } },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ image: { key: 'user/u1/c.jpg', addedAt: '2026-01-01T00:00:00Z' } })
    expect(result.current).toEqual({ src: 'https://signed.example/c', status: 'ready' })
    expect(getUrl).toHaveBeenCalledTimes(1)
  })
})
