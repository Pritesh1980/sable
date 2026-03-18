import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ArtistCard from './ArtistCard'

export default function SortableArtistCard({ artist, onOpen, onSaveImages, index, featured }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: artist.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ArtistCard
        artist={artist}
        onOpen={onOpen}
        onSaveImages={onSaveImages}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        featured={featured}
        index={index}
      />
    </div>
  )
}
