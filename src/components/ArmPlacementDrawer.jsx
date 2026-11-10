import { useEffect, useRef, useState } from 'react'
import ArmPlacementPanel from './ArmPlacementPanel'
import useDialogFocus, { isTopmostDialog } from '../hooks/useDialogFocus'
import useImageBytes from '../hooks/useImageBytes'
import { blobToDataUrl } from '../data/imageStaging'
import { shrinkImageDataUrl } from '../data/skinPreview'
import { snapshotVariant } from '../data/placement3d'

// A saved concept result on the 3D upper arm at true size (#195), opened from
// the result's "View on arm in 3D" action. The picture it saves becomes a
// variant on the same concept, the way a try-on snapshot does.
function ArmPlacementContent({ source, onSave, onClose }) {
  // Focus moves in, Tab stays in, and focus goes back to the opener on close.
  const dialogRef = useDialogFocus(true)
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  // `source.imageUrl` is a stored ref (a blob key or a static path). WebGL
  // reads the texture's pixels, which a cross-origin signed URL does not
  // allow, so the view is only ever handed a same-origin copy (#114).
  const { src, status } = useImageBytes(source.imageUrl)
  const [canSave, setCanSave] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopmostDialog(dialogRef.current)) return
      // Handled: the viewer underneath must not close on the same press.
      event.preventDefault()
      onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dialogRef])

  const label = source.variantLabel || source.conceptLabel || 'Concept'

  async function handleSave() {
    setError('')
    // Taken now, in this tap: the view may move on while the bytes are packed.
    const shot = panelRef.current?.snapshot()
    if (!shot) {
      setError('Could not save a picture of this view.')
      return
    }
    setSaving(true)
    try {
      const png = await blobToDataUrl(new Blob([shot.bytes], { type: 'image/png' }))
      // Downsized like every try-on result; the page stages it before the
      // key reaches state (Concepts.addVariant).
      const imageUrl = await shrinkImageDataUrl(png)
      onSave(source.conceptId, { ...snapshotVariant(label, shot.placement), imageUrl })
      onClose()
    } catch {
      setError('Could not save a picture of this view.')
      setSaving(false)
    }
  }

  // z-[70]: above the full-screen viewers (z-[60]) this opens from.
  return (
    <div className="fixed inset-0 z-[70] bg-v2-ink/90 backdrop-blur-xs sm:px-4 sm:py-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="On the arm in 3D"
        tabIndex={-1}
        className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden bg-v2-ink text-v2-cream outline-hidden sm:rounded-xs sm:border sm:border-v2-hairline"
      >
        <header className="flex items-start justify-between gap-4 border-b border-v2-hairline px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="font-v2-ui text-xs uppercase tracking-[0.2em] text-v2-accent">On the arm in 3D</p>
            <h2 className="truncate font-v2-display text-2xl">{label}</h2>
            <p className="font-v2-ui text-xs text-v2-muted">Drag to turn the arm. Pinch to resize the design.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-xs border border-v2-hairline px-4 font-v2-ui text-sm text-v2-cream hover:border-v2-accent"
          >
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          {status === 'ready' && (
            <ArmPlacementPanel
              ref={panelRef}
              imageSrc={src}
              onReadyChange={setCanSave}
              className="flex flex-1 flex-col"
              stageClassName="min-h-[240px] flex-1"
            />
          )}
          {status === 'loading' && (
            <p className="grid flex-1 place-items-center font-v2-ui text-sm text-v2-muted" aria-busy="true">
              Loading the design…
            </p>
          )}
          {status !== 'ready' && status !== 'loading' && (
            <p role="alert" className="grid flex-1 place-items-center px-6 text-center font-v2-ui text-sm text-v2-muted">
              This image isn’t on this device, so it can’t be shown on the arm. Open it again when you’re back online.
            </p>
          )}
        </div>

        <footer className="border-t border-v2-hairline px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="mb-2 font-v2-ui text-sm text-v2-accent">{error}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={status !== 'ready' || !canSave || saving}
            className="min-h-11 w-full rounded-xs bg-v2-cream px-4 font-v2-ui text-sm font-semibold text-v2-ink transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save as variant'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export default function ArmPlacementDrawer({ source, onSave, onClose }) {
  if (!source) return null
  return <ArmPlacementContent key={source.imageUrl} source={source} onSave={onSave} onClose={onClose} />
}
