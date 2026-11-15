import useImageBytes from '../hooks/useImageBytes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildReliefStl, DEFAULT_RELIEF_SETTINGS, serializeBinaryStl } from '../data/reliefStl'
import { CANVAS_READ_ERROR, imageToHeightmap, loadPhotoForRelief } from '../data/reliefImage'
import {
  buildTattooPrintMeshes,
  DEFAULT_TATTOO_PRINT_SETTINGS,
  liftTattooWithGemini,
  prepareTattooPrintMask,
  serializeTwoPart3mf,
} from '../data/tattooPrint'
import { imageUrlToDataUrl, shrinkImageDataUrl } from '../data/skinPreview'
import ReliefMask from './ReliefMask'
import ReliefPreview from './ReliefPreview'
import { trimChars, trimEndChars } from '../data/textTrim'

const IMAGE_LOAD_ERROR = 'Could not load this image for STL export.'
const LIFT_MAX_SIDE = 1536

const DEFAULT_DRAWER_SETTINGS = {
  widthMm: String(DEFAULT_RELIEF_SETTINGS.widthMm),
  maxReliefMm: String(DEFAULT_RELIEF_SETTINGS.maxReliefMm),
  baseMm: String(DEFAULT_RELIEF_SETTINGS.baseMm),
  detail: DEFAULT_RELIEF_SETTINGS.detail,
  smoothing: DEFAULT_RELIEF_SETTINGS.smoothing,
  invert: DEFAULT_RELIEF_SETTINGS.invert,
  mode: DEFAULT_RELIEF_SETTINGS.mode,
  threshold: String(DEFAULT_RELIEF_SETTINGS.threshold),
  frame: DEFAULT_RELIEF_SETTINGS.frame,
  minStrokeMm: String(DEFAULT_TATTOO_PRINT_SETTINGS.minStrokeMm),
  marginMm: String(DEFAULT_TATTOO_PRINT_SETTINGS.marginMm),
  finish: DEFAULT_TATTOO_PRINT_SETTINGS.finish,
  exportFormat: DEFAULT_TATTOO_PRINT_SETTINGS.exportFormat,
}

// Line art prints best at nozzle-scale detail with low, sturdy lines; a 3mm
// fin a sample wide snaps off or gets dropped by the slicer.
const LINEART_DEFAULTS = { detail: 'fine', maxReliefMm: '1.5' }
// Typical lithophane range: ~0.8mm lets light through, ~3mm blocks it.
const LITHOPHANE_DEFAULTS = { detail: 'fine', baseMm: '0.8', maxReliefMm: '2.2' }
// Silhouette two-tone print defaults (120 mm keeps stippling readable on a standard bed).
const TATTOO_DEFAULTS = {
  widthMm: String(DEFAULT_TATTOO_PRINT_SETTINGS.widthMm),
  baseMm: String(DEFAULT_TATTOO_PRINT_SETTINGS.baseMm),
  maxReliefMm: String(DEFAULT_TATTOO_PRINT_SETTINGS.maxReliefMm),
  detail: DEFAULT_TATTOO_PRINT_SETTINGS.detail,
  threshold: String(DEFAULT_TATTOO_PRINT_SETTINGS.threshold),
}

const SELECT_CLASS = 'w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50'
const INPUT_CLASS = 'w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden transition-colors focus:border-cream-muted/50'
const LABEL_CLASS = 'mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted'

function slugify(value) {
  const dashed = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const slug = trimEndChars(trimChars(dashed, '-').slice(0, 60), '-')

  return slug || 'concept'
}

function numericValue(value) {
  return Number.parseFloat(value)
}

function validateSettings(settings) {
  const widthMm = numericValue(settings.widthMm)
  const maxReliefMm = numericValue(settings.maxReliefMm)
  const baseMm = numericValue(settings.baseMm)
  const minStrokeMm = numericValue(settings.minStrokeMm)
  const marginMm = numericValue(settings.marginMm)
  const errors = []

  if (settings.mode === 'tattoo') {
    if (!Number.isFinite(widthMm) || widthMm < 20 || widthMm > 250) {
      errors.push('Width must be between 20mm and 250mm.')
    }
    if (!Number.isFinite(maxReliefMm) || maxReliefMm < 0.2 || maxReliefMm > 5) {
      errors.push('Ink depth must be between 0.2mm and 5mm.')
    }
    if (!Number.isFinite(baseMm) || baseMm < 1.2 || baseMm > 12) {
      errors.push('Plate thickness must be between 1.2mm and 12mm.')
    } else if (Number.isFinite(maxReliefMm) && maxReliefMm > baseMm - 0.4 + 1e-6) {
      errors.push('Ink depth must leave at least 0.4mm of backing plate.')
    }
    if (!Number.isFinite(minStrokeMm) || minStrokeMm < 0 || minStrokeMm > 2) {
      errors.push('Minimum stroke and gap must be between 0mm and 2mm.')
    }
    if (!Number.isFinite(marginMm) || marginMm < 1 || marginMm > 15) {
      errors.push('Silhouette margin must be between 1mm and 15mm.')
    }
  } else {
    if (!Number.isFinite(widthMm) || widthMm < 20 || widthMm > 200) {
      errors.push('Width must be between 20mm and 200mm.')
    }

    if (!Number.isFinite(maxReliefMm) || maxReliefMm < 0.5 || maxReliefMm > 10) {
      errors.push('Maximum relief height must be between 0.5mm and 10mm.')
    }

    if (!Number.isFinite(baseMm) || baseMm < 0.4 || baseMm > 6) {
      errors.push('Base thickness must be between 0.4mm and 6mm.')
    }
  }

  return { errors, widthMm, maxReliefMm, baseMm, minStrokeMm, marginMm }
}

function shouldShrinkDataUrl(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.length > 300_000
}

function imageElementToDataUrl(image, maxSide = LIFT_MAX_SIDE) {
  try {
    const sourceW = image?.naturalWidth || image?.width || 0
    const sourceH = image?.naturalHeight || image?.height || 0
    if (sourceW < 1 || sourceH < 1) return ''
    const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sourceW * scale))
    canvas.height = Math.max(1, Math.round(sourceH * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL?.('image/png') || ''
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(out) ? out : ''
  } catch {
    return ''
  }
}

function applyTattooDefaults(current) {
  const next = { ...current, mode: 'tattoo', invert: false }
  for (const [field, preset] of Object.entries(TATTOO_DEFAULTS)) {
    if (
      current[field] === DEFAULT_DRAWER_SETTINGS[field]
      || current[field] === LINEART_DEFAULTS[field]
      || current[field] === LITHOPHANE_DEFAULTS[field]
    ) {
      next[field] = preset
    }
  }
  if (!Number.isFinite(Number(next.baseMm)) || Number(next.baseMm) < 1.2) {
    next.baseMm = TATTOO_DEFAULTS.baseMm
  }
  if (
    !Number.isFinite(Number(next.maxReliefMm))
    || Number(next.maxReliefMm) < 0.2
    || Number(next.maxReliefMm) > Number(next.baseMm) - 0.4 + 1e-6
  ) {
    next.maxReliefMm = TATTOO_DEFAULTS.maxReliefMm
  }
  return next
}

function ReliefStlDrawerContent({ source, apiKey, onSave, saveLabel, onClose }) {
  const closeButtonRef = useRef(null)
  const revokeTimersRef = useRef([])
  const pendingRevokeUrlsRef = useRef(new Set())
  const onCloseRef = useRef(onClose)
  const originalDataUrlRef = useRef({ key: '', dataUrl: '' })
  const [settings, setSettings] = useState(DEFAULT_DRAWER_SETTINGS)
  const [imageElement, setImageElement] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('image')
  // A photo picked from the device replaces the source for this session.
  const [ownImage, setOwnImage] = useState(null)
  // { url, fromRef, saved }: Gemini-lifted clean black-on-white redraw.
  const [lifted, setLifted] = useState(null)
  const [useLifted, setUseLifted] = useState(false)
  const [lifting, setLifting] = useState(false)
  const [savingLift, setSavingLift] = useState(false)
  // The same <img> node is reused when the source changes, so the element
  // alone can't key the preview's heightmap; the src that loaded can.
  const [loadedSrc, setLoadedSrc] = useState('')
  const photoPickRef = useRef(0)
  const liftGenRef = useRef(0)

  useEffect(() => {
    liftGenRef.current += 1
  }, [source?.imageUrl])

  const resolvedApiKey = (
    apiKey !== undefined
      ? String(apiKey || '')
      : (typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') || '' : '')
  ).trim()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousActiveElement = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        // Handled: the viewer underneath must not close on the same press.
        event.preventDefault()
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

  useEffect(() => {
    const timers = revokeTimersRef.current
    const urls = pendingRevokeUrlsRef.current
    return () => {
      for (const timer of timers) clearTimeout(timer)
      timers.length = 0
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const rawSourceRef = ownImage?.url || source.imageUrl
  const showingLifted = Boolean(lifted && useLifted && lifted.fromRef === rawSourceRef)
  const activeImageRef = showingLifted ? lifted.url : rawSourceRef

  // The pixels are read back for the preview and the download, so the <img>
  // must be same-origin: a signed url would taint the canvas (#114).
  const bytes = useImageBytes(activeImageRef)
  const sourceLabel = ownImage?.label || source.label || 'Selected image'
  const filenameSlug = slugify(ownImage?.label || source.filenameSeed || source.label)

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
    frame: settings.frame,
    minStrokeMm: validation.minStrokeMm,
    marginMm: validation.marginMm,
    finish: settings.finish,
    exportFormat: settings.exportFormat,
  }), [validation, settings])

  const isMaskMode = settings.mode === 'lineart' || settings.mode === 'tattoo'
  // The line / cutout mask only applies to lineart and two-colour tattoo modes;
  // fall back to the image rather than show a stale or meaningless view.
  const shownView = view === 'mask' && !isMaskMode ? 'image' : view
  const maskLabel = settings.mode === 'tattoo' ? 'Cutout mask' : 'Line mask'
  const views = [['image', 'Image'], ...(isMaskMode ? [['mask', maskLabel]] : []), ['preview', '3D preview']]

  const activeHeightmap = useMemo(() => {
    const needHeightmap = shownView !== 'image' || settings.mode === 'tattoo'
    if (!needHeightmap || !imageElement || !loadedSrc) return { heightmap: null, error: '' }
    try {
      return { heightmap: imageToHeightmap(imageElement, settings.detail), error: '' }
    } catch (previewError) {
      return { heightmap: null, error: previewError.message }
    }
    // Keyed on loadedSrc too: a new picture can load into the same element.
  }, [shownView, settings.mode, imageElement, loadedSrc, settings.detail])

  const tattooMetrics = useMemo(() => {
    if (settings.mode !== 'tattoo' || !activeHeightmap.heightmap || !reliefSettings) return null
    try {
      const mask = prepareTattooPrintMask(activeHeightmap.heightmap, reliefSettings)
      const pauseMm = Number((reliefSettings.baseMm - reliefSettings.maxReliefMm).toFixed(2))
      return {
        widthMm: Number(mask.widthMm.toFixed(1)),
        depthMm: Number(mask.depthMm.toFixed(1)),
        heightMm: Number(reliefSettings.baseMm.toFixed(1)),
        pauseAtHeightMm: pauseMm,
        hasInk: mask.hasInk !== false,
      }
    } catch {
      return null
    }
  }, [settings.mode, activeHeightmap.heightmap, reliefSettings])

  const downloadDisabled = validation.errors.length > 0 || !imageElement || lifting

  function updateSetting(name, value) {
    setSettings((current) => {
      if (name === 'mode' && value === 'tattoo' && current.mode !== 'tattoo') {
        return applyTattooDefaults(current)
      }
      const next = { ...current, [name]: value }
      // Tattoo line work is dark ink on a light ground; raising the ink is
      // almost always what's wanted, so line art starts inverted.
      if (name === 'mode' && value === 'lineart' && current.mode !== 'lineart') {
        next.invert = true
        // Only replace values still at their defaults — never a user's choice.
        if (current.detail === DEFAULT_DRAWER_SETTINGS.detail) next.detail = LINEART_DEFAULTS.detail
        if (current.maxReliefMm === DEFAULT_DRAWER_SETTINGS.maxReliefMm) next.maxReliefMm = LINEART_DEFAULTS.maxReliefMm
      }
      if (name === 'mode' && value === 'lithophane' && current.mode !== 'lithophane') {
        for (const [field, preset] of Object.entries(LITHOPHANE_DEFAULTS)) {
          if (current[field] === DEFAULT_DRAWER_SETTINGS[field]) next[field] = preset
        }
      }
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
    // Nothing downloadable until the new photo has loaded, and only the most
    // recent pick may land; any in-flight Gemini lift for the previous photo is stale.
    const pick = photoPickRef.current + 1
    photoPickRef.current = pick
    liftGenRef.current += 1
    setLifting(false)
    setImageElement(null)
    setLoadedSrc('')
    setLifted(null)
    setUseLifted(false)
    originalDataUrlRef.current = { key: '', dataUrl: '' }
    setError('')
    loadPhotoForRelief(file)
      .then((url) => {
        if (photoPickRef.current !== pick) return
        setOwnImage({ url, label: file.name.replace(/\.[^.]+$/, '') || 'Photo' })
      })
      .catch(() => {
        if (photoPickRef.current === pick) setError(IMAGE_LOAD_ERROR)
      })
  }

  function handleImageError() {
    setImageElement(null)
    setError(IMAGE_LOAD_ERROR)
  }

  function switchSourceVersion(nextUseLifted) {
    if (!lifted || nextUseLifted === useLifted) return
    setImageElement(null)
    setLoadedSrc('')
    setUseLifted(nextUseLifted)
    setError('')
  }

  async function resolveOriginalPhotoDataUrl() {
    if (originalDataUrlRef.current.key === rawSourceRef && originalDataUrlRef.current.dataUrl) {
      return originalDataUrlRef.current.dataUrl
    }
    let dataUrl = ''
    if (!showingLifted && /^data:image\/(?:png|jpeg|webp);base64,.+/.test(bytes.src)) {
      if (
        imageElement
        && (imageElement.naturalWidth > LIFT_MAX_SIDE || imageElement.naturalHeight > LIFT_MAX_SIDE)
      ) {
        dataUrl = imageElementToDataUrl(imageElement) || bytes.src
      } else {
        dataUrl = bytes.src
      }
    }
    if (!dataUrl && !showingLifted && imageElement) {
      dataUrl = imageElementToDataUrl(imageElement)
    }
    if (!dataUrl) {
      dataUrl = await imageUrlToDataUrl(rawSourceRef)
    }
    originalDataUrlRef.current = { key: rawSourceRef, dataUrl }
    return dataUrl
  }

  async function handleLiftTattoo() {
    if (!resolvedApiKey || lifting || (!showingLifted && !imageElement)) return
    const targetRef = rawSourceRef
    const liftGen = liftGenRef.current + 1
    liftGenRef.current = liftGen
    setLifting(true)
    setError('')
    try {
      const photoDataUrl = await resolveOriginalPhotoDataUrl()
      if (liftGenRef.current !== liftGen) return
      const resultUrl = await liftTattooWithGemini(resolvedApiKey, { photoDataUrl })
      if (liftGenRef.current !== liftGen) return
      setImageElement(null)
      setLoadedSrc('')
      setLifted({ url: resultUrl, fromRef: targetRef, saved: false })
      setUseLifted(true)
      setSettings((current) => (current.mode === 'tattoo' ? current : applyTattooDefaults(current)))
    } catch (liftError) {
      if (liftGenRef.current !== liftGen) return
      setError(liftError.message || 'Could not lift the tattoo design from this photo.')
    } finally {
      if (liftGenRef.current === liftGen) setLifting(false)
    }
  }

  async function handleSaveLifted() {
    if (!onSave || !lifted || savingLift) return
    setSavingLift(true)
    setError('')
    try {
      const imageUrl = shouldShrinkDataUrl(lifted.url)
        ? await shrinkImageDataUrl(lifted.url)
        : lifted.url
      onSave(source.conceptId, {
        provider: 'gemini',
        title: `Lifted tattoo — ${sourceLabel}`,
        imageUrl,
        notes: `Black-on-white tattoo design lifted from ${sourceLabel}.`,
      })
      setLifted((current) => (current ? { ...current, saved: true } : current))
    } catch {
      setError('Could not save the lifted design.')
    } finally {
      setSavingLift(false)
    }
  }

  function triggerBlobDownload(data, mimeType, filename) {
    const blob = new Blob([data], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    pendingRevokeUrlsRef.current.add(url)
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      pendingRevokeUrlsRef.current.delete(url)
      const idx = revokeTimersRef.current.indexOf(timer)
      if (idx !== -1) revokeTimersRef.current.splice(idx, 1)
    }, 1000)
    revokeTimersRef.current.push(timer)
  }

  function handleDownload() {
    if (downloadDisabled) return

    try {
      const heightmap = activeHeightmap.heightmap || imageToHeightmap(imageElement, settings.detail)
      if (reliefSettings.mode === 'tattoo') {
        const built = buildTattooPrintMeshes(heightmap, reliefSettings)
        if (reliefSettings.exportFormat === 'split-stl') {
          triggerBlobDownload(
            serializeBinaryStl(built.baseMesh, `${filenameSlug}_base`),
            'model/stl',
            `tattoo-${filenameSlug}-base.stl`,
          )
          triggerBlobDownload(
            serializeBinaryStl(built.inkMesh, `${filenameSlug}_ink`),
            'model/stl',
            `tattoo-${filenameSlug}-ink.stl`,
          )
        } else if (reliefSettings.exportFormat === 'merged-stl') {
          triggerBlobDownload(
            serializeBinaryStl(built.mergedMesh, `${filenameSlug}_single`),
            'model/stl',
            `tattoo-${filenameSlug}-single-extruder.stl`,
          )
        } else {
          triggerBlobDownload(
            serializeTwoPart3mf({ baseMesh: built.baseMesh, inkMesh: built.inkMesh, name: filenameSlug }),
            'model/3mf',
            `tattoo-${filenameSlug}.3mf`,
          )
        }
        return
      }

      const stl = buildReliefStl(heightmap, { ...reliefSettings, solidName: filenameSlug })
      triggerBlobDownload(stl, 'model/stl', `tattoo-relief-${filenameSlug}.stl`)
    } catch (downloadError) {
      setError(downloadError.message === CANVAS_READ_ERROR ? CANVAS_READ_ERROR : 'Could not create the STL download.')
    }
  }

  const downloadLabel = settings.mode !== 'tattoo'
    ? 'Download STL'
    : settings.exportFormat === '3mf'
      ? 'Download 2-colour 3MF'
      : settings.exportFormat === 'split-stl'
        ? 'Download base + ink STLs'
        : 'Download STL'

  // z-[70]: above the full-screen viewers (z-[60]) these open from.
  return (
    <div className="fixed inset-0 z-[70] bg-ink-black/90 px-4 py-6 backdrop-blur-xs">
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2" role="group" aria-label="Show">
                {views.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={shownView === value}
                    disabled={value !== 'image' && !imageElement}
                    onClick={() => setView(value)}
                    className={`rounded-xs border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest transition-colors disabled:opacity-40 ${
                      shownView === value ? 'border-accent text-cream' : 'border-ink-border text-cream-muted hover:text-cream'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {lifted && lifted.fromRef === rawSourceRef && (
                <div className="flex gap-2" role="group" aria-label="Source version">
                  <button
                    type="button"
                    aria-pressed={showingLifted}
                    onClick={() => switchSourceVersion(true)}
                    className={`rounded-xs border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest transition-colors ${
                      showingLifted ? 'border-accent text-cream' : 'border-ink-border text-cream-muted hover:text-cream'
                    }`}
                  >
                    Lifted design
                  </button>
                  <button
                    type="button"
                    aria-pressed={!showingLifted}
                    onClick={() => switchSourceVersion(false)}
                    className={`rounded-xs border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest transition-colors ${
                      !showingLifted ? 'border-accent text-cream' : 'border-ink-border text-cream-muted hover:text-cream'
                    }`}
                  >
                    Original photo
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              {lifting && (
                <p
                  role="status"
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-xs bg-ink-black/75 p-6 text-center text-sm text-cream backdrop-blur-xs"
                >
                  Lifting tattoo design with Gemini… this usually takes 10–20 seconds.
                </p>
              )}
              {/* Stays mounted under the other views: the download reads its pixels. */}
              {bytes.status === 'ready' ? (
                <img
                  src={bytes.src}
                  alt={`${sourceLabel} STL source`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  hidden={shownView !== 'image'}
                  className="aspect-[4/3] w-full rounded-xs border border-ink-border bg-ink-muted object-contain"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xs border border-ink-border bg-ink-muted px-4 text-center font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted">
                  {bytes.status === 'loading' ? 'Loading image…' : 'This image is available when online.'}
                </div>
              )}
              {shownView !== 'image' && activeHeightmap.error && (
                <p className="rounded-xs border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{activeHeightmap.error}</p>
              )}
              {shownView === 'mask' && !activeHeightmap.error && (
                <ReliefMask heightmap={activeHeightmap.heightmap} settings={reliefSettings} />
              )}
              {shownView === 'preview' && !activeHeightmap.error && (
                <ReliefPreview heightmap={activeHeightmap.heightmap} settings={reliefSettings} />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
              {onSave && lifted && lifted.fromRef === rawSourceRef && (
                <button
                  type="button"
                  disabled={lifted.saved || savingLift || lifting}
                  onClick={handleSaveLifted}
                  className="rounded-xs border border-accent/45 px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {lifted.saved ? 'Saved' : savingLift ? 'Saving…' : saveLabel}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 rounded-xs border border-ink-border bg-ink-black/20 p-3">
              <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-accent">Prepare from photo</p>
              <p className="text-xs text-cream-muted">
                Turning a photo of an existing tattoo into a clean print? Gemini redraws the ink
                flat black-on-white without skin or limb curve.
              </p>
              <button
                type="button"
                disabled={!resolvedApiKey || bytes.status !== 'ready' || (!showingLifted && !imageElement) || lifting}
                onClick={handleLiftTattoo}
                className="w-full rounded-xs border border-accent/45 px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {lifting ? 'Lifting design…' : lifted?.fromRef === rawSourceRef ? 'Retry lift' : 'Lift the tattoo'}
              </button>
              {!resolvedApiKey ? (
                <p className="text-xs text-cream-muted">
                  Add a Gemini key in Concepts → AI setup to lift a tattoo from a photo.
                </p>
              ) : (
                <p className="text-xs text-cream-muted">
                  Sends this image to Google’s Gemini image model with your key (about $0.04).
                </p>
              )}
            </div>

            <label className="block">
              <span className={LABEL_CLASS}>Style</span>
              <select
                value={settings.mode}
                onChange={(event) => updateSetting('mode', event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="relief">Relief (shading becomes height)</option>
                <option value="lineart">Line art (raised lines on a flat plate)</option>
                <option value="lithophane">Lithophane (shows when lit from behind)</option>
                <option value="tattoo">Print this tattoo (2-colour silhouette)</option>
              </select>
            </label>

            {settings.mode === 'lithophane' && (
              <p className="text-xs text-cream-muted">
                Print it standing upright in white or natural filament at 100% infill, then hold it
                up to a light: thick areas read dark, thin areas glow.
              </p>
            )}

            {settings.mode === 'tattoo' && (
              <>
                <label className="block">
                  <span className={LABEL_CLASS}>Finish</span>
                  <select
                    value={settings.finish}
                    onChange={(event) => updateSetting('finish', event.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="inlay">Inlay (face-down on bed, flush surface)</option>
                    <option value="raised">Raised (ink stands proud of base)</option>
                  </select>
                </label>

                <label className="block">
                  <span className={LABEL_CLASS}>Export format</span>
                  <select
                    value={settings.exportFormat}
                    onChange={(event) => updateSetting('exportFormat', event.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="3mf">Two-colour 3MF (base + ink together)</option>
                    <option value="split-stl">Split STLs (base.stl + ink.stl)</option>
                    <option value="merged-stl">Single-extruder STL (pause at height)</option>
                  </select>
                </label>

                <div>
                  <label className="block">
                    <span className={LABEL_CLASS}>Ink threshold</span>
                    <input
                      type="range"
                      min="0.05"
                      max="0.95"
                      step="0.05"
                      value={settings.threshold}
                      onChange={(event) => updateSetting('threshold', event.target.value)}
                      aria-describedby="tattoo-threshold-hint"
                      className="w-full accent-accent"
                    />
                  </label>
                  <p id="tattoo-threshold-hint" className="mt-1 text-xs text-cream-muted">
                    Higher catches lighter ink and stippling; lower keeps only solid blacks.
                  </p>
                </div>
              </>
            )}

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
              <span className={LABEL_CLASS}>Width in millimetres</span>
              <input
                type="number"
                min="20"
                max={settings.mode === 'tattoo' ? '250' : '200'}
                step="1"
                value={settings.widthMm}
                onChange={(event) => updateSetting('widthMm', event.target.value)}
                className={INPUT_CLASS}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>
                {settings.mode === 'tattoo' ? 'Ink depth in millimetres' : 'Maximum relief height in millimetres'}
              </span>
              <input
                type="number"
                min={settings.mode === 'tattoo' ? '0.2' : '0.5'}
                max={settings.mode === 'tattoo' ? '5' : '10'}
                step="0.1"
                value={settings.maxReliefMm}
                onChange={(event) => updateSetting('maxReliefMm', event.target.value)}
                className={INPUT_CLASS}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>
                {settings.mode === 'tattoo' ? 'Plate thickness in millimetres' : 'Base thickness in millimetres'}
              </span>
              <input
                type="number"
                min={settings.mode === 'tattoo' ? '1.2' : '0.4'}
                max={settings.mode === 'tattoo' ? '12' : '6'}
                step="0.1"
                value={settings.baseMm}
                onChange={(event) => updateSetting('baseMm', event.target.value)}
                className={INPUT_CLASS}
              />
            </label>

            {settings.mode === 'tattoo' && (
              <>
                <label className="block">
                  <span className={LABEL_CLASS}>Minimum stroke and gap in millimetres</span>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={settings.minStrokeMm}
                    onChange={(event) => updateSetting('minStrokeMm', event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>

                <label className="block">
                  <span className={LABEL_CLASS}>Silhouette margin in millimetres</span>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    step="0.5"
                    value={settings.marginMm}
                    onChange={(event) => updateSetting('marginMm', event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </>
            )}

            <label className="block">
              <span className={LABEL_CLASS}>Detail preset</span>
              <select
                value={settings.detail}
                onChange={(event) => updateSetting('detail', event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="fine">Fine (nozzle-scale, bigger file)</option>
              </select>
            </label>

            {settings.mode !== 'tattoo' && (
              <>
                <label className="block">
                  <span className={LABEL_CLASS}>Smoothing preset</span>
                  <select
                    value={settings.smoothing}
                    onChange={(event) => updateSetting('smoothing', event.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="off">Off</option>
                    <option value="light">Light</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-xs border border-ink-border bg-ink-black/20 px-3 py-3 text-sm text-cream-muted">
                  <input
                    aria-label="Add a border"
                    type="checkbox"
                    checked={settings.frame}
                    onChange={(event) => updateSetting('frame', event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>Add a border (3mm frame, stiffens thin prints)</span>
                </label>
              </>
            )}

            {settings.mode !== 'lithophane' && (
              <label className="flex items-center gap-3 rounded-xs border border-ink-border bg-ink-black/20 px-3 py-3 text-sm text-cream-muted">
                <input
                  aria-label={
                    settings.mode === 'tattoo'
                      ? 'Light ink on dark ground'
                      : settings.mode === 'lineart'
                        ? 'Raise dark lines'
                        : 'Invert relief height'
                  }
                  type="checkbox"
                  checked={settings.invert}
                  onChange={(event) => updateSetting('invert', event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span>
                  {settings.mode === 'tattoo'
                    ? 'Light ink on dark ground (white lines on black)'
                    : settings.mode === 'lineart'
                      ? 'Raise dark lines (untick to engrave them instead)'
                      : 'Invert relief height'}
                </span>
              </label>
            )}

            {settings.mode === 'tattoo' && (
              <div className="space-y-1.5 rounded-xs border border-ink-border bg-ink-black/20 px-3 py-2.5 text-xs text-cream-muted">
                {tattooMetrics && !tattooMetrics.hasInk && (
                  <p className="text-accent">
                    No ink detected at this threshold — raise the ink threshold or tick Light ink on dark ground.
                  </p>
                )}
                {tattooMetrics && (
                  <p className="font-mono text-[0.6875rem] text-cream">
                    Silhouette: {tattooMetrics.widthMm} × {tattooMetrics.depthMm} × {tattooMetrics.heightMm} mm
                  </p>
                )}
                {settings.exportFormat === 'merged-stl' ? (
                  <p>
                    Single extruder: pause at height {tattooMetrics ? tattooMetrics.pauseAtHeightMm : Number((validation.baseMm - validation.maxReliefMm).toFixed(2))} mm (first ink layer) in Cura to swap filament.
                  </p>
                ) : settings.finish === 'inlay' ? (
                  <p>
                    Face-down inlay: ink sits flush at z = 0 (mirrored on the bed so the finished surface reads right).
                  </p>
                ) : (
                  <p>
                    Raised finish: ink stands {settings.maxReliefMm} mm proud on top of the silhouette base.
                  </p>
                )}
                <p>
                  For personal keepsakes of your own ink only — please don’t share or sell prints of an artist’s design.
                </p>
              </div>
            )}

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
              {downloadLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function ReliefStlDrawer({ source, apiKey, onSave, saveLabel = 'Save as variant', onClose }) {
  if (!source) {
    return null
  }

  return (
    <ReliefStlDrawerContent
      key={source.imageUrl || 'empty-source'}
      source={source}
      apiKey={apiKey}
      onSave={onSave}
      saveLabel={saveLabel}
      onClose={onClose}
    />
  )
}
