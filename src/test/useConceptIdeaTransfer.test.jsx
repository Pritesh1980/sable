import { beforeEach, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useConceptIdeaTransfer from '../hooks/useConceptIdeaTransfer'
import { stageConceptIdeaImage } from '../data/conceptIdeas'
import { takeConceptIdeaHandoff } from '../data/conceptIdeaHandoff'
import { createOwnerScope } from '../backend/ownerScope'

vi.mock('../data/conceptIdeas', async original => ({ ...(await original()), stageConceptIdeaImage: vi.fn() }))
const concept = { id: 'c', prompt: 'Temple', imageUrl: 'user/a/concepts/c/original', tags: ['blackwork'], variants: [
  { id: 'best', title: 'Best', imageUrl: 'user/a/concepts/c/best', isBest: true },
  { id: 'chosen', title: '3D arm preview', imageUrl: 'user/a/concepts/c/chosen', notes: 'Chosen notes' },
] }
let options
let rows
let owner
let finish
beforeEach(() => {
  stageConceptIdeaImage.mockReset()
  owner = 'a'
  rows = [{ id: 'i', title: 'Existing', images: [{ key: 'user/a/ideas/i/old', note: 'Old', briefCrop: { x: 1, y: 0, zoom: 2 } }] }]
  options = { concepts: [concept], ideas: rows, userId: 'a', navigate: vi.fn(),
    setIdeas: updater => { rows = updater(rows) },
    ownerScope: createOwnerScope({ privateMode: true, getOwnerId: () => owner }) }
  stageConceptIdeaImage.mockImplementation((_source, { userId, ideaId }) =>
    new Promise(resolve => { finish = () => resolve({ key: `user/${userId}/ideas/${ideaId}/copied` }) }))
})
const open = result => act(() => result.current.open({ conceptId: 'c', variantId: 'chosen' }))

it('transfers the chosen non-Best result into an unsaved, owner-bound draft exactly once', async () => {
  const { result } = renderHook(() => useConceptIdeaTransfer(options))
  open(result)
  let pending
  act(() => { pending = result.current.submit({ note: '' }); void result.current.submit({ note: 'Duplicate tap' }) })
  expect(result.current.busy).toBe(true)
  expect(stageConceptIdeaImage).toHaveBeenCalledTimes(1)
  expect(stageConceptIdeaImage.mock.calls[0][0]).toBe('user/a/concepts/c/chosen')
  await act(async () => { finish(); await pending })
  expect(rows).toHaveLength(1)
  expect(options.navigate).toHaveBeenCalledTimes(1)
  const [, navigation] = options.navigate.mock.calls[0]
  const draft = takeConceptIdeaHandoff(navigation.state.conceptIdeaRequest, options)
  expect(draft).toMatchObject({ title: 'Temple', description: 'Temple\n\nChosen notes', tags: ['blackwork'],
    images: [{ key: `user/a/ideas/${draft.id}/copied`, note: '' }] })
})

it('appends an original to the latest target without overwriting concurrent fields', async () => {
  const { result, rerender } = renderHook(() => useConceptIdeaTransfer(options))
  act(() => result.current.open({ conceptId: 'c', variantId: null }))
  let pending
  act(() => { pending = result.current.submit({ ideaId: 'i', note: 'Original idea' }) })
  rows = [{ ...rows[0], title: 'Edited elsewhere' }]
  options = { ...options, ideas: rows }
  rerender()
  await act(async () => { finish(); await pending })
  expect(stageConceptIdeaImage.mock.calls[0][0]).toBe('user/a/concepts/c/original')
  expect(rows[0]).toMatchObject({ title: 'Edited elsewhere', images: [
    { key: 'user/a/ideas/i/old', note: 'Old', briefCrop: { x: 1, y: 0, zoom: 2 } },
    { key: 'user/a/ideas/i/copied', note: 'Original idea' },
  ] })
  expect(options.navigate).toHaveBeenCalledWith('/brief?idea=i', { replace: true })
})

it.each(['close', 'unmount', 'source', 'owner', 'target'])('discards a late copy after %s changes', async change => {
  const { result, rerender, unmount } = renderHook(() => useConceptIdeaTransfer(options))
  open(result)
  let pending
  act(() => { pending = result.current.submit({ ideaId: 'i' }) })
  if (change === 'close') act(() => result.current.close())
  if (change === 'unmount') unmount()
  if (change === 'source') { options = { ...options, concepts: [{ ...concept, variants: [] }] }; rerender() }
  if (change === 'owner') { owner = 'b'; options.ownerScope.invalidate(); owner = 'a' }
  if (change === 'target') { options = { ...options, ideas: [] }; rerender() }
  await act(async () => { finish(); await pending })
  expect(rows[0].images).toHaveLength(1)
  expect(options.navigate).not.toHaveBeenCalled()
})

it('does not fall back to the original when the selected variant is deleted before submit', async () => {
  const { result, rerender } = renderHook(() => useConceptIdeaTransfer(options))
  open(result)
  options = { ...options, concepts: [{ ...concept, variants: [] }] }
  rerender()
  await act(async () => { await result.current.submit({}) })
  expect(stageConceptIdeaImage).not.toHaveBeenCalled()
  expect(result.current.error).toMatch(/available/i)
})

it('keeps a failed copy retryable without adding a partial idea', async () => {
  stageConceptIdeaImage.mockRejectedValueOnce(new Error('Device storage full'))
  const { result } = renderHook(() => useConceptIdeaTransfer(options))
  open(result)
  await act(async () => { await result.current.submit({}) })
  expect(result.current.busy).toBe(false)
  expect(result.current.error).toMatch(/store|storage|copy/i)
  expect(rows).toHaveLength(1)
  expect(options.navigate).not.toHaveBeenCalled()
  let retry
  act(() => { retry = result.current.submit({}) })
  await act(async () => { finish(); await retry })
  expect(options.navigate).toHaveBeenCalledTimes(1)
})
