// Live tattoo-concept image generation via the Gemini image API (paid tier — billing required).
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
