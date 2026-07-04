import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ConceptComposer from '../components/ConceptComposer'
import ConceptPiece from '../components/ConceptPiece'
import ConceptVariantLab from '../components/ConceptVariantLab'
import ConceptViewer from '../components/ConceptViewer'
import PromptPackComposer from '../components/PromptPackComposer'
import ReliefStlDrawer from '../components/ReliefStlDrawer'
import SavedPromptPack from '../components/SavedPromptPack'
import {
  addConceptVariant,
  markBestVariant,
  removeConceptVariant,
  updateVariantRating,
} from '../data/conceptVariants'
import { buildConceptWallItems } from '../data/concepts'
import { clearComposerDraft, loadComposerDraft, saveComposerDraft } from '../data/composerDraft'
import { generateImageWithGemini } from '../data/geminiImage'

const TEXT_SYSTEM_PROMPT = `You are a creative tattoo concept consultant with deep knowledge of tattoo styles, placement, and aesthetics. When given a concept prompt, provide:
1. A vivid visual description of the tattoo concept (2-3 sentences)
2. Recommended style (from: dark-illustrative, fine-line, blackwork, surrealism, dark-fantasy, realism)
3. Suggested placement
4. Mood/aesthetic notes (1-2 sentences)
5. Which type of artist would suit this best (brief)

Be specific, evocative, and editorial in tone. Format as plain text with labelled sections.`

function buildTextPrompt(userPrompt) {
  return `${TEXT_SYSTEM_PROMPT}\n\nA client wants a tattoo based on this prompt: "${userPrompt}"`
}

function buildImagePrompt(userPrompt) {
  return `Professional tattoo concept art: ${userPrompt}. Black ink tattoo design on white background, fine line illustration, high contrast, clean lines, suitable for tattooing, tattoo flash art style, no text, no watermarks`
}

function conceptActionLabel(concept) {
  return String(concept?.prompt || concept?.id || 'this concept').trim() || 'this concept'
}

async function generateWithDallE(apiKey, prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: buildImagePrompt(prompt),
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
          className="flex-1 bg-v2-ink border border-v2-hairline rounded-sm px-3 py-2 text-sm text-v2-cream outline-none focus:border-v2-accent font-v2-ui"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave(draft)}
        />
        <button
          onClick={() => onSave(draft)}
          className="px-4 py-2 bg-v2-accent text-v2-cream text-sm font-v2-ui rounded-sm transition-colors hover:brightness-110"
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

export default function Concepts({ concepts, setConcepts, artists = [], ideas = [] }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialDraft = useMemo(() => loadComposerDraft(), [])
  const [steerArtistId, setSteerArtistId] = useState(initialDraft.steerArtistId)
  const [idea, setIdea] = useState(initialDraft.idea)
  const [placement, setPlacement] = useState(initialDraft.placement)
  const [composerOpen, setComposerOpen] = useState(false)
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

  const hasOpenai = Boolean(openaiKey)
  const hasGemini = Boolean(geminiKey)
  const hasApiKey = hasOpenai || hasGemini

  // t7: a steer=<artistId> query param (from the Wall viewer's "G" flow) opens
  // the composer pre-steered on mount. Artist ids may contain dots (zoia.ink).
  useEffect(() => {
    const steerParam = searchParams.get('steer')
    if (steerParam) {
      setSteerArtistId(steerParam)
      setComposerOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        : await generateWithDallE(openaiKey, idea)
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
    const full = buildTextPrompt(idea)
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
    setConcepts((prev) => prev.filter((c) => c.id !== id))
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

  function makeStlFromVariant(input) {
    setStlSource({
      imageUrl: input.imageUrl,
      label: input.variantLabel,
      filenameSeed: `${input.conceptLabel} ${input.variantLabel}`,
    })
  }

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
    <div className="p-4 bg-v2-ink border border-v2-hairline rounded-sm">
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
      <header className="sticky top-0 z-10 flex items-center gap-8 px-8 py-3.5 bg-v2-ink/[.88] backdrop-blur-md border-b border-v2-hairline">
        <div className="font-v2-display text-[1.35rem] tracking-[0.28em] uppercase text-v2-cream">
          Sable<span className="text-v2-accent">.</span>
        </div>
        <nav className="flex items-center gap-6 flex-1">
          <button
            onClick={() => navigate('/')}
            className="font-v2-ui text-sm tracking-wide uppercase pb-1 border-b-2 border-transparent text-v2-muted hover:text-v2-cream"
          >
            Artists
          </button>
          <button className="font-v2-ui text-sm tracking-wide uppercase pb-1 border-b-2 border-v2-accent text-v2-cream">
            Concepts
          </button>
        </nav>
        <button
          onClick={() => setComposerOpen(true)}
          className="font-v2-ui text-sm text-v2-ink bg-v2-cream rounded-sm px-4 py-1.5 font-semibold hover:brightness-95 transition-[filter]"
        >
          + New concept
        </button>
      </header>

      {wallItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-32 text-center px-6">
          <p className="font-v2-display text-v2-cream text-xl tracking-wide">
            No concepts yet — describe an idea to start the wall.
          </p>
          <button
            onClick={() => setComposerOpen(true)}
            className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-5 py-2 transition-colors"
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
              <div key={c.id} className="bg-v2-surface border border-v2-hairline rounded-sm p-4">
                <p className="font-v2-ui text-[0.625rem] tracking-widest uppercase text-v2-muted mb-1">Concept</p>
                <p className="font-v2-display text-v2-cream text-sm italic mb-3">"{c.prompt}"</p>
                <SavedPromptPack promptPack={c.promptPack} />
                <ConceptVariantLab
                  concept={c}
                  onAddVariant={addVariant}
                  onMarkBest={markBest}
                  onDeleteVariant={deleteVariant}
                  onRateVariant={rateVariant}
                  onMakeStl={makeStlFromVariant}
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
          items={wallItems}
          initialIndex={viewerIndex}
          artists={artists}
          open={viewerOpen}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDeleteFromViewer}
          onSaveTags={saveTags}
          onAddVariant={addVariant}
          onMarkBest={markBest}
          onDeleteVariant={deleteVariant}
          onRateVariant={rateVariant}
          onMakeStl={makeStlFromVariant}
        />
      )}

      <ReliefStlDrawer
        source={stlSource}
        onClose={() => setStlSource(null)}
      />
    </div>
  )
}
