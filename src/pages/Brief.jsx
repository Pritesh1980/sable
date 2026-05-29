import { useState, useRef } from 'react'
import TagPill from '../components/TagPill'
import Logo from '../components/Logo'
import { STYLE_TAGS, PLACEMENTS } from '../data/artists'
import { IDEA_STATUSES, matchArtistsToIdea } from '../data/brief'
import { buildIdeaBrief } from '../data/export'
import { compressImages } from '../hooks/useImageUpload'
import {
  ARTIST_STATUSES,
  getImageNote,
  getImageUrl,
  matchArtistsForIdea,
  normalizeArtistStatus,
  normalizeReferenceImages,
} from '../data/planning'

const STATUS_DOTS = {
  idea: 'bg-cream-muted/40',
  booked: 'bg-accent',
  done: 'bg-green-400',
}

function IdeaCard({ idea, onOpen }) {
  const status = IDEA_STATUSES.find((s) => s.value === (idea.status || 'idea'))

  return (
    <div
      className="bg-ink-card border border-ink-border rounded-sm p-4 cursor-pointer hover:border-cream-muted/50 transition-colors animate-slide-up"
      onClick={() => onOpen(idea)}
    >
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-display text-cream text-lg leading-tight">{idea.title}</h3>
        <span className={`flex items-center gap-1.5 text-[0.6875rem] font-mono tracking-widest uppercase shrink-0 ml-3 mt-1 ${status.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[status.value]}`} />
          {status.label}
        </span>
      </div>
      {idea.description && (
        <p className="text-cream-muted text-sm font-body leading-relaxed line-clamp-2 mb-3">{idea.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {idea.tags.map((t) => <TagPill key={t} tag={t} active small />)}
        {idea.placement && <TagPill tag={idea.placement} small />}
      </div>
      {idea.linkedArtists?.length > 0 && (
        <p className="text-cream-muted/90 text-xs font-mono mt-3 tracking-widest">
          {idea.linkedArtists.length} artist{idea.linkedArtists.length !== 1 ? 's' : ''} linked
        </p>
      )}
    </div>
  )
}

function IdeaModal({ idea, onClose, onSave, onDelete, artists }) {
  const [draft, setDraft] = useState({ status: 'idea', ...idea, images: normalizeReferenceImages(idea.images) })
  const [newImage, setNewImage] = useState('')
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()
  const isNew = !idea.id

  const matches = matchArtistsForIdea(draft, artists)
  const suggested = matchArtistsToIdea(draft, artists).filter(
    (a) => !draft.linkedArtists?.includes(a.id)
  )
  const statusLabel = (status) => ARTIST_STATUSES.find((s) => s.value === normalizeArtistStatus(status))?.label

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
      setDraft((d) => ({ ...d, images: [...(d.images || []), { url, note: '' }] }))
    }
    setNewImage('')
  }

  async function addFiles(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const compressed = await compressImages(files)
      setDraft((d) => ({
        ...d,
        images: [...(d.images || []), ...compressed.map((url) => ({ url, note: '' }))],
      }))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function updateImageNote(url, note) {
    setDraft((d) => ({
      ...d,
      images: normalizeReferenceImages(d.images).map((image) => (
        image.url === url ? { ...image, note } : image
      )),
    }))
  }

  function save() {
    if (!draft.title.trim()) return
    onSave({ ...draft, images: normalizeReferenceImages(draft.images), id: draft.id || Date.now().toString() })
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(buildIdeaBrief(draft, artists))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

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
          <button
            onClick={copyBrief}
            disabled={!draft.title.trim()}
            className="text-cream-muted hover:text-cream disabled:opacity-30 text-sm transition-colors"
          >
            {copied ? 'Copied' : 'Copy brief'}
          </button>
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

        {/* Status */}
        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Status</p>
          <div className="flex gap-2">
            {IDEA_STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setDraft((d) => ({ ...d, status: s.value }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-mono border transition-colors ${
                  draft.status === s.value
                    ? 'border-cream-muted/50 text-cream bg-ink-card'
                    : 'border-ink-border text-cream-muted hover:border-cream-muted/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[s.value]}`} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Description</p>
          <textarea
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
            rows={4}
            placeholder="Describe the concept, mood, imagery…"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </div>

        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Style Tags</p>
          <div className="flex flex-wrap gap-2">
            {STYLE_TAGS.map((tag) => (
              <TagPill key={tag} tag={tag} active={draft.tags.includes(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Body Placement</p>
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
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Reference Images</p>
          {draft.images?.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {normalizeReferenceImages(draft.images).map((image) => {
                const url = getImageUrl(image)
                return (
                <div key={url} className="bg-ink-muted rounded-sm overflow-hidden border border-ink-border">
                  <div className="relative aspect-square group">
                    <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    <button
                      onClick={() => setDraft((d) => ({ ...d, images: normalizeReferenceImages(d.images).filter((i) => i.url !== url) }))}
                      className="absolute top-1 right-1 w-6 h-6 bg-ink-dark/80 text-accent rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >×</button>
                  </div>
                  <textarea
                    className="w-full bg-ink-card px-2 py-2 text-xs text-cream outline-none font-body placeholder-cream-muted/60 resize-none border-t border-ink-border"
                    rows={2}
                    placeholder="What to borrow from this image…"
                    value={getImageNote(image)}
                    onChange={(e) => updateImageNote(url, e.target.value)}
                  />
                </div>
                )
              })}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
          <div className="flex gap-2">
            <input
              className="flex-1 bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/60"
              placeholder="Paste image URL…"
              value={newImage}
              onChange={(e) => setNewImage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addImage()}
            />
            <button
              onClick={() => fileRef.current.click()}
              disabled={uploading}
              className="px-3 py-2 bg-ink-muted border border-ink-border rounded-sm text-sm text-cream hover:border-cream-muted/50 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {uploading ? '…' : '+ Photo'}
            </button>
            <button onClick={addImage} className="px-4 py-2 bg-ink-muted border border-ink-border rounded-sm text-sm text-cream hover:border-cream-muted/50 transition-colors">
              Add
            </button>
          </div>
        </div>

        {/* Ranked matches */}
        {matches.length > 0 && (
          <div>
            <p className="text-xs font-mono text-accent tracking-widest uppercase mb-2">Artist match view</p>
            <p className="text-cream-muted/90 text-[0.6875rem] font-mono mb-3">Ranked by style overlap, shortlist status, and your artist rank.</p>
            <div className="space-y-2">
              {matches.slice(0, 8).map(({ artist, overlapTags, status }) => {
                const linked = draft.linkedArtists?.includes(artist.id)
                return (
                  <button
                    key={artist.id}
                    onClick={() => toggleArtist(artist.id)}
                    className={`w-full text-left p-3 rounded-sm text-sm transition-colors border ${
                      linked
                        ? 'border-accent/50 bg-accent/5 text-cream'
                        : 'border-ink-border text-cream-muted hover:border-cream-muted/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {artist.images?.[0] && (
                        <img src={artist.images[0]} alt="" className="w-12 h-14 object-cover rounded-sm shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-lg leading-tight truncate">{artist.name || `@${artist.handle}`}</p>
                          <span className="font-mono text-[0.6875rem] text-accent shrink-0">{overlapTags.length} match</span>
                        </div>
                        <p className="font-mono text-[0.6875rem] text-cream-muted/70 mt-1">#{artist.rank} · {statusLabel(status)}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {overlapTags.map((tag) => <TagPill key={tag} tag={tag} active small />)}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Suggested artists based on tag match */}
        {suggested.length > 0 && matches.length === 0 && (
          <div>
            <p className="text-xs font-mono text-accent tracking-widest uppercase mb-2">Suggested artists</p>
            <p className="text-cream-muted/90 text-[0.6875rem] font-mono mb-3">Based on style tag overlap — tap to link</p>
            <div className="space-y-1">
              {suggested.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleArtist(a.id)}
                  className="w-full text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border border-accent/20 text-cream-muted hover:border-accent/50 hover:text-cream"
                >
                  {a.name || `@${a.handle}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Linked Artists</p>
          {draft.linkedArtists?.length === 0 && suggested.length === 0 && (
            <p className="text-cream-muted/60 text-xs font-mono mb-2">Add style tags above to get artist suggestions.</p>
          )}
          <div className="space-y-1">
            {artists.filter((a) => draft.linkedArtists?.includes(a.id)).map((a) => (
              <button
                key={a.id}
                onClick={() => toggleArtist(a.id)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border border-accent/40 bg-accent/5 text-cream"
              >
                {a.name || `@${a.handle}`}
              </button>
            ))}
            {artists.filter((a) => !draft.linkedArtists?.includes(a.id) && !suggested.find((s) => s.id === a.id)).map((a) => (
              <button
                key={a.id}
                onClick={() => toggleArtist(a.id)}
                className="w-full text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border border-ink-border text-cream-muted hover:border-cream-muted/50"
              >
                {a.name || `@${a.handle}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const BLANK_IDEA = { title: '', description: '', tags: [], placement: '', images: [], linkedArtists: [], status: 'idea' }

export default function Brief({ ideas, setIdeas, artists }) {
  const [modal, setModal] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)

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

  const filtered = statusFilter
    ? ideas.filter((i) => (i.status || 'idea') === statusFilter)
    : ideas

  const counts = IDEA_STATUSES.reduce((acc, s) => {
    acc[s.value] = ideas.filter((i) => (i.status || 'idea') === s.value).length
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6 flex items-end justify-between">
        <div>
          <Logo size={24} className="mb-2" />
          <h1 className="font-display text-3xl text-cream">My Brief</h1>
        </div>
        <button
          onClick={() => setModal(BLANK_IDEA)}
          className="w-10 h-10 rounded-full border border-ink-border text-cream-muted hover:text-cream hover:border-cream-muted/50 transition-colors flex items-center justify-center text-xl"
        >
          +
        </button>
      </div>

      {/* Status filter tabs */}
      {ideas.length > 0 && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setStatusFilter(null)}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors ${
              !statusFilter ? 'border-cream-muted/50 text-cream' : 'border-ink-border text-cream-muted hover:border-cream-muted/30'
            }`}
          >
            All ({ideas.length})
          </button>
          {IDEA_STATUSES.map((s) => counts[s.value] > 0 && (
            <button
              key={s.value}
              onClick={() => setStatusFilter(statusFilter === s.value ? null : s.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors ${
                statusFilter === s.value ? 'border-cream-muted/50 text-cream' : 'border-ink-border text-cream-muted hover:border-cream-muted/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[s.value]}`} />
              {s.label} ({counts[s.value]})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-4 opacity-10">◇</span>
          <p className="text-cream-muted/90 font-body text-sm">No ideas yet.</p>
          <p className="text-cream-muted/90 font-body text-xs mt-1">Tap + to capture your first concept.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-cream-muted/90 text-center text-xs font-mono tracking-widest py-16">No ideas with this status.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
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
