# Gemini Concept Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Contention note:** `src/pages/Concepts.jsx` is under active parallel development (result-variants). **Re-read it immediately before Tasks 2–3** and adapt the anchors below if it has changed. Task 1 is an isolated new module and is safe regardless.
>
> **Verification gap:** the real generate-an-image step needs the user's AI-Studio key. Tasks verify the pure helpers, the build, and the UI wiring; the final live generation is a manual check for Pritesh.

**Goal:** Add live tattoo-concept image generation via the free Gemini tier alongside DALL·E, optionally steered by a saved artist's `styleDescriptor`.

**Architecture:** Pure prompt-builder + response-parser + a thin `fetch` in a new `src/data/geminiImage.js`; minimal wiring in `Concepts.jsx` (second key, provider toggle, steer-by-artist, routed `generate()`). Output uses the existing flat concept model.

**Tech Stack:** React 19, Vite, Tailwind, Vitest.

---

## File Structure

- `src/data/geminiImage.js` — **create**: `GEMINI_IMAGE_MODEL`, `buildGeminiImagePrompt`, `parseGeminiImage`, `generateImageWithGemini`.
- `src/data/geminiImage.test.js` — **create**: unit tests for the two pure helpers.
- `src/pages/Concepts.jsx` — **modify**: second key in config, provider toggle, steer-by-artist select, routed `generate()`.

---

## Task 1: `geminiImage.js` module (TDD)

**Files:**
- Create: `src/data/geminiImage.test.js`
- Create: `src/data/geminiImage.js`

- [ ] **Step 1: Write the failing tests**

Create `src/data/geminiImage.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildGeminiImagePrompt, parseGeminiImage } from '../data/geminiImage'

describe('buildGeminiImagePrompt', () => {
  it('includes the prompt, styleDescriptor direction, and guardrails (no artist name)', () => {
    const out = buildGeminiImagePrompt({ prompt: 'a moth', styleDescriptor: 'fine-line geometry, dotwork' })
    expect(out).toContain('a moth')
    expect(out).toContain('Stylistic direction: fine-line geometry, dotwork.')
    expect(out).toContain('Avoid:')
    expect(out).not.toMatch(/@/)
  })

  it('falls back to tags when there is no descriptor', () => {
    const out = buildGeminiImagePrompt({ prompt: 'a raven', tags: ['blackwork', 'dark-illustrative'] })
    expect(out).toContain('Stylistic direction: blackwork, dark-illustrative.')
  })

  it('omits the stylistic direction when neither descriptor nor tags are given', () => {
    const out = buildGeminiImagePrompt({ prompt: 'a skull' })
    expect(out).not.toContain('Stylistic direction')
    expect(out).toContain('a skull')
  })
})

describe('parseGeminiImage', () => {
  it('returns a data URL from the first inlineData part', () => {
    const json = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }
    expect(parseGeminiImage(json)).toBe('data:image/png;base64,AAAA')
  })

  it('throws when no image part is present', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'nope' }] } }] }
    expect(() => parseGeminiImage(json)).toThrow('No image returned')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/geminiImage.test.js`
Expected: FAIL (cannot import from `../data/geminiImage`).

- [ ] **Step 3: Implement the module**

Create `src/data/geminiImage.js`:

```js
// Live tattoo-concept image generation via Google's free Gemini tier.
// Pure helpers (buildGeminiImagePrompt, parseGeminiImage) are unit-tested;
// generateImageWithGemini is a thin network wrapper around them.

export const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

const BASE_FRAMING =
  'Professional tattoo concept art. Black ink, high contrast, clean tattooable linework, flash-reference style — concept art, not a finished tattoo copied from any living artist.'

const GUARDRAILS = 'Avoid: text, watermark, copied artist style, photorealistic skin mockup.'

export function buildGeminiImagePrompt({ prompt = '', styleDescriptor = '', tags = [] } = {}) {
  const descriptor = String(styleDescriptor).trim()
  const direction = descriptor
    ? `Stylistic direction: ${descriptor}.`
    : tags.length
      ? `Stylistic direction: ${tags.join(', ')}.`
      : ''
  return [String(prompt).trim(), BASE_FRAMING, direction, GUARDRAILS].filter(Boolean).join('\n\n')
}

export function parseGeminiImage(json) {
  const parts = json?.candidates?.[0]?.content?.parts || []
  const part = parts.find((p) => p?.inlineData?.data)
  if (!part) throw new Error('No image returned')
  const { mimeType = 'image/png', data } = part.inlineData
  return `data:${mimeType};base64,${data}`
}

export async function generateImageWithGemini(apiKey, { prompt = '', styleDescriptor = '', tags = [] } = {}) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildGeminiImagePrompt({ prompt, styleDescriptor, tags }) }] }],
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini error ${res.status}`)
  }
  return parseGeminiImage(await res.json())
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/geminiImage.test.js`
Expected: PASS (5 assertions across the two helpers).

- [ ] **Step 5: Commit**

```bash
git add src/data/geminiImage.js src/data/geminiImage.test.js
git commit -m "feat(ai): add geminiImage module for concept generation"
```

---

## Task 2: Two-key config (OpenAI + Gemini) in Concepts.jsx

**Re-read `src/pages/Concepts.jsx` before editing.** Anchors below are current as of the spec.

**Files:**
- Modify: `src/pages/Concepts.jsx`

- [ ] **Step 1: Add a reusable `KeyField` component**

Above `export default function Concepts(...)`, add:

```jsx
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
```

- [ ] **Step 2: Replace the single-key state + save/clear with two keys**

Replace:

```jsx
  const [storedKey, setStoredKey] = useState(() => localStorage.getItem('openai_api_key') || '')
  const [showKeyConfig, setShowKeyConfig] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
```

with:

```jsx
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('openai_api_key') || '')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '')
  const [showKeyConfig, setShowKeyConfig] = useState(false)
```

Replace the `hasApiKey` line:

```jsx
  const hasApiKey = Boolean(storedKey)
```

with:

```jsx
  const hasOpenai = Boolean(openaiKey)
  const hasGemini = Boolean(geminiKey)
  const hasApiKey = hasOpenai || hasGemini
```

Replace `saveKey` and `clearKey` with:

```jsx
  function persistKey(which, value) {
    const v = value.trim()
    const storageKey = which === 'gemini' ? 'gemini_api_key' : 'openai_api_key'
    if (which === 'gemini') setGeminiKey(v)
    else setOpenaiKey(v)
    if (v) localStorage.setItem(storageKey, v)
    else localStorage.removeItem(storageKey)
  }
```

- [ ] **Step 3: Replace the config-panel body with two KeyFields**

Replace the inner content of the `{showKeyConfig && ( ... )}` panel (the `<p>OpenAI API Key</p>` block through its Save/Remove markup) with:

```jsx
        <div className="mb-6 p-4 bg-ink-card border border-ink-border rounded-sm animate-slide-up">
          <KeyField
            label="Gemini API key"
            help="Free image generation via Google AI Studio. Stored locally on your device only."
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
```

The `⚙ {hasApiKey ? 'Key set' : 'Configure AI'}` toggle button stays; update its onClick to just `setShowKeyConfig((v) => !v)` (drop the now-removed `setKeyDraft`).

- [ ] **Step 4: Build to confirm it compiles**

Run: `npm run build`
Expected: build succeeds (DALL·E generate still references `openaiKey` — fixed in Task 3; if Task 2 is committed alone, temporarily change `generateWithDallE(storedKey, ...)` to `generateWithDallE(openaiKey, ...)` now).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Concepts.jsx
git commit -m "feat(concepts): two-key config (OpenAI + Gemini)"
```

---

## Task 3: Provider toggle, steer-by-artist, routed generate()

**Files:**
- Modify: `src/pages/Concepts.jsx`

- [ ] **Step 1: Import the module + add state**

Add to the imports:

```jsx
import { generateImageWithGemini } from '../data/geminiImage'
```

Add state (near the other `useState` calls):

```jsx
  const [provider, setProvider] = useState('gemini')
  const [steerArtistId, setSteerArtistId] = useState('')
```

- [ ] **Step 2: Route `generate()` by provider, with steering**

Replace the existing `generate()` function with:

```jsx
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
```

- [ ] **Step 3: Add the provider toggle + steer select to the generate controls**

In the `{hasApiKey ? ( ... ) : ( ...paste-back... )}` block, replace the generate-controls branch (the `<div className="flex items-center justify-between mt-2">…Generate Image…</div>`) with:

```jsx
          <div className="mt-3 space-y-3">
            {hasOpenai && hasGemini && (
              <div className="flex gap-1">
                {[{ id: 'gemini', label: 'Gemini · free' }, { id: 'dalle', label: 'DALL·E' }].map((p) => (
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
```

Keep the existing `onKeyDown` ⌘-Enter handler on the textarea (it calls `generate()` when a key is set).

- [ ] **Step 4: Build + manual smoke test**

Run: `npm run build` — expected: succeeds.
Run the dev server; open **AI → ⚙**, confirm two key inputs render; with no keys the paste-back flow is unchanged; entering a (real) Gemini key shows the Generate controls + steer-by-artist select.
**Manual (Pritesh, needs real key):** pick an artist to steer, enter a prompt, Generate → a concept image appears.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Concepts.jsx
git commit -m "feat(concepts): Gemini image generation with artist style steering"
```

---

## Task 4: Full verification

- [ ] **Step 1:** `npm test -- --run` → all pass (incl. the 5 new `geminiImage` assertions).
- [ ] **Step 2:** `npm run build` → succeeds.
- [ ] **Step 3:** Confirm `git status --short` is clean (ignore the unrelated untracked `conceptVariants.*`).

---

## Self-Review

**Spec coverage:**
- `geminiImage.js` pure helpers + thin fetch → Task 1. ✓
- Second Gemini key in config → Task 2. ✓
- Provider toggle (shown only when both keys set) + auto-select → Task 3, Steps 2–3. ✓
- Steer-by-artist using `styleDescriptor`/`tags`, no artist name in prompt → Task 1 (`buildGeminiImagePrompt`) + Task 3 (`generate`). ✓
- Flat concept output with `tags` prefilled + `provider` field → Task 3, Step 2. ✓
- Tests for build/parse → Task 1, Step 1. ✓
- Non-goals (no variants integration, no key in backup, DALL·E unchanged) → respected. ✓

**Placeholder scan:** All code is literal. `GEMINI_IMAGE_MODEL` is a real constant with a confirm-on-build note in the spec (model ids evolve).

**Type/name consistency:** `openaiKey`/`geminiKey`/`hasOpenai`/`hasGemini`/`hasApiKey`/`provider`/`steerArtistId`/`persistKey` are used consistently across Tasks 2–3. `generate()` references `openaiKey` (not the removed `storedKey`) and `geminiKey`; the DALL·E call is updated to `openaiKey` in Task 2 Step 4. `buildGeminiImagePrompt`/`parseGeminiImage`/`generateImageWithGemini` match the module exports from Task 1.
