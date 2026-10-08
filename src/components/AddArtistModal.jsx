import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ClipboardPaste, ImagePlus, Sparkles, X } from 'lucide-react'
import useDialogFocus, { isTopmostDialog } from '../hooks/useDialogFocus'
import { readCaptureClipboard } from '../data/clipboardIntake'
import { STYLE_TAGS, parseInstagramHandle, createArtist } from '../data/artists'
import { uploadImages, compressImages } from '../hooks/useImageUpload'
import { stampAddedAt } from '../data/wall'
import { normalizeArtistImages } from '../data/artistsPolicy'
import { refIdentity } from '../data/imageRef'
import { analyzeScreenshotWithGemini } from '../data/screenshotIntake'
import { cropImageToDataUrl, dataUrlToFile } from '../data/screenshotCrop'
import { cosineSimilarity, vectorLookup } from '../data/embeddings'
import { buildTasteVector } from '../data/taste'
import { loadVectors } from '../data/styleIndex'
import { getEmbedder } from '../data/embedder'

function emptyAiPrefill() {
  return { handle: null, name: null, styleNote: null, tags: new Set() }
}

function StagedImage({ file, index, onRemove }) {
  const imageRef = useRef(null)
  useEffect(() => {
    const next = URL.createObjectURL(file)
    imageRef.current.src = next
    return () => URL.revokeObjectURL(next)
  }, [file])
  return <div className="flex items-center gap-1">
    <img ref={imageRef} alt={`Staged reference ${index + 1}`} className="w-16 h-16 object-cover rounded-xs" />
    <button type="button" onClick={onRemove} aria-label={`Remove staged image ${index + 1}`} title="Remove image"
      className="w-11 h-11 flex items-center justify-center text-v2-muted hover:text-v2-cream">
      <X size={18} />
    </button>
  </div>
}

// One capture surface for the Wall, Gallery and share landing route.
export default function AddArtistModal({ artists = [], setArtists, userId, onClose, onManage, initial, initialFile = null, initialFilePending = false, onSaved }) {
  const [handle, setHandle] = useState(initial?.handle || '')
  const [name, setName] = useState(initial?.name || '')
  const [tags, setTags] = useState(initial?.tags || [])
  const [status, setStatus] = useState('researching')
  const [staged, setStaged] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [styleNote, setStyleNote] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [intakeNote, setIntakeNote] = useState('')
  const [tasteFit, setTasteFit] = useState(null)
  // True when the score came from an uncropped screenshot, so the number is
  // partly measuring Instagram's UI rather than the tattoo.
  const [tasteRough, setTasteRough] = useState(false)
  // Analysis belongs to one exact staged File. The generation invalidates every
  // async continuation from an image that has since been removed or replaced.
  const stagedRef = useRef([])
  const analysisSeq = useRef(0)
  const tasteSeq = useRef(0)
  const activeAnalysisFile = useRef(null)
  const aiPrefill = useRef(emptyAiPrefill())
  // The staged file as it arrived, so an unwanted crop can be undone — a
  // bounding box can clip real artwork, and an injected one could be
  // deliberately wrong (#24 review).
  const [uncropped, setUncropped] = useState(null)
  // Reading, cropping and scoring are in flight: saving now would store the
  // screenshot the crop was meant to replace.
  const [intakeBusy, setIntakeBusy] = useState(false)
  const [clipboardBusy, setClipboardBusy] = useState(false)
  const [pendingSave, setPendingSave] = useState(null)
  const saveLock = useRef(false)
  const alive = useRef(true)
  const currentUserId = useRef(userId)
  useEffect(() => { currentUserId.current = userId }, [userId])
  const consumedFiles = useRef(new Set())
  const tagRevision = useRef(0)
  const handleRef = useRef(handle)
  const baseline = useRef({ handle: initial?.handle || '', name: initial?.name || '', tags: initial?.tags || [] })
  const dialogRef = useDialogFocus(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      analysisSeq.current += 1
      tasteSeq.current += 1
    }
  }, [])

  useEffect(() => { handleRef.current = handle }, [handle])
  useEffect(() => {
    if (!initialFile?.type?.startsWith('image/') || consumedFiles.current.has(initialFile)) return
    consumedFiles.current.add(initialFile)
    commitStaged([...stagedRef.current, initialFile])
  }, [initialFile])

  // Observe the committed library, not a side effect inside a replayable state updater.
  useEffect(() => {
    if (!pendingSave) return
    // This receipt observes an external host's committed update, then clears the pending operation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingSave(null)
    try {
      if (pendingSave.userId !== userId) throw new Error('Owner changed')
      const artist = artists.find((a) => a.id === pendingSave.artistId && a.generation === pendingSave.generation)
      const savedImages = new Set((artist?.images || []).map(refIdentity))
      if (!artist || !normalizeArtistImages(pendingSave.images).every((image) => savedImages.has(refIdentity(image)))) throw new Error('Artist changed')
      onSaved?.({ kind: pendingSave.kind, artistId: artist.id, imageCount: pendingSave.images.length })
      onClose()
    } catch {
      setError('The library changed during this save. Your capture is still here; try again.')
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }, [pendingSave, artists, userId, onSaved, onClose])

  const dirty = initialFilePending || staged.length > 0 || handle !== baseline.current.handle || name !== baseline.current.name ||
    JSON.stringify(tags) !== JSON.stringify(baseline.current.tags) || styleNote !== '' || status !== 'researching'
  function mayDismiss() {
    return !saveLock.current && (!dirty || window.confirm('Discard this artist capture?'))
  }
  function dismiss() { if (mayDismiss()) onClose() }
  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopmostDialog(dialogRef.current)) return
      event.preventDefault()
      if (!saveLock.current && (!dirty || window.confirm('Discard this artist capture?'))) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dirty, onClose, dialogRef])

  const cleanHandle = parseInstagramHandle(handle)
  const duplicate = cleanHandle
    ? artists.find((a) => a.handle.toLowerCase() === cleanHandle.toLowerCase())
    : null

  function toggleTag(tag) {
    tagRevision.current += 1
    // Once the user touches an AI-added tag, it becomes user-owned and must not
    // be removed later just because the source screenshot is removed.
    aiPrefill.current.tags.delete(tag)
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function commitStaged(next) {
    stagedRef.current = next
    setStaged(next)
  }

  function replaceStagedFile(source, replacement) {
    const index = stagedRef.current.indexOf(source)
    if (index === -1) return false
    const next = [...stagedRef.current]
    next[index] = replacement
    commitStaged(next)
    return true
  }

  function analysisIsCurrent(seq, file = activeAnalysisFile.current) {
    return analysisSeq.current === seq && activeAnalysisFile.current === file
  }

  function clearAiOwnedState() {
    const owned = aiPrefill.current
    aiPrefill.current = emptyAiPrefill()
    tasteSeq.current += 1
    setHandle((value) => (owned.handle !== null && value === owned.handle ? '' : value))
    setName((value) => (owned.name !== null && value === owned.name ? '' : value))
    setStyleNote((value) => (owned.styleNote !== null && value === owned.styleNote ? '' : value))
    setTags((current) => current.filter((tag) => !owned.tags.has(tag)))
    setIntakeNote('')
    setTasteFit(null)
    setTasteRough(false)
    setUncropped(null)
  }

  function startAnalysis(file) {
    const seq = analysisSeq.current + 1
    analysisSeq.current = seq
    activeAnalysisFile.current = file
    analyzeFirst(file, seq)
  }

  function addFiles(files) {
    const images = Array.from(files || []).filter((f) => f.type?.startsWith('image/'))
    if (!images.length) return
    const next = [...stagedRef.current, ...images]
    commitStaged(next)
  }

  async function analyzeFirst(file, seq) {
    const tagsAtStart = tagRevision.current
    setIntakeBusy(true)
    setUncropped(null)
    try {
      const [dataUrl] = await compressImages([file])
      if (!analysisIsCurrent(seq, file)) return

      const apiKey = localStorage.getItem('gemini_api_key') || ''
      if (!apiKey) {
        // Nothing to locate the artwork with, so the score is off the whole
        // screenshot — Instagram chrome included. Say so rather than imply
        // precision the number doesn't have (#24).
        scoreTaste(dataUrl, { rough: true, seq })
        setIntakeNote('Add a Gemini key (Concepts → AI setup) to auto-fill from screenshots.')
        return
      }

      setAnalyzing(true)
      const result = await analyzeScreenshotWithGemini(apiKey, dataUrl)
      if (!analysisIsCurrent(seq, file)) return

      // Crop before embedding and before saving: the same chrome that skews the
      // taste vector is what makes a screenshot look wrong on the Wall.
      const cropped = await cropImageToDataUrl(dataUrl, result?.crop || null)
      if (!analysisIsCurrent(seq, file)) return

      const didCrop = cropped !== dataUrl
      if (didCrop) {
        const cropFile = dataUrlToFile(cropped, `crop-${file.name || 'screenshot'}.jpg`)
        if (cropFile && replaceStagedFile(file, cropFile)) {
          activeAnalysisFile.current = cropFile
          setUncropped({ crop: cropFile, original: file, dataUrl, seq })
        }
      }
      scoreTaste(cropped, { rough: !didCrop, seq })
      if (!result) {
        setIntakeNote("Couldn't read artist details from this screenshot.")
      } else {
        if (result.handle) setHandle((value) => {
          if (value) return value
          aiPrefill.current.handle = result.handle
          return result.handle
        })
        if (result.name) setName((value) => {
          if (value) return value
          aiPrefill.current.name = result.name
          return result.name
        })
        if (result.tags?.length && tagsAtStart === tagRevision.current) setTags((current) => {
          const added = result.tags.filter((tag) => !current.includes(tag))
          added.forEach((tag) => aiPrefill.current.tags.add(tag))
          return [...new Set([...current, ...result.tags])]
        })
        if (result.styleNote) setStyleNote((value) => {
          if (value) return value
          aiPrefill.current.styleNote = result.styleNote
          return result.styleNote
        })
        setIntakeNote(result.handle ? '' : 'Handle not visible in the screenshot — type it above.')
      }
    } catch {
      if (!analysisIsCurrent(seq)) return
      setIntakeNote('Analysis failed — check your Gemini key/connection.')
    } finally {
      if (analysisSeq.current === seq) {
        setAnalyzing(false)
        setIntakeBusy(false)
      }
    }
  }

  function useWholeScreenshot() {
    if (!uncropped) return
    if (uncropped.seq !== analysisSeq.current || activeAnalysisFile.current !== uncropped.crop) {
      setUncropped(null)
      return
    }
    if (!replaceStagedFile(uncropped.crop, uncropped.original)) {
      setUncropped(null)
      return
    }
    activeAnalysisFile.current = uncropped.original
    setTasteFit(null)
    setTasteRough(false)
    scoreTaste(uncropped.dataUrl, { rough: true, seq: uncropped.seq })
    setUncropped(null)
  }

  // Taste-model score for the screenshot — only when a style index already
  // exists on this device, so we never surprise-download the model.
  async function scoreTaste(dataUrl, { rough = false, seq } = {}) {
    const tasteRevision = tasteSeq.current + 1
    tasteSeq.current = tasteRevision
    try {
      const vectors = await loadVectors(artists)
      if (vectors.size === 0) return
      const taste = buildTasteVector(artists, vectorLookup(vectors))
      if (!taste) return
      const embed = await getEmbedder()
      const score = cosineSimilarity(taste, await embed(dataUrl))
      if (seq !== analysisSeq.current || tasteRevision !== tasteSeq.current) return
      setTasteFit(score)
      setTasteRough(rough)
    } catch (e) {
      if (seq !== analysisSeq.current || tasteRevision !== tasteSeq.current) return
      console.error('[tattoo] screenshot taste score failed:', e)
    }
  }

  function removeStaged(i) {
    const removed = stagedRef.current[i]
    if (!removed) return
    const next = stagedRef.current.filter((_, idx) => idx !== i)
    commitStaged(next)
    if (removed !== activeAnalysisFile.current) return

    analysisSeq.current += 1
    activeAnalysisFile.current = null
    setAnalyzing(false)
    setIntakeBusy(false)
    clearAiOwnedState()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type?.startsWith('image/'))
    if (!files.length || saveLock.current) return
    e.preventDefault()
    addFiles(files)
  }

  async function pasteCapture() {
    setClipboardBusy(true)
    const result = await readCaptureClipboard(navigator.clipboard)
    if (!alive.current) return
    setClipboardBusy(false)
    if (saveLock.current) return
    if (result.kind === 'image') addFiles([result.file])
    else if (result.kind === 'text') {
      if (!handleRef.current || window.confirm('Replace the entered Instagram handle?')) {
        aiPrefill.current.handle = null
        setHandle(result.text)
        setError('')
      }
    } else setIntakeNote('Choose a photo or paste a profile link into the Instagram field.')
  }

  async function stampedUploads(scopeId, files) {
    if (!files.length) return []
    const uploaded = await uploadImages(files, { userId, scope: 'artists', id: scopeId, requireStored: true })
    return uploaded.map((u) => stampAddedAt(u))
  }

  async function handleSave(e) {
    e.preventDefault()
    // Enter in a text field submits the form directly, bypassing the disabled
    // button — so the guard has to live here too, or the screenshot the crop was
    // about to replace is what gets stored (#24 review).
    if (initialFilePending || intakeBusy || saveLock.current || clipboardBusy) return
    if (!cleanHandle) {
      setError(handle.trim() ? 'Use an artist handle or profile link, not a post or reel link.' : 'Instagram handle is required')
      return
    }
    if (duplicate) return
    await saveCapture(null)
  }

  async function handleAddToExisting() {
    if (!duplicate || !staged.length || initialFilePending || intakeBusy || clipboardBusy || saveLock.current) return
    await saveCapture(duplicate)
  }

  async function saveCapture(target) {
    saveLock.current = true
    setSaving(true)
    setError('')
    try {
      const owner = userId
      const files = stagedRef.current
      const images = await stampedUploads(target?.id || cleanHandle, files)
      if (!alive.current) return
      if (currentUserId.current !== owner) throw new Error('Owner changed')
      if (stagedRef.current !== files) throw new Error('Capture changed during upload')
      const artist = target || createArtist({ handle: cleanHandle, name: name.trim(), tags, status, styleNote: styleNote.trim(), images }, artists)
      setArtists((prev) => {
        if (!alive.current || currentUserId.current !== owner) return prev
        if (target) return prev.map((a) => a.id === target.id && a.generation === target.generation
          ? { ...a, images: [...(a.images || []), ...images] } : a)
        if (prev.some((a) => a.handle.toLowerCase() === cleanHandle.toLowerCase())) return prev
        const rank = Math.max(0, ...prev.map((a) => a.rank || 0)) + 1
        return [...prev, { ...artist, rank }]
      })
      setPendingSave({ kind: target ? 'images-added' : 'created', artistId: artist.id,
        generation: artist.generation, images, owner, userId })
    } catch {
      if (!alive.current) return
      setError('Could not save this capture. Your photos are still here; try again.')
      saveLock.current = false
      setSaving(false)
    }
  }

  const inputClass = 'w-full min-h-11 bg-v2-ink border border-v2-hairline rounded-xs px-3 py-2 text-sm text-v2-cream font-v2-ui outline-hidden focus:border-v2-accent placeholder-v2-muted'
  return (
    <div className="fixed inset-0 z-[60] bg-v2-ink/90 backdrop-blur-xs flex items-start sm:items-center justify-center overflow-y-auto animate-fade-in"
      onClick={dismiss}>
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="capture-title" tabIndex={-1}
        onSubmit={handleSave} onPaste={handlePaste} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-v2-surface border border-v2-hairline rounded-xs m-3 sm:m-4 my-6 sm:my-4 max-h-[calc(100dvh-3rem)] overflow-y-auto outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-accent">
        <div className="p-5">
          <h2 id="capture-title" className="font-v2-display text-v2-cream text-xl mb-4">Add an artist</h2>
          {initialFilePending && <p role="status" className="font-v2-ui text-xs text-v2-muted mb-3">Loading shared photo...</p>}
          <fieldset disabled={saving} className="min-w-0">
            <div data-testid="capture-images"
              className={`border border-dashed rounded-xs p-3 transition-colors ${dragOver ? 'border-v2-accent bg-v2-accent/5' : 'border-v2-hairline'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)} onDrop={(e) => { if (!saveLock.current) handleDrop(e); else e.preventDefault() }}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative inline-flex min-h-11 items-center gap-2 px-2 cursor-pointer font-v2-ui text-sm text-v2-accent">
                  <ImagePlus size={18} aria-hidden="true" />Choose files
                  <input type="file" accept="image/*" multiple aria-label="Choose files"
                    className="absolute inset-0 opacity-0 w-full cursor-pointer"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                </label>
                <button type="button" onClick={pasteCapture} disabled={clipboardBusy}
                  className="inline-flex min-h-11 items-center gap-2 px-2 font-v2-ui text-sm text-v2-cream disabled:opacity-40">
                  <ClipboardPaste size={18} aria-hidden="true" />{clipboardBusy ? 'Pasting...' : 'Paste'}
                </button>
              </div>
              {staged.length > 0 && <div className="flex flex-wrap gap-2 mt-2">
                {staged.map((file, i) => <StagedImage key={`${file.name}-${i}`} file={file} index={i} onRemove={() => removeStaged(i)} />)}
              </div>}
            </div>
            {staged.length > 0 && <button type="button" disabled={intakeBusy}
              onClick={() => startAnalysis(stagedRef.current[0])}
              className="inline-flex items-center gap-2 min-h-11 font-v2-ui text-xs text-v2-accent disabled:opacity-40">
              <Sparkles size={16} aria-hidden="true" />{localStorage.getItem('gemini_api_key') ? 'Auto-fill' : 'Taste fit'}
            </button>}
            {(analyzing || intakeBusy || tasteFit !== null || intakeNote || uncropped) && <div className="my-2 font-v2-ui text-xs">
              {intakeBusy && <p className="text-v2-muted" role="status">{analyzing ? 'Reading screenshot...' : 'Preparing screenshot...'}</p>}
              {tasteFit !== null && <p data-testid="intake-taste" className="text-v2-accent">
                Taste fit {Math.round(tasteFit * 100)}%{tasteRough ? ' · rough' : ''}
              </p>}
              {uncropped && <p className="text-v2-muted">Cropped to the tattoo.{' '}
                <button type="button" onClick={useWholeScreenshot} className="min-h-11 text-v2-accent underline">Use the whole screenshot</button>
              </p>}
              {intakeNote && <p className="text-v2-muted" role="status">{intakeNote}</p>}
            </div>}
            <label htmlFor="quick-add-handle" className="block font-v2-ui text-xs text-v2-muted mt-4 mb-2">Instagram *</label>
            <input id="quick-add-handle" className={inputClass} placeholder="@handle or Instagram URL"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} value={handle}
              onChange={(e) => { aiPrefill.current.handle = null; handleRef.current = e.target.value; setHandle(e.target.value); setError('') }} />
            {duplicate && <div className="mt-3 font-v2-ui text-xs">
              <p className="text-v2-muted">Already in your collection: @{duplicate.handle}</p>
              <button type="button" onClick={handleAddToExisting} disabled={initialFilePending || intakeBusy || clipboardBusy || !staged.length}
                className="min-h-11 text-v2-accent disabled:opacity-40">
                Add images to {duplicate.name || `@${duplicate.handle}`} instead
              </button>
            </div>}
            <details className="mt-3 border-t border-v2-hairline font-v2-ui">
              <summary className="min-h-11 content-center cursor-pointer text-sm text-v2-muted">Details</summary>
              <label htmlFor="quick-add-name" className="block text-xs text-v2-muted mb-2">Display name</label>
              <input id="quick-add-name" className={inputClass} placeholder="Full name (optional)" value={name}
                onChange={(e) => { aiPrefill.current.name = null; setName(e.target.value) }} />
              <p className="text-xs text-v2-muted mt-3 mb-1">Style tags</p>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_TAGS.map((tag) => <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  aria-pressed={tags.includes(tag)}
                  className={`min-h-11 text-xs px-2 rounded-xs border ${tags.includes(tag) ? 'border-v2-accent text-v2-accent bg-v2-accent/10' : 'border-v2-hairline text-v2-muted'}`}>
                  {tag}
                </button>)}
              </div>
              <label htmlFor="capture-status" className="block text-xs text-v2-muted mt-3 mb-2">Status</label>
              <select id="capture-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                {['researching', 'shortlisted', 'contact-next', 'contacted', 'maybe', 'pass'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <label htmlFor="quick-add-stylenote" className="block text-xs text-v2-muted mt-3 mb-2">Style note</label>
              <textarea id="quick-add-stylenote" rows={2} className={inputClass} value={styleNote}
                onChange={(e) => { aiPrefill.current.styleNote = null; setStyleNote(e.target.value) }} />
            </details>
          </fieldset>
          {error && <p role="alert" className="font-v2-ui text-v2-accent text-xs mt-3">{error}</p>}
          <Link to="/gallery?mode=manage"
            onClick={(e) => { if (!mayDismiss()) e.preventDefault(); else { onManage?.(); onClose() } }}
            className="inline-flex items-center min-h-11 mt-2 font-v2-ui text-xs text-v2-muted hover:text-v2-cream">
            Full manage view
          </Link>
        </div>
        <div className="sticky bottom-0 bg-v2-surface flex justify-end gap-3 px-5 py-3 border-t border-v2-hairline">
          <button type="button" onClick={dismiss} disabled={saving}
            className="min-h-11 px-3 font-v2-ui text-sm text-v2-muted disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={initialFilePending || saving || intakeBusy || clipboardBusy || !!duplicate}
            className="min-h-11 bg-v2-accent text-v2-cream font-v2-ui text-sm rounded-xs px-5 disabled:opacity-30">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
