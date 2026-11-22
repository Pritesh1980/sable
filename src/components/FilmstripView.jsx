import { useEffect, useRef, useState } from 'react'
import ArtistImage from './ArtistImage'
import { useFocusOnOpen } from '../hooks/useDialogFocus'
import { activateOnKey } from '../a11y/activate'

function FilmstripRow({ artist, onOpen, index, onSetRank, onNudge, isFirst, isLast, totalArtists, onRowMouseLeave }) {
  const scrollRef = useRef(null)
  const [editingRank, setEditingRank] = useState(false)
  const rankInputRef = useFocusOnOpen(editingRank)
  const [rankInput, setRankInput] = useState('')
  const displayName = artist.name || `@${artist.handle}`
  const hasImages = artist.images?.length > 0

  function startEdit() {
    setRankInput(String(artist.rank))
    setEditingRank(true)
  }

  function commitRank() {
    setEditingRank(false)
    const n = Number.parseInt(rankInput, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalArtists && n !== artist.rank) {
      onSetRank(artist.id, n)
    }
  }

  return (
    // #220 E: stacked. The row used to be a rank column, a 160px info column and
    // 96px photos, which on a phone left the pictures about half the width. Now
    // one thin line names the artist and the photos get the full row. The handle,
    // studio and style tags live on the artist's own page.
    <div
      data-testid="filmstrip-row"
      style={{ animationDelay: `${index * 0.04}s` }}
      className="animate-slide-up opacity-0 [animation-fill-mode:forwards] flex flex-col border-b border-ink-border/50 hover:bg-ink-card/30 transition-colors group"
      onMouseLeave={onRowMouseLeave}
    >
      <div className="flex items-center gap-1 pl-1 pr-2">
        {editingRank ? (
          <input
            ref={rankInputRef}
            type="number"
            min={1}
            max={totalArtists}
            aria-label={`Rank for ${displayName}`}
            className="w-11 text-center bg-ink-muted border border-cream-muted/40 rounded-xs text-xs font-mono text-cream outline-hidden focus-visible:ring-2 focus-visible:ring-accent py-0.5"
            value={rankInput}
            onChange={(e) => setRankInput(e.target.value)}
            onBlur={commitRank}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRank()
              if (e.key === 'Escape') setEditingRank(false)
            }}
          />
        ) : (
          <button
            onClick={startEdit}
            title="Click to set rank"
            className="shrink-0 text-xs font-mono text-cream-muted hover:text-cream hover:bg-ink-card/60 w-11 h-11 rounded-xs transition-colors flex items-center justify-center"
          >
            {artist.rank}
          </button>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${displayName}`}
          className="flex-1 min-w-0 min-h-11 flex items-center cursor-pointer"
          onClick={() => onOpen(artist)}
          onKeyDown={activateOnKey(() => onOpen(artist))}
        >
          <h3 className="font-display text-cream text-base leading-tight truncate">{displayName}</h3>
        </div>

        <button
          onClick={() => !isFirst && onNudge(artist, index, -1)}
          aria-label={`Move ${displayName} up`}
          className={`shrink-0 text-[0.625rem] leading-none w-11 h-11 flex items-center justify-center transition-colors ${
            isFirst ? 'text-transparent cursor-default' : 'text-cream-muted/60 hover:text-cream can-hover:opacity-0 group-hover:opacity-100'
          }`}
        >
          ▲
        </button>
        <button
          onClick={() => !isLast && onNudge(artist, index, 1)}
          aria-label={`Move ${displayName} down`}
          className={`shrink-0 text-[0.625rem] leading-none w-11 h-11 flex items-center justify-center transition-colors ${
            isLast ? 'text-transparent cursor-default' : 'text-cream-muted/60 hover:text-cream can-hover:opacity-0 group-hover:opacity-100'
          }`}
        >
          ▼
        </button>
      </div>

      {/* Scrollable image strip */}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-3 pb-3 overflow-x-auto scrollbar-thin"
      >
        {hasImages ? (
          artist.images.map((src, i) => (
            <div
              key={i}
              data-testid="filmstrip-photo"
              role="button"
              tabIndex={0}
              aria-label={`Open ${displayName}`}
              className="shrink-0 w-[58vw] h-[58vw] md:w-52 md:h-52 xl:w-60 xl:h-60 rounded-xs overflow-hidden bg-ink-muted cursor-pointer hover:ring-1 hover:ring-cream-muted/30 transition-all"
              onClick={() => onOpen(artist)}
              onKeyDown={activateOnKey(() => onOpen(artist))}
            >
              <ArtistImage src={src} sizes="(min-width: 1280px) 240px, (min-width: 768px) 208px, 58vw" label={displayName} className="w-full h-full object-cover" monogramClassName="text-3xl" />
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-20 w-full">
            <span className="text-cream-muted/40 font-mono text-xs tracking-widest">No images yet</span>
          </div>
        )}
      </div>
    </div>
  )
}

const NUDGE_IDLE_RELEASE_MS = 700

// ▲/▼ nudge a rank, which reorders `artists` and moves the clicked row to a
// new screen position — but the pointer doesn't move with it. Without this,
// a second click at the same screen spot (rapid clicking, no mouse movement)
// can land on a different artist's button. While a row is being actively
// nudged, its screen position is pinned to where it started; only once
// nudging stops (idle timeout, or the mouse leaves that row) does it settle
// into its real sorted position. `pinnedId` must be React state — release
// happens from a timeout or a mouse event outside any row's own render, and
// only a state change (not a ref mutation) repaints to reflect it.
export default function FilmstripView({ artists, onOpenArtist, onSetRank }) {
  const [pinnedId, setPinnedId] = useState(null)
  const [pinnedIndex, setPinnedIndex] = useState(null)
  const idleTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(idleTimerRef.current), [])

  // The pinned artist can disappear from `artists` between renders (filtered
  // out, removed). Adjusting state during render, same pattern already used
  // in ArtistImage.jsx: comparing against the latest props and correcting
  // before this render's output is used, rather than rendering stale then
  // fixing it a tick later in an effect.
  if (pinnedId && !artists.some((a) => a.id === pinnedId)) {
    setPinnedId(null)
    setPinnedIndex(null)
  }

  let displayArtists = artists
  if (pinnedId) {
    const rest = artists.slice()
    const at = rest.findIndex((a) => a.id === pinnedId)
    const [pinned] = rest.splice(at, 1)
    const insertAt = Math.max(0, Math.min(rest.length, pinnedIndex ?? at))
    rest.splice(insertAt, 0, pinned)
    displayArtists = rest
  }

  function handleNudge(artist, displayIndex, delta) {
    if (pinnedId !== artist.id) {
      setPinnedId(artist.id)
      setPinnedIndex(displayIndex)
    }
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      setPinnedId(null)
      setPinnedIndex(null)
    }, NUDGE_IDLE_RELEASE_MS)
    // Read from the live artist passed in this render, never a value
    // captured when the pin started — otherwise rapid clicks would keep
    // requesting the same rank instead of advancing.
    onSetRank(artist.id, artist.rank + delta)
  }

  function releasePin(artistId) {
    if (pinnedId !== artistId) return
    clearTimeout(idleTimerRef.current)
    setPinnedId(null)
    setPinnedIndex(null)
  }

  return (
    <div className="mx-4 border border-ink-border/50 rounded-xs overflow-hidden">
      {displayArtists.map((artist, i) => (
        <FilmstripRow
          key={artist.id}
          artist={artist}
          onOpen={onOpenArtist}
          onSetRank={onSetRank}
          onNudge={handleNudge}
          onRowMouseLeave={() => releasePin(artist.id)}
          index={i}
          isFirst={artist.rank <= 1}
          isLast={artist.rank >= artists.length}
          totalArtists={artists.length}
        />
      ))}
    </div>
  )
}
