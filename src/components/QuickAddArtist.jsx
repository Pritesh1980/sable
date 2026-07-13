import { useRef, useState } from 'react'
import TagPill from './TagPill'
import { STYLE_TAGS, parseInstagramHandle } from '../data/artists'
import { ARTIST_STATUSES } from '../data/planning'
import { compressImages } from '../hooks/useImageUpload'
import { analyzeScreenshotWithGemini } from '../data/screenshotIntake'
import { cosineSimilarity } from '../data/embeddings'
import { buildTasteVector } from '../data/taste'
import { loadVectors } from '../data/styleIndex'
import { getEmbedder } from '../data/embedder'

// One-step onboarding: paste a handle or Instagram URL, pick tags and a status,
// done — no hunting for the row in the maintenance table afterwards.
//
// Screenshot intake (issue #20): choose/paste an Instagram screenshot and a
// Gemini vision call (user key, same pattern as discovery) prefills handle,
// tags and a draft style note; the screenshot becomes the artist's first
// reference image. If the on-device style index exists, the screenshot is also
// scored against the taste model — issue #19's deferred "discovery rescoring",
// possible now that candidates carry images.
export default function QuickAddArtist({ artists = [], onAdd, onClose }) {
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [tags, setTags] = useState([])
  const [status, setStatus] = useState('researching')
  const [error, setError] = useState('')
  const [shot, setShot] = useState('')
  const [styleNote, setStyleNote] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [intakeNote, setIntakeNote] = useState('')
  const [tasteFit, setTasteFit] = useState(null)
  const fileRef = useRef(null)

  function toggleTag(tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  async function handleScreenshot(file) {
    if (!file || !file.type?.startsWith('image/')) return
    const [dataUrl] = await compressImages([file])
    setShot(dataUrl)
    setIntakeNote('')
    analyze(dataUrl)
    scoreTaste(dataUrl)
  }

  async function analyze(dataUrl) {
    const apiKey = localStorage.getItem('gemini_api_key') || ''
    if (!apiKey) {
      setIntakeNote('Screenshot attached. Add a Gemini key (Concepts → AI setup) to auto-fill from screenshots.')
      return
    }
    setAnalyzing(true)
    try {
      const result = await analyzeScreenshotWithGemini(apiKey, dataUrl)
      if (!result) {
        setIntakeNote("Couldn't read artist details from this screenshot — fill them in below.")
      } else {
        if (result.handle) setInput((v) => v || result.handle)
        if (result.name) setName((v) => v || result.name)
        if (result.tags.length) setTags((prev) => [...new Set([...prev, ...result.tags])])
        if (result.styleNote) setStyleNote(result.styleNote)
        setIntakeNote(result.handle ? '' : 'Handle not visible in the screenshot — type it below.')
      }
    } catch (e) {
      console.error('[tattoo] screenshot intake failed:', e)
      setIntakeNote('Analysis failed — check your Gemini key/connection, or fill in below.')
    }
    setAnalyzing(false)
  }

  // Taste-model score for the screenshot itself — only when a style index
  // already exists on this device, so we never surprise-download the model.
  async function scoreTaste(dataUrl) {
    try {
      const vectors = await loadVectors(artists)
      if (vectors.size === 0) return
      const taste = buildTasteVector(artists, (s) => vectors.get(s) || null)
      if (!taste) return
      const embed = await getEmbedder()
      setTasteFit(cosineSimilarity(taste, await embed(dataUrl)))
    } catch (e) {
      console.error('[tattoo] screenshot taste score failed:', e)
    }
  }

  function submit(e) {
    e.preventDefault()
    const handle = parseInstagramHandle(input)
    if (!handle) { setError('Instagram handle is required'); return }
    if (artists.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) {
      setError(`@${handle} is already in your collection`)
      return
    }
    const draft = { handle, name: name.trim(), tags, status }
    if (shot) draft.images = [shot]
    if (styleNote.trim()) draft.styleNote = styleNote.trim()
    onAdd(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-black/95 flex items-start sm:items-center justify-center animate-fade-in overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        onPaste={(e) => {
          const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
          if (file) { e.preventDefault(); handleScreenshot(file) }
        }}
        className="w-full max-w-md bg-ink-card border border-ink-border rounded-sm p-5 m-4 mt-16 sm:mt-4 animate-slide-up"
      >
        <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-4">Add an artist</p>

        {/* Screenshot intake */}
        <div className="mb-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="screenshot-input"
            onChange={(e) => handleScreenshot(e.target.files?.[0])}
          />
          {shot ? (
            <div className="flex items-start gap-3">
              <img src={shot} alt="Screenshot" className="w-16 h-16 object-cover rounded-sm border border-ink-border" />
              <div className="min-w-0">
                {analyzing && (
                  <p className="font-mono text-xs text-cream-muted" role="status">Reading screenshot…</p>
                )}
                {tasteFit !== null && (
                  <p data-testid="intake-taste" className="font-mono text-xs text-accent mt-1">
                    Taste fit {Math.round(tasteFit * 100)}%
                  </p>
                )}
                {intakeNote && <p className="font-body text-xs text-cream-muted/70 mt-1">{intakeNote}</p>}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border border-dashed border-ink-border rounded-sm px-3 py-3 text-left font-body text-sm text-cream-muted hover:border-cream-muted/40 transition-colors"
            >
              From a screenshot — choose or paste an Instagram screenshot to auto-fill
            </button>
          )}
        </div>

        <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">
          Instagram *
        </label>
        <input
          autoFocus
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-mono placeholder-cream-muted/60 mb-3"
          placeholder="@handle or Instagram URL"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
        />

        <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">
          Display name
        </label>
        <input
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 mb-4"
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {styleNote && (
          <>
            <label className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase block mb-1">
              Style note (AI draft)
            </label>
            <textarea
              className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 mb-4 resize-none"
              rows={2}
              value={styleNote}
              onChange={(e) => setStyleNote(e.target.value)}
            />
          </>
        )}

        <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Style tags</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STYLE_TAGS.map((tag) => (
            <TagPill key={tag} tag={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)} small />
          ))}
        </div>

        <p className="text-[0.8125rem] font-mono text-cream-muted/90 tracking-widest uppercase mb-2">Shortlist status</p>
        <select
          className="bg-ink-muted border border-ink-border rounded-sm px-3 py-1.5 text-sm text-cream outline-none focus:border-cream-muted/40 font-body mb-4"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {ARTIST_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {error && <p className="text-accent text-xs font-mono mb-3">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-cream-muted hover:text-cream text-sm font-body transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-sm transition-colors"
          >
            Add Artist
          </button>
        </div>
      </form>
    </div>
  )
}
