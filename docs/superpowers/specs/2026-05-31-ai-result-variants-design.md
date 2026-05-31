# AI Result Variants Design

## Goal

Extend saved AI Concepts so each concept can hold multiple curated AI result variants inline.

The feature should make Tattoo useful after Pritesh has run a prompt pack through ChatGPT, Adobe Firefly, Gemini, Claude, or another tool. Instead of saving one loose image or text response, a concept should collect multiple outputs, compare them, and identify the strongest result.

## Chosen Approach

Use **Curated Variants** inside each saved concept card.

The user selected the inline-card direction rather than a separate Result Lab page. This keeps the first version close to the current AI Concepts workflow and avoids adding another top-level surface before the comparison behaviour is proven.

## Scope

In scope:

- Add an **AI Results** section to saved concept cards.
- Let each concept store multiple result variants.
- Let one result variant contain both image and text.
- Capture provider, title, image, AI response text, personal notes, rating, and created date.
- Allow one variant per concept to be marked **Best**.
- Render the best variant first, then the rest as compact variant cards.
- Expand a variant to review image, AI text, notes, rating, and provider metadata.
- Keep style matching on the concept itself, not per variant.
- Preserve existing concepts without migration.

Out of scope for this slice:

- A dedicated Result Lab page.
- Direct API calls to ChatGPT, Claude, Gemini, Adobe, or OpenAI.
- Automated result scoring.
- Promoting variants into Brief ideas or Boards.
- Cross-concept comparison.
- Backend or shareable links.

## User Flow

1. User creates or opens a saved concept.
2. User runs prompt-pack prompts in external AI tools.
3. User taps **Add Result** on the concept card.
4. User chooses a provider, enters a short title, attaches or drops an image, pastes AI text, and optionally adds personal notes.
5. User saves the variant.
6. Concept card shows the best result first if one is marked best.
7. User can expand compact cards to inspect full details.
8. User can rate variants and mark a variant as **Best** as their judgement evolves.

## Variant Data Shape

Concept records gain an optional `variants` array.

```js
{
  variants: [
    {
      id: 'variant-1',
      provider: 'chatgpt',
      title: 'Raven botanical silhouette',
      imageUrl: 'data:image/png;base64,...',
      response: 'Generated response or critique text.',
      notes: 'Personal judgement about what works.',
      rating: 4,
      isBest: true,
      createdAt: '2026-05-31T12:00:00.000Z'
    }
  ]
}
```

Rules:

- `variants` is optional; legacy concepts without it render normally.
- `imageUrl`, `response`, and `notes` may each be empty, but a saved variant must contain at least one of image, response, or notes.
- `rating` is an integer from 0 to 5. `0` means unrated.
- Only one variant on a concept may have `isBest: true`.
- Marking a variant best clears `isBest` from sibling variants on that concept.
- Deleting a best variant leaves the concept with no best variant until the user chooses another.

## Provider Options

Use a small local list, separate from prompt-pack fields:

- `chatgpt` — ChatGPT
- `adobe-firefly` — Adobe Firefly
- `gemini` — Gemini
- `claude` — Claude
- `other` — Other

Provider labels should be reusable in tests and UI.

## UI Design

The feature lives inside `src/pages/Concepts.jsx` for this version, matching the existing page structure.

Each concept card gets:

- A compact **AI Results** heading.
- A count of saved variants.
- An **Add Result** action.
- A highlighted best result summary when one exists.
- A compact grid or stacked list of remaining variants.

Each variant summary shows:

- Provider label.
- Title, or a fallback such as `Untitled result`.
- Rating indicator.
- Best badge when applicable.
- Thumbnail if an image exists.
- Small metadata date.

Expanded details show:

- Larger image preview when present.
- AI text response when present.
- Personal notes when present.
- Actions: **Mark Best**, **Delete**, and rating controls.

The add-result form should be compact and inline. It should support:

- Provider selector.
- Title field.
- Image upload/drop using the existing file-to-data-URL pattern.
- AI text textarea.
- Notes textarea.
- Rating selector.
- Save and cancel actions.

## Error Handling

- Disable save until the variant has image, response, or notes.
- Ignore non-image uploads for image intake.
- Do not crash if a saved variant has an unknown provider; render it as `Other`.
- Do not crash if `variants` is missing, null, or malformed; treat it as an empty array.
- Keep clipboard and prompt-pack behaviour unchanged.

## Testing

Add tests before implementation.

Pure data tests should cover:

- Creating a valid variant from form input.
- Rejecting empty variants.
- Clamping or normalising ratings to 0-5.
- Sorting variants with best first, then newest first.
- Marking one variant best clears siblings.
- Removing a variant works even when it was best.
- Legacy concepts without variants return an empty variant list.

Component or integration tests should cover at least:

- A concept with no variants shows an Add Result affordance.
- Saving a variant with both image and text renders in the AI Results section.
- Marking a second variant best moves the badge.

## Acceptance Criteria

- A saved concept can store multiple AI result variants.
- A result variant can include both image and text.
- User can add, view, rate, mark best, and delete variants inline.
- Best result appears before other variants.
- Existing concepts and prompt-pack behaviour continue to work.
- Data stays local in the existing `tattoo_concepts` storage path.
- Tests, lint, and build pass.
