import { useState } from 'react'
import TagPill from './TagPill'
import { STYLE_TAGS, parseInstagramHandle } from '../data/artists'
import { ARTIST_STATUSES } from '../data/planning'

// One-step onboarding: paste a handle or Instagram URL, pick tags and a status,
// done — no hunting for the row in the maintenance table afterwards.
export default function QuickAddArtist({ artists = [], onAdd, onClose }) {
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [tags, setTags] = useState([])
  const [status, setStatus] = useState('researching')
  const [error, setError] = useState('')

  function toggleTag(tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function submit(e) {
    e.preventDefault()
    const handle = parseInstagramHandle(input)
    if (!handle) { setError('Instagram handle is required'); return }
    if (artists.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) {
      setError(`@${handle} is already in your collection`)
      return
    }
    onAdd({ handle, name: name.trim(), tags, status })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-black/95 flex items-start sm:items-center justify-center animate-fade-in overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-ink-card border border-ink-border rounded-sm p-5 m-4 mt-16 sm:mt-4 animate-slide-up"
      >
        <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-4">Add an artist</p>

        <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">
          Instagram *
        </label>
        <input
          autoFocus
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-mono placeholder-cream-muted/60 mb-3"
          placeholder="@handle or Instagram URL"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
        />

        <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">
          Display name
        </label>
        <input
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 mb-4"
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Style tags</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STYLE_TAGS.map((tag) => (
            <TagPill key={tag} tag={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)} small />
          ))}
        </div>

        <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Shortlist status</p>
        <select
          className="bg-ink-muted border border-ink-border rounded-sm px-3 py-1.5 text-sm text-cream outline-none focus:border-cream-muted/40 font-body mb-4"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {ARTIST_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {error && <p className="text-accent text-xs font-mono mb-3">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-cream-muted hover:text-cream text-sm font-body transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-sm transition-colors"
          >
            Add Artist
          </button>
        </div>
      </form>
    </div>
  )
}
