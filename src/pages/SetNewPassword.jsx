import { useEffect, useId, useRef, useState } from 'react'
import { LogoMark, Wordmark } from '../components/Logo'
import { useAuth } from '../context/useAuth'

const MIN_LENGTH = 8
const inputClass =
  'w-full min-h-11 bg-ink-muted border border-ink-border rounded-xs px-3 py-2 text-sm text-cream outline-hidden focus:border-cream-muted/50 font-mono placeholder-cream-muted'
const labelClass = 'block text-xs font-mono text-cream-muted tracking-widest uppercase mb-1'

// Shown by ProtectedRoute after a password-reset link has signed the user in.
// On success the user is already signed in, so clearing `recovering` (inside
// updatePassword) drops them straight into the app. Cancel signs out.
export default function SetNewPassword() {
  const passwordId = useId()
  const confirmId = useId()
  const { user, updatePassword, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const firstField = useRef(null)

  useEffect(() => { firstField.current?.focus() }, [])

  async function onSubmit(e) {
    e.preventDefault()
    if (submitting) return
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await updatePassword({ password })
    } catch (err) {
      setError(err?.message || 'Could not set the new password. Please try again.')
      setSubmitting(false)
    }
  }

  async function onCancel() {
    setSigningOut(true)
    try { await signOut() } catch { setError('Could not sign out. Please try again.'); setSigningOut(false) }
  }

  const type = show ? 'text' : 'password'

  return (
    <div className="bg-ink-black min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-cream mb-10 animate-slide-up">
          <LogoMark size={48} />
          <Wordmark className="mt-4" />
          <h1 className="font-mono text-cream-muted text-[0.625rem] tracking-widest uppercase mt-6">
            Set a new password
          </h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Lets the password manager file the new password under this account. */}
          <input
            type="text"
            autoComplete="username"
            value={user?.email || ''}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <div>
            <label htmlFor={passwordId} className={labelClass}>New password</label>
            <input
              id={passwordId}
              ref={firstField}
              type={type}
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor={confirmId} className={labelClass}>Confirm password</label>
            <input
              id={confirmId}
              type={type}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="min-h-11 font-mono text-cream-muted hover:text-accent text-[0.6875rem] tracking-widest uppercase transition-colors"
          >
            {show ? 'Hide passwords' : 'Show passwords'}
          </button>

          {error && <p className="text-accent text-xs font-body" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={submitting || signingOut}
            className="w-full min-h-11 px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-cream text-sm font-body rounded-xs transition-colors tracking-wide"
          >
            {submitting ? 'Saving…' : 'Save password'}
          </button>
        </form>

        <p className="mt-6 text-center">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting || signingOut}
            className="min-h-11 px-3 font-mono text-cream-muted hover:text-accent text-[0.6875rem] tracking-widest uppercase transition-colors"
          >
            Cancel and sign out
          </button>
        </p>
      </div>
    </div>
  )
}
