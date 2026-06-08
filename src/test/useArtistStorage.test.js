import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { applyDefaults, stripImages, useArtistStorage } from '../hooks/useArtistStorage'
import { DEFAULT_ARTISTS } from '../data/artists'

// ── Pure function tests ───────────────────────────────────────────────────────

describe('stripImages', () => {
  it('removes images from every artist', () => {
    const input = [
      { id: 'a', handle: 'a', images: ['data:image/jpeg;base64,abc'], rank: 1 },
      { id: 'b', handle: 'b', images: [], rank: 2 },
    ]
    const result = stripImages(input)
    expect(result[0]).not.toHaveProperty('images')
    expect(result[1]).not.toHaveProperty('images')
  })

  it('preserves all other fields', () => {
    const input = [{ id: 'a', handle: 'foo', name: 'Foo', tags: ['blackwork'], images: [], rank: 1, studio: 'x' }]
    const [out] = stripImages(input)
    expect(out).toMatchObject({ id: 'a', handle: 'foo', name: 'Foo', tags: ['blackwork'], rank: 1, studio: 'x' })
  })
})

describe('applyDefaults', () => {
  it('adds missing fields from DEFAULT_ARTISTS', () => {
    // Simulate a stored artist missing the studio field
    const stored = DEFAULT_ARTISTS.map((artist) => {
      const rest = { ...artist }
      delete rest.studio
      return rest
    })
    const result = applyDefaults(stored)
    result.forEach((a, i) => {
      expect(a.studio).toBe(DEFAULT_ARTISTS[i].studio)
    })
  })

  it('does not overwrite fields the artist already has', () => {
    // Artist has studio set to a custom value — should be preserved
    const stored = DEFAULT_ARTISTS.map((a) => ({ ...a, studio: 'custom-studio' }))
    const result = applyDefaults(stored)
    result.forEach((a) => expect(a.studio).toBe('custom-studio'))
  })

  it('preserves user data like tags, notes, and rank', () => {
    const stored = DEFAULT_ARTISTS.map((a) => ({
      ...a,
      tags: ['blackwork'],
      notes: 'my note',
      rank: 99,
    }))
    const result = applyDefaults(stored)
    result.forEach((a) => {
      expect(a.tags).toEqual(['blackwork'])
      expect(a.notes).toBe('my note')
      expect(a.rank).toBe(99)
    })
  })

  it('passes through artists not in DEFAULT_ARTISTS unchanged', () => {
    const custom = [{ id: 'unknown', handle: 'unknown', rank: 1, tags: [] }]
    const result = applyDefaults(custom)
    expect(result[0]).toEqual(custom[0])
  })

  it('appends DEFAULT_ARTISTS entries missing from stored list', () => {
    // Simulate localStorage that only has the first artist
    const stored = [DEFAULT_ARTISTS[0]]
    const result = applyDefaults(stored)
    expect(result).toHaveLength(DEFAULT_ARTISTS.length)
    DEFAULT_ARTISTS.slice(1).forEach((d) => {
      expect(result.find((a) => a.id === d.id)).toBeDefined()
    })
  })
})

// ── Hook integration tests ────────────────────────────────────────────────────

describe('useArtistStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initialises with DEFAULT_ARTISTS when storage is empty', () => {
    const { result } = renderHook(() => useArtistStorage())
    expect(result.current[0]).toHaveLength(DEFAULT_ARTISTS.length)
  })

  it('returned artists have no tier field', () => {
    const { result } = renderHook(() => useArtistStorage())
    result.current[0].forEach((a) => expect(a).not.toHaveProperty('tier'))
  })

  it('never persists raw base64 image data to localStorage metadata', async () => {
    const { result } = renderHook(() => useArtistStorage())

    // Wait for IndexedDB init
    await act(async () => {})

    await act(async () => {
      result.current[1]((prev) =>
        prev.map((a) => (a.id === DEFAULT_ARTISTS[0].id ? { ...a, images: ['data:image/jpeg;base64,abc123'] } : a))
      )
    })

    // Metadata may carry small canonical refs ({ key } / static paths) but never
    // inline base64 data-URLs (those stay in IndexedDB until migrated to blobs).
    const raw = localStorage.getItem('tattoo_artists_meta')
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('data:image')
    expect(raw).not.toContain('base64')
  })

  it('setArtists with a plain array works as well as a function', async () => {
    const { result } = renderHook(() => useArtistStorage())
    await act(async () => {})

    const updated = result.current[0].map((a) =>
      a.id === DEFAULT_ARTISTS[0].id ? { ...a, notes: 'test note' } : a
    )

    await act(async () => {
      result.current[1](updated)
    })

    const found = result.current[0].find((a) => a.id === DEFAULT_ARTISTS[0].id)
    expect(found.notes).toBe('test note')
  })

  it('migrates images from old tattoo_artists key to IndexedDB', async () => {
    const oldData = DEFAULT_ARTISTS.map((a, i) =>
      i === 0 ? { ...a, images: ['data:image/jpeg;base64,migratedimg'] } : { ...a, images: [] }
    )
    localStorage.setItem('tattoo_artists', JSON.stringify(oldData))

    const { result } = renderHook(() => useArtistStorage())

    // Wait for the async init (IndexedDB) to fully complete
    await waitFor(() => {
      expect(localStorage.getItem('tattoo_artists')).toBeNull()
    })

    // Migrated data-URL should appear first, followed by any static defaults
    const migrated = result.current[0].find((a) => a.id === DEFAULT_ARTISTS[0].id)
    expect(migrated.images[0]).toBe('data:image/jpeg;base64,migratedimg')
    // Static paths from DEFAULT_ARTISTS are merged in after the upload
    const def = DEFAULT_ARTISTS.find((a) => a.id === DEFAULT_ARTISTS[0].id)
    def.images.forEach((p) => expect(migrated.images).toContain(p))
  })
})
