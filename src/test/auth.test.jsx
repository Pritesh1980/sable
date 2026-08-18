import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { backend } from '../backend'
import * as purgeModule from '../backend/purge'
import ProtectedRoute from '../components/ProtectedRoute'

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
