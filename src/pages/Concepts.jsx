import { useState } from 'react'
import { Link } from 'react-router-dom'
import ConceptVariantLab from '../components/ConceptVariantLab'
import Logo from '../components/Logo'
import PromptPackComposer from '../components/PromptPackComposer'
import ReliefStlDrawer from '../components/ReliefStlDrawer'
import TagPill from '../components/TagPill'
import ArtistImage from '../components/ArtistImage'
import { STYLE_TAGS } from '../data/artists'
import {
  addConceptVariant,
  markBestVariant,
  removeConceptVariant,
  updateVariantRating,
} from '../data/conceptVariants'
import { generateImageWithGemini } from '../data/geminiImage'
import { matchArtistsForIdea } from '../data/planning'
import { getPromptPackFields } from '../data/promptPacks'

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

const DESTINATIONS = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'claude', label: 'Claude.ai', url: 'https://claude.ai' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com' },
  { id: 'aistudio', label: 'AI Studio', url: 'https://aistudio.google.com' },
]

function PasteZone({ conceptId, onImage, onText, onDiscard }) {
  const [mode, setMode] = useState('image')
  const [dragOver, setDragOver] = useState(false)

  function handleFile(file) {
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => onImage(conceptId, e.target.result)
    reader.readAsDataURL(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) { handleFile(file); return }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) onImage(conceptId, url)
  }

  return (
    <div className="p-4 pb-0">
      <div className="flex gap-1 mb-3">
        {['image', 'text'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-sm font-mono text-[0.625rem] tracking-widest uppercase transition-colors border ${
              mode === m
                ? 'border-accent/50 text-accent bg-accent/5'
                : 'border-ink-border text-cream-muted/50 hover:text-cream-muted'
            }`}
          >
            {m === 'image' ? 'Paste image' : 'Paste text'}
          </button>
        ))}
      </div>

      {mode === 'image' ? (
        <div
          className={`border-2 border-dashed rounded-sm p-8 text-center transition-colors ${
            dragOver ? 'border-accent bg-accent/5' : 'border-ink-muted'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p className="text-cream-muted/60 text-xs font-mono mb-1">Drop image here</p>
          <p className="text-cream-muted/30 text-[0.625rem] font-mono mb-3">or</p>
          <label className="cursor-pointer">
            <span className="text-xs font-mono text-accent hover:text-accent-hover transition-colors tracking-widest uppercase">
              Choose file
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        </div>
      ) : (
        <textarea
          autoFocus
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
          rows={7}
          placeholder="Paste the AI response here…"
          id={`paste-text-${conceptId}`}
        />
      )}

      <div className="flex justify-end gap-3 mt-3 mb-4">
        <button
          onClick={onDiscard}
          className="text-[0.625rem] font-mono text-cream-muted/60 hover:text-cream-muted transition-colors tracking-widest uppercase"
        >
          Discard
        </button>
        {mode === 'text' && (
          <button
            onClick={() => {
              const val = document.getElementById(`paste-text-${conceptId}`)?.value
              if (val) onText(conceptId, val)
            }}
            className="text-[0.625rem] font-mono text-accent hover:text-accent-hover transition-colors tracking-widest uppercase"
          >
            Save
          </button>
        )}
      </div>
    </div>
  )
}

function SavedPromptPack({ promptPack }) {
  const [activeField, setActiveField] = useState('')
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState('')
  const fields = getPromptPackFields(promptPack)
  if (!fields.length) return null

  const active = fields.find((field) => field.field === activeField) || fields[0]

  async function copySavedPrompt() {
    try {
      await navigator.clipboard.writeText(active.value)
      setCopied(active.field)
      setCopyError('')
      setTimeout(() => setCopied(''), 1600)
    } catch {
      setCopyError('Could not copy. Select the prompt text and copy manually.')
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-border/40">
      <p className="text-[0.625rem] font-mono text-accent/70 tracking-widest uppercase mb-2">Saved prompt pack</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {fields.map((field) => (
          <button
            key={field.id}
            onClick={() => setActiveField(field.field)}
            className={`px-2 py-1 rounded-sm border text-[0.625rem] font-mono tracking-widest uppercase transition-colors ${
              active.field === field.field
                ? 'border-accent/50 text-accent bg-accent/5'
                : 'border-ink-border text-cream-muted/60 hover:text-cream-muted'
            }`}
          >
            {field.label}
          </button>
        ))}
      </div>
      <textarea
        readOnly
        className="w-full bg-ink-black border border-ink-border rounded-sm px-3 py-2 text-xs text-cream-muted outline-none font-body resize-none"
        rows={5}
        value={active.value}
      />
      <button
        onClick={copySavedPrompt}
        className="mt-2 text-[0.625rem] font-mono text-accent hover:text-accent-hover transition-colors tracking-widest uppercase"
      >
        {copied === active.field ? 'Copied' : `Copy ${active.label}`}
      </button>
      {copyError && <p className="text-xs font-mono text-accent mt-2">{copyError}</p>}
    </div>
  )
}

function KeyField({ label, help, placeholder, value, onSave, onRemove }) {
  const [draft, setDraft] = useState(value)
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">{label}</p>
      <p className="text-cream-muted/60 text-xs font-body mb-2 leading-relaxed">{help}</p>
      <div className="flex gap-2">
        <input
          type="password"
          className="flex-1 bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/40"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave(draft)}
        />
        <button
          onClick={() => onSave(draft)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-sm transition-colors"
        >
          Save
        </button>
      </div>
      {value && (
        <button
          onClick={() => { setDraft(''); onRemove() }}
          className="mt-2 text-[0.625rem] font-mono text-cream-muted/40 hover:text-accent transition-colors tracking-widest uppercase"
        >
          Remove key
        </button>
      )}
    </div>
  )
}

export default function Concepts({ concepts, setConcepts, artists = [], ideas = [] }) {
  const [prompt, setPrompt] = useState('')
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('openai_api_key') || '')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [showKeyConfig, setShowKeyConfig] = useState(false)
  const [provider, setProvider] = useState('gemini')
  const [steerArtistId, setSteerArtistId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pasting, setPasting] = useState(null)
  const [stlSource, setStlSource] = useState(null)

  const hasOpenai = Boolean(openaiKey)
  const hasGemini = Boolean(geminiKey)
  const hasApiKey = hasOpenai || hasGemini

  function persistKey(which, value) {
    const v = value.trim()
    const storageKey = which === 'gemini' ? 'gemini_api_key' : 'openai_api_key'
    if (which === 'gemini') setGeminiKey(v)
    else setOpenaiKey(v)
    if (v) localStorage.setItem(storageKey, v)
    else localStorage.removeItem(storageKey)
  }

  async function generate() {
    if (!prompt.trim() || generating) return
    const useGemini = hasGemini && (provider === 'gemini' || !hasOpenai)
    setGenError(null)
    setGenerating(true)
    try {
      const steerArtist = artists.find((a) => a.id === steerArtistId)
      const dataUrl = useGemini
        ? await generateImageWithGemini(geminiKey, {
            prompt,
            styleDescriptor: steerArtist?.styleDescriptor || '',
            tags: steerArtist?.tags || [],
          })
        : await generateWithDallE(openaiKey, prompt)
      const concept = {
        id: Date.now().toString(),
        prompt,
        imageUrl: dataUrl,
        response: '',
        tags: steerArtist?.tags || [],
        provider: useGemini ? 'gemini' : 'dalle',
        createdAt: new Date().toISOString(),
      }
      setConcepts((prev) => [concept, ...prev])
      setPrompt('')
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function copyPrompt() {
    if (!prompt.trim()) return
    const full = buildTextPrompt(prompt)
    await navigator.clipboard.writeText(full)
    setCopied(true)
    const concept = {
      id: Date.now().toString(),
      prompt,
      fullPrompt: full,
      imageUrl: '',
      response: '',
      tags: [],
      createdAt: new Date().toISOString(),
    }
    setConcepts((prev) => [concept, ...prev])
    setPasting(concept.id)
    setPrompt('')
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
    setPasting(concept.id)
  }

  function saveImage(id, dataUrl) {
    setConcepts((prev) => prev.map((c) => c.id === id ? { ...c, imageUrl: dataUrl } : c))
    setPasting(null)
  }

  function saveText(id, response) {
    setConcepts((prev) => prev.map((c) => c.id === id ? { ...c, response } : c))
    setPasting(null)
  }

  function saveTags(id, tags) {
    setConcepts((prev) => prev.map((c) => c.id === id ? { ...c, tags } : c))
  }

  function discard(id) {
    setConcepts((prev) => prev.filter((c) => c.id !== id))
    setPasting(null)
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

  return (
    <div className="min-h-screen bg-ink-black max-w-5xl mx-auto px-4 md:px-8 pt-safe-top pb-24">

      <div className="pt-12 pb-6 flex items-end justify-between">
        <div>
          <Logo size={24} className="mb-2" />
          <h1 className="font-display text-3xl text-cream">AI Concepts</h1>
        </div>
        <button
          onClick={() => setShowKeyConfig((v) => !v)}
          className="flex items-center gap-1.5 font-mono text-cream-muted/50 hover:text-cream-muted text-[0.625rem] tracking-widest uppercase transition-colors"
        >
          ⚙ {hasApiKey ? 'Key set' : 'Configure AI'}
        </button>
      </div>

      {showKeyConfig && (
        <div className="mb-6 p-4 bg-ink-card border border-ink-border rounded-sm animate-slide-up">
          <KeyField
            label="Gemini API key"
            help="Direct image generation via the Gemini API — paid, billing required (~$0.04/image). For free, skip this and use Copy Prompt → paste into Gemini or AI Studio below. Stored locally on your device only."
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
      )}

      <PromptPackComposer
        ideas={ideas}
        artists={artists}
        onSavePromptPack={savePromptPack}
      />

      <div className="mb-8">
        <textarea
          className="w-full bg-ink-card border border-ink-border rounded-sm px-4 py-3 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 resize-none transition-colors"
          rows={3}
          placeholder="Describe a tattoo concept… e.g. 'A moth emerging from a skull wreathed in dark botanicals'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) hasApiKey ? generate() : copyPrompt() }}
        />

        {genError && (
          <p className="text-accent text-xs font-mono mt-2 leading-relaxed">{genError}</p>
        )}

        {hasApiKey ? (
          <div className="mt-3 space-y-3">
            {hasOpenai && hasGemini && (
              <div className="flex gap-1">
                {[{ id: 'gemini', label: 'Gemini' }, { id: 'dalle', label: 'DALL·E' }].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`px-3 py-1 rounded-sm font-mono text-[0.625rem] tracking-widest uppercase transition-colors border ${
                      provider === p.id ? 'border-accent/50 text-accent bg-accent/5' : 'border-ink-border text-cream-muted/50 hover:text-cream-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {artists.length > 0 && (
              <select
                value={steerArtistId}
                onChange={(e) => setSteerArtistId(e.target.value)}
                className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body"
              >
                <option value="">No style steering</option>
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>Steer by {a.name || `@${a.handle}`}</option>
                ))}
              </select>
            )}
            <button
              onClick={generate}
              disabled={!prompt.trim() || generating}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-cream text-sm font-body rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {generating && <span className="w-3.5 h-3.5 rounded-full border-2 border-cream/30 border-t-cream animate-spin" />}
              {generating ? 'Generating…' : 'Generate image'}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DESTINATIONS.map(({ id, label, url }) => (
                <a
                  key={id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center py-2 border border-ink-border rounded-sm font-mono text-cream-muted hover:text-cream hover:border-cream-muted/50 transition-colors text-[0.6875rem] tracking-widest uppercase"
                >
                  {label} ↗
                </a>
              ))}
            </div>
            <button
              onClick={copyPrompt}
              disabled={!prompt.trim()}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-cream text-sm font-body rounded-sm transition-colors"
            >
              {copied ? 'Prompt Copied ✓' : 'Copy Prompt'}
            </button>
            <p className="text-cream-muted/40 text-[0.625rem] font-mono text-center">
              ⌘ Enter to copy · paste into any AI · bring the result back here
            </p>
          </div>
        )}
      </div>

      {concepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4 opacity-10">✦</span>
          <p className="text-cream-muted/90 font-body text-sm">No concepts yet.</p>
          <p className="text-cream-muted/60 font-body text-xs mt-1">
            {hasApiKey
              ? 'Describe an idea above and tap Generate Image.'
              : 'Describe an idea, copy the prompt, paste into your AI of choice, then bring the result back.'}
          </p>
          <Link
            to="/brief"
            className="text-accent hover:text-accent-hover font-body text-xs mt-2 underline underline-offset-4"
          >
            Or seed one from a Brief idea
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {concepts.map((c) => (
            <div key={c.id} className="bg-ink-card border border-ink-border rounded-sm overflow-hidden animate-slide-up">

              {c.imageUrl ? (
                <div className="relative aspect-square bg-ink-muted">
                  <img src={c.imageUrl} alt={c.prompt} className="w-full h-full object-cover" />
                  <a
                    href="https://firefly.adobe.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Adobe Firefly to take this concept further"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-ink-black/80 hover:bg-ink-black text-cream-muted hover:text-cream text-[0.625rem] font-mono tracking-widest uppercase px-2.5 py-1.5 rounded-sm backdrop-blur-sm transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open in Firefly ↗
                  </a>
                </div>
              ) : pasting === c.id && (
                <PasteZone
                  conceptId={c.id}
                  onImage={saveImage}
                  onText={saveText}
                  onDiscard={() => discard(c.id)}
                />
              )}

              <div className="p-4">
                <p className="text-cream-muted/50 text-[0.625rem] font-mono tracking-widest uppercase mb-1">Concept</p>
                <p className="text-cream font-body text-sm italic mb-3">"{c.prompt}"</p>
                <SavedPromptPack promptPack={c.promptPack} />
                <ConceptVariantLab
                  concept={c}
                  onAddVariant={addVariant}
                  onMarkBest={markBest}
                  onDeleteVariant={deleteVariant}
                  onRateVariant={rateVariant}
                  onMakeStl={makeStlFromVariant}
                />

                {c.response ? (
                  <div
                    className="cursor-pointer"
                    onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  >
                    {selected?.id === c.id ? (
                      <div className="pt-3 border-t border-ink-border">
                        <p className="text-cream-muted text-sm font-body leading-relaxed whitespace-pre-wrap">{c.response}</p>
                      </div>
                    ) : (
                      <p className="text-cream-muted/50 text-[0.625rem] font-mono tracking-widest">
                        AI response saved · tap to expand
                      </p>
                    )}
                  </div>
                ) : !c.imageUrl && pasting !== c.id && (
                  <button
                    onClick={() => setPasting(c.id)}
                    className="text-[0.625rem] font-mono text-accent hover:text-accent-hover transition-colors tracking-widest uppercase"
                  >
                    + Add image or response
                  </button>
                )}

                {/* Style tag picker + artist matching */}
                <div className="mt-3 pt-3 border-t border-ink-border/40">
                  <p className="text-[0.625rem] font-mono text-cream-muted/40 tracking-widest uppercase mb-2">Match to style</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_TAGS.map((tag) => (
                      <TagPill
                        key={tag}
                        tag={tag}
                        active={(c.tags || []).includes(tag)}
                        onClick={() => saveTags(c.id,
                          (c.tags || []).includes(tag)
                            ? (c.tags || []).filter((t) => t !== tag)
                            : [...(c.tags || []), tag]
                        )}
                        small
                      />
                    ))}
                  </div>

                  {(c.tags || []).length > 0 && artists.length > 0 && (() => {
                    const matched = matchArtistsForIdea({ tags: c.tags }, artists).slice(0, 3)
                    if (!matched.length) return null
                    return (
                      <div className="mt-3">
                        <p className="text-[0.625rem] font-mono text-accent/70 tracking-widest uppercase mb-2">Top artist matches</p>
                        <div className="grid grid-cols-3 gap-2">
                          {matched.map(({ artist }) => (
                            <a
                              key={artist.id}
                              href={`https://instagram.com/${artist.handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group"
                            >
                              <div className="aspect-square rounded-sm overflow-hidden bg-ink-muted mb-1">
                                <ArtistImage src={artist.images?.[0]} label={artist.name || `@${artist.handle}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" monogramClassName="text-xl" />
                              </div>
                              <p className="font-display text-cream text-xs leading-tight truncate">{artist.name || `@${artist.handle}`}</p>
                              <p className="font-mono text-cream-muted/40 text-[0.5rem] tracking-widest">#{artist.rank}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <div className="flex justify-between items-center mt-4 pt-3 border-t border-ink-border/40">
                  <p className="text-[0.625rem] font-mono text-cream-muted/30">
                    {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <button
                    aria-label={`Delete concept ${conceptActionLabel(c)}`}
                    onClick={() => setConcepts((prev) => prev.filter((x) => x.id !== c.id))}
                    className="text-[0.625rem] font-mono text-cream-muted/30 hover:text-accent transition-colors tracking-widest uppercase"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReliefStlDrawer
        source={stlSource}
        onClose={() => setStlSource(null)}
      />
    </div>
  )
}
