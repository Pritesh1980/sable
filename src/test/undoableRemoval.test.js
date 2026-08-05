import { describe, expect, it } from 'vitest'
import { removeAt, restoreRemoval } from '../data/undoableRemoval'

describe('removeAt', () => {
  it('drops the item at the index and reports what it took', () => {
    const { list, removal } = removeAt(['a', 'b', 'c'], 1)

    expect(list).toEqual(['a', 'c'])
    expect(removal).toMatchObject({ item: 'b', index: 1 })
  })

  it('records the neighbours so undo can anchor to them', () => {
    expect(removeAt(['a', 'b', 'c'], 1).removal).toMatchObject({ prev: 'a', nextItem: 'c' })
    // Ends have only one neighbour.
    expect(removeAt(['a', 'b', 'c'], 0).removal).toMatchObject({ prev: null, nextItem: 'b' })
    expect(removeAt(['a', 'b', 'c'], 2).removal).toMatchObject({ prev: 'b', nextItem: null })
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

  // Found by the codex review of #51. Restoring was unconditional, so if the item
  // was already back — a sync redelivering it, or a write that never landed — undo
  // inserted a second copy.
  it('does not duplicate an item that is already present', () => {
    const { removal } = removeAt(['a', 'b', 'c'], 1)

    expect(restoreRemoval(['a', 'b', 'c'], removal)).toEqual(['a', 'b', 'c'])
  })

  it('recognises an already-present item by url, key or value', () => {
    const byUrl = removeAt([{ url: 'u1' }, { url: 'u2' }], 0)
    const byKey = removeAt([{ key: 'k1' }, { key: 'k2' }], 0)

    // Same identity, different object reference — must still count as present.
    expect(restoreRemoval([{ url: 'u1' }, { url: 'u2' }], byUrl.removal))
      .toEqual([{ url: 'u1' }, { url: 'u2' }])
    expect(restoreRemoval([{ key: 'k1' }, { key: 'k2' }], byKey.removal))
      .toEqual([{ key: 'k1' }, { key: 'k2' }])
  })

  // Index alone misplaces the item once the list shifts: restoring B (index 1) into
  // [X,A,C] gave [X,B,A,C], putting B before the A it used to follow.
  it('restores next to its original neighbour when the list has shifted', () => {
    const { removal } = removeAt(['a', 'b', 'c'], 1)

    expect(restoreRemoval(['x', 'a', 'c'], removal)).toEqual(['x', 'a', 'b', 'c'])
  })

  it('anchors to the following item when the preceding one is gone', () => {
    const { removal } = removeAt(['a', 'b', 'c'], 1)

    expect(restoreRemoval(['x', 'c'], removal)).toEqual(['x', 'b', 'c'])
  })

  it('does not mutate the list it was given', () => {
    const original = ['a', 'c']
    restoreRemoval(original, { item: 'b', index: 1 })

    expect(original).toEqual(['a', 'c'])
  })
})
