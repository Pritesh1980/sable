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
})
