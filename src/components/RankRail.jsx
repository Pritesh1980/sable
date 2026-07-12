import { moveUp, moveDown } from '../data/ranking'
import ArtistImage from './ArtistImage'

const label = (a) => a.name || `@${a.handle}`

// Slim always-visible Top-5 dock on the Wall. One low row so it never pushes
// the image masonry below the fold. ▲/▼ use true global move semantics.
export default function RankRail({ artists = [], setArtists = () => {}, onOpenBoard = () => {} }) {
  if (artists.length === 0) return null

  const top5 = artists.slice().sort((a, b) => a.rank - b.rank).slice(0, 5)

  return (
    <section
      aria-label="Your top five"
      className="sticky top-[3.25rem] z-[9] flex items-center gap-3 px-4 py-2 bg-v2-ink/[.92] backdrop-blur-md border-b border-v2-hairline"
    >
      <span className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-accent shrink-0">
        Top 5
      </span>

      <ol className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-thin">
        {top5.map((a, i) => (
          <li
            key={a.id}
            data-testid="rank-tile"
            className="flex items-center gap-1.5 shrink-0 bg-v2-surface border border-v2-hairline rounded-sm pl-1.5 pr-1 py-1"
          >
            <span className="font-v2-display text-v2-accent text-sm w-4 text-center">{i + 1}</span>
            <span className="w-7 h-7 rounded-sm overflow-hidden shrink-0">
              <ArtistImage src={a.images?.[0]} label={label(a)} className="w-full h-full object-cover" monogramClassName="text-[0.625rem]" />
            </span>
            <span className="font-v2-ui text-xs text-v2-cream max-w-[6.5rem] truncate">{label(a)}</span>
            <span className="flex flex-col">
              <button
                aria-label={`Move ${label(a)} up`}
                onClick={() => setArtists((prev) => moveUp(prev, a.id))}
                className="text-v2-muted hover:text-v2-cream text-[0.6875rem] leading-none px-2.5 py-1.5"
              >
                ▲
              </button>
              <button
                aria-label={`Move ${label(a)} down`}
                onClick={() => setArtists((prev) => moveDown(prev, a.id))}
                className="text-v2-muted hover:text-v2-cream text-[0.6875rem] leading-none px-2.5 py-1.5"
              >
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>

      <button
        onClick={onOpenBoard}
        className="shrink-0 font-v2-ui text-xs text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-3 py-1.5 transition-colors"
      >
        Rank ⤢
      </button>
    </section>
  )
}
