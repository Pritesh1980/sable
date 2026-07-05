import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

// Slide-over "everything else" menu for the Wall's ⋯ button — everything the
// hairline bar doesn't surface directly (ideas, ranking, radar, studios, admin).
const LINKS = [
  { to: '/gallery', label: 'Classic gallery', description: 'Filmstrip, compare, grid & style-wall views' },
  { to: '/brief', label: 'Ideas', description: 'Your mood board and matched artists' },
  { to: '/pipeline', label: 'Pipeline', description: 'Shortlist stages and what to do next' },
  { to: '/conventions', label: 'Radar', description: 'Conventions near you' },
  { to: '/studios', label: 'Studios', description: 'Where your artists work' },
  { to: '/settings', label: 'Settings', description: 'Backup, account & sign out' },
  { to: '/help', label: 'Help', description: 'How to use Sable' },
]

export default function Drawer({ onClose }) {
  const panelRef = useRef(null)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll('a, button')
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    panelRef.current?.querySelector('a')?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      data-testid="drawer-backdrop"
      className="fixed inset-0 z-50 bg-black/60"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute top-0 right-0 bottom-0 w-full max-w-xs bg-v2-surface border-l border-v2-hairline overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-v2-hairline">
          <p className="font-v2-display text-v2-cream text-lg tracking-wide">Menu</p>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="text-v2-muted hover:text-v2-cream text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-col">
          {LINKS.map(({ to, label, description }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className="px-6 py-4 border-b border-v2-hairline last:border-b-0 hover:bg-v2-ink focus:bg-v2-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-v2-accent transition-colors"
            >
              <p className="font-v2-ui text-v2-cream text-sm">{label}</p>
              <p className="font-v2-ui text-v2-muted text-xs mt-0.5">{description}</p>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
