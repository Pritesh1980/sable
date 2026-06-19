# AI concepts

*Turn rough tattoo ideas into prompt packs, saved AI results, and artist matches.*

← [Back to contents](README.md)

---

**AI** is a sketchpad and prompt workbench for concepts. You can turn a short idea
or an existing Brief idea into provider-specific prompts for ChatGPT, Adobe Firefly,
Gemini and Claude, then bring the generated results back into Sable.

![The AI Concepts page](../public/guide/concepts.png)

## Build a prompt pack

The **Prompt Pack** workbench is the recommended starting point. Choose a source:

- **Free text** — type a loose concept, such as *"A raven breaking apart into dark
  botanicals for a chest tattoo."*
- **Brief idea** — select an idea from **Brief** to pull in its title, description,
  placement, style tags, linked artists and reference-image notes.

Tap **Generate Prompt Pack** to create tailored prompts for:

- **ChatGPT** — visual image generation.
- **Adobe Firefly** — polished tattoo-reference composition and refinement.
- **Gemini** — visual critique, placement and tattooability risks.
- **Claude** — artist-facing language, consultation brief and DM wording.

Switch between providers, then tap **Save Pack** before leaving Sable so the full
prompt pack is kept as a concept card. Copy the active prompt, run it in the AI tool,
then use **Paste image** or **Paste text** on the saved card to bring generated output
back into Sable.

## Quick concept prompt

Type a description in the prompt box, e.g. *"A moth emerging from a skull wreathed in dark
botanicals."* This older quick path still works:

### Without an API key (default)

1. Tap **Copy Prompt** — a richly-structured prompt is copied to your clipboard, and a new
   concept card is started.
2. Use the **ChatGPT / Claude.ai / Gemini / AI Studio** buttons to open your AI of choice,
   paste, and run it. This route is free — and especially good with a **Google AI Pro**
   subscription, which gives generous image quotas in the Gemini app and AI Studio.
3. Bring the result back: on the concept card use **Paste image** (drop or choose a file) or
   **Paste text** to save the written response.

### With a paid API key (optional)

Tap **⚙ Configure AI** to add an **OpenAI key** (DALL·E 3) or a **Gemini key**, each stored
only on your device. The prompt box then gains a **Generate image** button — press
**⌘ + Enter** to create an image in-app. Both are **paid APIs that need billing enabled**
(≈$0.04/image); a Google AI Pro subscription does **not** cover Gemini *API* usage. If both
keys are set, a **Gemini / DALL·E** toggle lets you pick the provider, and **Steer by [artist]**
shapes the image toward a favourite artist's style. To stay free, use the Copy Prompt →
paste route above instead.

## Work with a concept

Each concept card holds the original prompt, any saved prompt pack, and any saved image
or AI response (tap to expand). Prompt-pack cards can start image-less until you paste
or upload a result. Below that:

![A saved concept card with prompt pack and style matching](../public/guide/concept-card.png)

- **Match to style** — tag the concept with styles. The moment you do, its **top artist
  matches** appear; tap one to open their Instagram.
- **Saved prompt pack** — switch between provider prompts and copy them again later.
- **AI Results** — add ChatGPT, Firefly, Gemini, Claude, or other outputs as curated
  variants. Each result can hold an image, generated text, personal notes, and a rating.
- **Best result** — mark one variant as Best to keep the strongest direction visible first.
- **Open in Firefly** — appears once the concept has an image, so you can take it further.
- **Delete** removes the concept.

## Export a relief STL

When a saved AI result has an image, open the result and choose **Make STL**. Sable turns
the image into a relief-style heightmap where brighter areas become raised surface detail.

Start with the defaults:

- Width: `80mm`
- Max relief: `3mm`
- Base: `1.2mm`
- Detail: `medium`
- Smoothing: `light`

Use **Invert** when the wrong parts of the image are raised. Download the STL and open it
in your slicer before printing. This first version creates relief plaques only; lithophane,
line-art extrusion, and live 3D preview are later enhancements.

> **Tip:** the concept tags use the same six styles as the rest of the app, so a well-tagged
> concept points straight at the artists already in your collection.

---

Next: **[Backup & restore →](07-backup-and-settings.md)**
