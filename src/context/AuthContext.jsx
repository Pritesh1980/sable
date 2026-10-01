import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './auth-context'
import { backend } from '../backend'
import { purgeLocalUserData } from '../backend/purge'
import { clearBlobUrls } from '../data/blobUrls'

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
  const transitionQueue = useRef(Promise.resolve())

  useEffect(() => {
    let mounted = true
    let baselineSet = false
    let prevUserId
    let requestedUserId
    let revision = 0

    function applyIdentity(nextSession) {
      if (!mounted) return
      const nextUserId = nextSession?.user?.id || null
      const currentRevision = ++revision
      if (!baselineSet) {
        baselineSet = true
        const lastKnown = localStorage.getItem(LAST_USER_KEY)
        prevUserId = lastKnown === null ? nextUserId : lastKnown
      }
      if (requestedUserId !== nextUserId) {
        // Gate and invalidate the authoritative owner immediately, before any
        // asynchronous cleanup or publication of the next session.
        setLoading(true)
        backend.setIdentity(null)
        // A→null→A can skip the queued purge entirely. Invalidate display
        // work here as well, even when the eventual owner is unchanged.
        clearBlobUrls()
      }
      requestedUserId = nextUserId

      // Never await work in the SDK's onAuthStateChange callback. Purges run
      // serially outside it; only the latest revision may publish an identity.
      transitionQueue.current = transitionQueue.current.then(async () => {
        if (!mounted || currentRevision !== revision) return
        if (prevUserId !== nextUserId) {
          await purgeLocalUserData()
          prevUserId = nextUserId
        }
        if (!mounted || currentRevision !== revision) return
        const allowed = !backend.capabilities.realAuth ||
          (Boolean(backend.privateOwnerId) && nextUserId === backend.privateOwnerId)
        backend.setIdentity(allowed ? nextUserId : null)
        try {
          if (nextUserId) localStorage.setItem(LAST_USER_KEY, nextUserId)
          else localStorage.removeItem(LAST_USER_KEY)
        } catch { console.error('[tattoo] failed to persist last user id') }
        setSession(nextSession)
        setLoading(false)
      }).catch(() => {
        // A failed purge must not open another owner's library. No raw auth or
        // storage errors (which may contain secrets) are logged.
        console.error('[tattoo] auth transition failed')
      })
    }

    const unsub = backend.auth.onAuthStateChange(applyIdentity)
    backend.auth
      .getSession()
      .then((s) => {
        if (!mounted || revision !== 0) return
        applyIdentity(s)
      })
      .catch(() => {
        if (!mounted || revision !== 0) return
        console.error('[tattoo] getSession failed')
        applyIdentity(null)
      })
    return () => {
      mounted = false
      revision += 1
      backend.setIdentity(null)
      clearBlobUrls()
      unsub?.()
    }
  }, [])

  const signIn = useCallback((creds) => backend.auth.signIn(creds), [])
  const signOut = useCallback(async () => {
    await backend.auth.signOut()
    // The event's serialized purge is the only cleanup lane. A second purge
    // here could finish late and clear the next account's newly mounted data.
    await transitionQueue.current
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
