import { describe, expect, it, vi } from 'vitest'
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
    expect(RESULT_VARIANT_PROVIDERS).toEqual([
      { id: 'chatgpt', label: 'ChatGPT' },
      { id: 'adobe-firefly', label: 'Adobe Firefly' },
      { id: 'gemini', label: 'Gemini' },
      { id: 'claude', label: 'Claude' },
      { id: 'other', label: 'Other' },
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

  it('trims text fields and falls back to generated id and created date', () => {
    const variant = createConceptVariant({
      provider: 'gemini',
      title: '  Placement critique  ',
      imageUrl: '  https://example.com/raven.png  ',
      response: '  Simplify the feather detail.  ',
      notes: '  Keep the chest silhouette readable.  ',
      rating: 'not-a-number',
    })

    expect(variant.id).toEqual(expect.any(String))
    expect(variant.id).not.toBe('')
    expect(variant.title).toBe('Placement critique')
    expect(variant.imageUrl).toBe('https://example.com/raven.png')
    expect(variant.response).toBe('Simplify the feather detail.')
    expect(variant.notes).toBe('Keep the chest silhouette readable.')
    expect(variant.rating).toBe(0)
    expect(new Date(variant.createdAt).toString()).not.toBe('Invalid Date')
  })

  it('generates distinct fallback ids when Date.now does not advance', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    vi.stubGlobal('crypto', { randomUUID: undefined })

    try {
      const first = createConceptVariant({ response: 'First result.' })
      const second = createConceptVariant({ response: 'Second result.' })

      expect(first.id).not.toBe(second.id)
      expect(first.id).toMatch(/^1234567890-/)
      expect(second.id).toMatch(/^1234567890-/)
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
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
    expect(getConceptVariants({ id: 'malformed', variants: null })).toEqual([])
    expect(getConceptVariants({ id: 'malformed', variants: {} })).toEqual([])
  })

  it('returns an empty list for malformed variant arrays', () => {
    expect(getConceptVariants({
      id: 'malformed',
      variants: [
        null,
        {
          id: 'valid-looking',
          provider: 'chatgpt',
          response: 'This array is still malformed.',
        },
      ],
    })).toEqual([])

    expect(getConceptVariants({
      id: 'malformed',
      variants: [{ id: 'valid-looking' }, 'not-a-variant'],
    })).toEqual([])
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
    expect(next.prompt).toBe(concept.prompt)
    expect(next.variants[0].id).toBe('claude-1')
    expect(next.variants.map((variant) => variant.id)).toContain('claude-1')
    expect(concept.variants.map((variant) => variant.id)).not.toContain('claude-1')
  })

  it('returns the original concept when adding an empty variant', () => {
    const next = addConceptVariant(concept, {
      provider: 'claude',
      title: 'No content',
      imageUrl: '',
      response: '',
      notes: '   ',
      rating: 2,
    })

    expect(next).toBe(concept)
  })

  it('clears sibling best flags only when the new variant is best', () => {
    const ordinary = addConceptVariant(concept, {
      provider: 'claude',
      response: 'Artist-facing wording.',
      isBest: false,
    }, {
      id: 'ordinary',
      createdAt: '2026-05-31T11:00:00.000Z',
    })

    expect(ordinary.variants.find((variant) => variant.id === 'best').isBest).toBe(true)

    const nextBest = addConceptVariant(concept, {
      provider: 'claude',
      response: 'Artist-facing wording.',
      isBest: true,
    }, {
      id: 'next-best',
      createdAt: '2026-05-31T11:00:00.000Z',
    })

    expect(nextBest.variants.find((variant) => variant.id === 'next-best').isBest).toBe(true)
    expect(nextBest.variants.find((variant) => variant.id === 'best').isBest).toBe(false)
  })

  it('marks one variant best and clears sibling best flags', () => {
    const next = markBestVariant(concept, 'newer')

    expect(next).not.toBe(concept)
    expect(concept.variants.find((variant) => variant.id === 'newer').isBest).toBe(false)
    expect(next.variants.find((variant) => variant.id === 'newer').isBest).toBe(true)
    expect(next.variants.find((variant) => variant.id === 'best').isBest).toBe(false)
  })

  it('returns the original concept when marking a missing variant best', () => {
    const next = markBestVariant(concept, 'missing')

    expect(next).toBe(concept)
    expect(next.variants.find((variant) => variant.id === 'best').isBest).toBe(true)
  })

  it('updates a variant rating', () => {
    const next = updateVariantRating(concept, 'older', 5)

    expect(next).not.toBe(concept)
    expect(concept.variants.find((variant) => variant.id === 'older').rating).toBe(3)
    expect(next.variants.find((variant) => variant.id === 'older').rating).toBe(5)
  })

  it('removes a variant even when it was best', () => {
    const next = removeConceptVariant(concept, 'best')

    expect(next).not.toBe(concept)
    expect(next.variants.map((variant) => variant.id)).toEqual(['older', 'newer'])
    expect(concept.variants.map((variant) => variant.id)).toContain('best')
    expect(next.variants.some((variant) => variant.isBest)).toBe(false)
  })
})
