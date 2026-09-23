import { useEffect, useMemo, useState } from 'react'
import ArtistImage from './ArtistImage'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'
import { layoutTasteMap } from '../data/tasteMap'
import { getImageUrl } from '../data/planning'

// One colour per style tag, readable on the dark ground.
const STYLE_COLOURS = {
  'dark-illustrative': '#c2493d',
  'fine-line': '#e6dac4',
  blackwork: '#8f8f8f',
  surrealism: '#9a86cf',
  'dark-fantasy': '#4f9a9b',
  realism: '#c9a14a',
  other: '#6b6b6b',
}

function mapSize() {
  const w = (typeof window !== 'undefined' && window.innerWidth) || 360
  const h = (typeof window !== 'undefined' && window.innerHeight) || 640
  return { width: Math.max(280, w - 32), height: Math.max(320, h - 230) }
}

const artistLabel = (artist) => artist.name || `@${artist.handle}`

// The Taste Engine made visible: every artist placed by what their work
// looks like (on-device image embeddings, PCA to 2D), so similar ink
// clusters together, with a marker for the taste learned from your ranking
// and statuses. Tap an artist to open them.
export default function TasteMap({ artists, onOpenArtist, onClose }) {
  const [vectors, setVectors] = useState(null) // null = loading
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [size, setSize] = useState(mapSize)

  useEffect(() => {
    let alive = true
    loadVectors(artists)
      .then((v) => alive && setVectors(v))
      .catch(() => alive && setVectors(new Map()))
    return () => { alive = false }
  }, [artists])

  useEffect(() => {
    const onResize = () => setSize(mapSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const nodeSize = size.width < 640 ? 44 : 56
  const map = useMemo(
    () => (vectors ? layoutTasteMap(artists, (src) => vectors.get(src) || null, { ...size, nodeSize }) : null),
    [artists, vectors, size, nodeSize],
  )
  const styles = map ? [...new Set(map.nodes.map((n) => n.style))] : []
  const unplaced = map ? artists.length - map.nodes.length : 0

  async function build() {
    setError('')
    setProgress({ done: 0, total: 0 })
    try {
      await buildStyleIndex(artists, { onProgress: setProgress })
      setVectors(await loadVectors(artists))
    } catch {
      setError('Index build failed — check your connection and try again.')
    }
    setProgress(null)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Taste map" className="fixed inset-0 z-[60] overflow-y-auto bg-ink-black">
      <header className="flex items-start justify-between gap-4 px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-accent">Taste engine</p>
          <h2 className="font-display text-3xl text-cream">Taste map</h2>
          <p className="mt-1 max-w-md text-xs text-cream-muted">
            Artists whose work looks alike sit closer together. ✦ marks your taste, learned from your
            ranking and statuses.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close taste map"
          className="rounded-xs border border-ink-border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted hover:text-cream"
        >
          × Close
        </button>
      </header>

      {map === null && <p className="px-4 font-mono text-sm text-cream-muted">Loading…</p>}

      {map && map.nodes.length === 0 && (
        <div className="px-4">
          {progress ? (
            <p role="status" className="font-mono text-sm text-cream-muted">
              Indexing… {progress.done}/{progress.total} (first run downloads the model)
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={build}
                className="border border-accent/40 px-4 py-2 font-mono text-sm text-accent hover:bg-accent/10"
              >
                Build style index
              </button>
              <p className="mt-2 max-w-md text-xs text-cream-muted">
                Runs entirely on this device — a one-off model download, then your artists’ images are
                analysed locally. Nothing is uploaded.
              </p>
            </>
          )}
          {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        </div>
      )}

      {map && map.nodes.length > 0 && (
        <>
          <div className="relative mx-4" style={{ width: size.width, height: size.height }}>
            {map.nodes.map(({ artist, x, y, style }) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => onOpenArtist(artist)}
                aria-label={`${artistLabel(artist)} — ${style}`}
                title={`${artistLabel(artist)} · ${style}`}
                className="group absolute flex flex-col items-center hover:z-10 focus-visible:z-10"
                // Centre the thumbnail (not the whole button) on the point; the name hangs below.
                style={{ left: x, top: y, transform: `translate(-50%, -${nodeSize / 2}px)` }}
              >
                <span
                  className="block overflow-hidden rounded-full border-2 bg-ink-card transition-transform group-hover:scale-125 group-focus-visible:scale-125"
                  style={{ width: nodeSize, height: nodeSize, borderColor: STYLE_COLOURS[style] || STYLE_COLOURS.other }}
                >
                  <ArtistImage
                    src={getImageUrl(artist.images?.[0])}
                    label={artistLabel(artist)}
                    className="h-full w-full object-cover"
                    monogramClassName="text-xs"
                  />
                </span>
                <span className="mt-1 max-w-[5.5rem] truncate font-mono text-[0.5625rem] tracking-wide text-cream-muted group-hover:text-cream">
                  {artistLabel(artist)}
                </span>
              </button>
            ))}
            {/* Drawn last, on top; taps pass through to any thumbnail beneath. */}
            {map.taste && (
              <div
                role="img"
                aria-label="Your taste"
                className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: map.taste.x, top: map.taste.y }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent bg-accent/15 text-lg text-accent shadow-[0_0_24px_rgba(192,57,43,0.45)]">
                  ✦
                </span>
                <span className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-widest text-accent">You</span>
              </div>
            )}
          </div>

          <div className="px-4 py-4">
            <ul aria-label="Styles on this map" className="flex flex-wrap gap-x-4 gap-y-2">
              {styles.map((style) => (
                <li key={style} className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STYLE_COLOURS[style] || STYLE_COLOURS.other }} />
                  {style}
                </li>
              ))}
            </ul>
            {unplaced > 0 && (
              <p className="mt-2 text-xs text-cream-muted">
                {unplaced} artist{unplaced === 1 ? '' : 's'} not shown — no indexed images yet.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
