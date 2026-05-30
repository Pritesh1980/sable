# AI Concepts Prompt Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand AI Concepts into a local-first prompt pack workbench with provider-specific prompts and result intake.

**Architecture:** Put prompt-pack generation in a pure data module so it is easy to test and reuse. Add a focused composer component for source selection, prompt generation, copy actions, and saving; keep existing Concepts persistence and result intake behavior intact.

**Tech Stack:** React 19, Vite, Tailwind CSS, Vitest, Testing Library, localStorage-backed concept storage.

---

## File Structure

- Create `src/data/promptPacks.js`
  - Owns provider labels, source normalization, and prompt-pack generation.
  - Exports pure functions only.
- Create `src/test/promptPacks.test.js`
  - Tests free-text and Brief idea prompt-pack generation.
- Create `src/components/PromptPackComposer.jsx`
  - Renders source controls, generated prompt cards, copy actions, and save action.
  - Receives `ideas`, `artists`, and `onSavePromptPack` props.
- Modify `src/pages/Concepts.jsx`
  - Imports `PromptPackComposer`.
  - Saves prompt packs as concepts.
  - Renders saved prompt-pack details on concept cards.
  - Keeps existing direct image generation and paste-zone behavior working.
- Modify `src/App.jsx`
  - Passes `ideas` into `Concepts`.
- Optional if component behavior becomes awkward to verify manually: create `src/test/PromptPackComposer.test.jsx`.

---

### Task 1: Prompt Pack Data Module

**Files:**
- Create: `src/data/promptPacks.js`
- Test: `src/test/promptPacks.test.js`

- [ ] **Step 1: Write failing tests for prompt-pack generation**

Create `src/test/promptPacks.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  PROMPT_PACK_PROVIDERS,
  buildPromptPackFromFreeText,
  buildPromptPackFromIdea,
  hasPromptPackSource,
} from '../data/promptPacks'

describe('PROMPT_PACK_PROVIDERS', () => {
  it('contains the four manual AI destinations', () => {
    expect(PROMPT_PACK_PROVIDERS.map((p) => p.id)).toEqual([
      'chatgpt',
      'adobe-firefly',
      'gemini',
      'claude',
    ])
  })
})

describe('hasPromptPackSource', () => {
  it('accepts non-empty free text', () => {
    expect(hasPromptPackSource({ sourceType: 'free-text', prompt: 'dark moth' })).toBe(true)
  })

  it('rejects blank free text', () => {
    expect(hasPromptPackSource({ sourceType: 'free-text', prompt: '   ' })).toBe(false)
  })

  it('accepts an existing idea id', () => {
    expect(hasPromptPackSource({ sourceType: 'brief-idea', sourceIdeaId: 'idea-1' })).toBe(true)
  })
})

describe('buildPromptPackFromFreeText', () => {
  it('creates provider prompts from free text', () => {
    const pack = buildPromptPackFromFreeText('A raven breaking apart into dark botanicals', {
      createdAt: '2026-05-31T10:00:00.000Z',
    })

    expect(pack.sourceType).toBe('free-text')
    expect(pack.sourceSummary).toBe('A raven breaking apart into dark botanicals')
    expect(pack.chatgptImagePrompt).toContain('raven')
    expect(pack.adobeFireflyPrompt).toContain('tattoo')
    expect(pack.geminiCritiquePrompt).toContain('Critique')
    expect(pack.claudeRefinementPrompt).toContain('artist-facing')
    expect(pack.negativePrompt).toContain('no text')
    expect(pack.createdAt).toBe('2026-05-31T10:00:00.000Z')
  })

  it('returns null for blank free text', () => {
    expect(buildPromptPackFromFreeText('   ')).toBeNull()
  })
})

describe('buildPromptPackFromIdea', () => {
  it('includes idea details, linked artists, and image notes', () => {
    const idea = {
      id: 'idea-1',
      title: 'Raven chest piece',
      description: 'A raven dissolving into thorned botanicals.',
      placement: 'chest',
      tags: ['dark-illustrative', 'blackwork'],
      linkedArtists: ['artist-1'],
      images: [
        { url: 'https://example.com/raven.jpg', note: 'Borrow the wing silhouette only.' },
      ],
    }
    const artists = [
      { id: 'artist-1', name: 'Artist One', handle: 'artist_one', tags: ['blackwork'] },
    ]

    const pack = buildPromptPackFromIdea(idea, artists, {
      createdAt: '2026-05-31T11:00:00.000Z',
    })

    expect(pack.sourceType).toBe('brief-idea')
    expect(pack.sourceIdeaId).toBe('idea-1')
    expect(pack.sourceSummary).toContain('Raven chest piece')
    expect(pack.sourceSummary).toContain('Placement: chest')
    expect(pack.sourceSummary).toContain('Style tags: dark-illustrative, blackwork')
    expect(pack.sourceSummary).toContain('Artist One (@artist_one)')
    expect(pack.sourceSummary).toContain('Borrow the wing silhouette only.')
    expect(pack.chatgptImagePrompt).toContain('Raven chest piece')
    expect(pack.adobeFireflyPrompt).toContain('chest')
    expect(pack.createdAt).toBe('2026-05-31T11:00:00.000Z')
  })

  it('returns null without an idea', () => {
    expect(buildPromptPackFromIdea(null, [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/test/promptPacks.test.js
```

Expected: FAIL because `src/data/promptPacks.js` does not exist.

- [ ] **Step 3: Implement the pure prompt-pack module**

Create `src/data/promptPacks.js`:

```js
import { getImageNote } from './planning'

export const PROMPT_PACK_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT', field: 'chatgptImagePrompt' },
  { id: 'adobe-firefly', label: 'Adobe Firefly', field: 'adobeFireflyPrompt' },
  { id: 'gemini', label: 'Gemini', field: 'geminiCritiquePrompt' },
  { id: 'claude', label: 'Claude', field: 'claudeRefinementPrompt' },
]

const NEGATIVE_PROMPT = [
  'no text',
  'no watermark',
  'no copied artist style',
  'no logos',
  'no extra limbs',
  'no muddy shading',
  'no photorealistic skin mockup unless explicitly requested',
].join(', ')

function compactList(items) {
  return items.filter(Boolean).join('\n')
}

function clean(value) {
  return String(value || '').trim()
}

function artistLabel(artist) {
  if (!artist) return ''
  return artist.name ? `${artist.name} (@${artist.handle})` : `@${artist.handle}`
}

function summarizeIdea(idea, artists = []) {
  if (!idea) return ''
  const linked = artists.filter((artist) => idea.linkedArtists?.includes(artist.id))
  const imageNotes = (idea.images || [])
    .map((image) => getImageNote(image))
    .filter(Boolean)

  return compactList([
    idea.title ? `Idea: ${idea.title}` : 'Idea: Untitled',
    idea.description ? `Concept: ${idea.description}` : '',
    idea.placement ? `Placement: ${idea.placement}` : '',
    idea.tags?.length ? `Style tags: ${idea.tags.join(', ')}` : '',
    linked.length ? `Linked artists: ${linked.map(artistLabel).join(', ')}` : '',
    imageNotes.length ? `Reference notes: ${imageNotes.join(' | ')}` : '',
  ])
}

function createPack({ sourceType, sourceIdeaId = '', sourceSummary, createdAt }) {
  const summary = clean(sourceSummary)
  if (!summary) return null

  return {
    sourceType,
    sourceIdeaId,
    sourceSummary: summary,
    chatgptImagePrompt: [
      'Create a refined tattoo concept image from this brief.',
      summary,
      'Use high-contrast black ink, clean readable shapes, tattooable linework, and an editorial dark illustrative mood.',
      'Output should feel like concept art or flash reference, not a finished tattoo copied from any living artist.',
    ].join('\n\n'),
    adobeFireflyPrompt: [
      'Generate a polished tattoo reference composition.',
      summary,
      'Prioritise clean silhouette, readable negative space, crisp blackwork, and a layout suitable for tattoo refinement in Photoshop or Firefly.',
    ].join('\n\n'),
    geminiCritiquePrompt: [
      'Critique this tattoo concept for visual suitability, placement, readability, and risks.',
      summary,
      'Return concise sections: strongest visual idea, tattooability risks, placement considerations, what to simplify, and what reference details not to copy.',
    ].join('\n\n'),
    claudeRefinementPrompt: [
      'Refine this tattoo idea into clear artist-facing language.',
      summary,
      'Return a concise consultation brief, key visual constraints, questions for the artist, and a short Instagram DM version.',
    ].join('\n\n'),
    negativePrompt: NEGATIVE_PROMPT,
    createdAt: createdAt || new Date().toISOString(),
  }
}

export function hasPromptPackSource({ sourceType, prompt = '', sourceIdeaId = '' }) {
  if (sourceType === 'brief-idea') return Boolean(clean(sourceIdeaId))
  return Boolean(clean(prompt))
}

export function buildPromptPackFromFreeText(prompt, options = {}) {
  return createPack({
    sourceType: 'free-text',
    sourceSummary: clean(prompt),
    createdAt: options.createdAt,
  })
}

export function buildPromptPackFromIdea(idea, artists = [], options = {}) {
  if (!idea) return null
  return createPack({
    sourceType: 'brief-idea',
    sourceIdeaId: idea.id || '',
    sourceSummary: summarizeIdea(idea, artists),
    createdAt: options.createdAt,
  })
}
```

- [ ] **Step 4: Run prompt-pack tests**

Run:

```bash
npm test -- src/test/promptPacks.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/data/promptPacks.js src/test/promptPacks.test.js
git commit -m "feat(ai): generate prompt packs"
```

---

### Task 2: Prompt Pack Composer Component

**Files:**
- Create: `src/components/PromptPackComposer.jsx`
- Modify: `src/pages/Concepts.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add `ideas` to the Concepts route**

Modify `src/App.jsx` so the Concepts route passes `ideas`:

```jsx
<Route
  path="/concepts"
  element={<Concepts concepts={concepts} setConcepts={setConcepts} artists={artists} ideas={ideas} />}
/>
```

- [ ] **Step 2: Create the composer component**

Create `src/components/PromptPackComposer.jsx`:

```jsx
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
```

- [ ] **Step 3: Wire the composer into Concepts**

Modify the import block in `src/pages/Concepts.jsx`:

```jsx
import PromptPackComposer from '../components/PromptPackComposer'
```

Modify the component signature:

```jsx
export default function Concepts({ concepts, setConcepts, artists = [], ideas = [] }) {
```

Add this function near the other concept mutators:

```jsx
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
```

Render the composer just before the existing textarea prompt area:

```jsx
<PromptPackComposer
  ideas={ideas}
  artists={artists}
  onSavePromptPack={savePromptPack}
/>
```

- [ ] **Step 4: Run build to catch JSX issues**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/App.jsx src/pages/Concepts.jsx src/components/PromptPackComposer.jsx
git commit -m "feat(ai): add prompt pack composer"
```

---

### Task 3: Render Saved Prompt Packs And Preserve Legacy Concepts

**Files:**
- Modify: `src/pages/Concepts.jsx`
- Modify: `src/data/promptPacks.js`
- Test: `src/test/promptPacks.test.js`

- [ ] **Step 1: Add a prompt-pack field helper test**

Append to `src/test/promptPacks.test.js`:

```js
import { getPromptPackFields } from '../data/promptPacks'

describe('getPromptPackFields', () => {
  it('returns provider fields from a saved prompt pack', () => {
    const fields = getPromptPackFields({
      chatgptImagePrompt: 'chatgpt prompt',
      adobeFireflyPrompt: 'firefly prompt',
      geminiCritiquePrompt: 'gemini prompt',
      claudeRefinementPrompt: 'claude prompt',
    })

    expect(fields).toEqual([
      { id: 'chatgpt', label: 'ChatGPT', field: 'chatgptImagePrompt', value: 'chatgpt prompt' },
      { id: 'adobe-firefly', label: 'Adobe Firefly', field: 'adobeFireflyPrompt', value: 'firefly prompt' },
      { id: 'gemini', label: 'Gemini', field: 'geminiCritiquePrompt', value: 'gemini prompt' },
      { id: 'claude', label: 'Claude', field: 'claudeRefinementPrompt', value: 'claude prompt' },
    ])
  })

  it('returns an empty list for legacy concepts without prompt packs', () => {
    expect(getPromptPackFields(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify the helper is missing**

Run:

```bash
npm test -- src/test/promptPacks.test.js
```

Expected: FAIL because `getPromptPackFields` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/data/promptPacks.js`:

```js
export function getPromptPackFields(promptPack) {
  if (!promptPack) return []
  return PROMPT_PACK_PROVIDERS
    .map((provider) => ({
      ...provider,
      value: promptPack[provider.field] || '',
    }))
    .filter((provider) => provider.value)
}
```

- [ ] **Step 4: Render saved prompt packs on concept cards**

Modify imports in `src/pages/Concepts.jsx`:

```jsx
import { getPromptPackFields } from '../data/promptPacks'
```

Add this helper component above `export default function Concepts`:

```jsx
function SavedPromptPack({ promptPack }) {
  const [activeField, setActiveField] = useState('')
  const [copied, setCopied] = useState('')
  const fields = getPromptPackFields(promptPack)
  if (!fields.length) return null

  const active = fields.find((field) => field.field === activeField) || fields[0]

  async function copySavedPrompt() {
    await navigator.clipboard.writeText(active.value)
    setCopied(active.field)
    setTimeout(() => setCopied(''), 1600)
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
    </div>
  )
}
```

Inside each concept card, render the saved pack after the concept prompt text:

```jsx
<SavedPromptPack promptPack={c.promptPack} />
```

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npm test -- src/test/promptPacks.test.js
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/data/promptPacks.js src/test/promptPacks.test.js src/pages/Concepts.jsx
git commit -m "feat(ai): render saved prompt packs"
```

---

### Task 4: Manual Browser Verification

**Files:**
- No source changes unless verification exposes a bug.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected: Vite starts and prints a localhost URL, usually `http://localhost:5173`.

- [ ] **Step 2: Verify free-text prompt pack flow**

Open `/concepts` and verify:

1. Type `A raven breaking apart into dark botanicals for a chest tattoo`.
2. Click `Generate Prompt Pack`.
3. Switch between ChatGPT, Adobe Firefly, Gemini, and Claude prompts.
4. Copy active prompt.
5. Save pack.
6. Confirm a new concept card appears with `Saved prompt pack`.
7. Click `+ Add image or response`, paste text, save it.

Expected: the prompt pack and pasted response remain visible after page refresh.

- [ ] **Step 3: Verify Brief idea source flow**

If no Brief ideas exist in local data, create one in `/brief` first. Then return to `/concepts` and verify:

1. Select `Brief idea`.
2. Choose the idea.
3. Generate a prompt pack.
4. Confirm the generated prompt mentions the idea title, placement, tags, and any reference image notes.
5. Save pack.

Expected: saved concept uses the idea summary and supports the same result intake as free-text packs.

- [ ] **Step 4: Verify legacy concept behavior**

Use an existing old concept or create one with the existing `Copy Prompt` flow. Verify:

1. Existing concepts without `promptPack` still render.
2. Style tag matching still works.
3. Delete still removes a concept.
4. Direct OpenAI image generation path still appears when an API key is configured.

Expected: no regressions.

- [ ] **Step 5: Commit any verification fixes**

Only if bugs were fixed:

```bash
git add src
git commit -m "fix(ai): polish prompt pack workflow"
```

---

### Task 5: Final Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run final automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes unless the implementation plan itself is intentionally left uncommitted.

- [ ] **Step 3: Final implementation summary**

Report:

- Commits created.
- Verification commands and results.
- Any deferred items, especially direct API calls, style DNA analysis, and match critique.

---

## Self-Review

Spec coverage:

- Free-text and Brief idea sources: Task 1 and Task 2.
- Provider-specific prompts: Task 1.
- Copy individual prompts: Task 2 and Task 3.
- Save prompt pack as concept: Task 2.
- Paste/import generated outputs: Task 2 preserves existing `PasteZone`; Task 4 verifies it.
- Local-only data: Task 2 stores prompt packs in existing concepts state.
- Legacy concept compatibility: Task 3 and Task 4.

Scope exclusions preserved:

- No direct provider API calls.
- No artist style DNA analysis.
- No AI match critique.
- No deployment-dependent work.
