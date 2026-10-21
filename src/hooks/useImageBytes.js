import { useEffect, useState } from 'react'
import { isSameOrigin, resolveImageBytes, resolveImageRef } from '../data/imageResolver'
import { refKey } from '../data/imageRef'

// A stored image ref -> { src, status } where `src` can be read back from a
// canvas or handed to WebGL (#114): a same-origin source, copied from the
// cross-origin url where needed. Use it where useImageSrc's plain display url
// would taint the canvas; use useImageSrc to simply show a photo.
//   status: 'ready' | 'loading' | 'unavailable' | 'none'
// A same-origin source is `ready` on the first render; anything else loads, and
// the copy it makes is released when the ref changes or the component unmounts.
export default function useImageBytes(ref) {
  const sync = resolveImageRef(ref)
  const readable = sync.status === 'ready' && isSameOrigin(sync.src)
  const needsAsync = sync.status === 'loading' || (sync.status === 'ready' && !readable)
  // A string, so the effect re-runs for a different photo and not for a
  // re-created but identical ref.
  const input = refKey(ref) || sync.src
  const [settled, setSettled] = useState(null) // { input, src }

  useEffect(() => {
    if (!needsAsync) return undefined
    let live = true
    let release = () => {}
    void resolveImageBytes(input).then((bytes) => {
      release = bytes.release
      if (live) setSettled({ input, src: bytes.src })
      else release()
    })
    return () => {
      live = false
      release()
    }
  }, [needsAsync, input])

  if (sync.status === 'none') return { src: '', status: 'none' }
  if (!needsAsync) return { src: sync.src, status: 'ready' }
  if (settled?.input === input) {
    return settled.src ? { src: settled.src, status: 'ready' } : { src: '', status: 'unavailable' }
  }
  return { src: '', status: 'loading' }
}
