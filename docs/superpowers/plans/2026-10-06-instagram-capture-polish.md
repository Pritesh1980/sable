# Instagram Capture Polish Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for native implementation, or `superpowers:subagent-driven-development` only if the user selects delegation. Work task-by-task using the checkboxes. This plan is awaiting review and execution approval; writing it does not authorize implementation.

**Goal:** Make screenshots and Instagram profile links easy to bring into Sable and save with minimal form filling on an iPhone.

**Architecture:** Use the existing `AddArtistModal` for Wall, Gallery and shared intake, preserving its staged-file ownership and canonical upload path. Keep the iPhone Shortcut as a clipboard-to-local-intake handoff, with explicit user-triggered clipboard access and manual paste/photo selection fallbacks. No new capture collection, backend or Instagram scraping.

**Tech Stack:** React 19, React Router 8, Tailwind 4, existing browser image/storage helpers, Vitest/Testing Library and Playwright.

**Spec:** The user-approved brief below. Confirmation was given in this chat on 6 October 2026; execution has not been approved.

## Approved Brief

The owner saves either screenshots or profile links from Instagram. Both transferring them to Sable and completing the form feel cumbersome.

- Support both inputs through one quick-capture experience.
- Put the reference image/link and artist handle first; name, tags, status and notes are optional details.
- Default new artists to `researching`.
- Attach new photos to an existing artist without overwriting their metadata or creating a duplicate.
- Confirm the save and protect attached screenshots from accidental dismissal.
- Saving works without a provider key; screenshot analysis remains optional.
- Reject post/reel links as artist identities and ask for the actual handle.
- Keep paid refinement, cloud deployment and a new inbox out of scope.

### Success Criteria

1. A valid profile link can be saved without filling any optional metadata.
2. A screenshot can be selected/pasted first, then saved after confirming its artist handle. Without analysis, only the handle is required.
3. Repeat captures for a known handle append photos and preserve its name, notes, tags, rank, status and studio.
4. A denied/unavailable clipboard API leaves manual paste and the photo picker usable.
5. Failed saves and cancelled dismissals retain the staged files and user-entered fields while the form remains mounted.
6. Both Wall and shared Gallery use the same capture UI, including under `/sable/`.
7. Real iPhone evidence is required before claiming the Shortcut/PWA handoff works. Browser emulation proves only app behaviour.

## Global Constraints

- Planning only until the user reviews this document and chooses execution.
- Preserve the existing Sable design: `v2-ink`, `v2-surface`, `v2-cream`, `v2-muted`, `v2-accent`, `v2-hairline`, Marcellus and Archivo. No palette, navigation or Wall redesign.
- Capture is a compact dialog/sheet, not a new landing page. Photo selection and the handle field lead; one collapsed native disclosure holds optional metadata. Use existing Lucide icons, focus treatment and safe-area conventions; controls at least 44 by 44 CSS pixels.
- No new production dependencies. No new storage schema, inbox, automatic sync behaviour or background capture.
- Do not fetch Instagram pages or infer an author from a post shortcode. Do not put screenshot bytes, clipboard text or provider keys into navigation URLs or logs.
- Clipboard reads and provider analysis are explicit user actions, never automatic on page load or merely because a key exists.
- Keep screenshot crop restoration, provenance ownership, file removal, multi-image upload and existing owner fencing intact. Preserve keyboard/desktop paste and drag/drop.
- Dirty-close protection covers in-app dismissal only. This release does not promise draft survival after reload, app termination, navigation outside the app or sign-out. Do not persist private screenshots to localStorage as a shortcut.
- All automated proofs use fictional demo assets and intercepted provider responses. No real account, live paid request or refinement activation.
- Do not take over backlog work marked `in-progress`; storage/deployment issues are separate from this polish pass.
- Preserve the pre-existing uncommitted IJFW memory block in `CLAUDE.md`.

## Current Code And Design Findings

- `src/pages/Wall.jsx` opens `AddArtistModal`; `src/pages/Gallery.jsx` opens `QuickAddArtist`, including for `/share` redirects.
- `AddArtistModal` supports several files, checked async analysis ownership, canonical `uploadImages` and duplicate-photo append. `QuickAddArtist` currently takes one screenshot and rejects duplicates outright.
- `parseInstagramHandle()` in `src/data/artists.js` extracts the first path segment. A post/reel URL can therefore become `p` or `reel`; invalid-host lookalikes can also match its substring regex.
- The Wall form puts images below optional tags and uses desktop-only paste wording on phones.
- `getShareShortcutUrl()` only returns the configured `VITE_IOS_SHORTCUT_URL`. The repo does not contain a signed installable Shortcut; an iCloud link must not be invented.
- The existing iPhone recipe copies the shared input to the clipboard and opens the base-aware share landing route. It still requires paste. Preserve this honest fallback.
- Android/desktop image-share caching is in `src/sw/shareTarget.js` and `public/sw.js`; retain its one-time stash consumption. Extending native Web Share Target to text/URLs is outside this iPhone slice.

## Review Focus

1. Post/reel/story links, malformed URLs and lookalike hosts must never create an artist named `p`, `reel` or a foreign URL: Task 2.
2. Clipboard permission denial, unavailable image reads and empty clipboard must not erase a staged capture or request permissions on load: Task 3.
3. Shared file hydration and StrictMode replay must attach exactly one copy, with correct `/sable/` routing: Task 4.
4. Repeat save, file removal and late AI/upload callbacks must not duplicate artists or overwrite newer edits/owner state: Tasks 3 and 5.
5. Escape, backdrop taps and the iPhone keyboard must not silently discard staged files or hide the save control: Tasks 5 and 6.

## Interfaces And File Ownership

- Keep `parseInstagramHandle(input = '') -> string`; invalid or non-profile input returns `''`. Preserve valid handle casing; duplicate comparison remains case-insensitive.
- Add `readCaptureClipboard(clipboard) -> Promise<CaptureClipboardResult>` in `src/data/clipboardIntake.js`. Results are `{ kind: 'image', file: File }`, `{ kind: 'text', text: string }`, or `{ kind: 'manual', reason: 'unsupported' | 'denied' | 'empty' | 'unreadable' }`. No hidden retry/read after denial.
- Extend `AddArtistModal` with `initialFile = null` and optional `onSaved(receipt)`. Keep its existing `artists`, `setArtists`, `userId`, `initial`, `onClose` and `onManage` props.
- `receipt` is `{ kind: 'created' | 'images-added', artistId: string, imageCount: number }`. Emit it only after the local library update has succeeded; it is not cloud-sync confirmation.
- `onClose()` continues to close/reset the host. The modal owns its dirty-discard guard; an internal successful-save close bypasses that guard.
- `onSaved` is rendered by each host as a small `role="status"` confirmation. No new global notification framework.

## Task 1: Establish The iPhone Handoff Contract

**Files:** `docs/02-managing-artists.md` (final edits land in Task 6), `src/data/platform.js`, `src/pages/Settings.jsx`, `src/test/platform.test.js`, `src/test/Settings.test.jsx`.

**Deliverable:** A concrete Shortcut recipe and clear distinction between verified phone behaviour and a planned fallback. Publishing the Shortcut is a human/device step, not a repository-only operation.

- [ ] Record the current entry route and installed-PWA/browser context on the owner's iPhone using a fictional screenshot and `https://www.instagram.com/mora.blackfern/`. Do not use private portfolio bytes in captured evidence.
- [ ] Prototype this recipe in Shortcuts: accept Images, URLs and Text; Copy Shortcut Input to Clipboard; Open the deployment's fixed `/share` URL. Do not encode images or the raw input in the URL. If mixed input is supplied, copy the selected item rather than concatenating image bytes with text.
- [ ] Confirm whether it returns to the same Sable storage context/session or opens Safari separately. If contexts differ, document that limitation; do not call the flow verified or add an automatic-login workaround.
- [ ] Treat an explicit Paste action as the default. Test clipboard reading only from a tap; retain long-press paste in the handle field and photo selection when image reading is unavailable.
- [ ] Add/update Settings tests for configured and absent Shortcut URLs. A configured link may show an install action; an absent link must show the manual setup route. The text must not claim images arrive automatically on iPhone.
- [ ] Run `npm test -- --dir src src/test/platform.test.js src/test/Settings.test.jsx`. Commit only the relevant copy/tests after observing their red-to-green result.

**Human gate:** The owner can publish an updated iCloud Shortcut link and provide it for `VITE_IOS_SHORTCUT_URL`. Until then, the manual recipe remains the supported route. Lack of a published link does not block app polish, but the full handoff success criterion remains pending.

## Task 2: Accept Real Handles And Profile Links Safely

**Files:** Modify `src/data/artists.js`; extend `src/test/artists.test.js` and existing add-form tests when validation messages change.

- [ ] Add table-driven failing cases to the existing parser suite:

```js
it.each([
  [' @mora.blackfern ', 'mora.blackfern'],
  ['https://www.instagram.com/mora.blackfern/?igsh=sample', 'mora.blackfern'],
  ['instagram.com/mora.blackfern/', 'mora.blackfern'],
  ['https://www.instagram.com/p/ABC123/', ''],
  ['https://www.instagram.com/reel/ABC123/', ''],
  ['https://www.instagram.com/stories/mora.blackfern/123/', ''],
  ['https://instagram.com.evil.invalid/mora.blackfern/', ''],
  ['https://evil.invalid/instagram.com/mora.blackfern/', ''],
  ['two handles', ''],
  ['https://www.instagram.com/%ZZ/', ''],
])('parses %s without inventing an artist', (input, expected) => {
  expect(parseInstagramHandle(input)).toBe(expected)
})
```

- [ ] Run `npm test -- --dir src src/test/artists.test.js`; confirm the new invalid-link cases fail against the old parser.
- [ ] Use `URL` for URL parsing, an exact Instagram host allowlist (`instagram.com`, `www.instagram.com`, `m.instagram.com`), and `http:`/`https:` only. Reject credentials, multiple nonempty path segments and reserved routes (`p`, `reel`, `reels`, `stories`, `explore`, `accounts`, `direct`, `tv`, `share`). Decode one segment with a caught `decodeURIComponent` failure. Validate the resulting handle against ASCII letters/digits/underscore/period, length 1-30. Do not change IDs of previously saved artists.
- [ ] Bare handles use the same character/length validation. Existing lowercase/uppercase preservation and profile query-string cases remain green.
- [ ] In capture, invalid input produces an actionable field error: `Use an artist handle or profile link, not a post or reel link.` It never triggers scraping or a paid lookup.
- [ ] Run parser and form tests; commit `fix(intake): reject non-profile Instagram links`.

## Task 3: Make The Existing Capture Form Minimal And Mobile-Friendly

**Files:** Modify `src/components/AddArtistModal.jsx`; create `src/data/clipboardIntake.js`, `src/test/clipboardIntake.test.js`; extend `src/test/AddArtistModal.test.jsx`.

**Deliverable:** One compact form: image preview/photo picker and explicit clipboard action, handle/profile-link field, collapsed optional details, Save and Cancel. The metadata controls retain their existing fields and meanings.

- [ ] Write failing DOM tests showing that optional details start collapsed, a valid profile link saves with no optional edits, and the photo picker accepts multiple images before entering a handle. Use the existing render/upload mocks.
- [ ] Add clipboard tests with structured fake `ClipboardItem` values:

```js
it('returns an image without parsing clipboard HTML', async () => {
  const clipboard = { read: async () => [{
    types: ['image/png', 'text/html'],
    getType: async () => new Blob(['fixture'], { type: 'image/png' }),
  }] }
  const result = await readCaptureClipboard(clipboard)
  expect(result.kind).toBe('image')
  expect(result.file.type).toBe('image/png')
})

it('does not retry after permission denial', async () => {
  const clipboard = { read: vi.fn().mockRejectedValue(new DOMException('', 'NotAllowedError')),
    readText: vi.fn() }
  expect(await readCaptureClipboard(clipboard)).toEqual({ kind: 'manual', reason: 'denied' })
  expect(clipboard.readText).not.toHaveBeenCalled()
})
```

- [ ] Also test text-only read, absent `read` with supported `readText`, no clipboard object, empty data and rejected image conversion. Never read HTML, log clipboard contents or fetch a pasted link.
- [ ] Implement the helper with a deliberate single read. Prefer the first supported image; otherwise use `text/plain`. Return a manual result on denial/failure. Only fall back to `readText` when `read` is absent, not after it rejects.
- [ ] Wire a user-triggered `ClipboardPaste` icon/text control to the helper. Images go through existing `addFiles`; text fills the handle input only when empty, or asks before replacing a user-edited value. Manual results leave current fields/files untouched. Retain actual `paste` event handling and photo selection.
- [ ] Reorder the JSX without inventing a new component framework. Use a native `<details><summary>Details</summary>...</details>` for name, tags, status and notes; keep labels and existing token classes. Use Lucide icons with accessible names; no desktop keyboard instructions on mobile.
- [ ] Make screenshot analysis an explicit Auto-fill action when a key exists, not a side effect of attaching a photo. Compression/upload readiness still gates Save. AI-owned field tracking, stale-result guards and crop restoration remain in place; analyses finishing after manual edits/removal do not clobber them. Update the existing analysis tests to click Auto-fill before awaiting results.
- [ ] Run `npm test -- --dir src src/test/clipboardIntake.test.js src/test/AddArtistModal.test.jsx src/test/artistSaveRace.test.jsx`. Commit `feat(intake): streamline mobile artist capture`.

## Task 4: Route Wall And Shared Gallery Through That Form

**Files:** Modify `src/pages/Gallery.jsx`, `src/pages/Wall.jsx`, `src/components/AddArtistModal.jsx`, `src/test/routes.test.jsx` and `src/test/v2-tokens.spec.js`; migrate relevant coverage from `src/test/QuickAddArtist.test.jsx` to `src/test/AddArtistModal.test.jsx`. Retire `src/components/QuickAddArtist.jsx` and its test file only once their behaviours have equivalent coverage.

- [ ] Add failing tests for `initialFile` under `StrictMode`: the same incoming File attaches once, a non-image is ignored, and rerenders do not reset edited fields. A different incoming image attaches once through the same path as the picker.
- [ ] Add route tests proving `/gallery?shared=1` mounts the canonical form and passes the consumed image. Keep the existing `consumeRef` one-time promise in Gallery; do not rewrite service-worker cache consumption.
- [ ] In `AddArtistModal`, consume `initialFile` idempotently using a ref-held set of consumed File identities and the existing staged-file functions. Do not attach it during render or mutate files in the prop.
- [ ] Replace Gallery's runtime `QuickAddArtist` with `AddArtistModal`, supplying the existing `artists`, `setArtists`, authenticated `userId`, `initialFile`, `onClose` and `onManage` boundary. Leave the heavy Manage `AddArtistForm` and its `addArtist()` caller intact.
- [ ] Gallery currently has no auth hook. Read `userId` from `useAuth()?.user?.id`; do not infer it from an email or hard-code a fallback owner. Supply the existing fictional auth context in tests that save images. Remove the retired filename from the token-contract file inventory after migrating its coverage.
- [ ] On close/success, remove only the consumed `shared` query parameter with router replacement, preserving other Gallery parameters. Reload must not reopen an already consumed capture. Keep paths basename-relative.
- [ ] Preserve the Wall's existing suggestion-prefill `initial` behaviour. Do not send the user to a new page solely to add an artist.
- [ ] Run the form, route, share-target and service-worker contract tests. Confirm migrated crop, no-key, initial-file and paste/drop proofs exist before removing the retired form/tests. Commit `refactor(intake): share one artist capture form`.

## Task 5: Protect Pending Capture And Confirm The Correct Save

**Files:** Modify `src/components/AddArtistModal.jsx`, `src/pages/Wall.jsx`, `src/pages/Gallery.jsx`, `src/hooks/useDialogFocus.js`; extend `src/test/AddArtistModal.test.jsx`, `src/test/artistSaveRace.test.jsx` and route tests. Add `src/test/useDialogFocus.test.jsx` for the shared focus utility if its existing behaviour needs the disclosure fix described below.

- [ ] Add failing tests for dirty Cancel, Escape, backdrop and Manage-link dismissal. Rejecting the discard prompt keeps entered fields and every staged file; confirming discards them. A clean form closes directly. Use the existing dialog/focus conventions and `useDialogFocus` if required; test nested Escape handling.
- [ ] The current focus trap queries inputs even inside a closed native disclosure. Pin Tab order through the handle, Details summary and Save without visiting hidden metadata. Include `summary` in its focusable selector and filter controls hidden by a closed disclosure or inert/hidden ancestors; keep summary itself reachable. Test reopened details, focus restoration and existing viewer/undo-toast behaviour before changing this shared hook. Browser Tab tests must exercise actual focus, not just DOM presence.
- [ ] Funnel in-app dismissals through one guard. During an active save, disable dismissal and repeat submit. A successful save bypasses the dirty-discard prompt; upload errors keep the form open, restore controls and show a retryable error. No unload/storage recovery promise.
- [ ] Test case-insensitive existing handles with photos: append canonical uploads while preserving every existing metadata field. For duplicate links with no photos, show `Already in your collection`; disable the append action rather than emitting a misleading save receipt.
- [ ] Keep upload destination and final library write tied to the same artist identity and owner. Capture the current owner scope before asynchronous upload and assert it before updating; if the target artist was removed/replaced during upload, do not resurrect it. Extend the existing identity/owner race tests rather than starting a storage refactor.
- [ ] Emit `onSaved({ kind: 'created', artistId, imageCount })` or `onSaved({ kind: 'images-added', artistId, imageCount })` only after successful local library mutation. The Wall/Gallery hosts render `Artist saved` or `2 photos added to @handle` in `role="status"`, without claiming cloud sync or opening Instagram automatically.
- [ ] Test rejected upload, repeated Save, owner transition, existing-artist replacement and a late analysis result. Assert no extra artist or metadata overwrite and no success receipt for failure.
- [ ] Run affected intake, owner/identity and Gallery/Wall tests; commit `fix(intake): protect captures and repeat saves`.

## Task 6: Prove The App Flow And Update The Guide

**Files:** Create `e2e/intake.e2e.js`; extend `e2e/routes.subpath.e2e.js`; update `docs/02-managing-artists.md`, `docs/07-backup-and-settings.md` (Shortcut setup wording only), matching `src/pages/Help.jsx` sections, `README.md` test counts, `docs/MAINTAINING.md` and `scripts/captureGuide.mjs`; add `public/guide/artist-capture.png` and reference it in the guide and Help. Extend `src/test/refinementDocs.test.js` for that screenshot.

- [ ] Write public-demo E2E for profile link -> saved artist; screenshot -> manual handle -> saved photo; duplicate -> appended photo; rejected post link; denied clipboard -> photo-picker fallback; cancelled discard -> capture retained. Intercept any configured provider origins; never use real imagery or credentials.
- [ ] Use fresh mobile contexts at 320, 375 and 430 CSS pixels. Check there is no horizontal overflow, the optional section is collapsed and Save is reachable after focusing the handle. Check Escape/focus return on desktop. Use relative navigation for a matching `/sable/` test.
- [ ] Read canonical saved image refs back after reload using the existing storage fixtures; merely displaying an in-memory preview is not proof of a saved photo.
- [ ] Update numbered docs and Help together: profile/screenshot inputs, optional metadata, explicit Auto-fill, duplicate append, local-save confirmation, dirty-close limits and the real Shortcut/manual fallback. Show Install Shortcut only when a genuine iCloud link is configured.
- [ ] Extend `captureGuide.mjs` to capture the compact form as `artist-capture.png` with a fictional demo image in a 430 by 920 mobile context. Reference it in the matching Help section and guide; update the guide image contract. Recapture Wall/Gallery/Settings/Help images only where their visible UI changed.
- [ ] Update README's exact test/file counts from the completed run, not guessed counts. Update capture instructions and entrypoint references after retiring QuickAddArtist.
- [ ] Run focused intake E2E, root/subpath build, lint, `npm run docs:check`, screenshot-reference/dimension checks, then `npm test -- --dir src` once. Existing large-chunk warnings are not a new intake regression. Isolate any failed spec before rerunning the whole suite.
- [ ] Commit `docs(intake): document the quick capture flow` with the guide images and browser proofs.

## Task 7: Real iPhone Acceptance And Release Gate

**Files:** Append evidence to this plan; record any unresolved phone-specific limitation as a small follow-up issue only with the owner's approval.

- [ ] In the intended real deployment context, have the owner share a fictional screenshot, then a fictional artist profile link through the updated Shortcut. Record whether Safari or the installed PWA receives it, any clipboard permission prompt, required gestures and whether the same local library/session is used.
- [ ] Compare the same paths with the baseline recorded in Task 1. Record measured interactions, not a promised arbitrary tap count. Both paths must be simpler; saving must not require optional metadata.
- [ ] Verify photo selection/manual paste still works when clipboard reading is denied. Verify keyboard reachability, duplicate append, photo display after reopen and cancelled discard on the phone.
- [ ] Keep this gate pending when no physical device evidence exists. App code may be reviewed separately, but do not report the whole iPhone handoff complete or imply desktop Chromium proves it.
- [ ] Review the bounded diff once, verify no data migration, provider activation or unrelated edits, and ask for commit/push or merge permission. Preserve unrelated `CLAUDE.md` memory changes.

## Verification Budget And Rollback

- Implement natively in small commits unless the user chooses delegation. No automatic reviewer swarm or repeated full-suite loops.
- Run focused tests during each task, one complete source suite at integration, and one bounded independent review if the selected execution method calls for it.
- Run all browser checks on an isolated offline server with explicit `VITE_BACKEND=local`, `VITE_AUTH_BACKEND=local`, empty relay/private-owner/Supabase values and blocked service workers, except dedicated service-worker sharing checks.
- No document/image schema changes are required. Rollback is reverting the relevant intake commits after checking for later work; never reset the user's tree or remove saved artists to restore the old UI.
- Preserve the existing Android share route/cache protocol. Do not broaden this release into the storage backlog or real deployment work.

## Plan Audit

- Seven tasks trace to the approved capture/handoff criteria; no inbox, scraping, deployment or paid refinement work is included.
- Every task has named file owners and a verification step. Parser -> form -> shared entry points -> save protections -> browser/docs integration is dependency ordered.
- The real-iPhone/Shortcut publication gate is explicit, not assumed. Manual fallback is a supported outcome, not an invisible workaround.
- Existing image and analysis ownership boundaries are reused; no destructive data migration is planned.
- **Execution status:** awaiting the user's plan review and execution-method selection.
