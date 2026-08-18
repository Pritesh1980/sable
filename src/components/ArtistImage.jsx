import { useState, useRef } from 'react'
import { imageSrc } from '../data/wall'
import { refreshedBlobUrl } from '../data/blobUrls'

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
  // Accept both image shapes (plain string, or { url, addedAt } refs) and
  // apply the deploy base — callers pass raw refs straight from artist data.
  const resolved = imageSrc(src)
  const trimmed = label.startsWith('@') ? label.slice(1) : label
  const initial = (trimmed.trim()[0] || '?').toUpperCase()

  // Retry/failure state is tagged with the resolved src it applies to,
  // rather than reset imperatively when the src prop changes: a component
  // instance reused for a different image (e.g. a table row) then naturally
  // stops applying a previous image's retry or failure the moment `resolved`
  // moves on — no effect, no ref read/write during render.
  const [retried, setRetried] = useState(null) // { forSrc, freshSrc }
  const [failedFor, setFailedFor] = useState(null)
  // Only ever touched inside handleError (an event handler, not render) —
  // guards a retried url that itself fails from retrying again.
  const retryAttemptedForRef = useRef(null)

  const displaySrc = retried?.forSrc === resolved && retried.freshSrc ? retried.freshSrc : resolved
  const failed = failedFor === resolved

  // A resolved blob URL already baked into state can go stale once its
  // backend's TTL passes with nothing re-deriving it (#82) — try exactly
  // once to recover a fresh URL for the same key before giving up to the
  // monogram fallback, which is for genuinely missing images, not expired
  // ones. refreshedBlobUrl itself returns null for anything that isn't a
  // stale blob URL (a static path, or one the cache still considers fresh),
  // so this is a no-op fallthrough for every non-blob image.
  async function handleError() {
    if (retryAttemptedForRef.current !== resolved) {
      retryAttemptedForRef.current = resolved
      const fresh = await refreshedBlobUrl(displaySrc)
      if (fresh) {
        setRetried({ forSrc: resolved, freshSrc: fresh })
        return
      }
    }
    setFailedFor(resolved)
  }

  if (!displaySrc || failed) {
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
      src={displaySrc}
      alt={label}
      className={className}
      onError={handleError}
      {...imgProps}
    />
  )
}
