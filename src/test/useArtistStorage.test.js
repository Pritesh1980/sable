import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { applyDefaults } from '../data/artistsPolicy'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'

// ── Pure function tests ───────────────────────────────────────────────────────

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

  // Resolves once the session is up and the hook has mounted.
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

    await act(async () => {})

    await act(async () => {
      result.current[1]((prev) =>
        prev.map((a) => (a.id === DEFAULT_ARTISTS[0].id ? { ...a, images: ['data:image/jpeg;base64,abc123'] } : a))
      )
    })

    // Metadata may carry small canonical refs ({ key } / static paths) but never
    // inline base64 data-URLs.
    const raw = localStorage.getItem('tattoo_artists_meta')
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('data:image')
    expect(raw).not.toContain('base64')
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
})
