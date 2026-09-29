import { expect, it } from 'vitest'
import { upsertRefinementVariant, removeConceptVariant } from '../data/conceptVariants'

const variant = {
  id: 'relay:00000000-0000-4000-8000-000000000001',
  provider: 'openai', title: '', imageUrl: 'user/A/concepts/c/result.png',
  response: '', notes: '', rating: 0, isBest: false,
  createdAt: '2026-09-28T12:00:00.000Z', parentVariantId: 'parent', operation: 'refine',
}
const parent = {
  id: 'parent', provider: 'chatgpt', title: '', imageUrl: '/source.png',
  response: '', notes: '', rating: 3, isBest: true, createdAt: '2026-09-28T11:00:00.000Z',
}

it('retains the saved object and all user edits on repeat import', () => {
  const first = upsertRefinementVariant({ id: 'c', variants: [parent] }, variant)
  first.variants[0] = { ...first.variants[0], notes: 'Artist discussed', rating: 5, isBest: true }
  const again = upsertRefinementVariant(first, { ...variant, imageUrl: '/replayed.png' })
  expect(again).toBe(first)
  expect(again.variants).toHaveLength(2)
  expect(again.variants[0]).toBe(first.variants[0])
  expect(again.variants[0]).toMatchObject({ notes: 'Artist discussed', rating: 5, isBest: true, imageUrl: variant.imageUrl })
})

it('keeps child images and lineage when their parent is deleted', () => {
  const first = upsertRefinementVariant({ id: 'c', variants: [parent] }, variant)
  expect(removeConceptVariant(first, 'parent').variants).toEqual([variant])
  expect(first.variants).toEqual([variant, parent])
})

it('inserts into a legacy concept without changing the original or sibling Best choice', () => {
  const original = { id: 'c', imageUrl: '/original.png', prompt: 'moth' }
  expect(upsertRefinementVariant(original, variant)).toEqual({ ...original, variants: [variant] })
  expect(original).not.toHaveProperty('variants')
  const saved = upsertRefinementVariant({ ...original, variants: [parent] }, variant)
  expect(saved.variants[1]).toBe(parent)
  expect(saved.variants[1].isBest).toBe(true)
})
