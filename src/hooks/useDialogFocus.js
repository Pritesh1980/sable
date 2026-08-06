import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/** Controls the undo toast may own while a dialog is open. The toast paints above
 *  modals but lives outside them, so a trap that ignored it would make Undo
 *  unreachable by keyboard until it expired (#58). A confirmation toast has no
 *  button, so this is empty and the trap behaves exactly as before. */
export function undoToastFocusables() {
  return [...document.querySelectorAll('[data-undo-toast] button:not([disabled])')]
}

/**
 * Whether this dialog should act on a Tab press. Listening on the document is
 * what lets Tab keep working once focus is on the toast, but it also means an
 * open dialog hears Tab presses meant for a *second* dialog stacked over it —
 * Concepts renders ReliefStlDrawer as a sibling of ConceptViewer. Only handle
 * focus that is ours, on the toast, or nowhere in particular.
 */
export function ownsFocus(container) {
  const active = document.activeElement
  if (!active || active === document.body) return true
  if (container.contains(active) || active === container) return true
  if (active.closest?.('[data-undo-toast]')) return true
  // Focus sits in some other dialog — leave it to that dialog's own trap.
  return !active.closest?.('[aria-modal="true"]')
}

// Dialog focus management for full-screen overlays (WallViewer,
// ConceptViewer): moves focus into the overlay on open, wraps Tab within it,
// and restores focus to the previously-focused element on close. Same
// Tab-wrap approach as Drawer.jsx.
export default function useDialogFocus(open) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const node = containerRef.current
    node?.focus()

    function handleKeyDown(e) {
      if (e.key !== 'Tab' || !containerRef.current) return
      if (!ownsFocus(containerRef.current)) return
      const focusable = [
        ...containerRef.current.querySelectorAll(FOCUSABLE),
        ...undoToastFocusables(),
      ]
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      // Drive the whole cycle rather than only wrapping at the ends: the toast is
      // a sibling of the routes, so leaving the middle steps to native Tab order
      // would depend on where it happens to sit in the DOM.
      e.preventDefault()
      const at = focusable.indexOf(document.activeElement)
      const step = e.shiftKey ? -1 : 1
      const next = at === -1
        ? (e.shiftKey ? focusable.length - 1 : 0)
        : (at + step + focusable.length) % focusable.length
      focusable[next].focus()
    }

    // Listens on the document rather than the dialog node: once focus is on the
    // toast — which is outside the node — a node-level listener would never see
    // the next Tab, and focus would escape the trap for good.
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [open])

  return containerRef
}
