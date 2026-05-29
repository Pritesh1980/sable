import { useState } from 'react'
import TagPill from './TagPill'
import { DEFAULT_STUDIOS } from '../data/artists'

function CompareColumn({ artist, onOpen, onRemove }) {
  const displayName = artist.name || `@${artist.handle}`
  const studio = artist.studio ? DEFAULT_STUDIOS.find((s) => s.id === artist.studio) : null
  const instagramUrl = `https://www.instagram.com/${artist.handle}/`

  return (
    <div className="flex flex-col border border-ink-border/50 rounded-sm overflow-hidden bg-ink-card/20 min-w-0">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-ink-black border-b border-ink-border/50 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 cursor-pointer" onClick={() => onOpen(artist)}>
            <h3 className="font-display text-cream text-lg leading-tight truncate">{displayName}</h3>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[0.6875rem] text-cream-muted/60 hover:text-accent transition-colors"
            >
              @{artist.handle}
            </a>
            {studio && (
              <p className="font-mono text-[0.625rem] text-cream-muted/40 tracking-widest mt-0.5">{studio.name}</p>
            )}
          </div>
          <button
            onClick={onRemove}
            className="text-cream-muted/40 hover:text-accent text-sm transition-colors shrink-0 mt-1"
            title="Remove from comparison"
          >
            ×
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {artist.tags?.map((t) => <TagPill key={t} tag={t} active small />)}
        </div>
      </div>

      {/* Scrollable images */}
      <div className="flex-1 overflow-y-auto p-2">
        {artist.images?.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {artist.images.map((src, i) => (
              <div key={i} className="aspect-square bg-ink-muted rounded-sm overflow-hidden">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <span className="text-cream-muted/20 font-mono text-xs tracking-widest">No images</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ArtistPicker({ artists, selected, onSelect }) {
  const [search, setSearch] = useState('')
  const available = artists.filter(
    (a) => !selected.includes(a.id) &&
      (a.name?.toLowerCase().includes(search.toLowerCase()) ||
       a.handle.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col border border-dashed border-ink-border/50 rounded-sm min-w-0 items-center justify-center p-4">
      <p className="text-cream-muted/40 font-mono text-xs tracking-widest uppercase mb-3">Add artist</p>
      <input
        className="w-full max-w-xs bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/40 mb-3"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="w-full max-w-xs max-h-60 overflow-y-auto space-y-1">
        {available.map((a) => (
          <button
            key={a.id}
            onClick={() => { onSelect(a.id); setSearch('') }}
            className="w-full text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border border-ink-border text-cream-muted hover:border-cream-muted/50 hover:text-cream"
          >
            {a.name || `@${a.handle}`}
          </button>
        ))}
        {available.length === 0 && (
          <p className="text-cream-muted/30 text-xs font-mono text-center py-4">
            {search ? 'No matches' : 'All artists selected'}
          </p>
        )}
      </div>
    </div>
  )
}

const MAX_COMPARE = 4

export default function CompareView({ artists, onOpenArtist }) {
  const [selectedIds, setSelectedIds] = useState([])

  const selected = selectedIds
    .map((id) => artists.find((a) => a.id === id))
    .filter(Boolean)

  function addArtist(id) {
    if (selectedIds.length < MAX_COMPARE) {
      setSelectedIds((prev) => [...prev, id])
    }
  }

  function removeArtist(id) {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  if (selectedIds.length === 0) {
    return (
      <div className="px-4">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4 opacity-10">⊞</span>
          <p className="text-cream-muted/60 font-body text-sm mb-4">Select artists to compare side by side.</p>
          <div className="w-full max-w-md">
            <ArtistPicker artists={artists} selected={selectedIds} onSelect={addArtist} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4">
      {/* Comparison grid */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(selected.length + (selected.length < MAX_COMPARE ? 1 : 0), MAX_COMPARE)}, minmax(0, 1fr))`,
          height: 'calc(100vh - 200px)',
        }}
      >
        {selected.map((artist) => (
          <CompareColumn
            key={artist.id}
            artist={artist}
            onOpen={onOpenArtist}
            onRemove={() => removeArtist(artist.id)}
          />
        ))}
        {selected.length < MAX_COMPARE && (
          <ArtistPicker artists={artists} selected={selectedIds} onSelect={addArtist} />
        )}
      </div>
    </div>
  )
}
