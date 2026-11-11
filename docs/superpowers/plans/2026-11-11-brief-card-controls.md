# Brief Card Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete #205: reorder references, identify the card's selected photos, and optionally preview and crop the exact card before sharing.

**Architecture:** Keep ordered, key-first references on the idea. Add crop metadata to the reference occurrence and preserve it at normalization/codec/backup boundaries. Split PNG preparation from delivery so the editor and optional preview consume one versioned prepared result and share its exact bytes.

**Tech Stack:** Existing React, Canvas 2D, Tailwind v4, Vitest and Playwright; no new packages.

**Spec:** docs/superpowers/specs/2026-11-11-brief-card-controls-design.md

## Global Constraints

- Original image bytes, key/url refs and notes remain intact.
- All controls have 44px touch targets; usable with touch and keyboard at 320–430px.
- Save is explicit; reordering/cropping marks images touched, preserving the existing field-level patch behavior.
- Crop metadata is optional briefCrop: { x, y, zoom }; x/y in [0,1], zoom in [1,3], finite numbers only. Reset removes it.
- Cropping is export-only. No rotation, new image uploads, API calls or new dependencies.
- Preserve quick Share as image and existing external-image exclusion, PNG dimensions and download fallback.
- Use only fictional demo images in tests and guide captures. Leave other worktrees and AGENTS.md edits untouched.

## Review Focus

- Duplicate references with differing notes/crops must remain separate occurrences.
- A later font/image preparation must never replace or share a newer draft's PNG.
- Inline-to-key migration and backup restore to a different account must preserve crops.
- Decode failures must not cause false selection badges or a preview/export mismatch.
- Native file sharing must be called in the click handler on already-prepared bytes; Escape must close only the top dialog.

## Task 1: Reference ordering and metadata

**Files:** Create src/data/referenceImages.js and src/test/referenceImages.test.js. Modify src/data/planning.js, src/data/imageCodec.js, src/data/export.js. Extend the existing codec/backup tests.

**Interfaces:** normalizeReferenceImages(images) remains available from planning.js via re-export. New pure helpers moveReferenceImage(images, fromIndex, toIndex), setReferenceCrop(images, index, crop), setReferenceNote(images, index, note), normalizeBriefCrop(crop). Valid references retain optional briefCrop without adding it to legacy records.

- [ ] Write failing tests: moving the fifth photo to index zero changes selection order without mutating input; invalid indices are a no-op; duplicate keys keep their individual notes/crops; invalid/non-finite crop values default or clamp safely; reset removes the override.
- [ ] Add failing codec/backup tests covering key refs, inline-to-key migration and restore under a new account key with crop preserved.
- [ ] Run the focused tests and confirm feature-related failures.
- [ ] Implement the helpers in referenceImages.js; retain planning.js imports through a re-export. Use the same normalizer in the ideas codec and restore path rather than duplicating metadata allowlists.
- [ ] Run reference, image-ref, codec and export tests; commit the isolated data change.

## Task 2: One prepared card and crop geometry

**Files:** Modify src/data/briefCard.js and src/test/briefCard.test.jsx. Create src/hooks/usePreparedBriefCard.js and src/test/usePreparedBriefCard.test.jsx.

**Interfaces:** prepareBriefCardImage(idea, options) resolves { blob, filename, layout, photos, skippedWebCount, unavailableCount, overflowCount }. Each prepared photo retains its original sourceIndex/ref, note and crop. exportBriefCardImage keeps its public API and delegates preparation then delivery. computeBriefCardCrop(imageWidth, imageHeight, slotWidth, slotHeight, crop) returns the source rectangle for drawImage.

- [ ] Write failing crop tests with hand-calculated rectangles: an 800×600 image in a 200×400 slot at zoom 2, x=1, y=0 uses { sx:650, sy:0, sw:150, sh:300 }; default behaviour stays centred.
- [ ] Extend renderer tests for 0–4 photos, more than four, unavailable keys, rejected decode, skipped external links, long captions and crop identity after reorder.
- [ ] Write stale-result hook tests: resolve B then A and assert only B is visible/shareable; a new pending draft cannot expose A's old blob; retry refresh updates the selected occurrence list and counts.
- [ ] Confirm failures, then separate pure preparation from shareOrDownloadBriefCard. Apply crop only inside each photo's image region; captions and frame retain their geometry.
- [ ] The preparation hook owns epoch guards and object-URL cleanup. Its snapshot covers every canvas-visible field (including title, description, placement, styles, linked artist display details, image order, notes and crops), not just image keys. It keeps original refs in state and uses prepared source indices for badges. Refresh retries selection; errors cannot expose a stale PNG.
- [ ] Verify the preview consumer and delivery wrapper receive the identical prepared Blob, and original public export tests pass; commit.

## Task 3: Ordering controls, preview and crop panel

**Files:** Modify src/pages/Brief.jsx. Create src/components/BriefCardPreview.jsx and src/test/BriefCardPreview.test.jsx. Extend src/test/ideaRefsState.test.jsx and briefCard.test.jsx.

**Interfaces:** BriefCardPreview({ prepared, preparing, error, onRefresh, onCrop, onClose, onShare }) renders a versioned PNG and controls for its selected source occurrences. onCrop(sourceIndex, crop) updates only that occurrence's briefCrop. onShare delivers the already-prepared result.

- [ ] Write failing editor tests: Make cover/earlier/later preserve notes/refs and mark only images touched; Save keeps unrelated concurrent text; closing without Save discards ordering/crop changes. Editing one duplicate reference's note preserves its crop and does not change the other occurrence; audit every array-rebuilding handler for metadata loss.
- [ ] Add component tests for selected-photo badges, external/unavailable explanations, labelled sliders, reset, pending/error gating and exact prepared-blob delivery.
- [ ] Confirm failures. Add the reference-tile control strip and card-selection badges; use prepared source indices, not URL equality.
- [ ] Add optional Preview card in the sharing row. Quick Share as image and preview Share both deliver the same current hook-prepared result directly in the click handler, and are disabled while it is preparing; keep exportBriefCardImage as the compatibility wrapper for other callers. Use the existing dialog-focus/topmost Escape conventions; preview must not close the idea editor.
- [ ] Wire crop controls to the draft and prepare the next PNG, with a visible Updating state and disabled sharing until the current snapshot is ready. Do not await preparation inside the preview Share click.
- [ ] Run the focused component/data tests and the touch-target audit; commit.

## Task 4: Browser proof, documentation and review

**Files:** Extend e2e/briefCard.e2e.js. Update docs/04-brief-and-boards.md, src/pages/Help.jsx, docs/MAINTAINING.md and relevant docs/ARCHITECTURE.md image-shape guidance. Add scripts/captureBriefCardGuide.mjs; recapture public/guide/brief-idea-editor.png and a fictional preview screenshot linked from the guide.

- [ ] Write browser tests for six references reordered into a chosen cover/four, unavailable-photo replacement, exact preview/download PNG equality, crop reset, and saved crop/order after reload.
- [ ] Test 320px and 430px touch layouts, keyboard operation, topmost Escape, /sable/ image paths and file-sharing refusal fallback. Stub only navigator.share, not rendering.
- [ ] Run npm test, npm run lint, npm run build, npm run docs:check and the focused Playwright tests; inspect actual rendered cards and screenshots.
- [ ] Check native sharing from a ready preview on real iPhone Safari. If unavailable, explicitly leave this acceptance check outstanding; do not call Chromium emulation proof of native user activation.
- [ ] Update the guide/Help for both quick export and preview. Document the optional ref metadata and capture command.
- [ ] Run read-only codex and agy reviews per CLAUDE.md; verify and triage each finding. Obtain the required independent final code review, address blockers, and rerun affected verification.
- [ ] Commit only #205 files. Do not push or merge without the owner's request.

## Execution boundary

This plan covers both approved increments. Ordering may be a separate commit, but #205 is not complete until preview/crop behavior and preservation tests are delivered. Review the plan before implementation; use the owner's chosen native or subagent-driven execution method.

## Plan review receipt

Codex and agy read-only reviews found no design blockers or unresolved owner decisions. Incorporated their guardrails for native-iPhone verification, the quick-share prepared-result path, full-content invalidation, and preservation of crop metadata during caption edits. Self-review confirmed the four tasks cover the issue and its approved extension.

## Implementation receipt

All four increments are implemented locally. Verification: 251 unit-test files / 2,728
tests, 31 Chromium browser checks (including `/sable/`), lint, both base builds and
23 Mermaid diagrams passed. Fictional guide screenshots were refreshed and inspected.
Real iPhone Safari file-share activation remains an explicit acceptance check, not
something established by the Chromium navigator.share stub.

The independent final reviewer found two important issues, both reproduced before
fixing: exclusion badges intercepted phone Remove taps, and identity-only removal
confused duplicate references carrying different notes/crops. Regression tests now
cover real touch Remove/Undo and occurrence-aware metadata preservation. The UX review
also identified off-screen mobile crop feedback; the card now remains visible while
its controls scroll separately, with 320/430px browser coverage.

Review dispositions: keep the deliberate pending-image placeholder (never display a
stale draft's PNG), and keep the existing overflow semantics counting all omitted local
reference entries, including unavailable ones, rather than claiming extra decodable
photos. Deferred minor: an uncropped axis may not visibly pan at 1× zoom. An unrelated
touch audit also found five existing undersized Gallery controls; none was changed here.
No push or merge is included in this implementation.
