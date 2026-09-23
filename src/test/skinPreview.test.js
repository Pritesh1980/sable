import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  buildSkinPreviewPrompt,
  dataUrlToInlineData,
  generateSkinPreviewWithGemini,
} from '../data/skinPreview'
import { GEMINI_IMAGE_MODEL } from '../data/geminiImage'

afterEach(() => vi.restoreAllMocks())

const photo = 'data:image/png;base64,UEhPVE8='
const design = 'data:image/png;base64,REVTSUdO'

describe('buildSkinPreviewPrompt', () => {
  it('names the placement and asks for a healed tattoo that follows the body and lighting', () => {
    const prompt = buildSkinPreviewPrompt({ placement: 'forearm' })
    expect(prompt).toMatch(/forearm/)
    expect(prompt).toMatch(/first image is a photo/i)
    expect(prompt).toMatch(/second image is the tattoo design/i)
    expect(prompt).toMatch(/curv|wrap/i)
    expect(prompt).toMatch(/lighting/i)
  })

  it('keeps the rest of the photo unchanged and treats any text in the images as data', () => {
    const prompt = buildSkinPreviewPrompt({ placement: 'ribs' })
    expect(prompt).toMatch(/unchanged/i)
    expect(prompt).toMatch(/text.*(inside|in) the images.*(not|never).*instruction/i)
  })

  it('keeps the design as drawn: its own colours, its proportions, and none of its background', () => {
    const prompt = buildSkinPreviewPrompt({ placement: 'forearm' })
    expect(prompt).not.toMatch(/black-ink/i)
    expect(prompt).toMatch(/own colou?rs/i)
    expect(prompt).toMatch(/background/i)
    expect(prompt).toMatch(/aspect ratio|proportions/i)
    expect(prompt).toMatch(/landmarks/i)
  })

  it('falls back to a generic placement', () => {
    expect(buildSkinPreviewPrompt({})).toMatch(/this part of the body/i)
  })
})

describe('dataUrlToInlineData', () => {
  it('splits a data URL into mime type and base64 data', () => {
    expect(dataUrlToInlineData('data:image/jpeg;base64,AAAA')).toEqual({ mimeType: 'image/jpeg', data: 'AAAA' })
  })

  it('rejects anything that is not a base64 image data URL', () => {
    expect(() => dataUrlToInlineData('https://example.com/a.png')).toThrow()
  })
})

describe('generateSkinPreviewWithGemini', () => {
  it('sends the key in a header, photo first then design, and returns the image', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'UkVTVUxU' } }] } }] }),
    })

    const result = await generateSkinPreviewWithGemini('secret-key', { skinPhoto: photo, design, placement: 'forearm' })

    expect(result).toBe('data:image/png;base64,UkVTVUxU')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain(GEMINI_IMAGE_MODEL)
    expect(url).not.toContain('secret-key')
    expect(init.headers['x-goog-api-key']).toBe('secret-key')
    const parts = JSON.parse(init.body).contents[0].parts
    expect(parts[0].text).toMatch(/forearm/)
    expect(parts[1].inlineData).toEqual({ mimeType: 'image/png', data: 'UEhPVE8=' })
    expect(parts[2].inlineData).toEqual({ mimeType: 'image/png', data: 'REVTSUdO' })
  })

  it('surfaces the API error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API key not valid' } }),
    })
    await expect(generateSkinPreviewWithGemini('k', { skinPhoto: photo, design, placement: 'forearm' }))
      .rejects.toThrow('API key not valid')
  })
})
