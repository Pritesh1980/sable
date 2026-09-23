import { useEffect, useMemo, useRef, useState } from 'react'
import { buildReliefStl, DEFAULT_RELIEF_SETTINGS } from '../data/reliefStl'
import { CANVAS_READ_ERROR, imageToHeightmap } from '../data/reliefImage'
import ReliefPreview from './ReliefPreview'
const IMAGE_LOAD_ERROR = 'Could not load this image for STL export.'

const DEFAULT_DRAWER_SETTINGS = {
  widthMm: String(DEFAULT_RELIEF_SETTINGS.widthMm),
  maxReliefMm: String(DEFAULT_RELIEF_SETTINGS.maxReliefMm),
  baseMm: String(DEFAULT_RELIEF_SETTINGS.baseMm),
  detail: DEFAULT_RELIEF_SETTINGS.detail,
  smoothing: DEFAULT_RELIEF_SETTINGS.smoothing,
  invert: DEFAULT_RELIEF_SETTINGS.invert,
  mode: DEFAULT_RELIEF_SETTINGS.mode,
  threshold: String(DEFAULT_RELIEF_SETTINGS.threshold),
}

const SELECT_CLASS = 'w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50'
const LABEL_CLASS = 'mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted'

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

function ReliefStlDrawerContent({ source, onClose }) {
  const closeButtonRef = useRef(null)
  const revokeTimerRef = useRef(null)
  const pendingRevokeUrlRef = useRef('')
  const onCloseRef = useRef(onClose)
  const [settings, setSettings] = useState(DEFAULT_DRAWER_SETTINGS)
  const [imageElement, setImageElement] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('image')
  // A photo picked from the device replaces the source for this session.
  const [ownImage, setOwnImage] = useState(null)
  // The same <img> node is reused when the source changes, so the element
  // alone can't key the preview's heightmap; the src that loaded can.
  const [loadedSrc, setLoadedSrc] = useState('')

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

  const reliefSettings = useMemo(() => (validation.errors.length ? null : {
    widthMm: validation.widthMm,
    maxReliefMm: validation.maxReliefMm,
    baseMm: validation.baseMm,
    detail: settings.detail,
    smoothing: settings.smoothing,
    invert: settings.invert,
    mode: settings.mode,
    threshold: Number.parseFloat(settings.threshold),
  }), [validation, settings])

  const preview = useMemo(() => {
    if (view !== 'preview' || !imageElement || !loadedSrc) return { heightmap: null, error: '' }
    try {
      return { heightmap: imageToHeightmap(imageElement, settings.detail), error: '' }
    } catch (previewError) {
      return { heightmap: null, error: previewError.message }
    }
    // Keyed on loadedSrc too: a new picture can load into the same element.
  }, [view, imageElement, loadedSrc, settings.detail])

  const imageUrl = ownImage?.url || source.imageUrl
  const sourceLabel = ownImage?.label || source.label || 'Selected image'
  const filenameSlug = slugify(ownImage?.label || source.filenameSeed || source.label)
  const downloadDisabled = validation.errors.length > 0 || !imageElement

  function updateSetting(name, value) {
    setSettings((current) => {
      const next = { ...current, [name]: value }
      // Tattoo line work is dark ink on a light ground; raising the ink is
      // almost always what's wanted, so line art starts inverted.
      if (name === 'mode' && value === 'lineart' && current.mode !== 'lineart') next.invert = true
      return next
    })
    setError('')
  }

  function handleImageLoad(event) {
    setImageElement(event.currentTarget)
    setLoadedSrc(event.currentTarget.getAttribute('src') || '')
    setError('')
  }

  function handleOwnImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageElement(null)
      setError('')
      setOwnImage({ url: String(reader.result), label: file.name.replace(/\.[^.]+$/, '') || 'Photo' })
    }
    reader.onerror = () => setError(IMAGE_LOAD_ERROR)
    reader.readAsDataURL(file)
  }

  function handleImageError() {
    setImageElement(null)
    setError(IMAGE_LOAD_ERROR)
  }

  function handleDownload() {
    if (downloadDisabled) return

    try {
      const heightmap = imageToHeightmap(imageElement, settings.detail)
      const stl = buildReliefStl(heightmap, { ...reliefSettings, solidName: filenameSlug })
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
    <div className="fixed inset-0 z-50 bg-ink-black/90 px-4 py-6 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Make Relief STL"
        className="mx-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xs border border-ink-border bg-ink-card shadow-2xl shadow-black/70"
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
            className="rounded-xs border border-ink-border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted transition-colors hover:border-cream-muted/50 hover:text-cream"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-3">
            <div className="flex gap-2" role="group" aria-label="Show">
              {[['image', 'Image'], ['preview', '3D preview']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  disabled={value === 'preview' && !imageElement}
                  onClick={() => setView(value)}
                  className={`rounded-xs border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest transition-colors disabled:opacity-40 ${
                    view === value ? 'border-accent text-cream' : 'border-ink-border text-cream-muted hover:text-cream'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Stays mounted while the preview shows: the download reads its pixels. */}
            <img
              src={imageUrl}
              alt={`${sourceLabel} STL source`}
              onLoad={handleImageLoad}
              onError={handleImageError}
              hidden={view === 'preview'}
              className="aspect-[4/3] w-full rounded-xs border border-ink-border bg-ink-muted object-contain"
            />
            <label className="inline-flex cursor-pointer items-center rounded-xs border border-ink-border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted transition-colors hover:text-cream">
              Use another image…
              <input
                type="file"
                accept="image/*"
                aria-label="Use another image"
                onChange={handleOwnImage}
                className="sr-only"
              />
            </label>
            {view === 'preview' && (
              preview.error
                ? <p className="rounded-xs border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{preview.error}</p>
                : <ReliefPreview heightmap={preview.heightmap} settings={reliefSettings} />
            )}
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className={LABEL_CLASS}>Style</span>
              <select
                value={settings.mode}
                onChange={(event) => updateSetting('mode', event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="relief">Relief (shading becomes height)</option>
                <option value="lineart">Line art (raised lines on a flat plate)</option>
              </select>
            </label>

            {settings.mode === 'lineart' && (
              <div>
                <label className="block">
                  <span className={LABEL_CLASS}>Line threshold</span>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.05"
                    value={settings.threshold}
                    onChange={(event) => updateSetting('threshold', event.target.value)}
                    aria-describedby="relief-threshold-hint"
                    className="w-full accent-accent"
                  />
                </label>
                <p id="relief-threshold-hint" className="mt-1 text-xs text-cream-muted">
                  Higher catches fainter lines; lower keeps only the boldest.
                </p>
              </div>
            )}

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
                className="w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50"
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
                className="w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50"
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
                className="w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Detail preset
              </span>
              <select
                value={settings.detail}
                onChange={(event) => updateSetting('detail', event.target.value)}
                className="w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="fine">Fine (nozzle-scale, bigger file)</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                Smoothing preset
              </span>
              <select
                value={settings.smoothing}
                onChange={(event) => updateSetting('smoothing', event.target.value)}
                className="w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50"
              >
                <option value="off">Off</option>
                <option value="light">Light</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-xs border border-ink-border bg-ink-black/20 px-3 py-3 text-sm text-cream-muted">
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
              <p key={message} className="rounded-xs border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
                {message}
              </p>
            ))}

            <button
              type="button"
              disabled={downloadDisabled}
              onClick={handleDownload}
              className="w-full rounded-xs bg-accent px-4 py-3 font-body text-sm text-cream transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
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
