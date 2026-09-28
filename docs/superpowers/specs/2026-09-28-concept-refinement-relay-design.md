# Concepts: refinement with an authenticated image relay

Date: 2026-09-28
Status: revised after Claude's spec-only review; approved by the user on 2026-09-28.
Implementation plan: `docs/superpowers/plans/2026-09-28-concept-refinement-relay.md`.

## Intent and approved direction

Help Pritesh turn tattoo inspiration into an original, useful artist brief inside
Sable. Keep the existing Concepts workspace and inline result variants rather
than introducing a separate result-management area.

The user selected three capabilities: refine a saved image, compose from annotated
references, and a lettering studio with exact Gujarati/Japanese text. The agreed
delivery order is refinement, reference composition, then lettering. Direct image
generation/editing is paired with a copy/export/import fallback. The user chose
an authenticated server-side relay instead of adding more browser-held API keys.

This spec covers the first independently deliverable slice: the relay foundation
and **Refine this**. Reference composition and lettering have their own subsequent
spec/plan cycles. Their constraints are recorded below so this foundation does
not obstruct them; their editors are not part of this implementation.

Success: choose an existing image, describe a change, review the outgoing input,
generate one new variant, compare it with the original, and recover the same
result after interrupted connectivity without accidentally purchasing it twice.

## Scope

Included:

- A refinement composer within the existing concept/result view.
- One selected source image, change instructions, and preservation instructions.
- An owner-only paid image service with server-held provider secrets.
- Real authentication independent of the library's storage adapter.
- Private, short-lived input/output storage and a durable job record.
- Checked local result commits, storage-persistence status, and a lightweight
  backup indicator for device-only paid results.
- Inline variants, lineage, provenance, comparison, ratings, Best, and existing
  try-on hand-off after a result has been saved.
- No-key/manual refinement through a prompt pack, reference export, and import.
- Matching Help text, guide screenshots, and clearly labelled proposed-system
  architecture/workflow documentation when implementation lands.

Excluded: cloud provisioning/deployment, billing subscriptions, public access to
paid generation, migrating existing AI provider calls or the tattoo library,
the AWS backend, masks/inpainting UI, batch generation, autonomous generation,
a new gallery workspace, artist-style
cloning, and claims that a generated image is tattoo-ready or linguistically valid.

## Current-system constraints

- `src/backend/index.js` currently selects auth/store/blobs together. Local auth
  accepts a plausible email without verifying credentials. Supabase is the only
  implemented real-auth adapter; AWS selection currently throws.
- `src/backend/types.js` exposes only `{ user }` in a session. Supabase's adapter
  deliberately drops the SDK access token from that UI-facing object.
- `src/context/AuthContext.jsx` purges user-owned local data on identity changes.
  That protection must remain intact.
- `src/backend/local/localStore.js` derives its namespace from
  `tattoo_local_session`, falling back to `anon`. That is not a valid namespace
  source when real auth is paired with local storage.
- `src/hooks/useStorage.js` swallows localStorage quota failures and exposes no
  committed-save receipt; local store writes also log failures without rejecting.
  Setting React state or awaiting the current `upsert` cannot prove a paid result
  was saved. The new result-import path must address this explicitly.
- `src/data/export.js` copies in-memory records, not blob-store bytes. Exporting
  unresolved keys or temporary display URLs is not a portable image backup.
- The GitHub Pages build is backend-free. Demo seeding and local sign-in must
  remain completely separate from paid authorization.
- `src/pages/Concepts.jsx` currently performs direct DALL-E generation; Gemini
  generation lives in `src/data/geminiImage.js`. These are not editing abstractions.
- `src/data/conceptVariants.js` constructs an explicit field whitelist. New
  provenance/lineage must be intentionally admitted, not assumed to survive.
- `src/data/imageCodec.js` currently traverses only concept and variant image URLs.
  Refinement can reuse those image slots; later reference/calligraphy slots will
  need additional codec traversal.

## Architecture and authentication

The proposed service is a small Node HTTP API/worker with a durable SQLite job
store and a private filesystem spool, on one persistent-volume instance. This is
an implementation target, not a choice of hosting vendor or permission to create
infrastructure. Ephemeral/serverless hosting cannot use this persistence design
unchanged. A later host-specific deployment plan must specify TLS, backups, disk
encryption, service secrets, monitoring, region, and estimated running costs.

For the private app, allow `VITE_AUTH_BACKEND=supabase` independently of
`VITE_BACKEND=local|supabase`. The default remains the current coupled selection;
the new override supports real Supabase login with local store/blob adapters.
Allow local auth/local storage, Supabase auth/local storage, and Supabase
auth/Supabase storage; reject other combinations explicitly. Expose auth
capabilities rather than inferring real authentication from `backend.kind` alone.
Update every demo/local login affordance and boot seeding check to require the
offline-auth capability.

In real-auth/local-storage mode, inject the authoritative auth-session identity
into the local store rather than reading `tattoo_local_session`. Capture the
verified subject once at the start of each operation; use only that namespace
through its asynchronous work. Missing identity rejects an operation instead of
falling back to `anon`. Preserve the old namespace/legacy migration behavior only
for offline-auth mode; never auto-claim legacy or anonymous rows for a real user.
Local blob reads/removals also verify the captured owner's canonical key prefix.
On sign-out/account switch, clear display caches and pending uploads as today,
retain owner-namespaced authoritative local rows/blobs, and reload only the same
subject's library after sign-in. Do not move personal bytes into a shared namespace.

Supabase stays confined to its adapter. Add `auth.getAccessToken()` returning a
current SDK-managed access token or null. The local adapter always returns null.
Pages call a provider-neutral image-service client, never the Supabase SDK.
The token is not copied to Sable's own localStorage, variant metadata, URLs, or
logs. This does not claim the Supabase SDK itself avoids browser session storage.

The relay verifies the token before accepting image bytes or reserving a job:
signature, configured algorithm, exact issuer, audience, expiry, and immutable
owner `sub`. Anonymous users, publishable/service credentials, other authenticated
subjects, and forged local sessions are rejected. Email, editable user metadata,
owner-seed configuration, and CORS origins are never authorization evidence.
Asymmetric Supabase signing keys are the production prerequisite; use a maintained
JWT verification library against a fixed configured JWKS endpoint, with bounded
cache/rotation behavior. Never discover a JWKS URL from an untrusted token.

The private build is invite-only: disable public sign-ups and anonymous sign-ins,
and gate library loading on the configured owner subject as well as a real session.
Configure a 15-minute access-token lifetime and verify the issued `iat`/`exp`
window in the activation smoke test. JWT signature verification alone does not
immediately revoke a token on sign-out; a stolen token can remain usable until
expiry. Quotas and short expiry limit that exposure, not active XSS or a stolen
refresh token. Document an operator procedure to disable new submissions and
undispatched paid jobs immediately without promising cancellation of provider
work already sent. No service-role credentials are added to the browser.

Public demo builds have no relay configuration and no relay-backed paid actions.
The relay also enforces the owner check, so manually calling its URL bypasses
nothing.
The private app uses a separate origin initially: no automatic conversion of
existing `local-<email>` identities or silent transfer of their stored data.
Existing explicit backup/import remains the route for bringing a local library
across; verify those tools before private activation. Auth-only configuration does
not imply enabling cloud document sync.

All job, status, result, acknowledgement, and deletion endpoints enforce ownership.
Bearer auth is used, not ambient cookies; allow only configured private origins
and bounded preflight behavior. CORS is an additional browser control, not auth.

## Refinement workflow

1. Select **Refine this** on a concept image or saved image variant. Text-only
   results do not show a paid edit action.
2. Display the selected source, a **Change** field, a **Keep** field, and output
   palette (black ink or colour). Seed useful wording, but do not force all
   outputs monochrome or add a contradictory global "no text" instruction.
3. Show the exact outgoing image and compiled instructions. Explain the named
   provider receives this image and text; unrelated boards, portfolio images,
   body photos, and library metadata are not included automatically.
4. On **Generate one variation**, persist a stable request ID, exact prepared
   source bytes, digest, compiled instructions, and captured owner/destination
   in an owner-scoped IndexedDB pending record before sending. Failure to save
   this record blocks submission with a recoverable storage message. One explicit
   click requests one image, not a batch; retries never regenerate source bytes
   from a mutable URL, canvas, or edited draft.
5. Show job status. Preserve the draft and source while waiting or on failure.
   Backgrounding/closing the drawer does not mean provider work was cancelled.
6. A completed result is imported through the ordinary blob/image codec and added
   as a new inline variant. Never overwrite the original or existing variants.
7. Compare original and variation side by side (stacked on narrow screens), rate,
   mark Best, or send the saved result to the existing try-on workflow.

If no paid capability is available, keep the composer usable. **Copy refinement
prompt** copies text; **Export source image** exports actual bytes for manual
attachment. Make clear that clipboard text does not attach the image. **Import
variation** uses the existing import validation and stores user-supplied provider
attribution, clearly distinguished from relay-verified provenance.

## Service contract and recoverability

The first provider adapter is OpenAI's image-edit API, using a server-configured
allowlisted model that supports edits. Confirm model availability/access and
current pricing in implementation; clients cannot choose arbitrary model names,
provider URLs, output sizes, or quality levels. Use one bounded output profile.
The preview identifies provider/profile and explains that generation is paid;
do not present a made-up exact price. Gemini is a later adapter, not an automatic
fallback following a possibly billed failure.

API shape:

- `GET /v1/image-capabilities`: authenticated supported operations/profile and
  quota availability plus server time for request-clock calibration; no secrets.
- `POST /v1/image-jobs`: bounded multipart image + JSON instructions, with an
  `Idempotency-Key`. Return `202` and a job ID after durable acceptance.
- `GET /v1/image-jobs`: bounded pending/recent-job reconciliation for this owner.
- `GET /v1/image-jobs/:id`: safe status, expiry, and stable failure category.
- `GET /v1/image-jobs/:id/result`: authorized image bytes; no public result URL.
- `POST /v1/image-jobs/:id/ack`: record successful local import, safely repeatable.
- `DELETE /v1/image-jobs/:id`: discard recoverable output, or cancel only work
  proven not yet dispatched. Running provider work has no promised cancellation.

Persist the owner/request-ID uniqueness constraint and a server-computed hash of
the canonical request JSON plus exact received image bytes, before provider
normalization/re-encoding. Freeze the chosen server output profile on acceptance.
Reusing the same key/payload returns the same job; the same key with different
content returns `409`. Retries resend the saved pending payload byte-for-byte;
intentional source/instruction edits require a new, explicitly confirmed request.
Request keys include an issue timestamp and random nonce. Accept an unseen key
only within five minutes of its issue time, allowing at most 30 seconds of future
skew. Compare against the server's timestamp when authenticated headers arrive,
not when the body finishes; apply an independent upload deadline. A future key
returns `key_clock_skew` with server time; an older unseen key returns `410` with
`request_expired`. Calibrate client timestamps from the capabilities response.
Known keys reconcile from the stored record. This makes old replay requests
non-billable even after seven-day tombstones are removed.
The timestamp is a stale-replay/UX guard, not protection against a malicious
authenticated client; verified ownership and transactional quotas serve that role.
An offline draft receives its request key only at online submission, not when
the draft is first saved. An expired, definitely unaccepted key requires explicit
resubmission confirmation; it is not silently replaced.
Reserve quota and insert a job in one transaction. A single worker atomically
claims an accepted job and writes `dispatching` before attempting the provider.

After a provider response, validate and save the output before changing the job
to `succeeded`: write job-keyed temporary files, fsync the image, atomically rename
it into place, then write/fsync a completion manifest containing its digest,
type, and size before atomic rename and directory fsync. Only then commit
`succeeded` in SQLite
with crash-safe synchronous settings. The manifest is the spool's completion
marker, not mere existence of a partial image file. Disk/write failure leaves the
job unacknowledged; report the failure without dispatching another paid attempt.

On restart, before assigning `outcome_unknown`, reconcile `dispatching`/`running`
jobs against complete, digest-validated output manifests: promote recoverable
jobs to `succeeded` without calling the provider. Clean incomplete/orphan spool files
under the retention policy. A crash before any complete output reaches disk can
still lose a provider-paid result; state this limitation rather than claiming
end-to-end exactly-once delivery or guaranteed recovery from every crash.

Job states: `accepted`, `dispatching`, `running`, `succeeded`, `failed`,
`outcome_unknown`, `expired`, `cancelled`. A crash/timeout after dispatch begins
cannot prove the provider did not bill. Without provider-supported reconciliation,
mark that job `outcome_unknown`, retain its quota reservation, and never redispatch
automatically. Tell the user the outcome is uncertain; a genuinely new paid
attempt requires another explicit confirmation. Idempotency protects relay
replays; it does not magically make an external provider transaction exactly-once.
`outcome_unknown` is terminal for the active-job limit but still counts toward
the daily quota; only accepted/dispatching/running jobs occupy the active slot.

On reload, reconcile pending IDs with the authenticated service. Missing local
markers can recover via the recent-job listing, with explicit destination choice
rather than an inferred concept. Once acceptance is confirmed, use status/result
retrieval only and remove the temporary prepared-input bytes. Unconfirmed pending
inputs expire locally after 24 hours; expiration never triggers paid resubmission.
Refresh expired auth once via the adapter; retries of submission retain the same
ID. Never retry a paid edit
with a newly generated key merely because a fetch timed out.

Initial limits: one active job per owner, ten accepted jobs per UTC day, no more
than one source image, instructions up to 4,000 characters combined, request body
up to 8 MiB, decoded image up to 16 megapixels, and a fixed maximum output profile.
Authenticate from headers before consuming the multipart body; apply request
size/time limits at both ingress and application layers. Validate actual decoded
JPEG/PNG/WebP bytes, not just filename/MIME. Remove metadata through re-encoding;
do not accept SVG, external fetch URLs, or arbitrary blob-store keys from clients.
The client prepares orientation-correct source bytes and previews that prepared
image. Server re-encoding preserves visible content, including transparency.

Only jobs rejected before any dispatch release a quota reservation; failed or
uncertain dispatched jobs still count. Daily counts are a guardrail, not a
guaranteed currency cap. Configure provider-side spending controls before enabling
real calls and document their limitations. No hidden automatic retries/fallbacks.

## Privacy, storage, and asynchronous ownership

Retain input files only until completion or a maximum of 24 hours after acceptance.
Retain unacknowledged output and recovery metadata for 24 hours after completion;
acknowledgement deletes temporary output. Keep minimal idempotency/quota tombstones
for seven days, without prompts/images. Expired request keys return `410`, never
silently create another billable job. Cleanup runs on startup and periodically;
failed cleanup is observable and retried. No public buckets or image URLs.
Expire undispatched jobs before deleting their inputs. Bound dispatched work
with a configured provider timeout; uncertain work is never automatically resumed.
Relay responses use `Cache-Control: no-store`; the app's service worker must
exclude relay requests/results from caching.

Logs contain opaque job IDs, redacted owner correlation, state, duration, and
safe failure codes only. Do not log keys, bearer tokens, request bodies, prompts,
image bytes, body-photo URLs, or raw provider responses. Return sanitised errors.
User consent does not assert that the provider has zero retention; name the
provider and link its current policy rather than inventing assurances.

The client captures owner, concept ID, source variant ID, and draft revision at
submission. Check active identity and destination ownership at every asynchronous
boundary, including image import. Never write into a new user's state or overwrite
a newer draft. If the concept was deleted, keep the result recoverable and offer
explicit import into a chosen concept; do not resurrect it silently.

Use a deterministic variant identity derived from the job ID so repeat result
downloads/reconciliation do not duplicate variants. Only acknowledge after blob
bytes and canonical record have both been durably saved. On partial import failure,
keep the server result recoverable; clean orphan local blobs through existing
ownership-safe mechanisms. Purge pending client markers and prepared-input bytes
on identity change.
Signing out does not cancel an already dispatched job; signing back in as the
same verified owner may recover it within the retention window.

### Checked local import and device-only durability

Add a checked commit operation to the concept-storage boundary, coordinated with
the existing edit/flush ordering rather than a parallel direct writer. It must
reject blob, canonical-record, quota, and ownership failures. Return a receipt
only after the blob transaction completes and the owner-scoped authoritative
record can be read back with the expected job-derived variant ID and image key.
React state updates, debounced flush scheduling, or existing log-only storage
errors are not receipts. A relay acknowledgement is sent only from this checked
path. A crash between local save and acknowledgement is safe to reconcile using
the same deterministic variant ID; do not acknowledge on a best-effort cache write.

On first private activation, query `navigator.storage.persisted()` and request
`persist()` when available; show granted/denied/unavailable status without making
it a prerequisite for manual workflows. Completed writes mean committed to this
browser's storage, not backed up or immune to device loss/user deletion/eviction.
If persistent mode is denied or unavailable, warn before the first paid submission
that importing and acknowledging removes the relay copy and the library is
device-only. Do not silently extend server retention as a substitute for backup.

The Concepts view gets a compact backup indicator: no export requested, last
export-requested time, and whether paid variants were saved since that request. Reuse the
existing export action; no periodic automation or forced download after every job.
Do not label an initiated browser download as a verified backup. A portable export
must materialize locally stored image bytes from canonical keys, include variant
lineage and generation/refinement metadata, and reject with a clear message if
any required local image cannot be read. Already embedded image bytes need no
second fetch. External portfolio/reference URLs stay labelled external references,
not falsely advertised as backed-up image bytes; this slice does not add arbitrary
relay fetching or solve third-party CORS. Never claim a portable paid-result
backup containing only temporary URLs/unresolved blob keys. Verify restoration
into a fresh origin with no access to the source browser's IndexedDB. This is a
targeted prerequisite for device-only
paid results, not a redesign of unrelated backup fields.

The installed private PWA is the documented primary working location. Activation
tests must check the actual Safari/home-screen storage behavior on the target
iPhone and explain where the current library lives; do not assume that the two
contexts either share or separate storage on every OS version.

## Saved data and compatibility

Extend the variant whitelist with optional, versioned metadata:

- `operation: 'refine'`, `parentVariantId` (null for concept's original image),
  `sourceConceptId`, and `sourceImageDigest` for lineage without duplicating bytes.
- `generation`: schema version, service job ID, provider, resolved model/profile,
  creation time, and provenance (`relay` or `user-import`).
- `refinement`: change/preserve instructions and palette, saved only in the user's
  own concept record; not in relay tombstones/logs.

Legacy variants remain readable without migration. Preserve existing `isBest`,
rating, notes, and image-key behavior. Deleting a parent does not remove a child's
image or invent a replacement parent; show the recorded lineage as unavailable.
Relay provenance is returned by the service, never claimed from a user-selected
provider label. Existing concept-level artist matching remains unchanged.

## Existing AI features: explicit transition boundary

New refinement uses the relay only. Existing text-to-image generation, screenshot
analysis, and generated skin-preview tools keep their current separate BYOK
integrations in every build during this slice, with accurate disclosures. Do not
remove shared OpenAI/Gemini settings or claim that all Sable AI keys have moved
server-side. No new BYOK refinement endpoint is added. Non-relay builds gain the
manual refinement fallback and retain their current generation behavior.

Keep a versioned `operation` field in the job schema, but accept only `refine`
in this service version and reject other operations. Migrating generation through
the relay is a subsequent security slice, designed/tested separately; reserving
an operation field does not authorize another provider route now.

## Subsequent slices, not first-slice acceptance requirements

Reference composition: select up to three explicitly chosen images, annotate what
to borrow (composition, texture, palette), preview every upload, and ask for an
original composition rather than copying a portfolio piece. Extend the image codec
to traverse each persistent reference asset. No automatic artist-image upload.

Lettering: store exact Unicode text in a separate editable glyph layer. Support
user-approved typography/calligraphy assets for Gujarati/Japanese; generation may
create the ink/composition/background, not silently replace the exact letters.
Keep original editable layers and a flattened export. Preserve alpha in assets;
the existing white-flattening skin-preview JPEG helper is not suitable here.
Translation/transliteration and glyph correctness remain explicitly unchecked
until reviewed by a competent human; editing the text resets review status.

Both slices reuse the job/auth/variant foundation but need their own written
designs and tests. Neither AI concepts nor demo imagery are presented as a real
artist's portfolio or endorsement.

## Verification and activation gate

Before implementation is called complete:

- Unit tests cover auth/store selection, local token refusal, demo isolation,
  token refresh, prompt compilation, lineage/whitelist, codec round trips,
  deterministic imports, draft retention, and stale-owner/destination guards.
  Include real-auth/local-store namespace isolation (A to B to A), private-mode
  rejection of anonymous/legacy namespaces, prepared-byte reuse after reload,
  checked-save rejection on quota failure, persistence denied/unavailable, and
  portable backup/restore including image bytes and new metadata.
- Service integration tests use a stub image provider and temporary disk/database:
  forged/expired/wrong-issuer/wrong-audience/anonymous/non-owner tokens; object
  ownership for every endpoint; malformed/oversized/decompression-bomb inputs;
  quota concurrency; replay/conflict; clock skew and a body that completes after
  the key's admission window; crash before/after dispatch, after output rename,
  after manifest commit but before state commit, and after local import before
  acknowledgement; corrupt/partial spool files; uncertain outcomes; expiry and
  cleanup. A failed client save must leave the server result recoverable.
- Browser tests run on a fake local service/auth seam with no production tokens,
  no paid provider calls, and no sync to a real account. Cover refinement,
  comparison, manual fallback, reload recovery, sign-out, deletion, and mobile UI.
  Assert existing direct generation remains unchanged and the relay rejects
  `generate`; test backup state messaging without claiming download completion.
- Run unit tests, service tests, lint, root and `/sable/` builds, relevant browser
  tests, and documentation/Mermaid validation. Update the matching guide/Help
  section and recapture screenshots per `docs/MAINTAINING.md`.
- Real activation is a separate approval: named host/account/region, persistent
  disk and TLS, Supabase project with asymmetric keys, verified owner subject,
  private-app origin, portable backup/import check on the target iPhone, retention
  cleanup verification, provider key/model access, and spending controls. Disable
  public sign-ups/anonymous sign-ins, verify 15-minute issued token lifetime and
  owner-only library access, and document the paid-service disable procedure.
  Record the Supabase plan's inactivity-pausing behavior: either an explicitly
  approved non-pausing plan, or acceptance of Free-plan pauses with a documented
  availability check and manual recovery procedure. Do not keep a project awake
  with artificial traffic or create monitoring/paid upgrades without approval.
  No defaults create resources or execute paid calls.

## Review disposition

Claude reviewed only the original spec, not repository source. Its five findings
were checked against the written design and official platform guidance; source
compatibility checks below were performed locally, not exported to Claude.

- Device-only durability: accepted. Add persistence status, honest backup signals,
  portable image-bearing exports, and actual-iPhone activation checks. Requesting
  persistent mode is not treated as an off-device backup guarantee.
- Crash after provider completion: accepted. Commit a verifiable spool result
  before database success and reconcile it at startup; document the remaining
  pre-persistence loss window.
- Retry conflicts/expiry: accepted. Preserve exact payload bytes, hash before
  normalization, evaluate admission at header receipt, and expose clock errors.
- Generation migration scope: accepted. Defer it; first service accepts refinement
  only and preserves existing BYOK generation.
- Supabase activation settings: accepted with a bounded operational choice.
  Enforce invite-only settings/short token lifetime and document pausing/recovery;
  neither a paid plan nor a monitoring automation is provisioned by this spec.
- Additional local checks: `localStore.js` currently reads simulated auth at
  lines 15-25 and hides save errors at lines 56-61; `useStorage.js` exposes no
  commit receipt at line 332 and hides quota failures at lines 84-88/193-197.
  The spec now requires authenticated owner scoping and a checked paid-result save.
  `export.js` lines 36-47 copy records without materializing blob bytes; portable
  backup validation is therefore an explicit first-slice prerequisite.

## Source basis

Browser-secret risk and server routing: [OpenAI API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety).
Editing capability and image-generation limitations: [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation).
Token verification and signing-key rotation: [Supabase JWT guidance](https://supabase.com/docs/guides/auth/jwts).
Supabase compatibility scan: [official changelog](https://supabase.com/changelog).
Token lifetime/revocation and availability: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[sign-out behavior](https://supabase.com/docs/guides/auth/signout), and
[production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
Browser persistence/eviction: [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
These sources inform the design; concrete SDK/model versions and deployment
limits must be rechecked when the implementation plan is written.
