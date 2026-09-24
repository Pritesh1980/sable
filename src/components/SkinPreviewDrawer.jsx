import { useEffect, useRef, useState } from 'react'
import { PLACEMENTS } from '../data/artists'
import LiveTryOn from './LiveTryOn'
import { isTopmostDialog } from '../hooks/useDialogFocus'
import { loadPhotoForRelief } from '../data/reliefImage'
import { generateSkinPreviewWithGemini, imageUrlToDataUrl, shrinkImageDataUrl } from '../data/skinPreview'

// Big enough for a convincing render, small enough to upload quickly.
const PHOTO_MAX_SIDE = 1536
const LABEL_CLASS = 'mb-2 block font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted'
const BUTTON_CLASS = 'rounded-xs border px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40'

// Photograph the placement, and Gemini renders the chosen concept design
// onto it as a tattoo. The result can be saved as a variant on the concept.
function SkinPreviewContent({ source, apiKey, onSave, onClose }) {
  const closeButtonRef = useRef(null)
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const pickRef = useRef(0)
  const fileInputRef = useRef(null)
  const [photo, setPhoto] = useState('')
  const [placement, setPlacement] = useState('forearm')
  // { url, placement }: the placement it was made for, not whatever the menu says now.
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const previous = document.activeElement
    closeButtonRef.current?.focus()
    function onKeyDown(event) {
      // The live camera opens over this drawer and takes its own Escape.
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopmostDialog(dialogRef.current)) return
      // Handled: the viewer underneath must not close on the same press.
      event.preventDefault()
      onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  function handlePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const pick = pickRef.current + 1
    pickRef.current = pick
    setPhoto('')
    setResult(null)
    setError('')
    loadPhotoForRelief(file, PHOTO_MAX_SIDE)
      .then((url) => { if (pickRef.current === pick) setPhoto(url) })
      .catch(() => { if (pickRef.current === pick) setError('Could not read that photo.') })
  }

  async function handleGenerate() {
    setBusy(true)
    setError('')
    try {
      const design = await shrinkImageDataUrl(await imageUrlToDataUrl(source.imageUrl), PHOTO_MAX_SIDE)
      const url = await generateSkinPreviewWithGemini(apiKey, { skinPhoto: photo, design, placement })
      setResult({ url, placement })
    } catch (generateError) {
      setError(generateError.message || 'Could not generate the preview.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setBusy(true)
    const imageUrl = await shrinkImageDataUrl(result.url)
    onSave(source.conceptId, {
      provider: 'gemini',
      title: `On skin — ${result.placement}`,
      imageUrl,
      notes: `On-skin preview of ${source.variantLabel || source.conceptLabel}.`,
    })
    onClose()
  }

  const label = source.conceptLabel || 'Concept'

  // z-[70]: above the full-screen viewers (z-[60]) these open from.
  return (
    <div className="fixed inset-0 z-[70] bg-ink-black/90 px-4 py-6 backdrop-blur-xs">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Try on skin"
        className="mx-auto flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xs border border-ink-border bg-ink-card shadow-2xl shadow-black/70"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-border px-5 py-4">
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-accent">On-skin preview</p>
            <h2 className="mt-1 font-display text-2xl text-cream">Try {label} on skin</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={`${BUTTON_CLASS} border-ink-border text-cream-muted hover:text-cream`}
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="relative min-w-0 space-y-3">
            {busy && (
              <p
                role="status"
                className="absolute inset-0 z-10 flex items-center justify-center rounded-xs bg-ink-black/70 p-6 text-center text-sm text-cream backdrop-blur-xs"
              >
                Generating… this usually takes 10–20 seconds.
              </p>
            )}
            {result ? (
              <figure className="space-y-3">
                <img
                  src={result.url}
                  alt={`${label} on skin preview`}
                  className="w-full rounded-xs border border-ink-border bg-ink-muted object-contain"
                />
                {/* Right under the result: on a phone the controls column is far below. */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={busy}
                    className={`${BUTTON_CLASS} flex-1 border-accent/45 text-accent hover:bg-accent/10`}
                  >
                    Save as variant
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={busy}
                    className={`${BUTTON_CLASS} border-ink-border text-cream-muted hover:text-cream`}
                  >
                    Try again
                  </button>
                </div>
              </figure>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <figure>
                  <img src={source.imageUrl} alt={`${label} design`} className="aspect-square w-full rounded-xs border border-ink-border bg-ink-muted object-contain" />
                  <figcaption className="mt-1 text-xs text-cream-muted">Design</figcaption>
                </figure>
                <figure>
                  {photo
                    ? <img src={photo} alt="Your placement photo" className="aspect-square w-full rounded-xs border border-ink-border bg-ink-muted object-cover" />
                    : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex aspect-square w-full items-center justify-center rounded-xs border border-dashed border-ink-border p-3 text-center text-xs text-cream-muted transition-colors hover:text-cream"
                      >
                        Add a photo of where it would go
                      </button>
                    )}
                  <figcaption className="mt-1 text-xs text-cream-muted">Placement</figcaption>
                </figure>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setLive(true)}
              className={`${BUTTON_CLASS} w-full border-accent/45 text-accent hover:bg-accent/10`}
            >
              Live camera — free, instant
            </button>
            <p className="text-xs text-cream-muted">Or render it properly with AI:</p>

            <label className={`${BUTTON_CLASS} inline-flex cursor-pointer border-ink-border text-cream-muted hover:text-cream`}>
              {photo ? 'Change photo…' : 'Choose photo…'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                aria-label="Photo of the placement"
                onChange={handlePhoto}
                className="sr-only"
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>Placement</span>
              <select
                value={placement}
                onChange={(event) => setPlacement(event.target.value)}
                className="w-full rounded-xs border border-ink-border bg-ink-muted px-3 py-2 font-body text-sm text-cream outline-hidden focus:border-cream-muted/50"
              >
                {PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            {apiKey ? (
              <p className="text-xs text-cream-muted">
                Your photo and the design are sent to Google’s Gemini image model with your key
                (about $0.04 per image). Only a result you save is kept.
              </p>
            ) : (
              <p className="rounded-xs border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
                Add a Gemini key in AI setup on the Concepts page to use this.
              </p>
            )}

            {error && (
              <p className="rounded-xs border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!apiKey || !photo || busy}
              className="w-full rounded-xs bg-accent px-4 py-3 font-body text-sm text-cream transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? 'Generating…' : 'Generate preview'}
            </button>

          </div>
        </div>
      </section>
      {live && (
        <LiveTryOn
          designUrl={source.imageUrl}
          label={label}
          onSave={(input) => onSave(source.conceptId, input)}
          onClose={() => setLive(false)}
        />
      )}
    </div>
  )
}

export default function SkinPreviewDrawer({ source, apiKey, onSave, onClose }) {
  if (!source) return null
  return <SkinPreviewContent key={source.imageUrl} source={source} apiKey={apiKey} onSave={onSave} onClose={onClose} />
}
