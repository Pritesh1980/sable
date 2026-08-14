import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ArtistCard from './ArtistCard'
import { isDragEcho } from '../data/dragTap'

export default function SortableArtistCard({ artist, onOpen, onSaveImages, index, featured }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: artist.id,
  })

  // #54: the handle used to stop every click, which cost the card a 44pt corner
  // of its "open this artist" surface. Record when a drag was last live so only
  // that drag's own click is swallowed.
  const draggedAt = useRef(null)
  const pointerDownAt = useRef(null)
  const wasDragging = useRef(false)
  useEffect(() => {
    if (isDragging) {
      wasDragging.current = true
      return
    }
    // Only a genuine true -> false transition means a drag ended. Stamping from
    // the effect cleanup instead would also fire on StrictMode's extra
    // setup/cleanup probe for a card that mounts mid-drag (codex review).
    if (wasDragging.current) {
      wasDragging.current = false
      draggedAt.current = performance.now()
    }
  }, [isDragging])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const dragHandleProps = {
    ...attributes,
    ...listeners,
    // Wrap rather than replace: dnd-kit's own pointerdown is what starts a drag,
    // so clobbering it would trade reordering away for the tap fix.
    onPointerDown: (e) => {
      pointerDownAt.current = performance.now()
      listeners?.onPointerDown?.(e)
    },
    onClick: (e) => {
      // Not a button: let a plain tap bubble to the card. Only the click that a
      // just-finished drag produces is stopped.
      if (isDragEcho(draggedAt.current, pointerDownAt.current, performance.now())) {
        e.stopPropagation()
      }
    },
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ArtistCard
        artist={artist}
        onOpen={onOpen}
        onSaveImages={onSaveImages}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
        featured={featured}
        index={index}
      />
    </div>
  )
}
