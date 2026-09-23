import { useEffect, useRef, useState } from 'react'
import { buildReliefMesh } from '../data/reliefStl'
import { createReliefPreview } from '../lib/reliefPreview'

const REBUILD_DELAY_MS = 200

// Rotatable 3D view of the relief, built from the exact mesh the download
// uses. three.js loads on demand; without WebGL it says so rather than failing.
export default function ReliefPreview({ heightmap, settings }) {
  const mountRef = useRef(null)
  const engineRef = useRef(null)
  const [engineReady, setEngineReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let engine = null
    import('three')
      .then((mod) => {
        const THREE = mod?.default && mod.default.WebGLRenderer ? mod.default : mod
        if (cancelled || !mountRef.current) return
        engine = createReliefPreview(THREE, mountRef.current)
        if (!engine) {
          setFailed(true)
          return
        }
        engineRef.current = engine
        setEngineReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      engine?.dispose()
      engineRef.current = null
    }
  }, [])

  // Debounced so dragging the threshold slider doesn't rebuild on every step.
  useEffect(() => {
    // No settings = the form is currently invalid; keep showing the last good model.
    if (!engineReady || !heightmap || !settings) return undefined
    const timer = setTimeout(() => {
      try {
        engineRef.current?.setMesh(buildReliefMesh(heightmap, settings))
      } catch {
        setFailed(true)
      }
    }, REBUILD_DELAY_MS)
    return () => clearTimeout(timer)
  }, [engineReady, heightmap, settings])

  return (
    <div
      role="img"
      aria-label="3D preview of the relief"
      className="relative aspect-[4/3] w-full overflow-hidden rounded-xs border border-ink-border bg-ink-muted"
    >
      <div ref={mountRef} className="absolute inset-0" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-cream-muted">
          3D preview isn’t available on this device. The download still works.
        </p>
      )}
      {!failed && (
        <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center font-mono text-[0.625rem] uppercase tracking-widest text-cream-muted">
          Drag to rotate
        </p>
      )}
    </div>
  )
}
