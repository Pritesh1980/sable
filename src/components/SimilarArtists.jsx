import { useEffect, useState } from 'react'
import ArtistImage from './ArtistImage'
import { similarArtists, indexCoverage } from '../data/embeddings'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'

// "Similar ink" — the first Taste Engine surface (issue #19). Ranks the rest
// of the collection by visual proximity to this artist using on-device style
// embeddings. The index is built on demand (explicit button: it downloads the
// model once and takes a minute over a full library) and lives in this
// device's IndexedDB only.
export default function SimilarArtists({ artists, artist, onSelectArtist }) {
  const [vectors, setVectors] = useState(null) // null = loading
  const [progress, setProgress] = useState(null) // {done,total} while building
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    loadVectors(artists)
      .then((v) => alive && setVectors(v))
      .catch(() => alive && setVectors(new Map()))
    return () => {
      alive = false
    }
  }, [artists])

  const build = async () => {
    setError('')
    setProgress({ done: 0, total: 0 })
    try {
      await buildStyleIndex(artists, { onProgress: setProgress })
      setVectors(await loadVectors(artists))
    } catch (e) {
      console.error('[tattoo] style index build failed:', e)
      setError('Index build failed — check your connection and try again.')
    }
    setProgress(null)
  }

  if (vectors === null) return null

  const getVec = (src) => vectors.get(src) || null
  const coverage = indexCoverage(artists, getVec)
  const matches = similarArtists(artists, artist.id, getVec)

  return (
    <div className="mb-8">
      <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">
        Similar ink
        {coverage.embedded > 0 && (
          <span className="text-cream-muted/50 ml-2 normal-case tracking-normal">
            {coverage.embedded}/{coverage.total} images indexed
          </span>
        )}
      </p>

      {progress ? (
        <p className="font-mono text-sm text-cream-muted" role="status">
          Indexing… {progress.done}/{progress.total}
          <span className="text-cream-muted/50 ml-2">(first run downloads the model)</span>
        </p>
      ) : coverage.embedded === 0 ? (
        <div>
          <button
            type="button"
            onClick={build}
            className="font-mono text-sm text-accent border border-accent/40 px-4 py-2 hover:bg-accent/10 transition-colors"
          >
            Build style index
          </button>
          <p className="font-body text-xs text-cream-muted/60 mt-2 leading-relaxed">
            Runs entirely on this device — a one-off model download, then your images
            are compared locally and never leave the browser.
          </p>
          {error && <p className="font-mono text-xs text-accent mt-2">{error}</p>}
        </div>
      ) : matches.length === 0 ? (
        <p className="font-body text-sm text-cream-muted/60">
          No indexed images for this artist yet — update the index to place them in your style space.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {matches.map(({ artist: match, similarity }) => (
            <button
              key={match.id}
              type="button"
              onClick={() => onSelectArtist?.(match)}
              disabled={!onSelectArtist}
              className="text-left group"
            >
              <div className="aspect-square overflow-hidden bg-ink-muted">
                <ArtistImage
                  src={match.images?.[0]}
                  label={match.handle || match.name}
                  className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                />
              </div>
              <p data-testid="similar-artist-name" className="font-body text-sm text-cream mt-2 truncate">
                {match.name || `@${match.handle}`}
              </p>
              <p className="font-mono text-xs text-cream-muted/60">
                {Math.round(similarity * 100)}% style match
              </p>
            </button>
          ))}
        </div>
      )}

      {!progress && coverage.embedded > 0 && coverage.embedded < coverage.total && (
        <button
          type="button"
          onClick={build}
          className="font-mono text-xs text-cream-muted/60 underline underline-offset-4 mt-3 hover:text-cream-muted"
        >
          Update index ({coverage.total - coverage.embedded} new images)
        </button>
      )}
    </div>
  )
}
