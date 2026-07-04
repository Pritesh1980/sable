import ArtistImage from './ArtistImage'

// A single image on the Wall — full-bleed, no chrome. The caption is an
// engraved plate that only appears on hover; it never intercepts the click
// (pointer-events: none) so the whole piece stays clickable.
export default function WallPiece({ item, onOpen }) {
  const src = typeof item.image === 'string' ? item.image : item.image?.url || ''

  return (
    <figure
      className="relative mb-[6px] break-inside-avoid overflow-hidden cursor-zoom-in group"
      onClick={() => onOpen(item)}
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
        className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-2 px-3 py-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-v2-ink/[.82] to-transparent"
      >
        <span className="font-v2-display text-v2-cream text-[0.82rem] uppercase tracking-[0.22em] truncate">
          {item.artistName}
        </span>
        {item.styles.length > 0 && (
          <small className="font-v2-ui text-v2-muted text-[0.62rem] uppercase tracking-[0.14em] shrink-0">
            {item.styles.join(', ')}
          </small>
        )}
      </figcaption>
    </figure>
  )
}
