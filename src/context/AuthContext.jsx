import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './auth-context'
import { backend } from '../backend'
import { purgeLocalUserData } from '../backend/purge'

// Persists the last-known signed-in identity across reloads (deliberately NOT
// in purge.js's PURGE_KEYS — it's the bookkeeping marker purge itself relies
// on, not signed-in user data). Without this, an in-memory ref alone can't
// detect a full-page reload/navigation (e.g. an OAuth redirect) that boots
// straight into a different account (#28 review, codex).
const LAST_USER_KEY = 'tattoo_last_user_id'

// Holds the current auth session and exposes signIn/signOut, wired to
// backend.auth. Mirrors the ThemeContext split (context · provider · hook).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    // Whichever of getSession()/onAuthStateChange resolves first establishes
    // the baseline identity; once set, a late-arriving getSession() result is
    // stale and must not stomp over a real auth event that already landed
    // (#28 review, codex).
    let baselineSet = false
    let prevUserId

    async function applyIdentity(nextUserId, nextSession) {
      if (!baselineSet) {
        baselineSet = true
        const lastKnown = localStorage.getItem(LAST_USER_KEY)
        prevUserId = lastKnown === null ? nextUserId : lastKnown
      }
      if (prevUserId !== nextUserId) {
        // Purge — and only then publish the new session — on any identity
        // change, not just the explicit signOut() path: passive session
        // expiry, a direct A→B swap with no null event in between, and a
        // reload into a different account are all covered. Publishing before
        // purge completes would let an A-owned read still in flight populate
        // B's freshly-rendered state (#28 review, codex).
        await purgeLocalUserData().catch((e) => console.error('[tattoo] purge on auth change failed:', e))
      }
      prevUserId = nextUserId
      try {
        if (nextUserId) localStorage.setItem(LAST_USER_KEY, nextUserId)
        else localStorage.removeItem(LAST_USER_KEY)
      } catch (e) { console.error('[tattoo] failed to persist last user id:', e) }
      if (mounted) setSession(nextSession)
    }

    backend.auth
      .getSession()
      .then((s) => {
        if (!mounted || baselineSet) return
        return applyIdentity(s?.user?.id || null, s)
      })
      .catch((e) => console.error('[tattoo] getSession failed:', e))
      .finally(() => { if (mounted) setLoading(false) })

    const unsub = backend.auth.onAuthStateChange((s) => {
      if (!mounted) return
      applyIdentity(s?.user?.id || null, s)
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
