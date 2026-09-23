import { useRef } from 'react'
import { classifyGesture } from '../lib/gesture'

// Tap / swipe recognizer for the full-screen viewers (#93). Touch and pen only:
// mouse events pass straight through, so desktop behaviour is untouched.
// `enabled: false` (e.g. while pinch-zoomed, when a drag is a pan) ignores all.
// Returns pointer handlers to spread onto the gesture surface.
export default function useSwipeTap({ onTap, onSwipe, enabled = true }) {
  const startRef = useRef(null)
  // A second finger means a pinch; the whole gesture is void until every
  // finger is up again.
  const abandonedRef = useRef(false)
  const activeRef = useRef(new Set())

  function onPointerDown(e) {
    if (!enabled || e.pointerType === 'mouse') return
    activeRef.current.add(e.pointerId)
    if (activeRef.current.size > 1) {
      abandonedRef.current = true
      startRef.current = null
      return
    }
    abandonedRef.current = false
    startRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e) {
    if (e.pointerType === 'mouse') return
    activeRef.current.delete(e.pointerId)
    const start = startRef.current
    if (!enabled || !start || abandonedRef.current || start.id !== e.pointerId) return
    startRef.current = null
    const gesture = classifyGesture(e.clientX - start.x, e.clientY - start.y)
    if (gesture === 'tap') onTap?.()
    else if (gesture) onSwipe?.(gesture)
  }

  function onPointerCancel(e) {
    activeRef.current.delete(e.pointerId)
    startRef.current = null
  }

  return { onPointerDown, onPointerUp, onPointerCancel }
}
