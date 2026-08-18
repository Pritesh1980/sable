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
    localStorage.setItem('tattoo_theme', 'dark')
    purgeDirtySidecars()
    expect(isDirty('tattoo_ideas')).toBe(false)
    expect(readPendingDeletes('tattoo_boards')).toEqual([])
    expect(readStamp('tattoo_convention_attending')).toBe('')
    expect(readGeneration('tattoo_ideas')).toBe('')
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
