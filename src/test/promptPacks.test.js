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
