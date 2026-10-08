import { useEffect, useState } from 'react'
import { resolveImage, resolveImageRef } from '../data/imageResolver'
import { refKey } from '../data/imageRef'

// useImageSrc for a list: the render status of each stored ref, in order
// ('ready' | 'loading' | 'unavailable' | 'none'), for callers that need to know
// which photos can be shown before rendering them — the concept viewer only
// swipes through pieces it can show (#102).
export default function useImageStatuses(refs = []) {
  const [settled, setSettled] = useState(() => new Map()) // key -> 'ready' | 'unavailable'
  const sync = refs.map((ref) => resolveImageRef(ref).status)
  const keys = refs.map(refKey)
  // A string, so a re-created list of the same refs does not restart anything.
  const pending = keys.filter((key, i) => key && sync[i] === 'loading' && !settled.has(key)).join('\n')

  useEffect(() => {
    if (!pending) return undefined
    let live = true
    for (const key of pending.split('\n')) {
      void resolveImage(key).then((src) => {
        if (live) setSettled((prev) => new Map(prev).set(key, src ? 'ready' : 'unavailable'))
      })
    }
    return () => {
      live = false
    }
  }, [pending])

  return sync.map((status, i) => (status === 'loading' ? settled.get(keys[i]) || 'loading' : status))
}
