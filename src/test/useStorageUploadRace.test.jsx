import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useStorage } from '../hooks/useStorage'
import { backend } from '../backend'
import { readPendingDeletes } from '../backend/dirty'

// #86 — a flush snapshots the value, then awaits the codec's image upload
// (can be slow). Anything the user did during that wait must not be undone by
// the rest of the flush working from the stale snapshot: not the delete's
// tombstone, not the remote, not the local cache.

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

function seedSession() {
  localStorage.setItem(
    'tattoo_local_session',
    JSON.stringify({ user: { id: 'local-owner@example.com', email: 'owner@example.com' } })
  )
}

// Upload gate: while armed, ensureUploaded parks until released. `rounds`
// gates that many consecutive calls (one per re-snapshot round).
let gate = null
function armGate(rounds = 1) {
  let release
  const promise = new Promise((r) => { release = r })
  gate = { promise, release, entered: 0, rounds }
  return gate
}
const SLOW_CODEC = {
  toCanonical: (v) => v,
  toDisplay: async (v) => v,
  ensureUploaded: async () => {
    const g = gate
    if (!g) return 0
    g.entered += 1
    if (g.entered >= g.rounds) gate = null
    await g.promise
    return 0
  },
}

function renderSynced() {
  return renderHook(
    () => ({ auth: useAuth(), store: useStorage('tattoo_ideas', [], SLOW_CODEC) }),
    { wrapper }
  )
}

async function mountSyncedWith(rows) {
  seedSession()
  await backend.store.upsert('ideas', rows)
  const view = renderSynced()
  await waitFor(() => expect(view.result.current.store[0].map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort()))
  return view
}

const remoteIds = async () => (await backend.store.list('ideas')).map((r) => r.id).sort()
const cachedIds = () => JSON.parse(localStorage.getItem('tattoo_ideas') || '[]').map((r) => r.id).sort()

describe('a flush whose upload is in flight (#86)', () => {
  beforeEach(() => { localStorage.clear(); gate = null })
  afterEach(() => vi.restoreAllMocks())

  it('does not resurrect a row deleted during the upload, even if the tab closes before the next flush', async () => {
    const { result, unmount } = await mountSyncedWith([
      { id: 'a', title: 'Dragon', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'y', title: 'Moth', updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const g = armGate()
    act(() => result.current.store[1]((prev) => prev.map((r) => (r.id === 'a' ? { ...r, title: 'Dragon v2' } : r))))
    await waitFor(() => expect(g.entered).toBe(1), { timeout: 3000 })

    // Delete y while that flush is parked in the upload, then "close the tab"
    // before the delete's own debounced flush can run.
    act(() => result.current.store[1]((prev) => prev.filter((r) => r.id !== 'y')))
    unmount()

    await act(async () => { g.release(); await new Promise((r) => setTimeout(r, 50)) })

    expect(await remoteIds()).toEqual(['a'])
    expect(cachedIds()).toEqual(['a'])
    // Either the delete landed (tombstone cleared) or it is still pending —
    // never a cleared tombstone with the row still alive.
    const pending = readPendingDeletes('tattoo_ideas')
    if (!pending.includes('y')) expect(await remoteIds()).not.toContain('y')
  })

  it('does not overwrite the local cache with an edit made during the upload', async () => {
    const { result, unmount } = await mountSyncedWith([
      { id: 'a', title: 'Dragon', updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const g = armGate()
    act(() => result.current.store[1]([{ id: 'a', title: 'first' }]))
    await waitFor(() => expect(g.entered).toBe(1), { timeout: 3000 })
    act(() => result.current.store[1]([{ id: 'a', title: 'second' }]))
    unmount()

    await act(async () => { g.release(); await new Promise((r) => setTimeout(r, 50)) })

    const cached = JSON.parse(localStorage.getItem('tattoo_ideas'))
    expect(cached.find((r) => r.id === 'a').title).toBe('second')
  })

  // codex review: a real tab close kills the parked flush, so recovery must
  // come from what the edit made durable (cache + tombstone), on the next load.
  it('recovers on the next load when the tab dies with the upload still parked', async () => {
    const first = await mountSyncedWith([
      { id: 'a', title: 'Dragon', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'y', title: 'Moth', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    armGate()
    act(() => first.result.current.store[1]((prev) => prev.map((r) => (r.id === 'a' ? { ...r, title: 'Dragon v2' } : r))))
    await waitFor(() => expect(gate === null).toBe(true), { timeout: 3000 })
    act(() => first.result.current.store[1]((prev) => prev.filter((r) => r.id !== 'y')))
    first.unmount() // never released: this flush never resumes

    const second = renderSynced()
    await waitFor(async () => expect(await remoteIds()).toEqual(['a']), { timeout: 3000 })
    expect(second.result.current.store[0].map((r) => r.id)).toEqual(['a'])
    second.unmount()
  })

  it('stands down if the value keeps changing through every upload round, and never pushes a stale one', async () => {
    const { result } = await mountSyncedWith([
      { id: 'a', title: 'v0', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    const pushed = []
    const realUpsert = backend.store.upsert.bind(backend.store)
    vi.spyOn(backend.store, 'upsert').mockImplementation(async (col, rows) => {
      pushed.push(rows.find((r) => r.id === 'a')?.title)
      return realUpsert(col, rows)
    })
    // One gate per upload round, each released only after a fresh edit.
    const rounds = [armGate(), null, null]
    act(() => result.current.store[1]([{ id: 'a', title: 'v1' }]))
    for (let i = 0; i < 3; i += 1) {
      await waitFor(() => expect(rounds[i].entered).toBe(1), { timeout: 3000 })
      if (i < 2) rounds[i + 1] = armGate()
      act(() => result.current.store[1]([{ id: 'a', title: `v${i + 2}` }]))
      await act(async () => { rounds[i].release(); await new Promise((r) => setTimeout(r, 0)) })
    }
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.find((r) => r.id === 'a').title).toBe('v4')
    }, { timeout: 3000 })
    expect(pushed.every((t) => t === 'v4')).toBe(true)
  })

  // codex review: the mount-time pull read tombstones before awaiting the
  // remote list, so a delete made during the pull rode back in on it.
  it('a delete made while the initial pull is in flight is not undone by it', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'a', title: 'Dragon', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'y', title: 'Moth', updatedAt: '2026-06-01T00:00:00Z' },
    ])
    localStorage.setItem('tattoo_ideas', JSON.stringify([
      { id: 'a', title: 'Dragon', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'y', title: 'Moth', updatedAt: '2026-06-01T00:00:00Z' },
    ]))
    const realList = backend.store.list.bind(backend.store)
    let releaseList
    const listGate = new Promise((r) => { releaseList = r })
    vi.spyOn(backend.store, 'list').mockImplementationOnce(async (...args) => {
      const rows = await realList(...args)
      await listGate
      return rows
    })
    const { result } = renderSynced()
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())
    act(() => result.current.store[1]((prev) => prev.filter((r) => r.id !== 'y')))
    await act(async () => { releaseList(); await new Promise((r) => setTimeout(r, 50)) })

    expect(result.current.store[0].map((r) => r.id)).toEqual(['a'])
    await waitFor(async () => expect(await remoteIds()).toEqual(['a']), { timeout: 3000 })
  })
})
