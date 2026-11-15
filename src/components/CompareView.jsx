import { useState } from 'react'
import ArtistImage from './ArtistImage'
import useMediaQuery from '../hooks/useMediaQuery'
import { activateOnKey } from '../a11y/activate'

// #220 E: a column is a name and one run of large photos. Columns grow with
// their photos and the page scrolls them together: each used to scroll inside
// its own fixed-height box, which on a phone ran under the tab bar. The handle, studio and
// tag pills that sat on every card are on the artist's own page.
function CompareColumn({ artist, onOpen, onRemove }) {
  const displayName = artist.name || `@${artist.handle}`

  return (
    <div data-testid="compare-column" className="flex flex-col border border-ink-border/50 rounded-xs overflow-hidden bg-ink-card/20 min-w-0">
      <div className="bg-ink-black border-b border-ink-border/50 pl-3 flex items-center justify-between gap-1">
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open ${displayName}`}
          className="min-w-0 min-h-11 flex items-center cursor-pointer"
          onClick={() => onOpen(artist)}
          onKeyDown={activateOnKey(() => onOpen(artist))}
        >
          <h3 className="font-display text-cream text-base md:text-lg leading-tight truncate">{displayName}</h3>
        </div>
        <button
          onClick={onRemove}
          className="w-11 h-11 shrink-0 flex items-center justify-center text-cream-muted hover:text-accent text-base transition-colors"
          aria-label={`Remove ${displayName} from comparison`}
          title="Remove from comparison"
        >
          ×
        </button>
      </div>

      {/* Scrollable images */}
      <div className="p-1.5">
        {artist.images?.length > 0 ? (
          <div data-testid="compare-photos" className="flex flex-col gap-1.5">
            {artist.images.map((src, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`Open ${displayName}`}
                className="aspect-square bg-ink-muted rounded-xs overflow-hidden cursor-pointer"
                onClick={() => onOpen(artist)}
                onKeyDown={activateOnKey(() => onOpen(artist))}
              >
                <ArtistImage src={src} sizes="(max-width: 767px) 50vw, 25vw" label={displayName} className="w-full h-full object-cover" monogramClassName="text-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <span className="text-cream-muted/40 font-mono text-xs tracking-widest">No images</span>
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
    <div className="flex flex-col border border-dashed border-ink-border/50 rounded-xs min-w-0 items-center justify-center p-4">
      <p className="text-cream-muted/40 font-mono text-xs tracking-widest uppercase mb-3">Add artist</p>
      <input
        className="w-full max-w-xs bg-ink-muted border border-ink-border rounded-xs px-3 py-2 text-sm text-cream outline-hidden focus:border-cream-muted/50 font-mono placeholder-cream-muted/40 mb-3"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="w-full max-w-xs max-h-60 overflow-y-auto space-y-1">
        {available.map((a) => (
          <button
            key={a.id}
            onClick={() => { onSelect(a.id); setSearch('') }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xs text-sm font-body transition-colors border border-ink-border text-cream-muted hover:border-cream-muted/50 hover:text-cream"
          >
            {a.images?.[0] && <span className="w-6 h-6 rounded-xs overflow-hidden shrink-0"><ArtistImage src={a.images[0]} sizes="24px" label={a.name || `@${a.handle}`} className="w-full h-full object-cover" monogramClassName="text-xs" /></span>}
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

// Two fit side by side on a phone with photos still worth looking at.
const MAX_WIDE = 4
const MAX_PHONE = 2

export default function CompareView({ artists, onOpenArtist }) {
  const [selectedIds, setSelectedIds] = useState([])
  const maxCompare = useMediaQuery('(min-width: 768px)') ? MAX_WIDE : MAX_PHONE

  // Sliced, so picks made on a wide screen do not crush a narrow one.
  const selected = selectedIds
    .map((id) => artists.find((a) => a.id === id))
    .filter(Boolean)
    .slice(0, maxCompare)

  // Built from what is on screen, not the raw ids, so an artist hidden by a
  // narrower screen or since removed never blocks or jumps into a slot.
  function addArtist(id) {
    if (selected.length < maxCompare) {
      setSelectedIds([...selected.map((a) => a.id), id])
    }
  }

  function removeArtist(id) {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  if (selected.length === 0) {
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
        className="grid items-start gap-2 md:gap-3 pb-6"
        style={{
          gridTemplateColumns: `repeat(${Math.min(selected.length + (selected.length < maxCompare ? 1 : 0), maxCompare)}, minmax(0, 1fr))`,
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
        {selected.length < maxCompare && (
          <ArtistPicker artists={artists} selected={selectedIds} onSelect={addArtist} />
        )}
      </div>
    </div>
  )
}
