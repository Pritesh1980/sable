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
    await backend.store.upsert('artistsMeta', [
      { id: 'custom1', handle: 'their_artist', rank: 1, tags: [], updatedAt: '2026-06-01T00:00:00Z' },
    ])
    seedSession('artist@studio.com')

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))
    expect(result.current.store[0][0].id).toBe('custom1')
  })
})
