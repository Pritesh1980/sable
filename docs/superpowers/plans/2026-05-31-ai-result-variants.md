# AI Result Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline curated AI result variants to saved AI Concepts so each concept can collect, compare, rate, and mark the best external AI output.

**Architecture:** Put all variant rules in a pure data module, then render those rules through a focused `ConceptVariantLab` component inside the existing Concepts page. Concept records keep using the current `tattoo_concepts` storage path; legacy records without `variants` are treated as empty.

**Tech Stack:** React 19, Tailwind CSS, localStorage through existing `useStorage`, Vitest, Testing Library, existing docs/screenshots workflow.

---

## File Structure

- Create `src/data/conceptVariants.js`
  - Owns provider labels, rating normalisation, variant creation, sorting, mark-best, rating update, and deletion.
  - Contains no React and no browser APIs.
- Create `src/test/conceptVariants.test.js`
  - Pure tests for all variant data rules.
- Create `src/components/ConceptVariantLab.jsx`
  - Owns inline result form, compact variant summaries, expanded details, rating buttons, best marker, and delete action.
  - Uses the existing dark editorial card style.
- Create `src/test/ConceptVariantLab.test.jsx`
  - Component tests for rendering, saving a text+image variant, and best marker actions.
- Modify `src/pages/Concepts.jsx`
  - Imports `ConceptVariantLab`.
  - Adds concept-level handlers that delegate to `src/data/conceptVariants.js`.
  - Keeps existing prompt-pack, paste-back, style matching, and DALL-E paths intact.
- Create `src/test/ConceptsVariants.test.jsx`
  - Page-level smoke test proving the Concepts page renders and persists inline variants.
- Modify `docs/06-concepts.md`, `src/pages/Help.jsx`, and `public/guide/concept-card.png`
  - Documents the new AI Results section and refreshes the affected screenshot.

---

## Task 1: Variant Data Model

**Files:**
- Create: `src/data/conceptVariants.js`
- Create: `src/test/conceptVariants.test.js`

- [ ] **Step 1: Write the failing pure data tests**

Create `src/test/conceptVariants.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  RESULT_VARIANT_PROVIDERS,
  addConceptVariant,
  createConceptVariant,
  getConceptVariants,
  getProviderLabel,
  markBestVariant,
  removeConceptVariant,
  sortConceptVariants,
  updateVariantRating,
} from '../data/conceptVariants'

describe('RESULT_VARIANT_PROVIDERS', () => {
  it('contains supported AI result providers', () => {
    expect(RESULT_VARIANT_PROVIDERS.map((provider) => provider.id)).toEqual([
      'chatgpt',
      'adobe-firefly',
      'gemini',
      'claude',
      'other',
    ])
  })

  it('falls back unknown provider labels to Other', () => {
    expect(getProviderLabel('mystery-ai')).toBe('Other')
  })
})

describe('createConceptVariant', () => {
  it('creates a variant with image and text content', () => {
    const variant = createConceptVariant({
      provider: 'chatgpt',
      title: 'Raven silhouette',
      imageUrl: 'data:image/png;base64,abc',
      response: 'The raven shape is strong.',
      notes: 'Worth refining in Firefly.',
      rating: 7,
      isBest: true,
    }, {
      id: 'variant-1',
      createdAt: '2026-05-31T12:00:00.000Z',
    })

    expect(variant).toEqual({
      id: 'variant-1',
      provider: 'chatgpt',
      title: 'Raven silhouette',
      imageUrl: 'data:image/png;base64,abc',
      response: 'The raven shape is strong.',
      notes: 'Worth refining in Firefly.',
      rating: 5,
      isBest: true,
      createdAt: '2026-05-31T12:00:00.000Z',
    })
  })

  it('returns null for an empty variant', () => {
    expect(createConceptVariant({
      provider: 'chatgpt',
      title: '   ',
      imageUrl: '',
      response: '   ',
      notes: '',
      rating: 3,
    })).toBeNull()
  })

  it('normalises unknown provider and low rating', () => {
    const variant = createConceptVariant({
      provider: 'unknown',
      response: 'Readable but too detailed.',
      rating: -2,
    }, {
      id: 'variant-2',
      createdAt: '2026-05-31T12:05:00.000Z',
    })

    expect(variant.provider).toBe('other')
    expect(variant.rating).toBe(0)
  })
})

describe('concept variant transforms', () => {
  const concept = {
    id: 'concept-1',
    prompt: 'Raven chest tattoo',
    variants: [
      {
        id: 'older',
        provider: 'gemini',
        title: 'Critique',
        imageUrl: '',
        response: 'Simplify the wings.',
        notes: '',
        rating: 3,
        isBest: false,
        createdAt: '2026-05-31T09:00:00.000Z',
      },
      {
        id: 'best',
        provider: 'chatgpt',
        title: 'Best image',
        imageUrl: 'data:image/png;base64,best',
        response: '',
        notes: 'Strong silhouette.',
        rating: 5,
        isBest: true,
        createdAt: '2026-05-31T08:00:00.000Z',
      },
      {
        id: 'newer',
        provider: 'adobe-firefly',
        title: 'Firefly pass',
        imageUrl: 'data:image/png;base64,newer',
        response: '',
        notes: 'Nice contrast.',
        rating: 4,
        isBest: false,
        createdAt: '2026-05-31T10:00:00.000Z',
      },
    ],
  }

  it('returns an empty list for legacy concepts', () => {
    expect(getConceptVariants({ id: 'legacy' })).toEqual([])
  })

  it('sorts best first, then newest first', () => {
    expect(sortConceptVariants(concept.variants).map((variant) => variant.id)).toEqual([
      'best',
      'newer',
      'older',
    ])
  })

  it('adds a variant without mutating the concept', () => {
    const next = addConceptVariant(concept, {
      provider: 'claude',
      response: 'Artist-facing wording.',
      rating: 2,
    }, {
      id: 'claude-1',
      createdAt: '2026-05-31T11:00:00.000Z',
    })

    expect(next).not.toBe(concept)
    expect(next.variants.map((variant) => variant.id)).toContain('claude-1')
    expect(concept.variants.map((variant) => variant.id)).not.toContain('claude-1')
  })

  it('marks one variant best and clears sibling best flags', () => {
    const next = markBestVariant(concept, 'newer')

    expect(next.variants.find((variant) => variant.id === 'newer').isBest).toBe(true)
    expect(next.variants.find((variant) => variant.id === 'best').isBest).toBe(false)
  })

  it('updates a variant rating', () => {
    const next = updateVariantRating(concept, 'older', 5)

    expect(next.variants.find((variant) => variant.id === 'older').rating).toBe(5)
  })

  it('removes a variant even when it was best', () => {
    const next = removeConceptVariant(concept, 'best')

    expect(next.variants.map((variant) => variant.id)).toEqual(['older', 'newer'])
    expect(next.variants.some((variant) => variant.isBest)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the data test and verify RED**

Run:

```bash
npm test -- src/test/conceptVariants.test.js
```

Expected: FAIL because `src/data/conceptVariants.js` does not exist.

- [ ] **Step 3: Implement the pure variant helpers**

Create `src/data/conceptVariants.js`:

```js
export const RESULT_VARIANT_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'adobe-firefly', label: 'Adobe Firefly' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'claude', label: 'Claude' },
  { id: 'other', label: 'Other' },
]

function clean(value) {
  return String(value || '').trim()
}

function normaliseProvider(provider) {
  return RESULT_VARIANT_PROVIDERS.some((item) => item.id === provider) ? provider : 'other'
}

function normaliseRating(value) {
  const rating = Number.parseInt(value, 10)
  if (Number.isNaN(rating)) return 0
  return Math.max(0, Math.min(5, rating))
}

function hasVariantContent(input) {
  return Boolean(clean(input.imageUrl) || clean(input.response) || clean(input.notes))
}

export function getProviderLabel(provider) {
  return RESULT_VARIANT_PROVIDERS.find((item) => item.id === provider)?.label || 'Other'
}

export function createConceptVariant(input, options = {}) {
  if (!hasVariantContent(input || {})) return null

  return {
    id: options.id || Date.now().toString(),
    provider: normaliseProvider(input.provider || 'other'),
    title: clean(input.title),
    imageUrl: clean(input.imageUrl),
    response: clean(input.response),
    notes: clean(input.notes),
    rating: normaliseRating(input.rating),
    isBest: Boolean(input.isBest),
    createdAt: options.createdAt || new Date().toISOString(),
  }
}

export function getConceptVariants(concept) {
  return Array.isArray(concept?.variants) ? concept.variants : []
}

export function sortConceptVariants(variants = []) {
  return [...variants].sort((left, right) => {
    if (left.isBest && !right.isBest) return -1
    if (!left.isBest && right.isBest) return 1
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
  })
}

export function addConceptVariant(concept, input, options = {}) {
  const variant = createConceptVariant(input, options)
  if (!variant) return concept
  const existing = getConceptVariants(concept).map((item) => (
    variant.isBest ? { ...item, isBest: false } : item
  ))
  return { ...concept, variants: [variant, ...existing] }
}

export function markBestVariant(concept, variantId) {
  return {
    ...concept,
    variants: getConceptVariants(concept).map((variant) => ({
      ...variant,
      isBest: variant.id === variantId,
    })),
  }
}

export function updateVariantRating(concept, variantId, rating) {
  return {
    ...concept,
    variants: getConceptVariants(concept).map((variant) => (
      variant.id === variantId ? { ...variant, rating: normaliseRating(rating) } : variant
    )),
  }
}

export function removeConceptVariant(concept, variantId) {
  return {
    ...concept,
    variants: getConceptVariants(concept).filter((variant) => variant.id !== variantId),
  }
}
```

- [ ] **Step 4: Run the data test and verify GREEN**

Run:

```bash
npm test -- src/test/conceptVariants.test.js
```

Expected: PASS for `src/test/conceptVariants.test.js`.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/data/conceptVariants.js src/test/conceptVariants.test.js
git commit -m "feat(ai): add result variant model"
```

---

## Task 2: Inline Variant Lab Component

**Files:**
- Create: `src/components/ConceptVariantLab.jsx`
- Create: `src/test/ConceptVariantLab.test.jsx`

- [ ] **Step 1: Write the failing component tests**

Create `src/test/ConceptVariantLab.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConceptVariantLab from '../components/ConceptVariantLab'

const concept = {
  id: 'concept-1',
  prompt: 'Raven chest tattoo',
  variants: [],
}

describe('ConceptVariantLab', () => {
  it('shows an add result affordance when there are no variants', () => {
    render(
      <ConceptVariantLab
        concept={concept}
        onAddVariant={() => {}}
        onMarkBest={() => {}}
        onDeleteVariant={() => {}}
        onRateVariant={() => {}}
      />
    )

    expect(screen.getByText('AI Results')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Result' })).toBeTruthy()
  })

  it('saves a variant with image and text content', () => {
    const onAddVariant = vi.fn()
    render(
      <ConceptVariantLab
        concept={concept}
        onAddVariant={onAddVariant}
        onMarkBest={() => {}}
        onDeleteVariant={() => {}}
        onRateVariant={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'chatgpt' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Raven silhouette' } })
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'data:image/png;base64,abc' } })
    fireEvent.change(screen.getByLabelText('AI text'), { target: { value: 'Strong shape but simplify feathers.' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Best candidate so far.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rating 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    expect(onAddVariant).toHaveBeenCalledWith('concept-1', {
      provider: 'chatgpt',
      title: 'Raven silhouette',
      imageUrl: 'data:image/png;base64,abc',
      response: 'Strong shape but simplify feathers.',
      notes: 'Best candidate so far.',
      rating: 4,
    })
  })

  it('renders best variant first and can mark another variant best', () => {
    const onMarkBest = vi.fn()
    render(
      <ConceptVariantLab
        concept={{
          ...concept,
          variants: [
            {
              id: 'variant-old',
              provider: 'gemini',
              title: 'Critique',
              imageUrl: '',
              response: 'Simplify it.',
              notes: '',
              rating: 3,
              isBest: false,
              createdAt: '2026-05-31T08:00:00.000Z',
            },
            {
              id: 'variant-best',
              provider: 'chatgpt',
              title: 'Image pass',
              imageUrl: 'data:image/png;base64,best',
              response: '',
              notes: 'Strong silhouette.',
              rating: 5,
              isBest: true,
              createdAt: '2026-05-31T07:00:00.000Z',
            },
          ],
        }}
        onAddVariant={() => {}}
        onMarkBest={onMarkBest}
        onDeleteVariant={() => {}}
        onRateVariant={() => {}}
      />
    )

    expect(screen.getByText('Best')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Critique as Best' }))
    expect(onMarkBest).toHaveBeenCalledWith('concept-1', 'variant-old')
  })
})
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- src/test/ConceptVariantLab.test.jsx
```

Expected: FAIL because `src/components/ConceptVariantLab.jsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/ConceptVariantLab.jsx`:

```jsx
import { useState } from 'react'
import {
  RESULT_VARIANT_PROVIDERS,
  getConceptVariants,
  getProviderLabel,
  sortConceptVariants,
} from '../data/conceptVariants'

const EMPTY_FORM = {
  provider: 'chatgpt',
  title: '',
  imageUrl: '',
  response: '',
  notes: '',
  rating: 0,
}

function variantTitle(variant) {
  return variant.title || 'Untitled result'
}

function ratingLabel(rating) {
  return rating > 0 ? `${rating}/5` : 'Unrated'
}

function ResultForm({ conceptId, onAddVariant, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const hasContent = Boolean(form.imageUrl.trim() || form.response.trim() || form.notes.trim())

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleFile(file) {
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (event) => update('imageUrl', event.target.result)
    reader.readAsDataURL(file)
  }

  function save() {
    if (!hasContent) return
    onAddVariant(conceptId, form)
    setForm(EMPTY_FORM)
    onCancel()
  }

  return (
    <div className="mt-3 rounded-sm border border-ink-border bg-ink-black/40 p-3 space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="block text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50 mb-1">Provider</span>
          <select
            aria-label="Provider"
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50"
            value={form.provider}
            onChange={(event) => update('provider', event.target.value)}
          >
            {RESULT_VARIANT_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50 mb-1">Title</span>
          <input
            aria-label="Title"
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50"
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="Short label for this result"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50 mb-1">Image URL</span>
        <input
          aria-label="Image URL"
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50"
          value={form.imageUrl}
          onChange={(event) => update('imageUrl', event.target.value)}
          placeholder="Paste a data URL or remote image URL"
        />
      </label>

      <label className="block">
        <span className="block text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50 mb-1">Upload image</span>
        <input
          aria-label="Upload image"
          type="file"
          accept="image/*"
          className="block w-full text-xs text-cream-muted file:mr-3 file:rounded-sm file:border file:border-accent/40 file:bg-accent/10 file:px-3 file:py-2 file:text-accent file:font-mono file:uppercase file:tracking-widest"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </label>

      <label className="block">
        <span className="block text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50 mb-1">AI text</span>
        <textarea
          aria-label="AI text"
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body resize-none"
          rows={4}
          value={form.response}
          onChange={(event) => update('response', event.target.value)}
          placeholder="Paste generated response or critique"
        />
      </label>

      <label className="block">
        <span className="block text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50 mb-1">Notes</span>
        <textarea
          aria-label="Notes"
          className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body resize-none"
          rows={3}
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Your judgement: what works, what to refine"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              aria-label={`Rating ${rating}`}
              onClick={() => update('rating', rating)}
              className={`h-8 w-8 rounded-sm border text-xs font-mono transition-colors ${
                form.rating >= rating
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-ink-border text-cream-muted/50 hover:text-cream-muted'
              }`}
            >
              {rating}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/60 hover:text-cream-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!hasContent}
            className="px-4 py-2 rounded-sm bg-accent text-sm text-cream disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition-colors"
          >
            Save Result
          </button>
        </div>
      </div>
    </div>
  )
}

function VariantCard({ conceptId, variant, expanded, onToggle, onMarkBest, onDeleteVariant, onRateVariant }) {
  return (
    <article className={`rounded-sm border p-3 ${variant.isBest ? 'border-accent/50 bg-accent/5' : 'border-ink-border bg-ink-black/30'}`}>
      <button type="button" className="w-full text-left" onClick={onToggle}>
        <div className="flex gap-3">
          {variant.imageUrl && (
            <img src={variant.imageUrl} alt="" className="h-16 w-16 rounded-sm object-cover bg-ink-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.625rem] font-mono uppercase tracking-widest text-accent/80">{getProviderLabel(variant.provider)}</span>
              {variant.isBest && <span className="text-[0.625rem] font-mono uppercase tracking-widest text-cream">Best</span>}
            </div>
            <h4 className="mt-1 truncate font-display text-lg text-cream">{variantTitle(variant)}</h4>
            <p className="mt-1 text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/50">{ratingLabel(variant.rating)}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-ink-border/50 pt-3">
          {variant.imageUrl && <img src={variant.imageUrl} alt={variantTitle(variant)} className="w-full rounded-sm bg-ink-muted object-cover" />}
          {variant.response && <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream-muted">{variant.response}</p>}
          {variant.notes && <p className="whitespace-pre-wrap text-sm leading-relaxed text-cream">Notes: {variant.notes}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                aria-label={`Set ${variantTitle(variant)} rating ${rating}`}
                onClick={() => onRateVariant(conceptId, variant.id, rating)}
                className={`h-7 w-7 rounded-sm border text-[0.625rem] font-mono transition-colors ${
                  variant.rating >= rating
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-ink-border text-cream-muted/50 hover:text-cream-muted'
                }`}
              >
                {rating}
              </button>
            ))}
            {!variant.isBest && (
              <button
                type="button"
                aria-label={`Mark ${variantTitle(variant)} as Best`}
                onClick={() => onMarkBest(conceptId, variant.id)}
                className="ml-auto text-[0.625rem] font-mono uppercase tracking-widest text-accent hover:text-accent-hover"
              >
                Mark Best
              </button>
            )}
            <button
              type="button"
              onClick={() => onDeleteVariant(conceptId, variant.id)}
              className="text-[0.625rem] font-mono uppercase tracking-widest text-cream-muted/40 hover:text-accent"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

export default function ConceptVariantLab({ concept, onAddVariant, onMarkBest, onDeleteVariant, onRateVariant }) {
  const [adding, setAdding] = useState(false)
  const [expandedId, setExpandedId] = useState('')
  const variants = sortConceptVariants(getConceptVariants(concept))

  return (
    <section className="mt-3 border-t border-ink-border/40 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.625rem] font-mono uppercase tracking-widest text-accent/70">AI Results</p>
          <p className="text-xs text-cream-muted/50">{variants.length} saved variant{variants.length === 1 ? '' : 's'}</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[0.625rem] font-mono uppercase tracking-widest text-accent hover:text-accent-hover"
        >
          Add Result
        </button>
      </div>

      {adding && (
        <ResultForm
          conceptId={concept.id}
          onAddVariant={onAddVariant}
          onCancel={() => setAdding(false)}
        />
      )}

      {variants.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {variants.map((variant) => (
            <VariantCard
              key={variant.id}
              conceptId={concept.id}
              variant={variant}
              expanded={expandedId === variant.id}
              onToggle={() => setExpandedId((current) => current === variant.id ? '' : variant.id)}
              onMarkBest={onMarkBest}
              onDeleteVariant={onDeleteVariant}
              onRateVariant={onRateVariant}
            />
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the component test and verify GREEN**

Run:

```bash
npm test -- src/test/ConceptVariantLab.test.jsx
```

Expected: PASS for `src/test/ConceptVariantLab.test.jsx`.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/components/ConceptVariantLab.jsx src/test/ConceptVariantLab.test.jsx
git commit -m "feat(ai): add inline result lab"
```

---

## Task 3: Wire Variants Into Concepts

**Files:**
- Modify: `src/pages/Concepts.jsx`
- Create: `src/test/ConceptsVariants.test.jsx`

- [ ] **Step 1: Write the failing Concepts page integration test**

Create `src/test/ConceptsVariants.test.jsx`:

```jsx
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Concepts from '../pages/Concepts'

const initialConcept = {
  id: 'concept-pack',
  prompt: 'Raven idea',
  promptPack: { sourceSummary: 'Raven idea' },
  imageUrl: '',
  response: '',
  tags: ['blackwork'],
  createdAt: '2026-05-31T07:00:00.000Z',
}

function ConceptsHarness() {
  const [concepts, setConcepts] = useState([initialConcept])
  return <Concepts concepts={concepts} setConcepts={setConcepts} artists={[]} ideas={[]} />
}

describe('Concepts result variants', () => {
  it('adds an inline variant without losing the saved prompt pack', () => {
    render(<ConceptsHarness />)

    expect(screen.getByText('Saved prompt pack')).toBeTruthy()
    expect(screen.getByText('AI Results')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Raven silhouette' } })
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'data:image/png;base64,abc' } })
    fireEvent.change(screen.getByLabelText('AI text'), { target: { value: 'Strong shape.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rating 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    expect(screen.getByText('Raven silhouette')).toBeTruthy()
    expect(screen.getByText('4/5')).toBeTruthy()
    expect(screen.getByText('Saved prompt pack')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the page integration test and verify RED**

Run:

```bash
npm test -- src/test/ConceptsVariants.test.jsx
```

Expected: FAIL because `Concepts.jsx` does not render `AI Results`.

- [ ] **Step 3: Import helpers and component in `src/pages/Concepts.jsx`**

Add imports near the top of `src/pages/Concepts.jsx`:

```js
import ConceptVariantLab from '../components/ConceptVariantLab'
import {
  addConceptVariant,
  markBestVariant,
  removeConceptVariant,
  updateVariantRating,
} from '../data/conceptVariants'
```

- [ ] **Step 4: Add concept-level variant handlers**

Inside `Concepts`, after `savePromptPack(pack)`, add:

```js
  function addVariant(conceptId, input) {
    setConcepts((prev) => prev.map((concept) => (
      concept.id === conceptId ? addConceptVariant(concept, input) : concept
    )))
  }

  function markVariantBest(conceptId, variantId) {
    setConcepts((prev) => prev.map((concept) => (
      concept.id === conceptId ? markBestVariant(concept, variantId) : concept
    )))
  }

  function deleteVariant(conceptId, variantId) {
    setConcepts((prev) => prev.map((concept) => (
      concept.id === conceptId ? removeConceptVariant(concept, variantId) : concept
    )))
  }

  function rateVariant(conceptId, variantId, rating) {
    setConcepts((prev) => prev.map((concept) => (
      concept.id === conceptId ? updateVariantRating(concept, variantId, rating) : concept
    )))
  }
```

- [ ] **Step 5: Render `ConceptVariantLab` in each concept card**

In the concept card body, after `<SavedPromptPack promptPack={c.promptPack} />`, add:

```jsx
                <ConceptVariantLab
                  concept={c}
                  onAddVariant={addVariant}
                  onMarkBest={markVariantBest}
                  onDeleteVariant={deleteVariant}
                  onRateVariant={rateVariant}
                />
```

Keep the existing `response`, `+ Add image or response`, style tag picker, and artist matching sections below it. Do not remove the older paste-back flow in this task.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- src/test/conceptVariants.test.js src/test/ConceptVariantLab.test.jsx src/test/ConceptsVariants.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/pages/Concepts.jsx src/test/ConceptsVariants.test.jsx
git commit -m "feat(ai): wire result variants into concepts"
```

---

## Task 4: Docs And Guide Screenshot

**Files:**
- Modify: `docs/06-concepts.md`
- Modify: `src/pages/Help.jsx`
- Modify: `public/guide/concept-card.png`

- [ ] **Step 1: Update Markdown guide**

Edit `docs/06-concepts.md` in the **Work with a concept** section to mention:

```md
- **AI Results** — add ChatGPT, Firefly, Gemini, Claude, or other outputs as curated variants. Each result can hold an image, generated text, personal notes, and a rating.
- **Best result** — mark one variant as Best to keep the strongest direction visible first.
```

Keep the existing prompt-pack and style-matching guidance.

- [ ] **Step 2: Update in-app Help text**

In `src/pages/Help.jsx`, update the Concepts steps so they include:

```js
'Save multiple AI outputs as result variants on a concept. Each variant can hold an image, generated text, notes and a rating.',
'Mark the strongest variant as Best, then keep style matching on the concept to reveal artist fits.',
```

Preserve the existing prompt-pack steps.

- [ ] **Step 3: Refresh `public/guide/concept-card.png`**

Run the app:

```bash
npm run dev
```

Use the existing Playwright screenshot process from `docs/MAINTAINING.md`:

1. Open `/concepts`.
2. Create or seed a concept with a prompt pack.
3. Add two result variants, one with both image and text.
4. Mark one variant Best.
5. Capture the concept card screenshot to `public/guide/concept-card.png`.

If the in-app browser screenshot path is unavailable, use Playwright MCP as the fallback and save a 430 x 920 PNG, matching the current guide screenshot dimensions.

- [ ] **Step 4: Run documentation smoke checks**

Run:

```bash
file public/guide/concept-card.png
git diff -- docs/06-concepts.md src/pages/Help.jsx
```

Expected: screenshot remains PNG, docs describe prompt packs plus AI Results variants.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/06-concepts.md src/pages/Help.jsx public/guide/concept-card.png
git commit -m "docs(ai): document result variants"
```

---

## Task 5: Full Verification And Browser Check

**Files:**
- Verify all changed files from Tasks 1-4.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: all Vitest files pass, including `src/test/conceptVariants.test.js`, `src/test/ConceptVariantLab.test.jsx`, and `src/test/ConceptsVariants.test.jsx`.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: ESLint exits cleanly.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build exits cleanly.

- [ ] **Step 4: Browser verification**

Run:

```bash
npm run dev
```

Open `/concepts` and verify:

- Existing concept cards still render.
- Saved prompt packs still render and can copy prompts.
- **Add Result** opens the inline form.
- Save is disabled until image, AI text, or notes is present.
- A result with both image URL and AI text saves.
- Two variants can exist on one concept.
- Marking a second variant as Best moves the Best badge.
- Rating buttons update the visible rating.
- Delete removes only the selected variant.
- Style tags and artist matches still work at the concept level.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: working tree is clean after commits, and recent commits correspond to the tasks above.
