import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import ConceptComposer from '../components/ConceptComposer'
import ConceptPiece from '../components/ConceptPiece'
import ConceptVariantLab from '../components/ConceptVariantLab'
import ConceptBackupStatus from '../components/ConceptBackupStatus'
import ConceptViewer from '../components/ConceptViewer'
import RefinementComposer from '../components/RefinementComposer'
import RefinementCompare from '../components/RefinementCompare'
import PromptPackComposer from '../components/PromptPackComposer'
import ReliefStlDrawer from '../components/ReliefStlDrawer'
import SkinPreviewDrawer from '../components/SkinPreviewDrawer'
import SavedPromptPack from '../components/SavedPromptPack'
import {
  addConceptVariant,
  markBestVariant,
  removeConceptVariant,
  updateVariantRating,
  createConceptVariant,
  upsertRefinementVariant,
} from '../data/conceptVariants'
import { buildConceptWallItems } from '../data/concepts'
import { clearComposerDraft, loadComposerDraft, saveComposerDraft } from '../data/composerDraft'
import { generateImageWithGemini } from '../data/geminiImage'
import { buildImagePrompt, buildTextPrompt } from '../data/conceptPrompts'
import { useUndoableRemoval } from '../hooks/useUndoableRemoval'
import { useConceptRefinement } from '../hooks/useConceptRefinement'
import { backend } from '../backend'
import { createRelayClient } from '../data/imageJobs/relayClient'
import { pendingImageJobs } from '../data/imageJobs/pendingJobs'
import { prepareRefinementSource } from '../data/imageJobs/prepareSource'
import { knownKeyForUrl } from '../data/blobUrls'
import { resolveAssetPath } from '../data/assetPath'
import { LIMITS } from '../../shared/imageJobs'
import { RefreshCw } from 'lucide-react'

const OFFLINE_RELAY = createRelayClient({ auth: backend.auth })

async function selectedImageBytes(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal })
    if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(response.headers.get('Content-Type')?.split(';')[0])) {
      throw new Error('source_unreadable')
    }
    const reader = response.body.getReader()
    const chunks = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > LIMITS.maxBodyBytes) { await reader.cancel(); throw new Error('source_too_large') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    return new Blob(chunks, { type: response.headers.get('Content-Type').split(';')[0] })
  } finally { clearTimeout(timer) }
}

function imageDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('source_unreadable'))
    reader.readAsDataURL(blob)
  })
}

function conceptActionLabel(concept) {
  return String(concept?.prompt || concept?.id || 'this concept').trim() || 'this concept'
}

async function generateWithDallE(apiKey, fullPrompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${res.status}`)
  }
  const data = await res.json()
  return `data:image/png;base64,${data.data[0].b64_json}`
}

function KeyField({ label, help, placeholder, value, onSave, onRemove }) {
  const [draft, setDraft] = useState(value)
  return (
    <div className="mb-4 last:mb-0">
      <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-cream mb-1">{label}</p>
      <p className="font-v2-ui text-v2-muted text-xs mb-2 leading-relaxed">{help}</p>
      <div className="flex gap-2">
        <input
          type="password"
          className="flex-1 bg-v2-ink border border-v2-hairline rounded-xs px-3 py-2 text-sm text-v2-cream outline-hidden focus:border-v2-accent font-v2-ui"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave(draft)}
        />
        <button
          onClick={() => onSave(draft)}
          className="px-4 py-2 bg-v2-accent text-v2-cream text-sm font-v2-ui rounded-xs transition-colors hover:brightness-110"
        >
          Save
        </button>
      </div>
      {value && (
        <button
          onClick={() => { setDraft(''); onRemove() }}
          className="mt-2 font-v2-ui text-[0.625rem] tracking-widest uppercase text-v2-muted hover:text-v2-accent transition-colors"
        >
          Remove key
        </button>
      )}
    </div>
  )
}

export default function Concepts({ concepts, setConcepts, commitConcepts, artists = [], ideas = [], backupOwnerId,
  onExportBackup, backupRevision, ownerScope = backend.ownerScope, blobs = backend.blobs,
  relay = OFFLINE_RELAY, journal = pendingImageJobs }) {
  const refinement = useConceptRefinement({ ownerId: backupOwnerId, ownerScope, concepts, commitConcepts, blobs, relay, journal })
  const [refinementMessage, setRefinementMessage] = useState('')
  const [manualComparison, setManualComparison] = useState(null)
  // A concept carries its image, variants and notes; deleting one goes through
  // the app's Undo bar rather than being final (#95). Durable: the removal is
  // already persisted, so the offer must outlive the viewer closing.
  const { remove: removeConcept } = useUndoableRemoval(concepts, setConcepts, {
    durable: true,
    message: 'Concept deleted',
    batchMessage: (n) => `${n} concepts deleted`,
    confirmMessage: (n) => (n === 1 ? 'Concept restored' : `${n} concepts restored`),
  })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialDraft = useMemo(() => loadComposerDraft(), [])
  // t7: a steer=<artistId> query param (from the Wall viewer's "G" flow) opens
  // the composer pre-steered on mount, taking priority over any saved draft.
  // Artist ids may contain dots (zoia.ink). Read once, in the initializers
  // below — searchParams is available synchronously at first render, so this
  // needs no effect (#32; this used to run in a mount-only useEffect).
  const [steerArtistId, setSteerArtistId] = useState(
    () => searchParams.get('steer') || initialDraft.steerArtistId
  )
  const [idea, setIdea] = useState(initialDraft.idea)
  const [placement, setPlacement] = useState(initialDraft.placement)
  const [composerOpen, setComposerOpen] = useState(() => Boolean(searchParams.get('steer')))
  const [pendingPasteConceptId, setPendingPasteConceptId] = useState(null)

  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('openai_api_key') || '')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [aiSetupOpen, setAiSetupOpen] = useState(false)
  const [promptPacksOpen, setPromptPacksOpen] = useState(false)
  const [provider, setProvider] = useState('gemini')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [copied, setCopied] = useState(false)

  const [viewerIndex, setViewerIndex] = useState(null)
  const [stlSource, setStlSource] = useState(null)
  const [skinSource, setSkinSource] = useState(null)

  const hasOpenai = Boolean(openaiKey)
  const hasGemini = Boolean(geminiKey)
  const hasApiKey = hasOpenai || hasGemini

  // Device-local draft persistence — same class of data as tattoo_theme, NOT
  // synced. Restored on mount above; cleared explicitly on successful save.
  useEffect(() => {
    saveComposerDraft({ steerArtistId, idea, placement })
  }, [steerArtistId, idea, placement])

  useEffect(() => {
    if (viewerIndex === null) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [viewerIndex])

  function persistKey(which, value) {
    const v = value.trim()
    const storageKey = which === 'gemini' ? 'gemini_api_key' : 'openai_api_key'
    if (which === 'gemini') setGeminiKey(v)
    else setOpenaiKey(v)
    if (v) localStorage.setItem(storageKey, v)
    else localStorage.removeItem(storageKey)
  }

  function finishComposer() {
    setSteerArtistId('')
    setIdea('')
    setPlacement('')
    setPendingPasteConceptId(null)
    setComposerOpen(false)
    clearComposerDraft()
  }

  async function generate() {
    if (!idea.trim() || generating) return
    const useGemini = hasGemini && (provider === 'gemini' || !hasOpenai)
    setGenError(null)
    setGenerating(true)
    try {
      const steerArtist = artists.find((a) => a.id === steerArtistId)
      const dataUrl = useGemini
        ? await generateImageWithGemini(geminiKey, {
            prompt: idea,
            styleDescriptor: steerArtist?.styleDescriptor || '',
            tags: steerArtist?.tags || [],
          })
        : await generateWithDallE(openaiKey, buildImagePrompt(idea, {
            styleDescriptor: steerArtist?.styleDescriptor || '',
            tags: steerArtist?.tags || [],
            placement,
          }))
      const concept = {
        id: Date.now().toString(),
        prompt: idea,
        imageUrl: dataUrl,
        response: '',
        tags: steerArtist?.tags || [],
        steerArtistId: steerArtistId || undefined,
        placement: placement || undefined,
        provider: useGemini ? 'gemini' : 'dalle',
        createdAt: new Date().toISOString(),
      }
      setConcepts((prev) => [concept, ...prev])
      finishComposer()
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function copyPrompt() {
    if (!idea.trim()) return
    const steerArtist = artists.find((a) => a.id === steerArtistId)
    const full = buildTextPrompt(idea, {
      styleDescriptor: steerArtist?.styleDescriptor || '',
      tags: steerArtist?.tags || [],
      placement,
    })
    await navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function savePromptPack(pack) {
    const concept = {
      id: Date.now().toString(),
      prompt: pack.sourceSummary,
      promptPack: pack,
      imageUrl: '',
      response: '',
      tags: [],
      createdAt: pack.createdAt,
    }
    setConcepts((prev) => [concept, ...prev])
    setPendingPasteConceptId(concept.id)
  }

  // Paste-back path: an image dropped/pasted/chosen inside the composer lands
  // identically to a generated result — either attached to a pending
  // prompt-pack concept, or as a brand new concept from the current idea.
  function handleComposerPaste(dataUrlOrUrl) {
    if (pendingPasteConceptId) {
      setConcepts((prev) => prev.map((c) => (
        c.id === pendingPasteConceptId ? { ...c, imageUrl: dataUrlOrUrl } : c
      )))
    } else {
      const steerArtist = artists.find((a) => a.id === steerArtistId)
      const concept = {
        id: Date.now().toString(),
        prompt: idea,
        imageUrl: dataUrlOrUrl,
        response: '',
        tags: steerArtist?.tags || [],
        steerArtistId: steerArtistId || undefined,
        placement: placement || undefined,
        provider: 'pasted',
        createdAt: new Date().toISOString(),
      }
      setConcepts((prev) => [concept, ...prev])
    }
    finishComposer()
  }

  function saveTags(id, tags) {
    setConcepts((prev) => prev.map((c) => c.id === id ? { ...c, tags } : c))
  }

  function discard(id) {
    const index = concepts.findIndex((c) => c.id === id)
    if (index !== -1) removeConcept(index)
  }

  function addVariant(conceptId, input) {
    setConcepts((prev) => prev.map((c) => (
      c.id === conceptId ? addConceptVariant(c, input) : c
    )))
  }

  function markBest(conceptId, variantId) {
    setConcepts((prev) => prev.map((c) => (
      c.id === conceptId ? markBestVariant(c, variantId) : c
    )))
  }

  function deleteVariant(conceptId, variantId) {
    setConcepts((prev) => prev.map((c) => (
      c.id === conceptId ? removeConceptVariant(c, variantId) : c
    )))
  }

  function rateVariant(conceptId, variantId, rating) {
    setConcepts((prev) => prev.map((c) => (
      c.id === conceptId ? updateVariantRating(c, variantId, rating) : c
    )))
  }

  function tryOnSkin(input) {
    setSkinSource({
      conceptId: input.conceptId,
      conceptLabel: input.conceptLabel,
      variantLabel: input.variantLabel,
      imageUrl: input.imageUrl,
    })
  }

  function makeStlFromVariant(input) {
    setStlSource({
      imageUrl: input.imageUrl,
      label: input.variantLabel,
      filenameSeed: `${input.conceptLabel} ${input.variantLabel}`,
    })
  }

  async function refineSource({ conceptId, parentVariantId, imageUrl }) {
    const snapshot = ownerScope.capture()
    setRefinementMessage('')
    setManualComparison(null)
    let blob = null
    try {
      const key = knownKeyForUrl(imageUrl)
      let url
      if (key) {
        if (!key.startsWith(`user/${snapshot.ownerId}/concepts/`) || key.split('/').some(part => !part || part === '.' || part === '..')) {
          throw new Error('owner_changed')
        }
        url = await blobs.getUrl(key)
        ownerScope.assertCurrent(snapshot)
      } else if (imageUrl.startsWith('data:image/')) url = imageUrl
      else {
        const selected = new URL(resolveAssetPath(imageUrl), window.location.href)
        const assets = new URL(`${import.meta.env.BASE_URL}images/`, window.location.origin)
        if (selected.origin === assets.origin && selected.pathname.startsWith(assets.pathname)) url = selected.href
      }
      if (url) blob = await selectedImageBytes(url)
      ownerScope.assertCurrent(snapshot)
    } catch {
      try { ownerScope.assertCurrent(snapshot) } catch { return }
      // No arbitrary external URL fallback: let the user explicitly choose bytes.
    }
    ownerScope.assertCurrent(snapshot)
    await refinement.openSource({ ownerId: snapshot.ownerId, conceptId, parentVariantId }, blob)
  }

  function assertRefinementOwner() {
    const snapshot = ownerScope.capture()
    if (refinement.state.destination && refinement.state.destination.ownerId !== snapshot.ownerId) throw new Error('owner_changed')
    return snapshot
  }

  async function copyRefinementPrompt(prompt) {
    const snapshot = assertRefinementOwner()
    try {
      await navigator.clipboard.writeText(prompt)
      ownerScope.assertCurrent(snapshot)
      setRefinementMessage('Prompt copied. Attach the exported source image separately.')
    } catch {
      try { ownerScope.assertCurrent(snapshot) } catch { return }
      setRefinementMessage('Could not copy the prompt. Select the outgoing text and copy it.')
    }
  }

  function exportRefinementSource() {
    assertRefinementOwner()
    const blob = refinement.state.source?.blob
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    try {
      link.href = url
      link.download = 'sable-refinement-source.png'
      document.body.append(link)
      link.click()
      setRefinementMessage('Source download requested. Check that the file was saved.')
    } catch {
      URL.revokeObjectURL(url)
      setRefinementMessage('Could not request the source download.')
    } finally { link.remove() }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function importManualVariation(file, provider) {
    const snapshot = assertRefinementOwner()
    const destination = refinement.state.destination
    const draft = { ...refinement.state.draft }
    if (!destination || !concepts.some(row => row.id === destination.conceptId)) throw new Error('destination_required')
    const prepared = await prepareRefinementSource(file)
    try {
      ownerScope.assertCurrent(snapshot)
      const imageUrl = await imageDataUrl(prepared.blob)
      ownerScope.assertCurrent(snapshot)
      const variant = createConceptVariant({ provider, title: 'Imported variation', imageUrl, operation: 'refine',
        sourceConceptId: destination.conceptId, parentVariantId: destination.parentVariantId,
        sourceImageDigest: refinement.state.source?.digest,
        refinement: { version: 1, ...draft },
        generation: { version: 1, provider, createdAt: new Date().toISOString(), provenance: 'user-import' } })
      setConcepts(rows => rows.map(row => row.id === destination.conceptId ? upsertRefinementVariant(row, variant) : row))
      setManualComparison({ conceptId: destination.conceptId, variantId: variant.id })
      setRefinementMessage('Variation imported with your provider attribution, not relay-verified provenance.')
    } finally { URL.revokeObjectURL(prepared.previewUrl) }
  }

  function recoverRefinement(action) {
    if (action.kind === 'retry') return refinement.retryUnaccepted({ confirmed: action.confirmed })
    if (action.kind === 'import') return refinement.importRecovered(action.jobId, action.conceptId)
    if (action.kind === 'discard') return refinement.discard(action.jobId)
    return refinement.recover()
  }

  const comparison = manualComparison || refinement.state.comparison
  const comparisonConcept = concepts.find(row => row.id === comparison?.conceptId)
  const comparisonVariant = comparisonConcept?.variants?.find(variant => variant.id === comparison.variantId)
  const sourceConcept = concepts.find(row => row.id === comparisonVariant?.sourceConceptId)
  const original = comparisonVariant?.parentVariantId
    ? sourceConcept?.variants?.find(variant => variant.id === comparisonVariant.parentVariantId)
    : sourceConcept
  const comparisonPanel = comparisonVariant && <RefinementCompare original={original} variant={comparisonVariant}
    parentAvailable={Boolean(original?.imageUrl)}
    onMarkBest={variantId => markBest(comparison.conceptId, variantId)}
    onRate={(variantId, rating) => rateVariant(comparison.conceptId, variantId, rating)}
    onTryOn={input => { refinement.close(); tryOnSkin({ ...input, conceptId: comparison.conceptId, conceptLabel: comparisonConcept.prompt }) }} />

  const wallItems = useMemo(() => buildConceptWallItems(concepts, artists), [concepts, artists])
  // Concepts without a saved image can't live on an image wall — a pasted-back
  // result (or a prompt pack awaiting one) stays here until it has one.
  const draftConcepts = useMemo(() => concepts.filter((c) => !c.imageUrl), [concepts])
  const viewerOpen = viewerIndex !== null

  function openViewer(item) {
    setViewerIndex(wallItems.indexOf(item))
  }

  function handleDeleteFromViewer(id) {
    discard(id)
    setViewerIndex(null)
  }

  const aiSetupPanel = (
    <div className="p-4 bg-v2-ink border border-v2-hairline rounded-xs">
      <KeyField
        label="Gemini API key"
        help="Direct image generation via the Gemini API — paid, billing required (~$0.04/image). For free, skip this and use Copy Prompt below. Stored locally on your device only."
        placeholder="AIza…"
        value={geminiKey}
        onSave={(v) => persistKey('gemini', v)}
        onRemove={() => persistKey('gemini', '')}
      />
      <KeyField
        label="OpenAI API key"
        help="Image generation via DALL·E 3 (paid). Stored locally on your device only."
        placeholder="sk-…"
        value={openaiKey}
        onSave={(v) => persistKey('openai', v)}
        onRemove={() => persistKey('openai', '')}
      />
    </div>
  )

  const promptPackPanel = (
    <PromptPackComposer ideas={ideas} artists={artists} onSavePromptPack={savePromptPack} />
  )

  return (
    <div className="min-h-screen bg-v2-ink">
      <header className="sticky top-0 z-10 flex items-center gap-4 px-4 sm:gap-8 sm:px-8 py-3.5 bg-v2-ink/[.88] backdrop-blur-md border-b border-v2-hairline">
        <div className="hidden sm:block font-v2-display text-[1.35rem] tracking-[0.28em] uppercase text-v2-cream">
          Sable<span className="text-v2-accent">.</span>
        </div>
        <nav className="flex items-center gap-4 sm:gap-6 flex-1">
          <button
            onClick={() => navigate('/')}
            className="font-v2-ui text-sm tracking-wide uppercase min-h-11 flex items-center border-b-2 border-transparent text-v2-muted hover:text-v2-cream"
          >
            Artists
          </button>
          <button className="font-v2-ui text-sm tracking-wide uppercase min-h-11 flex items-center border-b-2 border-v2-accent text-v2-cream">
            Concepts
          </button>
        </nav>
        <button
          onClick={() => setComposerOpen(true)}
          className="font-v2-ui text-sm text-v2-ink bg-v2-cream rounded-xs px-4 min-h-11 font-semibold hover:brightness-95 transition-[filter]"
        >
          + New concept
        </button>
      </header>

      <section aria-label="Refinement recovery" className="flex flex-wrap items-center justify-between gap-2 border-b border-v2-hairline px-4 sm:px-8 py-2 font-v2-ui text-sm text-v2-muted">
        <span role="status">{refinement.state.phase === 'saved' ? 'Variation saved' : refinement.state.recovering
          ? 'Checking refinement recovery' : refinement.state.pending || refinement.state.recoverableJobs.length
            ? 'Refinement needs attention' : 'Refinement recovery'}</span>
        <button type="button" onClick={() => refinement.recover({ open: true })}
          className="inline-flex min-h-11 items-center gap-2 px-3 text-v2-cream focus-visible:outline-2 hover:text-v2-accent">
          <RefreshCw size={18} aria-hidden="true" />Check recovery
        </button>
      </section>

      {wallItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-32 text-center px-6">
          <p className="font-v2-display text-v2-cream text-xl tracking-wide">
            No concepts yet — describe an idea to start the wall.
          </p>
          <button
            onClick={() => setComposerOpen(true)}
            className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-xs px-5 min-h-11 transition-colors"
          >
            + New concept
          </button>
        </div>
      ) : (
        <main className="columns-[280px] gap-[6px] p-[6px]">
          {wallItems.map((item) => (
            <ConceptPiece key={item.id} item={item} onOpen={openViewer} />
          ))}
        </main>
      )}

      {draftConcepts.length > 0 && (
        <section className="max-w-3xl mx-auto px-4 md:px-8 py-10">
          <p className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted mb-4">
            Drafts — awaiting an image
          </p>
          <div className="space-y-4">
            {draftConcepts.map((c) => (
              <div key={c.id} className="bg-v2-surface border border-v2-hairline rounded-xs p-4">
                <p className="font-v2-ui text-[0.625rem] tracking-widest uppercase text-v2-muted mb-1">Concept</p>
                <p className="font-v2-display text-v2-cream text-sm italic mb-3">"{c.prompt}"</p>
                <SavedPromptPack promptPack={c.promptPack} />
                <ConceptVariantLab
                  concepts={concepts}
                  concept={c}
                  onAddVariant={addVariant}
                  onMarkBest={markBest}
                  onDeleteVariant={deleteVariant}
                  onRateVariant={rateVariant}
                  onMakeStl={makeStlFromVariant}
                  onTryOnSkin={tryOnSkin}
                  onRefine={refineSource}
                />
                <div className="flex justify-end mt-4 pt-3 border-t border-v2-hairline">
                  <button
                    aria-label={`Delete concept ${conceptActionLabel(c)}`}
                    onClick={() => discard(c.id)}
                    className="font-v2-ui text-[0.625rem] tracking-widest uppercase text-v2-muted hover:text-v2-accent transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {backupOwnerId && onExportBackup && (
        <div className="max-w-3xl mx-auto px-4 md:px-8 pb-10">
          <ConceptBackupStatus key={backupOwnerId} ownerId={backupOwnerId} concepts={concepts} onExport={onExportBackup} revision={backupRevision} />
        </div>
      )}

      <ConceptComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        artists={artists}
        steerArtistId={steerArtistId}
        onSteerArtist={setSteerArtistId}
        idea={idea}
        onIdeaChange={setIdea}
        placement={placement}
        onPlacementChange={setPlacement}
        hasApiKey={hasApiKey}
        hasOpenai={hasOpenai}
        hasGemini={hasGemini}
        provider={provider}
        setProvider={setProvider}
        generating={generating}
        genError={genError}
        onGenerate={generate}
        onCopyPrompt={copyPrompt}
        copied={copied}
        onPasteImage={handleComposerPaste}
        aiSetupOpen={aiSetupOpen}
        onToggleAiSetup={setAiSetupOpen}
        aiSetupPanel={aiSetupPanel}
        promptPacksOpen={promptPacksOpen}
        onTogglePromptPacks={setPromptPacksOpen}
        promptPackPanel={promptPackPanel}
      />

      {viewerOpen && (
        <ConceptViewer
          key={viewerIndex}
          items={wallItems}
          initialIndex={viewerIndex}
          artists={artists}
          concepts={concepts}
          open={viewerOpen}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDeleteFromViewer}
          onSaveTags={saveTags}
          onAddVariant={addVariant}
          onMarkBest={markBest}
          onDeleteVariant={deleteVariant}
          onRateVariant={rateVariant}
          onMakeStl={makeStlFromVariant}
          onTryOnSkin={tryOnSkin}
          onRefine={refineSource}
        />
      )}

      <ReliefStlDrawer
        source={stlSource}
        onClose={() => setStlSource(null)}
      />

      <SkinPreviewDrawer
        source={skinSource}
        apiKey={geminiKey}
        onSave={addVariant}
        onClose={() => setSkinSource(null)}
      />

      {refinement.state.open && <RefinementComposer
        key={`${refinement.state.destination?.conceptId}:${refinement.state.destination?.parentVariantId}:${refinement.state.source?.digest}`}
        state={refinement.state}
        capabilities={{ ...refinement.state.capabilities, enabled: Boolean(refinement.state.capabilities?.enabled && commitConcepts?.supported) }}
        persistence={refinement.state.persistence} onDraftChange={refinement.setDraft} onSubmit={refinement.submit}
        onCopyPrompt={copyRefinementPrompt} onExportSource={exportRefinementSource} onImportVariation={importManualVariation}
        onSelectSource={file => refinement.openSource(refinement.state.destination, file)}
        onRecover={recoverRefinement} onClose={refinement.close} destinations={concepts} comparison={comparisonPanel}
        message={refinementMessage}
        backupStatus={backupOwnerId && onExportBackup && <ConceptBackupStatus ownerId={backupOwnerId}
          concepts={concepts} onExport={onExportBackup} revision={backupRevision} />}
      />}
    </div>
  )
}
