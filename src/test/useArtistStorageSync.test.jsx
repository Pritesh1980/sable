import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { DEFAULT_ARTISTS } from '../data/artists'
import { backend } from '../backend'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

function seedSession(email) {
  localStorage.setItem(
    'tattoo_local_session',
    JSON.stringify({ user: { id: `local-${email}`, email } })
  )
}

function renderSynced() {
  return renderHook(() => ({ auth: useAuth(), store: useArtistStorage() }), { wrapper })
}

describe('useArtistStorage owner seeding + sync', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('seeds DEFAULT_ARTISTS into the owner remote when it is empty', async () => {
    seedSession('owner@example.com')
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows).toHaveLength(DEFAULT_ARTISTS.length)
    })
    expect(result.current.store[0]).toHaveLength(DEFAULT_ARTISTS.length)
  })

  it('gives a non-owner an empty list when their remote is empty', async () => {
    seedSession('artist@studio.com')
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())
    await waitFor(() => expect(result.current.store[0]).toHaveLength(0))

    const rows = await backend.store.list('artistsMeta')
    expect(rows).toHaveLength(0)
  })

  it('migrates the owner local edits up rather than re-seeding flat defaults', async () => {
    // Local cache holds an edit to the first default artist.
    localStorage.setItem(
      'tattoo_artists_meta',
      JSON.stringify([{ ...DEFAULT_ARTISTS[0], notes: 'my private note' }])
    )
    seedSession('owner@example.com')

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows).toHaveLength(DEFAULT_ARTISTS.length)
    })
    const rows = await backend.store.list('artistsMeta')
    expect(rows.find((r) => r.id === DEFAULT_ARTISTS[0].id).notes).toBe('my private note')
  })

  it('hydrates a non-owner from their own remote rows (no default seeding)', async () => {
    // The remote row must be written under the same signed-in identity that
    // will later read it back (#28 namespaces the local backend's simulated
    // remote per user, matching how Supabase's RLS already scopes writes).
    seedSession('artist@studio.com')
    await backend.store.upsert('artistsMeta', [
      { id: 'custom1', handle: 'their_artist', rank: 1, tags: [], updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))
    expect(result.current.store[0][0].id).toBe('custom1')
  })
})

// The first painted list must already equal what the sync effect will settle on.
// Any divergence is visible as a flash of the wrong artists (issue #25): on the
// public demo the curated real handles appeared as monograms with 404ing images
// before the demo dataset replaced them.
//
// These mount the hook the way App.jsx does — behind the ProtectedRoute gate, so
// the session is resolved before the hook's first render. Mounting it ungated
// (as the specs above do) would paint with user === null and prove nothing about
// what the app actually shows.
describe('useArtistStorage first paint (no flash of curated defaults)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Mirrors ProtectedRoute exactly: it renders children only when the session has
  // resolved AND a user is present. Gating on `loading` alone would let the hook
  // mount with user === null — a state production never renders, in which the
  // non-owner specs below would pass for the wrong reason.
  function Gate({ children }) {
    const { user, loading } = useAuth()
    return loading || !user ? null : children
  }
  const gatedWrapper = ({ children }) => (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  )

  // Returns the hook's FIRST rendered list. A flash exists only transiently, so
  // sampling `result.current` after a waitFor would read the settled state and
  // pass even when the flash is present — every render has to be recorded and
  // the first one asserted on.
  async function renderFirstPaint() {
    const paints = []
    renderHook(
      () => {
        const store = useArtistStorage()
        paints.push(store[0])
        return store
      },
      { wrapper: gatedWrapper }
    )
    await waitFor(() => expect(paints.length).toBeGreaterThan(0))
    return paints[0]
  }

  const DEMO_CACHE = [
    { id: 'mora.blackfern', handle: 'mora.blackfern', rank: 1, tags: [], updatedAt: '2026-07-01T00:00:00Z' },
  ]

  it('paints a demo cache without appending the curated defaults', async () => {
    localStorage.setItem('tattoo_artists_meta', JSON.stringify(DEMO_CACHE))
    seedSession('demo@example.com')

    const painted = await renderFirstPaint()

    expect(painted).toHaveLength(1)
    expect(painted[0].id).toBe('mora.blackfern')
    const curatedIds = new Set(DEFAULT_ARTISTS.map((a) => a.id))
    expect(painted.filter((a) => curatedIds.has(a.id))).toHaveLength(0)
  })

  it('paints nothing for a non-owner with no cache', async () => {
    seedSession('artist@studio.com')

    expect(await renderFirstPaint()).toHaveLength(0)
  })

  it('still paints the curated defaults for the owner with no cache', async () => {
    seedSession('owner@example.com')

    expect(await renderFirstPaint()).toHaveLength(DEFAULT_ARTISTS.length)
  })

  it('still folds defaults into a partial owner cache on paint', async () => {
    localStorage.setItem(
      'tattoo_artists_meta',
      JSON.stringify([{ ...DEFAULT_ARTISTS[0], notes: 'kept' }])
    )
    seedSession('owner@example.com')

    const painted = await renderFirstPaint()

    expect(painted).toHaveLength(DEFAULT_ARTISTS.length)
    expect(painted.find((a) => a.id === DEFAULT_ARTISTS[0].id).notes).toBe('kept')
  })
})
