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
    onAuthStateChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
  }
}
