import { ScanLine, Star } from 'lucide-react'

const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 border border-v2-hairline rounded-xs px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-cream hover:border-v2-cream disabled:opacity-50'

export default function RefinementCompare({ original, variant, parentAvailable, onMarkBest, onRate, onTryOn }) {
  if (!variant?.imageUrl) return null
  const originalUrl = typeof original === 'string' ? original : original?.imageUrl
  return (
    <section aria-label="Refinement comparison" className="border-t border-v2-hairline py-5 font-v2-ui text-v2-cream">
      <h3 className="font-v2-display text-xl mb-4">Original and variation</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <figure className="min-w-0">
          <figcaption className="text-sm text-v2-muted mb-2">Original source</figcaption>
          {parentAvailable && originalUrl ? (
            <img src={originalUrl} alt="Original source" className="w-full aspect-[4/3] object-contain bg-v2-ink" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-v2-ink text-sm text-v2-muted px-4">Source image unavailable</div>
          )}
        </figure>
        <figure className="min-w-0">
          <figcaption className="text-sm text-v2-muted mb-2">Saved variation</figcaption>
          <img src={variant.imageUrl} alt={variant.title || 'Saved variation'} className="w-full aspect-[4/3] object-contain bg-v2-ink" />
        </figure>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" aria-label="Mark variation as Best" aria-pressed={Boolean(variant.isBest)}
          title="Mark variation as Best" onClick={() => onMarkBest?.(variant.id)} className={BUTTON}>
          <Star size={18} aria-hidden="true" fill={variant.isBest ? 'currentColor' : 'none'} />
          {variant.isBest ? 'Best' : 'Mark Best'}
        </button>
        <label className="flex items-center gap-2 text-sm">
          Rating
          <select aria-label="Variation rating" value={variant.rating ?? 0}
            onChange={event => onRate?.(variant.id, Number(event.target.value))}
            className="min-h-11 border border-v2-hairline rounded-xs bg-v2-ink px-3 focus-visible:outline-2 focus-visible:outline-v2-cream">
            {[0, 1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating === 0 ? 'Unrated' : `${rating}/5`}</option>)}
          </select>
        </label>
        <button type="button" aria-label="Try variation on skin" title="Try variation on skin"
          onClick={() => onTryOn?.({ variantId: variant.id, variantLabel: variant.title || 'Variation', imageUrl: variant.imageUrl })}
          className={BUTTON}><ScanLine size={18} aria-hidden="true" />Try on skin</button>
      </div>
    </section>
  )
}
