import { useState, useRef, useEffect } from 'react'
import TagPill from './TagPill'
import ArtistImage from './ArtistImage'
import SimilarArtists from './SimilarArtists'
import { STYLE_TAGS, DEFAULT_STUDIOS } from '../data/artists'
import { uploadImages } from '../hooks/useImageUpload'
import { useAuth } from '../context/useAuth'
import { ARTIST_STATUSES, normalizeArtistStatus } from '../data/planning'
import { imageSrc } from '../data/wall'

export default function ArtistDetail({ artist, onClose, onSave, attendingConventions = [], allArtists = [], onSelectArtist }) {
  const [images, setImages] = useState(artist.images || [])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...artist })
  // Which fields this session has actually edited (#81). `draft` is a
  // one-time snapshot of `artist` taken at mount, never re-synced — a
  // cross-device sync landing a change to (say) status or notes while this
  // sheet is open is invisible to it. save() used to spread the whole draft
  // back, so it would silently revert that change even though the user never
  // touched the field. Same fix shape as #63/#79: patch only what the user
  // actually edited, resolved by Gallery.saveArtist against whatever is
  // latest at commit time, so an untouched field can't be clobbered by a
  // stale snapshot of itself.
  const touchedRef = useRef(new Set())
  const touch = (field) => touchedRef.current.add(field)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const fileRef = useRef()
  // The list as it stands right now, not as it was when a render began. An
  // upload that resolves while another is in flight has to append to this, or
  // the later save overwrites the earlier batch (#75). It is a ref rather than
  // a setImages updater because calling onSave inside an updater would fire the
  // save twice under StrictMode.
  const imagesRef = useRef(artist.images || [])
  const carouselRef = useRef(null)
  const { user } = useAuth() || {}

  useEffect(() => {
    const el = carouselRef.current
    if (!el || images.length === 0) return
    function onScroll() {
      const itemWidth = el.scrollWidth / images.length
      if (itemWidth > 0) setCurrentIdx(Math.round(el.scrollLeft / itemWidth))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [images.length])

  const instagramUrl = `https://www.instagram.com/${artist.handle}/`
  const currentStatus = ARTIST_STATUSES.find((s) => s.value === normalizeArtistStatus(artist.status))

  // Images auto-save immediately — no need to be in edit mode. Patches only
  // images (#79): sending the whole draft here is what let this closure —
  // captured whenever the upload/remove/reorder started — silently revert a
  // tag or status change that had landed in the meantime through a different
  // auto-save.
  function saveImages(newImages) {
    imagesRef.current = newImages
    setImages(newImages)
    onSave(artist.id, (current) => ({ ...current, images: newImages }))
  }

  async function handleFiles(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded = await uploadImages(files, { userId: user?.id, scope: 'artists', id: artist.id })
      saveImages([...imagesRef.current, ...uploaded])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeImage(idx) {
    if (!window.confirm('Remove this photo?')) return
    saveImages(images.filter((_, i) => i !== idx))
  }

  function setCover(idx) {
    if (idx === 0) return
    const reordered = [images[idx], ...images.filter((_, i) => i !== idx)]
    saveImages(reordered)
  }

  function toggleTag(tag) {
    // Only mark 'tags' touched when this toggle is deferred to the explicit
    // Save below (#81 review) — the !editing branch already auto-saves tags
    // on its own, independently correct the moment it fires. Touching it
    // unconditionally left a stale entry in touchedRef that only save()/
    // Cancel ever clear, neither of which this branch goes through: a tag
    // toggled outside editing, followed later by an edit session that never
    // touches tags again, would still carry this session's now-stale
    // draft.tags into that later save, clobbering whatever landed via sync
    // in between.
    if (editing) touch('tags')
    setDraft((d) => {
      const tags = d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag]
      const next = { ...d, tags }
      // Patches only tags, for the same reason saveImages patches only
      // images: this can auto-save while an upload is still in flight, and
      // must not carry this closure's stale images back over it (#79).
      if (!editing) {
        onSave(artist.id, (current) => ({ ...current, tags }))
      }
      return next
    })
  }

  // The explicit multi-field form save. Deliberately excludes images: they
  // auto-save immediately through their own controls above (#79), so by the
  // time this fires the store already has the latest ones. Only patches
  // fields this session actually touched (#81) — an untouched field resolves
  // against whatever is latest at commit time, not this stale snapshot of it.
  function save() {
    const patch = {}
    for (const field of touchedRef.current) {
      patch[field] = draft[field]
    }
    onSave(artist.id, (current) => ({ ...current, ...patch }))
    touchedRef.current = new Set()
    setEditing(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-black flex flex-col animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-4 border-b border-ink-border shrink-0">
        <button onClick={onClose} className="text-cream-muted hover:text-cream transition-colors text-sm font-body tracking-widest uppercase">
          ← Back
        </button>
        <div className="flex gap-4">
          {editing ? (
            <>
              <button
                onClick={() => {
                  setDraft({ ...artist, images })
                  // Otherwise a field touched, then abandoned via Cancel,
                  // stays in the touched set — a later save from a fresh
                  // edit session would still patch it, back to whatever
                  // draft now holds (artist's own value, a no-op most of the
                  // time, but a stale one if something external changed
                  // that same field again in between).
                  touchedRef.current = new Set()
                  setEditing(false)
                }}
                className="text-cream-muted hover:text-cream text-sm transition-colors"
              >
                Cancel
              </button>
              <button onClick={save} className="text-accent hover:text-accent-hover text-sm font-body transition-colors">
                Save
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="text-cream-muted hover:text-cream text-sm transition-colors">
              Edit details
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-6 max-w-screen-sm mx-auto w-full">

          {/* Name & Instagram */}
          <div className="mb-6">
            {editing ? (
              <input
                className="bg-transparent border-b border-ink-border text-cream font-display text-2xl w-full outline-hidden focus-visible:ring-2 focus-visible:ring-accent pb-1 mb-2 placeholder-cream-muted/60"
                value={draft.name}
                onChange={(e) => { touch('name'); setDraft((d) => ({ ...d, name: e.target.value })) }}
                placeholder="Display name (optional)"
              />
            ) : (
              <h1 className="font-display text-2xl text-cream mb-1">
                {artist.name || <span className="text-cream-muted">@{artist.handle}</span>}
              </h1>
            )}
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-cream-muted hover:text-accent transition-colors inline-flex items-center gap-1"
            >
              @{artist.handle} <span className="text-xs">↗</span>
            </a>
            {DEFAULT_STUDIOS.find((s) => s.id === artist.studio) && (
              <p className="font-mono text-sm text-cream-muted/60 mt-1">
                {DEFAULT_STUDIOS.find((s) => s.id === artist.studio).name}
              </p>
            )}
            {!editing && (
              <p className={`font-mono text-xs tracking-widest uppercase mt-3 ${currentStatus.tone}`}>
                {currentStatus.label}
              </p>
            )}
            {!editing && artist.styleNote && (
              <p className="font-body text-sm text-cream-muted/80 italic leading-relaxed mt-3">
                {artist.styleNote}
              </p>
            )}
          </div>

          {/* ── PHOTOS ── always editable */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-mono text-cream-muted tracking-widest uppercase">
                Photos
                {images.length > 0 && (
                  <span className="text-cream-muted/90 ml-2">
                    {currentIdx + 1} / {images.length}
                  </span>
                )}
              </p>
            </div>

            {/* Upload button */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            <button
              onClick={() => fileRef.current.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-3 py-3 mb-4 border border-dashed border-ink-muted rounded-xs text-cream-muted hover:text-cream hover:border-cream-muted/40 transition-colors disabled:opacity-40"
            >
              {uploading ? (
                <span className="font-mono text-xs tracking-widest animate-pulse">Importing…</span>
              ) : (
                <>
                  <span className="text-2xl leading-none">+</span>
                  <span className="font-body text-sm">Add photos from camera roll</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Carousel — escapes the max-w-screen-sm content column */}
        {images.length > 0 && (
          <div className="mb-8">
            <div
              ref={carouselRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-5 pb-3"
            >
              {images.map((src, idx) => (
                <div
                  key={idx}
                  className={`relative snap-center shrink-0 w-[88%] sm:w-[520px] aspect-[4/5] bg-ink-muted rounded-xs overflow-hidden cursor-pointer ${idx === 0 ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => setLightbox(idx)}
                >
                  <ArtistImage src={src} label={artist.name || `@${artist.handle}`} className="w-full h-full object-cover" monogramClassName="text-6xl" loading="lazy" />

                  {idx === 0 && (
                    <div className="absolute top-3 left-3 bg-accent/80 text-cream text-[0.6875rem] font-mono tracking-widest px-2 py-1 rounded-xs uppercase">
                      Cover
                    </div>
                  )}

                  <div className="absolute top-3 right-3 flex gap-1.5">
                    {idx !== 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setCover(idx) }}
                        className="text-[0.6875rem] font-mono text-cream tracking-widest uppercase bg-ink-black/70 hover:bg-ink-black px-2.5 py-1 rounded-xs transition-colors backdrop-blur-xs"
                      >
                        Set cover
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                      className="w-7 h-7 flex items-center justify-center text-accent text-xl leading-none bg-ink-black/70 hover:bg-ink-black rounded-xs transition-colors backdrop-blur-xs"
                      title="Remove photo"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Dot indicator */}
            {images.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {images.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-1 rounded-full transition-all ${
                      idx === currentIdx ? 'w-4 bg-accent' : 'w-1 bg-cream-muted/30'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 max-w-screen-sm mx-auto w-full">

          {/* Style tags */}
          <div className="mb-6">
            <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Style</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((tag) => (
                <TagPill
                  key={tag}
                  tag={tag}
                  active={draft.tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                />
              ))}
            </div>
            {!editing && <p className="text-cream-muted/90 text-xs font-mono mt-2">Tap tags to tune matching.</p>}
          </div>

          {/* Similar ink — on-device visual matches (only outside edit mode, and
              only when the collection is big enough for neighbours to mean much) */}
          {!editing && allArtists.length > 1 && (
            <SimilarArtists artists={allArtists} artist={artist} onSelectArtist={onSelectArtist} />
          )}

          {/* Studio (edit mode) */}
          {editing && (
            <>
              <div className="mb-6">
                <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Shortlist status</p>
                <select
                  className="w-full bg-ink-muted border border-ink-border rounded-xs px-3 py-2 text-sm text-cream outline-hidden focus:border-cream-muted/50 font-body"
                  value={normalizeArtistStatus(draft.status)}
                  onChange={(e) => { touch('status'); setDraft((d) => ({ ...d, status: e.target.value })) }}
                >
                  {ARTIST_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Studio</p>
                <select
                  className="w-full bg-ink-muted border border-ink-border rounded-xs px-3 py-2 text-sm text-cream outline-hidden focus:border-cream-muted/50 font-body"
                  value={draft.studio || ''}
                  onChange={(e) => { touch('studio'); setDraft((d) => ({ ...d, studio: e.target.value || null })) }}
                >
                  <option value="">— None —</option>
                  {DEFAULT_STUDIOS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Attending conventions */}
          {attendingConventions.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-mono text-accent tracking-widest uppercase mb-3">Attending conventions</p>
              <div className="space-y-2">
                {attendingConventions.map((c) => (
                  <a
                    key={c.id}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 p-3 bg-ink-card border border-accent/25 rounded-xs hover:border-accent/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-cream text-base leading-tight truncate group-hover:text-accent transition-colors">{c.name}</p>
                      <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest mt-0.5">{c.dates}</p>
                    </div>
                    {c.distanceMiles != null && (
                      <span className="font-mono text-[0.625rem] text-cream-muted/50 shrink-0 mt-0.5">
                        {c.distanceMiles === 0 ? 'local' : `${c.distanceMiles} mi`}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="mb-10">
            <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Notes</p>
            {editing ? (
              <textarea
                className="w-full bg-ink-muted border border-ink-border rounded-xs px-3 py-2 text-sm text-cream outline-hidden focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
                rows={4}
                placeholder="Personal notes about this artist…"
                value={draft.notes || ''}
                onChange={(e) => { touch('notes'); setDraft((d) => ({ ...d, notes: e.target.value })) }}
              />
            ) : (
              <p className="text-cream-muted text-sm font-body leading-relaxed">
                {artist.notes || <span className="opacity-30">No notes yet</span>}
              </p>
            )}
          </div>

        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-60 bg-ink-black flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <ArtistImage
            src={imageSrc(images[lightbox])}
            label={artist.name || `@${artist.handle}`}
            className="max-w-full max-h-full object-contain"
            monogramClassName="text-8xl"
          />
          <button className="absolute top-5 right-5 text-cream-muted text-2xl">×</button>
          {lightbox > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lightbox - 1) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-cream-muted text-3xl px-2"
            >‹</button>
          )}
          {lightbox < images.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lightbox + 1) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-cream-muted text-3xl px-2"
            >›</button>
          )}
        </div>
      )}
    </div>
  )
}
