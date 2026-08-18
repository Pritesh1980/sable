import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './auth-context'
import { backend } from '../backend'
import { purgeLocalUserData } from '../backend/purge'

// Holds the current auth session and exposes signIn/signOut, wired to
// backend.auth. Mirrors the ThemeContext split (context · provider · hook).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // undefined = identity not yet established (initial hydration in flight);
  // set once by whichever of getSession()/onAuthStateChange resolves first.
  const prevUserIdRef = useRef(undefined)

  useEffect(() => {
    let mounted = true
    backend.auth
      .getSession()
      .then((s) => {
        if (!mounted) return
        if (prevUserIdRef.current === undefined) prevUserIdRef.current = s?.user?.id || null
        setSession(s)
      })
      .catch((e) => console.error('[tattoo] getSession failed:', e))
      .finally(() => { if (mounted) setLoading(false) })

    const unsub = backend.auth.onAuthStateChange((s) => {
      if (!mounted) return
      const nextUserId = s?.user?.id || null
      // Purge on any identity change, not just the explicit signOut() path —
      // covers passive session expiry and a direct A→B swap with no null
      // event in between (#28).
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== nextUserId) {
        purgeLocalUserData().catch((e) => console.error('[tattoo] purge on auth change failed:', e))
      }
      prevUserIdRef.current = nextUserId
      setSession(s)
    })
    return () => { mounted = false; unsub?.() }
  }, [])

  const signIn = useCallback((creds) => backend.auth.signIn(creds), [])
  const signOut = useCallback(async () => {
    await backend.auth.signOut()
    // Belt-and-braces: the onAuthStateChange handler above already purges on
    // this transition, but doesn't rely on adapter timing guarantees here too.
    await purgeLocalUserData()
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
