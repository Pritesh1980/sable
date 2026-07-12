import { useEffect } from 'react'
import { moveUp, moveDown, moveIntoTop5, moveOutOfTop5 } from '../data/ranking'
import ArtistImage from './ArtistImage'

const label = (a) => a.name || `@${a.handle}`

function Cover({ artist, size }) {
  return (
    <span className={`${size} rounded-sm overflow-hidden shrink-0 block`}>
      <ArtistImage src={artist.images?.[0]} label={label(artist)} className="w-full h-full object-cover" monogramClassName="text-sm" />
    </span>
  )
}

function NudgeButtons({ artist, setArtists }) {
  return (
    <span className="flex flex-col shrink-0">
      <button
        aria-label={`Move ${label(artist)} up`}
        onClick={() => setArtists((prev) => moveUp(prev, artist.id))}
        className="text-v2-muted hover:text-v2-cream text-xs leading-none px-3 py-2.5"
      >
        ▲
      </button>
      <button
        aria-label={`Move ${label(artist)} down`}
        onClick={() => setArtists((prev) => moveDown(prev, artist.id))}
        className="text-v2-muted hover:text-v2-cream text-xs leading-none px-3 py-2.5"
      >
        ▼
      </button>
    </span>
  )
}

// One consolidated full-screen ranking home. Top 5 pinned; everyone else below.
export default function RankBoard({ artists = [], setArtists = () => {}, onClose = () => {} }) {
  // Own the body-scroll lock, saving/restoring the previous value so this and
  // the WallViewer never clobber each other's overflow.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sorted = artists.slice().sort((a, b) => a.rank - b.rank)
  const top5 = sorted.slice(0, 5)
  const rest = sorted.slice(5)

  return (
    <div className="fixed inset-0 z-[60] bg-v2-ink flex flex-col animate-fade-in">
      <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-v2-hairline">
        <h2 className="font-v2-display text-v2-cream text-lg tracking-wide">Rank artists</h2>
        <button
          onClick={onClose}
          className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-4 py-1.5 transition-colors"
        >
          Done
        </button>
      </header>

      {artists.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="font-v2-ui text-v2-muted text-sm">Add artists to start ranking.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-accent mb-2">Top 5</p>
          <ul data-testid="board-top5" className="mb-8">
            {top5.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 border-b border-v2-hairline/60">
                <span className="font-v2-display text-v2-accent text-xl w-6 text-center shrink-0">{a.rank}</span>
                <Cover artist={a} size="w-11 h-11" />
                <span className="font-v2-ui text-sm text-v2-cream flex-1 truncate">{label(a)}</span>
                <NudgeButtons artist={a} setArtists={setArtists} />
                <button
                  aria-label={`Drop ${label(a)} out of top 5`}
                  onClick={() => setArtists((prev) => moveOutOfTop5(prev, a.id))}
                  className="shrink-0 font-v2-ui text-xs text-v2-muted hover:text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-2.5 py-1.5 transition-colors"
                >
                  Drop ↓
                </button>
              </li>
            ))}
          </ul>

          {rest.length > 0 && (
            <>
              <p className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-muted mb-2">Everyone else</p>
              <ul data-testid="board-rest">
                {rest.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-1.5 border-b border-v2-hairline/40">
                    <span className="font-v2-ui text-v2-muted text-sm w-6 text-center shrink-0">{a.rank}</span>
                    <Cover artist={a} size="w-8 h-8" />
                    <span className="font-v2-ui text-sm text-v2-cream flex-1 truncate">{label(a)}</span>
                    <NudgeButtons artist={a} setArtists={setArtists} />
                    <button
                      aria-label={`Move ${label(a)} into top 5`}
                      onClick={() => setArtists((prev) => moveIntoTop5(prev, a.id))}
                      className="shrink-0 font-v2-ui text-xs text-v2-muted hover:text-v2-accent border border-v2-hairline hover:border-v2-accent rounded-sm px-2.5 py-1.5 transition-colors"
                    >
                      ↑ To top 5
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
