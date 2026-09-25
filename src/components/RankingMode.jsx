import { useState, useRef, useEffect } from 'react'
import { computeSwipeRanking } from '../data/ranking'
import ArtistImage from './ArtistImage'
import GeneratedArtworkNotice from './GeneratedArtworkNotice'
import TagPill from './TagPill'
import { DEFAULT_STUDIOS } from '../data/artists'

function GroupSection({ label, items, accent }) {
  if (items.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <span className={`font-mono text-[0.6875rem] tracking-[0.35em] uppercase ${accent}`}>{label}</span>
        <span className="font-mono text-[0.6875rem] text-cream-muted/40">({items.length})</span>
        <div className="flex-1 h-px bg-ink-border" />
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1.5 font-body text-[0.8125rem] text-cream-muted bg-ink-card px-2 py-1 rounded-xs">
            {a.images?.[0] && <span className="w-5 h-5 rounded-xs overflow-hidden shrink-0"><ArtistImage src={a.images[0]} label={a.name || `@${a.handle}`} className="w-full h-full object-cover" monogramClassName="text-[0.625rem]" /></span>}
            {a.name || `@${a.handle}`}
          </span>
        ))}
      </div>
    </div>
  )
}

function SummaryScreen({ decisions, artists, onApply, onDiscard }) {
  const artistMap = Object.fromEntries(artists.map((a) => [a.id, a]))

  const groups = {
    top: decisions.filter((d) => d.bucket === 'top').map((d) => artistMap[d.artistId]),
    maybe: decisions.filter((d) => d.bucket === 'maybe').map((d) => artistMap[d.artistId]),
    pass: decisions.filter((d) => d.bucket === 'pass').map((d) => artistMap[d.artistId]),
  }

  const total = decisions.length

  return (
    <div className="fixed inset-0 z-50 bg-ink-black flex flex-col animate-fade-in">
      <div className="flex-1 overflow-y-auto px-5 pt-14 pb-4">
        <p className="font-mono text-[0.6875rem] text-accent tracking-[0.4em] uppercase mb-2">Ranking Complete</p>
        <h2 className="font-display text-4xl text-cream mb-8 leading-none">
          {total} artists<br />sorted
        </h2>
        <GeneratedArtworkNotice images={artists.flatMap((a) => a.images || [])} className="-mt-5 mb-7" />

        {/* Visual proportion bar */}
        <div className="flex h-1.5 rounded-full overflow-hidden mb-8 gap-px">
          {groups.top.length > 0 && (
            <div className="bg-accent h-full" style={{ flex: groups.top.length }} />
          )}
          {groups.maybe.length > 0 && (
            <div className="bg-cream-muted/50 h-full" style={{ flex: groups.maybe.length }} />
          )}
          {groups.pass.length > 0 && (
            <div className="bg-ink-border h-full" style={{ flex: groups.pass.length }} />
          )}
        </div>

        <GroupSection label="Top Tier" items={groups.top} accent="text-accent" />
        <GroupSection label="Maybe" items={groups.maybe} accent="text-cream-muted" />
        <GroupSection label="Pass" items={groups.pass} accent="text-cream-muted/40" />
      </div>

      <div className="shrink-0 px-5 pb-10 pt-4 border-t border-ink-border flex gap-3">
        <button
          onClick={onDiscard}
          className="flex-1 py-3.5 font-mono text-xs tracking-widest uppercase text-cream-muted/60 border border-ink-border rounded-xs hover:text-cream-muted transition-colors"
        >
          Discard
        </button>
        <button
          onClick={onApply}
          className="flex-1 py-3.5 font-mono text-xs tracking-widest uppercase text-cream border border-cream/30 rounded-xs hover:bg-cream/5 transition-colors"
        >
          Apply Ranking
        </button>
      </div>
    </div>
  )
}

export default function RankingMode({ artists, onClose, onApplyRanking }) {
  const queue = artists.filter((a) => a.images?.length > 0)

  const [currentIdx, setCurrentIdx] = useState(0)
  const [decisions, setDecisions] = useState([])
  const [transitioning, setTransitioning] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [hasDragged, setHasDragged] = useState(false)

  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const isDragging = useRef(false)
  const imageRowRef = useRef(null)
  // A touch starting inside the image row scrolls that row instead of
  // driving the swipe-decide gesture — set in onTouchStart, checked by
  // onTouchMove/onTouchEnd, and reset by onTouchEnd/onTouchCancel.
  const touchOwnedByRow = useRef(false)

  const artist = queue[currentIdx]
  const images = artist?.images || []

  function decide(bucket) {
    if (transitioning || !artist) return
    setDragX(0)
    const next = [...decisions, { artistId: artist.id, bucket }]
    setDecisions(next)
    setTransitioning(true)
    setTimeout(() => {
      const nextIdx = currentIdx + 1
      if (nextIdx >= queue.length) {
        setShowSummary(true)
      }
      setCurrentIdx(nextIdx)
      setTransitioning(false)
    }, 220)
  }

  function undo() {
    if (decisions.length === 0 || transitioning) return
    setDecisions((prev) => prev.slice(0, -1))
    setCurrentIdx((prev) => prev - 1)
  }

  function onTouchStart(e) {
    if (imageRowRef.current && imageRowRef.current.contains(e.target)) {
      touchOwnedByRow.current = true
      return
    }
    touchOwnedByRow.current = false
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isDragging.current = false
  }

  function onTouchMove(e) {
    if (touchOwnedByRow.current || touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    isDragging.current = true
    setHasDragged(true)
    setDragX(dx)
  }

  function onTouchEnd(e) {
    if (touchOwnedByRow.current) {
      touchOwnedByRow.current = false
      return
    }
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
      decide(dx > 0 ? 'top' : 'pass')
    } else if (dy < -80 && Math.abs(dy) > Math.abs(dx)) {
      decide('maybe')
    } else {
      setDragX(0)
    }
    touchStartX.current = null
  }

  // Mirrors onTouchEnd's "no decision" cleanup — an interrupted gesture
  // (e.g. the browser's own context menu) must not leave stale refs that
  // would skew the next gesture's delta calculation.
  function onTouchCancel() {
    touchOwnedByRow.current = false
    setDragX(0)
    touchStartX.current = null
    touchStartY.current = null
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft')  decide('pass')
      if (e.key === 'ArrowRight') decide('top')
      if (e.key === 'ArrowUp')    decide('maybe')
      if (e.key === 'Escape')     onClose()
      if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function handleApply() {
    onApplyRanking(computeSwipeRanking(decisions, artists))
    onClose()
  }

  if (showSummary) {
    return (
      <SummaryScreen
        decisions={decisions}
        artists={artists}
        onApply={handleApply}
        onDiscard={onClose}
      />
    )
  }

  if (!artist) return null

  const displayName = artist.name || `@${artist.handle}`
  const studio = artist.studio ? DEFAULT_STUDIOS.find((s) => s.id === artist.studio) : null
  const dragLabel = dragX > 50 ? 'TOP' : dragX < -50 ? 'PASS' : null
  const labelOpacity = Math.min(Math.abs(dragX) / 80, 1)

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-black flex flex-col animate-fade-in"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {/* Progress bar */}
      <div className="absolute top-0 inset-x-0 h-0.5 bg-ink-border z-20">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${(currentIdx / queue.length) * 100}%` }}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-5 pt-14 pb-4 bg-gradient-to-b from-ink-black/80 to-transparent pointer-events-none">
        <button
          onClick={onClose}
          className="pointer-events-auto font-body text-sm text-cream-muted hover:text-cream transition-colors tracking-widest uppercase"
        >
          Cancel
        </button>
        <div className="flex items-center gap-4">
          {decisions.length > 0 && (
            <button
              onClick={undo}
              className="pointer-events-auto font-mono text-[0.625rem] text-cream-muted/50 hover:text-cream-muted transition-colors tracking-widest uppercase"
            >
              ← Undo
            </button>
          )}
          <span className="font-mono text-xs text-cream-muted/60 tracking-widest">
            {currentIdx + 1} / {queue.length}
          </span>
        </div>
      </div>

      {/* Content: name/handle/studio/tags + a horizontal row of every
          reference image — a swipe/drag from anywhere in here except the
          image row itself still decides. */}
      <div
        key={currentIdx}
        className={`flex-1 relative overflow-hidden flex flex-col justify-center px-5 pt-16 transition-all duration-200 ${transitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        style={{
          transform: `rotate(${dragX * 0.025}deg) translateX(${dragX * 0.25}px)`,
        }}
      >
        <div className="mb-4">
          <h2 className="font-display text-3xl text-cream leading-tight">{displayName}</h2>
          <GeneratedArtworkNotice images={images} className="mt-1" />
          {artist.name && (
            <p className="font-mono text-[0.8125rem] text-cream-muted/50 mt-0.5">@{artist.handle}</p>
          )}
          {studio && (
            <p className="font-mono text-[0.6875rem] text-cream-muted/40 tracking-widest mt-1">{studio.name}</p>
          )}
          {artist.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {artist.tags.map((t) => <TagPill key={t} tag={t} active small />)}
            </div>
          )}
        </div>

        {images.length > 0 && (
          <div
            ref={imageRowRef}
            className="flex items-center gap-2.5 overflow-x-auto scrollbar-thin -mx-5 px-5 py-1"
          >
            {images.map((src, i) => (
              <div key={i} className="shrink-0 w-36 h-36 sm:w-44 sm:h-44 rounded-xs overflow-hidden bg-ink-muted">
                <ArtistImage src={src} label={displayName} className="w-full h-full object-cover" monogramClassName="text-4xl" />
              </div>
            ))}
          </div>
        )}

        {/* Drag decision label */}
        {dragLabel && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: labelOpacity }}
          >
            <span
              className={`font-display text-5xl font-bold border-4 px-5 py-2 rotate-[-12deg] ${
                dragX > 0
                  ? 'text-accent border-accent'
                  : 'text-cream-muted/60 border-cream-muted/40'
              }`}
            >
              {dragLabel}
            </span>
          </div>
        )}

        {/* Swipe hint (first card only) */}
        {currentIdx === 0 && !hasDragged && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
            <p className="font-mono text-[0.6875rem] text-cream-muted/30 tracking-widest uppercase">
              swipe to rank
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="shrink-0 px-5 pt-5 pb-10 bg-gradient-to-t from-ink-black via-ink-black to-transparent border-t border-ink-border">
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => decide('pass')}
            className="py-4 flex flex-col items-center gap-1 font-mono tracking-widest uppercase text-cream-muted/60 bg-ink-card border border-ink-border rounded-xs hover:border-cream-muted/40 hover:text-cream-muted transition-colors active:scale-95"
          >
            <span className="text-xl leading-none">←</span>
            <span className="text-[0.6875rem]">Pass</span>
            <span className="text-[0.625rem] text-cream-muted/30 hidden sm:block">arrow left</span>
          </button>
          <button
            onClick={() => decide('maybe')}
            className="py-4 flex flex-col items-center gap-1 font-mono tracking-widest uppercase text-cream bg-ink-card border border-cream-muted/30 rounded-xs hover:border-cream-muted/60 hover:bg-cream/5 transition-colors active:scale-95"
          >
            <span className="text-xl leading-none">↑</span>
            <span className="text-[0.6875rem]">Maybe</span>
            <span className="text-[0.625rem] text-cream-muted/30 hidden sm:block">arrow up</span>
          </button>
          <button
            onClick={() => decide('top')}
            className="py-4 flex flex-col items-center gap-1 font-mono tracking-widest uppercase text-accent bg-accent/5 border border-accent/50 rounded-xs hover:bg-accent/15 hover:border-accent transition-colors active:scale-95"
          >
            <span className="text-xl leading-none">→</span>
            <span className="text-[0.6875rem]">Top</span>
            <span className="text-[0.625rem] text-accent/40 hidden sm:block">arrow right</span>
          </button>
        </div>
      </div>
    </div>
  )
}
