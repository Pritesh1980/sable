import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
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
})
