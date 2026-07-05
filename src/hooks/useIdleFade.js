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

    if (reducedMotion) {
      setIdle(false)
      return undefined
    }

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
