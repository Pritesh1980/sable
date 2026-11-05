import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

// Marks a history entry this hook pushed, so closing knows whether the entry
// underneath is the same page without the overlay (go back) or something else
// entirely, e.g. a deep link opened in a fresh tab (replace in place).
const MARK = 'sableOverlay'

// Shared by every overlay on the page (#171). history.back() lands a moment
// later, so while one overlay's Back is in flight the location still shows the
// entry it is leaving. A second overlay closing in that window (Escape on the
// drawer, then at once on the viewer under it) would act on that stale entry:
// it would replace it, and the pending Back would then land on the viewer's
// entry and reopen it. Instead the second close waits for the pop to land.
let leaving = null
const deferred = new Set()

function withoutMark(state, name) {
  if (!state || state[MARK] !== name) return state
  const { [MARK]: _drop, ...rest } = state
  return Object.keys(rest).length ? rest : null
}

/**
 * A full-screen overlay whose open state lives in one search param (#159), so
 * the browser's Back (Android back button, Safari back swipe) closes it instead
 * of leaving the page, and the overlay is deep-linkable.
 *
 * - `open(v)` pushes one history entry (`?name=v`, other params kept, e.g.
 *   `?demo=1`); if this hook already pushed the current entry it replaces it.
 * - `replace(v)` moves within the overlay (next photo) without a new entry.
 * - `close()` goes back when the entry was pushed here, so no dangling entry
 *   is left for Back to land on; on a deep link it removes the param in place.
 * - `leave(to)` navigates elsewhere with the overlay entry dropped, so Back
 *   from `to` returns to the page, not the overlay.
 *
 * Paths come from useLocation, so they are basename-relative (`/sable/`).
 */
export default function useOverlayParam(name) {
  const location = useLocation()
  const navigate = useNavigate()
  const value = new URLSearchParams(location.search).get(name)
  const pushed = location.state?.[MARK] === name
  // history.back() is asynchronous: until the pop lands, the location is
  // unchanged, so a second close (Escape and a swipe, a deleted item's own
  // close) would go back twice and leave the page. Cleared once the location
  // moves, because Forward brings back the very same entry key (codex review).
  const closingKey = useRef(null)
  useEffect(() => {
    closingKey.current = null
    if (leaving !== location.key) leaving = null
  }, [location.key])

  const target = useCallback((next) => {
    const params = new URLSearchParams(location.search)
    if (next == null) params.delete(name)
    else params.set(name, next)
    const search = params.toString()
    return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }
  }, [location.pathname, location.search, location.hash, name])

  const replace = useCallback((next) => {
    void navigate(target(next), { replace: true, state: location.state })
  }, [navigate, target, location.state])

  const open = useCallback((next) => {
    if (pushed) replace(next)
    else void navigate(target(next), { state: { ...location.state, [MARK]: name } })
  }, [pushed, replace, navigate, target, location.state, name])

  const close = useCallback(() => {
    if (value == null) return
    if (leaving === location.key) {
      // Our own close already in flight (a second Escape) is a no-op once it
      // lands; another overlay's is followed by ours, against the new entry.
      if (closingKey.current !== location.key) deferred.add(name)
      return
    }
    if (closingKey.current === location.key) return
    if (pushed) {
      closingKey.current = location.key
      leaving = location.key
      void navigate(-1)
    } else {
      void navigate(target(null), { replace: true, state: withoutMark(location.state, name) })
    }
  }, [value, pushed, navigate, target, location.key, location.state, name])

  // A close deferred by an overlay that then unmounted must not fire on the
  // next one to mount under the same name.
  useEffect(() => () => { deferred.delete(name) }, [name])

  useEffect(() => {
    if (leaving === location.key || !deferred.has(name)) return
    deferred.delete(name)
    close()
  }, [location.key, name, close])

  const leave = useCallback((to) => {
    if (pushed) {
      void navigate(to, { replace: true })
      return
    }
    if (value != null) void navigate(target(null), { replace: true, state: withoutMark(location.state, name) })
    void navigate(to)
  }, [pushed, value, navigate, target, location.state, name])

  return { value, open, replace, close, leave }
}
