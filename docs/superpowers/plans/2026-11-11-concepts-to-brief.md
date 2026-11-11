# Concepts to Ideas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver #204: create an editable Idea draft or append a saved concept image to an existing Idea.

**Architecture:** A focused transfer helper resolves source bytes and stages an independent idea-owned key. A Concepts-owned dialog chooses the destination and guards async work. Brief accepts a one-shot draft handoff or a saved-idea id, using its normal editor and explicit Save.

**Tech Stack:** Existing React, React Router, Tailwind v4, blob staging, Vitest and Playwright; no new packages.

**Spec:** docs/superpowers/specs/2026-11-11-concepts-to-brief-design.md

## Global Constraints

- Staging completes before a ref reaches ideas state; no saved data URLs or shared concepts keys.
- New ideas remain unsaved until Save. Existing attachment is an explicit immediate append.
- Preserve current notes/crops and unrelated fields during a concurrent update.
- Busy/cancel/owner/target guards cover every asynchronous boundary.
- 44px touch targets, visible keyboard focus and 320–430px usability; existing Sable styling.
- No AI requests, new dependencies, recompression or changes to other worktrees/AGENTS.md.
- No push or merge without a subsequent owner request.

## Review Focus

- Original versus variant selection must copy the chosen bytes and metadata, not the Best result.
- A cached/signed display URL must not bypass source-owner checks or create a shared blob key.
- A late stage result after cancel, owner A→B→A or target deletion must not write/navigate.
- New-draft newness must survive a reserved id; deleting a saved target must never resurrect it.
- Consumed router state, repeated taps, Back/Forward and late hydration must not duplicate transfers.

## Task 1: Transfer data and staging boundary

**Files:** Create `src/data/conceptIdeas.js`, `src/test/conceptIdeas.test.js`. Reuse `imageResolver.js`, `imageStaging.js`, `imageRef.js`, `blobUrls.js`, `randomId.js` without broad changes.

**Interfaces:** `buildConceptIdeaDraft(concept, variant, { id, image, note })` returns a complete new-idea record; `appendConceptIdeaImage(ideas, ideaId, image)` returns an immutable collection, leaving absent destinations absent. `stageConceptIdeaImage(source, { userId, ideaId, assertCurrent })` resolves `{ key }` in the idea namespace or rejects, never returning inline refs. `source` is the selected original/variant's stored image value.

- [ ] Write tests pinning title to the first 80 characters of collapsed prompt (fallback `AI concept`), description to prompt plus selected response/notes/refinement Change/Keep/palette sections, tags to a copied concept tag list, status `idea`, placement `''`, linkedArtists `[]`, and the exact selected image/note.
- [ ] Test safe append: existing two refs (one cropped) remain byte-for-byte equal; a new ref is last; unrelated concurrent title edits survive; missing target yields the original collection. Test original and variant inputs independently.
- [ ] Test real staging via fake IndexedDB/local backend: source bytes equal target bytes, target key is under `ideas/<id>/` and differs from its concept key, source remains unchanged; offline readable bytes still stage. Reject missing/non-image bytes, foreign-owner keys (including a cached display URL reverse-mapped to one), unsafe path components and a changed owner at either await.
- [ ] Run `npm test -- src/test/conceptIdeas.test.js` and observe the missing behavior fail before implementing. Expected after implementation: all pass.
- [ ] Implement normalized drafting, immutable append and byte-preserving staging through `stageImage(blob, ctx)` (not a deduplicating source-key shortcut). Guard before/after resolving and staging. Commit the focused data change.

## Task 2: One-shot Idea editor handoff

**Files:** Modify `src/pages/Brief.jsx`; create `src/data/conceptIdeaHandoff.js`, `src/test/conceptIdeaHandoff.test.jsx`.

**Interfaces:** `createConceptIdeaHandoff(idea, { userId, ownerScope })` stores at most one pending draft with its scope reference and captured owner/epoch, returning a random request id. Navigate to `/brief` with `state.conceptIdeaRequest = requestId`. `takeConceptIdeaHandoff(requestId, { userId, ownerScope })` consumes once and returns the idea only if the owner/scope/epoch still match; otherwise null. No storage persistence; reload discards an unsaved handoff. `idea.id` is reserved before staging. Saved targets use `/brief?idea=<id>`. IdeaModal accepts explicit `isNew` (defaulting to existing behavior for ordinary calls). Internal modal state records newness at open, not by rechecking collection membership later.

- [ ] Write failing router tests: imported draft opens with exact fields and ready stored ref; ideas setter is untouched until Save; Save inserts the full record with reserved id; Back without Save discards it. Normal saved edits still emit touched-field patches.
- [ ] Test state consumption: close, navigate away/back/forward and rerender must not reopen a consumed draft. Changing owners between navigation and Brief mounting (including A→B→A) must reject/consume the handoff. Unknown ids, a new runtime with an empty registry, or a different scope instance return null. Saved-id links open once, including a target arriving after hydration; a nonexistent/deleted id never manufactures an idea. While editing, query changes must not silently overwrite the draft.
- [ ] Run `npm test -- src/test/conceptIdeaHandoff.test.jsx src/test/ideaRefsState.test.jsx src/test/BriefCardPreview.test.jsx`; confirm feature-related RED, implement the one-shot handoff and explicit newness, then confirm GREEN. Update upload staging context to use the reserved id for imported drafts.
- [ ] Commit this independently testable routing/editor change.

## Task 3: Concepts action and destination dialog

**Files:** Create `src/components/ConceptIdeaDialog.jsx`, `src/hooks/useConceptIdeaTransfer.js`, `src/test/ConceptIdeaDialog.test.jsx`, `src/test/useConceptIdeaTransfer.test.jsx`; modify `src/pages/Concepts.jsx`, `src/components/ConceptVariantLab.jsx`, `src/components/ConceptViewer.jsx`, `src/App.jsx`; extend existing Concepts/variant tests.

**Interfaces:** `onUseInIdea({ conceptId, variantId: null | string })` is passed through both inline and viewer variant labs. The transfer hook consumes current concepts/ideas, `setIdeas`, authenticated owner/scope and navigate; it exposes selected source, busy/error state, open/close and submit({ ideaId?, note }). New destinations reserve `randomId()` and use Task 1 then Task 2; existing append uses a functional `setIdeas` update against the latest collection and navigates only for a valid target.

- [ ] Write failing behavior tests: actions appear on original/image variants but not text-only variants; each opens the selected source, not Best. Dialog supports new destination, searchable existing titles, optional note, no-ideas state, Cancel, focus return and topmost Escape.
- [ ] Test duplicate synchronous submit taps stage/write/navigate once. Deferred reads/staging followed by close/unmount/source change/owner A→B→A/deleted target do not write or navigate. Staging/read failure displays a retryable error and leaves ideas intact. Existing append preserves concurrent notes/crops/title edits.
- [ ] Run new hook/dialog plus `Concepts.test.jsx` and `ConceptVariantLab.test.jsx` to observe RED. Implement the focused dialog and epoch/ref guards, wiring `setIdeas` from App. Use the existing focus trap/Escape conventions and inert underlying viewer when a transfer dialog is open.
- [ ] Run the same tests to GREEN; run the full unit suite to catch existing Concepts/viewer callers. Commit the complete action flow.

## Task 4: Browser proof, guides and independent review

**Files:** Create `e2e/conceptIdeas.e2e.js`, `e2e/conceptIdeas.subpath.e2e.js`, `scripts/captureConceptIdeasGuide.mjs`; extend safe `e2e/fixtures.js`; update `docs/04-brief-and-boards.md`, `docs/06-ai-concepts.md`, `src/pages/Help.jsx`, `docs/MAINTAINING.md` and relevant architecture image-ownership guidance; capture fictional guide images under `public/guide/`.

- [ ] Browser-test creating from a non-Best variant: prefilled unsaved editor, ready reference, explicit Save then reload. Assert canonical saved `ideas/<id>/` key and no inline data; remove source concept and confirm the idea photo still resolves.
- [ ] Test original → existing idea, notes and previous crop preservation, repeated tap prevention, Cancel, 320/430px target geometry and topmost Escape. Repeat a new-draft transfer under `/sable/`. Do not mock image resolving/staging.
- [ ] Update both guides/Help, document capture command and inspect actual fictional phone screenshots. No real artist portfolios in published screenshots.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, `npm run docs:check`, focused iPhone/subpath browser tests and touch-target audit. Expected: all tests/checks pass, new targets at least 44px.
- [ ] Run read-only Codex/agy critiques per CLAUDE.md and one fresh whole-branch reviewer; verify findings and fix important issues with RED→GREEN tests, rerunning the full suite. Record rulings/deferred minors.
- [ ] Commit only #204 files and report verification. Preserve the branch locally; do not push/merge yet.

## Plan audit receipt

Four tasks trace to the approved description; scope is clean, dependencies are ordered,
and each task has explicit verification. No destructive operations. Baseline: 251 files /
2,728 tests passed on branch `codex/concepts-to-brief` at base `7d2f8dc`.

Codex's read-only review identified loss of owner epoch across the router handoff.
Verified against BrowserRouter/AppShell lifetimes and fixed the plan: a bounded,
single-use in-memory registry validates the captured scope and epoch at consumption,
with A→B→A and reload tests. agy's review added staging-internal cancellation,
stable URL identity for byte-identical copies, deleted-variant/blank-note tests and
phone/history integration checks. Shared staging/cache changes remain narrowly tested.
