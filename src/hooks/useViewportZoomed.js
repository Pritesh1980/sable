import { useSyncExternalStore } from 'react'

function subscribe(onChange) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  vv?.addEventListener('resize', onChange)
  return () => vv?.removeEventListener('resize', onChange)
}

// True while the user has pinch-zoomed the page (visual viewport scale > 1).
export default function useViewportZoomed() {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && (window.visualViewport?.scale ?? 1) > 1.01),
    () => false
  )
}
