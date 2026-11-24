import ArtistImage from './ArtistImage'

// Key-free curation hints in Manage (#187), worked out from the style index by
// src/data/curation.js. Suggestions only: nothing here changes tags or removes
// photos until the owner taps.

const label = (a) => a.name || `@${a.handle}`

function names(artists) {
  const all = artists.map(label)
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : all[0]
}

// "+ realism · Looks like A, B and C, tagged realism."
export function TagSuggestions({ suggestions, onAccept }) {
  if (!suggestions.length) return null
  return (
    <ul className="mt-3 space-y-1.5">
      {suggestions.map(({ tag, because }) => (
        <li key={tag} className="flex items-center gap-3">
          {/* The 44pt hit area is the button; the visible chip matches the small tag pills. */}
          <button
            type="button"
            onClick={() => onAccept(tag)}
            aria-label={`Add the ${tag} tag`}
            className="group inline-flex items-center min-h-11 shrink-0"
          >
            <span className="px-1.5 py-0.5 rounded-xs border border-dashed border-cream-muted/60 font-mono text-[0.8125rem] tracking-widest uppercase text-cream-muted group-hover:border-accent group-hover:text-accent transition-colors">
              + {tag}
            </span>
          </button>
          <span className="text-xs text-cream-muted/90 font-body">
            Suggested: looks like {names(because)}, tagged {tag}.
          </span>
        </li>
      ))}
    </ul>
  )
}

// Photos far from the rest of this artist's work, each with Keep or Remove.
export function OffStylePhotos({ artist, flags, onKeep, onRemove }) {
  if (!flags.length) return null
  return (
    <section aria-label="Doesn't look like the rest">
      <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-1">
        Doesn&rsquo;t look like the rest ({flags.length})
      </p>
      <p className="text-xs text-cream-muted/90 font-body mb-2">
        Far from this artist&rsquo;s other photos: a selfie, a poster, someone else&rsquo;s work? Keep it and Sable won&rsquo;t ask again.
      </p>
      <ul className="space-y-2">
        {flags.map(({ image, index }) => (
          <li key={index} className="flex items-center gap-3">
            {/* Bigger than the strip above: big enough to tell a poster from a piece. */}
            <div className="w-28 h-28 rounded-xs overflow-hidden bg-ink-muted shrink-0">
              <ArtistImage src={image} label={label(artist)} className="w-full h-full object-cover" monogramClassName="text-lg" />
            </div>
            <button
              type="button"
              onClick={() => onKeep(image)}
              className="min-h-11 px-3 rounded-xs border border-ink-border font-mono text-xs tracking-widest uppercase text-cream-muted hover:text-cream hover:border-cream-muted/60 transition-colors"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="min-h-11 px-3 rounded-xs border border-ink-border font-mono text-xs tracking-widest uppercase text-cream-muted hover:text-accent hover:border-accent transition-colors"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
