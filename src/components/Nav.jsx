import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/useTheme'

const PRIMARY_LINKS = [
  { to: '/', label: 'Home', icon: '◈' },
  { to: '/gallery', label: 'Artists', icon: '◇' },
  { to: '/brief', label: 'Brief', icon: '◇' },
  { to: '/conventions', label: 'Radar', icon: '◎' },
  { to: '/concepts', label: 'AI', icon: '✦' },
]

const MORE_LINKS = [
  { to: '/studios', label: 'Studios', icon: '⌂', description: 'Where your artists work' },
  { to: '/boards', label: 'Boards', icon: '▦', description: 'Mood boards & collections' },
  { to: '/manage', label: 'Manage', icon: '⊞', description: 'Artists, data & settings' },
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
            <span className="text-xl text-cream-muted leading-none w-6 text-center">{icon}</span>
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
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      {/* Accessibility + theme controls — fixed top-right */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-1.5">
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
      </div>

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
              <span className="text-base leading-none">{icon}</span>
              <span className="tracking-widest uppercase text-xs">{label}</span>
            </NavLink>
          ))}

          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-body transition-colors duration-200 ${
              moreOpen ? 'text-cream' : 'text-cream-muted hover:text-cream/70'
            }`}
          >
            <span className="text-base leading-none">⋯</span>
            <span className="tracking-widest uppercase text-xs">More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
