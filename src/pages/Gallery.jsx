import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { X } from 'lucide-react'
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
import GeneratedArtworkNotice from '../components/GeneratedArtworkNotice'
import ArtistDetail from '../components/ArtistDetail'
import TasteMap from '../components/TasteMap'
import ArtistBrowse from '../components/ArtistBrowse'
import RankingMode from '../components/RankingMode'
import ToolsMenu from '../components/ToolsMenu'
import WallView from '../components/WallView'
import NearbySoon from '../components/NearbySoon'
import FilmstripView from '../components/FilmstripView'
import CompareView from '../components/CompareView'
import TagPill from '../components/TagPill'
import AddArtistForm from '../components/AddArtistForm'
import ArtistTable from '../components/ArtistTable'
import AddArtistModal from '../components/AddArtistModal'
import EmptyState from '../components/EmptyState'
import SampleArtistNotice, { SampleArtistButton } from '../components/SampleArtistNotice'
import useOverlayParam from '../hooks/useOverlayParam'
import { useAuth } from '../context/useAuth'
import { STYLE_TAGS, createArtist } from '../data/artists'
import { pastAttendance } from '../data/conventions'
import { withStagedImages } from '../data/imageStaging'

function ArtistGrid({ items, sensors, onDragStart, onDragEnd, onDragCancel, onOpen, onSaveImages, editing, onLongPress }) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items.map((a) => a.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-2 sm:block">
          {/* Top 3 — featured trio */}
          {items.filter((a) => a.rank <= 3).length > 0 && (
            <div className="contents sm:grid sm:grid-cols-3 sm:gap-2 sm:mb-2">
              {items.filter((a) => a.rank <= 3).map((artist, i) => (
                <SortableArtistCard
                  key={artist.id}
                  artist={artist}
                  onOpen={onOpen}
                  onSaveImages={onSaveImages}
                  featured={true}
                  index={i}
                  editing={editing}
                  onLongPress={onLongPress}
                />
              ))}
            </div>
          )}
          {/* Remaining — responsive grid: 2 on mobile, up to 5 on a wide desktop */}
          {items.filter((a) => a.rank > 3).length > 0 && (
            <div className="contents sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-2">
              {items.filter((a) => a.rank > 3).map((artist, i) => (
                <SortableArtistCard
                  key={artist.id}
                  artist={artist}
                  onOpen={onOpen}
                  onSaveImages={onSaveImages}
                  featured={false}
                  index={3 + i}
                  editing={editing}
                  onLongPress={onLongPress}
                />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export default function Gallery({ artists, setArtists, saved = [], setSaved = () => {}, favourites = [], setFavourites = () => {}, ideas = [], mergedConventions = [] }) {
  const { user } = useAuth() || {}
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = user?.id
  const [activeTag, setActiveTag] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  // Favourites filter (#220 K): the Wall only, shown as part of the filter chip.
  const [favOnly, setFavOnly] = useState(false)
  // Picking a style closes the row: the chip in the bar then shows what is on.
  const filterBarRef = useRef(null)
  function pickTag(tag) {
    setActiveTag(tag)
    setFilterOpen(false)
    // The pill that had focus is about to unmount; hand focus to whatever
    // replaces the row (the chip, or Filter) so a keyboard keeps its place (codex).
    requestAnimationFrame(() => filterBarRef.current?.querySelector('[data-filter-control]')?.focus())
  }
  // The open artist lives in the URL (?artist=<id>, #159): the browser's Back
  // closes the detail instead of leaving the gallery, and a detail can be
  // linked. Read from the live list, so the sheet always shows the newest
  // record; a link to an artist who has gone just shows the gallery.
  const detail = useOverlayParam('artist')
  const selected = detail.value ? artists.find((a) => a.id === detail.value) || null : null
  const openArtist = (artist) => detail.open(artist.id)
  const [viewMode, setViewMode] = useState('wall')
  const showsWall = viewMode === 'wall' || artists.length === 0
  const favActive = favOnly && showsWall
  const chipLabel = [favActive && 'Favourites', activeTag].filter(Boolean).join(' · ')
  // #70: grid cards are pure navigation until this is on. Only grid can reorder,
  // so leaving grid drops it — otherwise the state outlives its only switch.
  const [editing, setEditing] = useState(false)
  function changeView(mode) {
    setViewMode(mode)
    setEditing(false)
  }
  const [browsing, setBrowsing] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
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
  // ?add=1 (Home's empty state) opens the same modal, but empty: no share-target stash to collect.
  const [quickAdding, setQuickAdding] = useState(() => searchParams.get('shared') === '1' || searchParams.get('add') === '1')
  const [sharedFile, setSharedFile] = useState(null)
  const [sharedFilePending, setSharedFilePending] = useState(() => searchParams.get('shared') === '1')
  const [captureReceipt, setCaptureReceipt] = useState(null)
  // A Consider-shelf suggestion on the wall opens quick-add prefilled.
  const [addInitial, setAddInitial] = useState(null)
  function closeCapture() {
    setQuickAdding(false)
    setSharedFile(null)
    setSharedFilePending(false)
    setAddInitial(null)
    if (searchParams.has('shared') || searchParams.has('add')) {
      const next = new URLSearchParams(searchParams)
      next.delete('shared')
      next.delete('add')
      setSearchParams(next, { replace: true })
    }
  }

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
      if (cancelled) return
      if (file) setSharedFile(file)
      setSharedFilePending(false)
    })
    return () => { cancelled = true }
  }, [searchParams])

  // #46: paste anywhere on the page, not just inside the quick-add form —
  // the same entry point the share-target flow uses (initialFile), so the
  // screenshot pipeline has exactly one way in. Skipped while quick-add is
  // already open (its own form-level onPaste handles that case) and while a
  // text input/textarea has focus, so pasting a handle into a field is
  // unaffected.
  useEffect(() => {
    if (quickAdding) return undefined
    function handlePagePaste(e) {
      // A wall photo open full-screen takes the paste itself: it adds the image
      // to that artist, so it must not also open add-artist here (#220).
      if (searchParams.has('photo')) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type?.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      setSharedFile(file)
      setQuickAdding(true)
    }
    document.addEventListener('paste', handlePagePaste)
    return () => document.removeEventListener('paste', handlePagePaste)
  }, [quickAdding, searchParams])

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

  // A live drag — keyboard most of all — must not let any of these
  // transitions fire underneath it (#74): dnd-kit's KeyboardSensor installs
  // document-level listeners on activation that are only torn down in the
  // drag's own handleEnd/handleCancel, not on unmount. Switching view or
  // opening Manage would unmount the grid mid-drag with that listener still
  // live; turning Reorder off or picking a filter can hide or unmount the
  // very card being dragged. Disabling those controls while a drag is live is
  // the smaller, more predictable fix over trying to cancel dnd-kit's own
  // drag from the outside.
  const [dragActive, setDragActive] = useState(false)

  function handleDragEnd(event) {
    setDragActive(false)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const all = artists.slice().sort((a, b) => a.rank - b.rank)
    const oldIndex = all.findIndex((a) => a.id === active.id)
    const newIndex = all.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(all, oldIndex, newIndex).map((a, i) => ({ ...a, rank: i + 1 }))

    setArtists((prev) => prev.map((a) => reordered.find((r) => r.id === a.id) || a))
  }

  // (id, generation, patch | updater) rather than a whole record (#79). Two
  // saves for the same artist in flight at once used to race on whichever
  // payload a stale closure was holding — start an upload, toggle a tag
  // before it resolves, and the upload's own closure still carried the
  // pre-toggle draft, so its save silently reverted the tag. Resolving the
  // patch here, against whatever is latest at commit time, means two saves
  // that touch different fields (images vs tags) can no longer clobber each
  // other regardless of which one was in flight longer.
  //
  // `generation` guards identity, not content (#80): artist ids are handles,
  // so deleting an artist and adding a new one with the same handle produces
  // a record with the identical id the old one had. A save/upload closure
  // captured while viewing the original artist would otherwise still match
  // by id alone and land on the recreated artist's record. createArtist
  // assigns a fresh generation on every call, so a stale save's captured
  // generation no longer matches the live record's once it's been replaced.
  function saveArtist(id, generation, patchOrUpdater) {
    const applyPatch = (record) =>
      typeof patchOrUpdater === 'function' ? patchOrUpdater(record) : { ...record, ...patchOrUpdater }
    const matches = (record) => record.id === id && record.generation === generation
    // The open sheet reads the live record, and which artist is open is the
    // URL's business, so a stale save for an artist that is no longer open
    // cannot reopen them on top of whatever is now selected (#78).
    setArtists((prev) => prev.map((a) => (matches(a) ? applyPatch(a) : a)))
  }

  // Delegates so both entry points resolve an updater against the newest list;
  // an array is still accepted for callers that genuinely have the whole set.
  function saveImages(artist, imagesOrUpdater) {
    saveImagesById(artist.id, imagesOrUpdater)
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


  function addArtist(draft) {
    const artist = createArtist(draft, artists)
    if (!artist) return
    // Quick-add and the share target hand over the screenshot as an inline
    // data URL, which the sync layer can't store. Stage it first (#115): by
    // the time the artist is added the photo has a key and a copy on this
    // device, so the first save stores { key } and a failed upload can't lose
    // it. With no screenshot, or signed out, this adds at once, as before.
    void withStagedImages(artist.images, { userId: user?.id, scope: 'artists', id: artist.id }, () => {
      setArtists((prev) => (prev.some((a) => a.id === artist.id) ? prev : [...prev, artist]))
    })
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
    <main className="min-h-screen bg-ink-black pt-safe-top">
      {/* Page header */}
      {/* #220 E: the title and its two buttons share one row at every width, so
          the Tools menu always opens from the right edge. */}
      <div className="px-4 pt-5 md:pt-10 pb-4">
        <Logo size={28} className="mb-3 md:hidden" />
        {/* Phones show the logo above instead: one line fewer before the photos. */}
        <p className="hidden md:block font-mono text-xs text-accent tracking-[0.4em] uppercase mb-2">Your Collection</p>
        {/* Wraps under the title at 320px, staying on the right edge. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Artists</h1>
          <div className="flex gap-2 shrink-0 ml-auto">
            {/* Always reachable — one-step onboarding for a new artist */}
            <button
              onClick={() => setQuickAdding(true)}
              className="font-mono text-xs text-accent hover:text-cream border border-accent/40 hover:border-accent px-3 min-h-11 rounded-xs transition-colors tracking-widest uppercase"
            >
              + Add
            </button>
            {manageMode ? (
              <button
                onClick={() => changeManage(false)}
                disabled={dragActive}
                className="font-mono text-xs px-3 min-h-11 rounded-xs transition-colors tracking-widest uppercase border text-cream border-accent/50 bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Done managing
              </button>
            ) : (
              <ToolsMenu
                disabled={dragActive}
                tools={[
                  ...(artistsWithImages.length > 0 ? [
                    { label: 'Rank', hint: 'Judge each artist in turn: pass, maybe or top', onSelect: () => setRanking(true) },
                    { label: 'Browse', hint: 'Flip through your artists one at a time', onSelect: () => setBrowsing(true) },
                    { label: 'Map', hint: 'See your artists laid out by how their work looks', onSelect: () => setMapOpen(true) },
                  ] : []),
                  { label: 'Manage', hint: 'Add, edit and remove artists and their photos', onSelect: () => changeManage(true) },
                ]}
              />
            )}
          </div>
        </div>
        <GeneratedArtworkNotice images={artists.flatMap((artist) => artist.images || [])} className="mt-3" />
        {/* A saved artist working near Milton Keynes soon (#183): one chip, nothing when none. */}
        <NearbySoon artists={artists} compact className="mt-3" />
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
      {/* Sticky view bar. #220 E: the style pills used to fill this row on every
          view, and the owner never used them. They now open from Filter, and an
          active filter shows as a chip in the button's place. */}
      <div className={`sticky top-[var(--nav-top)] z-20 bg-ink-black/80 backdrop-blur-md border-b border-ink-border px-4 py-2 ${viewMode === 'wall' ? '' : 'mb-6'}`}>
        <div ref={filterBarRef} className="flex items-center gap-2">
          {/* View toggle: words, not glyphs. Each button is a 44pt target (#73). */}
          <div className="flex gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin">
            {[
              { mode: 'wall', label: 'Wall', title: 'Wall view' },
              { mode: 'filmstrip', label: 'Strip', title: 'Filmstrip view' },
              { mode: 'compare', label: 'Compare', title: 'Compare artists' },
              { mode: 'grid', label: 'Grid', title: 'Grid view' },
            ].map(({ mode, label, title }) => (
              <button
                key={mode}
                onClick={() => changeView(mode)}
                disabled={dragActive}
                title={title}
                aria-label={title}
                aria-pressed={viewMode === mode}
                // The fill belongs on the 44pt box, so it shows what is
                // actually tappable (agy review).
                className={`min-w-11 h-11 px-2 shrink-0 flex items-center justify-center rounded-xs font-mono text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed ${
                  viewMode === mode ? 'text-cream bg-ink-card' : 'text-cream-muted hover:text-cream'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {chipLabel && !filterOpen ? (
            // Two targets in one chip: the name reopens the styles to pick
            // another, the cross clears it (agy review).
            <div className="min-w-0 h-11 flex items-stretch rounded-xs border border-accent/50 bg-accent/10 font-mono text-xs text-cream">
              <button
                data-filter-control
                onClick={() => setFilterOpen(true)}
                disabled={dragActive}
                aria-label={`Change filter: ${chipLabel}`}
                className="min-w-0 pl-2.5 pr-1 flex items-center rounded-xs disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="truncate">{chipLabel}</span>
              </button>
              <button
                onClick={() => { setActiveTag(null); setFavOnly(false) }}
                disabled={dragActive}
                aria-label={`Clear filter: ${chipLabel}`}
                className="shrink-0 w-9 flex items-center justify-center rounded-xs disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ) : (
            <button
              data-filter-control
              onClick={() => setFilterOpen((v) => !v)}
              disabled={dragActive}
              aria-expanded={filterOpen}
              aria-controls={filterOpen ? 'artist-style-filter' : undefined}
              className={`shrink-0 h-11 px-2.5 rounded-xs font-mono text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                filterOpen ? 'text-cream bg-ink-card' : 'text-cream-muted hover:text-cream'
              }`}
            >
              Filter
            </button>
          )}
        </div>
        {filterOpen && (
          <div id="artist-style-filter" className="flex gap-2 overflow-x-auto scrollbar-thin mt-2">
            <TagPill
              tag="All"
              active={!activeTag && !favActive}
              onClick={() => { setFavOnly(false); pickTag(null) }}
              disabled={dragActive}
              minTapHeight
            />
            {showsWall && (
              <TagPill
                tag="Favourites"
                active={favOnly}
                onClick={() => setFavOnly((v) => !v)}
                disabled={dragActive}
                minTapHeight
              />
            )}
            {STYLE_TAGS.map((tag) => (
              <TagPill
                key={tag}
                tag={tag}
                active={activeTag === tag}
                onClick={() => pickTag(activeTag === tag ? null : tag)}
                disabled={dragActive}
                minTapHeight
              />
            ))}
          </div>
        )}
      </div>

      <SampleArtistNotice artists={artists} setArtists={setArtists} className="mx-4 md:mx-8 my-3" />

      {/* #161: with nobody saved, every view was blank under its filters. */}
      {artists.length === 0 && saved.length === 0 ? (
        <div className="max-w-xl mx-auto px-4 py-12">
          <EmptyState
            definition="Save the tattooists whose work you would wear. Each one keeps their photos, styles and where they work, and you put them in order as your taste settles."
            onClick={() => setQuickAdding(true)}
            cta="Add an artist"
          >
            <SampleArtistButton setArtists={setArtists} />
          </EmptyState>
        </div>
      ) : viewMode === 'wall' || artists.length === 0 ? (
        <WallView
          artists={artists}
          wallArtists={sorted}
          ideas={ideas}
          saved={activeTag ? [] : saved}
          allSaved={saved}
          onClearFilters={() => { setActiveTag(null); setFavOnly(false) }}
          setSaved={setSaved}
          favourites={favourites}
          setFavourites={setFavourites}
          favouritesOnly={favActive}
          styleFilter={activeTag}
          setArtists={setArtists}
          onAddArtist={(initial) => { setAddInitial(initial); setQuickAdding(true) }}
          revealArtistId={captureReceipt?.kind === 'created' ? captureReceipt.artistId : null}
        />
      ) : viewMode === 'filmstrip' ? (
        <FilmstripView artists={sorted} onOpenArtist={openArtist} onSetRank={setRank} />
      ) : viewMode === 'compare' ? (
        <CompareView artists={artists} onOpenArtist={openArtist} />
      ) : (
        <div className="px-4 max-w-7xl mx-auto">
          {/* #70: only grid has cards to drag, so the toggle lives with the grid.
              It was a bare ⇅ in the view bar until #220 E gave it a word. */}
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditing((v) => !v)}
              disabled={dragActive}
              aria-pressed={editing}
              // Names both jobs: the mode reveals the quick-upload + as well
              // as the drag handle (agy review).
              aria-label="Reorder and add photos"
              className={`min-w-11 h-11 px-3 rounded-xs border font-mono text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed ${
                editing ? 'text-cream border-accent/50 bg-accent/10' : 'text-cream-muted hover:text-cream border-ink-border'
              }`}
            >
              <span aria-hidden="true">⇅ </span>{editing ? 'Done reordering' : 'Reorder'}
            </button>
          </div>
          <ArtistGrid
            items={sorted}
            sensors={sensors}
            onDragStart={() => setDragActive(true)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragActive(false)}
            onOpen={openArtist}
            onSaveImages={saveImages}
            editing={editing}
            onLongPress={() => setEditing(true)}
          />
          {sorted.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-cream-muted/90 tracking-widest uppercase text-xs font-mono">
                No artists match this filter
              </p>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {selected && (
        <ArtistDetail
          // Remounts on switch (#78): ArtistDetail's local images/draft
          // initialise once from props and never re-sync, and the sheet can
          // change `selected` from inside itself via Similar ink. Without a
          // key, a save made just after switching wrote onto the artist that
          // was open first — draft still named it, spread last in the write.
          key={selected.id}
          artist={selected}
          onClose={detail.close}
          onSave={saveArtist}
          attendingConventions={mergedConventions.filter((c) => c.attendingArtistIds.includes(selected.id))}
          attendedConventions={pastAttendance(mergedConventions, selected.id)}
          allArtists={artists}
          // Similar ink swaps the artist in place: Back still closes the sheet.
          onSelectArtist={(artist) => detail.replace(artist.id)}
        />
      )}

      {mapOpen && (
        <TasteMap
          artists={artists}
          onOpenArtist={(artist) => { setMapOpen(false); openArtist(artist) }}
          onClose={() => setMapOpen(false)}
        />
      )}

      {browsing && (
        <ArtistBrowse
          artists={artists}
          onClose={() => setBrowsing(false)}
        />
      )}

      {quickAdding && (
        <AddArtistModal
          key={addInitial?.handle || 'blank'}
          initial={addInitial || undefined}
          artists={artists}
          setArtists={setArtists}
          setSaved={setSaved}
          userId={userId}
          onClose={closeCapture}
          onManage={() => changeManage(true)}
          onSaved={setCaptureReceipt}
          initialFile={sharedFile}
          initialFilePending={sharedFilePending}
        />
      )}

      {captureReceipt && <p role="status" className="fixed bottom-24 left-4 right-4 sm:left-auto sm:max-w-md z-40 bg-v2-surface border border-v2-hairline px-3 flex items-center gap-3 font-v2-ui text-sm text-v2-cream">
        <span className="min-w-0 break-words">{captureReceipt.kind === 'saved-photo' ? `${captureReceipt.imageCount === 1 ? 'Photo' : `${captureReceipt.imageCount} photos`} saved to the wall` : captureReceipt.kind === 'created' ? 'Artist saved' : `${captureReceipt.imageCount} ${captureReceipt.imageCount === 1 ? 'photo' : 'photos'} added to @${artists.find((a) => a.id === captureReceipt.artistId)?.handle || captureReceipt.artistId}`}</span>
        <button type="button" aria-label="Dismiss save confirmation" title="Dismiss confirmation" className="shrink-0 w-11 h-11 flex items-center justify-center text-v2-muted" onClick={() => setCaptureReceipt(null)}><X size={18} /></button>
      </p>}

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
    </main>
  )
}
