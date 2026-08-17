import { useEffect, useRef, useState } from 'react'

// Tracks whether the user has been idle (no mousemove/keydown) for
// `timeoutMs`. Used to fade the wall-viewer HUD out of the way of the image.
// If the user prefers reduced motion, idle never becomes true — the HUD just
// stays put rather than animating.
export default function useIdleFade(timeoutMs = 2000) {
  // Read once at mount (#32) rather than inside the effect below: `idle`
  // already starts false, so re-asserting it there on every effect run was a
  // no-op setState the moment the effect fires — the actual behaviour this
  // gates is simply "run the activity-timer logic at all".
  const [reducedMotion] = useState(() => (
    typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))
  const [idle, setIdle] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
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
  }, [timeoutMs, reducedMotion])

  return idle
}
