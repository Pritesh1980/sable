import { describe, it, expect, beforeEach } from 'vitest'
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
    localStorage.setItem('tattoo_theme', 'dark')
    purgeDirtySidecars()
    expect(isDirty('tattoo_ideas')).toBe(false)
    expect(readPendingDeletes('tattoo_boards')).toEqual([])
    expect(readStamp('tattoo_convention_attending')).toBe('')
    expect(localStorage.getItem('tattoo_theme')).toBe('dark')
  })
})
