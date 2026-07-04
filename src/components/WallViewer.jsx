import { useEffect, useMemo, useState } from 'react'
import ArtistImage from './ArtistImage'
import GlCrossfade from './GlCrossfade'
import useWallKeyboard from '../hooks/useWallKeyboard'
import useIdleFade from '../hooks/useIdleFade'
import { resolveTransitionMode } from '../lib/gl'
import { ARTIST_STATUSES, normalizeArtistStatus } from '../data/planning'

function getItemSrc(item) {
  if (!item) return ''
  return typeof item.image === 'string' ? item.image : item.image?.url || ''
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Resolves the full artist record (status/notes) for the currently viewed
// item — prefers the `artists` list when given, falls back to the single
// `artist` prop otherwise.
function resolveArtist(artistId, artist, artists) {
  if (artists) return artists.find((a) => a.id === artistId) || artist
  return artist
}

function InfoPanel({ artist, ideas, onClose }) {
  if (!artist) return null
  const status = ARTIST_STATUSES.find((s) => s.value === normalizeArtistStatus(artist.status))
  const linkedIdeas = ideas.filter((idea) => idea.linkedArtists?.includes(artist.id))

  return (
    <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-sm bg-v2-surface border-l border-v2-hairline p-6 overflow-y-auto animate-slide-up">
      <button
        onClick={onClose}
        className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted hover:text-v2-cream mb-6"
      >
        Close
      </button>

      <p className={`font-v2-ui text-xs tracking-widest uppercase mb-4 ${status.tone}`}>{status.label}</p>

      <div className="mb-6">
        <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-2">Notes</p>
        <p className="font-v2-ui text-sm text-v2-cream leading-relaxed">
          {artist.notes || <span className="text-v2-muted">No notes yet</span>}
        </p>
      </div>

      <div>
        <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-2">Linked ideas</p>
        {linkedIdeas.length === 0 ? (
          <p className="font-v2-ui text-sm text-v2-muted">None yet</p>
        ) : (
          <ul className="space-y-1">
            {linkedIdeas.map((idea) => (
              <li key={idea.id} className="font-v2-ui text-sm text-v2-cream">{idea.title}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

// Full-screen wall viewer. The image owns the screen; the HUD (index, artist
// plate, filmstrip, keys legend) fades away after a couple of seconds of
// stillness and returns on any mouse/keyboard activity.
export default function WallViewer({
  items,
  initialIndex = 0,
  artist,
  artists,
  ideas = [],
  open = true,
  onClose,
  onGenerate,
  onPasteImage,
}) {
  const [showInfo, setShowInfo] = useState(false)
  // Resolve the transition renderer once per viewer open (not per keypress).
  const [transitionMode] = useState(resolveTransitionMode)

  const {
    index,
    current,
    setIndex,
    positionInArtist,
    artistImageCount,
    artistOrdinal,
    artistCount,
  } = useWallKeyboard({
    items,
    initialIndex,
    onClose,
    onGenerate,
    onToggleInfo: () => setShowInfo((s) => !s),
    enabled: open,
  })

  const idle = useIdleFade(2000)

  // Paste (⌘V) with the viewer open adds the pasted image to the artist
  // currently in view.
  useEffect(() => {
    if (!open || !onPasteImage || !current) return undefined
    function handlePaste(e) {
      const file = Array.from(e.clipboardData?.files || [])[0]
      if (file) onPasteImage(current.artistId, file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [open, onPasteImage, current])

  const artistItems = useMemo(
    () => items.filter((i) => i.artistId === current?.artistId),
    [items, current]
  )

  if (!open || !current) return null

  const activeArtist = resolveArtist(current.artistId, artist, artists)
  const instagramUrl = `https://www.instagram.com/${current.handle}/`

  function goWithinArtist(delta) {
    const count = artistImageCount
    const nextPos = (positionInArtist + delta + count) % count
    const nextItem = artistItems[nextPos]
    setIndex(items.indexOf(nextItem))
  }

  return (
    <div className="fixed inset-0 z-50 bg-v2-ink overflow-hidden">
      {/* t9: WebGL crossfade/ripple transition layer. Chosen once per open via
          resolveTransitionMode(); 'css' keeps the plain <img> path untouched. */}
      {transitionMode === 'webgl' ? (
        <div className="absolute inset-0">
          <GlCrossfade
            src={getItemSrc(current)}
            label={`${current.artistName} — ${current.styles.join(', ')}`}
            className="w-full h-full block"
            fallbackImageClassName="max-w-[100vw] max-h-[100vh] object-contain animate-fade-in"
            monogramClassName="text-8xl"
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ArtistImage
            key={`${current.artistId}-${current.imageIndex}`}
            src={getItemSrc(current)}
            label={`${current.artistName} — ${current.styles.join(', ')}`}
            className="max-w-[100vw] max-h-[100vh] object-contain animate-fade-in"
            monogramClassName="text-8xl"
          />
        </div>
      )}

      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 motion-reduce:transition-none ${
          idle ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="absolute right-8 top-6 font-v2-display text-sm tracking-[0.2em] text-v2-muted pointer-events-auto">
          <b className="text-v2-cream font-normal">{pad2(positionInArtist + 1)}</b> / {artistImageCount} · artist {artistOrdinal} of {artistCount}
        </div>

        <button
          onClick={() => goWithinArtist(-1)}
          title="Previous image (←)"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-v2-muted hover:text-v2-cream text-4xl px-4 py-8 pointer-events-auto transition-colors"
        >
          ‹
        </button>
        <button
          onClick={() => goWithinArtist(1)}
          title="Next image (→)"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-v2-muted hover:text-v2-cream text-4xl px-4 py-8 pointer-events-auto transition-colors"
        >
          ›
        </button>

        <div className="absolute left-8 bottom-7 pointer-events-auto">
          <h1 className="font-v2-display text-[1.6rem] tracking-[0.24em] uppercase text-v2-cream [text-shadow:0_1px_12px_rgba(19,17,16,0.8)]">
            {current.artistName}
          </h1>
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-v2-ui text-xs tracking-[0.12em] text-v2-muted hover:text-v2-cream"
          >
            @{current.handle} ↗
          </a>
          <div className="mt-1 font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted">
            {current.styles.join(' · ')}
          </div>
        </div>

        {artistItems.length > 1 && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[4.6rem] flex gap-1 pointer-events-auto">
            {artistItems.map((item) => (
              <img
                key={item.imageIndex}
                src={getItemSrc(item)}
                alt={`${item.artistName} thumbnail ${item.imageIndex + 1}`}
                onClick={() => setIndex(items.indexOf(item))}
                className={`h-14 w-[42px] object-cover rounded-sm cursor-pointer transition-opacity ${
                  item === current ? 'opacity-100 outline outline-1 outline-v2-accent outline-offset-1' : 'opacity-45 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => onGenerate?.(current)}
          className="absolute right-8 bottom-7 flex items-center gap-3 bg-v2-ink/70 backdrop-blur-md border border-v2-hairline hover:border-v2-accent rounded-sm px-4 py-3 text-v2-cream font-v2-ui text-sm pointer-events-auto transition-colors"
        >
          Generate a concept in this style
          <kbd className="text-[0.7rem] text-v2-accent border border-v2-accent rounded px-1.5 py-0.5">G</kbd>
        </button>

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-5 font-v2-ui text-[0.68rem] tracking-[0.1em] text-v2-muted pointer-events-auto">
          <span><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">←</kbd><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">→</kbd>this artist</span>
          <span><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">↑</kbd><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">↓</kbd>next artist</span>
          <span><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">G</kbd>generate</span>
          <span><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">I</kbd>info & notes</span>
          <span><kbd className="border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]">Esc</kbd>back to wall</span>
        </div>
      </div>

      {showInfo && (
        <InfoPanel artist={activeArtist} ideas={ideas} onClose={() => setShowInfo(false)} />
      )}
    </div>
  )
}
