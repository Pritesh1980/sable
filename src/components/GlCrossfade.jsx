import { useEffect, useRef, useState } from 'react'
import ArtistImage from './ArtistImage'
import { createGlEngine } from '../lib/glCrossfade'

// A WebGL image stage that crossfades between images with a subtle depth
// ripple. three.js is loaded on demand (dynamic import) so it never enters the
// main bundle. If three fails to load, the renderer can't be created, or the
// WebGL context is lost, it degrades to the same <img>/monogram used elsewhere
// — the artwork always shows, the flourish is optional.
export default function GlCrossfade({
  src,
  label = '',
  className = '',
  fallbackImageClassName = '',
  monogramClassName = 'text-4xl',
  durationMs = 600,
}) {
  const mountRef = useRef(null)
  const engineRef = useRef(null)
  const srcRef = useRef(src)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    srcRef.current = src
  }, [src])

  // Initialise the engine once. Dynamic import keeps three out of the initial
  // bundle; any failure flips to the CSS/img fallback.
  useEffect(() => {
    let cancelled = false
    let engine = null
    const mount = mountRef.current
    if (!mount) return undefined

    import('three')
      .then((mod) => {
        const THREE = mod?.default && mod.default.WebGLRenderer ? mod.default : mod
        if (cancelled || !mountRef.current) return
        engine = createGlEngine(THREE, mountRef.current, {
          durationMs,
          onContextLost: () => setFailed(true),
        })
        if (!engine) {
          setFailed(true)
          return
        }
        engineRef.current = engine
        engine.setImage(srcRef.current)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (engine) engine.dispose()
      engineRef.current = null
    }
    // Mount-once: durationMs is read at init; src is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animate to the new image whenever src changes after the engine is live. On
  // first mount engineRef is still null (init is async), so the initial image
  // is shown by engine.setImage above with the latest src.
  useEffect(() => {
    if (engineRef.current) engineRef.current.transitionTo(src)
  }, [src])

  if (!src || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <ArtistImage
          src={src}
          label={label}
          className={fallbackImageClassName}
          monogramClassName={monogramClassName}
        />
      </div>
    )
  }

  return <div ref={mountRef} className={className} aria-label={label} />
}
