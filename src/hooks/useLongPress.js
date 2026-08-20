import { useEffect, useRef } from 'react'

const DEFAULT_DELAY = 500
const DEFAULT_MOVE_THRESHOLD = 10

/**
 * Press-and-hold recognizer (#71) — the universal iOS gesture for "rearrange
 * this grid" (Home Screen, Photos, Files). Returns pointer handlers to spread
 * onto the target, plus `consumeIfFired()` to swallow the click a completed
 * long-press produces, the same pattern SortableArtistCard already uses for
 * drag echoes (#54).
 *
 * Pointer events, not touch/mouse separately, so one implementation covers
 * touch and a mouse-held-down press alike. Cancels on release before the
 * delay, or on movement past `moveThreshold` — a real drag or a scroll must
 * not also fire this.
 *
 * `enabled` (cross-model review, #71): the caller's own gate — e.g. "not
 * already editing" — has to reach *into* the recognizer, not just decide
 * whether to attach the handlers in JSX. A timer armed the instant before
 * `enabled` flips false (editing just turned on some other way, or the card
 * is about to unmount) keeps running regardless of prop wiring and fires
 * later against a caller that no longer wants it.
 */
export function useLongPress(onLongPress, { delay = DEFAULT_DELAY, moveThreshold = DEFAULT_MOVE_THRESHOLD, enabled = true } = {}) {
  const timerRef = useRef(null)
  const startRef = useRef(null)
  // Recognizes one gesture at a time. Without pinning the pointer that armed
  // the timer, a second finger's pointerdown would silently adopt the first
  // finger's in-flight timer, and either finger's pointerup could cancel the
  // other's hold (cross-model review).
  const pointerIdRef = useRef(null)
  const firedRef = useRef(false)

  function clear() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
    pointerIdRef.current = null
  }

  // Covers both "enabled flipped false while a press was live" and unmount —
  // an effect cleanup runs on both a dependency change and teardown.
  useEffect(() => {
    if (!enabled) clear()
    return clear
  }, [enabled])

  function onPointerDown(e) {
    if (!enabled) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (pointerIdRef.current !== null) return // a press is already live
    // A stale `true` from a previous gesture whose click the browser ate
    // (cross-model review: iOS's own long-press callout can do this) must
    // not swallow this new, unrelated gesture's click.
    firedRef.current = false
    pointerIdRef.current = e.pointerId
    startRef.current = { x: e.clientX, y: e.clientY }
    timerRef.current = setTimeout(() => {
      // Clears pointer tracking too, not just the timer: once fired, there's
      // nothing left to cancel on move/up, and leaving pointerIdRef set would
      // block a *later* press's onPointerDown as "already live" if this
      // gesture's own pointerup/click never arrives (the callout scenario
      // above) — exactly the stale-armed state firedRef's own reset-on-next-
      // press is there to prevent.
      timerRef.current = null
      pointerIdRef.current = null
      startRef.current = null
      firedRef.current = true
      onLongPress(e)
    }, delay)
  }

  function isTrackedPointer(e) {
    return pointerIdRef.current !== null && e.pointerId === pointerIdRef.current
  }

  function onPointerMove(e) {
    if (!isTrackedPointer(e) || !startRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (Math.hypot(dx, dy) > moveThreshold) clear()
  }

  function onPointerUp(e) {
    if (!isTrackedPointer(e)) return
    clear()
  }

  function onPointerLeave(e) {
    if (!isTrackedPointer(e)) return
    clear()
  }

  // Call from the target's onClick, before acting on the click: true means
  // this click was the tail end of a just-completed long-press and must be
  // swallowed, not treated as a tap.
  function consumeIfFired() {
    if (!firedRef.current) return false
    firedRef.current = false
    return true
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, consumeIfFired }
}
