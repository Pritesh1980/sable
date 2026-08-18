import { useState, useRef, useEffect } from 'react'
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

  // Two races a single boolean/ref can't tell apart on its own (cross-model
  // review): (1) this image's own retry is still in flight when a second
  // onError fires for the same still-broken src (React can re-render and
  // reattach the same failing src before the first retry resolves) — that
  // must wait for the first attempt, not jump straight to the monogram; (2)
  // a *slow* retry for a previous image (src changed mid-flight, e.g. a
  // reused table-row instance) resolves after a newer image has already
  // rendered correctly — that stale result must be discarded, not clobber
  // the current one. retryStateRef tracks (1) — forSrc + pending/done — and
  // is only ever touched inside handleError, an event handler, never during
  // render. latestResolvedRef tracks (2): a plain ref kept in sync with the
  // current prop via an effect (writing, never reading, during render — the
  // standard, sanctioned way to hand an async callback the latest props),
  // so a stale completion can tell it's stale and bail out.
  const retryStateRef = useRef({ forSrc: null, status: 'idle' })
  const latestResolvedRef = useRef(resolved)
  useEffect(() => {
    latestResolvedRef.current = resolved
  }, [resolved])

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
    const forSrc = resolved

    if (retryStateRef.current.forSrc !== forSrc) {
      retryStateRef.current = { forSrc, status: 'pending' }
      const fresh = await refreshedBlobUrl(displaySrc)
      // The image may have moved on to a different src while this was in
      // flight (a reused component instance) — a stale completion must not
      // apply to whatever's showing now.
      if (latestResolvedRef.current !== forSrc) return
      retryStateRef.current = { forSrc, status: 'done' }
      if (fresh) {
        setRetried({ forSrc, freshSrc: fresh })
        return
      }
      setFailedFor(forSrc)
      return
    }

    // A retry for this exact image is already in flight (or already
    // resolved to a still-broken retried src) — a second error for the same
    // src while one's pending just waits for it, rather than racing ahead
    // to the monogram before the first attempt even had a chance.
    if (retryStateRef.current.status === 'pending') return
    setFailedFor(forSrc)
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
