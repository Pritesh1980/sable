import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { clampPlacement, wrapShare, DEFAULT_PLACEMENT, MIN_WIDTH_CM } from '../data/placement3d'

// Lab page for the 3D placement spike (#195): a design on a 3D upper arm at
// true size. Not linked from the nav. The 3D view is a second lazy chunk, so
// even this page's shell paints before three.js arrives.
const ArmPlacement3D = lazy(() => import('../components/ArmPlacement3D'))

const base = import.meta.env?.BASE_URL || '/'
const MODEL_URL = `${base}models/arm-upper.glb`
const META_URL = `${base}models/arm-upper.json`

// Fictional demo designs only (light lines on near-black, like concept cards).
// Sable's own fictional demo tattoos, lifted off their photos as flat designs
// (scripts/blender/extract-design.py), then two of the simple line cards.
const DESIGNS = [
  { label: 'Ocean hourglass', src: 'models/designs/hourglass.webp' },
  { label: 'Tiger portrait', src: 'models/designs/tiger.webp' },
  { label: 'Koi and waves', src: 'models/designs/koi.webp' },
  { label: 'Serpent (blackwork card)', src: 'images/demo/ferrum_line/3.svg' },
  { label: 'Fern (fine-line card)', src: 'images/demo/mora.blackfern/2.svg' },
]

const cm = (n) => `${n.toFixed(1)} cm`

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

export default function PlacementLab() {
  const [params] = useSearchParams()
  const spin = params.get('spin') === '1'
  const [arm, setArm] = useState(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [design, setDesign] = useState(DESIGNS[0].src)
  const [aspect, setAspect] = useState(1010 / 450)
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
  const onDesignSize = useCallback(({ width, height }) => setAspect(height / width), [])
  const onReady = useCallback(() => setReady(true), [])
  const onError = useCallback((e) => setError(e.message), [])

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col bg-v2-ink px-4 pb-24 pt-6 text-v2-cream">
      <p className="font-v2-ui text-xs uppercase tracking-[0.2em] text-v2-accent">Lab</p>
      <h1 className="font-v2-display text-3xl">On the arm, in 3D</h1>
      <p className="mt-1 font-v2-ui text-sm text-v2-muted">
        Drag to turn the arm. Pinch to resize the design.
      </p>

      <div className="relative mt-4 h-[56vh] min-h-[320px] overflow-hidden rounded-xs border border-v2-hairline">
        {placement && !error && (
          <Suspense fallback={null}>
            <ArmPlacement3D
              modelUrl={MODEL_URL}
              imageSrc={`${base}${design}`}
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
          <p className="mt-3 font-v2-display text-xl" aria-live="polite" data-testid="placement-size">
            {cm(placement.widthCm)} wide × {cm(placement.heightCm)} tall
            <span className="ml-2 font-v2-ui text-sm text-v2-muted">
              {Math.round(wrapShare(placement, arm.perimeterCm) * 100)}% round the arm
            </span>
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Slider
              label="Width" value={placement.widthCm} min={MIN_WIDTH_CM} max={28} step={0.5}
              format={cm} onChange={(widthCm) => setWanted((p) => ({ ...p, widthCm }))}
            />
            <Slider
              label="Above the elbow" value={placement.centreCm} min={arm.skinCm[0]} max={arm.skinCm[1]} step={0.5}
              format={cm} onChange={(centreCm) => setWanted((p) => ({ ...p, centreCm }))}
            />
            <Slider
              label="Round the arm" value={placement.arcCm} min={-15} max={15} step={0.5}
              format={(v) => (v === 0 ? 'outer arm' : `${cm(Math.abs(v))} ${v > 0 ? 'to the back' : 'to the front'}`)}
              onChange={(arcCm) => setWanted((p) => ({ ...p, arcCm }))}
            />
          </div>
          <label className="mt-3 block font-v2-ui text-sm text-v2-muted">
            Design
            <select
              value={design} onChange={(e) => setDesign(e.target.value)}
              className="mt-1 block h-11 w-full rounded-xs border border-v2-hairline bg-v2-surface px-3 text-v2-cream"
            >
              {DESIGNS.map((d) => <option key={d.src} value={d.src}>{d.label}</option>)}
            </select>
          </label>
        </>
      )}
    </main>
  )
}
