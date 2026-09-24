import { useEffect, useRef, useState } from 'react'
import { loadPhotoForRelief } from '../data/reliefImage'
import { imageUrlToDataUrl, shrinkImageDataUrl } from '../data/skinPreview'
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  MAX_SCALE,
  MIN_SCALE,
  dragTransform,
  formatDesignWidth,
  pinchTransform,
  pxPerMmFromCard,
} from '../lib/tryOnTransform'

const PHOTO_MAX_SIDE = 1536
const CONTROL_LABEL = 'block font-mono text-[0.625rem] uppercase tracking-widest text-cream-muted'
const PILL = 'rounded-xs border border-cream/30 bg-ink-black/60 px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-cream backdrop-blur-xs transition-colors hover:border-cream/60'

function viewport() {
  const w = (typeof window !== 'undefined' && window.innerWidth) || 360
  const h = (typeof window !== 'undefined' && window.innerHeight) || 640
  return { w, h }
}

// Draw `source` to fill a w×h box the way CSS object-cover does.
function drawCover(context, source, sourceW, sourceH, w, h) {
  const scale = Math.max(w / sourceW, h / sourceH)
  const dw = sourceW * scale
  const dh = sourceH * scale
  context.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

// Live camera try-on: the design floats over the camera feed (or a still
// photo), blended with multiply so white paper vanishes and only ink shows.
// Drag to move, pinch to size and twist; sliders do the same one-handed.
// No network, no cost — the quick "does it fit here?" check.
export default function LiveTryOn({ designUrl, label = 'Design', onSave, onClose }) {
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const photoRef = useRef(null)
  const designRef = useRef(null)
  const streamRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const pointersRef = useRef(new Map())
  const gestureRef = useRef(null)
  const transformRef = useRef(null)

  const [stage, setStage] = useState(viewport)
  const stageSizeRef = useRef(stage)
  const { w: stageW, h: stageH } = stage
  // A design linked from another site would taint the snapshot canvas; draw
  // from local bytes instead. Falls back to the URL (display still works).
  const [designSrc, setDesignSrc] = useState(designUrl)
  const baseWidth = Math.min(stageW, stageH) * 0.45
  const [transform, setTransform] = useState(() => ({ x: stageW / 2, y: stageH * 0.42, scale: 1, rotation: 0 }))
  const [ink, setInk] = useState(0.88)
  const [facing, setFacing] = useState('environment')
  const [streaming, setStreaming] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [photo, setPhoto] = useState('')
  const [calibrating, setCalibrating] = useState(false)
  const [cardWidthPx, setCardWidthPx] = useState(() => Math.round(stageW * 0.6))
  const [pxPerMm, setPxPerMm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { transformRef.current = transform }, [transform])

  useEffect(() => {
    if (String(designUrl).startsWith('data:')) return undefined
    let cancelled = false
    imageUrlToDataUrl(designUrl)
      .then((url) => { if (!cancelled) setDesignSrc(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [designUrl])

  // Rotating the phone resizes the stage: keep the design where it was
  // relative to the view.
  useEffect(() => {
    function onResize() {
      const previous = stageSizeRef.current
      const next = viewport()
      if (next.w === previous.w && next.h === previous.h) return
      stageSizeRef.current = next
      setStage(next)
      setTransform((t) => ({ ...t, x: (t.x * next.w) / previous.w, y: (t.y * next.h) / previous.h }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      // Handled: the try-on drawer underneath must not close on the same press.
      event.preventDefault()
      onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
  const hasCamera = Boolean(media?.getUserMedia)

  // Camera: (re)started when the facing changes; not used once a photo is chosen.
  useEffect(() => {
    if (photo || !hasCamera) return undefined
    let cancelled = false
    media.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        setCameraError('')
        setStreaming(true)
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.play?.()?.catch?.(() => {})
        }
      })
      .catch((error) => {
        if (cancelled) return
        setStreaming(false)
        setCameraError(error?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in Settings, or use a photo instead.'
          : 'No camera is available here. Use a photo instead.')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setStreaming(false)
    }
  }, [facing, photo, hasCamera, media])

  function handlePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    loadPhotoForRelief(file, PHOTO_MAX_SIDE)
      .then((url) => {
        // A different picture means a different scale: calibrate again.
        setPxPerMm(null)
        setPhoto(url)
      })
      .catch(() => setCameraError('Could not read that photo.'))
  }

  function point(event) {
    const rect = stageRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function beginGesture() {
    const points = [...pointersRef.current.values()]
    const base = transformRef.current
    if (points.length >= 2) gestureRef.current = { kind: 'pinch', start: { a: points[0], b: points[1] }, base }
    else if (points.length === 1) gestureRef.current = { kind: 'drag', start: points[0], base }
    else gestureRef.current = null
  }

  function onPointerDown(event) {
    if (calibrating) return
    stageRef.current?.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, point(event))
    beginGesture()
  }

  function onPointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, point(event))
    const gesture = gestureRef.current
    if (!gesture) return
    const points = [...pointersRef.current.values()]
    if (gesture.kind === 'pinch' && points.length >= 2) {
      setTransform(pinchTransform(gesture.start, { a: points[0], b: points[1] }, gesture.base))
    } else if (gesture.kind === 'drag') {
      setTransform(dragTransform(gesture.start, points[0], gesture.base))
    }
  }

  function onPointerEnd(event) {
    pointersRef.current.delete(event.pointerId)
    // Lifting one of two fingers carries on as a drag from where things are now.
    beginGesture()
  }

  function onWheel(event) {
    setTransform((t) => ({ ...t, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * Math.exp(-event.deltaY * 0.001))) }))
  }

  async function handleSnapshot() {
    setSaving(true)
    setSaveError('')
    try {
      // Up to 2× the CSS size, so saved snapshots stay sharp on a Retina screen.
      const density = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(stageW * density)
      canvas.height = Math.round(stageH * density)
      const context = canvas.getContext('2d')
      context.scale(density, density)
      const video = videoRef.current
      const still = photoRef.current
      if (photo && still) drawCover(context, still, still.naturalWidth || stageW, still.naturalHeight || stageH, stageW, stageH)
      else if (video) drawCover(context, video, video.videoWidth || stageW, video.videoHeight || stageH, stageW, stageH)
      const design = designRef.current
      const dw = baseWidth * transform.scale
      const aspect = design?.naturalWidth ? design.naturalHeight / design.naturalWidth : 1
      context.save()
      context.globalCompositeOperation = 'multiply'
      context.globalAlpha = ink
      context.translate(transform.x, transform.y)
      context.rotate((transform.rotation * Math.PI) / 180)
      context.drawImage(design, -dw / 2, (-dw * aspect) / 2, dw, dw * aspect)
      context.restore()
      const imageUrl = await shrinkImageDataUrl(canvas.toDataURL('image/jpeg', 0.9))
      onSave({
        provider: 'other',
        title: 'Live try-on',
        imageUrl,
        notes: `Live camera try-on of ${label}.${pxPerMm ? ` ${formatDesignWidth(dw, pxPerMm)}.` : ''}`,
      })
      onClose()
    } catch {
      // A design from another website can't be read back from a canvas.
      setSaveError('Could not save a snapshot of this design.')
      setSaving(false)
    }
  }

  const designWidth = baseWidth * transform.scale
  const readout = formatDesignWidth(designWidth, pxPerMm)
  const cardHeightPx = cardWidthPx * (CARD_HEIGHT_MM / CARD_WIDTH_MM)

  return (
    <div role="dialog" aria-modal="true" aria-label="Live try-on" className="fixed inset-0 z-[80] overflow-hidden bg-black">
      <div
        ref={stageRef}
        data-testid="try-on-stage"
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      >
        {photo ? (
          <img ref={photoRef} src={photo} alt="Your placement photo" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
        )}

        <img
          ref={designRef}
          src={designSrc}
          alt={`${label} design overlay`}
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none mix-blend-multiply"
          style={{
            left: `${transform.x}px`,
            top: `${transform.y}px`,
            width: `${designWidth}px`,
            opacity: ink,
            transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
          }}
        />

        {calibrating && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-dashed border-accent"
            style={{ width: `${cardWidthPx}px`, height: `${cardHeightPx}px` }}
          />
        )}
      </div>

      {!streaming && !photo && hasCamera && !cameraError && (
        <p className="absolute inset-x-6 top-1/3 rounded-xs bg-ink-black/70 p-4 text-center text-sm text-cream">
          Starting camera… allow access if your phone asks.
        </p>
      )}
      {!streaming && !photo && (cameraError || !hasCamera) && (
        <p className="absolute inset-x-6 top-1/3 rounded-xs bg-ink-black/80 p-4 text-center text-sm text-cream">
          {cameraError || 'No camera is available here. Use a photo instead.'}
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 px-[max(1rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close live try-on" className={`${PILL} pointer-events-auto`}>
          × Close
        </button>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          {streaming && (
            <button
              type="button"
              onClick={() => {
                setPxPerMm(null)
                setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
              }}
              className={PILL}
            >
              Flip camera
            </button>
          )}
          <label className={`${PILL} cursor-pointer`}>
            {photo ? 'Change photo' : 'Use a photo'}
            <input type="file" accept="image/*" aria-label="Use a photo instead" onChange={handlePhoto} className="sr-only" />
          </label>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        {calibrating ? (
          <>
            <p className="text-sm text-cream">
              Hold a bank card flat against your skin, then match the dashed outline to it.
            </p>
            <label className="block">
              <span className={CONTROL_LABEL}>Card outline width</span>
              <input
                type="range"
                min="60"
                max={Math.round(stageW * 0.95)}
                step="0.1"
                value={cardWidthPx}
                onChange={(event) => setCardWidthPx(Number(event.target.value))}
                className="w-full accent-accent"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPxPerMm(pxPerMmFromCard(cardWidthPx)); setCalibrating(false) }}
                className={PILL}
              >
                Done
              </button>
              <button type="button" onClick={() => setCalibrating(false)} className={PILL}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <label>
                <span className={CONTROL_LABEL}>Size</span>
                <input
                  type="range" min={MIN_SCALE} max={MAX_SCALE} step="0.05" value={transform.scale}
                  onChange={(event) => setTransform((t) => ({ ...t, scale: Number(event.target.value) }))}
                  className="w-full accent-accent"
                />
              </label>
              <label>
                <span className={CONTROL_LABEL}>Rotation</span>
                <input
                  type="range" min="-180" max="180" step="1" value={Math.round(transform.rotation)}
                  onChange={(event) => setTransform((t) => ({ ...t, rotation: Number(event.target.value) }))}
                  className="w-full accent-accent"
                />
              </label>
              <label>
                <span className={CONTROL_LABEL}>Ink</span>
                <input
                  type="range" min="0.3" max="1" step="0.02" value={ink}
                  onChange={(event) => setInk(Number(event.target.value))}
                  className="w-full accent-accent"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCalibrating(true)} className={PILL}>Real size</button>
              {readout && <span className="font-mono text-xs text-cream">{readout}</span>}
              <button
                type="button"
                onClick={handleSnapshot}
                disabled={saving || (!streaming && !photo)}
                className="ml-auto rounded-xs bg-accent px-4 py-2 font-body text-sm text-cream disabled:opacity-40"
              >
                Save snapshot
              </button>
            </div>
            {saveError && <p className="text-sm text-accent">{saveError}</p>}
            <p className="text-xs text-cream-muted">Drag to move · pinch to size and turn</p>
          </>
        )}
      </div>
    </div>
  )
}
