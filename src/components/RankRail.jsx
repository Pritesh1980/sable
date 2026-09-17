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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { moveToRank } from '../data/ranking'
import ArtistImage from './ArtistImage'

const label = (a) => a.name || `@${a.handle}`

// #87. Two stacked/side-by-side 44x44 buttons don't fit this row (see the
// history in git blame), so the rank digit itself is the drag handle: one
// generous target instead of two small ones, and the same drag-to-rank
// interaction already used in the Artists grid and swipe-rank board.
function RankTile({ artist, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: artist.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="rank-tile"
      className={`flex items-center gap-1.5 shrink-0 bg-v2-surface border border-v2-hairline rounded-xs pl-1 pr-2 py-1 ${
        isDragging ? 'opacity-60 relative z-10' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label(artist)}, rank ${index + 1}`}
        className="font-v2-display text-v2-accent text-sm w-11 h-11 flex items-center justify-center shrink-0 touch-none cursor-grab active:cursor-grabbing outline-hidden focus-visible:ring-1 focus-visible:ring-v2-accent"
      >
        {index + 1}
      </button>
      <span className="w-7 h-7 rounded-xs overflow-hidden shrink-0">
        <ArtistImage
          src={artist.images?.[0]}
          label={label(artist)}
          className="w-full h-full object-cover"
          monogramClassName="text-[0.625rem]"
        />
      </span>
      <span className="font-v2-ui text-xs text-v2-cream max-w-[6.5rem] truncate">{label(artist)}</span>
    </li>
  )
}

// Slim always-visible Top-5 dock on the Wall. One low row so it never pushes
// the image masonry below the fold. Reordering is drag-only, scoped to the
// five visible tiles; demoting an artist out of the Top 5 entirely still
// goes through the full Rank board (`Rank ⤢`, one tap away).
export default function RankRail({ artists = [], setArtists = () => {}, onOpenBoard = () => {} }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  if (artists.length === 0) return null

  const top5 = artists.slice().sort((a, b) => a.rank - b.rank).slice(0, 5)

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const newIndex = top5.findIndex((a) => a.id === over.id)
    if (newIndex === -1) return
    setArtists((prev) => moveToRank(prev, active.id, newIndex + 1))
  }

  return (
    <section
      aria-label="Your top five"
      className="sticky top-[3.25rem] z-[9] flex items-center gap-3 px-4 py-2 bg-v2-ink/[.92] backdrop-blur-md border-b border-v2-hairline"
    >
      <span className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-accent shrink-0">
        Top 5
      </span>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={top5.map((a) => a.id)} strategy={horizontalListSortingStrategy}>
          <ol className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-thin">
            {top5.map((a, i) => (
              <RankTile key={a.id} artist={a} index={i} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <button
        onClick={onOpenBoard}
        className="shrink-0 font-v2-ui text-xs text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-xs px-3 min-h-11 transition-colors"
      >
        Rank ⤢
      </button>
    </section>
  )
}
