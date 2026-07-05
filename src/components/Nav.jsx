import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../context/useTheme'
import { useAuth } from '../context/useAuth'

// Four tabs mirror the workflow: see what's next, curate artists, match ideas,
// generate concepts. Everything reference/admin lives under More.
const PRIMARY_LINKS = [
  { to: '/', label: 'Home', icon: '◈' },
  { to: '/gallery', label: 'Artists', icon: '◇' },
  { to: '/brief', label: 'Ideas', icon: '✎' },
  { to: '/concepts', label: 'AI', icon: '✦' },
]

const MORE_LINKS = [
  { to: '/conventions', label: 'Radar', icon: '◎', description: 'Conventions near you' },
  { to: '/studios', label: 'Studios', icon: '⌂', description: 'Where your artists work' },
  { to: '/settings', label: 'Settings', icon: '⚙', description: 'Backup, account & sign out' },
  { to: '/help', label: 'Help', icon: '?', description: 'How to use Sable' },
]

function MoreMenu({ onClose }) {
  const navigate = useNavigate()

  function go(to) {
    navigate(to)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+3.5rem)] left-4 right-4 max-w-2xl mx-auto bg-ink-card border border-ink-border rounded-sm overflow-hidden animate-slide-up shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {MORE_LINKS.map(({ to, label, icon, description }) => (
          <button
            key={to}
            onClick={() => go(to)}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-ink-muted transition-colors border-b border-ink-border last:border-b-0 text-left"
          >
            <span aria-hidden="true" className="text-xl text-cream-muted leading-none w-6 text-center">{icon}</span>
            <div>
              <p className="font-body text-cream text-sm">{label}</p>
              <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Nav() {
  const { theme, toggle, fontSize, toggleFont } = useTheme()
  const auth = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  // The Wall (/) is chrome-free — its own hairline bar is the nav.
  if (location.pathname === '/') return null

  return (
    <>
      {moreOpen && <MoreMenu onClose={() => setMoreOpen(false)} />}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-ink-dark border-t border-ink-border safe-bottom">
        <div className="flex items-stretch max-w-2xl mx-auto">
          {PRIMARY_LINKS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-body transition-colors duration-200 ${
                  isActive ? 'text-cream' : 'text-cream-muted hover:text-cream/70'
                }`
              }
            >
              <span aria-hidden="true" className="text-base leading-none">{icon}</span>
              <span className="tracking-widest uppercase text-xs">{label}</span>
            </NavLink>
          ))}

          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-body transition-colors duration-200 ${
              moreOpen ? 'text-cream' : 'text-cream-muted hover:text-cream/70'
            }`}
          >
            <span aria-hidden="true" className="text-base leading-none">⋯</span>
            <span className="tracking-widest uppercase text-xs">More</span>
          </button>

          {/* Accessibility + theme controls — chrome lives in chrome, so these
              can never float over page content (they used to be fixed top-right). */}
          <div className="flex items-center gap-1.5 pl-3 pr-2 border-l border-ink-border">
            <button
              onClick={toggleFont}
              title={fontSize === 'large' ? 'Reduce font size' : 'Increase font size'}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-card border border-ink-border text-cream-muted hover:text-cream transition-colors duration-200 font-mono text-xs font-bold leading-none"
            >
              {fontSize === 'large' ? 'A−' : 'A+'}
            </button>
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-card border border-ink-border text-cream-muted hover:text-cream transition-colors duration-200 text-sm"
            >
              {theme === 'dark' ? '◑' : '◐'}
            </button>
            {auth?.user && (
              <button
                onClick={() => auth.signOut()}
                title={`Sign out (${auth.user.email})`}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-card border border-ink-border text-cream-muted hover:text-accent transition-colors duration-200 text-sm"
              >
                ⏻
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
