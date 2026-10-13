import { useState, useRef, useLayoutEffect } from 'react'
import useImageSrc from '../hooks/useImageSrc'
import { refreshBlobKey } from '../data/blobUrls'
import { refKey } from '../data/imageRef'
import { demoResponsiveProps } from '../data/demoArtwork'

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
  fallback = null,
  sizes = '100vw',
  ...imgProps
}) {
  // The render boundary (#113): `src` is a stored image ref — a plain string,
  // a { url, addedAt } or { key } object — and is resolved here, so callers pass
  // raw refs straight from their data. A blob key not cached yet shows an
  // empty box until it resolves.
  const { src: resolved, status } = useImageSrc(src)
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
  const [responsiveFailed, setResponsiveFailed] = useState(false)
  if (trackedSrc !== resolved) {
    setTrackedSrc(resolved)
    setRetriedSrc(null)
    setFailed(false)
    setResponsiveFailed(false)
  }
  const displaySrc = retriedSrc || resolved
  const responsive = responsiveFailed ? {} : demoResponsiveProps(displaySrc)

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

  // A signed URL can expire while its image sits on screen (#82) — try
  // exactly once to recover a fresh URL for the same key before giving up to
  // the monogram fallback, which is for genuinely missing images, not expired
  // ones. The key comes from the ref the caller passed; refreshBlobKey returns
  // null without one (a static path, an external URL) or for a URL the cache
  // still considers fresh, so this is a no-op fallthrough for those.
  async function handleError() {
    // A missing thumbnail must not hide a still-available full-size image.
    if (responsive.srcSet) {
      setResponsiveFailed(true)
      return
    }
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
        fresh = await refreshBlobKey(refKey(src), displaySrc)
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
    // A caller's own empty state (e.g. Top5Hero's rank glyph) replaces the monogram.
    if (fallback) return fallback
    // Still resolving: a neutral empty box, so the letter doesn't flash and
    // then vanish when the photo arrives. An unavailable photo keeps the letter.
    const loading = status === 'loading' && !failed
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-ink-muted ${className} ${fallbackClassName}`}
        aria-label={label || 'No image'}
        aria-busy={loading ? 'true' : undefined}
      >
        {!loading && (
          <span className={`text-cream-muted/10 font-display ${monogramClassName}`} aria-hidden="true">
            {initial}
          </span>
        )}
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
      {...responsive}
      sizes={responsive.srcSet ? sizes : undefined}
      loading={responsive.srcSet ? 'lazy' : undefined}
      {...imgProps}
    />
  )
}
