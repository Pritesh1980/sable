import { useRef, useState } from 'react'
import TagPill from './TagPill'
import { DEFAULT_STUDIOS } from '../data/artists'

function FilmstripRow({ artist, onOpen, index, onSetRank, isFirst, isLast, totalArtists }) {
  const scrollRef = useRef(null)
  const [editingRank, setEditingRank] = useState(false)
  const [rankInput, setRankInput] = useState('')
  const displayName = artist.name || `@${artist.handle}`
  const studio = artist.studio ? DEFAULT_STUDIOS.find((s) => s.id === artist.studio) : null
  const hasImages = artist.images?.length > 0
  const instagramUrl = `https://www.instagram.com/${artist.handle}/`

  function startEdit() {
    setRankInput(String(artist.rank))
    setEditingRank(true)
  }

  function commitRank() {
    setEditingRank(false)
    const n = parseInt(rankInput, 10)
    if (!isNaN(n) && n >= 1 && n <= totalArtists && n !== artist.rank) {
      onSetRank(artist.id, n)
    }
  }

  return (
    <div
      style={{ animationDelay: `${index * 0.04}s` }}
      className="animate-slide-up opacity-0 [animation-fill-mode:forwards] flex border-b border-ink-border/50 hover:bg-ink-card/30 transition-colors group"
    >
      {/* Rank controls */}
      <div className="w-12 shrink-0 flex flex-col items-center justify-center border-r border-ink-border/30 py-2">
        <button
          onClick={() => !isFirst && onSetRank(artist.id, artist.rank - 1)}
          className={`text-[10px] leading-none px-1 py-0.5 transition-colors ${
            isFirst ? 'text-transparent cursor-default' : 'text-cream-muted/30 hover:text-cream opacity-0 group-hover:opacity-100'
          }`}
        >
          ▲
        </button>
        {editingRank ? (
          <input
            autoFocus
            type="number"
            min={1}
            max={totalArtists}
            className="w-8 text-center bg-ink-muted border border-cream-muted/40 rounded-sm text-[12px] font-mono text-cream outline-none py-0.5"
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
            className="text-[12px] font-mono text-cream-muted/50 hover:text-cream hover:bg-ink-card/60 w-7 h-6 rounded-sm transition-colors flex items-center justify-center"
          >
            {artist.rank}
          </button>
        )}
        <button
          onClick={() => !isLast && onSetRank(artist.id, artist.rank + 1)}
          className={`text-[10px] leading-none px-1 py-0.5 transition-colors ${
            isLast ? 'text-transparent cursor-default' : 'text-cream-muted/30 hover:text-cream opacity-0 group-hover:opacity-100'
          }`}
        >
          ▼
        </button>
      </div>

      {/* Artist info */}
      <div
        className="w-44 shrink-0 px-3 py-4 border-r border-ink-border/30 cursor-pointer flex flex-col justify-center"
        onClick={() => onOpen(artist)}
      >
        <h3 className="font-display text-cream text-base leading-tight truncate mb-0.5">{displayName}</h3>
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[11px] text-cream-muted/60 hover:text-accent transition-colors mb-2"
        >
          @{artist.handle}
        </a>
        {studio && (
          <p className="font-mono text-[10px] text-cream-muted/40 tracking-widest mb-2">{studio.name}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {artist.tags?.map((t) => <TagPill key={t} tag={t} active small />)}
        </div>
      </div>

      {/* Scrollable image strip */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center gap-2 px-3 py-3 overflow-x-auto scrollbar-thin"
      >
        {hasImages ? (
          artist.images.map((src, i) => (
            <div
              key={i}
              className="shrink-0 w-24 h-24 lg:w-28 lg:h-28 xl:w-32 xl:h-32 rounded-sm overflow-hidden bg-ink-muted cursor-pointer hover:ring-1 hover:ring-cream-muted/30 transition-all"
              onClick={() => onOpen(artist)}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-24 lg:h-28 xl:h-32 w-full">
            <span className="text-cream-muted/20 font-mono text-xs tracking-widest">No images yet</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FilmstripView({ artists, onOpenArtist, onSetRank }) {
  return (
    <div className="mx-4 border border-ink-border/50 rounded-sm overflow-hidden">
      {artists.map((artist, i) => (
        <FilmstripRow
          key={artist.id}
          artist={artist}
          onOpen={onOpenArtist}
          onSetRank={onSetRank}
          index={i}
          isFirst={i === 0}
          isLast={i === artists.length - 1}
          totalArtists={artists.length}
        />
      ))}
    </div>
  )
}
