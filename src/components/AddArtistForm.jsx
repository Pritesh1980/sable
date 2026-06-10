import { useState } from 'react'

export default function AddArtistForm({ onAdd }) {
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    const clean = handle.replace(/^@/, '').trim()
    if (!clean) { setError('Instagram handle is required'); return }
    onAdd({ handle: clean, name: name.trim() })
    setHandle('')
    setName('')
    setError('')
  }

  return (
    <form onSubmit={submit} className="bg-ink-card border border-ink-border rounded-sm p-4 mb-8">
      <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-4">Add New Artist</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">Instagram Handle *</label>
          <input
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-mono placeholder-cream-muted/60"
            placeholder="@handle"
            value={handle}
            onChange={(e) => { setHandle(e.target.value); setError('') }}
          />
        </div>
        <div>
          <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">Display Name</label>
          <input
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60"
            placeholder="Full name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-accent text-xs font-mono mb-3">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          className="px-5 py-2 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-sm transition-colors"
        >
          Add Artist
        </button>
      </div>
    </form>
  )
}
