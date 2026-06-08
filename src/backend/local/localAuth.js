// Local AuthClient — an offline stand-in for a real auth provider. Persists a
// session in localStorage and accepts any email/password (invite-only scope, no
// real credential check). Used as the default backend for dev/tests and as the
// offline fallback. The user id is derived deterministically from the email so
// blob keys stay stable across reloads.

const SESSION_KEY = 'tattoo_local_session'

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
