import { useState } from 'react'
import ArtistImage from './ArtistImage'

// A single image on the Wall — full-bleed, no chrome. The caption is an
// engraved plate that only appears on hover; it never intercepts the click
// (pointer-events: none) so the whole piece stays clickable. Also a drop
// target: dragging an image file over a piece adds it to that piece's artist.
export default function WallPiece({ item, onOpen, onDropImage }) {
  const [dragOver, setDragOver] = useState(false)
  const src = typeof item.image === 'string' ? item.image : item.image?.url || ''

  function handleDragOver(e) {
    if (!onDropImage) return
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(e) {
    if (!onDropImage) return
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onDropImage(item.artistId, file)
  }

  return (
    <figure
      className={`relative mb-[6px] break-inside-avoid overflow-hidden cursor-zoom-in group ${
        dragOver ? 'ring-2 ring-v2-accent ring-inset' : ''
      }`}
      onClick={() => onOpen(item)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ArtistImage
        src={src}
        label={item.artistName}
        loading="lazy"
        className="w-full block grayscale-[0.15] group-hover:grayscale-0 transition-[filter] duration-300"
        fallbackClassName="aspect-[4/5]"
      />

      {item.isRecent && (
        <span
          title="New since your last visit"
          className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-v2-accent ring-[3px] ring-v2-ink/60"
        />
      )}

      <figcaption
        className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-3 pt-10 pb-2.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-v2-ink/95 via-v2-ink/60 to-transparent"
      >
        <span className="font-v2-display text-v2-cream text-base uppercase tracking-[0.18em] leading-tight truncate [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
          {item.artistName}
        </span>
        {item.studioName && (
          <small className="font-v2-ui text-v2-cream/80 text-[0.7rem] tracking-[0.08em] truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
            {item.studioName}
          </small>
        )}
      </figcaption>
    </figure>
  )
}
