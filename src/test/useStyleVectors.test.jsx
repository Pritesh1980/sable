import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useStyleVectors from '../hooks/useStyleVectors'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'
import { refIdentity } from '../data/imageRef'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  buildStyleIndex: vi.fn(async () => {}),
}))

const artists = [{ id: 'zoia', images: ['/z1.jpg', '/z2.jpg'] }]

beforeEach(() => {
  vi.clearAllMocks()
  loadVectors.mockResolvedValue(new Map([[refIdentity('/z1.jpg'), [1, 0]]]))
})

describe('useStyleVectors', () => {
  it('reads the index and reports how much of it is built', async () => {
    const { result } = renderHook(() => useStyleVectors(artists))
    await waitFor(() => expect(result.current.coverage).toEqual({ embedded: 1, total: 2 }))
  })

  it('a build in one sheet refreshes every other sheet reading the index', async () => {
    // Search stays open under the viewer while More like this builds.
    const search = renderHook(() => useStyleVectors(artists))
    const more = renderHook(() => useStyleVectors(artists))
    await waitFor(() => expect(search.result.current.coverage?.embedded).toBe(1))

    loadVectors.mockResolvedValue(new Map([[refIdentity('/z1.jpg'), [1, 0]], [refIdentity('/z2.jpg'), [0, 1]]]))
    await act(() => more.result.current.build())
    await waitFor(() => expect(search.result.current.coverage?.embedded).toBe(2))
  })

  it('reports a failed build', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    buildStyleIndex.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useStyleVectors(artists))
    await act(() => result.current.build())
    expect(result.current.error).toMatch(/failed/)
    expect(result.current.progress).toBeNull()
  })
})
