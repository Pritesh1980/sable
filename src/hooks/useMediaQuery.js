import { useCallback, useSyncExternalStore } from 'react'

function mql(query) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null
}

// Live boolean for a CSS media query; false where matchMedia is unavailable.
export default function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const m = mql(query)
    m?.addEventListener?.('change', onChange)
    return () => m?.removeEventListener?.('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => Boolean(mql(query)?.matches), () => false)
}
