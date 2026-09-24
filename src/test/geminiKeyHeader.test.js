import { describe, it, expect, vi, afterEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { discoverArtistsWithGemini } from '../data/discovery'
import { generateImageWithGemini } from '../data/geminiImage'

// The Gemini key goes in the x-goog-api-key header, never the query string: a
// URL is what ends up in proxy logs, devtools exports and error reports.
// Screenshot intake and the skin try-on always did this; artist discovery and
// concept images still put `?key=` in the URL.

afterEach(() => vi.unstubAllGlobals())

function stubFetch(body) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function expectKeyInHeaderOnly(fetchMock) {
  const [url, opts] = fetchMock.mock.calls[0]
  expect(url).not.toContain('SECRET')
  expect(url).not.toContain('key=')
  expect(opts.headers['x-goog-api-key']).toBe('SECRET')
}

describe('Gemini key transport', () => {
  it('artist discovery sends the key as a header', async () => {
    const fetchMock = stubFetch({ candidates: [{ content: { parts: [{ text: '' }] } }] })
    await discoverArtistsWithGemini('SECRET', [])
    expectKeyInHeaderOnly(fetchMock)
  })

  it('concept image generation sends the key as a header', async () => {
    const fetchMock = stubFetch({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] })
    await generateImageWithGemini('SECRET', { prompt: 'a moth' })
    expectKeyInHeaderOnly(fetchMock)
  })

  // Guards the next caller too, not just these two.
  it('no Gemini URL anywhere in src carries a key parameter', () => {
    const offenders = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          if (name !== 'test') walk(path)
        } else if (/\.jsx?$/.test(name)) {
          const source = readFileSync(path, 'utf8')
          if (/generativelanguage\.googleapis\.com[^`'"\n]*[?&]key=/.test(source)) offenders.push(path)
        }
      }
    }
    walk(join(__dirname, '..'))
    expect(offenders).toEqual([])
  })
})
