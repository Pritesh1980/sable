import { useId } from 'react'
import useDialogFocus, { useEscapeToClose } from '../hooks/useDialogFocus'
import GeneratedArtworkNotice from './GeneratedArtworkNotice'

function CropControl({ label, value, sourceIndex, zoom = false, onChange }) {
  const id = useId()
  return <div>
    <div className="flex items-baseline justify-between gap-3 text-sm text-cream-muted">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{zoom ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`}</output>
    </div>
    <input id={id} type="range" aria-label={`${label} reference ${sourceIndex + 1}`}
      min={zoom ? 1 : 0} max={zoom ? 3 : 1} step={zoom ? 0.05 : 0.01}
      value={value} onChange={(event) => onChange(Number(event.target.value))}
      className="w-full min-h-11 accent-cream" />
  </div>
}

export default function BriefCardPreview({
  prepared, previewUrl, controlsPhotos, images, preparing, error,
  onRefresh, onCrop, onClose, onShare, shareState, shareNote,
}) {
  const focusRef = useDialogFocus(true)
  const escapeRef = useEscapeToClose(onClose)
  const titleId = useId()
  const unavailable = prepared?.unavailableCount || 0
  return <div ref={(node) => { focusRef.current = node; escapeRef.current = node }}
    role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
    className="fixed inset-0 z-[80] overflow-y-auto bg-ink-black text-cream outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cream-muted">
    <header className="sticky top-0 z-10 border-b border-ink-border bg-ink-black px-5 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4">
        <h2 id={titleId} className="font-display text-xl">Preview card</h2>
        <button onClick={onClose} aria-label="Close card preview"
          className="min-h-11 min-w-11 text-sm text-cream-muted hover:text-cream">Close</button>
      </div>
    </header>
    <div className="mx-auto grid h-[calc(100dvh_-_69px)] max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden px-5 py-4 lg:h-auto lg:grid-cols-2 lg:grid-rows-none lg:gap-6 lg:overflow-visible lg:py-5">
      <div className="self-start lg:sticky lg:top-24">
        <div className="flex h-[28dvh] items-center justify-center border border-ink-border bg-ink-card lg:aspect-[4/5] lg:h-auto" aria-busy={preparing}>
          {prepared && previewUrl
            ? <img src={previewUrl} alt="Brief card preview" className="h-full w-full object-contain" />
            : <p className="px-5 text-center text-sm text-cream-muted">{error || 'Updating card…'}</p>}
        </div>
        <p className="mt-2 text-xs text-cream-muted">1080 × 1350 PNG. Changes stay in this idea’s draft until you save.</p>
        <GeneratedArtworkNotice images={images} className="mt-2" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={onShare}
            disabled={!prepared || shareState !== 'idle'}
            className="min-h-11 border border-cream-muted px-4 text-sm disabled:opacity-40">
            {shareState === 'sharing' ? 'Sharing…' : shareState === 'download' ? 'Download requested' : 'Share this card'}
          </button>
          <button onClick={onRefresh} disabled={preparing} className="min-h-11 px-2 text-sm text-cream-muted disabled:opacity-40">Refresh preview</button>
        </div>
        <p role="status" className="mt-2 text-sm text-cream-muted">
          {preparing ? 'Updating card…' : shareState === 'download' ? 'PNG download requested.' : shareNote === prepared?.skippedNotice ? '' : shareNote}
        </p>
        {prepared?.skippedNotice && <p className="mt-2 text-sm text-cream-muted">{prepared.skippedNotice}</p>}
        {unavailable > 0 && <p className="mt-2 text-sm text-cream-muted">{unavailable} reference{unavailable === 1 ? '' : 's'} unavailable. Refresh to retry.</p>}
      </div>
      <div className="min-h-0 space-y-5 overflow-y-auto pb-5 lg:overflow-visible lg:pb-0">
        <div>
          <h3 className="font-display text-xl">Frame your references</h3>
          <p className="mt-2 text-sm leading-relaxed text-cream-muted">These controls change only the card’s crop. Your original photos and their notes stay untouched.</p>
        </div>
        {controlsPhotos.map(({ sourceIndex }, cardIndex) => {
          const image = images[sourceIndex]
          if (!image) return null
          const crop = image.briefCrop || { x: 0.5, y: 0.5, zoom: 1 }
          const update = (axis, value) => onCrop(sourceIndex, { ...crop, [axis]: value })
          return <fieldset key={sourceIndex} className="space-y-2 border-t border-ink-border pt-4">
            <legend className="pr-3 text-sm text-cream">Reference {sourceIndex + 1} · Card {cardIndex + 1}</legend>
            {image.note && <p className="text-sm text-cream-muted">{image.note}</p>}
            <CropControl label="Horizontal" value={crop.x} sourceIndex={sourceIndex} onChange={(value) => update('x', value)} />
            <CropControl label="Vertical" value={crop.y} sourceIndex={sourceIndex} onChange={(value) => update('y', value)} />
            <CropControl label="Zoom" value={crop.zoom} sourceIndex={sourceIndex} zoom onChange={(value) => update('zoom', value)} />
            <button onClick={() => onCrop(sourceIndex, null)} disabled={!image.briefCrop}
              aria-label={`Reset crop reference ${sourceIndex + 1}`}
              className="min-h-11 px-2 text-sm text-cream-muted hover:text-cream disabled:opacity-40">Reset crop</button>
          </fieldset>
        })}
        {prepared && !prepared.photos.length && <p className="text-sm text-cream-muted">This is a text-only card. Add an available local reference to adjust its crop.</p>}
      </div>
    </div>
  </div>
}
