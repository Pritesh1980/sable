// Prompt builders for the Concepts composer. Every generation path — DALL·E,
// copy-prompt, Gemini — funnels the steer artist (style descriptor + tags)
// and placement through these so "generate in this style" means the same
// thing regardless of provider.

const TEXT_SYSTEM_PROMPT = `You are a creative tattoo concept consultant with deep knowledge of tattoo styles, placement, and aesthetics. When given a concept prompt, provide:
1. A vivid visual description of the tattoo concept (2-3 sentences)
2. Recommended style (from: dark-illustrative, fine-line, blackwork, surrealism, dark-fantasy, realism)
3. Suggested placement
4. Mood/aesthetic notes (1-2 sentences)
5. Which type of artist would suit this best (brief)

Be specific, evocative, and editorial in tone. Format as plain text with labelled sections.`

// Renders the steer fields as a prompt fragment; empty when nothing is set.
function steerFragment({ styleDescriptor = '', tags = [], placement = '' } = {}) {
  const parts = []
  if (styleDescriptor) parts.push(`in the style of: ${styleDescriptor}`)
  if (tags.length) parts.push(`style tags: ${tags.join(', ')}`)
  if (placement) parts.push(`Placement: ${placement}`)
  return parts.length ? ` ${parts.join('. ')}.` : ''
}

export function buildTextPrompt(userPrompt, steer = {}) {
  return `${TEXT_SYSTEM_PROMPT}\n\nA client wants a tattoo based on this prompt: "${userPrompt}"${steerFragment(steer)}`
}

export function buildImagePrompt(userPrompt, steer = {}) {
  return `Professional tattoo concept art: ${userPrompt}.${steerFragment(steer)} Black ink tattoo design on white background, fine line illustration, high contrast, clean lines, suitable for tattooing, tattoo flash art style, no text, no watermarks`
}
