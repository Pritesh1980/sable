import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { backend } from '../backend'
import { writeRowGenerations, hasDirtyRows, readRowGenerations } from '../backend/dirty'

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

  // #35, updated for #84's per-row redesign: a second tab's edit to a
  // *different* artist landing while this tab's flush is in flight must not
  // be marked synced by a flush that never actually pushed it. Under
  // per-row tracking this is structurally guaranteed — a tab can only ever
  // confirm rows it itself pushed with a matching editGen.
  it('an artist edit from another tab mid-flush is not marked synced by this flush', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [remoteArtist('x')])
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    const realUpsert = backend.store.upsert.bind(backend.store)
    const upsert = vi.spyOn(backend.store, 'upsert').mockImplementation(async (...args) => {
      // Simulate another tab's own edit to a *different* artist landing
      // while this tab's flush is in flight — exactly what setArtists in
      // that other tab would do.
      writeRowGenerations('tattoo_artists_meta', [{ id: 'other-artist', editGen: 'g-other' }])
      return realUpsert(...args)
    })

    act(() =>
      result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'x' ? { ...a, status: 'shortlisted' } : a))
      )
    )
    await waitFor(() => expect(upsert).toHaveBeenCalled(), { timeout: 3000 })
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.status).toBe('shortlisted')
    }, { timeout: 3000 })

    // This tab's own artist is confirmed, but the other tab's artist
    // (simulated above) never got its own push — must still read as dirty.
    expect(hasDirtyRows('tattoo_artists_meta')).toBe(true)
  })

  // #84: the residual gap #35's per-key generation didn't close. Another
  // tab's edit to a different artist already landed — durably tracked —
  // *before* this tab's own, unrelated flush even starts (not merely
  // "during" it). A per-key token would see its own snapshot already
  // reflecting that edit and wrongly conclude "nothing changed since I
  // started," clearing the whole key's dirty state including the still-
  // unpushed edit. Per-row tracking must not have this gap.
  it('an artist edit from another tab that already landed before this flush started stays dirty', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [remoteArtist('x')])
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    // Another tab's edit to a different artist, already durably tracked —
    // done and settled before this tab's own edit/flush cycle begins at all.
    writeRowGenerations('tattoo_artists_meta', [{ id: 'other-artist', editGen: 'g-other' }])
    expect(hasDirtyRows('tattoo_artists_meta')).toBe(true)

    act(() =>
      result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'x' ? { ...a, status: 'shortlisted' } : a))
      )
    )
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.status).toBe('shortlisted')
    }, { timeout: 3000 })

    // The other tab's artist was never pushed by this tab and must still
    // read as pending.
    expect(hasDirtyRows('tattoo_artists_meta')).toBe(true)
  })

  // #84: the basic, single-tab case a per-row redesign must not regress — a
  // normal edit that pushes successfully must actually clear its own
  // tracked generation, not just leave every artist's marker untouched.
  it('a successful push clears its own artist generation, so the collection reads clean', async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [remoteArtist('x')])
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    act(() =>
      result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'x' ? { ...a, status: 'shortlisted' } : a))
      )
    )
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.status).toBe('shortlisted')
    }, { timeout: 3000 })
    await waitFor(() => expect(hasDirtyRows('tattoo_artists_meta')).toBe(false))
  })

  // #84 cross-model review: an artist's `editGen` lives on the row itself and
  // is never cleared once confirmed — only the shared sidecar entry is. An
  // unrelated edit rebuilds the whole array and must not re-broadcast that
  // stale, already-confirmed value for an artist it didn't touch — doing so
  // clobbers a newer generation another tab wrote for that same artist.
  it("an unrelated edit does not rewrite another artist's tracked generation with its own stale value", async () => {
    seedSession()
    await backend.store.upsert('artistsMeta', [remoteArtist('y'), remoteArtist('x')])
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(2))

    // This tab edits and pushes artist 'y' itself; it gets confirmed, but
    // the row in state still carries that now-stale editGen forever.
    act(() =>
      result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'y' ? { ...a, status: 'shortlisted' } : a))
      )
    )
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'y')?.status).toBe('shortlisted')
    }, { timeout: 3000 })
    await waitFor(() => expect(hasDirtyRows('tattoo_artists_meta')).toBe(false))

    // Another tab now edits the same artist independently — its own
    // generation lands in the shared sidecar.
    writeRowGenerations('tattoo_artists_meta', [{ id: 'y', editGen: 'g-tabB' }])
    expect(readRowGenerations('tattoo_artists_meta').y).toBe('g-tabB')

    // This tab edits a different, unrelated artist — the updater rebuilds
    // the whole array, including the untouched 'y' row and its stale
    // editGen.
    act(() =>
      result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'x' ? { ...a, status: 'contacted' } : a))
      )
    )
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'x')?.status).toBe('contacted')
    }, { timeout: 3000 })

    // The other tab's tracked generation for 'y' must survive untouched.
    expect(readRowGenerations('tattoo_artists_meta').y).toBe('g-tabB')
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
