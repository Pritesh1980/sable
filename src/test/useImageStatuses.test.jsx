import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import useImageStatuses from '../hooks/useImageStatuses'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const HERE = 'user/u1/concepts/c1/here.jpg'
const GONE = 'user/u1/concepts/c2/gone.jpg'

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useImageStatuses', () => {
  it('reports each ref: a static path at once, keys once they settle', async () => {
    await backend.blobs.upload('u1', HERE, 'data:image/jpeg;base64,QUJD', 'image/jpeg')
    const realGetUrl = backend.blobs.getUrl.bind(backend.blobs)
    vi.spyOn(backend.blobs, 'getUrl').mockImplementation((key) => (
      key === GONE ? Promise.reject(new Error('offline')) : realGetUrl(key)
    ))
    const refs = ['images/demo/a.jpg', HERE, GONE, '']
    const { result } = renderHook(() => useImageStatuses(refs))
    expect(result.current).toEqual(['ready', 'loading', 'loading', 'none'])
    await waitFor(() => expect(result.current).toEqual(['ready', 'ready', 'unavailable', 'none']))
  })

  it('does not start again for a re-created list of the same refs', async () => {
    await backend.blobs.upload('u1', HERE, 'data:image/jpeg;base64,QUJD', 'image/jpeg')
    const getUrl = vi.spyOn(backend.blobs, 'getUrl')
    const { result, rerender } = renderHook(() => useImageStatuses([HERE]))
    await waitFor(() => expect(result.current).toEqual(['ready']))
    const calls = getUrl.mock.calls.length
    rerender()
    rerender()
    expect(getUrl.mock.calls.length).toBe(calls)
  })
})
