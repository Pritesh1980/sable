import { useEffect, useMemo } from 'react'
import ArtistImage from './ArtistImage'
import useDialogFocus, { isTopmostDialog } from '../hooks/useDialogFocus'
import useStyleVectors from '../hooks/useStyleVectors'
import { rankArtistsByVector, similarPhotos } from '../data/embeddings'
import { buildWallItems } from '../data/wall'
import { refIdentity } from '../data/imageRef'

const BUTTON = 'min-h-11 flex items-center justify-center bg-v2-ink border border-v2-hairline hover:border-v2-accent rounded-xs px-4 py-2 text-v2-cream font-v2-ui text-sm transition-colors'
const LABEL = 'font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-3'

// "More like this" (#220 K): from one photo in the viewer, the three artists
// whose work sits closest to it and the photos most like it, ranked by the
// on-device Taste Engine. Uses the one style index (built from the same button
// as Similar ink); nothing leaves the device.
export default function MoreLikeThis({ item, artists, saved = [], onClose, onOpenItem, onOpenArtist }) {
  const dialogRef = useDialogFocus(true)
  const { vectors, getVec, coverage, progress, error, build } = useStyleVectors(artists, saved)

  // One layer per Escape: this sheet closes, the viewer under it stays.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (!isTopmostDialog(dialogRef.current)) return
      e.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dialogRef])

  const vec = getVec ? getVec(item.image) : null

  const artistMatches = useMemo(
    () => (vec ? rankArtistsByVector(artists, vec, getVec, { limit: 3, excludeId: item.artistId || undefined }) : []),
    [vec, artists, getVec, item.artistId]
  )
  const photoMatches = useMemo(
    () => (vec ? similarPhotos(vec, buildWallItems(artists, { saved }), getVec, { excludeImage: item.image }) : []),
    [vec, artists, saved, getVec, item.image]
  )

  let body
  if (vectors === null) {
    body = null // like Similar ink: nothing until the index has been read
  } else if (progress) {
    body = (
      <p role="status" className="font-v2-ui text-sm text-v2-cream">
        Indexing… {progress.done}/{progress.total}
        <span className="block text-v2-muted mt-1">The first run downloads the model.</span>
      </p>
    )
  } else if (coverage.embedded === 0 || !vec) {
    const first = coverage.embedded === 0
    body = (
      <div>
        <p className="font-v2-ui text-sm text-v2-cream leading-relaxed mb-4">
          {first
            ? 'Finding similar photos needs the style index. It is built on this device, with a one-off model download, and your photos never leave it.'
            : 'This photo is not in the style index yet.'}
        </p>
        <button type="button" onClick={build} className={BUTTON}>
          {first ? 'Build style index' : 'Update style index'}
        </button>
        {error && <p role="alert" className="font-v2-ui text-sm text-v2-accent mt-3">{error}</p>}
      </div>
    )
  } else {
    body = (
      <>
        <section className="mb-8" aria-labelledby="mlt-artists">
          <h3 id="mlt-artists" className={LABEL}>Closest artists</h3>
          {artistMatches.length === 0 ? (
            <p className="font-v2-ui text-sm text-v2-muted">No other artists are indexed yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {artistMatches.map(({ artist, similarity }) => (
                <li key={artist.id}>
                  <button
                    type="button"
                    onClick={() => onOpenArtist(artist)}
                    className="w-full min-h-14 flex items-center gap-3 text-left border border-v2-hairline hover:border-v2-accent rounded-xs p-1.5 pr-3 transition-colors"
                  >
                    <ArtistImage
                      src={artist.images?.[0]}
                      label={artist.name || artist.handle}
                      sizes="48px"
                      className="w-12 h-12 shrink-0 object-cover rounded-xs"
                      monogramClassName="text-xl"
                    />
                    <span className="min-w-0 flex-1">
                      <span data-testid="mlt-artist-name" className="block font-v2-display text-sm tracking-[0.14em] uppercase text-v2-cream truncate">
                        {artist.name || artist.handle}
                      </span>
                      <span className="block font-v2-ui text-xs text-v2-muted truncate">@{artist.handle}</span>
                    </span>
                    <span className="shrink-0 font-v2-ui text-xs text-v2-muted">{Math.round(similarity * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="mlt-photos">
          <h3 id="mlt-photos" className={LABEL}>Similar photos</h3>
          {photoMatches.length === 0 ? (
            <p className="font-v2-ui text-sm text-v2-muted">No other indexed photos to compare with yet.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {photoMatches.map(({ item: match }, n) => (
                <li key={refIdentity(match.image)}>
                  <button
                    type="button"
                    aria-label={`Open similar photo ${n + 1} of ${photoMatches.length}, ${match.savedId ? 'saved photo with no artist' : `by ${match.artistName}`}`}
                    onClick={() => onOpenItem(match)}
                    className="block w-full text-left outline-hidden focus-visible:ring-2 focus-visible:ring-v2-accent"
                  >
                    <span className="block aspect-square overflow-hidden bg-v2-surface">
                      <ArtistImage
                        src={match.image}
                        label={match.artistName}
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="w-full h-full object-cover"
                      />
                    </span>
                    <span className="block mt-1 font-v2-display text-v2-cream text-[0.7rem] uppercase tracking-[0.16em] leading-tight truncate">
                      {match.artistName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {coverage.embedded < coverage.total && (
          <button type="button" onClick={build} className={`${BUTTON} mt-6`}>
            Update style index ({coverage.total - coverage.embedded} new photos)
          </button>
        )}
      </>
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="More like this"
      tabIndex={-1}
      className="fixed inset-0 z-[70] bg-v2-ink flex flex-col focus:outline-hidden animate-slide-up"
    >
      <div className="flex items-center justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] border-b border-v2-hairline">
        <h2 className="font-v2-display text-lg tracking-[0.2em] uppercase text-v2-cream">More like this</h2>
        <button type="button" onClick={onClose} aria-label="Close more like this" className={`${BUTTON} tracking-widest uppercase text-xs`}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pt-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  )
}
