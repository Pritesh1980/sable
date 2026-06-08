import { useEffect, useMemo, useRef, useState } from 'react'
import { buildReliefStl, DETAIL_PRESETS, DEFAULT_RELIEF_SETTINGS } from '../data/reliefStl'

const CANVAS_READ_ERROR = 'This image cannot be read by the browser. Use an uploaded image or data URL.'
const IMAGE_LOAD_ERROR = 'Could not load this image for STL export.'

const DEFAULT_DRAWER_SETTINGS = {
  widthMm: String(DEFAULT_RELIEF_SETTINGS.widthMm),
  maxReliefMm: String(DEFAULT_RELIEF_SETTINGS.maxReliefMm),
  baseMm: String(DEFAULT_RELIEF_SETTINGS.baseMm),
  detail: DEFAULT_RELIEF_SETTINGS.detail,
  smoothing: DEFAULT_RELIEF_SETTINGS.smoothing,
  invert: DEFAULT_RELIEF_SETTINGS.invert,
}

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')

  return slug || 'concept'
}

function numericValue(value) {
  return Number.parseFloat(value)
}

function validateSettings(settings) {
  const widthMm = numericValue(settings.widthMm)
  const maxReliefMm = numericValue(settings.maxReliefMm)
  const baseMm = numericValue(settings.baseMm)
  const errors = []

  if (!Number.isFinite(widthMm) || widthMm < 20 || widthMm > 200) {
    errors.push('Width must be between 20mm and 200mm.')
  }

  if (!Number.isFinite(maxReliefMm) || maxReliefMm < 0.5 || maxReliefMm > 10) {
    errors.push('Maximum relief height must be between 0.5mm and 10mm.')
  }

  if (!Number.isFinite(baseMm) || baseMm < 0.4 || baseMm > 6) {
    errors.push('Base thickness must be between 0.4mm and 6mm.')
  }

  return { errors, widthMm, maxReliefMm, baseMm }
}

function imageToHeightmap(image, detail) {
  const maxSide = DETAIL_PRESETS[detail] || DETAIL_PRESETS.medium
  const sourceWidth = image.naturalWidth || image.width || image.clientWidth || 2
  const sourceHeight = image.naturalHeight || image.height || image.clientHeight || 2
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(2, Math.round(sourceWidth * scale))
  const height = Math.max(2, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(CANVAS_READ_ERROR)
  }

  context.drawImage(image, 0, 0, width, height)

  let pixels
  try {
    pixels = context.getImageData(0, 0, width, height).data
  } catch {
    throw new Error(CANVAS_READ_ERROR)
  }

  const values = []
  for (let index = 0; index < pixels.length; index += 4) {
    values.push((pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 255)
  }

  return { width, height, values }
}

function ReliefStlDrawerContent({ source, onClose }) {
  const closeButtonRef = useRef(null)
  const revokeTimerRef = useRef(null)
  const pendingRevokeUrlRef = useRef('')
  const onCloseRef = useRef(onClose)
  const [settings, setSettings] = useState(DEFAULT_DRAWER_SETTINGS)
  const [imageElement, setImageElement] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousActiveElement = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus()
      }
    }
  }, [source?.imageUrl])

  useEffect(() => () => {
    if (revokeTimerRef.current) {
      clearTimeout(revokeTimerRef.current)
      revokeTimerRef.current = null
    }
    if (pendingRevokeUrlRef.current) {
      URL.revokeObjectURL(pendingRevokeUrlRef.current)
      pendingRevokeUrlRef.current = ''
    }
  }, [])

  const validation = useMemo(() => validateSettings(settings), [settings])

  const sourceLabel = source.label || 'Selected image'
  const filenameSlug = slugify(source.filenameSeed || source.label)
  const downloadDisabled = validation.errors.length > 0 || !imageElement

  function updateSetting(name, value) {
    setSettings((current) => ({ ...current, [name]: value }))
    setError('')
  }

  function handleImageLoad(event) {
    setImageElement(event.currentTarget)
    setError('')
  }

  function handleImageError() {
    setImageElement(null)
    setError(IMAGE_LOAD_ERROR)
  }

  function handleDownload() {
    if (downloadDisabled) return

    try {
      const heightmap = imageToHeightmap(imageElement, settings.detail)
      const stl = buildReliefStl(heightmap, {
        widthMm: validation.widthMm,
        maxReliefMm: validation.maxReliefMm,
        baseMm: validation.baseMm,
        detail: settings.detail,
        smoothing: settings.smoothing,
        invert: settings.invert,
        solidName: filenameSlug,
      })
      const blob = new Blob([stl], { type: 'model/stl' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `tattoo-relief-${filenameSlug}.stl`
      document.body.appendChild(link)
      link.click()
      link.remove()
      pendingRevokeUrlRef.current = url
      revokeTimerRef.current = setTimeout(() => {
        URL.revokeObjectURL(url)
        pendingRevokeUrlRef.current = ''
        revokeTimerRef.current = null
      }, 1000)
    } catch (downloadError) {
      setError(downloadError.message === CANVAS_READ_ERROR ? CANVAS_READ_ERROR : 'Could not create the STL download.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-black/90 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Make Relief STL"
        className="mx-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-ink-border bg-ink-card shadow-2xl shadow-black/70"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-border px-5 py-4">
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-accent">Relief export</p>
            <h2 className="mt-1 font-display text-2xl text-cream">Make Relief STL</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-sm border border-ink-border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted transition-colors hover:border-cream-muted/50 hover:text-cream"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            <img
              src={source.imageUrl}
              alt={`${sourceLabel} STL source`}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="aspect-[4/3] w-full rounded-sm border border-ink-border bg-ink-muted object-contain"
            />
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Width in millimetres
              </span>
              <input
                type="number"
                min="20"
                max="200"
                step="1"
                value={settings.widthMm}
                onChange={(event) => updateSetting('widthMm', event.target.value)}
                className="w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-none transition-colors focus:border-cream-muted/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Maximum relief height in millimetres
              </span>
              <input
                type="number"
                min="0.5"
                max="10"
                step="0.1"
                value={settings.maxReliefMm}
                onChange={(event) => updateSetting('maxReliefMm', event.target.value)}
                className="w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-none transition-colors focus:border-cream-muted/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Base thickness in millimetres
              </span>
              <input
                type="number"
                min="0.4"
                max="6"
                step="0.1"
                value={settings.baseMm}
                onChange={(event) => updateSetting('baseMm', event.target.value)}
                className="w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-none transition-colors focus:border-cream-muted/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Detail preset
              </span>
              <select
                value={settings.detail}
                onChange={(event) => updateSetting('detail', event.target.value)}
                className="w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-none transition-colors focus:border-cream-muted/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Smoothing preset
              </span>
              <select
                value={settings.smoothing}
                onChange={(event) => updateSetting('smoothing', event.target.value)}
                className="w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-none transition-colors focus:border-cream-muted/50"
              >
                <option value="off">Off</option>
                <option value="light">Light</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-sm border border-ink-border bg-ink-black/20 px-3 py-3 text-sm text-cream-muted">
              <input
                aria-label="Invert relief height"
                type="checkbox"
                checked={settings.invert}
                onChange={(event) => updateSetting('invert', event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span>Invert relief height</span>
            </label>

            {[...validation.errors, error].filter(Boolean).map((message) => (
              <p key={message} className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
                {message}
              </p>
            ))}

            <button
              type="button"
              disabled={downloadDisabled}
              onClick={handleDownload}
              className="w-full rounded-sm bg-accent px-4 py-3 font-body text-sm text-cream transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
            >
              Download STL
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function ReliefStlDrawer({ source, onClose }) {
  if (!source) {
    return null
  }

  return (
    <ReliefStlDrawerContent
      key={source.imageUrl || 'empty-source'}
      source={source}
      onClose={onClose}
    />
  )
}
