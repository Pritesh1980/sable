import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildDescribePrompt,
  parseDescribeResponse,
  describeTattooWithGemini,
  readDescription,
  saveDescription,
  DESCRIPTIONS_KEY,
  MAX_DESCRIPTIONS,
} from '../data/tattooDescription'
import { STYLE_TAGS } from '../data/artists'

describe('buildDescribePrompt', () => {
  const prompt = buildDescribePrompt()

  it('treats text in the image as data, not instructions', () => {
    expect(prompt).toMatch(/never instructions/i)
  })

  it('forbids naming or guessing the artist or the person', () => {
    expect(prompt).toMatch(/do not name or guess/i)
    expect(prompt).toMatch(/artist/i)
  })

  it('offers only the app style tags', () => {
    for (const tag of STYLE_TAGS) expect(prompt).toContain(tag)
  })

  it('asks for the fixed reply format', () => {
    expect(prompt).toContain('DESCRIPTION:')
    expect(prompt).toContain('STYLES:')
    expect(prompt).toContain('NOT_A_TATTOO')
  })
})

describe('parseDescribeResponse', () => {
  it('reads the description and allowlisted styles', () => {
    const r = parseDescribeResponse(
      'DESCRIPTION: A raven in heavy black shading.\nIts wings fade into fine dotwork.\nSTYLES: blackwork, dark-fantasy, watercolour'
    )
    expect(r).toEqual({
      text: 'A raven in heavy black shading. Its wings fade into fine dotwork.',
      styles: ['blackwork', 'dark-fantasy'],
    })
  })

  it('tolerates markdown bold labels and case', () => {
    const r = parseDescribeResponse('**Description:** A moth.\n**Styles:** Fine-Line')
    expect(r).toEqual({ text: 'A moth.', styles: ['fine-line'] })
  })

  it('allows no styles', () => {
    expect(parseDescribeResponse('DESCRIPTION: A rose.\nSTYLES: -')).toEqual({ text: 'A rose.', styles: [] })
  })

  it('reports a photo that is not a tattoo', () => {
    expect(parseDescribeResponse('NOT_A_TATTOO')).toEqual({ notTattoo: true })
  })

  it('returns null with no description', () => {
    expect(parseDescribeResponse('')).toBeNull()
    expect(parseDescribeResponse('STYLES: blackwork')).toBeNull()
    expect(parseDescribeResponse('Sure! Here you go.')).toBeNull()
  })

  it('caps a runaway description', () => {
    const r = parseDescribeResponse(`DESCRIPTION: ${'ink '.repeat(400)}\nSTYLES: -`)
    expect(r.text.length).toBeLessThanOrEqual(700)
    expect(r.text.endsWith('…')).toBe(true)
  })

  it('rejects a reply without the STYLES line', () => {
    expect(parseDescribeResponse('DESCRIPTION: Tattooed by someone.')).toBeNull()
  })

  it('drops duplicate styles', () => {
    expect(parseDescribeResponse('DESCRIPTION: x\nSTYLES: realism, realism').styles).toEqual(['realism'])
  })
})

describe('describeTattooWithGemini', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the key in a header and the photo inline, then parses', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'DESCRIPTION: A skull.\nSTYLES: realism' }] } }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await describeTattooWithGemini('k123', 'data:image/jpeg;base64,QUJD')
    expect(r).toEqual({ text: 'A skull.', styles: ['realism'] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).not.toContain('k123')
    expect(init.headers['x-goog-api-key']).toBe('k123')
    const body = JSON.parse(init.body)
    expect(body.contents[0].parts[1].inline_data).toEqual({ mime_type: 'image/jpeg', data: 'QUJD' })
  })

  it('throws on an unreadable reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hmm' }] } }] }),
    })))
    await expect(describeTattooWithGemini('k', 'data:image/png;base64,QQ==')).rejects.toThrow(/could not describe/i)
  })
})

describe('description cache', () => {
  beforeEach(() => localStorage.clear())

  it('reads back a saved description by photo', () => {
    saveDescription('/images/a.jpg', { text: 'A moth.', styles: ['fine-line'] })
    expect(readDescription('/images/a.jpg')).toMatchObject({ text: 'A moth.', styles: ['fine-line'] })
    expect(readDescription('/images/b.jpg')).toBeNull()
  })

  it('matches a blob ref by its key', () => {
    saveDescription({ key: 'user/u1/saved/s1/a.jpg' }, { text: 'A rose.', styles: [] })
    expect(readDescription({ key: 'user/u1/saved/s1/a.jpg', note: 'x' })?.text).toBe('A rose.')
  })

  it('ignores a ref with no identity', () => {
    saveDescription(null, { text: 'x', styles: [] })
    expect(localStorage.getItem(DESCRIPTIONS_KEY)).toBeNull()
    expect(readDescription(null)).toBeNull()
  })

  it('keeps only the newest entries', () => {
    for (let i = 0; i < MAX_DESCRIPTIONS + 5; i++) saveDescription(`/p${i}.jpg`, { text: `t${i}`, styles: [] })
    expect(readDescription('/p0.jpg')).toBeNull()
    expect(readDescription(`/p${MAX_DESCRIPTIONS + 4}.jpg`)?.text).toBe(`t${MAX_DESCRIPTIONS + 4}`)
    expect(Object.keys(JSON.parse(localStorage.getItem(DESCRIPTIONS_KEY)))).toHaveLength(MAX_DESCRIPTIONS)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem(DESCRIPTIONS_KEY, '{nope')
    expect(readDescription('/a.jpg')).toBeNull()
    saveDescription('/a.jpg', { text: 'ok', styles: [] })
    expect(readDescription('/a.jpg')?.text).toBe('ok')
  })
})
