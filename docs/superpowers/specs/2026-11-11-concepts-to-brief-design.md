# Concepts to Ideas (#204)

Approved in chat on 2026-11-11.

## Intent

Use a saved concept original or image variant as an Idea reference without
downloading and re-uploading it. Keep the existing inline curated-variants workflow.

## Approved behavior

- **Use in idea** appears for originals and image variants, including saved skin,
  camera and 3D-arm results. Text-only variants have no image-transfer action.
- A small dialog offers **New idea** or **Add to existing idea**. Existing ideas
  are searchable by title; no ideas means a clear invitation to create one.
- New idea: prefill a short editable title from the prompt, description from the
  prompt and selected result's refinement notes, concept style tags, and one image.
  Open the normal Idea editor. Nothing enters the saved ideas collection until Save.
- Existing idea: append one reference with an editable optional note, preserving
  every existing image, crop, note and other field. Open the chosen idea afterward.
- Make a byte-for-byte, independently staged image copy under
  `user/<owner>/ideas/<reserved idea id>/...` before handing off or saving a ref.
  Never persist inline data or reuse a `concepts/` blob key. Deleting a concept must
  not invalidate the idea's image.
- Busy state prevents duplicate submissions. Read/staging failures leave the
  dialog recoverable and create no partial idea or attachment. Closing the dialog,
  navigating away, deleting the target or changing owners invalidates late work.

## Builder calls

Follow Sable's existing dark editorial UI, fonts and dialog/focus conventions;
44px targets and keyboard operation at 320–430px. New-image note defaults to
`AI concept`, using the result title when available (including preview labels).
Reserve a random idea id before staging, but pass newness explicitly into the editor
so it still performs a full new-record Save. A bounded, in-memory, single-use handoff
stores normalized fields, a staged key and the captured owner scope/epoch. Route state
carries only its random request id, never image bytes or a draft usable by another owner.
Validate owner and epoch when the destination consumes it; reject after a page reload
or owner A→B→A transition. Consume it once; browser
Back/Forward must not reopen the same unsaved draft or append again. Saved target links
use `/brief?idea=<id>` and wait for normal collection hydration without inventing records.

## Boundaries and verification

No new dependencies, provider calls, image generation, re-compression, bulk transfer,
or automatic push/merge. Update both guides and in-app Help with fictional screenshots.
Unit tests prove staging, ownership and safe collection updates; iPhone-emulated browser
tests prove original/variant transfer, explicit Save, ready photos and `/sable/` routing.
