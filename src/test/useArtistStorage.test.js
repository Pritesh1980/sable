import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { applyDefaults, mergeStaticImages, stripImages, useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'

// ── Pure function tests ───────────────────────────────────────────────────────

// Review finding (codex): seed paths went base-relative while legacy IndexedDB
// caches still hold the root-absolute form. Comparing the raw strings treats
// them as different images, so every curated image appears twice — and the
// duplicate is then persisted.
describe('mergeStaticImages', () => {
  it('treats a legacy root-absolute path and its base-relative twin as one image', () => {
    const merged = mergeStaticImages(
      ['/images/artists/zoia.ink/1.jpg'],
      ['images/artists/zoia.ink/1.jpg']
    )
    expect(merged).toEqual(['/images/artists/zoia.ink/1.jpg'])
  })

  it('still appends static images the cache does not have', () => {
    const merged = mergeStaticImages(
      ['/images/artists/zoia.ink/1.jpg'],
      ['images/artists/zoia.ink/1.jpg', 'images/artists/zoia.ink/2.jpg']
    )
    expect(merged).toEqual([
      '/images/artists/zoia.ink/1.jpg',
      'images/artists/zoia.ink/2.jpg',
    ])
  })

  it('leaves uploaded data-URLs in place', () => {
    const merged = mergeStaticImages(['data:image/png;base64,AAA'], ['images/artists/a/1.jpg'])
    expect(merged).toEqual(['data:image/png;base64,AAA', 'images/artists/a/1.jpg'])
  })
})

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

// Only the owner account carries DEFAULT_ARTISTS, so these specs sign in as the
// owner and mount the hook the way App.jsx does — behind the auth gate, after the
// session resolves. Rendering it bare would leave `user` null and the list empty.
describe('useArtistStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-owner@example.com', email: 'owner@example.com' } })
    )
  })

  // Mirrors ProtectedRoute: children render only once the session has resolved
  // and a user is present.
  const Gate = ({ children }) => {
    const { user, loading } = useAuth()
    return loading || !user ? null : children
  }
  const wrapper = ({ children }) =>
    createElement(AuthProvider, null, createElement(Gate, null, children))

  async function renderOwned() {
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())
    return result
  }

  it('initialises with DEFAULT_ARTISTS when storage is empty', async () => {
    const result = await renderOwned()
    expect(result.current[0]).toHaveLength(DEFAULT_ARTISTS.length)
  })

  it('returned artists have no tier field', async () => {
    const result = await renderOwned()
    expect(result.current[0].length).toBeGreaterThan(0)
    result.current[0].forEach((a) => expect(a).not.toHaveProperty('tier'))
  })

  it('never persists raw base64 image data to localStorage metadata', async () => {
    const result = await renderOwned()
    expect(result.current[0].length).toBeGreaterThan(0)

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

  // #28: dbPut/dbGetAll opened a fresh IndexedDB connection per call and never
  // closed it, which can block a later `indexedDB.deleteDatabase` (purge) from
  // ever completing.
  it('closes its IndexedDB connections after a write (does not block deletion)', async () => {
    const result = await renderOwned()
    await act(async () => {})

    await act(async () => {
      result.current[1]((prev) =>
        prev.map((a) => (a.id === DEFAULT_ARTISTS[0].id ? { ...a, images: ['data:image/jpeg;base64,closetest'] } : a))
      )
    })
    await act(async () => {})

    const req = indexedDB.deleteDatabase('tattoo-images-v1')
    const blocked = await new Promise((resolve) => {
      req.onsuccess = () => resolve(false)
      req.onerror = () => resolve(false)
      req.onblocked = () => resolve(true)
    })
    expect(blocked).toBe(false)
  })

  it('setArtists with a plain array works as well as a function', async () => {
    const result = await renderOwned()
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

    const result = await renderOwned()

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

  // #32 (react-hooks/exhaustive-deps flags the missing `user` on this effect's
  // `[]` deps). Deliberately mount-once: it does legacy-key migration and an
  // initial IndexedDB image load, and is safe to read `user` from because
  // ProtectedRoute holds a spinner until the session resolves (see the comment
  // above `useState(() => ...)` for `artists` in the hook). Naively satisfying
  // the lint suggestion by adding `user` would re-run migration/load on every
  // identity change — pinning the current, intended behaviour so a future
  // "fix" of the warning doesn't silently do that.
  //
  // The direct-A-to-B-swap gap this still doesn't cover (no committed null
  // in between, so the effect never even sees a fresh mount) is real and
  // already tracked separately in #28 — not something this test asserts.
  it('does not re-run the initial image-load effect on a user identity change with no intervening sign-out', async () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem')

    const { result } = renderHook(
      () => ({ storage: useArtistStorage(), auth: useAuth() }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.storage).toBeTruthy())
    await act(async () => {})

    const callsBefore = getItemSpy.mock.calls.filter(([k]) => k === 'tattoo_artists').length
    expect(callsBefore).toBe(1)

    // A direct A -> B swap, same shape as backend.auth.signIn while already
    // signed in: the local adapter sets a new session and emits, with no
    // intervening null.
    await act(async () => {
      await result.current.auth.signIn({ email: 'a-different-user@example.com' })
    })

    const callsAfter = getItemSpy.mock.calls.filter(([k]) => k === 'tattoo_artists').length
    expect(callsAfter).toBe(1)
  })
})
