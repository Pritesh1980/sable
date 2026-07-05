import { useState } from 'react'
import { PLACEMENTS } from '../data/artists'
import ArtistImage from './ArtistImage'

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function ArtistPicker({ artists, onPick, onClear }) {
  return (
    <div className="mt-2 max-h-52 overflow-y-auto border border-v2-hairline rounded-sm bg-v2-ink">
      <button
        onClick={onClear}
        className="w-full text-left px-3 py-2 font-v2-ui text-sm text-v2-muted hover:text-v2-cream border-b border-v2-hairline"
      >
        No style steering
      </button>
      {artists.map((artist) => (
        <button
          key={artist.id}
          onClick={() => onPick(artist.id)}
          className="w-full flex items-center gap-2 text-left px-3 py-2 font-v2-ui text-sm text-v2-cream hover:bg-v2-hairline/40"
        >
          <ArtistImage src={artist.images?.[0]} label={artist.name || `@${artist.handle}`} className="w-7 h-7 object-cover rounded-sm shrink-0" monogramClassName="text-xs" />
          <span className="truncate">{artist.name || `@${artist.handle}`}</span>
        </button>
      ))}
    </div>
  )
}

// Slide-in composer replacing the old stacked-forms Concepts layout: steer →
// idea → placement → generate/copy, plus disclosures for AI setup, prompt
// packs, and a paste-back drop zone for the copy-prompt round trip.
export default function ConceptComposer({
  open,
  onClose,
  artists = [],
  steerArtistId,
  onSteerArtist,
  idea,
  onIdeaChange,
  placement,
  onPlacementChange,
  hasApiKey,
  hasOpenai,
  hasGemini,
  provider,
  setProvider,
  generating,
  genError,
  onGenerate,
  onCopyPrompt,
  copied,
  onPasteImage,
  aiSetupOpen,
  onToggleAiSetup,
  aiSetupPanel,
  promptPacksOpen,
  onTogglePromptPacks,
  promptPackPanel,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  if (!open) return null

  const steerArtist = artists.find((a) => a.id === steerArtistId) || null

  function pick(artistId) {
    onSteerArtist(artistId)
    setPickerOpen(false)
  }

  function handleFile(file) {
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => onPasteImage(e.target.result)
    reader.readAsDataURL(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) { handleFile(file); return }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) onPasteImage(url)
  }

  function handlePaste(e) {
    const file = Array.from(e.clipboardData?.files || [])[0]
    if (file) handleFile(file)
  }

  return (
    <aside className="fixed top-0 right-0 bottom-0 z-40 w-full max-w-[420px] bg-v2-surface border-l border-v2-hairline p-7 overflow-y-auto shadow-[-30px_0_60px_rgba(0,0,0,0.4)]">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-v2-display text-v2-cream text-[1.1rem] tracking-[0.2em] uppercase">New concept</h2>
        <button
          onClick={onClose}
          className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted hover:text-v2-cream"
        >
          Close
        </button>
      </div>
      <p className="font-v2-ui text-sm text-v2-muted mb-5">
        {steerArtist
          ? `Steering is pre-set to ${steerArtist.name || `@${steerArtist.handle}`}.`
          : 'Describe an idea, or steer it toward one of your artists.'}
      </p>

      <div className="flex items-center gap-3 bg-v2-ink border border-v2-hairline rounded-sm px-3.5 py-3 mb-1">
        {steerArtist ? (
          <>
            <ArtistImage src={steerArtist.images?.[0]} label={steerArtist.name || `@${steerArtist.handle}`} className="w-11 h-11 object-cover rounded-sm shrink-0" monogramClassName="text-lg" />
            <div className="flex-1 min-w-0">
              <b className="block font-v2-display text-v2-cream text-sm uppercase tracking-[0.1em] truncate">
                {steerArtist.name || `@${steerArtist.handle}`}
              </b>
              <span className="font-v2-ui text-v2-muted text-[0.68rem] tracking-[0.06em]">
                {(steerArtist.tags || []).join(' · ')}
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 font-v2-ui text-sm text-v2-muted">No style steering</div>
        )}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="font-v2-ui text-xs text-v2-muted hover:text-v2-cream"
        >
          change
        </button>
      </div>
      {pickerOpen && (
        <ArtistPicker
          artists={artists}
          onPick={pick}
          onClear={() => { onSteerArtist(''); setPickerOpen(false) }}
        />
      )}

      <label htmlFor="composer-idea" className="block font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mt-5 mb-1.5">
        Your idea
      </label>
      <textarea
        id="composer-idea"
        rows={4}
        value={idea}
        onChange={(e) => onIdeaChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="A raven perched on a broken pocket watch, feathers dissolving into smoke, heavy black shading"
        className="w-full bg-v2-ink text-v2-cream border border-v2-hairline rounded-sm px-3.5 py-3 font-v2-ui text-sm outline-none focus:border-v2-accent resize-y"
      />

      <label htmlFor="composer-placement" className="block font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mt-5 mb-1.5">
        Placement
      </label>
      <div id="composer-placement" className="flex flex-wrap gap-1.5">
        {PLACEMENTS.map((p) => (
          <button
            key={p}
            onClick={() => onPlacementChange(placement === p ? '' : p)}
            className={`font-v2-ui text-xs tracking-[0.04em] rounded-full border px-3 py-1.5 transition-colors ${
              placement === p ? 'text-v2-cream border-v2-accent' : 'text-v2-muted border-v2-hairline hover:text-v2-cream'
            }`}
          >
            {capitalize(p)}
          </button>
        ))}
      </div>

      {genError && (
        <p className="text-v2-accent font-v2-ui text-xs mt-3 leading-relaxed">{genError}</p>
      )}

      {hasOpenai && hasGemini && hasApiKey && (
        <div className="flex gap-1 mt-4">
          {[{ id: 'gemini', label: 'Gemini' }, { id: 'dalle', label: 'DALL·E' }].map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`font-v2-ui text-[0.68rem] tracking-widest uppercase rounded-sm border px-3 py-1 transition-colors ${
                provider === p.id ? 'border-v2-accent text-v2-cream' : 'border-v2-hairline text-v2-muted hover:text-v2-cream'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2.5 mt-4">
        <button
          onClick={() => (hasApiKey ? onGenerate() : onToggleAiSetup(true))}
          disabled={generating || !idea.trim()}
          className="flex-1 bg-v2-accent text-v2-cream font-v2-ui text-sm font-medium rounded-sm px-4 py-3 transition-colors hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {generating ? 'Generating…' : 'Generate image'}
        </button>
        <button
          onClick={onCopyPrompt}
          disabled={!idea.trim()}
          className="flex-1 border border-v2-hairline text-v2-cream font-v2-ui text-sm rounded-sm px-4 py-3 transition-colors hover:border-v2-accent disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {copied ? 'Copied ✓' : 'Copy prompt instead'}
        </button>
      </div>
      <p className="font-v2-ui text-xs text-v2-muted leading-relaxed mt-3.5">
        {hasApiKey
          ? 'Generates with your saved API key. Results land on this wall — open one full-screen for variants and relief STL export.'
          : 'No key? "Copy prompt" builds a structured prompt for ChatGPT / Claude / Gemini — paste the result back below.'}
      </p>

      <div className="mt-6 pt-5 border-t border-v2-hairline">
        <p className="font-v2-ui text-[0.68rem] tracking-[0.14em] uppercase text-v2-muted mb-2">Paste a result back</p>
        <div
          role="button"
          tabIndex={0}
          aria-label="Paste or drop a result image here"
          className={`border-2 border-dashed rounded-sm px-4 py-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-v2-accent ${
            dragOver ? 'border-v2-accent bg-v2-accent/5' : 'border-v2-hairline'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onClick={(e) => e.currentTarget.focus()}
        >
          <p className="font-v2-ui text-v2-muted text-xs mb-1">Drop an image here, or paste it (⌘V)</p>
          <label className="cursor-pointer">
            <span className="font-v2-ui text-xs text-v2-accent tracking-widest uppercase">Choose file</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-v2-hairline">
        <button
          onClick={() => onTogglePromptPacks(!promptPacksOpen)}
          className="font-v2-ui text-xs tracking-widest uppercase text-v2-muted hover:text-v2-cream"
        >
          {promptPacksOpen ? '− Prompt packs' : '+ Prompt packs'}
        </button>
        {promptPacksOpen && <div className="mt-3">{promptPackPanel}</div>}
      </div>

      <div className="mt-4">
        <button
          onClick={() => onToggleAiSetup(!aiSetupOpen)}
          className="font-v2-ui text-sm text-v2-muted hover:text-v2-cream underline underline-offset-4"
        >
          AI setup {hasApiKey ? '(key set)' : '(no key — copy-prompt only)'}
        </button>
        {aiSetupOpen && <div className="mt-3">{aiSetupPanel}</div>}
      </div>
    </aside>
  )
}
