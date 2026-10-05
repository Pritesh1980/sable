import { useEffect, useRef, useState } from 'react'
import { Copy, Download, LoaderCircle, RefreshCw, Sparkles, Upload, X } from 'lucide-react'
import useDialogFocus, { isTopmostDialog } from '../hooks/useDialogFocus'
import { compileRefinementPrompt, LIMITS } from '../../shared/imageJobs'
import { RESULT_VARIANT_PROVIDERS } from '../data/conceptVariants'

const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xs border border-v2-hairline px-4 text-sm text-v2-cream hover:border-v2-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-cream disabled:opacity-40 disabled:cursor-not-allowed'
const INPUT = 'w-full min-h-11 rounded-xs border border-v2-hairline bg-v2-ink px-3 py-2 text-sm text-v2-cream focus-visible:outline-2 focus-visible:outline-v2-cream'
const STATUS = { accepted: 'Variation queued', dispatching: 'Starting variation', running: 'Creating variation',
  succeeded: 'Variation ready to save', failed: 'Variation failed', outcome_unknown: 'Provider outcome unknown',
  expired: 'Variation expired', cancelled: 'Variation discarded' }
const ERRORS = {
  acceptance_unknown: 'Acceptance is unknown. Check recovery or retry the same request; do not start another paid variation.',
  request_expired: 'This request has expired. A new paid request needs your explicit confirmation.',
  key_clock_skew: 'The request clock differs from the service. Check recovery before retrying the same request.',
  source_unreadable: 'This image could not be read. Select a PNG, JPEG or WebP file.',
  invalid_source: 'Select a PNG, JPEG or WebP source file.',
  source_too_large: 'Use an image up to 8 MiB and 16 megapixels.',
  journal_unavailable: 'Recovery state could not be saved on this device. Check recovery before retrying, then free some space.',
  storage_full: 'Device storage is full. The service result remains recoverable; free some space before saving it.',
  commit_conflict: 'The destination changed. Check recovery and choose where to save the variation.',
  destination_required: 'Choose an existing concept to save this recovered variation.',
  commit_unavailable: 'Checked image storage is unavailable in this browser. Use the manual actions instead.',
  storage_warning_required: 'Acknowledge the device-storage risk before requesting a paid image.',
  relay_disabled: 'Paid refinement is unavailable. Manual actions are still available.',
  relay_unavailable: 'The service is unavailable. Your draft and recoverable results are still here.',
  result_expired: 'The service copy is no longer available. Any already-saved variation remains in your library.',
  confirmation_required: 'The previous request may have been billed. A new paid request needs explicit confirmation.',
  draft_changed: 'The draft changed before upload. Review it and try again.',
  active_quota_exceeded: 'A variation is already in progress. Check recovery before starting another.',
  daily_quota_exceeded: 'The daily variation limit has been reached.',
}

function SavedRequestInput({ pending }) {
  const imageRef = useRef(null)
  useEffect(() => {
    if (!pending.source || !imageRef.current) return
    const image = imageRef.current
    const url = URL.createObjectURL(pending.source)
    image.src = url
    return () => { image.removeAttribute('src'); URL.revokeObjectURL(url) }
  }, [pending.source])
  return <section aria-label="Saved request input" className="border-t border-v2-hairline mt-5 pt-4 space-y-3">
    <h3 className="text-sm">Saved request input</h3>
    <img ref={imageRef} alt="Saved request source" className="w-full max-h-64 object-contain bg-v2-ink" />
    <pre aria-label="Saved request prompt" className="font-v2-ui text-sm text-v2-muted whitespace-pre-wrap break-words">{pending.request.prompt}</pre>
  </section>
}

export default function RefinementComposer({ state, capabilities, persistence, onDraftChange, onSubmit,
  onCopyPrompt, onExportSource, onImportVariation, onSelectSource, onRecover, onClose,
  destinations = [], comparison, backupStatus, message }) {
  const dialogRef = useDialogFocus(true)
  const [consent, setConsent] = useState(false)
  const [storageAccepted, setStorageAccepted] = useState(false)
  const [provider, setProvider] = useState('')
  const [file, setFile] = useState(null)
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState('')
  const [newPaidConfirmed, setNewPaidConfirmed] = useState(false)
  const [targets, setTargets] = useState({})
  const draft = state.draft
  const sourceUrl = state.source?.previewUrl
  const prompt = compileRefinementPrompt(draft)
  const validDraft = typeof draft.change === 'string' && Boolean(draft.change.trim())
    && draft.change.length + draft.keep.length <= LIMITS.maxInstructionChars
  const busy = ['preparing', 'submitting', 'importing'].includes(state.phase)
  const unresolved = (state.pending && !state.pending.accepted)
    || ['accepted', 'dispatching', 'running', 'outcome_unknown'].includes(state.job?.state)
  const storageRisk = persistence !== 'granted'
  const expired = state.error?.code === 'request_expired'

  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handle = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopmostDialog(dialogRef.current)) return
      event.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', handle)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handle) }
  }, [onClose, dialogRef])

  function changeDraft(fields) { setConsent(false); onDraftChange?.(fields) }
  async function importFile() {
    setManualBusy(true); setManualError('')
    try { await onImportVariation?.(file, provider); setFile(null) }
    catch { setManualError('Could not import this image. Choose a readable PNG, JPEG or WebP file.') }
    finally { setManualBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/75">
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label="Refine image" tabIndex={-1}
        className="absolute inset-y-0 right-0 w-full max-w-3xl overflow-y-auto bg-v2-surface text-v2-cream font-v2-ui border-l border-v2-hairline p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3 border-b border-v2-hairline pb-3 mb-5">
          <h2 className="font-v2-display text-2xl">Refine image</h2>
          <button type="button" aria-label="Close refinement" title="Close refinement" onClick={onClose}
            className={`${BUTTON} w-11 shrink-0 px-0`}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            {sourceUrl ? <img src={sourceUrl} alt="Prepared source image" className="w-full aspect-[4/5] object-contain bg-v2-ink" />
              : <div className="aspect-[4/5] flex items-center justify-center bg-v2-ink p-5 text-sm text-v2-muted">
                {state.phase === 'preparing' ? <LoaderCircle className="animate-spin" aria-label="Preparing image" /> : 'Source image unavailable'}
              </div>}
            <label className="block mt-3 text-sm text-v2-muted">Source image file
              <input type="file" aria-label="Source image file" accept="image/png,image/jpeg,image/webp"
                disabled={busy} className={`${INPUT} mt-2 file:border-0 file:bg-transparent file:text-v2-cream file:mr-3`}
                onChange={event => { const selected = event.target.files?.[0]; if (selected) { setConsent(false); onSelectSource?.(selected) } }} />
            </label>
          </div>
          <div className="min-w-0 space-y-4">
            <label className="block text-sm">Change
              <textarea aria-label="Change" value={draft.change} maxLength={LIMITS.maxInstructionChars}
                onChange={event => changeDraft({ change: event.target.value })} className={`${INPUT} mt-2 min-h-24 resize-y`} />
            </label>
            <label className="block text-sm">Keep
              <textarea aria-label="Keep" value={draft.keep} maxLength={LIMITS.maxInstructionChars}
                onChange={event => changeDraft({ keep: event.target.value })} className={`${INPUT} mt-2 min-h-20 resize-y`} />
            </label>
            <fieldset>
              <legend className="text-sm mb-2">Palette</legend>
              <div className="flex gap-2">
                {[['black', 'Black ink'], ['colour', 'Colour']].map(([value, label]) => (
                  <label key={value} className="flex min-h-11 items-center gap-2 border border-v2-hairline rounded-xs px-3 text-sm">
                    <input type="radio" name="refinement-palette" value={value} checked={draft.palette === value}
                      onChange={() => changeDraft({ palette: value })} className="accent-v2-accent focus-visible:outline-2" />{label}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-v2-muted">{draft.change.length + draft.keep.length} / 4000 characters</p>
          </div>
        </div>
        <section className="border-t border-v2-hairline mt-5 pt-4">
          <h3 className="text-sm mb-2">Outgoing prompt</h3>
          <pre aria-label="Outgoing prompt" className="font-v2-ui text-sm text-v2-muted whitespace-pre-wrap break-words leading-relaxed">{prompt}</pre>
        </section>
        {capabilities?.enabled && (
          <section className="border-t border-v2-hairline mt-5 pt-4 space-y-3 text-sm">
            <p>One paid OpenAI image: {capabilities.profile?.model}, {capabilities.profile?.size}, {capabilities.profile?.quality}.</p>
            <p className="text-v2-muted">Only this prepared image and prompt are sent. Boards, body photos, artist portfolios and unrelated library data are not attached.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-v2-muted">
              <a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 underline focus-visible:outline-2">OpenAI privacy policy</a>
              <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer" className="inline-flex items-center min-h-11 underline focus-visible:outline-2">OpenAI API data controls</a>
            </div>
            <label className="flex items-start gap-3 min-h-11 py-2"><input type="checkbox" checked={consent}
              onChange={event => setConsent(event.target.checked)} className="mt-1 accent-v2-accent" />
              <span>Send this image and prompt to OpenAI for one paid variation.</span></label>
            {storageRisk && <label className="flex items-start gap-3 min-h-11 py-2"><input type="checkbox" checked={storageAccepted}
              onChange={event => setStorageAccepted(event.target.checked)} className="mt-1 accent-v2-accent" />
              <span>I understand browser storage may be cleared. A saved image is not an off-device backup.</span></label>}
            <button type="button" onClick={() => onSubmit?.({ storageWarningAccepted: storageAccepted })}
              disabled={!sourceUrl || !validDraft || !consent || (storageRisk && !storageAccepted) || busy || unresolved}
              className={`${BUTTON} bg-v2-accent border-v2-accent w-full`}>
              <Sparkles size={18} aria-hidden="true" />Generate one variation
            </button>
          </section>
        )}
        {state.pending && !state.pending.accepted && <SavedRequestInput pending={state.pending} />}
        {(state.job || state.error || state.pending) && <section className="border-t border-v2-hairline mt-5 pt-4 space-y-3 text-sm">
          {state.job && <p role="status">{state.phase === 'saved' ? 'Variation saved' : STATUS[state.job.state]}</p>}
          {state.error && <p role="alert" className="text-v2-cream">{ERRORS[state.error.code] || 'The variation could not be completed. Check recovery or use the manual actions.'}</p>}
          {state.pending && !state.pending.accepted && <button type="button" disabled={busy || (expired && !newPaidConfirmed)}
            onClick={() => onRecover?.({ kind: 'retry', confirmed: newPaidConfirmed })} className={BUTTON}>
            <RefreshCw size={18} aria-hidden="true" />{expired ? 'Start a confirmed new request' : 'Retry same request'}</button>}
          {(expired || state.job?.state === 'outcome_unknown') && <label className="flex items-start gap-3 min-h-11 py-2">
            <input type="checkbox" checked={newPaidConfirmed} onChange={event => setNewPaidConfirmed(event.target.checked)} className="mt-1" />
            <span>Confirm a new paid request. The previous request may have been billed.</span></label>}
          {state.job?.state === 'outcome_unknown' && <button type="button" disabled={!newPaidConfirmed || busy}
            onClick={() => onRecover?.({ kind: 'retry', confirmed: true })} className={BUTTON}>Start a confirmed new request</button>}
          <button type="button" onClick={() => onRecover?.({ kind: 'reconcile' })} className={BUTTON}>
            <RefreshCw size={18} aria-hidden="true" />Check recovery</button>
        </section>}
        {state.recoverableJobs?.length > 0 && <section aria-label="Recoverable variations" className="border-t border-v2-hairline mt-5 pt-4 space-y-4">
          {state.recoverableJobs.map(job => <div key={job.id} className="space-y-2 text-sm">
            <p>{STATUS[job.state]}</p>
            {job.state === 'succeeded' && <>
              <label className="block">Save to concept<select aria-label={`Destination for ${job.id}`} value={targets[job.id] || job.destination?.conceptId || ''}
                onChange={event => setTargets(current => ({ ...current, [job.id]: event.target.value }))} className={`${INPUT} mt-2`}>
                <option value="">Choose a concept</option>
                {destinations.map(row => <option key={row.id} value={row.id}>{row.prompt || row.id}</option>)}
              </select></label>
              <button type="button" disabled={busy || !(targets[job.id] || job.destination?.conceptId)}
                onClick={() => onRecover?.({ kind: 'import', jobId: job.id, conceptId: targets[job.id] || job.destination?.conceptId })} className={BUTTON}>
                <Download size={18} aria-hidden="true" />Save recovered variation</button>
            </>}
            <button type="button" disabled={busy} onClick={() => onRecover?.({ kind: 'discard', jobId: job.id })} className={BUTTON}>Discard service copy</button>
          </div>)}
        </section>}
        {comparison}
        <section className="border-t border-v2-hairline mt-5 pt-4 space-y-3 text-sm">
          <p className="text-v2-muted">Copying the prompt does not attach the image. Export it separately.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!validDraft} onClick={() => onCopyPrompt?.(prompt)} className={BUTTON}>
              <Copy size={18} aria-hidden="true" />Copy refinement prompt</button>
            <button type="button" disabled={!state.source?.blob} onClick={onExportSource} className={BUTTON}>
              <Download size={18} aria-hidden="true" />Export source image</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 pt-2">
            <label className="block">Variation provider<select aria-label="Variation provider" value={provider}
              onChange={event => setProvider(event.target.value)} className={`${INPUT} mt-2`}>
              <option value="">Choose provider attribution</option>
              {RESULT_VARIANT_PROVIDERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label className="block">Variation image<input type="file" aria-label="Variation image" accept="image/png,image/jpeg,image/webp"
              onChange={event => setFile(event.target.files?.[0] || null)} className={`${INPUT} mt-2 file:border-0 file:bg-transparent file:text-v2-cream file:mr-3`} /></label>
          </div>
          <button type="button" disabled={!file || !provider || !validDraft || manualBusy} onClick={importFile} className={BUTTON}>
            <Upload size={18} aria-hidden="true" />Import variation</button>
          {manualError && <p role="alert">{manualError}</p>}
          {message && <p role="status" className="text-v2-muted">{message}</p>}
        </section>
        {backupStatus}
      </aside>
    </div>
  )
}
