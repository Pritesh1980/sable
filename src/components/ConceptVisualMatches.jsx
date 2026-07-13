import { useEffect, useState } from 'react'
import { rankArtistsByVector, cosineSimilarity } from '../data/embeddings'
import { buildTasteVector } from '../data/taste'
import { loadVectors, vectorFor } from '../data/styleIndex'

// Taste Engine phase 2 (issue #19): rank the collection against the concept
// *image* — who could actually execute this piece, judged on their work, not
// their tags. Requires the style index built from any artist detail; the
// concept image itself is embedded once on first view (cached by concept id,
// since its display URL may be a session-scoped object URL).
export default function ConceptVisualMatches({ artists, concept }) {
  const [state, setState] = useState({ status: 'loading' })
  const src = concept?.imageUrl

  useEffect(() => {
    if (!src) return
    let alive = true
    ;(async () => {
      try {
        const vectors = await loadVectors(artists)
        if (vectors.size === 0) {
          if (alive) setState({ status: 'no-index' })
          return
        }
        const vec = await vectorFor(src, `concept:${concept.id}`)
        if (!alive) return
        if (!vec) {
          setState({ status: 'failed' })
          return
        }
        const getVec = (s) => vectors.get(s) || null
        const matches = rankArtistsByVector(artists, vec, getVec)
        const taste = buildTasteVector(artists, getVec)
        const tasteFit = taste ? cosineSimilarity(taste, vec) : null
        setState({ status: 'ready', matches, tasteFit })
      } catch {
        if (alive) setState({ status: 'failed' })
      }
    })()
    return () => {
      alive = false
    }
  }, [artists, concept?.id, src])

  if (!src) return null

  return (
    <div className="mb-6">
      <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-2">
        Visual matches
      </p>
      {state.status === 'loading' && (
        <p className="font-v2-ui text-sm text-v2-muted" role="status">Analysing image…</p>
      )}
      {state.status === 'no-index' && (
        <p className="font-v2-ui text-sm text-v2-muted leading-relaxed">
          Build the style index (Artists → any artist → Similar ink) to see who in your
          collection this image matches visually.
        </p>
      )}
      {state.status === 'failed' && (
        <p className="font-v2-ui text-sm text-v2-muted">Couldn't analyse this image.</p>
      )}
      {state.status === 'ready' && (
        <ul className="space-y-1">
          {state.matches.map(({ artist, similarity }) => (
            <li key={artist.id} className="flex items-baseline justify-between gap-3">
              <span data-testid="visual-match-name" className="font-v2-ui text-sm text-v2-cream">
                {artist.name || `@${artist.handle}`}
              </span>
              <span className="font-v2-ui text-xs text-v2-muted">
                {Math.round(similarity * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      {state.status === 'ready' && (
        <p className="font-v2-ui text-xs text-v2-muted/70 mt-2">
          Matched on the image itself, not tags.
          {state.tasteFit !== null && (
            <> Taste fit {Math.round(state.tasteFit * 100)}% — how strongly it matches your
            collection's overall taste.</>
          )}
        </p>
      )}
    </div>
  )
}
