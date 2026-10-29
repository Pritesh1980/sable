import { useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

// Marks a history entry this hook pushed, so closing knows whether the entry
// underneath is the same page without the overlay (go back) or something else
// entirely, e.g. a deep link opened in a fresh tab (replace in place).
const MARK = 'sableOverlay'

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
  // close) would go back twice and leave the page.
  const closingKey = useRef(null)

  const target = useCallback((next) => {
    const params = new URLSearchParams(location.search)
    if (next == null) params.delete(name)
    else params.set(name, next)
    const search = params.toString()
    return { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }
  }, [location.pathname, location.search, location.hash, name])

  const replace = useCallback((next) => {
    navigate(target(next), { replace: true, state: location.state })
  }, [navigate, target, location.state])

  const open = useCallback((next) => {
    if (pushed) replace(next)
    else navigate(target(next), { state: { ...location.state, [MARK]: name } })
  }, [pushed, replace, navigate, target, location.state, name])

  const close = useCallback(() => {
    if (value == null || closingKey.current === location.key) return
    if (pushed) {
      closingKey.current = location.key
      navigate(-1)
    } else {
      navigate(target(null), { replace: true, state: withoutMark(location.state, name) })
    }
  }, [value, pushed, navigate, target, location.key, location.state, name])

  const leave = useCallback((to) => {
    if (pushed) {
      navigate(to, { replace: true })
      return
    }
    if (value != null) navigate(target(null), { replace: true, state: withoutMark(location.state, name) })
    navigate(to)
  }, [pushed, value, navigate, target, location.state, name])

  return { value, open, replace, close, leave }
}
