import { useEffect, useState } from 'react'
import { resolveImage, resolveImageRef } from '../data/imageResolver'
import { refKey } from '../data/imageRef'

// A stored image ref -> { src, status } for rendering (#113).
//   status: 'ready' | 'loading' | 'unavailable' | 'none'
//
// The first read is synchronous (display strings and already-cached blob keys
// are `ready` on the first render, so a warm grid never flashes). Only a blob
// key missing from the URL cache goes `loading`, then settles to `ready` or
// `unavailable`. `src` is '' unless the status is `ready` — a ref change never
// shows the previous image under the new one.
export default function useImageSrc(ref) {
  const sync = resolveImageRef(ref)
  // Keyed on the blob key string, not the ref object: callers re-create refs
  // (adding addedAt, re-mapping a list) and that must not restart a resolve.
  const key = refKey(ref)
  const needsAsync = sync.status === 'loading'
  const [settled, setSettled] = useState(null) // { key, src }

  useEffect(() => {
    if (!needsAsync) return undefined
    let live = true
    resolveImage(key).then((src) => {
      if (live) setSettled({ key, src })
    })
    return () => {
      live = false
    }
  }, [needsAsync, key])

  if (!needsAsync) return sync
  if (settled?.key === key) {
    return settled.src ? { src: settled.src, status: 'ready' } : { src: '', status: 'unavailable' }
  }
  return { src: '', status: 'loading' }
}
