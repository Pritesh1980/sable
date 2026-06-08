import { describe, it, expect } from 'vitest'
import {
  KEY_TO_COLLECTION,
  collectionFor,
  reconcileRecords,
  valueToRecords,
  recordsToValue,
  reconcileValue,
  SINGLETON_ID,
} from '../backend/sync'

describe('collectionFor / KEY_TO_COLLECTION', () => {
  it('maps every synced localStorage key to a collection', () => {
    expect(collectionFor('tattoo_ideas')).toBe('ideas')
    expect(collectionFor('tattoo_concepts')).toBe('concepts')
    expect(collectionFor('tattoo_boards')).toBe('boards')
    expect(collectionFor('tattoo_artists_meta')).toBe('artistsMeta')
    expect(collectionFor('tattoo_convention_attending')).toBe('conventionOverrides')
  })

  it('returns null for device-local keys (theme, font, api keys)', () => {
    expect(collectionFor('tattoo_theme')).toBeNull()
    expect(collectionFor('tattoo_font')).toBeNull()
    expect(collectionFor('openai_api_key')).toBeNull()
    expect(collectionFor('gemini_api_key')).toBeNull()
  })

  it('only the five expected keys are synced', () => {
    expect(Object.keys(KEY_TO_COLLECTION).sort()).toEqual([
      'tattoo_artists_meta',
      'tattoo_boards',
      'tattoo_concepts',
      'tattoo_convention_attending',
      'tattoo_ideas',
    ])
  })
})

describe('reconcileRecords (last-write-wins)', () => {
  it('keeps the strictly-newer local row', () => {
    const remote = [{ id: '1', v: 'old', updatedAt: '2026-01-01T00:00:00Z' }]
    const local = [{ id: '1', v: 'new', updatedAt: '2026-02-01T00:00:00Z' }]
    expect(reconcileRecords(local, remote)).toEqual([
      { id: '1', v: 'new', updatedAt: '2026-02-01T00:00:00Z' },
    ])
  })

  it('keeps the remote row when it is newer', () => {
    const remote = [{ id: '1', v: 'remote', updatedAt: '2026-03-01T00:00:00Z' }]
    const local = [{ id: '1', v: 'local', updatedAt: '2026-02-01T00:00:00Z' }]
    expect(reconcileRecords(local, remote)[0].v).toBe('remote')
  })

  it('resolves ties to the remote row (already persisted)', () => {
    const remote = [{ id: '1', v: 'remote', updatedAt: '2026-02-01T00:00:00Z' }]
    const local = [{ id: '1', v: 'local', updatedAt: '2026-02-01T00:00:00Z' }]
    expect(reconcileRecords(local, remote)[0].v).toBe('remote')
  })

  it('unions records that exist on only one side', () => {
    const remote = [{ id: 'a', updatedAt: '2026-01-01T00:00:00Z' }]
    const local = [{ id: 'b', updatedAt: '2026-01-01T00:00:00Z' }]
    const out = reconcileRecords(local, remote)
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })
})

describe('valueToRecords / recordsToValue', () => {
  it('stamps list records with a shared updatedAt', () => {
    const rows = valueToRecords('ideas', [{ id: '1' }, { id: '2' }], '2026-06-08T00:00:00Z')
    expect(rows).toHaveLength(2)
    rows.forEach((r) => expect(r.updatedAt).toBe('2026-06-08T00:00:00Z'))
  })

  it('round-trips a list collection', () => {
    const value = [{ id: '1', title: 'x' }]
    const rows = valueToRecords('ideas', value, '2026-06-08T00:00:00Z')
    expect(recordsToValue('ideas', rows)).toEqual(rows)
  })

  it('wraps a singleton map into one record under data', () => {
    const rows = valueToRecords('conventionOverrides', { 'conv-1': true }, '2026-06-08T00:00:00Z')
    expect(rows).toEqual([{ id: SINGLETON_ID, updatedAt: '2026-06-08T00:00:00Z', data: { 'conv-1': true } }])
    expect(recordsToValue('conventionOverrides', rows)).toEqual({ 'conv-1': true })
  })

  it('recordsToValue defaults a missing singleton to an empty map', () => {
    expect(recordsToValue('conventionOverrides', [])).toEqual({})
  })
})

describe('reconcileValue', () => {
  it('merges list collections by id + updatedAt', () => {
    const local = [{ id: '1', v: 'new', updatedAt: '2026-02-01T00:00:00Z' }]
    const remote = [
      { id: '1', v: 'old', updatedAt: '2026-01-01T00:00:00Z' },
      { id: '2', v: 'remote', updatedAt: '2026-01-01T00:00:00Z' },
    ]
    const out = reconcileValue('ideas', local, remote)
    expect(out.find((r) => r.id === '1').v).toBe('new')
    expect(out.find((r) => r.id === '2').v).toBe('remote')
  })

  it('picks the newer singleton document', () => {
    const localValue = { a: 1 }
    const remoteRows = [{ id: SINGLETON_ID, updatedAt: '2026-05-01T00:00:00Z', data: { b: 2 } }]
    // remote is newer than local (no localAt) → remote wins
    expect(reconcileValue('conventionOverrides', localValue, remoteRows, '2026-01-01T00:00:00Z')).toEqual({ b: 2 })
    // local newer → local wins
    expect(reconcileValue('conventionOverrides', localValue, remoteRows, '2026-12-01T00:00:00Z')).toEqual({ a: 1 })
  })
})
