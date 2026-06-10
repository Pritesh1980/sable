import { useState, useRef } from 'react'
import { STYLE_TAGS, DEFAULT_STUDIOS } from '../data/artists'
import { ARTIST_STATUSES, normalizeArtistStatus } from '../data/planning'
import { uploadImages } from '../hooks/useImageUpload'
import { useAuth } from '../context/useAuth'
import TagPill from './TagPill'

function studioName(id) {
  const s = DEFAULT_STUDIOS.find((s) => s.id === id)
  return s ? s.name : null
}

function ArtistRow({ artist, onSaveImages, onUpdate, onRemove }) {
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState(artist.notes || '')
  const { user } = useAuth() || {}

  async function handleFiles(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded = await uploadImages(files, { userId: user?.id, scope: 'artists', id: artist.id })
      onSaveImages(artist.id, [...(artist.images || []), ...uploaded])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeImage(idx) {
    if (!window.confirm('Remove this photo?')) return
    onSaveImages(artist.id, artist.images.filter((_, i) => i !== idx))
  }

  function saveNote() {
    onUpdate(artist.id, { notes: note })
  }

  function toggleTag(tag) {
    const tags = artist.tags.includes(tag)
      ? artist.tags.filter((t) => t !== tag)
      : [...artist.tags, tag]
    onUpdate(artist.id, { tags })
  }

  const igUrl = `https://www.instagram.com/${artist.handle}/`
  const imageCount = artist.images?.length || 0
  const status = ARTIST_STATUSES.find((s) => s.value === normalizeArtistStatus(artist.status))

  return (
    <>
      <tr
        className="border-b border-ink-border hover:bg-ink-card/50 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Name */}
        <td className="py-3 pl-4 pr-2">
          <p className="font-display text-cream text-sm leading-tight">{artist.name || `@${artist.handle}`}</p>
          {artist.name && <p className="font-mono text-cream-muted/90 text-xs">@{artist.handle}</p>}
          {artist.studio && <p className="font-mono text-cream-muted/60 text-[0.6875rem] tracking-widest">{studioName(artist.studio)}</p>}
        </td>

        {/* Instagram */}
        <td className="py-3 px-2">
          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[0.8125rem] text-cream-muted hover:text-accent transition-colors inline-flex items-center gap-1"
          >
            Instagram ↗
          </a>
        </td>

        {/* Status */}
        <td className="py-3 px-2">
          <p className={`font-mono text-xs tracking-widest uppercase ${status.tone}`}>{status.label}</p>
        </td>

        {/* Photos */}
        <td className="py-3 px-2">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
            <button
              onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
              disabled={uploading}
              className="font-mono text-[0.8125rem] text-cream-muted hover:text-cream border border-ink-border hover:border-cream-muted/40 px-2 py-1 rounded-sm transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {uploading ? 'Importing…' : '+ Photos'}
            </button>
            {imageCount > 0 ? (
              <span className="font-mono text-xs text-accent font-semibold">{imageCount}</span>
            ) : (
              <span className="font-mono text-xs text-cream-muted/40 italic">none</span>
            )}
          </div>
        </td>

        {/* Expand chevron */}
        <td className="py-3 pr-4 text-right">
          <span className={`text-cream-muted/90 text-xs transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr className="border-b border-ink-border bg-ink-card/30">
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-4">

              {/* Tags */}
              <div>
                <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Style Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_TAGS.map((tag) => (
                    <TagPill key={tag} tag={tag} active={artist.tags.includes(tag)} onClick={() => toggleTag(tag)} small />
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Shortlist Status</p>
                <select
                  className="bg-ink-muted border border-ink-border rounded-sm px-3 py-1.5 text-sm text-cream outline-none focus:border-cream-muted/40 font-body"
                  value={normalizeArtistStatus(artist.status)}
                  onChange={(e) => onUpdate(artist.id, { status: e.target.value })}
                >
                  {ARTIST_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Studio */}
              <div>
                <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Studio</p>
                <select
                  className="bg-ink-muted border border-ink-border rounded-sm px-3 py-1.5 text-sm text-cream outline-none focus:border-cream-muted/40 font-body"
                  value={artist.studio || ''}
                  onChange={(e) => onUpdate(artist.id, { studio: e.target.value || null })}
                >
                  <option value="">— None —</option>
                  {DEFAULT_STUDIOS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Notes</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-ink-muted border border-ink-border rounded-sm px-3 py-1.5 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60"
                    placeholder="Notes about this artist…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={saveNote}
                    onKeyDown={(e) => e.key === 'Enter' && saveNote()}
                  />
                </div>
              </div>

              {/* Image thumbnails */}
              {imageCount > 0 && (
                <div>
                  <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Photos ({imageCount})</p>
                  <div className="flex gap-2 flex-wrap">
                    {artist.images.map((src, idx) => (
                      <div key={idx} className="relative w-14 h-14 rounded-sm overflow-hidden group bg-ink-muted shrink-0">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute inset-0 bg-ink-black/60 text-accent text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Remove artist */}
              <div className="flex justify-end">
                <button
                  onClick={() => { if (window.confirm(`Remove ${artist.name || '@' + artist.handle}?`)) onRemove(artist.id) }}
                  className="text-xs font-mono text-cream-muted/90 hover:text-accent transition-colors tracking-widest uppercase"
                >
                  Remove artist
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Search box + maintenance table for the full artist list. Pure presentation —
// all mutations flow through the onUpdate/onRemove/onSaveImages callbacks.
export default function ArtistTable({ artists, onSaveImages, onUpdate, onRemove }) {
  const [search, setSearch] = useState('')

  const allInOrder = artists.slice().sort((a, b) => a.rank - b.rank)

  const filtered = search.trim()
    ? allInOrder.filter((a) =>
        a.handle.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase())
      )
    : allInOrder

  return (
    <>
      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full bg-ink-card border border-ink-border rounded-sm px-4 py-2.5 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60"
          placeholder="Search artists…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="border border-ink-border rounded-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-border bg-ink-card">
              <th className="text-left py-2.5 pl-4 pr-2 text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase">Artist</th>
              <th className="text-left py-2.5 px-2 text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase">Instagram</th>
              <th className="text-left py-2.5 px-2 text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase">Status</th>
              <th className="text-left py-2.5 px-2 text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase">Photos</th>
              <th className="py-2.5 pr-4" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((artist) => (
              <ArtistRow
                key={artist.id}
                artist={artist}
                onSaveImages={onSaveImages}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-cream-muted/90 font-mono text-xs tracking-widest uppercase">
                  No artists found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
