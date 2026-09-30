import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'

// Mock the SDK boundary only: exercise the real factory and auth adapter without
// ever constructing a network client or reading project credentials.
const { sdk, getClient } = vi.hoisted(() => {
  const sdk = { auth: {
    getSession: vi.fn(), refreshSession: vi.fn(), signInWithPassword: vi.fn(),
    signOut: vi.fn(), onAuthStateChange: vi.fn(),
  } }
  return { sdk, getClient: vi.fn(() => sdk) }
})
vi.mock('../backend/supabase/client', () => ({ getSupabaseClient: getClient }))

import { backend, createBackend } from '../backend'
import { createSupabaseAuth } from '../backend/supabase/supabaseAuth'
import { AuthContext } from '../context/auth-context'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { OWNER_EMAIL } from '../backend/owner'

const session = { user: { id: 'owner-sub', email: 'owner@example.com' }, access_token: 'test-token', refresh_token: 'refresh-secret' }
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  sdk.auth.getSession.mockResolvedValue({ data: { session }, error: null })
  sdk.auth.refreshSession.mockResolvedValue({ data: { session: { ...session, access_token: 'new-token' } }, error: null })
})
const originalCapabilities = backend.capabilities
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  backend.capabilities = originalCapabilities
})

describe('real-auth artist seed isolation', () => {
  const user = { id: 'owner-sub', email: OWNER_EMAIL }
  const wrapper = ({ children }) => createElement(AuthContext.Provider, { value: { user } }, children)
  beforeEach(() => {
    backend.capabilities = { offlineAuth: false, realAuth: true }
  })

  it('does not claim legacy artist data or add defaults when the current cache is absent', async () => {
    const legacy = JSON.stringify([{ id: 'legacy-private', handle: 'legacy-private', images: [] }])
    localStorage.setItem('tattoo_artists', legacy)
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
    // A supplied remote row marks completion of the real hook's async init/sync.
    let resolveRemote
    const list = vi.spyOn(backend.store, 'list').mockReturnValue(new Promise((resolve) => { resolveRemote = resolve }))
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    expect(result.current[0]).toEqual([])
    await waitFor(() => expect(list).toHaveBeenCalled())
    const legacyAfterInit = localStorage.getItem('tattoo_artists')
    await act(async () => { resolveRemote([{ id: 'own', handle: 'own', images: [], updatedAt: '2026-01-01T00:00:00Z' }]) })
    expect(legacyAfterInit).toBe(legacy)
    await waitFor(() => expect(result.current[0].map((a) => a.id)).toEqual(['own']))
    expect(localStorage.getItem('tattoo_artists')).toBe(legacy)
    expect(JSON.parse(localStorage.getItem('tattoo_artists_meta')).map((a) => a.id)).toEqual(['own'])
  })

  it.each([{ remote: [] }, { remote: [{ id: 'zoia.ink', handle: 'zoia.ink', images: [], updatedAt: '2026-01-01T00:00:00Z' }] }])(
    'does not add owner defaults during hydration or reconciliation of $remote', async ({ remote }) => {
      localStorage.setItem('tattoo_artists_meta', JSON.stringify([{ id: 'zoia.ink', handle: 'zoia.ink', images: [] }]))
      vi.spyOn(backend.store, 'list').mockResolvedValue(remote)
      const upsert = vi.spyOn(backend.store, 'upsert')
      const { result } = renderHook(() => useArtistStorage(), { wrapper })
      expect(result.current[0].map((a) => a.id)).toEqual(['zoia.ink'])
      await waitFor(() => expect(upsert).toHaveBeenCalled())
      expect(result.current[0].map((a) => a.id)).toEqual(['zoia.ink'])
      expect(result.current[0][0].images).toEqual([])
      expect(JSON.parse(localStorage.getItem('tattoo_artists_meta'))).toHaveLength(1)
    }
  )
})

describe('independent auth and storage', () => {
  it.each([
    ['local', 'local', true, false],
    ['local', 'supabase', false, true],
    ['supabase', 'supabase', false, true],
  ])('supports %s storage / %s auth', async (storage, authKind, offlineAuth, realAuth) => {
    const b = createBackend(storage, { authKind, ownerId: 'owner-sub' })
    expect(b.kind).toBe(storage)
    expect(b.capabilities).toEqual({ offlineAuth, realAuth })
    expect(b.privateOwnerId).toBe('owner-sub')
    expect(await b.auth.getAccessToken()).toBe(realAuth ? 'test-token' : null)
    if (offlineAuth) expect(getClient).not.toHaveBeenCalled()
  })

  it.each([
    ['supabase', 'local'], ['aws', 'local'], ['unknown', 'supabase'],
    ['local', 'aws'], ['local', 'unknown'],
  ])('rejects %s storage / %s auth before constructing adapters', (storage, authKind) => {
    expect(() => createBackend(storage, { authKind })).toThrow('Unsupported auth/storage combination')
    expect(getClient).not.toHaveBeenCalled()
  })

  it('defaults auth to storage unless an independent auth environment is set', () => {
    vi.stubEnv('VITE_AUTH_BACKEND', '')
    expect(createBackend('supabase').capabilities.realAuth).toBe(true)
    expect(createBackend('local').capabilities.offlineAuth).toBe(true)
    vi.stubEnv('VITE_AUTH_BACKEND', 'supabase')
    vi.stubEnv('VITE_PRIVATE_OWNER_ID', 'configured-sub')
    expect(createBackend('local')).toMatchObject({ kind: 'local', privateOwnerId: 'configured-sub', capabilities: { realAuth: true, offlineAuth: false } })
    expect(createBackend('local', { authKind: 'local', ownerId: '' }).privateOwnerId).toBe('')
  })
})

describe('Supabase token boundary', () => {
  it('uses the SDK session normally and refreshes only on explicit forceRefresh', async () => {
    const auth = createSupabaseAuth()
    expect(await auth.getAccessToken()).toBe('test-token')
    expect(sdk.auth.refreshSession).not.toHaveBeenCalled()
    expect(sdk.auth.getSession).toHaveBeenCalledTimes(1)
    expect(await auth.getAccessToken({ forceRefresh: true })).toBe('new-token')
    expect(sdk.auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(sdk.auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('returns null without a session in either token path', async () => {
    sdk.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    sdk.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null })
    const auth = createSupabaseAuth()
    expect(await auth.getAccessToken()).toBeNull()
    expect(await auth.getAccessToken({ forceRefresh: true })).toBeNull()
  })

  it.each(['getSession', 'getAccessToken', 'refresh'])('propagates SDK errors from %s', async (method) => {
    const error = new Error('SDK failure')
    sdk.auth.getSession.mockResolvedValue({ data: { session: null }, error })
    sdk.auth.refreshSession.mockResolvedValue({ data: { session: null }, error })
    const auth = createSupabaseAuth()
    await expect(method === 'refresh' ? auth.getAccessToken({ forceRefresh: true }) : auth[method]()).rejects.toThrow('SDK failure')
  })

  it('never exposes tokens through session, sign-in or auth events', async () => {
    let emit
    const unsubscribe = vi.fn()
    sdk.auth.signInWithPassword.mockResolvedValue({ data: { session, user: session.user }, error: null })
    sdk.auth.onAuthStateChange.mockImplementation((cb) => {
      emit = cb
      return { data: { subscription: { unsubscribe } } }
    })
    const auth = createSupabaseAuth()
    const uiSession = { user: { id: 'owner-sub', email: 'owner@example.com' } }
    expect(await auth.getSession()).toEqual(uiSession)
    expect(await auth.signIn({ email: 'owner@example.com', password: 'password' })).toEqual(uiSession)
    const events = []
    const stop = auth.onAuthStateChange((next) => events.push(next))
    emit('SIGNED_IN', session)
    emit('SIGNED_OUT', null)
    expect(events).toEqual([uiSession, null])
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
