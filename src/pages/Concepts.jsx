import { useState } from 'react'
import Logo from '../components/Logo'

const SYSTEM_PROMPT = `You are a creative tattoo concept consultant with deep knowledge of tattoo styles, placement, and aesthetics. When given a concept prompt, provide:
1. A vivid visual description of the tattoo concept (2-3 sentences)
2. Recommended style (from: dark-illustrative, fine-line, blackwork, surrealism, dark-fantasy, realism)
3. Suggested placement
4. Mood/aesthetic notes (1-2 sentences)
5. Which type of artist would suit this best (brief)

Be specific, evocative, and editorial in tone. Format as plain text with labelled sections.`

function buildPrompt(userPrompt) {
  return `${SYSTEM_PROMPT}\n\nA client wants a tattoo based on this prompt: "${userPrompt}"`
}

export default function Concepts({ concepts, setConcepts }) {
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pasting, setPasting] = useState(null) // id of concept being pasted into

  async function copyPrompt() {
    if (!prompt.trim()) return
    const full = buildPrompt(prompt)
    await navigator.clipboard.writeText(full)
    setCopied(true)

    // Create a placeholder concept to paste the response into
    const concept = {
      id: Date.now().toString(),
      prompt,
      fullPrompt: full,
      response: '',
      createdAt: new Date().toISOString(),
    }
    setConcepts((prev) => [concept, ...prev])
    setPasting(concept.id)
    setPrompt('')
    setTimeout(() => setCopied(false), 2000)
  }

  function saveResponse(id, response) {
    setConcepts((prev) => prev.map((c) => c.id === id ? { ...c, response } : c))
    setPasting(null)
  }

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6">
        <Logo size={24} className="mb-2" />
        <h1 className="font-display text-3xl text-cream">AI Concepts</h1>
      </div>

      {/* How it works */}
      <div className="mb-6 p-4 bg-ink-card/50 border border-ink-border rounded-sm">
        <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-2">How it works</p>
        <ol className="text-cream-muted/80 text-xs font-body space-y-1 list-decimal list-inside">
          <li>Describe your tattoo idea below</li>
          <li>Tap <span className="text-accent">Copy Prompt</span> — a detailed AI prompt is copied to your clipboard</li>
          <li>Paste into <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">ChatGPT</a> (or any AI chat)</li>
          <li>Paste the response back here to save it</li>
        </ol>
      </div>

      {/* Prompt input */}
      <div className="mb-8">
        <textarea
          className="w-full bg-ink-card border border-ink-border rounded-sm px-4 py-3 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 resize-none transition-colors"
          rows={3}
          placeholder="Describe a tattoo concept… e.g. 'A moth emerging from a skull wreathed in dark botanicals'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) copyPrompt() }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-mono text-cream-muted/90">⌘ Enter to copy</span>
          <button
            onClick={copyPrompt}
            disabled={!prompt.trim()}
            className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-cream text-sm font-body rounded-sm transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Prompt'}
          </button>
        </div>
      </div>

      {/* Results */}
      {concepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4 opacity-10">✦</span>
          <p className="text-cream-muted/90 font-body text-sm">No concepts yet.</p>
          <p className="text-cream-muted/90 font-body text-xs mt-1">Describe an idea and copy the prompt to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {concepts.map((c) => (
            <div
              key={c.id}
              className="bg-ink-card border border-ink-border rounded-sm p-4 animate-slide-up"
            >
              <p className="text-cream-muted/90 text-xs font-mono tracking-widest uppercase mb-2">Prompt</p>
              <p className="text-cream font-body text-sm mb-3 italic">"{c.prompt}"</p>

              {c.fullPrompt && (
                <details className="mb-3 group">
                  <summary className="text-[0.6875rem] font-mono text-cream-muted/50 tracking-widest uppercase cursor-pointer hover:text-cream-muted transition-colors">
                    View generated prompt
                  </summary>
                  <div className="mt-2 p-3 bg-ink-muted/50 border border-ink-border rounded-sm relative">
                    <pre className="text-cream-muted/70 text-xs font-mono whitespace-pre-wrap leading-relaxed">{c.fullPrompt}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(c.fullPrompt)}
                      className="absolute top-2 right-2 text-[0.625rem] font-mono text-cream-muted/40 hover:text-cream-muted tracking-widest uppercase transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </details>
              )}

              {pasting === c.id ? (
                <div className="mt-3 pt-3 border-t border-ink-border">
                  <p className="text-xs font-mono text-accent tracking-widest uppercase mb-2">Paste AI response</p>
                  <textarea
                    autoFocus
                    className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
                    rows={8}
                    placeholder="Paste the ChatGPT response here…"
                    id={`paste-${c.id}`}
                  />
                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      onClick={() => { setConcepts((prev) => prev.filter((x) => x.id !== c.id)); setPasting(null) }}
                      className="text-xs font-mono text-cream-muted/60 hover:text-cream-muted transition-colors tracking-widest uppercase"
                    >
                      Discard
                    </button>
                    <button
                      onClick={() => saveResponse(c.id, document.getElementById(`paste-${c.id}`).value)}
                      className="text-xs font-mono text-accent hover:text-accent-hover transition-colors tracking-widest uppercase"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : c.response ? (
                <div
                  className="cursor-pointer"
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                >
                  {selected?.id === c.id ? (
                    <div className="mt-3 pt-3 border-t border-ink-border">
                      <p className="text-cream-muted text-sm font-body leading-relaxed whitespace-pre-wrap">{c.response}</p>
                    </div>
                  ) : (
                    <p className="text-cream-muted/90 text-xs font-mono">{new Date(c.createdAt).toLocaleDateString()} · tap to expand</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setPasting(c.id)}
                  className="mt-2 text-xs font-mono text-accent hover:text-accent-hover transition-colors tracking-widest uppercase"
                >
                  + Paste response
                </button>
              )}

              {pasting !== c.id && (
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => setConcepts((prev) => prev.filter((x) => x.id !== c.id))}
                    className="text-xs font-mono text-cream-muted/90 hover:text-accent transition-colors tracking-widest uppercase"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
