import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useStorage } from '../hooks/useStorage'
import { backend } from '../backend'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

// Pre-seed a local session so getSession() resolves authenticated on mount.
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

describe('useStorage sync', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('without auth, behaves as a plain localStorage hook (no remote writes)', async () => {
    const { result } = renderHook(() => useStorage('tattoo_ideas', []))
    act(() => result.current[1]([{ id: 'x', title: 'local only' }]))
    expect(JSON.parse(localStorage.getItem('tattoo_ideas'))).toEqual([{ id: 'x', title: 'local only' }])
    expect(localStorage.getItem('tattoo_remote_ideas')).toBeNull()
  })

  it('pushes a user edit to the remote store when authed', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    act(() => result.current.store[1]([{ id: 'i1', title: 'Dragon' }]))

    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.some((r) => r.id === 'i1')).toBe(true)
    })
    const rows = await backend.store.list('ideas')
    expect(rows.find((r) => r.id === 'i1').updatedAt).toBeTruthy()
  })

  it('hydrates from remote on mount (cross-device)', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'remote1', title: 'From the cloud', updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() =>
      expect(result.current.store[0].find((r) => r.id === 'remote1')).toBeTruthy()
    )
  })

  it('propagates deletions to the remote store', async () => {
    seedSession()
    await backend.store.upsert('ideas', [
      { id: 'a', title: 'keep', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'b', title: 'drop', updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const { result } = renderSynced('tattoo_ideas', [])
    await waitFor(() => expect(result.current.store[0]).toHaveLength(2))

    act(() => result.current.store[1]((prev) => prev.filter((r) => r.id !== 'b')))

    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows.map((r) => r.id)).toEqual(['a'])
    })
  })

  it('syncs the singleton conventionOverrides map as one document', async () => {
    seedSession()
    const { result } = renderSynced('tattoo_convention_attending', {})
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    act(() => result.current.store[1]({ 'conv-9': true }))

    await waitFor(async () => {
      const rows = await backend.store.list('conventionOverrides')
      expect(rows[0]?.data).toEqual({ 'conv-9': true })
    })
  })
})
