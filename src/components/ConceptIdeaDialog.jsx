import { useId, useState } from 'react'
import useDialogFocus, { useEscapeToClose } from '../hooks/useDialogFocus'
import { conceptIdeaNote } from '../data/conceptIdeas'
import RefImage from './RefImage'

const button = 'min-h-11 min-w-11 rounded-xs border border-ink-border px-3 text-sm text-cream hover:border-cream-muted focus-visible:outline-2 focus-visible:outline-cream disabled:opacity-40'
const input = 'min-h-11 w-full rounded-xs border border-ink-border bg-ink-muted px-3 text-sm text-cream focus-visible:outline-2 focus-visible:outline-cream'

export default function ConceptIdeaDialog({ source, ideas, busy, error, onClose, onSubmit }) {
  const [mode, setMode] = useState('new')
  const [query, setQuery] = useState('')
  const [ideaId, setIdeaId] = useState('')
  const [note, setNote] = useState(() => conceptIdeaNote(source?.variant))
  const titleId = useId()
  const focusRef = useDialogFocus(true)
  const escapeRef = useEscapeToClose(onClose)
  const visibleIdeas = ideas.filter(idea => (idea.title || '').toLowerCase().includes(query.trim().toLowerCase()))
  const validTarget = mode === 'new' || ideas.some(idea => idea.id === ideaId)
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-black/80 p-3 sm:items-center">
    <section ref={node => { focusRef.current = node; escapeRef.current = node }} tabIndex={-1}
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xs border border-ink-border bg-ink-black font-v2-ui text-cream outline-hidden focus-visible:ring-2 focus-visible:ring-cream">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-border px-5 py-3">
        <h2 id={titleId} className="font-v2-display text-2xl">Use in idea</h2>
        <button type="button" onClick={onClose} className={button}>Cancel</button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-4">
          {source && <RefImage src={source.imageUrl} alt="Selected concept image" className="h-20 w-20 shrink-0 object-cover" />}
          <p className="min-w-0 break-words text-sm text-cream-muted">{source?.variant?.title || source?.concept?.prompt || 'Selected image unavailable'}</p>
        </div>
        <fieldset disabled={busy} className="space-y-4">
          <legend className="sr-only">Destination and reference note</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')} className={button}>New idea</button>
            <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')} className={button}>Add to existing idea</button>
          </div>
          {mode === 'new' ? <p className="text-sm leading-relaxed text-cream-muted">Opens a prefilled draft. Review it and tap Save to keep it.</p>
            : <div className="space-y-3">
              <label className="block space-y-2 text-sm">Search ideas
                <input type="search" value={query} onChange={event => setQuery(event.target.value)} className={input} />
              </label>
              {!ideas.length ? <p className="text-sm text-cream-muted">No saved ideas yet. Choose New idea to start one.</p>
                : <div className="max-h-48 space-y-2 overflow-y-auto" aria-label="Ideas">
                  {visibleIdeas.map(idea => <button key={idea.id} type="button" aria-pressed={ideaId === idea.id}
                    onClick={() => setIdeaId(idea.id)} className={`${button} w-full break-words text-left aria-pressed:border-cream`}>
                    {idea.title || 'Untitled idea'}
                  </button>)}
                  {!visibleIdeas.length && <p className="text-sm text-cream-muted">No ideas match that title.</p>}
                </div>}
              <p className="text-sm text-cream-muted">Adds one reference now, keeping the idea’s other fields unchanged.</p>
            </div>}
          <label className="block space-y-2 text-sm">Reference note
            <input value={note} onChange={event => setNote(event.target.value)} className={input} />
          </label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      </div>
      <footer className="shrink-0 border-t border-ink-border p-4">
        <button type="button" disabled={busy || !validTarget || !source}
          onClick={() => onSubmit(mode === 'new' ? { note } : { ideaId, note })}
          className={`${button} w-full border-cream-muted`}>
          {busy ? 'Copying image…' : mode === 'new' ? 'Create idea' : 'Add image to idea'}
        </button>
      </footer>
    </section>
  </div>
}
