import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './auth-context'
import { backend } from '../backend'
import { purgeLocalUserData } from '../backend/purge'

// Holds the current auth session and exposes signIn/signOut, wired to
// backend.auth. Mirrors the ThemeContext split (context · provider · hook).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    backend.auth
      .getSession()
      .then((s) => { if (mounted) setSession(s) })
      .catch((e) => console.error('[tattoo] getSession failed:', e))
      .finally(() => { if (mounted) setLoading(false) })

    const unsub = backend.auth.onAuthStateChange((s) => {
      if (mounted) setSession(s)
    })
    return () => { mounted = false; unsub?.() }
  }, [])

  const signIn = useCallback((creds) => backend.auth.signIn(creds), [])
  const signOut = useCallback(async () => {
    await backend.auth.signOut()
    // Drop the signed-out user's local caches so the next account starts clean.
    purgeLocalUserData()
  }, [])

  const value = {
    user: session?.user || null,
    session,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
