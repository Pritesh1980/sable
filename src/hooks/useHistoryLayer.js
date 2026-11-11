import { useEffect, useRef } from 'react'
import useOverlayParam from './useOverlayParam'

/**
 * Gives a layer whose contents can't live in the URL (a drawer holding a
 * picked image, a camera stream) its own history entry, so the browser's Back
 * closes that layer and nothing under it (#171). `active` is the layer's
 * current value (a short string), or null when it is closed; it stays the
 * source of truth, and the URL follows it:
 *
 * - null → value pushes `?name=value`; value → other value replaces it.
 * - value → null (closed from the UI) goes back over the entry it pushed.
 * - The param leaving the URL while the layer is open is Back: `onPop` runs
 *   and must close the layer.
 * - Arriving on the param with the layer closed (a reload, a shared link,
 *   Forward onto an entry that was closed) can't rebuild it, so the param is
 *   dropped: in place on a link, by going back on an entry pushed here.
 *
 * Two layers stack when each uses its own `name` (the drawer and the camera
 * over it): each entry carries its own marker, so Back peels one at a time.
 *
 * Back is also caught from the browser's own popstate, not only from the
 * rendered URL: the router renders location changes as transitions, so a
 * push and a Back straight after it (Escape, reopen, Back) can land in one
 * render that never shows the param, and the layer would stay open over a
 * page whose URL had already left it.
 */
export default function useHistoryLayer(name, active, onPop) {
  const layer = useOverlayParam(name)
  const layerRef = useRef(layer)
  const onPopRef = useRef(onPop)
  useEffect(() => {
    layerRef.current = layer
    onPopRef.current = onPop
  })

  // What this layer last put in the URL (or is putting there: navigation
  // lands a render later, so this is written before the URL catches up).
  const shown = useRef(null)
  useEffect(() => {
    const was = shown.current
    if (active === was) return
    shown.current = active
    if (active && !was) layerRef.current.open(active)
    else if (active) layerRef.current.replace(active)
    else layerRef.current.close()
  }, [active])

  useEffect(() => {
    const onPopState = () => {
      if (!shown.current || new URLSearchParams(window.location.search).has(name)) return
      shown.current = null
      onPopRef.current?.()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [name])

  const seen = useRef(layer.value)
  useEffect(() => {
    const previous = seen.current
    seen.current = layer.value
    if (previous && !layer.value && shown.current) {
      shown.current = null
      onPopRef.current?.()
    } else if (layer.value && !shown.current) {
      layerRef.current.close()
    }
  }, [layer.value])
}
