import { addSampleArtist, findSampleArtist, removeSampleArtists } from '../data/sampleArtist'

// The sample artist's two controls (#220, group C): add it from an empty
// library, and the notice that marks it and takes it out again in one tap.

export function SampleArtistButton({ setArtists, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => setArtists((prev) => addSampleArtist(prev))}
      className={`block min-h-11 mt-2 font-mono text-[0.6875rem] text-cream-muted hover:text-accent tracking-widest uppercase transition-colors ${className}`}
    >
      Or add a sample artist to look around
    </button>
  )
}

export default function SampleArtistNotice({ artists, setArtists, className = '' }) {
  const sample = findSampleArtist(artists)
  if (!sample) return null
  return (
    <div
      role="note"
      aria-label="Sample artist"
      className={`flex items-center justify-between gap-3 border border-dashed border-ink-border rounded-xs pl-3 pr-1 ${className}`}
    >
      <p className="min-w-0 font-body text-xs text-cream-muted leading-snug py-2">
        <span className="text-cream">{sample.name}</span> is a sample with made-up work, not a real artist.
      </p>
      <button
        type="button"
        onClick={() => setArtists((prev) => removeSampleArtists(prev))}
        className="min-h-11 px-2 font-mono text-xs text-accent hover:text-cream tracking-widest uppercase transition-colors shrink-0"
      >
        Remove sample
      </button>
    </div>
  )
}
