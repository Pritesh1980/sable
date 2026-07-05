import { useState, useRef, useEffect } from 'react'
import TagPill from './TagPill'
import ArtistImage from './ArtistImage'
import { STYLE_TAGS, DEFAULT_STUDIOS } from '../data/artists'
import { uploadImages } from '../hooks/useImageUpload'
import { useAuth } from '../context/useAuth'
import { ARTIST_STATUSES, normalizeArtistStatus } from '../data/planning'
import { imageSrc } from '../data/wall'

export default function ArtistDetail({ artist, onClose, onSave, attendingConventions = [] }) {
  const [images, setImages] = useState(artist.images || [])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...artist })
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const fileRef = useRef()
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

  // Images auto-save immediately — no need to be in edit mode
  function saveImages(newImages) {
    setImages(newImages)
    onSave({ ...artist, ...draft, images: newImages })
  }

  async function handleFiles(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded = await uploadImages(files, { userId: user?.id, scope: 'artists', id: artist.id })
      saveImages([...images, ...uploaded])
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
    setDraft((d) => {
      const tags = d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag]
      const next = { ...d, tags }
      if (!editing) {
        onSave({ ...artist, ...next, images })
      }
      return next
    })
  }

  function save() {
    onSave({ ...draft, images })
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
              <button onClick={() => { setDraft({ ...artist, images }); setEditing(false) }} className="text-cream-muted hover:text-cream text-sm transition-colors">
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
                className="bg-transparent border-b border-ink-border text-cream font-display text-2xl w-full outline-none pb-1 mb-2 placeholder-cream-muted/60"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
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
              className="w-full flex items-center justify-center gap-3 py-3 mb-4 border border-dashed border-ink-muted rounded-sm text-cream-muted hover:text-cream hover:border-cream-muted/40 transition-colors disabled:opacity-40"
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
                  className={`relative snap-center shrink-0 w-[88%] sm:w-[520px] aspect-[4/5] bg-ink-muted rounded-sm overflow-hidden cursor-pointer ${idx === 0 ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => setLightbox(idx)}
                >
                  <ArtistImage src={src} label={artist.name || `@${artist.handle}`} className="w-full h-full object-cover" monogramClassName="text-6xl" loading="lazy" />

                  {idx === 0 && (
                    <div className="absolute top-3 left-3 bg-accent/80 text-cream text-[0.6875rem] font-mono tracking-widest px-2 py-1 rounded-sm uppercase">
                      Cover
                    </div>
                  )}

                  <div className="absolute top-3 right-3 flex gap-1.5">
                    {idx !== 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setCover(idx) }}
                        className="text-[0.6875rem] font-mono text-cream tracking-widest uppercase bg-ink-black/70 hover:bg-ink-black px-2.5 py-1 rounded-sm transition-colors backdrop-blur-sm"
                      >
                        Set cover
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                      className="w-7 h-7 flex items-center justify-center text-accent text-xl leading-none bg-ink-black/70 hover:bg-ink-black rounded-sm transition-colors backdrop-blur-sm"
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

          {/* Studio (edit mode) */}
          {editing && (
            <>
              <div className="mb-6">
                <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Shortlist status</p>
                <select
                  className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body"
                  value={normalizeArtistStatus(draft.status)}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                >
                  {ARTIST_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Studio</p>
                <select
                  className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body"
                  value={draft.studio || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, studio: e.target.value || null }))}
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
                    className="flex items-start justify-between gap-3 p-3 bg-ink-card border border-accent/25 rounded-sm hover:border-accent/50 transition-colors group"
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
                className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
                rows={4}
                placeholder="Personal notes about this artist…"
                value={draft.notes || ''}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
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
