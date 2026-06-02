# Gemini Concept Generation Design

## Goal

Add live tattoo-concept **image generation via Google's free Gemini tier**, alongside the
existing OpenAI/DALL·E path, optionally steered by a saved artist's `styleDescriptor`. This is
the first true runtime AI integration in the app and the first use of the free Gemini key.

Idea #4 of the AI roadmap. Personal-only (the key lives in the browser); no backend.

## Scope

In scope:

- New module `src/data/geminiImage.js`: pure prompt-builder + response-parser + a thin fetch.
- A second API-key input (Gemini) in the Concepts ⚙ config panel (`gemini_api_key` in localStorage).
- A provider toggle (DALL·E / Gemini) shown only for providers whose key is set; auto-selected when only one key exists.
- An optional "steer by artist" select that flavours the prompt with that artist's `styleDescriptor` attributes (never the artist's name/handle).
- Generated image lands as a normal concept (existing flat `imageUrl` model); prefill the concept's `tags` from the steering artist; record `provider`.
- Unit tests for the pure helpers in `src/data/geminiImage.test.js`.

Out of scope (YAGNI):

- Integration with the in-flight result-variants model (`conceptVariants.js`) — use the flat concept model; the two compose later.
- Image editing / img2img, multi-image batches, aspect-ratio controls.
- Adding API keys to the backup export (they are secrets and stay device-local).
- Changing the DALL·E path's behaviour beyond sharing the provider toggle.
- Any server/proxy for the key.

## Module: `src/data/geminiImage.js`

`GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'` (constant; if the model id has changed at build
time, confirm against the AI Studio docs and update this one constant).

`buildGeminiImagePrompt({ prompt, styleDescriptor = '', tags = [] }) → string` — **pure, tested**:
- Base framing (reuse the spirit of the existing `buildImagePrompt`): professional tattoo concept
  art, black ink, high contrast, clean tattooable linework, flash-reference feel.
- Steering clause: if `styleDescriptor` is non-empty, append `Stylistic direction: ${styleDescriptor}.`
  else if `tags.length`, append `Stylistic direction: ${tags.join(', ')}.` else nothing.
- Guardrails appended: `no text, no watermark, no copied artist style, no photorealistic skin mockup`.
- Never includes an artist name/handle (caller passes only the descriptor string).

`parseGeminiImage(json) → string` — **pure, tested**: walks `json.candidates[0].content.parts`,
finds the first part with `inlineData`, returns `data:${mimeType};base64,${data}`. Throws
`Error('No image returned')` if absent.

`generateImageWithGemini(apiKey, { prompt, styleDescriptor, tags }) → Promise<string>` — thin,
not unit-tested:
- `POST https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`
- body: `{ contents: [{ parts: [{ text: buildGeminiImagePrompt({...}) }] }] }`
- on `!res.ok`: throw `Error(err.error?.message || 'Gemini error ' + res.status)`.
- on success: `return parseGeminiImage(await res.json())`.

## Concepts page changes (`src/pages/Concepts.jsx`) — minimal footprint

- **Keys:** track `geminiKey` alongside the existing `storedKey` (OpenAI). The ⚙ panel renders
  both inputs (OpenAI for DALL·E, Gemini for the free tier), each with save/remove, mirroring the
  current pattern. `gemini_api_key` in localStorage.
- **Provider state:** `provider` ∈ `{'dalle','gemini'}`. Derive available providers from which keys
  are set; if exactly one, force it; if both, show a small toggle; if none, keep the existing
  paste-back flow unchanged.
- **Steer-by-artist:** a `<select>` (only when `provider` active and `artists.length`) listing saved
  artists by name/handle; default "No steering". The chosen artist supplies `styleDescriptor` and `tags`.
- **`generate()`:** route to `generateImageWithGemini(geminiKey, { prompt, styleDescriptor, tags })`
  or the existing `generateWithDallE(storedKey, prompt)`. On success build the concept as today,
  additionally setting `tags: steerArtist?.tags || []` and `provider`.
- Loading/error states reuse the existing `generating` / `genError`.

## Data flow

`prompt (+ optional artist) → buildGeminiImagePrompt → Gemini REST → parseGeminiImage → data URL
→ new concept { imageUrl, prompt, tags, provider, createdAt } → existing concept card + tag→match`.

## Error handling

- Missing/empty prompt → no-op (as today).
- Network/API error → caught, message shown in `genError` (bad key → 400, quota → 429 surface the
  API message). Generation never throws uncaught; `generating` always reset in `finally`.
- `parseGeminiImage` throwing "No image returned" surfaces as a friendly error.

## Testing

`src/data/geminiImage.test.js`:
- `buildGeminiImagePrompt` with a `styleDescriptor` → includes the descriptor + guardrails, no artist name.
- with `tags` and no descriptor → includes the joined tags.
- with neither → base prompt + guardrails, no "Stylistic direction".
- `parseGeminiImage` with a valid `inlineData` part → correct `data:` URL.
- `parseGeminiImage` with no image part → throws `No image returned`.

Existing suites stay green. The live `fetch` and the `Concepts.jsx` wiring are verified manually
in-app once a real Gemini key is entered (see "Verification gap" below).

## Verification gap (explicit)

The pure helpers and build are fully verifiable here. A **real generated image requires the user's
AI-Studio key**, which the agent does not have — so end-to-end verification (enter key → generate →
image appears) is a manual step for Pritesh. The plan will wire and self-check everything up to that
boundary (UI renders, provider toggle behaves, no console errors with a dummy key path).

## Build sequence

1. `geminiImage.js` module + failing tests → implement → tests pass (TDD).
2. Add the Gemini key input + state to the ⚙ config panel.
3. Add the provider toggle + steer-by-artist select; route `generate()`.
4. `npm test` + `npm run build`; manual in-app smoke test; commit.
