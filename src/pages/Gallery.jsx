import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
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
import { STYLE_TAGS } from '../data/artists'

function ArtistGrid({ items, sensors, onDragEnd, onOpen, onSaveImages }) {
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
              />
            ))}
          </div>
        )}
        {/* Remaining — compact grid */}
        {items.filter((a) => a.rank > 3).length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {items.filter((a) => a.rank > 3).map((artist, i) => (
              <SortableArtistCard
                key={artist.id}
                artist={artist}
                onOpen={onOpen}
                onSaveImages={onSaveImages}
                featured={false}
                index={3 + i}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </DndContext>
  )
}

export default function Gallery({ artists, setArtists }) {
  const [activeTag, setActiveTag] = useState(null)
  const [selected, setSelected] = useState(null)
  const [viewMode, setViewMode] = useState('filmstrip')
  const [browsing, setBrowsing] = useState(false)
  const [ranking, setRanking] = useState(false)

  const artistsWithImages = artists.filter((a) => a.images?.length > 0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
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

  return (
    <div className="min-h-screen bg-ink-black pt-safe-top">
      {/* Page header */}
      <div className="px-4 pt-10 pb-4 flex items-end justify-between">
        <div>
          <Logo size={28} className="mb-3" />
          <p className="font-mono text-[12px] text-accent tracking-[0.4em] uppercase mb-2">Your Collection</p>
          <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Artists</h1>
        </div>
        {artistsWithImages.length > 0 && (
          <div className="flex gap-2 mb-1">
            <button
              onClick={() => setRanking(true)}
              className="font-mono text-[12px] text-accent hover:text-cream border border-accent/40 hover:border-accent px-3 py-2 rounded-sm transition-colors tracking-widest uppercase"
            >
              Rank
            </button>
            <button
              onClick={() => setBrowsing(true)}
              className="font-mono text-[12px] text-cream-muted hover:text-cream border border-ink-border hover:border-cream-muted/40 px-3 py-2 rounded-sm transition-colors tracking-widest uppercase"
            >
              Browse
            </button>
          </div>
        )}
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-ink-black/80 backdrop-blur-md border-b border-ink-border px-4 py-3 mb-8">
        <div className="flex items-center gap-2">
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
          {/* View toggle */}
          <div className="flex gap-1 shrink-0 ml-2">
            {[
              { mode: 'filmstrip', label: '☰', title: 'Filmstrip view' },
              { mode: 'compare', label: '⊟', title: 'Compare artists' },
              { mode: 'grid', label: '⊞', title: 'Grid view' },
              { mode: 'wall', label: '▦', title: 'Style wall' },
            ].map(({ mode, label, title }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={title}
                className={`px-2 py-1 rounded-sm text-[13px] font-mono transition-colors ${viewMode === mode ? 'text-cream bg-ink-card' : 'text-cream-muted/50 hover:text-cream-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'wall' ? (
        <StyleWall artists={artists} onOpenArtist={setSelected} />
      ) : viewMode === 'filmstrip' ? (
        <FilmstripView artists={sorted} onOpenArtist={setSelected} onSetRank={setRank} />
      ) : viewMode === 'compare' ? (
        <CompareView artists={artists} onOpenArtist={setSelected} />
      ) : (
        <div className="px-4">
          <ArtistGrid
            items={sorted}
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onOpen={setSelected}
            onSaveImages={saveImages}
          />
          {sorted.length === 0 && (
            <p className="text-cream-muted/90 py-10 text-center tracking-widest uppercase text-xs font-mono">
              No artists match this filter
            </p>
          )}
        </div>
      )}

      {selected && (
        <ArtistDetail
          artist={selected}
          onClose={() => setSelected(null)}
          onSave={saveArtist}
        />
      )}

      {browsing && (
        <ArtistBrowse
          artists={artists}
          onClose={() => setBrowsing(false)}
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
