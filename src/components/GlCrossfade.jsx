import { useEffect, useRef, useState } from 'react'
import ArtistImage from './ArtistImage'
import { createGlEngine } from '../lib/glCrossfade'
import useImageBytes from '../hooks/useImageBytes'

// A WebGL image stage that crossfades between images. The subtle depth ripple
// plays only when `rippleKey` (e.g. the artist id) differs from the one of the
// image last shown; otherwise, and always when no key is given, it is a plain
// fade. three.js is loaded on demand (dynamic import) so it never enters the
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
  rippleKey,
}) {
  const mountRef = useRef(null)
  const engineRef = useRef(null)
  // `src` is a stored image ref. WebGL reads the texture's pixels, which a
  // cross-origin url (a signed url) does not allow, so the engine is only ever
  // handed a same-origin source — a blob: copy where needed (#114).
  const { src: glSrc, status } = useImageBytes(src)
  const srcRef = useRef(glSrc)
  const shownRef = useRef(false) // whether the engine has been given a first image
  // The ripple key of the newest `src`, and of the image actually on screen.
  // glSrc resolves later than src, so the decision is made at transition time
  // against these two, not against whatever the prop is by then.
  const keyRef = useRef(rippleKey)
  const shownKeyRef = useRef(rippleKey)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    srcRef.current = glSrc
  }, [glSrc])

  // Declared before the transition effect so a same-commit change sees it.
  useEffect(() => {
    keyRef.current = rippleKey
  }, [src, rippleKey])

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
        // Still loading when the engine came up: the effect below shows it.
        if (srcRef.current) {
          engine.setImage(srcRef.current)
          shownRef.current = true
          shownKeyRef.current = keyRef.current
        }
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

  // Animate to the new image whenever it changes after the engine is live. On
  // first mount engineRef is still null (init is async), so the initial image
  // is shown by engine.setImage above with the latest source. An image that
  // only arrives once resolved is still the first one: shown outright, not
  // faded in from nothing.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !glSrc) return
    const key = keyRef.current
    if (shownRef.current) {
      // null marks a photo with no artist (#220 K): never a ripple into or out of one.
      const ripple = key !== undefined && key !== null && shownKeyRef.current !== null && key !== shownKeyRef.current
      engine.transitionTo(glSrc, { ripple })
    } else {
      engine.setImage(glSrc)
      shownRef.current = true
    }
    shownKeyRef.current = key
  }, [glSrc])

  // The plain image still shows a photo whose bytes cannot be read for WebGL.
  if (!src || failed || status === 'unavailable') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <ArtistImage
          loading="eager"
          sizes="100vw"
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
