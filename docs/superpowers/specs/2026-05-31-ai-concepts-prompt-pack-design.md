# AI Concepts Prompt Pack Design

## Goal

Expand the existing AI Concepts page into a local-first prompt workbench for visual tattoo ideation.

The first version should help Pritesh use ChatGPT Plus, Gemini AI Pro, Claude Pro, and Adobe Creative Cloud manually, without adding runtime API dependencies or backend infrastructure.

## Scope

In scope:

- Generate a prompt pack from either free text or an existing Brief idea.
- Include provider-specific prompts for ChatGPT, Adobe Firefly, Gemini, and Claude.
- Support copying individual prompts.
- Save the generated prompt pack as a concept.
- Accept generated outputs back into Tattoo through image upload/drop and pasted text notes.
- Keep all saved data local via the existing concepts storage path.

Out of scope for this version:

- Direct API calls to OpenAI, Anthropic, Gemini, or Adobe.
- Artist style DNA analysis.
- Automatic artist matching critique.
- Share/export bundle changes.
- Backend or deployment-dependent features.

## User Flow

1. User opens AI Concepts.
2. User chooses a source:
   - Free-text concept prompt.
   - Existing Brief idea, which pulls title, description, placement, tags, linked artists, and reference-image notes.
3. App generates a provider-specific prompt pack.
4. User copies a prompt into ChatGPT, Adobe Firefly, Gemini, or Claude.
5. User pastes generated text or imports generated images back into Tattoo.
6. App stores the prompt pack and any returned outputs as a concept.

## Prompt Pack Shape

Each generated prompt pack should contain:

- `chatgptImagePrompt`: visual generation prompt for ChatGPT image generation.
- `adobeFireflyPrompt`: prompt tuned for Firefly/Photoshop-style generation or refinement.
- `geminiCritiquePrompt`: prompt asking Gemini to critique visual suitability, placement, and tattoo constraints.
- `claudeRefinementPrompt`: prompt asking Claude to refine the concept, clarify the brief, and suggest artist-facing language.
- `negativePrompt`: constraints such as no text, no watermark, no copied artist style, no extra limbs, no muddy shading.
- `sourceSummary`: compact summary of the source idea or free-text input.

## UI Design

The expanded AI Concepts page keeps the current dark editorial style and uses one main composer area:

- Source panel with a free-text field and optional Brief idea selector.
- Prompt pack panel with four provider tabs/cards.
- Copy action for the active prompt.
- Save prompt pack action.
- Result intake panel with image upload/drop and pasted text notes.
- Existing saved concepts remain below the composer.

The default path should stay fast: type a concept, generate prompts, copy one, paste results later.

## Data Model

Concept records can be extended with optional fields:

```js
{
  promptPack: {
    sourceType: 'free-text' | 'brief-idea',
    sourceIdeaId: '',
    sourceSummary: '',
    chatgptImagePrompt: '',
    adobeFireflyPrompt: '',
    geminiCritiquePrompt: '',
    claudeRefinementPrompt: '',
    negativePrompt: '',
    createdAt: ''
  },
  response: '',
  imageUrl: '',
  tags: []
}
```

Existing concept records must continue to render without migration.

## Error Handling

- Empty source input disables prompt generation.
- Missing/deleted Brief ideas should not crash saved prompt packs; render the saved source summary instead.
- Clipboard failures should show a small inline failure state.
- Image intake should reuse the existing file-to-data-URL handling pattern.

## Testing

Add focused tests for pure prompt-pack generation:

- Free-text source creates all provider prompts.
- Brief idea source includes title, description, placement, tags, linked artists, and image notes when available.
- Negative prompt is included.
- Empty source is rejected or returns no pack.
- Existing concept records without `promptPack` remain valid.

Add lightweight component coverage if the UI logic becomes non-trivial.

## Acceptance Criteria

- User can generate and copy provider-specific prompts without configuring any API key.
- User can save a prompt pack as a concept.
- User can paste generated text and attach generated images to that concept.
- Existing AI Concepts behavior still works.
- Tests, lint, and build pass.
