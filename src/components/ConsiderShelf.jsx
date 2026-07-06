import { useMemo, useState } from 'react'
import { buildSuggestions } from '../data/suggestions'

const COLLAPSE_KEY = 'tattoo_consider_collapsed' // device-local UI preference, like tattoo_theme

// The Wall's "Consider" shelf — a quiet strip of suggested artists matched to
// the collection's style profile. Renders nothing when there's nothing to
// suggest; never competes with the collection above it. Suggestions are
// research-sourced, so the handle links out to Instagram for a look before
// adding (verify-before-add).
export default function ConsiderShelf({ artists, pool, dismissed = [], onDismiss, onAdd, children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const suggestions = useMemo(
    () => buildSuggestions(artists, { pool, dismissed }),
    [artists, pool, dismissed]
  )

  if (suggestions.length === 0 && !children) return null

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      return !c
    })
  }

  return (
    <section aria-label="Artists to consider" className="px-[6px] pt-4 pb-2 border-b border-v2-hairline">
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        className="w-full flex items-baseline gap-3 px-3 mb-1 text-left group/toggle"
      >
        <h2 className="font-v2-display text-v2-cream text-sm uppercase tracking-[0.28em]">Consider</h2>
        <span className="font-v2-ui text-v2-muted text-xs">
          {collapsed
            ? `${suggestions.length} suggested artist${suggestions.length === 1 ? '' : 's'} — tap to open`
            : 'matched to the styles you already collect — open the profile before adding'}
        </span>
        <span aria-hidden="true" className="ml-auto font-v2-ui text-v2-muted group-hover/toggle:text-v2-cream text-xs transition-colors">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
      <div className="flex gap-[6px] overflow-x-auto pb-2">
        {suggestions.map((s) => (
          <article
            key={s.handle}
            className="shrink-0 w-64 bg-v2-surface border border-v2-hairline rounded-sm px-4 py-3.5"
          >
            <h3 className="font-v2-display text-v2-cream text-[0.95rem] uppercase tracking-[0.12em] leading-tight truncate">
              {s.name}
              {s.source === 'ai' && (
                <span className="font-v2-ui text-v2-accent text-[0.6rem] tracking-[0.08em] normal-case align-middle ml-2 border border-v2-accent/50 rounded-full px-1.5 py-px">
                  unverified
                </span>
              )}
            </h3>
            <a
              href={`https://www.instagram.com/${s.handle}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-v2-ui text-v2-muted hover:text-v2-cream text-xs tracking-[0.06em] transition-colors"
            >
              @{s.handle} ↗
            </a>
            {s.note && (
              <p className="font-v2-ui text-v2-muted text-xs mt-1.5 leading-snug line-clamp-2">{s.note}</p>
            )}
            <p className="font-v2-ui text-v2-muted text-[0.65rem] uppercase tracking-[0.1em] mt-1.5 truncate">
              {s.tags.join(' · ')}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onAdd(s)}
                className="font-v2-ui text-xs text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-3 py-1.5 transition-colors"
              >
                + Add
              </button>
              <button
                onClick={() => onDismiss(s.handle)}
                title="Don't suggest this artist again"
                className="font-v2-ui text-xs text-v2-muted hover:text-v2-cream rounded-sm px-2 py-1.5 transition-colors"
              >
                Not for me
              </button>
            </div>
          </article>
        ))}
        {children}
      </div>
      )}
    </section>
  )
}
