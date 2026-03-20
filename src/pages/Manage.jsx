import { useState, useRef } from 'react'
import { STYLE_TAGS, TIERS } from '../data/artists'
import { compressImages } from '../hooks/useImageUpload'
import TagPill from '../components/TagPill'

const TIER_LABELS = {
  [TIERS.FAVOURITE]: 'Favourite',
  [TIERS.ALSO_LIKE]: 'Also Like',
}

function ArtistRow({ artist, onSaveImages, onUpdate, onRemove }) {
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState(artist.notes || '')

  async function handleFiles(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const compressed = await compressImages(files)
      onSaveImages(artist.id, [...(artist.images || []), ...compressed])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeImage(idx) {
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

  return (
    <>
      <tr
        className="border-b border-ink-border hover:bg-ink-card/50 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Name */}
        <td className="py-3 pl-4 pr-2">
          <p className="font-display text-cream text-sm leading-tight">{artist.name || `@${artist.handle}`}</p>
          {artist.name && <p className="font-mono text-cream-muted/90 text-[10px]">@{artist.handle}</p>}
        </td>

        {/* Tier */}
        <td className="py-3 px-2 hidden sm:table-cell">
          <span className={`font-mono text-[10px] tracking-widest uppercase ${artist.tier === TIERS.FAVOURITE ? 'text-accent' : 'text-cream-muted/90'}`}>
            {TIER_LABELS[artist.tier] || artist.tier}
          </span>
        </td>

        {/* Instagram */}
        <td className="py-3 px-2">
          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[11px] text-cream-muted hover:text-accent transition-colors inline-flex items-center gap-1"
          >
            Instagram ↗
          </a>
        </td>

        {/* Photos */}
        <td className="py-3 px-2">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
            <button
              onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
              disabled={uploading}
              className="font-mono text-[11px] text-cream-muted hover:text-cream border border-ink-border hover:border-cream-muted/40 px-2 py-1 rounded-sm transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {uploading ? 'Importing…' : '+ Photos'}
            </button>
            {imageCount > 0 ? (
              <span className="font-mono text-[10px] text-accent font-semibold">{imageCount}</span>
            ) : (
              <span className="font-mono text-[10px] text-cream-muted/40 italic">none</span>
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
                <p className="text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Style Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_TAGS.map((tag) => (
                    <TagPill key={tag} tag={tag} active={artist.tags.includes(tag)} onClick={() => toggleTag(tag)} small />
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Notes</p>
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
                  <p className="text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Photos ({imageCount})</p>
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
                  onClick={() => onRemove(artist.id)}
                  className="text-[10px] font-mono text-cream-muted/90 hover:text-accent transition-colors tracking-widest uppercase"
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

function AddArtistForm({ onAdd }) {
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [tier, setTier] = useState(TIERS.FAVOURITE)
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    const clean = handle.replace(/^@/, '').trim()
    if (!clean) { setError('Instagram handle is required'); return }
    onAdd({ handle: clean, name: name.trim(), tier })
    setHandle('')
    setName('')
    setError('')
  }

  return (
    <form onSubmit={submit} className="bg-ink-card border border-ink-border rounded-sm p-4 mb-8">
      <p className="text-[10px] font-mono text-cream-muted tracking-widest uppercase mb-4">Add New Artist</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">Instagram Handle *</label>
          <input
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-mono placeholder-cream-muted/60"
            placeholder="@handle"
            value={handle}
            onChange={(e) => { setHandle(e.target.value); setError('') }}
          />
        </div>
        <div>
          <label className="text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">Display Name</label>
          <input
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60"
            placeholder="Full name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">Tier</label>
          <select
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-body"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value={TIERS.FAVOURITE}>Favourite</option>
            <option value={TIERS.ALSO_LIKE}>Also Like</option>
          </select>
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

export default function Manage({ artists, setArtists }) {
  const [search, setSearch] = useState('')

  const favourites = artists
    .filter((a) => a.tier === TIERS.FAVOURITE)
    .sort((a, b) => a.rank - b.rank)

  const alsoLike = artists
    .filter((a) => a.tier === TIERS.ALSO_LIKE)
    .sort((a, b) => a.rank - b.rank)

  const allInOrder = [...favourites, ...alsoLike]

  const filtered = search.trim()
    ? allInOrder.filter((a) =>
        a.handle.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase())
      )
    : allInOrder

  function addArtist({ handle, name, tier }) {
    const existing = artists.find((a) => a.handle.toLowerCase() === handle.toLowerCase())
    if (existing) return

    const tierArtists = artists.filter((a) => a.tier === tier)
    const maxRank = tierArtists.reduce((m, a) => Math.max(m, a.rank), 0)

    const newArtist = {
      id: handle,
      handle,
      name,
      tier,
      tags: [],
      images: [],
      rank: maxRank + 1,
      notes: '',
    }
    setArtists((prev) => [...prev, newArtist])
  }

  function saveImages(id, images) {
    setArtists((prev) => prev.map((a) => (a.id === id ? { ...a, images } : a)))
  }

  function updateArtist(id, patch) {
    setArtists((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeArtist(id) {
    setArtists((prev) => prev.filter((a) => a.id !== id))
  }

  const totalImages = artists.reduce((n, a) => n + (a.images?.length || 0), 0)
  const withImages = artists.filter((a) => a.images?.length > 0).length

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      {/* Header */}
      <div className="pt-10 pb-6">
        <p className="font-mono text-[10px] text-accent tracking-[0.4em] uppercase mb-2">Tattoo</p>
        <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Manage</h1>
        <p className="font-mono text-[10px] text-cream-muted/90 mt-3 tracking-widest">
          {artists.length} artists · {withImages} with photos · {totalImages} total images
        </p>
      </div>

      {/* Add artist */}
      <AddArtistForm onAdd={addArtist} />

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
              <th className="text-left py-2.5 pl-4 pr-2 text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase">Artist</th>
              <th className="text-left py-2.5 px-2 text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase hidden sm:table-cell">Tier</th>
              <th className="text-left py-2.5 px-2 text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase">Instagram</th>
              <th className="text-left py-2.5 px-2 text-[9px] font-mono text-cream-muted/90 tracking-widest uppercase">Photos</th>
              <th className="py-2.5 pr-4" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((artist) => (
              <ArtistRow
                key={artist.id}
                artist={artist}
                onSaveImages={saveImages}
                onUpdate={updateArtist}
                onRemove={removeArtist}
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
    </div>
  )
}
