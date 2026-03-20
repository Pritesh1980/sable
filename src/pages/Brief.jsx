import { useState } from 'react'
import TagPill from '../components/TagPill'
import { STYLE_TAGS, PLACEMENTS } from '../data/artists'
import { TIERS } from '../data/artists'

function IdeaCard({ idea, onOpen }) {
  return (
    <div
      className="bg-ink-card border border-ink-border rounded-sm p-4 cursor-pointer hover:border-cream-muted/50 transition-colors animate-slide-up"
      onClick={() => onOpen(idea)}
    >
      <h3 className="font-display text-cream text-lg mb-1">{idea.title}</h3>
      {idea.description && (
        <p className="text-cream-muted text-sm font-body leading-relaxed line-clamp-2 mb-3">{idea.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {idea.tags.map((t) => <TagPill key={t} tag={t} active small />)}
        {idea.placement && <TagPill tag={idea.placement} small />}
      </div>
      {idea.linkedArtists?.length > 0 && (
        <p className="text-cream-muted/90 text-[12px] font-mono mt-3 tracking-widest">
          {idea.linkedArtists.length} artist{idea.linkedArtists.length !== 1 ? 's' : ''} linked
        </p>
      )}
    </div>
  )
}

function IdeaModal({ idea, onClose, onSave, onDelete, artists }) {
  const [draft, setDraft] = useState({ ...idea })
  const [newImage, setNewImage] = useState('')
  const isNew = !idea.id

  function toggleTag(tag) {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }))
  }

  function toggleArtist(id) {
    setDraft((d) => ({
      ...d,
      linkedArtists: d.linkedArtists?.includes(id)
        ? d.linkedArtists.filter((a) => a !== id)
        : [...(d.linkedArtists || []), id],
    }))
  }

  function addImage() {
    const url = newImage.trim()
    if (url) {
      setDraft((d) => ({ ...d, images: [...(d.images || []), url] }))
    }
    setNewImage('')
  }

  function save() {
    if (!draft.title.trim()) return
    onSave({ ...draft, id: draft.id || Date.now().toString() })
  }

  const artistOptions = artists.filter((a) => a.tier !== 'studio')

  return (
    <div className="fixed inset-0 z-50 bg-ink-black/95 flex flex-col animate-fade-in overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-safe-top pt-6 pb-4 border-b border-ink-border sticky top-0 bg-ink-black z-10">
        <button onClick={onClose} className="text-cream-muted hover:text-cream text-sm tracking-widest uppercase">
          ← Back
        </button>
        <div className="flex gap-4">
          {!isNew && (
            <button onClick={() => { onDelete(idea.id); onClose() }} className="text-accent/60 hover:text-accent text-sm transition-colors">
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
            placeholder="Idea title…"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </div>

        <div>
          <p className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">Description</p>
          <textarea
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
            rows={4}
            placeholder="Describe the concept, mood, imagery…"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </div>

        <div>
          <p className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">Style Tags</p>
          <div className="flex flex-wrap gap-2">
            {STYLE_TAGS.map((tag) => (
              <TagPill key={tag} tag={tag} active={draft.tags.includes(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">Body Placement</p>
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map((p) => (
              <TagPill
                key={p}
                tag={p}
                active={draft.placement === p}
                onClick={() => setDraft((d) => ({ ...d, placement: d.placement === p ? '' : p }))}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">Reference Images</p>
          {draft.images?.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {draft.images.map((url) => (
                <div key={url} className="relative aspect-square bg-ink-muted rounded-sm overflow-hidden group">
                  <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  <button
                    onClick={() => setDraft((d) => ({ ...d, images: d.images.filter((i) => i !== url) }))}
                    className="absolute top-1 right-1 w-6 h-6 bg-ink-dark/80 text-accent rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/60"
              placeholder="Paste image URL…"
              value={newImage}
              onChange={(e) => setNewImage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addImage()}
            />
            <button onClick={addImage} className="px-4 py-2 bg-ink-muted border border-ink-border rounded-sm text-sm text-cream hover:border-cream-muted/50 transition-colors">
              Add
            </button>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">Linked Artists</p>
          <div className="space-y-1">
            {artistOptions.map((a) => (
              <button
                key={a.id}
                onClick={() => toggleArtist(a.id)}
                className={`w-full text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border ${
                  draft.linkedArtists?.includes(a.id)
                    ? 'border-accent/40 bg-accent/5 text-cream'
                    : 'border-ink-border text-cream-muted hover:border-cream-muted/50'
                }`}
              >
                {a.name || `@${a.handle}`}
                <span className="text-cream-muted/90 ml-2 text-xs font-mono">{a.tier === TIERS.FAVOURITE ? '★' : '◇'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const BLANK_IDEA = { title: '', description: '', tags: [], placement: '', images: [], linkedArtists: [] }

export default function Brief({ ideas, setIdeas, artists }) {
  const [modal, setModal] = useState(null)

  function saveIdea(idea) {
    setIdeas((prev) => {
      const exists = prev.find((i) => i.id === idea.id)
      return exists ? prev.map((i) => (i.id === idea.id ? idea : i)) : [...prev, idea]
    })
    setModal(null)
  }

  function deleteIdea(id) {
    setIdeas((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[12px] text-accent tracking-[0.3em] uppercase mb-1">Tattoo</p>
          <h1 className="font-display text-3xl text-cream">My Brief</h1>
        </div>
        <button
          onClick={() => setModal(BLANK_IDEA)}
          className="w-10 h-10 rounded-full border border-ink-border text-cream-muted hover:text-cream hover:border-cream-muted/50 transition-colors flex items-center justify-center text-xl"
        >
          +
        </button>
      </div>

      {ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-4 opacity-10">◇</span>
          <p className="text-cream-muted/90 font-body text-sm">No ideas yet.</p>
          <p className="text-cream-muted/90 font-body text-xs mt-1">Tap + to capture your first concept.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onOpen={setModal} />
          ))}
        </div>
      )}

      {modal && (
        <IdeaModal
          idea={modal}
          onClose={() => setModal(null)}
          onSave={saveIdea}
          onDelete={deleteIdea}
          artists={artists}
        />
      )}
    </div>
  )
}
