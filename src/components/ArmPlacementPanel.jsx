import {
  lazy, Suspense, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import {
  clampPlacement, wrapShare, formatCm, arcLabel, DEFAULT_PLACEMENT, MIN_WIDTH_CM,
} from '../data/placement3d'

// A design on the 3D upper arm at true size, with its controls (#195): drag to
// turn, pinch to resize, sliders for width, height above the elbow and how far
// round, and a step back to the whole arm. Shared by the lab page and the
// drawer a concept result opens. The 3D view is a lazy chunk, so three.js
// loads only when one of them is on screen.
const ArmPlacement3D = lazy(() => import('./ArmPlacement3D'))

const base = import.meta.env?.BASE_URL || '/'
const MODEL_URL = `${base}models/arm-upper.glb`
const META_URL = `${base}models/arm-upper.json`

// The label names the control and nothing else; the value is read out through
// aria-valuetext ("12.0 cm", "outer arm"), not folded into the name.
function Slider({ label, value, min, max, step, onChange, format }) {
  const id = useId()
  return (
    <div className="font-v2-ui text-sm text-v2-muted">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="font-mono text-v2-cream">{format(value)}</output>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full accent-v2-accent"
      />
    </div>
  )
}

// `imageSrc` must be readable by a canvas (same-origin, blob: or data:).
// `ref.current.snapshot()` gives { bytes, placement }: the view as PNG bytes,
// framed on the design, and where the design was; null until both the arm and
// the design are drawn. `onReadyChange` says when that becomes true or false.
export default function ArmPlacementPanel({
  imageSrc, initialAspect = 1, spin = false, onReadyChange,
  className = '', stageClassName = '', children, ref,
}) {
  const viewRef = useRef(null)
  const [arm, setArm] = useState(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  // The design's shape (height / width), and which image it was measured from.
  const [aspect, setAspect] = useState(initialAspect)
  const [drawnSrc, setDrawnSrc] = useState(null)
  const [wanted, setWanted] = useState(DEFAULT_PLACEMENT)
  const [view, setView] = useState('design')

  useEffect(() => {
    let cancelled = false
    fetch(META_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then((meta) => { if (!cancelled) setArm({ skinCm: meta.skin_cm, perimeterCm: meta.perimeter_cm }) })
      .catch(() => { if (!cancelled) setError('The arm model could not be loaded.') })
    return () => { cancelled = true }
  }, [])

  const placement = useMemo(
    () => (arm ? clampPlacement(wanted, { ...arm, aspect }) : null),
    [arm, wanted, aspect],
  )
  const onResize = useCallback((widthCm) => setWanted((p) => ({ ...p, widthCm })), [])
  const onDesignSize = useCallback(({ width, height }) => {
    setAspect(height / width)
    setDrawnSrc(imageSrc)
  }, [imageSrc])
  const onReady = useCallback(() => setReady(true), [])
  const onError = useCallback((e) => setError(e.message), [])

  const canSnapshot = Boolean(placement) && ready && drawnSrc === imageSrc && !error
  useEffect(() => { onReadyChange?.(canSnapshot) }, [canSnapshot, onReadyChange])
  useImperativeHandle(ref, () => ({
    snapshot() {
      if (!canSnapshot) return null
      const bytes = viewRef.current?.snapshot() ?? null
      return bytes ? { bytes, placement } : null
    },
  }), [canSnapshot, placement])

  return (
    <div className={className}>
      <div className={`relative overflow-hidden rounded-xs border border-v2-hairline ${stageClassName}`}>
        {placement && !error && (
          <Suspense fallback={null}>
            <ArmPlacement3D
              ref={viewRef}
              modelUrl={MODEL_URL}
              imageSrc={imageSrc}
              placement={placement}
              perimeterCm={arm.perimeterCm}
              view={view}
              onResize={onResize}
              onDesignSize={onDesignSize}
              onReady={onReady}
              onError={onError}
              spin={spin}
            />
          </Suspense>
        )}
        {ready && !error && (
          <button
            type="button" aria-pressed={view === 'arm'}
            onClick={() => setView((v) => (v === 'arm' ? 'design' : 'arm'))}
            className="absolute bottom-2 right-2 min-h-11 rounded-xs border border-v2-hairline bg-v2-ink/80 px-3 font-v2-ui text-sm text-v2-cream backdrop-blur-xs"
          >
            {view === 'arm' ? 'Close up' : 'Whole arm'}
          </button>
        )}
        {!ready && !error && (
          <p className="absolute inset-0 grid place-items-center font-v2-ui text-sm text-v2-muted" aria-busy="true">
            Loading the arm…
          </p>
        )}
        {error && (
          <p role="alert" className="absolute inset-0 grid place-items-center px-6 text-center font-v2-ui text-sm text-v2-muted">
            {error}
          </p>
        )}
      </div>

      {placement && (
        <>
          <p className="mt-3 font-v2-display text-xl text-v2-cream" aria-live="polite" data-testid="placement-size">
            {formatCm(placement.widthCm)} wide × {formatCm(placement.heightCm)} tall
            <span className="ml-2 font-v2-ui text-sm text-v2-muted">
              {Math.round(wrapShare(placement, arm.perimeterCm) * 100)}% round the arm
            </span>
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Slider
              label="Width" value={placement.widthCm} min={MIN_WIDTH_CM} max={28} step={0.5}
              format={formatCm} onChange={(widthCm) => setWanted((p) => ({ ...p, widthCm }))}
            />
            <Slider
              label="Above the elbow" value={placement.centreCm} min={arm.skinCm[0]} max={arm.skinCm[1]} step={0.5}
              format={formatCm} onChange={(centreCm) => setWanted((p) => ({ ...p, centreCm }))}
            />
            <Slider
              label="Round the arm" value={placement.arcCm} min={-15} max={15} step={0.5}
              format={arcLabel} onChange={(arcCm) => setWanted((p) => ({ ...p, arcCm }))}
            />
          </div>
          {children}
        </>
      )}
    </div>
  )
}
