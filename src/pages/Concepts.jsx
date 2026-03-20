import { useState } from 'react'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

export default function Concepts({ concepts, setConcepts }) {
  const [prompt, setPrompt] = useState('')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('claude_api_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  function saveKey(key) {
    setApiKey(key)
    localStorage.setItem('claude_api_key', key)
    setShowKeyInput(false)
  }

  async function generate() {
    if (!prompt.trim()) return
    if (!apiKey) { setShowKeyInput(true); return }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-calls': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `You are a creative tattoo concept consultant. A client wants a tattoo based on this prompt: "${prompt}"\n\nProvide:\n1. A vivid visual description of the tattoo concept (2-3 sentences)\n2. Recommended style (from: dark-illustrative, fine-line, blackwork, surrealism, dark-fantasy, realism)\n3. Suggested placement\n4. Mood/aesthetic notes (1-2 sentences)\n5. Which type of artist would suit this best (brief)\n\nBe specific, evocative, and editorial in tone. Format as plain text with labelled sections.`,
            },
          ],
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || `API error ${response.status}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''

      const concept = {
        id: Date.now().toString(),
        prompt,
        response: text,
        createdAt: new Date().toISOString(),
      }

      setConcepts((prev) => [concept, ...prev])
      setPrompt('')
    } catch (e) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[12px] text-accent tracking-[0.3em] uppercase mb-1">Tattoo</p>
          <h1 className="font-display text-3xl text-cream">AI Concepts</h1>
        </div>
        <button
          onClick={() => setShowKeyInput((v) => !v)}
          className="text-[12px] font-mono text-cream-muted/90 hover:text-cream-muted transition-colors tracking-widest uppercase"
          title="Configure API key"
        >
          {apiKey ? '● API' : '○ API'}
        </button>
      </div>

      {showKeyInput && (
        <div className="mb-6 p-4 bg-ink-card border border-ink-border rounded-sm animate-slide-up">
          <p className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">Claude API Key</p>
          <p className="text-cream-muted/90 text-xs font-body mb-3">Your key is stored locally and never sent to any server.</p>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-mono placeholder-cream-muted/60"
              placeholder="sk-ant-…"
              defaultValue={apiKey}
              id="api-key-input"
            />
            <button
              onClick={() => saveKey(document.getElementById('api-key-input').value)}
              className="px-4 py-2 bg-ink-muted border border-ink-border rounded-sm text-sm text-cream hover:border-cream-muted/50 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Prompt input */}
      <div className="mb-8">
        <textarea
          className="w-full bg-ink-card border border-ink-border rounded-sm px-4 py-3 text-sm text-cream outline-none focus:border-cream-muted/40 font-body placeholder-cream-muted/60 resize-none transition-colors"
          rows={3}
          placeholder="Describe a tattoo concept… e.g. 'A moth emerging from a skull wreathed in dark botanicals'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) generate() }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px] font-mono text-cream-muted/90">⌘ Enter to generate</span>
          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-cream text-sm font-body rounded-sm transition-colors"
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {error && (
          <p className="text-accent text-xs font-mono mt-2">{error}</p>
        )}
      </div>

      {/* Results */}
      {concepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4 opacity-10">✦</span>
          <p className="text-cream-muted/90 font-body text-sm">No concepts yet.</p>
          <p className="text-cream-muted/90 font-body text-xs mt-1">Describe an idea and generate your first concept.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {concepts.map((c) => (
            <div
              key={c.id}
              className="bg-ink-card border border-ink-border rounded-sm p-4 cursor-pointer hover:border-cream-muted/50 transition-colors animate-slide-up"
              onClick={() => setSelected(selected?.id === c.id ? null : c)}
            >
              <p className="text-cream-muted/90 text-[12px] font-mono tracking-widest uppercase mb-2">Prompt</p>
              <p className="text-cream font-body text-sm mb-3 italic">"{c.prompt}"</p>

              {selected?.id === c.id ? (
                <div className="mt-3 pt-3 border-t border-ink-border">
                  <p className="text-cream-muted text-sm font-body leading-relaxed whitespace-pre-wrap">{c.response}</p>
                </div>
              ) : (
                <p className="text-cream-muted/90 text-xs font-mono">{new Date(c.createdAt).toLocaleDateString()} · tap to expand</p>
              )}

              <div className="flex justify-end mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); setConcepts((prev) => prev.filter((x) => x.id !== c.id)) }}
                  className="text-[12px] font-mono text-cream-muted/90 hover:text-accent transition-colors tracking-widest uppercase"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
