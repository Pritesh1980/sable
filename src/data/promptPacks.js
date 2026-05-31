import { getImageNote } from './planning'

export const PROMPT_PACK_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT', field: 'chatgptImagePrompt' },
  { id: 'adobe-firefly', label: 'Adobe Firefly', field: 'adobeFireflyPrompt' },
  { id: 'gemini', label: 'Gemini', field: 'geminiCritiquePrompt' },
  { id: 'claude', label: 'Claude', field: 'claudeRefinementPrompt' },
]

const NEGATIVE_PROMPT = [
  'no text',
  'no watermark',
  'no copied artist style',
  'no logos',
  'no extra limbs',
  'no muddy shading',
  'no photorealistic skin mockup unless explicitly requested',
].join(', ')

function compactList(items) {
  return items.filter(Boolean).join('\n')
}

function clean(value) {
  return String(value || '').trim()
}

function artistLabel(artist) {
  if (!artist) return ''
  return artist.name ? `${artist.name} (@${artist.handle})` : `@${artist.handle}`
}

function summarizeIdea(idea, artists = []) {
  if (!idea) return ''
  const linked = artists.filter((artist) => idea.linkedArtists?.includes(artist.id))
  const imageNotes = (idea.images || [])
    .map((image) => getImageNote(image))
    .filter(Boolean)

  return compactList([
    idea.title ? `Idea: ${idea.title}` : 'Idea: Untitled',
    idea.description ? `Concept: ${idea.description}` : '',
    idea.placement ? `Placement: ${idea.placement}` : '',
    idea.tags?.length ? `Style tags: ${idea.tags.join(', ')}` : '',
    linked.length ? `Linked artists: ${linked.map(artistLabel).join(', ')}` : '',
    imageNotes.length ? `Reference notes: ${imageNotes.join(' | ')}` : '',
  ])
}

function createPack({ sourceType, sourceIdeaId = '', sourceSummary, createdAt }) {
  const summary = clean(sourceSummary)
  if (!summary) return null

  return {
    sourceType,
    sourceIdeaId,
    sourceSummary: summary,
    chatgptImagePrompt: [
      'Create a refined tattoo concept image from this brief.',
      summary,
      'Use high-contrast black ink, clean readable shapes, tattooable linework, and an editorial dark illustrative mood.',
      'Output should feel like concept art or flash reference, not a finished tattoo copied from any living artist.',
    ].join('\n\n'),
    adobeFireflyPrompt: [
      'Generate a polished tattoo reference composition.',
      summary,
      'Prioritise clean silhouette, readable negative space, crisp blackwork, and a layout suitable for tattoo refinement in Photoshop or Firefly.',
    ].join('\n\n'),
    geminiCritiquePrompt: [
      'Critique this tattoo concept for visual suitability, placement, readability, and risks.',
      summary,
      'Return concise sections: strongest visual idea, tattooability risks, placement considerations, what to simplify, and what reference details not to copy.',
    ].join('\n\n'),
    claudeRefinementPrompt: [
      'Refine this tattoo idea into clear artist-facing language.',
      summary,
      'Return a concise consultation brief, key visual constraints, questions for the artist, and a short Instagram DM version.',
    ].join('\n\n'),
    negativePrompt: NEGATIVE_PROMPT,
    createdAt: createdAt || new Date().toISOString(),
  }
}

export function hasPromptPackSource({ sourceType, prompt = '', sourceIdeaId = '' }) {
  if (sourceType === 'brief-idea') return Boolean(clean(sourceIdeaId))
  return Boolean(clean(prompt))
}

export function getPromptPackFields(promptPack) {
  if (!promptPack) return []
  return PROMPT_PACK_PROVIDERS
    .map((provider) => ({
      ...provider,
      value: promptPack[provider.field] || '',
    }))
    .filter((provider) => provider.value)
}

export function buildPromptPackFromFreeText(prompt, options = {}) {
  return createPack({
    sourceType: 'free-text',
    sourceSummary: clean(prompt),
    createdAt: options.createdAt,
  })
}

export function buildPromptPackFromIdea(idea, artists = [], options = {}) {
  if (!idea) return null
  return createPack({
    sourceType: 'brief-idea',
    sourceIdeaId: idea.id || '',
    sourceSummary: summarizeIdea(idea, artists),
    createdAt: options.createdAt,
  })
}
