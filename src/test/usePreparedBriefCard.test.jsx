import { it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import usePreparedBriefCard from '../hooks/usePreparedBriefCard'
import { prepareBriefCardImage } from '../data/briefCard'

vi.mock('../data/briefCard', () => ({ prepareBriefCardImage: vi.fn() }))
afterEach(() => vi.restoreAllMocks())
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const prepared = (name) => ({ blob: new Blob([name]), filename: name, photos: [], skippedWebCount: 0, unavailableCount: 0 })

it('never publishes a late result or the previous draft while a new one prepares', async () => {
  const a = deferred(), b = deferred()
  prepareBriefCardImage.mockReset().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const { result, rerender } = renderHook(({ title }) => usePreparedBriefCard({ title }, []), { initialProps: { title: 'A' } })
  rerender({ title: 'B' })
  expect(result.current.prepared).toBeNull()
  await act(async () => b.resolve(prepared('B')))
  expect(result.current.prepared.filename).toBe('B')
  await act(async () => a.resolve(prepared('A')))
  expect(result.current.prepared.filename).toBe('B')
})

it('invalidates all visible content and releases replaced preview URLs', async () => {
  const pending = deferred()
  prepareBriefCardImage.mockReset().mockResolvedValueOnce(prepared('old')).mockReturnValueOnce(pending.promise)
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  const { result, rerender, unmount } = renderHook(({ note }) => usePreparedBriefCard({
    title: 'Same title', images: [{ url: '/a.png', note }],
  }, []), { initialProps: { note: 'old caption' } })
  await waitFor(() => expect(result.current.prepared).not.toBeNull())
  rerender({ note: 'new caption' })
  expect(result.current.prepared).toBeNull()
  expect(result.current.preparing).toBe(true)
  expect(revoke).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve(prepared('new')))
  expect(result.current.prepared.filename).toBe('new')
  unmount()
  expect(revoke).toHaveBeenCalledTimes(2)
})

it('refreshes unavailable photos and keeps errors from exposing an old PNG', async () => {
  prepareBriefCardImage.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(prepared('retry'))
  const { result } = renderHook(() => usePreparedBriefCard({ title: 'T' }, []))
  await waitFor(() => expect(result.current.error).toBeTruthy())
  act(() => result.current.refresh())
  expect(result.current.prepared).toBeNull()
  await waitFor(() => expect(result.current.prepared?.filename).toBe('retry'))
})

it('does not reuse a revoked preview when editing back to earlier content', async () => {
  const b = deferred(), aAgain = deferred()
  prepareBriefCardImage.mockReset().mockResolvedValueOnce(prepared('first A'))
    .mockReturnValueOnce(b.promise).mockReturnValueOnce(aAgain.promise)
  const { result, rerender } = renderHook(({ title }) => usePreparedBriefCard({ title }, []), {
    initialProps: { title: 'A' },
  })
  await waitFor(() => expect(result.current.prepared).not.toBeNull())
  rerender({ title: 'B' })
  rerender({ title: 'A' })
  expect(result.current.prepared).toBeNull()
  expect(result.current.previewUrl).toBe('')
  await act(async () => aAgain.resolve(prepared('new A')))
  expect(result.current.prepared.filename).toBe('new A')
})
