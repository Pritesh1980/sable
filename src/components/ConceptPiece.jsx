// A single concept on the Concepts wall — same visual language as WallPiece
// (v2 tokens, hover caption, full-bleed image). Adds a variants-count badge
// in the top-left corner when the concept has saved results.
export default function ConceptPiece({ item, onOpen }) {
  return (
    <figure
      className="relative mb-[6px] break-inside-avoid overflow-hidden cursor-zoom-in group"
      onClick={() => onOpen(item)}
    >
      <img
        src={item.imageUrl}
        alt={item.title}
        loading="lazy"
        className="w-full block grayscale-[0.15] group-hover:grayscale-0 transition-[filter] duration-300"
      />

      {item.variantsCount > 0 && (
        <span className="absolute top-2.5 left-2.5 font-v2-ui text-[0.62rem] tracking-[0.08em] text-v2-cream bg-v2-ink/70 border border-v2-hairline rounded-full px-2.5 py-0.5">
          {item.variantsCount} {item.variantsCount === 1 ? 'variant' : 'variants'}
        </span>
      )}

      <figcaption
        className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-2 px-3 py-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-v2-ink/[.82] to-transparent"
      >
        <span className="font-v2-display text-v2-cream text-[0.82rem] uppercase tracking-[0.22em] truncate">
          {item.title}
        </span>
        <small className="font-v2-ui text-v2-muted text-[0.62rem] uppercase tracking-[0.14em] shrink-0">
          {item.steerArtistName ? `steered · ${item.steerArtistName}` : item.tags.join(', ')}
        </small>
      </figcaption>
    </figure>
  )
}
