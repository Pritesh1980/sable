import { getSupabaseClient } from './client'

const toSession = (session) =>
  session ? { user: { id: session.user.id, email: session.user.email } } : null

// AuthClient backed by Supabase Auth. No signUp — accounts are created admin-side.
export function createSupabaseAuth() {
  const sb = getSupabaseClient()
  return {
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
    },
    onAuthStateChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event, session) =>
        cb(toSession(session), { recovery: event === 'PASSWORD_RECOVERY' }))
      return () => data.subscription.unsubscribe()
    },
  }
}
