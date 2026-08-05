import { describe, expect, it } from 'vitest'
import { removeAt, restoreRemoval } from '../data/undoableRemoval'

describe('removeAt', () => {
  it('drops the item at the index and reports what it took', () => {
    const { list, removal } = removeAt(['a', 'b', 'c'], 1)

    expect(list).toEqual(['a', 'c'])
    expect(removal).toEqual({ item: 'b', index: 1 })
  })

  it('leaves the list alone for an index that is not in it', () => {
    const original = ['a', 'b']

    expect(removeAt(original, 5)).toEqual({ list: original, removal: null })
    expect(removeAt(original, -1)).toEqual({ list: original, removal: null })
  })

  it('does not mutate the list it was given', () => {
    const original = ['a', 'b', 'c']
    removeAt(original, 0)

    expect(original).toEqual(['a', 'b', 'c'])
  })
})

describe('restoreRemoval', () => {
  it('puts the item back where it was, not on the end', () => {
    const { list, removal } = removeAt(['a', 'b', 'c'], 1)

    expect(restoreRemoval(list, removal)).toEqual(['a', 'b', 'c'])
  })

  it('restores a first and a last item to their original positions', () => {
    const first = removeAt(['a', 'b', 'c'], 0)
    const last = removeAt(['a', 'b', 'c'], 2)

    expect(restoreRemoval(first.list, first.removal)).toEqual(['a', 'b', 'c'])
    expect(restoreRemoval(last.list, last.removal)).toEqual(['a', 'b', 'c'])
  })

  it('appends rather than dropping the item when the list shrank underneath it', () => {
    // The list can change between removal and undo (a sync landing, say). The item
    // must still come back — position is best-effort, presence is not.
    const { removal } = removeAt(['a', 'b', 'c'], 2)

    expect(restoreRemoval([], removal)).toEqual(['c'])
  })

  it('is a no-op without a removal to restore', () => {
    expect(restoreRemoval(['a'], null)).toEqual(['a'])
  })

  it('does not mutate the list it was given', () => {
    const original = ['a', 'c']
    restoreRemoval(original, { item: 'b', index: 1 })

    expect(original).toEqual(['a', 'c'])
  })
})
