import { useState } from 'react'
import { TIERS } from '../data/artists'

function distance(mk, conv) {
  // Rough straight-line estimates from Milton Keynes
  // Could be replaced with real distances
  return conv.distanceKm ? `${conv.distanceKm} km` : '—'
}

function ConventionCard({ convention, onOpen, artists }) {
  const attending = artists.filter((a) => convention.artistIds?.includes(a.id))

  return (
    <div
      className="bg-ink-card border border-ink-border rounded-sm p-4 cursor-pointer hover:border-cream-muted/50 transition-colors"
      onClick={() => onOpen(convention)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display text-cream text-lg leading-tight">{convention.name}</h3>
          <p className="text-cream-muted text-xs font-mono mt-0.5">{convention.location}</p>
        </div>
        {convention.distanceKm && (
          <span className="text-[10px] font-mono text-cream-muted/90 bg-ink-muted px-2 py-1 rounded-sm whitespace-nowrap ml-3">
            {convention.distanceKm} km
          </span>
        )}
      </div>
      {convention.dates && (
        <p className="text-cream-muted/90 text-xs font-mono mb-3">{convention.dates}</p>
      )}
      {attending.length > 0 && (
        <div>
          <p className="text-[9px] font-mono text-accent tracking-widest uppercase mb-1.5">Artists attending</p>
          <div className="flex flex-wrap gap-1">
            {attending.map((a) => (
              <span key={a.id} className="text-[10px] font-mono text-cream-muted bg-ink-muted px-2 py-0.5 rounded-sm">
                {a.name || `@${a.handle}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ConventionModal({ convention, onClose, onSave, onDelete, artists }) {
  const [draft, setDraft] = useState({ ...convention })
  const isNew = !convention.id

  function toggleArtist(id) {
    setDraft((d) => ({
      ...d,
      artistIds: d.artistIds?.includes(id)
        ? d.artistIds.filter((a) => a !== id)
        : [...(d.artistIds || []), id],
    }))
  }

  function save() {
    if (!draft.name.trim()) return
    onSave({ ...draft, id: draft.id || Date.now().toString() })
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-black/95 flex flex-col animate-fade-in overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-safe-top pt-6 pb-4 border-b border-ink-border sticky top-0 bg-ink-black z-10">
        <button onClick={onClose} className="text-cream-muted hover:text-cream text-sm tracking-widest uppercase">
          ← Back
        </button>
        <div className="flex gap-4">
          {!isNew && (
            <button onClick={() => { onDelete(convention.id); onClose() }} className="text-accent/60 hover:text-accent text-sm transition-colors">
              Delete
            </button>
          )}
          <button onClick={save} className="text-accent hover:text-accent-hover text-sm font-body transition-colors">
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 max-w-screen-sm mx-auto w-full space-y-6">
        <div>
          <input
            autoFocus
            className="bg-transparent border-b border-ink-border text-cream font-display text-2xl w-full outline-none pb-1 placeholder-cream-muted/60"
            placeholder="Convention name…"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-2">Location</p>
            <input
              className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60"
              placeholder="City, Country"
              value={draft.location || ''}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
            />
          </div>
          <div>
            <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-2">Distance (km)</p>
            <input
              type="number"
              className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60"
              placeholder="from MK"
              value={draft.distanceKm || ''}
              onChange={(e) => setDraft((d) => ({ ...d, distanceKm: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-2">Dates</p>
          <input
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60"
            placeholder="e.g. 14–16 March 2026"
            value={draft.dates || ''}
            onChange={(e) => setDraft((d) => ({ ...d, dates: e.target.value }))}
          />
        </div>

        <div>
          <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-3">Artists Attending</p>
          <div className="space-y-1">
            {artists.filter((a) => a.tier !== 'studio').map((a) => (
              <button
                key={a.id}
                onClick={() => toggleArtist(a.id)}
                className={`w-full text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border ${
                  draft.artistIds?.includes(a.id)
                    ? 'border-accent/40 bg-accent/5 text-cream'
                    : 'border-ink-border text-cream-muted hover:border-cream-muted/50'
                }`}
              >
                {a.name || `@${a.handle}`}
                <span className="text-cream-muted/90 ml-2 text-xs font-mono">
                  {a.tier === TIERS.FAVOURITE ? '★' : '◇'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const BLANK_CONVENTION = { name: '', location: '', dates: '', distanceKm: '', artistIds: [] }

export default function Conventions({ conventions, setConventions, artists }) {
  const [modal, setModal] = useState(null)

  function save(convention) {
    setConventions((prev) => {
      const exists = prev.find((c) => c.id === convention.id)
      return exists ? prev.map((c) => (c.id === convention.id ? convention : c)) : [...prev, convention]
    })
    setModal(null)
  }

  function del(id) {
    setConventions((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] text-accent tracking-[0.3em] uppercase mb-1">Tattoo</p>
          <h1 className="font-display text-3xl text-cream">Convention Radar</h1>
        </div>
        <button
          onClick={() => setModal(BLANK_CONVENTION)}
          className="w-10 h-10 rounded-full border border-ink-border text-cream-muted hover:text-cream hover:border-cream-muted/50 transition-colors flex items-center justify-center text-xl"
        >
          +
        </button>
      </div>

      <p className="text-[10px] font-mono text-cream-muted/90 tracking-widest mb-6">Distances from Milton Keynes</p>

      {conventions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-4 opacity-10">◎</span>
          <p className="text-cream-muted/90 font-body text-sm">No conventions yet.</p>
          <p className="text-cream-muted/90 font-body text-xs mt-1">Tap + to add one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conventions.map((c) => (
            <ConventionCard key={c.id} convention={c} onOpen={setModal} artists={artists} />
          ))}
        </div>
      )}

      {modal && (
        <ConventionModal
          convention={modal}
          onClose={() => setModal(null)}
          onSave={save}
          onDelete={del}
          artists={artists}
        />
      )}
    </div>
  )
}
