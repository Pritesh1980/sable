import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useStorage } from '../hooks/useStorage'
import { backend } from '../backend'
import { writeRowGenerations, hasDirtyRows } from '../backend/dirty'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

function seedSession() {
  localStorage.setItem(
    'tattoo_local_session',
    JSON.stringify({ user: { id: 'local-owner@example.com', email: 'owner@example.com' } })
  )
}

function renderSynced(key, def) {
  return renderHook(
    () => ({ auth: useAuth(), store: useStorage(key, def) }),
    { wrapper }
  )
}

// Failure-mode coverage for the dirty-state handling (#31): failed remote
// writes must stay visibly unsynced — retried on a later flush or reload —
// and never let stale remote rows overwrite or resurrect local edits.
describe('useStorage dirty-state handling', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('a failed upsert is not treated as synced: a later flush retries it', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    const upsert = vi.spyOn(backend.store, 'upsert').mockRejectedValueOnce(new Error('offline'))
    act(() => result.current.store[1]([{ id: 'i1', title: 'Dragon' }]))
    await waitFor(() => expect(upsert).toHaveBeenCalled(), { timeout: 3000 })
    expect(await backend.store.list('ideas')).toHaveLength(0)

    // Second edit → second flush; the remote write now succeeds and carries
    // the full state including the previously failed row.
    act(() => result.current.store[1]((prev) => [...prev, { id: 'i2', title: 'Moth' }]))
    await waitFor(async () => {
      const ids = (await backend.store.list('ideas')).map((r) => r.id).sort()
      expect(ids).toEqual(['i1', 'i2'])
    }, { timeout: 3000 })
  })

  // #84: the basic, single-tab case a per-row redesign must not regress —
  // a normal edit that pushes successfully must actually clear its own
  // tracked generation, not just leave every row's marker untouched.
  it('a successful push clears its own row generation, so the collection reads clean', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    act(() => result.current.store[1]([{ id: 'a', title: 'Dragon' }]))
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('Dragon')
    }, { timeout: 3000 })
    await waitFor(() => expect(hasDirtyRows('tattoo_ideas')).toBe(false))
  })

  it('an edit that never synced survives a reload and wins over older remote data', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'a', title: 'old title', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    const first = renderSynced('tattoo_ideas', [])
    await waitFor(() =>
      expect(first.result.current.store[0].find((r) => r.id === 'a')?.title).toBe('old title')
    )

    const upsert = vi.spyOn(backend.store, 'upsert').mockRejectedValue(new Error('offline'))
    act(() =>
      first.result.current.store[1]((prev) =>
        prev.map((r) => (r.id === 'a' ? { ...r, title: 'edited offline' } : r))
      )
    )
    await waitFor(() => expect(upsert).toHaveBeenCalled(), { timeout: 3000 })
    first.unmount()
    upsert.mockRestore()

    // "Reload": a fresh mount pulls the older remote row. The offline edit was
    // stamped when it was made, so it must win the reconcile and then be
    // pushed up without any further user action.
    const second = renderSynced('tattoo_ideas', [])
    await waitFor(() =>
      expect(second.result.current.store[0].find((r) => r.id === 'a')?.title).toBe('edited offline')
    )
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('edited offline')
    }, { timeout: 3000 })
  })

  it('a delete that never reached its flush still lands after reload', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'keep', title: 'keep', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'drop', title: 'drop', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    const first = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(2))

    // Delete, then close the tab inside the 500ms debounce window — the
    // tombstone must already be durable or the row resurrects on next pull.
    act(() => first.result.current.store[1]((prev) => prev.filter((r) => r.id !== 'drop')))
    first.unmount()
    expect((await backend.store.list('ideas')).map((r) => r.id)).toContain('drop')

    const second = renderSynced('tattoo_ideas', [])
    await waitFor(() =>
      expect(second.result.current.store[0].map((r) => r.id)).toEqual(['keep'])
    )
    await waitFor(async () => {
      expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['keep'])
    }, { timeout: 3000 })
  })

  it('overlapping flushes cannot land out of order (stale state must not win)', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    // First upsert is slow (in-flight network write); later ones are instant.
    const realUpsert = backend.store.upsert.bind(backend.store)
    let call = 0
    const upsert = vi.spyOn(backend.store, 'upsert').mockImplementation(async (...args) => {
      call += 1
      if (call === 1) await new Promise((r) => setTimeout(r, 1200))
      return realUpsert(...args)
    })

    act(() => result.current.store[1]([{ id: 'a', title: 'first' }]))
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1), { timeout: 3000 })
    act(() => result.current.store[1]([{ id: 'a', title: 'second' }]))

    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('second')
    }, { timeout: 5000 })
    // Let every in-flight write settle — the slow first write must not have
    // landed last and regressed the remote to the stale state.
    await new Promise((r) => setTimeout(r, 1600))
    const rows = await backend.store.list('ideas')
    expect(rows.find((r) => r.id === 'a')?.title).toBe('second')
  })

  it('a singleton flush carries its own edit stamp, not a later shared one', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_convention_attending', {})
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    act(() => result.current.store[1]({ 'conv-1': true }))
    // Another tab advances the shared stamp before this tab's flush runs; the
    // flush must not launder its stale map under the newer stamp.
    localStorage.setItem('tattoo_stamp_tattoo_convention_attending', '2027-01-01T00:00:00.000Z')
    await waitFor(async () => {
      const rows = await backend.store.list('conventionOverrides')
      expect(rows[0]?.data).toEqual({ 'conv-1': true })
    }, { timeout: 3000 })
    const rows = await backend.store.list('conventionOverrides')
    expect(rows[0].updatedAt).not.toBe('2027-01-01T00:00:00.000Z')
  })

  // #35, updated for #84's per-row redesign: a second tab's edit to a
  // *different* row landing while this tab's flush is in flight must not be
  // marked synced by a flush that never actually pushed it. Under per-row
  // tracking this is now structurally guaranteed — this tab can only ever
  // confirm rows it itself pushed with a matching editGen — but the
  // regression coverage is worth keeping: it's the same user-visible
  // guarantee #35 shipped, now via a different mechanism.
  it('a list edit from another tab mid-flush is not marked synced by this flush', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    const realUpsert = backend.store.upsert.bind(backend.store)
    const upsert = vi.spyOn(backend.store, 'upsert').mockImplementation(async (...args) => {
      // Simulate another tab's hook instance stamping and tracking its own
      // edit to a *different* row while this tab's flush is in flight —
      // exactly what setValueAndSync in that other tab would do.
      writeRowGenerations('tattoo_ideas', [{ id: 'other-row', editGen: 'g-other' }])
      return realUpsert(...args)
    })

    act(() => result.current.store[1]([{ id: 'a', title: 'from this tab' }]))
    await waitFor(() => expect(upsert).toHaveBeenCalled(), { timeout: 3000 })
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('from this tab')
    }, { timeout: 3000 })

    // This tab's write landed and its own row is confirmed, but the other
    // tab's row (simulated above) never got its own push — the collection
    // must still read as dirty so a later flush or reload retries it.
    expect(hasDirtyRows('tattoo_ideas')).toBe(true)
  })

  // #84: the residual gap #35's per-key generation didn't close. Tab B's
  // edit to a *different* row already landed — durably tracked — *before*
  // this tab's own, unrelated flush even starts (not merely "during" it, the
  // #35 scenario above). A per-key token would see its own snapshot already
  // reflecting B's generation and wrongly conclude "nothing changed since I
  // started," clearing the whole key's dirty state including B's still-
  // unpushed edit. Per-row tracking must not have this gap: this tab's own
  // successful push must never affect a row it never touched.
  it('an edit from another tab that already landed before this flush started stays dirty', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    // Tab B's edit to a different row, already durably tracked — done and
    // settled before this tab's own edit/flush cycle begins at all.
    writeRowGenerations('tattoo_ideas', [{ id: 'other-row', editGen: 'g-other' }])
    expect(hasDirtyRows('tattoo_ideas')).toBe(true)

    // This tab's own, entirely unrelated edit — flushes and succeeds.
    act(() => result.current.store[1]([{ id: 'a', title: 'my own edit' }]))
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('my own edit')
    }, { timeout: 3000 })

    // Tab B's row was never pushed by this tab and must still read as
    // pending — this tab had no business confirming a row it never edited.
    expect(hasDirtyRows('tattoo_ideas')).toBe(true)
  })

  it('re-adding a row supersedes its pending delete (the delete must not win)', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'a', title: 'original', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    const remove = vi.spyOn(backend.store, 'remove').mockRejectedValueOnce(new Error('offline'))
    act(() => result.current.store[1]([]))
    await waitFor(() => expect(remove).toHaveBeenCalled(), { timeout: 3000 })

    // The user recreates the same id before the delete ever lands. The stale
    // pending delete must be dropped, not fired alongside the upsert where it
    // could destroy the recreated row.
    act(() => result.current.store[1]([{ id: 'a', title: 'recreated' }]))
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('recreated')
    }, { timeout: 3000 })
    expect(localStorage.getItem('tattoo_pending_delete_tattoo_ideas')).toBeNull()
  })

  it('on reload, a pending delete for a locally re-added row is superseded', async () => {
    seedSession()
    // Crash-recovery state: the row was deleted (pending), then re-added
    // offline with a newer stamp; the app died before any push succeeded.
    // The row carries the editGen stampChangedRows would have stamped at
    // that edit, matching the token tracked in the rowgen sidecar (#84) —
    // otherwise the flush would push it but never recognize it as confirmed.
    localStorage.setItem('tattoo_ideas', JSON.stringify([
      { id: 'a', title: 'recreated offline', updatedAt: '2026-07-19T09:00:00Z', editGen: 'crash-recovery-gen' },
    ]))
    localStorage.setItem('tattoo_pending_delete_tattoo_ideas', JSON.stringify(['a']))
    // List collections track dirty per row (#84), not via the old per-key
    // flag — the crash-recovery signal is a tracked generation for the row.
    writeRowGenerations('tattoo_ideas', [{ id: 'a', editGen: 'crash-recovery-gen' }])
    await backend.store.upsert('ideas', [
      { id: 'a', title: 'original', updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() =>
      expect(result.current.store[0].find((r) => r.id === 'a')?.title).toBe('recreated offline')
    )
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a')?.title).toBe('recreated offline')
    }, { timeout: 3000 })
    expect(localStorage.getItem('tattoo_pending_delete_tattoo_ideas')).toBeNull()
  })

  it('a failed delete retries on reload instead of resurrecting the row', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'keep', title: 'keep', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'drop', title: 'drop', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    const first = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(2))

    const remove = vi.spyOn(backend.store, 'remove').mockRejectedValueOnce(new Error('offline'))
    act(() => first.result.current.store[1]((prev) => prev.filter((r) => r.id !== 'drop')))
    await waitFor(() => expect(remove).toHaveBeenCalled(), { timeout: 3000 })
    first.unmount()

    // The remote still holds the row; a fresh mount must not resurrect it
    // locally, and must retry the remove until the remote agrees.
    expect((await backend.store.list('ideas')).map((r) => r.id)).toContain('drop')
    const second = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(second.result.current.auth.user).toBeTruthy())
    await waitFor(() =>
      expect(second.result.current.store[0].map((r) => r.id)).toEqual(['keep'])
    )
    await waitFor(async () => {
      expect((await backend.store.list('ideas')).map((r) => r.id)).toEqual(['keep'])
    }, { timeout: 3000 })
  })
})
