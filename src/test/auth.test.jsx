import { useEffect, useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { backend } from '../backend'
import * as purgeModule from '../backend/purge'
import ProtectedRoute from '../components/ProtectedRoute'

const defaultCapabilities = backend.capabilities
const defaultOwner = backend.privateOwnerId
afterEach(() => {
  vi.restoreAllMocks()
  backend.capabilities = defaultCapabilities
  backend.privateOwnerId = defaultOwner
})

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const account = (id) => ({ user: { id, email: `${id}@example.com` } })

function controlAuth(initial = account('a')) {
  let listener
  vi.spyOn(backend.auth, 'getSession').mockResolvedValue(initial)
  vi.spyOn(backend.auth, 'onAuthStateChange').mockImplementation((cb) => {
    listener = cb
    return () => { listener = null }
  })
  return (session) => listener?.(session)
}

describe('private owner gate', () => {
  beforeEach(() => {
    localStorage.clear()
    backend.capabilities = { offlineAuth: false, realAuth: true }
    backend.privateOwnerId = 'owner'
  })

  it.each(['intruder', ''])('does not mount data hooks for unauthorized identity %s', async (id) => {
    controlAuth(account(id))
    const mounted = vi.fn()
    function Data() { useEffect(mounted, []); return <div>private data</div> }
    render(<AuthProvider><ProtectedRoute><Data /></ProtectedRoute></AuthProvider>)
    await screen.findByText('Access denied')
    expect(mounted).not.toHaveBeenCalled()
    expect(screen.queryByText('private data')).not.toBeInTheDocument()
  })

  it('fails closed when the configured owner is missing', async () => {
    backend.privateOwnerId = ''
    controlAuth(account('owner'))
    render(<Gated />)
    await screen.findByText('Private access is not configured')
    expect(screen.queryByText('secret content')).not.toBeInTheDocument()
  })

  it('admits the exact configured owner, not the email', async () => {
    controlAuth({ user: { id: 'owner', email: 'different@example.com' } })
    render(<Gated />)
    await screen.findByText('secret content')
  })

  it('offers no demo on real auth with local storage and permits signing out after denial', async () => {
    const emit = controlAuth(null)
    vi.spyOn(backend.auth, 'signOut').mockImplementation(async () => { emit(null) })
    render(<Gated />)
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByRole('link', { name: /demo/i })).not.toBeInTheDocument()
    await act(async () => { emit(account('intruder')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Sign in' })
  })
})

describe('serialized identity transitions', () => {
  beforeEach(() => localStorage.clear())

  function OwnerData() {
    const { user } = useAuth()
    const [mountedFor] = useState(user.id)
    return <div>data:{user.id}, mounted:{mountedFor}</div>
  }
  const mountData = () => render(<AuthProvider><ProtectedRoute><OwnerData /></ProtectedRoute></AuthProvider>)

  it('unmounts data immediately during a swap and remounts after purge', async () => {
    const emit = controlAuth()
    const purge = deferred()
    vi.spyOn(purgeModule, 'purgeLocalUserData').mockReturnValue(purge.promise)
    mountData()
    await screen.findByText('data:a, mounted:a')
    let returned
    act(() => { returned = emit(account('b')) })
    expect(returned).toBeUndefined() // SDK callbacks must remain synchronous.
    expect(screen.queryByText('data:a, mounted:a')).not.toBeInTheDocument()
    expect(screen.queryByText('data:b, mounted:b')).not.toBeInTheDocument()
    await act(async () => { purge.resolve() })
    await screen.findByText('data:b, mounted:b')
  })

  it('keeps a same-owner token event mounted without purging', async () => {
    const emit = controlAuth()
    const purge = vi.spyOn(purgeModule, 'purgeLocalUserData')
    mountData()
    await screen.findByText('data:a, mounted:a')
    await act(async () => { emit(account('a')) })
    expect(screen.getByText('data:a, mounted:a')).toBeInTheDocument()
    expect(purge).not.toHaveBeenCalled()
  })

  it('remounts owner data even when an immediate swap is batched into one render', async () => {
    const emit = controlAuth()
    vi.spyOn(purgeModule, 'purgeLocalUserData').mockResolvedValue()
    mountData()
    await screen.findByText('data:a, mounted:a')
    await act(async () => { emit(account('b')) })
    expect(screen.getByText('data:b, mounted:b')).toBeInTheDocument()
  })

  it('a late explicit sign-out completion cannot purge a subsequently signed-in account', async () => {
    const emit = controlAuth()
    const sdkSignOut = deferred()
    vi.spyOn(backend.auth, 'signOut').mockImplementation(() => {
      emit(null)
      return sdkSignOut.promise
    })
    let signOut
    function Controls() {
      const auth = useAuth()
      useEffect(() => { signOut = auth.signOut }, [auth.signOut])
      return null
    }
    render(<AuthProvider><Controls /><ProtectedRoute><OwnerData /></ProtectedRoute></AuthProvider>)
    await screen.findByText('data:a, mounted:a')
    let signingOut
    await act(async () => { signingOut = signOut() })
    await screen.findByRole('button', { name: 'Sign in' })
    await act(async () => { emit(account('b')) })
    await screen.findByText('data:b, mounted:b')
    localStorage.setItem('tattoo_ideas', '[{"id":"belongs-to-b"}]')
    await act(async () => { sdkSignOut.resolve(); await signingOut })
    expect(localStorage.getItem('tattoo_ideas')).toBe('[{"id":"belongs-to-b"}]')
    expect(screen.getByText('data:b, mounted:b')).toBeInTheDocument()
  })

  it('does not open a cached identity when the SDK session lookup fails', async () => {
    controlAuth()
    backend.auth.getSession.mockRejectedValue(new Error('SDK secret error detail'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mountData()
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByText(/data:/)).not.toBeInTheDocument()
    expect(console.error).toHaveBeenCalledWith('[tattoo] getSession failed')
  })

  it('serializes A→B→C purges and never publishes B after C arrives', async () => {
    const emit = controlAuth()
    const first = deferred(), second = deferred()
    const purge = vi.spyOn(purgeModule, 'purgeLocalUserData')
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    mountData()
    await screen.findByText('data:a, mounted:a')
    await act(async () => { emit(account('b')) })
    await act(async () => { emit(account('c')) })
    expect(purge).toHaveBeenCalledTimes(1)
    await act(async () => { first.resolve() })
    expect(screen.queryByText(/data:/)).not.toBeInTheDocument()
    expect(localStorage.getItem('tattoo_last_user_id')).toBe('a')
    expect(purge).toHaveBeenCalledTimes(2)
    await act(async () => { second.resolve() })
    await screen.findByText('data:c, mounted:c')
    expect(localStorage.getItem('tattoo_last_user_id')).toBe('c')
  })

  it('does not clear loading when stale getSession resolves during a newer purge', async () => {
    const emit = controlAuth()
    const cached = deferred(), purge = deferred()
    backend.auth.getSession.mockReturnValue(cached.promise)
    localStorage.setItem('tattoo_last_user_id', 'a')
    vi.spyOn(purgeModule, 'purgeLocalUserData').mockReturnValue(purge.promise)
    mountData()
    await act(async () => { emit(account('b')) })
    await act(async () => { cached.resolve(account('a')) })
    expect(screen.queryByText(/data:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    await act(async () => { purge.resolve() })
    await screen.findByText('data:b, mounted:b')
  })

  it('does not publish an older cached identity whose purge finishes after an event', async () => {
    localStorage.setItem('tattoo_last_user_id', 'old')
    const emit = controlAuth(account('a'))
    const first = deferred(), second = deferred()
    vi.spyOn(purgeModule, 'purgeLocalUserData').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    mountData()
    await act(async () => {})
    await act(async () => { emit(account('b')); first.resolve() })
    expect(screen.queryByText(/data:/)).not.toBeInTheDocument()
    await act(async () => { second.resolve() })
    await screen.findByText('data:b, mounted:b')
  })

  it('keeps the gate closed if purge rejects', async () => {
    const emit = controlAuth()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(purgeModule, 'purgeLocalUserData').mockRejectedValue(new Error('purge failed'))
    mountData()
    await screen.findByText('data:a, mounted:a')
    await act(async () => { emit(account('b')) })
    expect(screen.queryByText(/data:/)).not.toBeInTheDocument()
    expect(localStorage.getItem('tattoo_last_user_id')).toBe('a')
  })

  it('does not publish or persist a pending transition after unmount', async () => {
    const emit = controlAuth()
    const purge = deferred()
    vi.spyOn(purgeModule, 'purgeLocalUserData').mockReturnValue(purge.promise)
    const view = mountData()
    await screen.findByText('data:a, mounted:a')
    await act(async () => { emit(account('b')) })
    view.unmount()
    await act(async () => { purge.resolve() })
    expect(localStorage.getItem('tattoo_last_user_id')).toBe('a')
  })
})

function Gated() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <div>secret content</div>
      </ProtectedRoute>
    </AuthProvider>
  )
}

describe('auth gate (local backend)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the login screen when signed out, then the app after signing in', async () => {
    render(<Gated />)

    // After the session resolves, the Login screen is shown (not the spinner).
    await waitFor(() => expect(screen.getByText('Sign in')).toBeInTheDocument())
    expect(screen.queryByText('secret content')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'hunter2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.getByText('secret content')).toBeInTheDocument())
  })

  it('exposes user/signOut and returns to the gate on sign out', async () => {
    function Probe() {
      const { user, signIn, signOut } = useAuth()
      return (
        <div>
          <span>{user ? `in:${user.email}` : 'out'}</span>
          <button onClick={() => signIn({ email: 'artist@studio.com', password: 'x' })}>do-signin</button>
          <button onClick={() => signOut()}>do-signout</button>
        </div>
      )
    }
    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())

    fireEvent.click(screen.getByText('do-signin'))
    await waitFor(() => expect(screen.getByText('in:artist@studio.com')).toBeInTheDocument())

    fireEvent.click(screen.getByText('do-signout'))
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())
  })

  // #28: onAuthStateChange only purged via the explicit signOut() path. A direct
  // account swap (local auth's signIn() emits the new session with no null event
  // in between) left the previous user's local cache to leak into the new session.
  it('purges the previous user cache on a direct account swap with no intervening sign-out', async () => {
    function Probe() {
      const { user, signIn } = useAuth()
      return (
        <div>
          <span>{user ? `in:${user.email}` : 'out'}</span>
          <button onClick={() => signIn({ email: 'artist-a@studio.com', password: 'x' })}>signin-a</button>
          <button onClick={() => signIn({ email: 'artist-b@studio.com', password: 'x' })}>signin-b</button>
        </div>
      )
    }
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())

    fireEvent.click(screen.getByText('signin-a'))
    await waitFor(() => expect(screen.getByText('in:artist-a@studio.com')).toBeInTheDocument())

    // Simulate user A's unsynced local cache still sitting around.
    localStorage.setItem('tattoo_ideas', '[{"id":"a-idea"}]')

    fireEvent.click(screen.getByText('signin-b'))
    await waitFor(() => expect(screen.getByText('in:artist-b@studio.com')).toBeInTheDocument())

    await waitFor(() => expect(localStorage.getItem('tattoo_ideas')).toBeNull())
  })

  // #28 review (codex): the in-memory prevUserIdRef only tracks changes within
  // one mounted AuthProvider — a full reload/navigation (e.g. an OAuth redirect)
  // that boots directly into a different account was invisible to it.
  it('purges the previous user cache when booting into a different account after a reload', async () => {
    localStorage.setItem('tattoo_last_user_id', 'local-artist-a@studio.com')
    localStorage.setItem('tattoo_ideas', '[{"id":"a-idea"}]')
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-artist-b@studio.com', email: 'artist-b@studio.com' } })
    )

    function Probe() {
      const { user } = useAuth()
      return <span>{user ? `in:${user.email}` : 'out'}</span>
    }
    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(screen.getByText('in:artist-b@studio.com')).toBeInTheDocument())
    expect(localStorage.getItem('tattoo_ideas')).toBeNull()
  })

  // #28 review (codex): booting as the SAME user as last session must not purge.
  it('does not purge on a normal reload as the same returning user', async () => {
    localStorage.setItem('tattoo_last_user_id', 'local-artist-a@studio.com')
    localStorage.setItem('tattoo_ideas', '[{"id":"a-idea"}]')
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-artist-a@studio.com', email: 'artist-a@studio.com' } })
    )

    function Probe() {
      const { user } = useAuth()
      return <span>{user ? `in:${user.email}` : 'out'}</span>
    }
    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(screen.getByText('in:artist-a@studio.com')).toBeInTheDocument())
    expect(localStorage.getItem('tattoo_ideas')).toBe('[{"id":"a-idea"}]')
  })

  // #28 review (codex): a slow getSession() resolving after a real auth event
  // has already established the current identity must not stomp back over it.
  it('does not let a stale getSession() resolution overwrite a newer auth event', async () => {
    let resolveGetSession
    const spy = vi.spyOn(backend.auth, 'getSession').mockImplementation(
      () => new Promise((resolve) => { resolveGetSession = resolve })
    )

    function Probe() {
      const { user, signIn } = useAuth()
      return (
        <div>
          <span>{user ? `in:${user.email}` : 'out'}</span>
          <button onClick={() => signIn({ email: 'artist-b@studio.com', password: 'x' })}>signin-b</button>
        </div>
      )
    }
    render(<AuthProvider><Probe /></AuthProvider>)

    // A real auth event wins the race and establishes B as current...
    fireEvent.click(screen.getByText('signin-b'))
    await waitFor(() => expect(screen.getByText('in:artist-b@studio.com')).toBeInTheDocument())

    // ...then the slow getSession() call from mount finally resolves, stale.
    await act(async () => { resolveGetSession(null) })

    expect(screen.getByText('in:artist-b@studio.com')).toBeInTheDocument()
    spy.mockRestore()
  })

  // #28 review (codex): the new session was published (setSession) without
  // awaiting purge, so an A-owned read still in flight could populate B's
  // freshly-rendered state before A's caches were actually cleared.
  it('does not publish the new session until purge has completed', async () => {
    let resolvePurge
    let calls = 0
    const purgeSpy = vi.spyOn(purgeModule, 'purgeLocalUserData').mockImplementation(() => {
      calls += 1
      // The out→A transition (establishing the baseline) doesn't purge at all
      // in real code, but hold every *actual* purge call open except let a
      // spurious first call (if any) resolve immediately, so only the A→B
      // swap this test cares about is held.
      if (calls === 1) return Promise.resolve()
      return new Promise((resolve) => { resolvePurge = resolve })
    })

    function Probe() {
      const { user, signIn } = useAuth()
      return (
        <div>
          <span>{user ? `in:${user.email}` : 'out'}</span>
          <button onClick={() => signIn({ email: 'artist-a@studio.com', password: 'x' })}>signin-a</button>
          <button onClick={() => signIn({ email: 'artist-b@studio.com', password: 'x' })}>signin-b</button>
        </div>
      )
    }
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())

    // First sign-in establishes the baseline — no purge, resolves immediately.
    fireEvent.click(screen.getByText('signin-a'))
    await waitFor(() => expect(screen.getByText('in:artist-a@studio.com')).toBeInTheDocument())

    // Swapping to B triggers purge, which we hold open.
    fireEvent.click(screen.getByText('signin-b'))
    await act(async () => {})
    expect(screen.getByText('in:artist-a@studio.com')).toBeInTheDocument()

    resolvePurge()
    await waitFor(() => expect(screen.getByText('in:artist-b@studio.com')).toBeInTheDocument())
    purgeSpy.mockRestore()
  })
})
