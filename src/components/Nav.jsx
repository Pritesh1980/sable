import { useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Ellipsis } from 'lucide-react'
import { useEscapeToClose } from '../hooks/useDialogFocus'
import { PRIMARY_LINKS, MORE_GROUPS } from '../data/navLinks'

// One navigation for every page (#220): a bottom tab bar on a phone, the same
// list as a top bar from `md` up. The list itself lives in data/navLinks.js.
// `--nav-top` (index.css) is this bar's height on a laptop and 0 on a phone, so
// a page's own sticky header can sit under it.

const ITEM = 'flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 min-h-14 md:min-h-11 md:px-3 font-body text-xs md:text-sm tracking-widest md:tracking-wide uppercase md:normal-case transition-colors duration-200'
const tone = (on) => (on ? 'text-cream' : 'text-cream-muted hover:text-cream')

function MoreMenu({ onClose }) {
  const ref = useEscapeToClose(onClose)
  const id = useId()

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="More" className="fixed inset-0 z-40" onClick={onClose}>
      <div
        role="presentation"
        className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+4rem)] left-4 right-4 md:bottom-auto md:left-auto md:top-[calc(var(--nav-top)+0.5rem)] md:right-6 md:w-80 bg-ink-card border border-ink-border rounded-xs overflow-hidden animate-slide-up shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {MORE_GROUPS.map(({ label, links }) => (
          <div key={label} role="group" aria-labelledby={`${id}-${label}`} className="border-b border-ink-border last:border-b-0 py-2">
            <p id={`${id}-${label}`} className="px-5 pt-2 pb-1 font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase">{label}</p>
            {links.map(({ to, label: name, Icon, description }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) => `flex items-center gap-4 px-5 py-3 hover:bg-ink-muted transition-colors ${isActive ? 'text-accent' : 'text-cream'}`}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0">
                  <span className="block font-body text-sm">{name}</span>
                  <span className="block font-mono text-xs text-cream-muted mt-0.5">{description}</span>
                </span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Nav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const inMore = MORE_GROUPS.some((g) => g.links.some((l) => l.to === pathname))

  return (
    <>
      {moreOpen && <MoreMenu onClose={() => setMoreOpen(false)} />}

      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-50 bg-ink-dark border-t border-ink-border safe-bottom md:bottom-auto md:top-0 md:h-14 md:border-t-0 md:border-b"
      >
        <div className="flex items-stretch md:items-center md:h-full md:gap-2 md:px-6">
          <p aria-hidden="true" className="hidden md:block font-display text-xl tracking-[0.2em] uppercase text-cream mr-6">
            Sable<span className="text-accent">.</span>
          </p>

          {PRIMARY_LINKS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `${ITEM} ${tone(isActive)}`}>
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            data-current={inMore}
            className={`${ITEM} md:ml-auto ${tone(moreOpen || inMore)}`}
          >
            <Ellipsis size={20} strokeWidth={1.5} aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
