import { useEffect, useRef, useState } from 'react'

// Tracks whether the user has been idle (no mousemove/keydown) for
// `timeoutMs`. Used to fade the wall-viewer HUD out of the way of the image.
// If the user prefers reduced motion, idle never becomes true — the HUD just
// stays put rather than animating.
export default function useIdleFade(timeoutMs = 2000) {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const reducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // No setIdle(false) here (#32) — `idle` already starts false, and this
    // branch never lets it become true, so re-asserting it on every effect
    // run was a no-op the lint rule (correctly) doesn't like seeing in an
    // effect body. `reducedMotion` stays computed inline rather than lifted
    // to state, so a caller that ever passes a changing `timeoutMs` still
    // gets it freshly re-evaluated on that re-run, same as before.
    if (reducedMotion) return undefined

    function reset() {
      setIdle(false)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIdle(true), timeoutMs)
    }

    reset()
    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)

    return () => {
      clearTimeout(timerRef.current)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [timeoutMs])

  return idle
}
