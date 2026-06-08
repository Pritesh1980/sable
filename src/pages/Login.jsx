import { useState } from 'react'
import { LogoMark, Wordmark } from '../components/Logo'
import { useAuth } from '../context/useAuth'

// Email + password sign-in. Invite-only — no sign-up link (accounts are created
// admin-side). The password field reuses the masked-input pattern from the
// Concepts KeyField.
export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await signIn({ email: email.trim(), password })
    } catch (err) {
      setError(err?.message || 'Could not sign in. Check your details and try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-ink-black min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-cream mb-10 animate-slide-up">
          <LogoMark size={48} />
          <Wordmark className="mt-4" />
          <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest uppercase mt-3">
            Sign in to continue
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">
              Email
            </label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/40"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/40"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-accent text-xs font-body" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-cream text-sm font-body rounded-sm transition-colors tracking-wide"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
