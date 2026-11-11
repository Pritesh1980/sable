import {
  lazy, Suspense, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import {
  clampPlacement, wrapShare, formatCm, arcLabel, wholeLimbFrame, LIMBS, DEFAULT_LIMB, MIN_WIDTH_CM,
} from '../data/placement3d'

// A design on a 3D arm at true size, with its controls (#195): drag to turn,
// pinch to resize, sliders for width, height up the limb and how far round,
// a step back to the whole limb, and a switch between the upper arm and the
// forearm (#206). Shared by the lab page and the drawers that concept results
// and Brief ideas open. The 3D view is a lazy chunk, so three.js loads only
// when one of them is on screen.
const ArmPlacement3D = lazy(() => import('./ArmPlacement3D'))

const base = import.meta.env?.BASE_URL || '/'
const modelUrl = (limb) => `${base}models/${limb.file}.glb`
const metaUrl = (limb) => `${base}models/${limb.file}.json`

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

function LimbSwitch({ value, onChange }) {
  return (
    <div role="group" aria-label="Limb"
      className="absolute left-2 top-2 z-10 flex overflow-hidden rounded-xs border border-v2-hairline bg-v2-ink/80 backdrop-blur-xs">
      {Object.values(LIMBS).map((limb) => (
        <button
          key={limb.id} type="button" aria-pressed={value === limb.id}
          onClick={() => onChange(limb.id)}
          className={`min-h-11 px-3 font-v2-ui text-sm ${value === limb.id ? 'bg-v2-cream text-v2-ink' : 'text-v2-cream'}`}
        >
          {limb.label}
        </button>
      ))}
    </div>
  )
}

// `imageSrc` must be readable by a canvas (same-origin, blob: or data:).
// `limb` is the one it opens on ('upper-arm' or 'forearm'; anything else is
// the upper arm). `ref.current.snapshot()` gives { bytes, placement, limb }:
// the view as PNG bytes, framed on the design, where the design was and on
// which limb; null until both the arm and the design are drawn.
// `onReadyChange` says when that becomes true or false.
export default function ArmPlacementPanel({
  limb: initialLimb = DEFAULT_LIMB, className = '', ref, ...props
}) {
  const [limbId, setLimbId] = useState(LIMBS[initialLimb] ? initialLimb : DEFAULT_LIMB)
  // Keyed: another limb is another model, its own measurements and its own
  // starting placement, so everything in it starts afresh. The switch sits
  // outside it, over the top of the stage, so it keeps keyboard focus.
  return (
    <div className={`relative ${className}`}>
      <LimbSwitch value={limbId} onChange={setLimbId} />
      <LimbPlacement key={limbId} ref={ref} limb={LIMBS[limbId]} {...props} />
    </div>
  )
}

// The stage, readout and sliders, as children of the panel's own box.
function LimbPlacement({
  limb, imageSrc, initialAspect = 1, spin = false, onReadyChange,
  stageClassName = '', children, ref,
}) {
  const viewRef = useRef(null)
  const [arm, setArm] = useState(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  // The design's shape (height / width), and which image it was measured from.
  const [aspect, setAspect] = useState(initialAspect)
  const [drawnSrc, setDrawnSrc] = useState(null)
  const [wanted, setWanted] = useState(limb.placement)
  const [view, setView] = useState('design')

  useEffect(() => {
    let cancelled = false
    fetch(metaUrl(limb))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then((meta) => {
        if (cancelled) return
        setArm({ skinCm: meta.skin_cm, perimeterCm: meta.perimeter_cm, whole: wholeLimbFrame(meta.extent_cm) })
      })
      .catch(() => { if (!cancelled) setError('The arm model could not be loaded.') })
    return () => { cancelled = true }
  }, [limb])

  const placement = useMemo(
    () => (arm ? clampPlacement(wanted, { skinCm: arm.skinCm, perimeterCm: arm.perimeterCm, aspect }) : null),
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
      return bytes ? { bytes, placement, limb: limb.id } : null
    },
  }), [canSnapshot, placement, limb])

  return (
    <>
      <div className={`relative overflow-hidden rounded-xs border border-v2-hairline ${stageClassName}`}>
        {placement && !error && (
          <Suspense fallback={null}>
            <ArmPlacement3D
              ref={viewRef}
              modelUrl={modelUrl(limb)}
              imageSrc={imageSrc}
              placement={placement}
              perimeterCm={arm.perimeterCm}
              whole={arm.whole}
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
              label={limb.along} value={placement.centreCm} min={arm.skinCm[0]} max={arm.skinCm[1]} step={0.5}
              format={formatCm} onChange={(centreCm) => setWanted((p) => ({ ...p, centreCm }))}
            />
            <Slider
              label="Round the arm" value={placement.arcCm} min={-15} max={15} step={0.5}
              format={(arc) => arcLabel(arc, limb)} onChange={(arcCm) => setWanted((p) => ({ ...p, arcCm }))}
            />
          </div>
          {children}
        </>
      )}
    </>
  )
}
