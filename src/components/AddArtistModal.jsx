import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STYLE_TAGS, parseInstagramHandle, createArtist } from '../data/artists'
import { uploadImages } from '../hooks/useImageUpload'
import { stampAddedAt } from '../data/wall'

// Quick-add modal for the Wall bar's "+ Add artist" — one compact v2-styled
// form: handle, optional name, style tags, and an optional immediate image
// drop/paste zone. Heavy editing (studio, notes, provenance) stays in the
// full manage view, linked from the footer. Saved images are stamped with
// stampAddedAt so the wall's recent dots light up immediately.
export default function AddArtistModal({ artists = [], setArtists, userId, onClose, onManage }) {
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [tags, setTags] = useState([])
  const [staged, setStaged] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const cleanHandle = parseInstagramHandle(handle)
  const duplicate = cleanHandle
    ? artists.find((a) => a.handle.toLowerCase() === cleanHandle.toLowerCase())
    : null

  function toggleTag(tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function addFiles(files) {
    const images = Array.from(files || []).filter((f) => f.type?.startsWith('image/'))
    if (images.length) setStaged((prev) => [...prev, ...images])
  }

  function removeStaged(i) {
    setStaged((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function handlePaste(e) {
    addFiles(e.clipboardData?.files)
  }

  async function stampedUploads(scopeId) {
    if (!staged.length) return []
    const uploaded = await uploadImages(staged, { userId, scope: 'artists', id: scopeId })
    return uploaded.map((u) => stampAddedAt(u))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!cleanHandle) { setError('Instagram handle is required'); return }
    if (duplicate) return
    setSaving(true)
    try {
      const images = await stampedUploads(cleanHandle)
      const artist = createArtist({ handle: cleanHandle, name: name.trim(), tags }, artists)
      if (!artist) { setError(`@${cleanHandle} is already in your collection`); return }
      artist.images = images
      setArtists((prev) => [...prev, artist])
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleAddToExisting() {
    if (!duplicate) return
    setSaving(true)
    try {
      const images = await stampedUploads(duplicate.id)
      setArtists((prev) =>
        prev.map((a) => (a.id === duplicate.id ? { ...a, images: [...(a.images || []), ...images] } : a))
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-v2-ink/90 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={handleSave}
        onPaste={handlePaste}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-v2-surface border border-v2-hairline rounded-sm p-6 m-4 mt-16 sm:mt-4 animate-slide-up"
      >
        <h2 className="font-v2-display text-v2-cream text-[1.1rem] tracking-[0.2em] uppercase mb-5">
          Add an artist
        </h2>

        <label htmlFor="quick-add-handle" className="block font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mb-1.5">
          Instagram *
        </label>
        <input
          id="quick-add-handle"
          autoFocus
          className="w-full bg-v2-ink border border-v2-hairline rounded-sm px-3 py-2 text-sm text-v2-cream font-v2-ui outline-none focus:border-v2-accent placeholder-v2-muted mb-3.5"
          placeholder="@handle or Instagram URL"
          value={handle}
          onChange={(e) => { setHandle(e.target.value); setError('') }}
        />

        <label htmlFor="quick-add-name" className="block font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mb-1.5">
          Display name
        </label>
        <input
          id="quick-add-name"
          className="w-full bg-v2-ink border border-v2-hairline rounded-sm px-3 py-2 text-sm text-v2-cream font-v2-ui outline-none focus:border-v2-accent placeholder-v2-muted mb-4"
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mb-2">Style tags</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STYLE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`font-v2-ui text-[0.7rem] tracking-wide uppercase px-2 py-1 rounded-sm border transition-colors ${
                tags.includes(tag)
                  ? 'border-v2-accent text-v2-accent bg-v2-accent/10'
                  : 'border-v2-hairline text-v2-muted hover:text-v2-cream hover:border-v2-cream'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <p className="font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mb-2">Reference images (optional)</p>
        <div
          className={`border-2 border-dashed rounded-sm px-4 py-5 text-center transition-colors ${
            dragOver ? 'border-v2-accent bg-v2-accent/5' : 'border-v2-hairline'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p className="font-v2-ui text-v2-muted text-xs mb-1">Drop images here, or paste (⌘V)</p>
          <label className="cursor-pointer">
            <span className="font-v2-ui text-xs text-v2-accent tracking-widest uppercase">Choose files</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            />
          </label>
        </div>

        {staged.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {staged.map((file, i) => (
              <div key={`${file.name}-${i}`} className="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Staged reference ${i + 1}`}
                  className="w-14 h-14 object-cover rounded-sm"
                />
                <button
                  type="button"
                  onClick={() => removeStaged(i)}
                  aria-label={`Remove staged image ${i + 1}`}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-v2-ink border border-v2-hairline text-v2-muted text-[0.6rem] hover:text-v2-cream"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="font-v2-ui text-v2-accent text-xs mt-3">{error}</p>}

        {duplicate && (
          <div className="mt-3.5 pt-3.5 border-t border-v2-hairline">
            <p className="font-v2-ui text-v2-muted text-xs mb-2">
              @{cleanHandle} is already in your collection.
            </p>
            <button
              type="button"
              onClick={handleAddToExisting}
              disabled={saving}
              className="font-v2-ui text-xs text-v2-accent tracking-widest uppercase hover:brightness-110 disabled:opacity-40"
            >
              Add images to {duplicate.name || `@${duplicate.handle}`} instead
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-v2-hairline">
          <Link
            to="/gallery?mode=manage"
            onClick={() => onManage?.()}
            className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted hover:text-v2-cream"
          >
            Full manage view
          </Link>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="font-v2-ui text-sm text-v2-muted hover:text-v2-cream px-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !!duplicate}
              className="bg-v2-accent text-v2-cream font-v2-ui text-sm rounded-sm px-5 py-2 transition-colors hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
