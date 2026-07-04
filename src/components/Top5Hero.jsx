import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ARTIST_STATUSES, normalizeArtistStatus } from '../data/planning'
import { resolveTransitionMode } from '../lib/gl'

// three.js lives in this lazily-imported chunk only — never in the initial bundle.
const Top5Coverflow = lazy(() => import('./Top5Coverflow'))

const artistLabel = (a) => a?.name || `@${a?.handle}`
const statusLabel = (s) =>
  ARTIST_STATUSES.find((x) => x.value === normalizeArtistStatus(s))?.label || ''

// A single cover that degrades to the rank glyph if the image is absent or
// fails to load (e.g. the public build ships without the curated seed images).
function CoverTile({ item }) {
  const [failed, setFailed] = useState(false)
  if (item.image && !failed) {
    return (
      <img
        src={item.image}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className="flex items-center justify-center w-full h-full bg-ink-card text-cream-muted/50 font-display text-2xl">
      {item.rank}
    </span>
  )
}

// Flat, dependency-free gallery. Shown while the WebGL chunk loads, and as the
// permanent experience for offline / no-WebGL / reduced-motion users.
function StaticGallery({ items, activeIndex, onSelect }) {
  return (
    <div className="flex items-center justify-center gap-2 h-[62vh] min-h-[440px] py-4">
      {items.map((item, i) => {
        const focused = i === activeIndex
        return (
          <button
            key={item.id}
            onClick={() => onSelect(i)}
            aria-label={`Focus ${item.label} (rank ${item.rank})`}
            aria-pressed={focused}
            className={`relative shrink-0 overflow-hidden rounded-sm border transition-all duration-300 ${
              focused
                ? 'border-accent/60 w-[68%] max-w-md h-full'
                : 'border-ink-border w-16 sm:w-20 h-2/3 opacity-50 hover:opacity-90'
            }`}
          >
            <CoverTile item={item} />
            <span className="absolute top-1 left-1.5 font-display text-cream text-lg drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {item.rank}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function Top5Hero({ artists = [], bench = [], onDropOut, onPullIn }) {
  // Client-only SPA — safe to probe WebGL/reduced-motion in the initializer.
  // Shares the single gl gate (src/lib/gl.js) with the viewer transition layer:
  // 'webgl' → three.js coverflow, anything else → the static fallback.
  const [mode] = useState(() => (resolveTransitionMode() === 'webgl' ? 'webgl' : 'static'))
  const [activeIndex, setActiveIndex] = useState(0)

  const items = useMemo(
    () => artists.map((a) => ({ id: a.id, image: a.images?.[0], label: artistLabel(a), rank: a.rank, status: a.status })),
    [artists],
  )

  // Clamp at read time — the list can shrink under us (e.g. a drop-out) without
  // needing a state-sync effect.
  const safeIndex = items.length ? Math.max(0, Math.min(activeIndex, items.length - 1)) : 0

  if (items.length === 0) {
    return (
      <p className="text-cream-muted/90 text-sm font-body py-6">
        Rank your artists to see your{' '}
        <Link to="/gallery" className="text-accent hover:text-accent-hover underline underline-offset-4">top five</Link>.
      </p>
    )
  }

  const focused = artists[safeIndex]

  return (
    <div>
      <div className="bg-ink-card/40 border border-ink-border rounded-sm overflow-hidden">
        {mode === 'webgl' ? (
          <Suspense fallback={<StaticGallery items={items} activeIndex={safeIndex} onSelect={setActiveIndex} />}>
            <Top5Coverflow items={items} activeIndex={safeIndex} onSelect={setActiveIndex} />
          </Suspense>
        ) : (
          <StaticGallery items={items} activeIndex={safeIndex} onSelect={setActiveIndex} />
        )}
      </div>

      {/* Focused artist — info + drop-out act on whichever card is centred. */}
      {focused && (
        <div className="flex items-center gap-3 mt-3">
          <span className="font-display text-3xl text-accent leading-none shrink-0">#{focused.rank}</span>
          <div className="min-w-0 flex-1">
            <Link to="/gallery" className="font-display text-cream text-xl leading-tight truncate block hover:text-accent-hover">
              {artistLabel(focused)}
            </Link>
            <p className="font-mono text-[0.6875rem] text-cream-muted/80 tracking-widest uppercase">
              {statusLabel(focused.status)}
            </p>
          </div>
          {onDropOut && (
            <button
              onClick={() => onDropOut(focused.id)}
              aria-label={`Move ${artistLabel(focused)} out of your top 5`}
              title="Move out of top 5"
              className="font-mono text-xs text-cream-muted/70 hover:text-accent border border-ink-border hover:border-accent/40 rounded-sm px-3 py-2 shrink-0 transition-colors"
            >
              Drop ↓
            </button>
          )}
        </div>
      )}

      {bench.length > 0 && onPullIn && (
        <div className="mt-4 pt-3 border-t border-ink-border/60">
          <p className="font-mono text-[0.625rem] text-cream-muted/70 tracking-widest uppercase mb-2">Waiting in the wings</p>
          <div className="flex flex-wrap gap-1.5">
            {bench.map((artist) => (
              <button
                key={artist.id}
                onClick={() => onPullIn(artist.id)}
                aria-label={`Move ${artistLabel(artist)} into your top 5`}
                title="Move into top 5"
                className="flex items-center gap-1.5 font-mono text-xs text-cream-muted hover:text-cream border border-ink-border hover:border-accent/40 rounded-sm px-2 py-1 transition-colors"
              >
                <span aria-hidden="true" className="text-accent">↑</span>
                {artistLabel(artist)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
