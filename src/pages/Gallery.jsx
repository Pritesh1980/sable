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
import ArtistDetail from '../components/ArtistDetail'
import TagPill from '../components/TagPill'
import { STYLE_TAGS, TIERS } from '../data/artists'

export default function Gallery({ artists, setArtists }) {
  const [activeTag, setActiveTag] = useState(null)
  const [selected, setSelected] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const favourites = artists
    .filter((a) => a.tier === TIERS.FAVOURITE && (!activeTag || a.tags.includes(activeTag)))
    .sort((a, b) => a.rank - b.rank)

  const alsoLike = artists
    .filter((a) => a.tier === TIERS.ALSO_LIKE && (!activeTag || a.tags.includes(activeTag)))
    .sort((a, b) => a.rank - b.rank)

  function handleDragEnd(event, tier) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const tierArtists = artists.filter((a) => a.tier === tier).sort((a, b) => a.rank - b.rank)
    const oldIndex = tierArtists.findIndex((a) => a.id === active.id)
    const newIndex = tierArtists.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(tierArtists, oldIndex, newIndex).map((a, i) => ({ ...a, rank: i + 1 }))

    setArtists((prev) =>
      prev.map((a) => {
        const updated = reordered.find((r) => r.id === a.id)
        return updated || a
      })
    )
  }

  function saveArtist(updated) {
    setArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    setSelected(updated)
  }

  function saveImages(artist, images) {
    setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, images } : a)))
  }

  function TierSection({ label, items, tier, indexOffset = 0 }) {
    return (
      <section className="mb-14">
        {/* Editorial section divider */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex-1 h-px bg-ink-border" />
          <h2 className="font-display text-2xl text-cream tracking-wide shrink-0">{label}</h2>
          <span className="font-mono text-[10px] text-cream-muted/50 tracking-[0.2em] shrink-0">
            {String(items.length).padStart(2, '0')}
          </span>
          <div className="flex-1 h-px bg-ink-border" />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => handleDragEnd(e, tier)}
        >
          <SortableContext items={items.map((a) => a.id)} strategy={rectSortingStrategy}>
            {/* Top 3 — featured trio */}
            {items.filter((a) => a.rank <= 3).length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {items.filter((a) => a.rank <= 3).map((artist, i) => (
                  <SortableArtistCard
                    key={artist.id}
                    artist={artist}
                    onOpen={setSelected}
                    onSaveImages={saveImages}
                    featured={true}
                    index={indexOffset + i}
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
                    onOpen={setSelected}
                    onSaveImages={saveImages}
                    featured={false}
                    index={indexOffset + 3 + i}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>

        {items.length === 0 && (
          <p className="text-cream-muted/20 text-sm font-body py-10 text-center tracking-widest uppercase text-xs font-mono">
            No artists match this filter
          </p>
        )}
      </section>
    )
  }

  return (
    <div className="min-h-screen bg-ink-black pt-safe-top">
      {/* Page header */}
      <div className="px-4 pt-10 pb-4">
        <p className="font-mono text-[10px] text-accent tracking-[0.4em] uppercase mb-2">Your Collection</p>
        <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Artists</h1>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 bg-ink-black/80 backdrop-blur-md border-b border-ink-border px-4 py-3 mb-8">
        <div className="flex gap-2 flex-wrap">
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
      </div>

      <div className="px-4">
        <TierSection label="Favourites" items={favourites} tier={TIERS.FAVOURITE} indexOffset={0} />
        <TierSection label="Also Like" items={alsoLike} tier={TIERS.ALSO_LIKE} indexOffset={favourites.length} />
      </div>

      {selected && (
        <ArtistDetail
          artist={selected}
          onClose={() => setSelected(null)}
          onSave={saveArtist}
        />
      )}
    </div>
  )
}
