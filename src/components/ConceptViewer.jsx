import { useEffect, useId, useState } from 'react'
import useIdleFade from '../hooks/useIdleFade'
import useDialogFocus from '../hooks/useDialogFocus'
import useMediaQuery from '../hooks/useMediaQuery'
import useSwipeTap from '../hooks/useSwipeTap'
import useViewportZoomed from '../hooks/useViewportZoomed'
import ConceptVariantLab from './ConceptVariantLab'
import ConceptVisualMatches from './ConceptVisualMatches'
import GeneratedArtworkNotice from './GeneratedArtworkNotice'
import GlCrossfade from './GlCrossfade'
import ViewerSheetToggle from './ViewerSheetToggle'
import SavedPromptPack from './SavedPromptPack'
import TagPill from './TagPill'
import { STYLE_TAGS } from '../data/artists'
import { matchArtistsForIdea } from '../data/planning'
import { resolveTransitionMode } from '../lib/gl'

function isFormFieldFocused() {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const KBD = 'border border-v2-hairline rounded px-1.5 py-0.5 mr-1 text-v2-cream text-[0.66rem]'
const PANEL_BUTTON = 'flex items-center justify-center gap-3 bg-v2-ink/70 backdrop-blur-md border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-3 text-v2-cream font-v2-ui text-sm transition-colors'

// Delete sits under the thumb in the touch sheet; mark it as destructive.
const DANGER_BUTTON = PANEL_BUTTON.replace('border-v2-hairline', 'border-v2-accent').replace('text-v2-cream', 'text-v2-accent')

function pad2(n) {
  return String(n).padStart(2, '0')
}

function InfoPanel({ item, artists, onClose, onSaveTags, onAddVariant, onMarkBest, onDeleteVariant, onRateVariant, onMakeStl }) {
  const concept = item.concept
  const matched = (concept.tags || []).length && artists.length
    ? matchArtistsForIdea({ tags: concept.tags }, artists).slice(0, 3)
    : []

  return (
    <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-md bg-v2-surface border-l border-v2-hairline p-6 overflow-y-auto animate-slide-up">
      <button
        onClick={onClose}
        className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted hover:text-v2-cream mb-6"
      >
        Close
      </button>

      <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-2">Concept</p>
      <p className="font-v2-display text-v2-cream text-lg leading-snug mb-6">"{concept.prompt}"</p>

      <SavedPromptPack promptPack={concept.promptPack} />

      {concept.response && (
        <div className="mb-6">
          <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-2">AI response</p>
          <p className="font-v2-ui text-sm text-v2-cream leading-relaxed whitespace-pre-wrap">{concept.response}</p>
        </div>
      )}

      <div className="mb-6">
        <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-2">Match to style</p>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_TAGS.map((tag) => (
            <TagPill
              key={tag}
              tag={tag}
              active={(concept.tags || []).includes(tag)}
              onClick={() => onSaveTags(concept.id,
                (concept.tags || []).includes(tag)
                  ? (concept.tags || []).filter((t) => t !== tag)
                  : [...(concept.tags || []), tag]
              )}
              small
            />
          ))}
        </div>
        {matched.length > 0 && (
          <ul className="mt-3 space-y-1">
            {matched.map(({ artist }) => (
              <li key={artist.id} className="font-v2-ui text-sm text-v2-cream">{artist.name || `@${artist.handle}`}</li>
            ))}
          </ul>
        )}
      </div>

      <ConceptVisualMatches artists={artists} concept={concept} />

      <ConceptVariantLab
        concept={concept}
        onAddVariant={onAddVariant}
        onMarkBest={onMarkBest}
        onDeleteVariant={onDeleteVariant}
        onRateVariant={onRateVariant}
        onMakeStl={onMakeStl}
      />
    </aside>
  )
}

// Full-screen viewer for saved concepts — same visual language as WallViewer
// (idle-fading HUD, arrows, filmstrip) adapted for a flat list of concepts
// rather than artist image groups. Variants + STL export live behind the
// info panel (toggle with I or the button below).
//
// `initialIndex` is read once, at mount — the caller (Concepts.jsx) only ever
// mounts this fresh per open (`viewerOpen && <ConceptViewer key={viewerIndex}
// .../>`), never changes it on a live instance, so there is nothing to
// re-sync via an effect (#32 — that used to be `useEffect(() =>
// setIndex(initialIndex), [initialIndex])`, dead weight given the call site).
// A caller that ever needs to jump a mounted viewer to a different item must
// change its `key`, the same way it already resets on open.
export default function ConceptViewer({
  items,
  initialIndex = 0,
  artists = [],
  open = true,
  onClose,
  onDelete,
  onSaveTags,
  onAddVariant,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
  onMakeStl,
}) {
  const [index, setIndex] = useState(initialIndex)
  const [showInfo, setShowInfo] = useState(false)
  // Resolve the transition renderer once per viewer open (not per keypress).
  const [transitionMode] = useState(resolveTransitionMode)
  const idle = useIdleFade(2000)
  const dialogRef = useDialogFocus(open)
  const [sheetOpen, setSheetOpen] = useState(false)
  const touch = useMediaQuery('(hover: none)')
  const zoomed = useViewportZoomed()
  const sheetId = useId()

  function step(delta) {
    setIndex((i) => (i + delta + items.length) % items.length)
  }

  const gestures = useSwipeTap({
    enabled: !zoomed,
    onTap: () => setSheetOpen((s) => !s),
    onSwipe: (dir) => {
      if (dir === 'left') step(1)
      else if (dir === 'right') step(-1)
      else if (dir === 'down') onClose?.()
    },
  })

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(e) {
      if (isFormFieldFocused()) return
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          setIndex((i) => (i - 1 + items.length) % items.length)
          break
        case 'ArrowRight':
          e.preventDefault()
          setIndex((i) => (i + 1) % items.length)
          break
        case 'i':
        case 'I':
          setShowInfo((s) => !s)
          break
        case 'Escape':
          onClose?.()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, items.length, onClose])

  if (!open || !items[index]) return null

  const current = items[index]

  const topRow = (
    <>
      {/* The installed PWA draws under the iPhone status bar
          (black-translucent), so the top row clears the safe-area inset. */}
      <button
        onClick={onClose}
        aria-label="Close viewer"
        title="Back to concepts (Esc)"
        className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2 bg-v2-ink/70 backdrop-blur-md border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-3 text-v2-cream font-v2-ui text-xs tracking-widest uppercase pointer-events-auto transition-colors"
      >
        <span aria-hidden="true" className="text-base leading-none">×</span>
        Close
      </button>

      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] sm:right-[max(2rem,env(safe-area-inset-right))] top-[max(1.5rem,env(safe-area-inset-top))] font-v2-display text-sm tracking-[0.2em] text-v2-muted pointer-events-auto">
        <b className="text-v2-cream font-normal">{pad2(index + 1)}</b> / {items.length}
      </div>
    </>
  )

  const plate = (
    <>
      <h1 className="font-v2-display text-[1.6rem] tracking-[0.24em] uppercase text-v2-cream truncate [text-shadow:0_1px_12px_rgba(19,17,16,0.8)]">
        {current.title}
      </h1>
      <div className="mt-1 font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted">
        {current.steerArtistName ? `steered · ${current.steerArtistName}` : current.tags.join(' · ')}
      </div>
    </>
  )

  const deleteButton = (danger = false) => (
    <button onClick={() => onDelete?.(current.id)} className={danger ? DANGER_BUTTON : PANEL_BUTTON}>
      Delete
    </button>
  )

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Concept: ${current.title || current.prompt || 'untitled'}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] bg-v2-ink overflow-hidden focus:outline-hidden"
    >
      {/* Gesture surface (#93). touch-action: pinch-zoom keeps one-finger
          drags ours (not a scroll) while pinch-to-zoom still works. */}
      <div
        data-testid="viewer-surface"
        className="absolute inset-0"
        style={touch ? { touchAction: zoomed ? 'auto' : 'pinch-zoom' } : undefined}
        {...(touch ? gestures : {})}
      >
        {/* t9: WebGL crossfade/ripple chosen once per open; 'css' keeps <img>. */}
        {transitionMode === 'webgl' ? (
          <div className="absolute inset-0">
            <GlCrossfade
              src={current.imageUrl}
              label={current.title}
              className="w-full h-full block"
              fallbackImageClassName="max-w-[100vw] max-h-[100vh] object-contain animate-fade-in"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              key={current.id}
              src={current.imageUrl}
              alt={current.title}
              className="max-w-[100vw] max-h-[100vh] object-contain animate-fade-in"
            />
          </div>
        )}
      </div>

      <GeneratedArtworkNotice
        images={[current.imageUrl]}
        className="absolute top-16 left-4 z-20 rounded-xs bg-v2-ink/85 px-2 py-1 pointer-events-none"
      />

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
            <div id={sheetId} className="absolute inset-x-0 bottom-0 pointer-events-auto flex flex-col gap-4 bg-gradient-to-t from-v2-ink via-v2-ink/90 to-transparent pt-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up">
              <ViewerSheetToggle open onToggle={() => setSheetOpen(false)} controls={sheetId} className="self-center" />
              <div className="min-w-0">{plate}</div>
              <div className="flex gap-2">
                <button onClick={() => setShowInfo((s) => !s)} className={`${PANEL_BUTTON} flex-1`}>
                  Variants & STL export
                </button>
                {deleteButton(true)}
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

          {items.length > 1 && (
            <>
              <button
                onClick={() => step(-1)}
                title="Previous concept (←)"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-v2-muted hover:text-v2-cream text-4xl px-4 py-8 pointer-events-auto transition-colors"
              >
                ‹
              </button>
              <button
                onClick={() => step(1)}
                title="Next concept (→)"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-v2-muted hover:text-v2-cream text-4xl px-4 py-8 pointer-events-auto transition-colors"
              >
                ›
              </button>
            </>
          )}

          <div className="absolute left-8 bottom-7 pointer-events-auto max-w-[60%]">{plate}</div>

          <div className="absolute right-8 bottom-7 flex items-center gap-3 pointer-events-auto">
            {deleteButton()}
            <button onClick={() => setShowInfo((s) => !s)} className={PANEL_BUTTON}>
              Variants & STL export
              <kbd className="text-[0.7rem] text-v2-accent border border-v2-accent rounded px-1.5 py-0.5">I</kbd>
            </button>
          </div>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-5 font-v2-ui text-[0.68rem] tracking-[0.1em] text-v2-muted pointer-events-auto">
            <span><kbd className={KBD}>←</kbd><kbd className={KBD}>→</kbd>concepts</span>
            <span><kbd className={KBD}>I</kbd>variants & STL</span>
            <span><kbd className={KBD}>Esc</kbd>back to wall</span>
          </div>
        </div>
      )}

      {showInfo && (
        <InfoPanel
          item={current}
          artists={artists}
          onClose={() => setShowInfo(false)}
          onSaveTags={onSaveTags}
          onAddVariant={onAddVariant}
          onMarkBest={onMarkBest}
          onDeleteVariant={onDeleteVariant}
          onRateVariant={onRateVariant}
          onMakeStl={onMakeStl}
        />
      )}
    </div>
  )
}
