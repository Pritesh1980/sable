import { useState } from 'react'

// A single artist/reference image that degrades gracefully: if the file is
// missing (e.g. the public repo ships without the curated seed images) the
// <img> is replaced by the same monogram empty-state used elsewhere in the UI,
// so a 404 looks intentional rather than broken.
export default function ArtistImage({
  src,
  label = '',
  className = '',
  fallbackClassName = '',
  monogramClassName = 'text-4xl',
  ...imgProps
}) {
  const [failed, setFailed] = useState(false)
  const trimmed = label.startsWith('@') ? label.slice(1) : label
  const initial = (trimmed.trim()[0] || '?').toUpperCase()
  // Accept both image shapes: plain string, or { url, addedAt } refs.
  const resolved = typeof src === 'string' ? src : src?.url || ''

  if (!resolved || failed) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-ink-muted ${className} ${fallbackClassName}`}
        aria-label={label || 'No image'}
      >
        <span className={`text-cream-muted/10 font-display ${monogramClassName}`} aria-hidden="true">
          {initial}
        </span>
      </div>
    )
  }

  return (
    <img
      src={resolved}
      alt={label}
      className={className}
      onError={() => setFailed(true)}
      {...imgProps}
    />
  )
}
