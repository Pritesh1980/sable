import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { createOwnerScope } from '../backend/ownerScope'
import { backend, createBackend } from '../backend'
import { createLocalStore } from '../backend/local/localStore'
import { createLocalBlobs } from '../backend/local/localBlobs'
import { clearBlobUrls, getCachedBlobUrl, keyForUrl, registerBlobUrl, resolveBlobKey } from '../data/blobUrls'

// Keep real factory/storage behavior without constructing a network client.
vi.mock('../backend/supabase/client', () => ({ getSupabaseClient: () => ({ auth: {} }) }))

function privateStorage() {
  let owner = 'A'
  const ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => owner })
  return {
    ownerScope,
    store: createLocalStore({ ownerScope, allowLegacy: false }),
    blobs: createLocalBlobs({ ownerScope, allowLegacy: false }),
    change(next) { owner = next; ownerScope.invalidate() },
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => { localStorage.clear(); clearBlobUrls() })
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete backend.blobs.urlTtlMs
  clearBlobUrls()
})

describe('private local ownership', () => {
  it('never claims legacy, anonymous, or simulated-session rows', async () => {
    const legacy = '[{"id":"legacy"}]'
    localStorage.setItem('tattoo_remote_concepts', legacy)
    localStorage.setItem('tattoo_remote_anon_concepts', '[{"id":"anonymous"}]')
    localStorage.setItem('tattoo_local_session', '{"user":{"id":"simulated"}}')
    const { store, change } = privateStorage()
    expect(await store.list('concepts')).toEqual([])
    await store.upsert('concepts', [{ id: 'a' }])
    change('B')
    expect(await store.list('concepts')).toEqual([])
    await store.upsert('concepts', [{ id: 'b' }])
    change('A')
    expect(await store.list('concepts')).toEqual([{ id: 'a' }])
    change(null)
    await expect(store.list('concepts')).rejects.toMatchObject({ code: 'owner_changed' })
    expect(localStorage.getItem('tattoo_remote_concepts')).toBe(legacy)
    expect(localStorage.getItem('tattoo_remote_simulated_concepts')).toBeNull()
  })

  it('uses the real backend identity bridge, initially closed and invalidated across A→B→A', async () => {
    localStorage.setItem('tattoo_local_session', '{"user":{"id":"A"}}')
    const b = createBackend('local', { authKind: 'supabase', ownerId: 'A' })
    await expect(b.store.list('concepts')).rejects.toMatchObject({ code: 'owner_changed' })
    b.setIdentity('A')
    const captured = b.ownerScope.capture()
    await b.store.upsert('concepts', [{ id: 'owned' }])
    b.setIdentity('B')
    expect(await b.store.list('concepts')).toEqual([])
    b.setIdentity('A')
    expect(() => b.ownerScope.assertCurrent(captured)).toThrow(expect.objectContaining({ code: 'owner_changed' }))
    expect(await b.store.list('concepts')).toEqual([{ id: 'owned' }])
    b.setIdentity(null)
    await expect(b.blobs.getUrl('user/A/concepts/c/x.png')).rejects.toMatchObject({ code: 'owner_changed' })
  })

  it('invalidates the real scope synchronously on auth events and publishes only after purge', async () => {
    const b = createBackend('local', { authKind: 'supabase', ownerId: 'A' })
    const previousCapabilities = backend.capabilities
    const previousOwner = backend.privateOwnerId
    backend.capabilities = b.capabilities
    backend.privateOwnerId = b.privateOwnerId
    vi.spyOn(backend, 'setIdentity').mockImplementation(b.setIdentity)
    let emit
    vi.spyOn(backend.auth, 'onAuthStateChange').mockImplementation((cb) => { emit = cb; return () => {} })
    vi.spyOn(backend.auth, 'getSession').mockResolvedValue({ user: { id: 'A' } })
    const view = renderHook(() => useAuth(), { wrapper: ({ children }) => createElement(AuthProvider, null, children) })
    try {
      await waitFor(() => expect(view.result.current.loading).toBe(false))
      const first = b.ownerScope.capture()
      await b.store.upsert('concepts', [{ id: 'retained' }])
      act(() => { emit({ user: { id: 'B' } }) })
      expect(() => b.ownerScope.capture()).toThrow(expect.objectContaining({ code: 'owner_changed' }))
      expect(view.result.current.loading).toBe(true)
      await waitFor(() => expect(view.result.current.loading).toBe(false))
      await expect(b.store.list('concepts')).rejects.toMatchObject({ code: 'owner_changed' })
      act(() => { emit({ user: { id: 'A' } }) })
      expect(() => b.ownerScope.capture()).toThrow(expect.objectContaining({ code: 'owner_changed' }))
      await waitFor(() => expect(view.result.current.loading).toBe(false))
      expect(await b.store.list('concepts')).toEqual([{ id: 'retained' }])
      expect(() => b.ownerScope.assertCurrent(first)).toThrow(expect.objectContaining({ code: 'owner_changed' }))
      const renewed = b.ownerScope.capture()
      await act(async () => { emit({ user: { id: 'A' } }) })
      expect(() => b.ownerScope.assertCurrent(renewed)).not.toThrow()
    } finally {
      view.unmount()
      backend.capabilities = previousCapabilities
      backend.privateOwnerId = previousOwner
    }
    expect(() => b.ownerScope.capture()).toThrow(expect.objectContaining({ code: 'owner_changed' }))
  })

  it.each(['list', 'pull', 'upsert', 'remove'])('rejects an absent owner for %s', async (method) => {
    const { store, change } = privateStorage()
    change(null)
    await expect(store[method]('concepts')).rejects.toMatchObject({ code: 'owner_changed' })
  })

  it.each(['{broken', 'null', '{}', '[null]'])('fails closed on corrupt private rows %s', async (raw) => {
    const { store } = privateStorage()
    localStorage.setItem('tattoo_remote_A_concepts', raw)
    await expect(store.list('concepts')).rejects.toMatchObject({ code: 'storage_failed' })
    await expect(store.upsert('concepts', [{ id: 'new' }])).rejects.toMatchObject({ code: 'storage_failed' })
    expect(localStorage.getItem('tattoo_remote_A_concepts')).toBe(raw)
  })

  it('rejects private quota failures without returning an unpersisted success', async () => {
    const { store } = privateStorage()
    await store.upsert('concepts', [{ id: 'original' }])
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota with sensitive content') })
    await expect(store.upsert('concepts', [{ id: 'new' }])).rejects.toMatchObject({ code: 'storage_failed' })
    await expect(store.remove('concepts', ['original'])).rejects.toMatchObject({ code: 'storage_failed' })
    expect(await store.list('concepts')).toEqual([{ id: 'original' }])
  })

  it('does not reread the namespace between loading and saving', async () => {
    const { store, change } = privateStorage()
    const getItem = localStorage.getItem.bind(localStorage)
    vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      const value = getItem(key)
      if (key === 'tattoo_remote_A_concepts') { change('B'); change('A') }
      return value
    })
    await expect(store.upsert('concepts', [{ id: 'late' }])).rejects.toMatchObject({ code: 'owner_changed' })
    expect(getItem('tattoo_remote_B_concepts')).toBeNull()
    expect(getItem('tattoo_remote_A_concepts')).toBeNull()
  })
})

describe.each(['supabase', 'local'])('auth display invalidation with %s auth', (authKind) => {
  const key = 'user/A/concepts/auth-delayed/image.png'
  const cachedKey = 'user/A/concepts/auth-cached/image.png'
  let previousCapabilities, previousOwner, emit

  beforeEach(() => {
    const b = createBackend('local', { authKind, ownerId: 'A' })
    previousCapabilities = backend.capabilities
    previousOwner = backend.privateOwnerId
    backend.capabilities = b.capabilities
    backend.privateOwnerId = b.privateOwnerId
    vi.spyOn(backend, 'setIdentity').mockImplementation(b.setIdentity)
    vi.spyOn(backend.auth, 'onAuthStateChange').mockImplementation((cb) => { emit = cb; return () => {} })
    vi.spyOn(backend.auth, 'getSession').mockResolvedValue({ user: { id: 'A' } })
  })
  afterEach(() => {
    backend.capabilities = previousCapabilities
    backend.privateOwnerId = previousOwner
  })

  async function mountAuth() {
    const view = renderHook(() => useAuth(), { wrapper: ({ children }) => createElement(AuthProvider, null, children) })
    await waitFor(() => expect(view.result.current.loading).toBe(false))
    return view
  }

  it.each(['success', 'failure'])('discards old resolver %s after batched A→null→A without a purge', async (result) => {
    const view = await mountAuth()
    try {
      const old = deferred(), fresh = deferred()
      vi.spyOn(backend.blobs, 'getUrl').mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
      registerBlobUrl(cachedKey, 'cached-before-logout')
      const pending = resolveBlobKey(key)
      // Both events arrive before the serialized queue runs. The final owner
      // equals prevUserId, so the queue does not call purgeLocalUserData.
      act(() => { emit(null); emit({ user: { id: 'A' } }) })
      const cacheDuringTransition = getCachedBlobUrl(cachedKey)
      await waitFor(() => expect(view.result.current.loading).toBe(false))
      const afterLogin = resolveBlobKey(key)
      if (result === 'success') old.resolve('old-session-url')
      else old.reject(new Error('old-session-error'))
      const oldResult = await pending
      // This third lookup must still share fresh work after old work settles.
      const sharedFresh = resolveBlobKey(key)
      fresh.resolve('new-session-url')
      expect(oldResult).toBe('')
      expect(await afterLogin).toBe('new-session-url')
      expect(await sharedFresh).toBe('new-session-url')
      expect(cacheDuringTransition).toBe('')
      expect(keyForUrl('cached-before-logout')).toBeNull()
      expect(keyForUrl('old-session-url')).toBeNull()
      expect(getCachedBlobUrl(key)).toBe('new-session-url')
    } finally { view.unmount() }
  })

  it('invalidates display work when the auth provider unmounts', async () => {
    const view = await mountAuth()
    const old = deferred()
    vi.spyOn(backend.blobs, 'getUrl').mockReturnValueOnce(old.promise)
    registerBlobUrl(cachedKey, 'cached-before-unmount')
    const pending = resolveBlobKey(key)
    view.unmount()
    old.resolve('late-after-unmount')
    expect(await pending).toBe('')
    expect(getCachedBlobUrl(cachedKey)).toBe('')
    expect(keyForUrl('cached-before-unmount')).toBeNull()
    expect(keyForUrl('late-after-unmount')).toBeNull()
  })

  it('preserves cached and inflight display work for a same-owner token refresh', async () => {
    const view = await mountAuth()
    try {
      const current = deferred()
      const getUrl = vi.spyOn(backend.blobs, 'getUrl').mockReturnValue(current.promise)
      registerBlobUrl(cachedKey, 'still-valid')
      const pending = resolveBlobKey(key)
      await act(async () => { emit({ user: { id: 'A' } }) })
      const shared = resolveBlobKey(key)
      current.resolve('current-session-url')
      expect(await pending).toBe('current-session-url')
      expect(await shared).toBe('current-session-url')
      expect(getUrl).toHaveBeenCalledTimes(1)
      expect(getCachedBlobUrl(cachedKey)).toBe('still-valid')
      expect(keyForUrl('still-valid')).toBe(cachedKey)
    } finally { view.unmount() }
  })
})

describe('private canonical blobs', () => {
  const ownKey = 'user/A/concepts/c/owned.png'
  const bytes = 'data:image/png;base64,YQ=='

  it.each(['user/B/concepts/c/x.png', 'user/AB/concepts/c/x.png', 'user/A-other/x', 'legacy/x', ''])('rejects foreign key %s for every operation', async (key) => {
    const { blobs } = privateStorage()
    await expect(blobs.upload('A', key, bytes)).rejects.toMatchObject({ code: 'owner_changed' })
    await expect(blobs.getUrl(key)).rejects.toMatchObject({ code: 'owner_changed' })
    await expect(blobs.remove(key)).rejects.toMatchObject({ code: 'owner_changed' })
  })

  it('rejects a mismatched upload owner and keeps each owner’s canonical bytes', async () => {
    const { blobs, change } = privateStorage()
    await expect(blobs.upload('B', ownKey, bytes)).rejects.toMatchObject({ code: 'owner_changed' })
    await blobs.upload('A', ownKey, bytes)
    change('B')
    await expect(blobs.getUrl(ownKey)).rejects.toMatchObject({ code: 'owner_changed' })
    await expect(blobs.remove(ownKey)).rejects.toMatchObject({ code: 'owner_changed' })
    change('A')
    expect(await blobs.getUrl(ownKey)).toBe(bytes)
  })

  it.each([undefined, null, ''])('rejects missing upload owner %s', async (userId) => {
    const { blobs } = privateStorage()
    await expect(blobs.upload(userId, ownKey, bytes)).rejects.toMatchObject({ code: 'owner_changed' })
  })

  it('cancels a delayed FileReader upload after A→B→A', async () => {
    const { blobs, change } = privateStorage()
    let reader
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () { reader = this })
    const pending = blobs.upload('A', 'user/A/concepts/c/delayed.png', new Blob(['a'], { type: 'image/png' }))
    const outcome = expect(pending).rejects.toMatchObject({ code: 'owner_changed' })
    change('B'); change('A')
    Object.defineProperty(reader, 'result', { value: bytes })
    reader.onload()
    await outcome
    expect(await blobs.getUrl('user/A/concepts/c/delayed.png')).toBe('')
  })

  it.each(['getUrl', 'remove', 'upload'])('rejects %s after an async IndexedDB owner change', async (method) => {
    const { blobs, change } = privateStorage()
    await blobs.upload('A', ownKey, bytes)
    const pending = method === 'upload' ? blobs.upload('A', ownKey, bytes) : blobs[method](ownKey)
    const outcome = expect(pending).rejects.toMatchObject({ code: 'owner_changed' })
    change('B'); change('A')
    await outcome
    expect(await blobs.getUrl(ownKey)).toBe(bytes)
  })

  it.each([
    ['getUrl', 'get'], ['upload', 'put'], ['remove', 'delete'],
  ])('rejects a late %s completion without touching the next owner’s namespace', async (method, requestMethod) => {
    const { blobs, change } = privateStorage()
    await blobs.upload('A', ownKey, bytes)
    change('B')
    const otherKey = 'user/B/concepts/c/owned.png'
    await blobs.upload('B', otherKey, 'data:image/png;base64,Yg==')
    change('A')
    const original = IDBObjectStore.prototype[requestMethod]
    const spy = vi.spyOn(IDBObjectStore.prototype, requestMethod).mockImplementationOnce(function (...args) {
      const req = original.apply(this, args)
      req.addEventListener('success', () => { change('B'); change('A') })
      return req
    })
    const pending = method === 'upload' ? blobs.upload('A', ownKey, bytes) : blobs[method](ownKey)
    await expect(pending).rejects.toMatchObject({ code: 'owner_changed' })
    spy.mockRestore()
    change('B')
    expect(await blobs.getUrl(otherKey)).toBe('data:image/png;base64,Yg==')
  })
})

describe('display resolution invalidation', () => {
  const key = 'user/A/concepts/c/image.png'

  it('does not register a delayed display URL after invalidation', async () => {
    const delayed = deferred()
    vi.spyOn(backend.blobs, 'getUrl').mockReturnValueOnce(delayed.promise)
    const pending = resolveBlobKey(key)
    clearBlobUrls()
    delayed.resolve('data:image/png;base64,YQ==')
    expect(await pending).toBe('')
    expect(keyForUrl('data:image/png;base64,YQ==')).toBeNull()
    expect(getCachedBlobUrl(key)).toBe('')
  })

  it('does not return a stale fallback URL after a delayed rejection', async () => {
    vi.useFakeTimers()
    backend.blobs.urlTtlMs = 1000
    registerBlobUrl(key, 'https://signed.example/private')
    vi.setSystemTime(Date.now() + 1000)
    const delayed = deferred()
    vi.spyOn(backend.blobs, 'getUrl').mockReturnValueOnce(delayed.promise)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = resolveBlobKey(key)
    clearBlobUrls()
    delayed.reject(new Error('expired session'))
    expect(await pending).toBe('')
    expect(keyForUrl('https://signed.example/private')).toBeNull()
  })

  it.each(['success', 'failure'])('old %s cannot remove newer same-key work after re-login', async (result) => {
    const old = deferred(), fresh = deferred()
    const getUrl = vi.spyOn(backend.blobs, 'getUrl')
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
      .mockResolvedValue('unexpected third lookup')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const beforeLogout = resolveBlobKey(key)
    clearBlobUrls()
    const afterLogin = resolveBlobKey(key)
    if (result === 'success') old.resolve('old-private-url')
    else old.reject(new Error('old-session'))
    expect(await beforeLogout).toBe('')
    const shared = resolveBlobKey(key)
    fresh.resolve('fresh-private-url')
    expect(await afterLogin).toBe('fresh-private-url')
    expect(await shared).toBe('fresh-private-url')
    expect(getUrl).toHaveBeenCalledTimes(2)
    expect(keyForUrl('old-private-url')).toBeNull()
  })
})
