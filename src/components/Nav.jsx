import { NavLink } from 'react-router-dom'
import { useTheme } from '../context/useTheme'

const links = [
  { to: '/', label: 'Gallery', icon: '◈' },
  { to: '/brief', label: 'Brief', icon: '◇' },
  { to: '/boards', label: 'Boards', icon: '▦' },
  { to: '/conventions', label: 'Radar', icon: '◎' },
  { to: '/concepts', label: 'AI', icon: '✦' },
  { to: '/manage', label: 'Manage', icon: '⊞' },
]

export default function Nav() {
  const { theme, toggle, fontSize, toggleFont } = useTheme()

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

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-ink-dark border-t border-ink-border safe-bottom">
        <div className="flex items-stretch max-w-screen-sm mx-auto">
          {links.map(({ to, label, icon }) => (
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
              <span className="tracking-widest uppercase text-[12px]">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
