import { useState, useRef, useLayoutEffect } from 'react'
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

  // Retry/failure state is scoped to whichever resolved src it was computed
  // for, via `trackedSrc`. Comparing *state* (not a ref) during render and
  // resetting when it's stale is React's own documented "adjusting state
  // during render" pattern — safe under concurrent rendering. It matters
  // here because the same component instance can genuinely revisit an
  // earlier src: "Set cover" reorders images[0], so a real user action can
  // cycle a card's own display url A -> B -> A (review, round 2) — without
  // this, a src that once failed (or has a retry still pending) would stay
  // stuck that way forever, even long after returning to it.
  const [trackedSrc, setTrackedSrc] = useState(resolved)
  const [retriedSrc, setRetriedSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  if (trackedSrc !== resolved) {
    setTrackedSrc(resolved)
    setRetriedSrc(null)
    setFailed(false)
  }
  const displaySrc = retriedSrc || resolved

  // Only ever touched inside handleError/handleLoad (event handlers) or this
  // layout effect — never read or written during render. retryStatusRef
  // guards against a duplicate onError for the same still-failing src (React
  // can reattach the same src before the first retry resolves) being
  // mistaken for "the retry itself also failed." latestResolvedRef lets a
  // slow completion tell whether the src it was for is still current before
  // ever touching state, so it can discard itself instead of clobbering a
  // newer, already-correct display. Synced via useLayoutEffect rather than
  // useEffect: a passive effect runs after paint, which can be *later* than
  // an already-pending promise's own microtask continuation, leaving a
  // narrow window where a stale completion could still pass the check
  // (review, round 2) — a layout effect commits synchronously, before the
  // JS engine yields to that microtask queue, closing it.
  const retryStatusRef = useRef('idle') // 'idle' | 'pending' | 'done'
  const latestResolvedRef = useRef(resolved)
  useLayoutEffect(() => {
    retryStatusRef.current = 'idle'
    latestResolvedRef.current = resolved
  }, [resolved])

  // A resolved blob URL already baked into state can go stale once its
  // backend's TTL passes with nothing re-deriving it (#82) — try exactly
  // once to recover a fresh URL for the same key before giving up to the
  // monogram fallback, which is for genuinely missing images, not expired
  // ones. refreshedBlobUrl itself returns null for anything that isn't a
  // stale blob URL (a static path, or one the cache still considers fresh),
  // so this is a no-op fallthrough for every non-blob image.
  async function handleError() {
    const forSrc = resolved
    if (retryStatusRef.current === 'idle') {
      retryStatusRef.current = 'pending'
      let fresh
      try {
        // resolveBlobKey (which this calls into) never itself rejects — a
        // failed refetch resolves to the last-known url instead — but a
        // defensive catch here costs nothing and means a future change to
        // that contract can't silently deadlock this component instead of
        // degrading to the monogram (review).
        fresh = await refreshedBlobUrl(displaySrc)
      } catch {
        fresh = null
      }
      // The image may have moved on to a different src while this was in
      // flight — a stale completion must not apply to whatever's showing
      // now (its own layout effect already reset retryStatusRef for the
      // src that's actually current, so there's nothing to undo here).
      if (latestResolvedRef.current !== forSrc) return
      retryStatusRef.current = 'done'
      if (fresh) {
        setRetriedSrc(fresh)
        return
      }
      setFailed(true)
      return
    }

    // A retry for this exact image is already in flight — a second error
    // for the same src while one's pending just waits for it, rather than
    // racing ahead to the monogram before the first attempt even had a
    // chance to succeed.
    if (retryStatusRef.current === 'pending') return
    setFailed(true)
  }

  // A successful load (first try, or after a retry) re-arms the one-shot
  // retry for this src: if it expires again later in a long session, it
  // gets another chance rather than jumping straight to the monogram just
  // because an earlier attempt for the same src already used its one try
  // (review, round 2).
  function handleLoad() {
    retryStatusRef.current = 'idle'
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
      onLoad={handleLoad}
      {...imgProps}
    />
  )
}
