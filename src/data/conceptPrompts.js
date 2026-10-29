// Prompt builders for the Concepts composer. Every generation path — DALL·E,
// copy-prompt, Gemini — funnels the steer artist (style descriptor + tags)
// and placement through these so "generate in this style" means the same
// thing regardless of provider. Copy-prompt sends the image prompt too: the
// round trip expects an image pasted back, not a written description (#156).

// Renders the steer fields as a prompt fragment; empty when nothing is set.
function steerFragment({ styleDescriptor = '', tags = [], placement = '' } = {}) {
  const parts = []
  if (styleDescriptor) parts.push(`in the style of: ${styleDescriptor}`)
  if (tags.length) parts.push(`style tags: ${tags.join(', ')}`)
  if (placement) parts.push(`Placement: ${placement}`)
  return parts.length ? ` ${parts.join('. ')}.` : ''
}

export function buildImagePrompt(userPrompt, steer = {}) {
  return `Professional tattoo concept art: ${userPrompt}.${steerFragment(steer)} Black ink tattoo design on white background, fine line illustration, high contrast, clean lines, suitable for tattooing, tattoo flash art style, no text, no watermarks`
}
