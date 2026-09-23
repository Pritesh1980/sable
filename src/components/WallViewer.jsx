import { useEffect, useId, useMemo, useState } from 'react'
import ArtistImage from './ArtistImage'
import GlCrossfade from './GlCrossfade'
import ViewerSheetToggle from './ViewerSheetToggle'
import useWallKeyboard from '../hooks/useWallKeyboard'
import useIdleFade from '../hooks/useIdleFade'
import useDialogFocus from '../hooks/useDialogFocus'
import useMediaQuery from '../hooks/useMediaQuery'
import useSwipeTap from '../hooks/useSwipeTap'
import useViewportZoomed from '../hooks/useViewportZoomed'
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

const KBD = 'border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]'
const PANEL_BUTTON = 'flex items-center justify-center gap-3 bg-v2-ink/70 backdrop-blur-md border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-3 text-v2-cream font-v2-ui text-sm transition-colors'

// Full-screen wall viewer. The image owns the screen.
// Mouse/keyboard: the HUD (index, artist plate, filmstrip, keys legend) fades
// away after a couple of seconds of stillness and returns on any activity.
// Touch (#93): only Close, the counter and a Details handle stay up; a tap on
// the image (or the handle) toggles a bottom sheet with everything else.
// Swipe left/right = photos, up = next artist, down = close (the iOS
// convention for a full-screen photo); Previous artist lives in the sheet.
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
  const [sheetOpen, setSheetOpen] = useState(false)
  // Resolve the transition renderer once per viewer open (not per keypress).
  const [transitionMode] = useState(resolveTransitionMode)
  const touch = useMediaQuery('(hover: none)')
  // Pinch-zoomed: hand one-finger drags back to the browser as pans.
  const zoomed = useViewportZoomed()
  const sheetId = useId()

  const {
    current,
    setIndex,
    moveWithinArtist,
    jumpArtist,
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
  const dialogRef = useDialogFocus(open)

  const gestures = useSwipeTap({
    enabled: !zoomed,
    onTap: () => setSheetOpen((s) => !s),
    // Swipe names where the finger went: pulling the image left brings the
    // next one in, pushing it up brings the next artist up from below.
    onSwipe: (dir) => {
      if (dir === 'left') moveWithinArtist(1)
      else if (dir === 'right') moveWithinArtist(-1)
      else if (dir === 'up') jumpArtist(1)
      else if (dir === 'down') onClose?.()
    },
  })

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

  // The installed PWA draws under the iPhone status bar (black-translucent),
  // so the top row clears the safe-area inset.
  const topRow = (
    <>
      <button
        onClick={onClose}
        aria-label="Close viewer"
        title="Back to wall (Esc)"
        className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2 bg-v2-ink/70 backdrop-blur-md border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-3 text-v2-cream font-v2-ui text-xs tracking-widest uppercase pointer-events-auto transition-colors"
      >
        <span aria-hidden="true" className="text-base leading-none">×</span>
        Close
      </button>

      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] sm:right-[max(2rem,env(safe-area-inset-right))] top-[max(1.5rem,env(safe-area-inset-top))] font-v2-display text-sm tracking-[0.2em] text-v2-muted pointer-events-auto">
        <b className="text-v2-cream font-normal">{pad2(positionInArtist + 1)}</b> / {artistImageCount} · artist {artistOrdinal} of {artistCount}
      </div>
    </>
  )

  const plate = (
    <>
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
    </>
  )

  const thumbnails = artistItems.map((item) => (
    <img
      key={item.imageIndex}
      src={getItemSrc(item)}
      alt={`${item.artistName} thumbnail ${item.imageIndex + 1}`}
      onClick={() => setIndex(items.indexOf(item))}
      className={`h-14 w-[42px] shrink-0 object-cover rounded-xs cursor-pointer transition-opacity ${
        item === current ? 'opacity-100 outline outline-1 outline-v2-accent outline-offset-1' : 'opacity-45 hover:opacity-100'
      }`}
    />
  ))

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${current.artistName} — image ${positionInArtist + 1} of ${artistImageCount}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] bg-v2-ink overflow-hidden focus:outline-hidden"
    >
      {/* Gesture surface. touch-action: pinch-zoom keeps one-finger drags ours
          (not a scroll) while pinch-to-zoom on the artwork still works. */}
      <div
        data-testid="viewer-surface"
        className="absolute inset-0"
        style={touch ? { touchAction: zoomed ? 'auto' : 'pinch-zoom' } : undefined}
        {...(touch ? gestures : {})}
      >
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
      </div>

      {touch ? (
        <div className="absolute inset-0 pointer-events-none">
          {topRow}

          {!sheetOpen && (
            <ViewerSheetToggle
              open={false}
              onToggle={() => setSheetOpen(true)}
              controls={sheetId}
              className="absolute left-1/2 -translate-x-1/2 bottom-[max(0.5rem,env(safe-area-inset-bottom))]"
            />
          )}

          {sheetOpen && (
            <div id={sheetId} className="absolute inset-x-0 bottom-0 pointer-events-auto flex flex-col gap-4 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:[&_h1]:text-xl bg-gradient-to-t from-v2-ink via-v2-ink/90 to-transparent pt-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up">
              <ViewerSheetToggle open onToggle={() => setSheetOpen(false)} controls={sheetId} className="self-center" />
              {artistItems.length > 1 && (
                <div className="flex gap-1 overflow-x-auto p-1 [@media(max-height:500px)]:hidden">{thumbnails}</div>
              )}
              <div>{plate}</div>
              <div className="flex justify-between font-v2-ui text-xs tracking-widest uppercase">
                <button
                  onClick={() => jumpArtist(-1)}
                  disabled={artistOrdinal <= 1}
                  className="py-2 text-v2-cream disabled:text-v2-muted"
                >
                  ‹ Previous artist
                </button>
                <button
                  onClick={() => jumpArtist(1)}
                  disabled={artistOrdinal >= artistCount}
                  className="py-2 text-v2-cream disabled:text-v2-muted"
                >
                  Next artist ›
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onGenerate?.(current)} className={`${PANEL_BUTTON} flex-1`}>
                  Generate a concept in this style
                </button>
                <button onClick={() => setShowInfo((s) => !s)} className={PANEL_BUTTON}>
                  Info & notes
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-500 motion-reduce:transition-none ${
            idle ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {topRow}

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

          <div className="absolute left-8 bottom-7 pointer-events-auto">{plate}</div>

          {artistItems.length > 1 && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[4.6rem] flex gap-1 pointer-events-auto">
              {thumbnails}
            </div>
          )}

          <button
            onClick={() => onGenerate?.(current)}
            className={`absolute right-8 bottom-7 ${PANEL_BUTTON} pointer-events-auto`}
          >
            Generate a concept in this style
            <kbd className="text-[0.7rem] text-v2-accent border border-v2-accent rounded px-1.5 py-0.5">G</kbd>
          </button>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-5 font-v2-ui text-[0.68rem] tracking-[0.1em] text-v2-muted pointer-events-auto">
            <span><kbd className={KBD}>←</kbd><kbd className={KBD}>→</kbd>this artist</span>
            <span><kbd className={KBD}>↑</kbd><kbd className={KBD}>↓</kbd>next artist</span>
            <span><kbd className={KBD}>G</kbd>generate</span>
            <span><kbd className={KBD}>I</kbd>info & notes</span>
            <span><kbd className={KBD}>Esc</kbd>back to wall</span>
          </div>
        </div>
      )}

      {showInfo && (
        <InfoPanel artist={activeArtist} ideas={ideas} onClose={() => setShowInfo(false)} />
      )}
    </div>
  )
}
