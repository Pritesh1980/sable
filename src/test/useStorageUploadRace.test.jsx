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

// Upload gate: while armed, ensureUploaded parks until released.
let gate = null
function armGate() {
  let release
  const promise = new Promise((r) => { release = r })
  gate = { promise, release, entered: false }
  return gate
}
const SLOW_CODEC = {
  toCanonical: (v) => v,
  toDisplay: async (v) => v,
  ensureUploaded: async () => {
    const g = gate
    if (!g) return 0
    g.entered = true
    gate = null
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
    await waitFor(() => expect(g.entered).toBe(true), { timeout: 3000 })

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
    await waitFor(() => expect(g.entered).toBe(true), { timeout: 3000 })
    act(() => result.current.store[1]([{ id: 'a', title: 'second' }]))
    unmount()

    await act(async () => { g.release(); await new Promise((r) => setTimeout(r, 50)) })

    const cached = JSON.parse(localStorage.getItem('tattoo_ideas'))
    expect(cached.find((r) => r.id === 'a').title).toBe('second')
  })
})
