// AI-assisted artist discovery for the Consider shelf ("Find more like
// this"). Pure helpers here are unit-tested; discoverArtistsWithGemini is a
// thin network wrapper. LLMs invent Instagram handles, so everything parsed
// out of a response is marked `source: 'ai'` and shown with an "unverified"
// badge — the user opens the profile before adding.

import { STYLE_TAGS } from './artists'

// gemini-2.5-flash was retired for new keys (July 2026); gemini-3.5-flash is
// Google's named replacement. See https://ai.google.dev/gemini-api/docs/deprecations
export const GEMINI_TEXT_MODEL = 'gemini-3.5-flash'

export function buildDiscoveryPrompt(artists = [], { exclude = [], count = 8 } = {}) {
  const tagCounts = new Map()
  const descriptors = []
  for (const a of artists) {
    for (const t of a.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
    if (a.styleDescriptor) descriptors.push(a.styleDescriptor)
  }
  const profile = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `${tag} (${n} artists)`)
    .join(', ')

  return [
    `I collect tattoo artists on Instagram. My taste profile by style: ${profile}.`,
    descriptors.length ? `Recurring stylistic threads: ${descriptors.slice(0, 8).join('; ')}.` : '',
    `Suggest ${count} real, currently-active tattoo artists on Instagram who fit this profile. Only real artists you are confident exist — never invent a handle.`,
    `Do NOT suggest any of these (already known to me): ${exclude.join(', ')}.`,
    `Reply with ONLY one line per artist, no other text, in exactly this format:`,
    `handle | name | styles | note`,
    `where styles is a comma-separated subset of: ${STYLE_TAGS.join(', ')} — and note is one short sentence on what distinguishes them.`,
  ].filter(Boolean).join('\n\n')
}

export function parseDiscoveryResponse(text = '') {
  const seen = new Set()
  const out = []
  for (const raw of String(text).split('\n')) {
    const parts = raw.split('|').map((p) => p.trim())
    if (parts.length < 4) continue
    const handle = parts[0].replace(/^@/, '').toLowerCase()
    const name = parts[1]
    const tags = parts[2].split(',').map((t) => t.trim().toLowerCase()).filter((t) => STYLE_TAGS.includes(t))
    const note = parts[3]
    if (!handle || !name || tags.length === 0) continue
    if (handle === 'handle') continue // format header echoed back
    if (seen.has(handle)) continue
    seen.add(handle)
    out.push({ handle, name, tags, note, source: 'ai' })
  }
  return out
}

export async function discoverArtistsWithGemini(apiKey, artists, { exclude = [] } = {}) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildDiscoveryPrompt(artists, { exclude }) }] }],
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini error ${res.status}`)
  }
  const json = await res.json()
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('\n')
  return parseDiscoveryResponse(text)
}
