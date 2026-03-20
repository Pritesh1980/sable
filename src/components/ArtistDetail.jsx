import { useState, useRef } from 'react'
import TagPill from './TagPill'
import { STYLE_TAGS } from '../data/artists'
import { compressImages } from '../hooks/useImageUpload'

export default function ArtistDetail({ artist, onClose, onSave }) {
  const [images, setImages] = useState(artist.images || [])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...artist })
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const fileRef = useRef()

  const instagramUrl = `https://www.instagram.com/${artist.handle}/`

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
      const compressed = await compressImages(files)
      const merged = [...images, ...compressed]
      saveImages(merged)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeImage(idx) {
    saveImages(images.filter((_, i) => i !== idx))
  }

  function setCover(idx) {
    if (idx === 0) return
    const reordered = [images[idx], ...images.filter((_, i) => i !== idx)]
    saveImages(reordered)
  }

  function toggleTag(tag) {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }))
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
          </div>

          {/* ── PHOTOS ── always editable */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase">
                Photos {images.length > 0 && <span className="text-cream-muted/90">· {images.length}</span>}
              </p>
              {images.length > 0 && (
                <p className="text-[9px] font-mono text-cream-muted/90 tracking-widest">Tap to set cover · Long press to remove</p>
              )}
            </div>

            {/* Upload button — always prominent */}
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
              className="w-full flex items-center justify-center gap-3 py-4 mb-3 border border-dashed border-ink-muted rounded-sm text-cream-muted hover:text-cream hover:border-cream-muted/40 transition-colors disabled:opacity-40"
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

            {/* Thumbnail grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((src, idx) => (
                  <div
                    key={idx}
                    className={`relative aspect-square bg-ink-muted rounded-sm overflow-hidden group cursor-pointer ${idx === 0 ? 'ring-1 ring-accent' : ''}`}
                    onClick={() => setLightbox(idx)}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />

                    {/* Cover badge */}
                    {idx === 0 && (
                      <div className="absolute top-1 left-1 bg-accent/80 text-cream text-[8px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm uppercase">
                        Cover
                      </div>
                    )}

                    {/* Actions overlay */}
                    <div className="absolute inset-0 bg-ink-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      {idx !== 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCover(idx) }}
                          className="text-[10px] font-mono text-cream tracking-widest uppercase bg-ink-black/60 px-2 py-1 rounded-sm"
                        >
                          Set cover
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(idx) }}
                        className="text-[10px] font-mono text-accent tracking-widest uppercase bg-ink-black/60 px-2 py-1 rounded-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Style tags */}
          <div className="mb-6">
            <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-3">Style</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((tag) => (
                <TagPill
                  key={tag}
                  tag={tag}
                  active={draft.tags.includes(tag)}
                  onClick={editing ? () => toggleTag(tag) : undefined}
                />
              ))}
            </div>
            {!editing && <p className="text-cream-muted/90 text-[10px] font-mono mt-2">Tap "Edit details" to assign tags</p>}
          </div>

          {/* Notes */}
          <div className="mb-10">
            <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-3">Notes</p>
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
          <img
            src={images[lightbox]}
            alt=""
            className="max-w-full max-h-full object-contain"
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
