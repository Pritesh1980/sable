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
