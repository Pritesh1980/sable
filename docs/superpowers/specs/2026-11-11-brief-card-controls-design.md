# Brief card controls (#205)

Source: https://github.com/Pritesh1980/sable/issues/205 and its approved preview/crop extension. The owner requested implementation on 11 November 2026 after the two-increment recommendation.

## Outcome

Choose the cover and order of an idea's references, see which four photos will appear, and optionally preview and adjust the actual card before sharing. Original photos, notes, and the existing quick Share as image path remain intact.

## Increment 1: reference order

- Each reference tile gets Make cover and Move earlier/later actions with 44px touch targets and accessible names including the reference number.
- Make cover moves that occurrence to index zero; no separate pin mode or duplicate cover field.
- Reordering uses the existing touched-images patch, preserves every image's key/url and note, and works for duplicate uses of one photo without confusing the occurrences.
- Card 1–4 badges identify the actual prepared selection, not external links or an image that failed to decode. While preparation is pending show Checking, not a guessed selection.
- External/unreadable references stay in the idea. Exclusion is visible, not destructive.

## Increment 2: preview and export crops

- Add Preview card beside Copy brief and Share as image. Preview is optional; quick sharing remains.
- The preview shows the exact 1080×1350 PNG produced by the shared renderer, captions and overflow included. A prepared PNG is delivered unchanged when shared from this view.
- Chosen implementation default: three labelled range controls per selected photo — Horizontal, Vertical and Zoom — plus Reset crop. No gesture-only editing or rotation in this issue.
- Crops affect only the photo region of the exported card, not the thumbnail, note, source bytes, or any 3D/STL use.
- Store optional briefCrop: { x, y, zoom } on each reference occurrence; x/y are finite fractions in [0,1], zoom in [1,3]. Missing metadata means the current centred cover crop. Reset removes the override.
- Preserve crop metadata through normalization, inline migration, local cache/sync, reordering and backup restore to a different account key.
- Re-render after draft changes. Discard late asynchronous preparations; do not show or share the previous draft's PNG under the new draft.
- Preparation reports the selected source occurrences, skipped external links and unavailable references. Refresh retries availability without changing the idea. If selection changes, the preview and badges update together.
- Share from the preview calls the file-sharing handoff directly in the user action, with no image/font preparation after the click. Preserve download fallback and honest Download requested feedback.
- Quick Share as image uses that same ready prepared result and is temporarily unavailable while the current draft is preparing; it never falls back to an older draft. Preparation fingerprints all canvas-visible content, including captions, linked artist display details and crop settings.
- Close/Escape only dismisses the preview, restores focus, and leaves the underlying idea editor open.

## Boundaries

Keep Sable's existing palette, typography and card layout. No new dependencies, service, image generation, paid requests, source-image rewrite, automatic deletion, artist re-ranking or public sharing links.

Save remains explicit. Closing the idea without Save discards reordered references and crop settings, as it already does other draft fields. Preview changes do not overwrite unrelated concurrent edits.

## Proof

TDD for reference/crop transforms and metadata round-trips; component tests for saved patch behavior and stale async results; browser tests at 320–430px, /sable/, stacked dialogs and sharing. Visually compare preview with exported bytes using fictional demo imagery. Update the Ideas guide, Help and affected guide screenshots.

Real-device acceptance: check a ready preview on iPhone Safari opens the native file-share sheet from the tap. Emulated Chromium and a mocked navigator.share cannot prove this; report it as outstanding if a real device is unavailable.
