import { useMemo, useState } from 'react'
import {
  PROMPT_PACK_PROVIDERS,
  buildPromptPackFromFreeText,
  buildPromptPackFromIdea,
  hasPromptPackSource,
} from '../data/promptPacks'

function ideaLabel(idea) {
  return idea?.title || 'Untitled idea'
}

export default function PromptPackComposer({ ideas = [], artists = [], onSavePromptPack }) {
  const [sourceType, setSourceType] = useState('free-text')
  const [prompt, setPrompt] = useState('')
  const [sourceIdeaId, setSourceIdeaId] = useState('')
  const [pack, setPack] = useState(null)
  const [activeField, setActiveField] = useState(PROMPT_PACK_PROVIDERS[0].field)
  const [copiedField, setCopiedField] = useState('')
  const [copyError, setCopyError] = useState('')

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === sourceIdeaId) || null,
    [ideas, sourceIdeaId]
  )

  const canGenerate = hasPromptPackSource({ sourceType, prompt, sourceIdeaId })
  const activePrompt = pack?.[activeField] || ''

  function generatePack() {
    const next = sourceType === 'brief-idea'
      ? buildPromptPackFromIdea(selectedIdea, artists)
      : buildPromptPackFromFreeText(prompt)
    setPack(next)
    setCopiedField('')
    setCopyError('')
  }

  async function copyPrompt(field) {
    const value = pack?.[field]
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setCopyError('')
      setTimeout(() => setCopiedField(''), 1600)
    } catch {
      setCopyError('Could not copy. Select the prompt text and copy manually.')
    }
  }

  function savePack() {
    if (!pack) return
    onSavePromptPack(pack)
    setPack(null)
    setPrompt('')
    setSourceIdeaId('')
    setCopiedField('')
    setCopyError('')
  }

  return (
    <section className="mb-8 bg-ink-card border border-ink-border rounded-sm overflow-hidden">
      <div className="p-4 border-b border-ink-border">
        <p className="text-xs font-mono text-accent tracking-[0.3em] uppercase mb-1">Prompt Pack</p>
        <h2 className="font-display text-2xl text-cream leading-tight">Visual generation workbench</h2>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          {[
            { value: 'free-text', label: 'Free text' },
            { value: 'brief-idea', label: 'Brief idea' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setSourceType(option.value)
                setPack(null)
                setCopyError('')
              }}
              className={`px-3 py-2 rounded-sm border text-[0.6875rem] font-mono tracking-widest uppercase transition-colors ${
                sourceType === option.value
                  ? 'border-accent/50 text-accent bg-accent/5'
                  : 'border-ink-border text-cream-muted hover:text-cream hover:border-cream-muted/40'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {sourceType === 'free-text' ? (
          <textarea
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-4 py-3 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 resize-none transition-colors"
            rows={4}
            placeholder="Describe a tattoo concept to turn into provider-specific prompts..."
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              setPack(null)
            }}
          />
        ) : (
          <select
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-4 py-3 text-sm text-cream outline-none focus:border-cream-muted/40 font-body"
            value={sourceIdeaId}
            onChange={(event) => {
              setSourceIdeaId(event.target.value)
              setPack(null)
            }}
          >
            <option value="">Select a Brief idea...</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>{ideaLabel(idea)}</option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap gap-2 justify-between items-center">
          <button
            onClick={generatePack}
            disabled={!canGenerate}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-cream text-sm font-body rounded-sm transition-colors"
          >
            Generate Prompt Pack
          </button>
          {pack && (
            <button
              onClick={savePack}
              className="px-4 py-2 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-sm transition-colors"
            >
              Save Pack
            </button>
          )}
        </div>

        {pack && (
          <div className="pt-4 border-t border-ink-border space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {PROMPT_PACK_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => setActiveField(provider.field)}
                  className={`px-3 py-2 rounded-sm border text-[0.6875rem] font-mono tracking-widest uppercase transition-colors ${
                    activeField === provider.field
                      ? 'border-accent/50 text-accent bg-accent/5'
                      : 'border-ink-border text-cream-muted hover:text-cream hover:border-cream-muted/40'
                  }`}
                >
                  {provider.label}
                </button>
              ))}
            </div>

            <textarea
              readOnly
              className="w-full bg-ink-black border border-ink-border rounded-sm px-4 py-3 text-sm text-cream outline-none font-body resize-none"
              rows={9}
              value={activePrompt}
            />

            <div className="flex flex-wrap gap-2 items-center justify-between">
              <button
                onClick={() => copyPrompt(activeField)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-sm transition-colors"
              >
                {copiedField === activeField ? 'Copied' : 'Copy Active Prompt'}
              </button>
              <p className="text-[0.625rem] font-mono text-cream-muted/50 tracking-widest uppercase">
                Negative: {pack.negativePrompt}
              </p>
            </div>
            {copyError && <p className="text-xs font-mono text-accent">{copyError}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
