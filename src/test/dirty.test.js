import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  stampChangedRows,
  setDirty,
  isDirty,
  clearDirty,
  readPendingDeletes,
  addPendingDeletes,
  clearPendingDeletes,
  writeStamp,
  readStamp,
  writeGeneration,
  readGeneration,
  writeRowGenerations,
  readRowGenerations,
  hasDirtyRows,
  confirmRowGenerations,
  dropRowGenerations,
  purgeDirtySidecars,
} from '../backend/dirty'

describe('stampChangedRows', () => {
  const AT = '2026-07-19T10:00:00.000Z'

  it('stamps rows that are new or reference-changed, leaves untouched rows alone', () => {
    const kept = { id: 'a', title: 'same', updatedAt: '2026-06-01T00:00:00Z' }
    const prev = [kept, { id: 'b', title: 'old' }]
    const next = [kept, { id: 'b', title: 'edited' }, { id: 'c', title: 'new' }]
    const out = stampChangedRows(prev, next, AT)
    expect(out[0].updatedAt).toBe('2026-06-01T00:00:00Z') // same reference → keep stamp
    expect(out[1].updatedAt).toBe(AT) // new object for same id → restamp
    expect(out[2].updatedAt).toBe(AT) // brand new row → stamp
  })

  it('passes non-array and id-less values through unchanged', () => {
    expect(stampChangedRows([], { map: true }, AT)).toEqual({ map: true })
    const noId = [{ title: 'no id' }]
    expect(stampChangedRows([], noId, AT)[0].updatedAt).toBeUndefined()
  })

  // #84: per-row generation tracking needs a token attached to exactly the
  // rows this call identifies as changed — the same detection stampChangedRows
  // already does for updatedAt.
  it('also stamps a fresh editGen on changed rows, leaves untouched rows without one', () => {
    const kept = { id: 'a', title: 'same', updatedAt: '2026-06-01T00:00:00Z' }
    const prev = [kept, { id: 'b', title: 'old' }]
    const next = [kept, { id: 'b', title: 'edited' }, { id: 'c', title: 'new' }]
    const out = stampChangedRows(prev, next, AT)
    expect(out[0].editGen).toBeUndefined()
    expect(out[1].editGen).toBeTruthy()
    expect(out[2].editGen).toBeTruthy()
    expect(out[1].editGen).not.toBe(out[2].editGen)
  })

  it('editGen is collision-resistant even for two rows stamped in the same millisecond', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(AT))
      const next = [{ id: 'x', title: 'one' }, { id: 'y', title: 'two' }]
      const out = stampChangedRows([], next, AT)
      expect(out[0].editGen).not.toBe(out[1].editGen)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('dirty flag + pending deletes + singleton stamp', () => {
  beforeEach(() => localStorage.clear())

  it('dirty flag round-trips', () => {
    expect(isDirty('tattoo_ideas')).toBe(false)
    setDirty('tattoo_ideas')
    expect(isDirty('tattoo_ideas')).toBe(true)
    clearDirty('tattoo_ideas')
    expect(isDirty('tattoo_ideas')).toBe(false)
  })

  it('pending deletes accumulate, dedupe, and clear only the given ids', () => {
    addPendingDeletes('tattoo_ideas', ['a', 'b'])
    addPendingDeletes('tattoo_ideas', ['b', 'c'])
    expect(readPendingDeletes('tattoo_ideas')).toEqual(['a', 'b', 'c'])
    clearPendingDeletes('tattoo_ideas', ['a', 'c'])
    expect(readPendingDeletes('tattoo_ideas')).toEqual(['b'])
  })

  it('pending deletes survive in localStorage (durable across reloads)', () => {
    addPendingDeletes('tattoo_ideas', ['gone'])
    expect(JSON.parse(localStorage.getItem('tattoo_pending_delete_tattoo_ideas'))).toEqual(['gone'])
  })

  it('singleton stamp round-trips', () => {
    expect(readStamp('tattoo_convention_attending')).toBe('')
    writeStamp('tattoo_convention_attending', '2026-07-19T10:00:00.000Z')
    expect(readStamp('tattoo_convention_attending')).toBe('2026-07-19T10:00:00.000Z')
  })

  it('purgeDirtySidecars removes every sidecar but nothing else', () => {
    setDirty('tattoo_ideas')
    addPendingDeletes('tattoo_boards', ['x'])
    writeStamp('tattoo_convention_attending')
    writeGeneration('tattoo_ideas')
    writeRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'g1' }])
    localStorage.setItem('tattoo_theme', 'dark')
    purgeDirtySidecars()
    expect(isDirty('tattoo_ideas')).toBe(false)
    expect(readPendingDeletes('tattoo_boards')).toEqual([])
    expect(readStamp('tattoo_convention_attending')).toBe('')
    expect(readGeneration('tattoo_ideas')).toBe('')
    expect(readRowGenerations('tattoo_ideas')).toEqual({})
    expect(localStorage.getItem('tattoo_theme')).toBe('dark')
  })

  // #35 review (codex + agy): the cross-tab generation marker must never
  // collide, or a flush could wrongly conclude "nothing changed since I
  // started" for a genuinely different, still-unsynced edit from another tab.
  it('generation round-trips', () => {
    expect(readGeneration('tattoo_ideas')).toBe('')
    writeGeneration('tattoo_ideas')
    expect(readGeneration('tattoo_ideas')).not.toBe('')
  })

  it('generation is collision-resistant even for two writes in the same millisecond', () => {
    // Two tabs can genuinely edit within the same millisecond — freeze time
    // so this proves the token itself is collision-resistant, not just that
    // wall-clock time happened to advance between the two calls.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-19T10:00:00.000Z'))
      writeGeneration('tattoo_ideas')
      const first = readGeneration('tattoo_ideas')
      writeGeneration('tattoo_ideas')
      const second = readGeneration('tattoo_ideas')
      expect(first).not.toBe('')
      expect(second).not.toBe('')
      expect(second).not.toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })

  it('generation is a separate sidecar from the singleton stamp — never persisted as updatedAt', () => {
    writeStamp('tattoo_convention_attending', '2026-07-19T10:00:00.000Z')
    writeGeneration('tattoo_convention_attending')
    // The generation token must not leak into or overwrite the real,
    // orderable timestamp consumed as `updatedAt` for singleton LWW.
    expect(readStamp('tattoo_convention_attending')).toBe('2026-07-19T10:00:00.000Z')
  })
})

// #84: the #35 per-key generation closed the previous bug (any concurrent
// edit could clear another tab's dirty flag) but not a narrower one — it's
// wrong when another tab's edit already landed, and is already reflected in
// the generation value this tab's flush snapshots at start, before this
// tab's own flush even begins. A single token per *key* can't represent "N
// independent, individually-unconfirmed edits from N different rows." These
// functions track generation per row instead, embedded on the row itself so
// a tab can only ever confirm rows it actually edited — see
// stampChangedRows above for where editGen gets attached.
describe('per-row generation tracking (#84)', () => {
  beforeEach(() => localStorage.clear())

  it('writeRowGenerations records only rows that carry an editGen', () => {
    writeRowGenerations('tattoo_ideas', [
      { id: 'a', editGen: 'g1' },
      { id: 'b', title: 'no gen, e.g. pulled from remote' },
    ])
    expect(readRowGenerations('tattoo_ideas')).toEqual({ a: 'g1' })
  })

  it('hasDirtyRows is false with no tracked rows, true once one is written', () => {
    expect(hasDirtyRows('tattoo_ideas')).toBe(false)
    writeRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'g1' }])
    expect(hasDirtyRows('tattoo_ideas')).toBe(true)
  })

  it('confirmRowGenerations clears a row whose pushed editGen still matches the tracked one', () => {
    writeRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'g1' }])
    confirmRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'g1' }])
    expect(readRowGenerations('tattoo_ideas')).toEqual({})
    expect(hasDirtyRows('tattoo_ideas')).toBe(false)
  })

  // The exact #84 residual gap: a row's tracked generation must have come
  // from *this* push, not merely be unchanged since some earlier snapshot.
  it('does not clear a row whose tracked generation is newer than what was pushed', () => {
    // Another tab's edit lands first, tracked as g1.
    writeRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'g1' }])
    // This tab pushes its own, older/stale copy of the row (e.g. it never
    // saw the other tab's edit at all) and tries to confirm with a
    // mismatched (or absent) editGen.
    confirmRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'stale-or-missing' }])
    expect(readRowGenerations('tattoo_ideas')).toEqual({ a: 'g1' })
    expect(hasDirtyRows('tattoo_ideas')).toBe(true)
  })

  it('never attempts to clear a row it did not itself push with an editGen', () => {
    // A row this tab never edited (no editGen attached) must never affect
    // another row's — or its own — tracked generation, even if it's
    // included in the pushed batch (e.g. a stale copy of another tab's row).
    writeRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'g1' }])
    confirmRowGenerations('tattoo_ideas', [{ id: 'a' }, { id: 'b' }])
    expect(readRowGenerations('tattoo_ideas')).toEqual({ a: 'g1' })
  })

  it('confirms multiple rows independently in one call', () => {
    writeRowGenerations('tattoo_ideas', [
      { id: 'a', editGen: 'g1' },
      { id: 'b', editGen: 'g2' },
    ])
    confirmRowGenerations('tattoo_ideas', [
      { id: 'a', editGen: 'g1' },
      { id: 'b', editGen: 'stale' },
    ])
    expect(readRowGenerations('tattoo_ideas')).toEqual({ b: 'g2' })
  })

  it('dropRowGenerations removes tracked entries for deleted rows', () => {
    writeRowGenerations('tattoo_ideas', [
      { id: 'a', editGen: 'g1' },
      { id: 'b', editGen: 'g2' },
    ])
    dropRowGenerations('tattoo_ideas', ['a'])
    expect(readRowGenerations('tattoo_ideas')).toEqual({ b: 'g2' })
  })
})
