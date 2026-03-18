import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Gallery', icon: '◈' },
  { to: '/brief', label: 'Brief', icon: '◇' },
  { to: '/conventions', label: 'Radar', icon: '◎' },
  { to: '/concepts', label: 'AI', icon: '✦' },
]

export default function Nav() {
  return (
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
            <span className="tracking-widest uppercase text-[10px]">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
