import { useEffect } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { backend } from '../backend'
import Login from '../pages/Login'
import ProtectedRoute from '../components/ProtectedRoute'

const account = { user: { id: 'u1', email: 'u1@example.com' } }

function installReset({ session = null } = {}) {
  let listener
  const api = {
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  }
  Object.assign(backend.auth, api)
  vi.spyOn(backend.auth, 'getSession').mockResolvedValue(session)
  vi.spyOn(backend.auth, 'onAuthStateChange').mockImplementation((cb) => {
    listener = cb
    return () => { listener = null }
  })
  vi.spyOn(backend.auth, 'signOut').mockImplementation(async () => { listener?.(null, { recovery: false }) })
  return { api, emit: (s, meta) => listener?.(s, meta) }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete backend.auth.requestPasswordReset
  delete backend.auth.updatePassword
  delete backend.auth.consumeAuthLinkError
  delete backend.auth.recoveryPending
  localStorage.clear()
})
beforeEach(() => localStorage.clear())

function Probe() {
  const a = useAuth()
  return <p data-testid="p">{String(a.canResetPassword)}|{String(a.recovering)}</p>
}

describe('AuthContext reset support', () => {
  it('canResetPassword is false on the local adapter', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('false|false'))
  })

  it('recovering turns on with the recovery flag and off after updatePassword', async () => {
    const { emit, api } = installReset()
    const holder = {}
    function Grab() { const a = useAuth(); useEffect(() => { holder.ctx = a }); return <Probe /> }
    render(<AuthProvider><Grab /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('true|false'))
    await act(async () => { emit(account, { recovery: true }) })
    expect(screen.getByTestId('p').textContent).toBe('true|true')
    await act(async () => { await holder.ctx.updatePassword({ password: 'newpassword1' }) })
    expect(api.updatePassword).toHaveBeenCalledWith({ password: 'newpassword1' })
    expect(screen.getByTestId('p').textContent).toBe('true|false')
  })

  it('stays recovering if the update fails, and clears on sign-out', async () => {
    const { emit, api } = installReset()
    api.updatePassword.mockRejectedValue(new Error('weak'))
    const holder = {}
    function Grab() { const a = useAuth(); useEffect(() => { holder.ctx = a }); return <Probe /> }
    render(<AuthProvider><Grab /></AuthProvider>)
    await act(async () => { emit(account, { recovery: true }) })
    await act(async () => { await expect(holder.ctx.updatePassword({ password: 'x' })).rejects.toThrow('weak') })
    expect(screen.getByTestId('p').textContent).toBe('true|true')
    await act(async () => { emit(null, { recovery: false }) })
    expect(screen.getByTestId('p').textContent).toBe('true|false')
  })
})

describe('recovery that arrives without the event', () => {
  it('initial session with recoveryPending shows SetNewPassword, never the app', async () => {
    installReset({ session: account })
    backend.auth.recoveryPending = vi.fn().mockReturnValue(true)
    render(<AuthProvider><ProtectedRoute><p>the app</p></ProtectedRoute></AuthProvider>)
    await screen.findByRole('heading', { name: /set a new password/i })
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
    delete backend.auth.recoveryPending
  })

  it('a plain session without pending opens the app', async () => {
    installReset({ session: account })
    backend.auth.recoveryPending = vi.fn().mockReturnValue(false)
    render(<AuthProvider><ProtectedRoute><p>the app</p></ProtectedRoute></AuthProvider>)
    await screen.findByText('the app')
    delete backend.auth.recoveryPending
  })
})

describe('Login expired link', () => {
  it('opens the reset view with an alert when the link failed', async () => {
    installReset()
    backend.auth.consumeAuthLinkError = vi.fn().mockReturnValue('otp_expired')
    render(<AuthProvider><Login /></AuthProvider>)
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired or was already used/)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    // sending a fresh link clears the stale note (and the module-level memo)
    await screen.findByText(/If an account exists/)
  })
})

describe('Login forgot password', () => {
  it('hides the link on the local backend', async () => {
    render(<AuthProvider><Login /></AuthProvider>)
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByRole('button', { name: /forgot password/i })).not.toBeInTheDocument()
  })

  async function openReset() {
    const ctl = installReset()
    render(<AuthProvider><Login /></AuthProvider>)
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'me@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    return ctl
  }

  it('prefills the email and shows a neutral confirmation', async () => {
    const { api } = await openReset()
    expect(screen.getByLabelText('Email').value).toBe('me@example.com')
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await screen.findByText(/If an account exists for that address, a reset link is on its way/)
    expect(api.requestPasswordReset).toHaveBeenCalledWith({ email: 'me@example.com' })
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the same confirmation when the user is not found', async () => {
    const { api } = await openReset()
    api.requestPasswordReset.mockRejectedValue(new Error('User not found'))
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await screen.findByText(/If an account exists for that address/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces rate-limit errors', async () => {
    const { api } = await openReset()
    api.requestPasswordReset.mockRejectedValue(new Error('email rate limit exceeded'))
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/rate limit/)
    expect(screen.queryByText(/If an account exists/)).not.toBeInTheDocument()
  })
})

describe('Set new password gate', () => {
  async function recovering() {
    const ctl = installReset()
    render(<AuthProvider><ProtectedRoute><p>the app</p></ProtectedRoute></AuthProvider>)
    await act(async () => { ctl.emit(account, { recovery: true }) })
    await screen.findByRole('heading', { name: /set a new password/i })
    return ctl
  }

  it('shows before the app', async () => {
    await recovering()
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
  })

  it('rejects short passwords and mismatches without calling the backend', async () => {
    const { api } = await recovering()
    const [pw, confirm] = [screen.getByLabelText('New password'), screen.getByLabelText('Confirm password')]
    fireEvent.change(pw, { target: { value: 'short' } })
    fireEvent.change(confirm, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /save password/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 8/)
    fireEvent.change(pw, { target: { value: 'longenough1' } })
    fireEvent.change(confirm, { target: { value: 'different11' } })
    fireEvent.click(screen.getByRole('button', { name: /save password/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/do not match/))
    expect(api.updatePassword).not.toHaveBeenCalled()
  })

  it('has autocomplete new-password and a show toggle', async () => {
    await recovering()
    const pw = screen.getByLabelText('New password')
    expect(pw.getAttribute('autocomplete')).toBe('new-password')
    expect(pw.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(pw.type).toBe('text')
  })

  it('success clears recovering and enters the app', async () => {
    const { api } = await recovering()
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /save password/i }))
    await screen.findByText('the app')
    expect(api.updatePassword).toHaveBeenCalledWith({ password: 'longenough1' })
  })

  it('shows backend errors and keeps the screen', async () => {
    const { api } = await recovering()
    api.updatePassword.mockRejectedValue(new Error('Password is too weak'))
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /save password/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/too weak/)
  })

  it('cancel signs out', async () => {
    await recovering()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await screen.findByRole('button', { name: 'Sign in' })
    expect(backend.auth.signOut).toHaveBeenCalled()
  })
})
