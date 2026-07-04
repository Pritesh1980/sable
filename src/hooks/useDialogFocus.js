import { useEffect, useRef } from 'react'

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
      const focusable = containerRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === containerRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node?.addEventListener('keydown', handleKeyDown)
    return () => {
      node?.removeEventListener('keydown', handleKeyDown)
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [open])

  return containerRef
}
