import { getSupabaseClient } from './client'

const toSession = (session) =>
  session ? { user: { id: session.user.id, email: session.user.email } } : null

const RECOVERY_KEY = 'tattoo_pw_recovery'

function setPending(on) {
  try {
    if (on) localStorage.setItem(RECOVERY_KEY, '1')
    else localStorage.removeItem(RECOVERY_KEY)
  } catch { /* storage unavailable: recovery still works via the event */ }
}

// Read the URL hash synchronously, before the SDK consumes it: the SDK emits
// PASSWORD_RECOVERY in a setTimeout(0) after initialisation, which a late
// subscriber or an earlier INITIAL_SESSION can miss, and a reload loses it.
// Returns a short error code for a failed link (never logged), else null.
function readAuthHash() {
  let linkError = null
  try {
    const raw = window.location.hash.replace(/^#/, '')
    if (!raw) return linkError
    const params = new URLSearchParams(raw)
    if (params.get('type') === 'recovery') setPending(true)
    linkError = params.get('error_code')
  } catch { /* no window or malformed hash */ }
  return linkError
}

// AuthClient backed by Supabase Auth. No signUp — accounts are created admin-side.
export function createSupabaseAuth() {
  let linkError = readAuthHash()
  const sb = getSupabaseClient()
  return {
    recoveryPending() {
      try { return localStorage.getItem(RECOVERY_KEY) === '1' } catch { return false }
    },
    // One-shot: the code of an expired/used reset link, or null.
    consumeAuthLinkError() {
      const code = linkError
      linkError = null
      return code
    },
    async getSession() {
      const { data, error } = await sb.auth.getSession()
      if (error) throw error
      return toSession(data.session)
    },
    async getAccessToken({ forceRefresh = false } = {}) {
      const { data, error } = forceRefresh
        ? await sb.auth.refreshSession()
        : await sb.auth.getSession()
      if (error) throw error
      return data.session?.access_token || null
    },
    async signIn({ email, password }) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      return toSession(data.session) || { user: { id: data.user.id, email: data.user.email } }
    },
    async signOut() {
      setPending(false)
      const { error } = await sb.auth.signOut()
      if (error) throw new Error(error.message)
    },
    // The reset link lands on the app root; the SDK reads the recovery token
    // from the URL hash and signs the user in. Allowlist the origin in Supabase.
    async requestPasswordReset({ email }) {
      const redirectTo = window.location.origin + import.meta.env.BASE_URL
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw new Error(error.message)
    },
    async updatePassword({ password }) {
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw new Error(error.message)
      setPending(false)
    },
    onAuthStateChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        const recovery = event === 'PASSWORD_RECOVERY'
        if (recovery) setPending(true)
        cb(toSession(session), { recovery })
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
