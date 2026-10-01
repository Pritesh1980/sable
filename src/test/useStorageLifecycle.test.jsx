import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, renderHook, act, waitFor, screen } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import ProtectedRoute from '../components/ProtectedRoute'
import { useStorage } from '../hooks/useStorage'
import { createCollectionStore } from '../sync/collectionStore'
import { useCollection } from '../sync/useCollection'
import { backend } from '../backend'
import { readPendingDeletes, writeRowGenerations, hasDirtyRows } from '../backend/dirty'

// What the existing useStorage suites cannot see (#111): they mount with
// renderHook and no StrictMode, so they never exercise the dev double mount,
// and their assertions run after React has committed, so they cannot tell an
// edit-time cache write from a post-render one.

const USER = { id: 'local-owner@example.com', email: 'owner@example.com' }
const OLD = '2020-01-01T00:00:00.000Z'

function seedSession() {
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: USER }))
}

describe('useCollection', () => {
  beforeEach(() => localStorage.clear())

  it('renders the store value, re-renders on a change, and keeps one setter', () => {
    const store = createCollectionStore({ key: 'tattoo_convention_lineups', defaultValue: {} })
    const { result } = renderHook(() => useCollection(store))
    const [initial, setter] = result.current
    expect(initial).toEqual({})

    act(() => setter({ show: { entries: [] } }))
    expect(result.current[0]).toEqual({ show: { entries: [] } })
    expect(result.current[1]).toBe(setter)
  })
})

describe('useStorage on the collection store', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('writes the offline cache inside the setter call, before React renders', () => {
    const { result } = renderHook(() => useStorage('tattoo_boards', []))
    let cachedDuringCall
    act(() => {
      result.current[1]([{ id: 'b1', name: 'Sleeve' }])
      cachedDuringCall = JSON.parse(localStorage.getItem('tattoo_boards'))
    })
    expect(cachedDuringCall).toMatchObject([{ id: 'b1', name: 'Sleeve' }])
  })

  it('keeps one setter for the life of the component, across sign-in', async () => {
    seedSession()
    const { result } = renderHook(
      () => ({ auth: useAuth(), store: useStorage('tattoo_ideas', []) }),
      { wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider> }
    )
    const before = result.current.store[1]
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())
    expect(result.current.store[1]).toBe(before)
  })

  // AppShell mounts behind ProtectedRoute with the user already known, so in
  // development StrictMode mounts it, unmounts it and mounts it again. Only
  // one pull may run: one list, one retried delete, one push.
  it('pulls once when StrictMode mounts, unmounts and remounts it', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'keep', title: 'old', updatedAt: OLD },
      { id: 'drop', title: 'deleted offline', updatedAt: OLD },
    ])
    // Crash-recovery state: an edit that never synced, and a delete that never landed.
    localStorage.setItem('tattoo_ideas', JSON.stringify([
      { id: 'keep', title: 'edited offline', updatedAt: '2020-02-01T00:00:00.000Z', editGen: 'g1' },
    ]))
    writeRowGenerations('tattoo_ideas', [{ id: 'keep', editGen: 'g1' }])
    localStorage.setItem('tattoo_pending_delete_tattoo_ideas', JSON.stringify(['drop']))

    // Bound before spying, so the test's own reads are not counted as pulls.
    const remoteRows = backend.store.list.bind(backend.store)
    const list = vi.spyOn(backend.store, 'list')
    const remove = vi.spyOn(backend.store, 'remove')
    const upsert = vi.spyOn(backend.store, 'upsert')

    function Ideas() {
      const [ideas] = useStorage('tattoo_ideas', [])
      return <ul>{ideas.map((i) => <li key={i.id}>{i.title}</li>)}</ul>
    }
    render(
      <StrictMode>
        <AuthProvider>
          <ProtectedRoute>
            <Ideas />
          </ProtectedRoute>
        </AuthProvider>
      </StrictMode>
    )

    await screen.findByText('edited offline')
    await waitFor(async () => {
      const rows = await remoteRows('ideas')
      expect(rows.map((r) => [r.id, r.title])).toEqual([['keep', 'edited offline']])
    }, { timeout: 3000 })
    await waitFor(() => expect(hasDirtyRows('tattoo_ideas')).toBe(false))
    expect(readPendingDeletes('tattoo_ideas')).toEqual([])
    // Long enough for a second, late pull to show itself if there were one.
    await act(() => new Promise((r) => setTimeout(r, 100)))

    expect(list.mock.calls.filter(([collection]) => collection === 'ideas')).toHaveLength(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})
