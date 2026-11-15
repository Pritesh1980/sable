import { useEffect, useId, useMemo, useState } from 'react'
import ArtistImage from './ArtistImage'
import GeneratedArtworkNotice from './GeneratedArtworkNotice'
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
// The dark fade that rises behind the bottom HUD (inside the HUD wrapper, so it
// leaves with the idle fade). Not interactive.
const FADE = 'absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-v2-ink via-v2-ink/70 to-transparent pointer-events-none'

// Previous / next photo of the current artist (touch). It sits in the caption
// bar (44px target, disabled rather than removed with a single photo so the
// bar does not jump).
function PhotoArrow({ dir, disabled, onGo }) {
  return (
    <button
      type="button"
      onClick={() => onGo(dir)}
      disabled={disabled}
      aria-label={dir < 0 ? 'Previous photo' : 'Next photo'}
      className={`flex items-center justify-center w-12 h-12 mx-2 rounded-full border border-v2-hairline bg-v2-ink/60 text-3xl leading-none pb-1 pointer-events-auto transition-colors text-v2-cream active:border-v2-accent disabled:text-v2-muted/50`}
    >
      <span aria-hidden="true">{dir < 0 ? '‹' : '›'}</span>
    </button>
  )
}

const PANEL_BUTTON = 'flex items-center justify-center gap-3 bg-v2-ink/70 backdrop-blur-md border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-3 text-v2-cream font-v2-ui text-sm transition-colors'

// Full-screen wall viewer. The image owns the screen.
// Mouse/keyboard: the HUD (index, artist plate, filmstrip, keys legend) fades
// away after a couple of seconds of stillness and returns on any activity.
// A dark fade rises behind the bottom HUD so the plate reads on any photo.
// Touch (#93, #220): Close, the photo count and a slim caption bar stay up
// (artist name, ‹ / › photo arrows, a More handle); a tap on the image (or the
// handle) toggles a bottom sheet with everything else.
// Swipe left/right = photos, up = next artist, down = close (the iOS
// convention for a full-screen photo); Previous artist lives in the sheet.
// Only a change of artist ripples in the GL stage; photos of one artist fade.
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
  onIndexChange,
}) {
  const [showInfo, setShowInfo] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Resolve the transition renderer once per viewer open (not per keypress).
  const [transitionMode] = useState(resolveTransitionMode)
  const touch = useMediaQuery('(hover: none)')
  // Pinch-zoomed: hand one-finger drags back to the browser as pans.
  const zoomed = useViewportZoomed()
  const sheetId = useId()
  const dialogRef = useDialogFocus(open)

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
    // One layer per Escape (#159): the Info & notes panel closes first.
    onClose: showInfo ? () => setShowInfo(false) : onClose,
    onGenerate,
    onToggleInfo: () => setShowInfo((s) => !s),
    enabled: open,
    dialogRef,
  })

  const idle = useIdleFade(2000)

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

  // Tells the Wall which photo is showing, so it can keep the URL on it (#159).
  useEffect(() => {
    if (open && current) onIndexChange?.(current)
  }, [open, current, onIndexChange])

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

      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] sm:right-[max(2rem,env(safe-area-inset-right))] top-[max(1.5rem,env(safe-area-inset-top))] font-v2-display text-sm tracking-[0.2em] text-v2-cream [text-shadow:0_1px_8px_rgba(19,17,16,0.9)] pointer-events-none">
        Photo {positionInArtist + 1} of {artistImageCount}
      </div>
    </>
  )

  const plate = (
    <>
      <h1 className="font-v2-display text-[1.6rem] tracking-[0.24em] uppercase text-v2-cream [text-shadow:0_1px_12px_rgba(19,17,16,0.8)]">
        {current.artistName}
      </h1>
      <div className="font-v2-ui text-xs tracking-[0.12em] text-v2-cream/90">
        Artist {artistOrdinal} of {artistCount} ·{' '}
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-v2-cream hover:underline"
        >
          @{current.handle} ↗
        </a>
      </div>
      <div className="mt-1 font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-cream">
        {current.styles.join(' · ')}
      </div>
    </>
  )

  const thumbnails = artistItems.map((item) => (
    <ArtistImage
      key={item.imageIndex}
      src={item.image}
      label={`${item.artistName} thumbnail ${item.imageIndex + 1}`}
      sizes="42px"
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
              src={current.image}
              label={`${current.artistName} — ${current.styles.join(', ')}`}
              rippleKey={current.artistId}
              className="w-full h-full block"
              fallbackImageClassName="max-w-[100vw] max-h-[100vh] object-contain animate-fade-in"
              monogramClassName="text-8xl"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ArtistImage
              key={`${current.artistId}-${current.imageIndex}`}
              loading="eager"
              sizes="100vw"
              src={current.image}
              label={`${current.artistName} — ${current.styles.join(', ')}`}
              className="max-w-[100vw] max-h-[100vh] object-contain animate-fade-in"
              monogramClassName="text-8xl"
            />
          </div>
        )}
      </div>

      <GeneratedArtworkNotice
        images={[current.image]}
        className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] bg-v2-ink/90 rounded-xs px-2 py-1 pointer-events-none"
      />

      {touch ? (
        <div className="absolute inset-0 pointer-events-none">
          {topRow}

          {!sheetOpen && (
            <div className="absolute inset-x-0 bottom-0 pt-10 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))] [@media(max-height:500px)]:pt-4">
              <div aria-hidden="true" className={FADE} />
              <div className="relative px-3 flex items-baseline justify-between gap-3">
                <h1 className="min-w-0 font-v2-display text-lg tracking-[0.18em] uppercase text-v2-cream truncate [text-shadow:0_1px_12px_rgba(19,17,16,0.8)] [@media(max-height:500px)]:text-base">
                  {current.artistName}
                </h1>
                <p className="shrink-0 font-v2-ui text-xs tracking-[0.12em] text-v2-cream/90">
                  Artist {artistOrdinal} of {artistCount}
                </p>
              </div>
              <div className="relative flex items-center justify-between">
                <PhotoArrow dir={-1} disabled={artistImageCount < 2} onGo={goWithinArtist} />
                <ViewerSheetToggle open={false} onToggle={() => setSheetOpen(true)} controls={sheetId} />
                <PhotoArrow dir={1} disabled={artistImageCount < 2} onGo={goWithinArtist} />
              </div>
            </div>
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
            aria-label="Previous photo"
            title="Previous image (←)"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-v2-muted hover:text-v2-cream text-4xl px-4 py-8 pointer-events-auto transition-colors"
          >
            ‹
          </button>
          <button
            onClick={() => goWithinArtist(1)}
            aria-label="Next photo"
            title="Next image (→)"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-v2-muted hover:text-v2-cream text-4xl px-4 py-8 pointer-events-auto transition-colors"
          >
            ›
          </button>

          <div aria-hidden="true" className={FADE} />

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
