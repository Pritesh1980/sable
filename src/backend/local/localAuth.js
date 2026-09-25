// Local AuthClient — an offline stand-in for a real auth provider. Persists a
// session in localStorage and accepts any email/password (invite-only scope, no
// real credential check). Used as the default backend for dev/tests and as the
// offline fallback. The user id is derived deterministically from the email so
// blob keys stay stable across reloads.

const SESSION_KEY = 'tattoo_local_session'
const MAX_EMAIL_LENGTH = 254
const FORBIDDEN = /[\s/\\]/

// No credential check here, but the email becomes the user id and so part of
// storage and blob keys (`local-<email>`): it must be a plausible, bounded
// address. Checked without a regex over the whole string, which would
// backtrack on the ambiguous dots in the domain.
function validEmail(email) {
  if (!email || email.length > MAX_EMAIL_LENGTH || FORBIDDEN.test(email)) return false
  const at = email.indexOf('@')
  if (at < 1 || at !== email.lastIndexOf('@')) return false
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1
}

export function createLocalAuth() {
  const listeners = new Set()

  function read() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY)) || null
    } catch {
      return null
    }
  }

  function emit(session) {
    listeners.forEach((cb) => {
      try { cb(session) } catch { /* listener errors are non-fatal */ }
    })
  }

  return {
    async getSession() {
      return read()
    },
    async signIn({ email }) {
      const clean = String(email || '').trim().toLowerCase()
      if (!validEmail(clean)) throw new Error('Enter a valid email address.')
      const session = { user: { id: `local-${clean}`, email: clean } }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      emit(session)
      return session
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY)
      emit(null)
    },
    onAuthStateChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
