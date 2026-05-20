import { useState, useRef, useEffect, useCallback } from 'react'

export default function ArtistBrowse({ artists, startIndex = 0, onClose }) {
  const withImages = artists.filter((a) => a.images?.length > 0)

  const [artistIdx, setArtistIdx] = useState(Math.min(startIndex, withImages.length - 1))
  const [imageIdx, setImageIdx] = useState(0)

  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  const artist = withImages[artistIdx]
  const images = artist?.images || []

  const handlePrevImage = useCallback(() => {
    if (imageIdx > 0) {
      setImageIdx((i) => i - 1)
    } else if (artistIdx > 0) {
      setArtistIdx((i) => i - 1)
      setImageIdx(Math.max(0, (withImages[artistIdx - 1]?.images?.length || 1) - 1))
    }
  }, [artistIdx, imageIdx, withImages])

  const handleNextImage = useCallback(() => {
    if (imageIdx < images.length - 1) {
      setImageIdx((i) => i + 1)
    } else if (artistIdx < withImages.length - 1) {
      setArtistIdx((i) => i + 1)
      setImageIdx(0)
    }
  }, [artistIdx, imageIdx, images.length, withImages.length])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') handlePrevImage()
      if (e.key === 'ArrowRight') handleNextImage()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNextImage, handlePrevImage, onClose])

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) handleNextImage()
      else handlePrevImage()
    }
    touchStartX.current = null
  }

  function onTapImage(e) {
    const half = window.innerWidth / 2
    if (e.clientX > half) handleNextImage()
    else handlePrevImage()
  }

  if (!artist) return null

  const displayName = artist.name || `@${artist.handle}`
  const isFirst = artistIdx === 0 && imageIdx === 0
  const isLast = artistIdx === withImages.length - 1 && imageIdx === images.length - 1

  return (
    <div className="fixed inset-0 z-50 bg-ink-black flex flex-col animate-fade-in">

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-5 pt-14 pb-4 bg-gradient-to-b from-ink-black/80 to-transparent pointer-events-none">
        <button
          onClick={onClose}
          className="pointer-events-auto text-cream-muted hover:text-cream transition-colors text-sm font-body tracking-widest uppercase"
        >
          ← Back
        </button>
        <span className="font-mono text-[12px] text-cream-muted/60 tracking-widest">
          {artistIdx + 1} / {withImages.length}
        </span>
      </div>

      {/* Image */}
      <div
        className="flex-1 relative overflow-hidden cursor-pointer"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onTapImage}
      >
        <img
          key={`${artistIdx}-${imageIdx}`}
          src={images[imageIdx]}
          alt={displayName}
          className="w-full h-full object-contain animate-fade-in"
        />

        {/* Image progress dots */}
        {images.length > 1 && (
          <div className="absolute top-24 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
            {images.map((_, i) => (
              <span
                key={i}
                className={`block rounded-full transition-all duration-300 ${
                  i === imageIdx ? 'w-4 h-1 bg-cream' : 'w-1 h-1 bg-cream/25'
                }`}
              />
            ))}
          </div>
        )}

        {/* Tap zone hints */}
        {!isFirst && (
          <div className="absolute left-0 inset-y-0 w-16 flex items-center justify-start pl-4 pointer-events-none">
            <span className="text-cream/15 text-3xl">‹</span>
          </div>
        )}
        {!isLast && (
          <div className="absolute right-0 inset-y-0 w-16 flex items-center justify-end pr-4 pointer-events-none">
            <span className="text-cream/15 text-3xl">›</span>
          </div>
        )}
      </div>

      {/* Bottom: artist info + artist nav */}
      <div className="shrink-0 px-5 pt-4 pb-10 border-t border-ink-border bg-gradient-to-t from-ink-black to-transparent">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl text-cream leading-tight">{displayName}</h2>
            {artist.name && (
              <p className="font-mono text-[13px] text-cream-muted/60 mt-0.5">@{artist.handle}</p>
            )}
            <p className="font-mono text-[12px] text-cream-muted/40 mt-1 tracking-widest">
              {imageIdx + 1} / {images.length}
            </p>
          </div>
          <div className="flex gap-5">
            <button
              onClick={() => {
                if (artistIdx > 0) {
                  setArtistIdx((i) => i - 1)
                  setImageIdx(0)
                }
              }}
              disabled={artistIdx === 0}
              className="font-mono text-[13px] text-cream-muted/70 hover:text-cream disabled:opacity-20 transition-colors tracking-widest uppercase"
            >
              ← Artist
            </button>
            <button
              onClick={() => {
                if (artistIdx < withImages.length - 1) {
                  setArtistIdx((i) => i + 1)
                  setImageIdx(0)
                }
              }}
              disabled={artistIdx === withImages.length - 1}
              className="font-mono text-[13px] text-cream-muted/70 hover:text-cream disabled:opacity-20 transition-colors tracking-widest uppercase"
            >
              Artist →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
