# Sable — AI Vision (July 2026)

How AI could make Sable genuinely unique — in the app, in its workflows, and in
its content — reviewed page by page against the two project objectives:
**ease of use** for the real tattoo-planning workflow (iPhone, Instagram-driven)
and **portfolio impact**.

## The core insight

Sable already "does AI" (Gemini artist discovery, DALL·E/Gemini concept images,
prompt packs, artist steering). But every intelligent feature today is
**text-mediated**: six hand-picked style tags and hand-written style
descriptors act as a proxy for taste, and matching is tag-overlap arithmetic
(`scoreArtistForIdea`, `buildSuggestions`, `buildDiscoveryPrompt`).

Meanwhile the app owns two assets almost no product has:

1. **A curated visual dataset** — ~20 content-audited reference images per
   artist (logos/promos/duplicates already purged in the May curation passes).
   This is a clean, labelled record of what Pritesh's taste *looks like*.
2. **A longitudinal preference log** — global rank order, swipe buckets
   (top/maybe/pass), shortlist statuses, Top-5 membership over time.

Tags are the bottleneck. `fine-line` lumps together artists Pritesh ranks #1
and #24. The next-gen move is to let the app *see*.

---

## Flagship 1 — The Taste Engine (on-device visual embeddings)

**What:** run a small image-embedding model (SigLIP/CLIP-class via
transformers.js + WebGPU, model cached locally after first download) over the
image library. Every artist gets a real *visual* style fingerprint; every
concept image and idea reference gets one too. All local — no API key, no cost
per call, and images never leave the device, which extends the app's
local-first architecture into local-first *AI*. That coherence is itself the
portfolio story.

**What it unlocks, per surface:**

| Surface | Today | With embeddings |
|---|---|---|
| Gallery | filter by 6 tags | "more like this" from any single image; visual similarity search; a real style-space map (2-D projection of the style wall — artists cluster by actual visual kinship) |
| Rank | manual ordering | a **taste model**: fit a lightweight preference direction over embeddings from rank/swipe/status history; score any new artist/image; *explain* it by nearest liked exemplars ("sits between zoia.ink and cagriesk in your style space") |
| Consider shelf / Discovery | tag-frequency scoring; LLM name-dropping | candidates scored by visual proximity to the user's liked region, not tag overlap |
| Concepts | artist match by tags | **"who could actually execute this?"** — embed the generated concept, rank artists by portfolio similarity to it. Closes the app's central loop (idea → concept → the right artist) visually |
| Manage | hand-tagging new artists | auto-suggested tags + outlier detection ("this image doesn't match this artist's style profile — curation leftover?") |

**Honest constraints:** first-load model download (tens to a few hundred MB,
then cached); embedding quality on tattoo imagery should be validated with a
small offline eval (embed the library, check nearest-neighbour sanity) before
building UI on it; iPhone Safari WebGPU/WASM performance needs a spike first.
Build order: an `npm` spike script → `src/data/embeddings.js` pure module →
one surface (Gallery "more like this") → then fan out.

## Flagship 2 — Screenshot-to-artist intake (multimodal quick add)

**What:** Pritesh's actual discovery loop is Instagram on the iPhone. Today:
see artist → screenshot → later, retype handle into QuickAdd, pick tags by
hand. Instead: share/paste the screenshot into Sable → a multimodal model
(Gemini or Claude vision, existing user-key pattern) extracts the handle,
suggests style tags from the *artwork in the screenshot*, drafts a one-line
style note → prefilled QuickAdd card to approve. Same for ideas: paste any
inspiration image → auto-tagged, auto-described idea in the Brief.

**Why it's the ease-of-use winner:** it removes the highest-friction step in
the real workflow, and it elegantly sidesteps the Instagram API/scraping
dead-end (the user brings the pixels; nothing is scraped). The PWA already has
image upload plumbing (`useImageUpload`); a Web Share Target manifest entry
would let iOS share screenshots straight into the app once deployed.

## Flagship 3 — On-skin preview

**What:** the gap between "concept image on white background" and "do I want
this on my body." Take a photo of the actual placement (forearm, shoulder…),
and use an image-editing model (Gemini image editing / DALL·E inpainting via
the existing key mechanism) to render the saved concept design onto that skin,
at position — lighting, wrap and skin tone respected. Save results as variants
on the concept, next to the existing relief-STL export (the app already turns
concepts into physical previews; this is the digital sibling).

**Why unique:** consumer tattoo try-on apps exist, but none sit inside a
pipeline where the concept was generated *steered by a specific shortlisted
artist's style* and the result feeds a brief you send to that artist. Also the
single best demo-reel moment the app could have.

## Flagship 4 — Sable Copilot (tool-use over local data)

**What:** a small chat surface where an LLM (user's key, existing pattern)
gets *function-call access to the app's pure data layer* — `scoreArtistForIdea`,
convention distances, statuses, ranking moves — so questions spanning pages get
answered in one place: *"Which shortlisted artists fit the night-forest idea
and are at a convention within 100 miles before December?"* — currently a
four-page manual cross-reference. Write actions (rank moves, status changes)
stay confirm-before-apply so the user keeps agency.

**Why it fits:** the data layer is already pure, tested functions — they *are*
tool definitions waiting to happen. For a portfolio reviewer, "the app exposes
its domain logic to an LLM as tools" is the strongest possible signal of
current AI engineering literacy. Scope guard: start with 5–6 read-only tools,
one page, no memory.

## Workflow & content AI (repo-side, not app-side)

The repo already uses AI heavily to *build*; the gap is using it to keep
**content** alive. All of these run as scheduled/manual Claude Code sessions
producing reviewable PRs — no deployment dependency:

- **Convention attendance research** (issue-#backlogged as "auto-lookup"):
  agent works convention sites/lineups against the artist list, PRs updates to
  `src/data/conventions.js` with sources cited. Human merges.
- **Handle liveness audit:** `SUGGESTED_ARTISTS` and artist handles go stale
  (the file itself warns about this). Periodic agent verifies profiles still
  exist/moved, PRs corrections.
- **Style-note drafting for new artists:** the May style-DNA passes were
  manual. A session-side multimodal pass over a new artist's images can draft
  `styleNote`/`styleDescriptor` for approval — content pipeline, human taste
  as the gate.

## Page-by-page map

| Page | AI today | Best AI upgrade (ranked) |
|---|---|---|
| Wall (home) | — | Taste-model "why they're rising" annotations on the Rank board; Copilot entry point |
| Gallery | — | "More like this" + visual search (Taste Engine); style-space wall view |
| Rank | swipe buckets → rank | taste model learns from every swipe; predicted rank for new artists |
| Brief | match rationales (template) | screenshot-to-idea intake; brief co-writer (rough notes → artist-ready brief, existing copy-brief upgraded) |
| Concepts | prompt packs, image gen, steering | concept→artist *visual* matching; on-skin preview; iterate-on-variant (img2img) |
| Radar | curated attendance | agent-researched attendance PRs; "worth the trip?" scoring (attending artists × taste model × distance) |
| Studios | — | low priority — enrichment via agent PRs at most |
| Consider shelf | Gemini discovery (text) | rescore candidates visually; screenshot intake replaces typing |
| Settings | key management | nothing — resist adding AI here |

## What I would *not* build

- A general chatbot without tools — adds nothing over ChatGPT in a tab.
- Auto-ranking that overrides manual order — ranking *is* the product's joy;
  AI should inform (predictions, explanations), never act unbidden.
- Instagram scraping/automation — ToS-fragile; screenshot intake achieves the
  goal user-side.
- Cloud-side inference infrastructure — keeps costs, keys and privacy simple;
  everything above works with user keys + on-device models.

## Sequencing

| Order | Feature | Effort | Uniqueness | Depends on |
|---|---|---|---|---|
| 1 | Embeddings spike + Gallery "more like this" | M | ★★★ | model eval spike |
| 2 | Screenshot-to-artist / idea intake | M | ★★ | nothing (keys exist) |
| 3 | Concept→artist visual matching | S (after 1) | ★★★ | 1 |
| 4 | Taste model on rank/swipe history | M | ★★★ | 1 |
| 5 | On-skin preview | M | ★★ | nothing (keys exist) |
| 6 | Copilot (read-only tools first) | M | ★★ | nothing |
| 7 | Agentic content PRs (conventions, liveness, style notes) | S each | ★ | nothing |

The Taste Engine (1→3→4) is the spine — three features, one investment, and it
converts Sable from "an app that stores my taste" into "an app that has
learned it." Screenshot intake is the biggest pure ease-of-use win and can ship
independently any time. On-skin preview is the demo-reel piece. Start 1 with a
throwaway eval script before committing to any UI.
