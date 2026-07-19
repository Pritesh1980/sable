import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { backend } from '../backend'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

// A non-owner account keeps the scenarios free of DEFAULT_ARTISTS seeding.
function seedSession() {
  localStorage.setItem(
    'tattoo_local_session',
    JSON.stringify({ user: { id: 'local-artist@studio.com', email: 'artist@studio.com' } })
  )
}

const remoteArtist = (id, extra = {}) => ({
  id,
  handle: id,
  name: '',
  tags: [],
  images: [],
  notes: '',
  studio: null,
  rank: 1,
  status: 'researching',
  updatedAt: '2026-06-01T00:00:00Z',
  ...extra,
})

function renderSynced() {
  return renderHook(() => ({ auth: useAuth(), store: useArtistStorage() }), { wrapper })
}

// Artist-metadata twin of useStorageDirty.test.jsx (#31): the same dirty-state
// guarantees must hold for the separately-wired useArtistStorage sync path.
describe('useArtistStorage dirty-state handling', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('an edit that never synced survives a reload and wins over older remote data', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [remoteArtist('x')])
    const first = renderSynced()
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(1))

    const upsert = vi.spyOn(backend.store, 'upsert').mockRejectedValue(new Error('offline'))
    act(() =>
      first.result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'x' ? { ...a, status: 'shortlisted' } : a))
      )
    )
    await waitFor(() => expect(upsert).toHaveBeenCalled(), { timeout: 3000 })
    first.unmount()
    upsert.mockRestore()

    const second = renderSynced()
    await waitFor(() =>
      expect(second.result.current.store[0].find((a) => a.id === 'x')?.status).toBe('shortlisted')
    )
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.status).toBe('shortlisted')
    }, { timeout: 3000 })
  })

  it('a delete that never reached its flush still lands after reload', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [
      remoteArtist('keep'),
      remoteArtist('drop', { rank: 2 }),
    ])
    const first = renderSynced()
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(2))

    act(() => first.result.current.store[1]((prev) => prev.filter((a) => a.id !== 'drop')))
    first.unmount() // tab closes inside the debounce window

    const second = renderSynced()
    await waitFor(() =>
      expect(second.result.current.store[0].map((a) => a.id)).toEqual(['keep'])
    )
    await waitFor(async () => {
      expect((await backend.store.list('artistsMeta')).map((r) => r.id)).toEqual(['keep'])
    }, { timeout: 3000 })
  })

  it('the one-time migration push preserves stamps of unchanged artists', async () => {
    seedSession()
    // No MIGRATED_FLAG → the sync effect runs the migration and pushes after.
    await backend.store.upsert('artistsMeta', [
      remoteArtist('x', { updatedAt: '2026-06-05T00:00:00Z' }),
    ])
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(localStorage.getItem('tattoo_img_migrated_v1')).toBe('1'))

    // Nothing about x changed on this device, so its stamp must survive the
    // migration push — restamping would outrank genuine cross-device edits.
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.updatedAt).toBe('2026-06-05T00:00:00Z')
    }, { timeout: 3000 })
  })

  it('owner seeding persists the stamps it pushes to the remote', async () => {
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-owner@example.com', email: 'owner@example.com' } })
    )
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())
    await waitFor(async () => {
      expect((await backend.store.list('artistsMeta')).length).toBeGreaterThan(0)
    }, { timeout: 3000 })

    const remoteById = new Map(
      (await backend.store.list('artistsMeta')).map((r) => [r.id, r.updatedAt])
    )
    // The local cache must carry the SAME stamps the remote got — otherwise
    // every later flush restamps the untouched defaults with a fresh time and
    // can overwrite newer cross-device edits.
    await waitFor(() => {
      const cached = JSON.parse(localStorage.getItem('tattoo_artists_meta') || '[]')
      expect(cached.length).toBeGreaterThan(0)
      for (const a of cached) expect(a.updatedAt).toBe(remoteById.get(a.id))
    }, { timeout: 3000 })
  })

  it('re-adding an artist supersedes their pending delete (ids are handles)', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [remoteArtist('x')])
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    const remove = vi.spyOn(backend.store, 'remove').mockRejectedValueOnce(new Error('offline'))
    act(() => result.current.store[1]([]))
    await waitFor(() => expect(remove).toHaveBeenCalled(), { timeout: 3000 })

    // Re-adding the same handle before the delete lands must drop the stale
    // pending delete rather than let it destroy the recreated record.
    act(() => result.current.store[1]([{ ...remoteArtist('x'), status: 'shortlisted', images: [] }]))
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.status).toBe('shortlisted')
    }, { timeout: 3000 })
    expect(localStorage.getItem('tattoo_pending_delete_tattoo_artists_meta')).toBeNull()
  })

  it('a failed delete retries on reload instead of resurrecting the artist', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [
      remoteArtist('keep'),
      remoteArtist('drop', { rank: 2 }),
    ])
    const first = renderSynced()
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(2))

    const remove = vi.spyOn(backend.store, 'remove').mockRejectedValueOnce(new Error('offline'))
    act(() => first.result.current.store[1]((prev) => prev.filter((a) => a.id !== 'drop')))
    await waitFor(() => expect(remove).toHaveBeenCalled(), { timeout: 3000 })
    first.unmount()

    expect((await backend.store.list('artistsMeta')).map((r) => r.id)).toContain('drop')
    const second = renderSynced()
    await waitFor(() => expect(second.result.current.auth.user).toBeTruthy())
    await waitFor(() =>
      expect(second.result.current.store[0].map((a) => a.id)).toEqual(['keep'])
    )
    await waitFor(async () => {
      expect((await backend.store.list('artistsMeta')).map((r) => r.id)).toEqual(['keep'])
    }, { timeout: 3000 })
  })
})
