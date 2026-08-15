import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { takeSharedImage } from '../sw/shareTarget'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import SortableArtistCard from '../components/SortableArtistCard'
import Logo from '../components/Logo'
import ArtistDetail from '../components/ArtistDetail'
import ArtistBrowse from '../components/ArtistBrowse'
import RankingMode from '../components/RankingMode'
import StyleWall from '../components/StyleWall'
import FilmstripView from '../components/FilmstripView'
import CompareView from '../components/CompareView'
import TagPill from '../components/TagPill'
import AddArtistForm from '../components/AddArtistForm'
import ArtistTable from '../components/ArtistTable'
import QuickAddArtist from '../components/QuickAddArtist'
import { STYLE_TAGS, createArtist } from '../data/artists'

function ArtistGrid({ items, sensors, onDragEnd, onOpen, onSaveImages, editing }) {
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((a) => a.id)} strategy={rectSortingStrategy}>
        {/* Top 3 — featured trio */}
        {items.filter((a) => a.rank <= 3).length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {items.filter((a) => a.rank <= 3).map((artist, i) => (
              <SortableArtistCard
                key={artist.id}
                artist={artist}
                onOpen={onOpen}
                onSaveImages={onSaveImages}
                featured={true}
                index={i}
                editing={editing}
              />
            ))}
          </div>
        )}
        {/* Remaining — responsive grid: 2 on mobile, up to 5 on a wide desktop */}
        {items.filter((a) => a.rank > 3).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {items.filter((a) => a.rank > 3).map((artist, i) => (
              <SortableArtistCard
                key={artist.id}
                artist={artist}
                onOpen={onOpen}
                onSaveImages={onSaveImages}
                featured={false}
                index={3 + i}
                editing={editing}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  )
}

export default function Gallery({ artists, setArtists, mergedConventions = [] }) {
  const [searchParams] = useSearchParams()
  const [activeTag, setActiveTag] = useState(null)
  const [selected, setSelected] = useState(null)
  const [viewMode, setViewMode] = useState('filmstrip')
  // #70: grid cards are pure navigation until this is on. Only grid can reorder,
  // so leaving grid drops it — otherwise the state outlives its only switch.
  const [editing, setEditing] = useState(false)
  function changeView(mode) {
    setViewMode(mode)
    setEditing(false)
  }
  const [browsing, setBrowsing] = useState(false)
  const [ranking, setRanking] = useState(false)
  // Deep links (?mode=manage) open maintenance directly; after that it's plain
  // state so toggling doesn't spam history.
  const [manageMode, setManageMode] = useState(() => searchParams.get('mode') === 'manage')
  // Manage replaces the browsing views wholesale, so its toggle hides the
  // Reorder switch. Coming back with editing still on would restore handles the
  // user could not have turned on from there (codex review).
  function changeManage(next) {
    setManageMode(next)
    setEditing(false)
  }
  // ?shared=1 is where /share lands: a screenshot arriving from the OS share
  // sheet (Android) or an iOS Shortcut. Open intake straight away — on iOS
  // there is no file to collect, so it opens empty and ready for a paste.
  const [quickAdding, setQuickAdding] = useState(() => searchParams.get('shared') === '1')
  const [sharedFile, setSharedFile] = useState(null)

  // Collecting the stash is destructive, and StrictMode runs this twice: the
  // first pass would delete the image, then its cleanup would discard the
  // result, and the second pass would find nothing. Holding the in-flight
  // promise in a ref means both passes await the same single read, and
  // whichever pass is still mounted sets the state.
  const consumeRef = useRef(null)
  useEffect(() => {
    if (searchParams.get('shared') !== '1') return undefined
    let cancelled = false
    if (!consumeRef.current) consumeRef.current = takeSharedImage(import.meta.env.BASE_URL)
    consumeRef.current.then((file) => {
      if (!cancelled && file) setSharedFile(file)
    })
    return () => { cancelled = true }
  }, [searchParams])

  const artistsWithImages = artists.filter((a) => a.images?.length > 0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    // #69: dnd-kit's attributes have always announced "press the space bar to
    // pick up", but without this sensor nothing answered. The coordinate getter
    // is what makes the arrow keys move between cards in a wrapping grid.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const sorted = artists
    .filter((a) => !activeTag || a.tags.includes(activeTag))
    .sort((a, b) => a.rank - b.rank)

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const all = artists.slice().sort((a, b) => a.rank - b.rank)
    const oldIndex = all.findIndex((a) => a.id === active.id)
    const newIndex = all.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(all, oldIndex, newIndex).map((a, i) => ({ ...a, rank: i + 1 }))

    setArtists((prev) => prev.map((a) => reordered.find((r) => r.id === a.id) || a))
  }

  function saveArtist(updated) {
    setArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setSelected(updated)
  }

  function saveImages(artist, images) {
    setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, images } : a)))
  }

  function setRank(artistId, newRank) {
    setArtists((prev) => {
      const all = prev.slice().sort((a, b) => a.rank - b.rank)
      const oldIndex = all.findIndex((a) => a.id === artistId)
      if (oldIndex === -1) return prev
      const clamped = Math.max(1, Math.min(all.length, newRank))
      const newIndex = clamped - 1
      if (oldIndex === newIndex) return prev
      const [moved] = all.splice(oldIndex, 1)
      all.splice(newIndex, 0, moved)
      const reranked = all.map((a, i) => ({ ...a, rank: i + 1 }))
      return prev.map((a) => reranked.find((r) => r.id === a.id) || a)
    })
  }

  function setStatus(artistId, status) {
    setArtists((prev) => prev.map((a) => a.id === artistId ? { ...a, status } : a))
  }

  function addArtist(draft) {
    const artist = createArtist(draft, artists)
    if (!artist) return
    setArtists((prev) => [...prev, artist])
  }

  function updateArtist(id, patch) {
    setArtists((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeArtist(id) {
    setArtists((prev) => prev.filter((a) => a.id !== id))
  }

  // Accepts either the next images or an updater of the current ones. The updater
  // form matters for undo: a durable offer can outlive the row that made it, so it
  // must compose with whatever the images are now, not a copy captured earlier.
  function saveImagesById(id, imagesOrUpdater) {
    setArtists((prev) => prev.map((a) => (
      a.id === id
        ? { ...a, images: typeof imagesOrUpdater === 'function' ? imagesOrUpdater(a.images || []) : imagesOrUpdater }
        : a
    )))
  }

  return (
    <div className="min-h-screen bg-ink-black pt-safe-top">
      {/* Page header */}
      <div className="px-4 pt-10 pb-4 flex items-end justify-between">
        <div>
          <Logo size={28} className="mb-3" />
          <p className="font-mono text-xs text-accent tracking-[0.4em] uppercase mb-2">Your Collection</p>
          <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Artists</h1>
        </div>
        <div className="flex gap-2 mb-1">
          {artistsWithImages.length > 0 && !manageMode && (
            <>
              <button
                onClick={() => setRanking(true)}
                className="font-mono text-xs text-accent hover:text-cream border border-accent/40 hover:border-accent px-3 py-2 rounded-xs transition-colors tracking-widest uppercase"
              >
                Rank
              </button>
              <button
                onClick={() => setBrowsing(true)}
                className="font-mono text-xs text-cream-muted hover:text-cream border border-ink-border hover:border-cream-muted/40 px-3 py-2 rounded-xs transition-colors tracking-widest uppercase"
              >
                Browse
              </button>
            </>
          )}
          {/* Always reachable — one-step onboarding for a new artist */}
          <button
            onClick={() => setQuickAdding(true)}
            className="font-mono text-xs text-accent hover:text-cream border border-accent/40 hover:border-accent px-3 py-2 rounded-xs transition-colors tracking-widest uppercase"
          >
            + Add
          </button>
          <button
            onClick={() => changeManage(!manageMode)}
            className={`font-mono text-xs px-3 py-2 rounded-xs transition-colors tracking-widest uppercase border ${
              manageMode
                ? 'text-cream border-accent/50 bg-accent/10'
                : 'text-cream-muted hover:text-cream border-ink-border hover:border-cream-muted/40'
            }`}
          >
            <span aria-hidden="true">⊞ </span>Manage
          </button>
        </div>
      </div>

      {/* Maintenance mode replaces the browsing views entirely */}
      {manageMode && (
        <div className="px-4 max-w-5xl mx-auto md:px-8">
          <p className="font-mono text-xs text-cream-muted/90 mb-6 tracking-widest">
            {artists.length} artists · {artists.filter((a) => a.images?.length > 0).length} with photos
          </p>
          <AddArtistForm onAdd={addArtist} />
          <ArtistTable
            artists={artists}
            onSaveImages={saveImagesById}
            onUpdate={updateArtist}
            onRemove={removeArtist}
          />
        </div>
      )}

      {/* Browsing chrome — hidden while managing */}
      {!manageMode && (
      <>
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-ink-black/80 backdrop-blur-md border-b border-ink-border px-4 py-3 mb-8">
        {/* #73: five 44pt targets are ~236px, which crushed the filters onto
            single-file rows when they shared a line on a phone. Wrap instead —
            the switcher takes its own line until there is room beside them. */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap flex-1">

            <TagPill
              tag="All"
              active={!activeTag}
              onClick={() => setActiveTag(null)}
            />
            {STYLE_TAGS.map((tag) => (
              <TagPill
                key={tag}
                tag={tag}
                active={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              />
            ))}
          </div>
          {/* View toggle. The button is the 44pt target (#73); the chip inside
              keeps the size the bar has always had (#51's pattern — grow the
              hit area, not the look). */}
          <div className="flex gap-1 shrink-0 w-full justify-end sm:w-auto sm:ml-2">
            {[
              { mode: 'filmstrip', label: '☰', title: 'Filmstrip view' },
              { mode: 'compare', label: '⊟', title: 'Compare artists' },
              { mode: 'grid', label: '⊞', title: 'Grid view' },
              { mode: 'wall', label: '▦', title: 'Style wall' },
            ].map(({ mode, label, title }) => (
              <button
                key={mode}
                onClick={() => changeView(mode)}
                title={title}
                // Not decoration: accessible-name computation prefers element
                // content over `title`, so without this these announce as
                // "⊞ button" (codex review).
                aria-label={title}
                aria-pressed={viewMode === mode}
                // The fill belongs on the 44pt box, not on the glyph: a
                // highlight smaller than the target reads as a badge floating in
                // an empty square, and stops showing what is actually tappable
                // (agy review).
                className={`w-11 h-11 flex items-center justify-center rounded-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                  viewMode === mode ? 'text-cream bg-ink-card' : 'text-cream-muted/50 hover:text-cream-muted'
                }`}
              >
                <span className="text-[0.8125rem] font-mono">{label}</span>
              </button>
            ))}
            {/* #70: only grid has cards to drag, so the toggle only appears
                there. A glyph rather than a text label — "⇅ Reorder" widened
                this group enough to squeeze the filter pills into six
                single-file rows on a phone. */}
            {viewMode === 'grid' && (
              <button
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
                // Names both jobs: the mode reveals the quick-upload + as well
                // as the drag handle, and "Reorder" alone does not imply
                // "add photos" (agy review).
                aria-label="Reorder and add photos"
                title={editing ? 'Done — back to browsing' : 'Reorder and add photos'}
                // Divided off from the view switcher: those four are mutually
                // exclusive views, this is a toggle on top of one of them.
                className={`ml-1 w-11 h-11 flex items-center justify-center rounded-xs border-l border-ink-border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                  editing ? 'text-cream bg-accent/20' : 'text-cream-muted/50 hover:text-cream-muted'
                }`}
              >
                <span className="text-[0.8125rem] font-mono">⇅</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {viewMode === 'wall' ? (
        <StyleWall artists={artists} onOpenArtist={setSelected} />
      ) : viewMode === 'filmstrip' ? (
        <FilmstripView artists={sorted} onOpenArtist={setSelected} onSetRank={setRank} onSetStatus={setStatus} />
      ) : viewMode === 'compare' ? (
        <CompareView artists={artists} onOpenArtist={setSelected} />
      ) : (
        <div className="px-4 max-w-7xl mx-auto">
          <ArtistGrid
            items={sorted}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onOpen={setSelected}
            onSaveImages={saveImages}
            editing={editing}
          />
          {sorted.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-cream-muted/90 tracking-widest uppercase text-xs font-mono">
                {artists.length === 0 ? 'No artists yet' : 'No artists match this filter'}
              </p>
              {artists.length === 0 && (
                <button
                  onClick={() => changeManage(true)}
                  className="text-accent hover:text-accent-hover font-body text-sm mt-3 underline underline-offset-4"
                >
                  Add your first artist
                </button>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {selected && (
        <ArtistDetail
          artist={selected}
          onClose={() => setSelected(null)}
          onSave={saveArtist}
          attendingConventions={mergedConventions.filter((c) => c.attendingArtistIds.includes(selected.id))}
          allArtists={artists}
          onSelectArtist={setSelected}
        />
      )}

      {browsing && (
        <ArtistBrowse
          artists={artists}
          onClose={() => setBrowsing(false)}
        />
      )}

      {quickAdding && (
        <QuickAddArtist
          artists={artists}
          onAdd={addArtist}
          onClose={() => { setQuickAdding(false); setSharedFile(null) }}
          initialFile={sharedFile}
        />
      )}

      {ranking && (
        <RankingMode
          artists={artists}
          onClose={() => setRanking(false)}
          onApplyRanking={(updated) => {
            setArtists((prev) => prev.map((a) => updated.find((u) => u.id === a.id) || a))
            setRanking(false)
          }}
        />
      )}
    </div>
  )
}
