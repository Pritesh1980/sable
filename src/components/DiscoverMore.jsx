import { useState } from 'react'
import { buildDiscoveryPrompt, parseDiscoveryResponse, discoverArtistsWithGemini } from '../data/discovery'

// The Consider shelf's trailing card: ask AI for a fresh batch of artists.
// With a Gemini key the batch arrives in-app; without one, Copy prompt →
// run it in any AI → paste the reply back. Results are marked unverified —
// open each profile on Instagram before trusting it.
export default function DiscoverMore({ artists, exclude = [], onResults }) {
  const [open, setOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const geminiKey = localStorage.getItem('gemini_api_key') || ''

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildDiscoveryPrompt(artists, { exclude }))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function askGemini() {
    setBusy(true)
    setError('')
    try {
      const results = await discoverArtistsWithGemini(geminiKey, artists, { exclude })
      if (results.length === 0) throw new Error('No usable suggestions came back — try again')
      onResults(results)
      setOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function addPasted() {
    const results = parseDiscoveryResponse(pasted)
    if (results.length === 0) {
      setError('Nothing parseable — expected lines like: handle | name | styles | note')
      return
    }
    onResults(results)
    setPasted('')
    setError('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 w-64 border border-dashed border-v2-hairline hover:border-v2-accent rounded-sm px-4 py-3.5 text-left transition-colors"
      >
        <span className="font-v2-display text-v2-cream text-[0.95rem] uppercase tracking-[0.12em] block">
          Find more like this
        </span>
        <span className="font-v2-ui text-v2-muted text-xs mt-1.5 block leading-snug">
          Ask AI for a fresh batch matched to your collection
        </span>
      </button>
    )
  }

  return (
    <div className="shrink-0 w-80 bg-v2-surface border border-v2-hairline rounded-sm px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-v2-display text-v2-cream text-[0.95rem] uppercase tracking-[0.12em]">Find more</h3>
        <button onClick={() => setOpen(false)} className="font-v2-ui text-v2-muted hover:text-v2-cream text-xs">close</button>
      </div>

      <div className="flex gap-2 mt-3">
        {geminiKey && (
          <button
            onClick={askGemini}
            disabled={busy}
            className="font-v2-ui text-xs text-v2-cream bg-v2-accent rounded-sm px-3 py-1.5 disabled:opacity-50"
          >
            {busy ? 'Asking…' : 'Ask Gemini'}
          </button>
        )}
        <button
          onClick={copyPrompt}
          className="font-v2-ui text-xs text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-3 py-1.5 transition-colors"
        >
          {copied ? 'Copied ✓' : 'Copy prompt'}
        </button>
      </div>

      <label className="font-v2-ui text-v2-muted text-[0.65rem] uppercase tracking-[0.1em] block mt-3 mb-1">
        Paste the reply back
      </label>
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={3}
        placeholder="handle | name | styles | note"
        className="w-full bg-v2-ink text-v2-cream border border-v2-hairline rounded-sm px-2 py-1.5 font-v2-ui text-xs focus:outline focus:outline-1 focus:outline-v2-accent"
      />
      <button
        onClick={addPasted}
        disabled={!pasted.trim()}
        className="font-v2-ui text-xs text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-3 py-1.5 mt-2 transition-colors disabled:opacity-40"
      >
        Add results
      </button>

      {error && <p className="font-v2-ui text-v2-accent text-xs mt-2">{error}</p>}
      <p className="font-v2-ui text-v2-muted text-[0.65rem] mt-2 leading-snug">
        AI suggestions are unverified — open each profile before adding.
      </p>
    </div>
  )
}
