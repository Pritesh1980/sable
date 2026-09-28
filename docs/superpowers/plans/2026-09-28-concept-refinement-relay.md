# Concept Refinement Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine one explicitly selected saved image into a recoverable inline variant, using an owner-only paid relay or an honest manual fallback, without overwriting the original or purchasing an automatic retry.

**Architecture:** Keep Sable's existing Concepts workspace and provider-neutral backend seam. Separate real authentication from library storage, then add checked result commits and portable backups. A separately packaged Node HTTP service uses SQLite for transactional jobs/quotas and a private durable spool for images; the browser journals exact prepared inputs before submission and acknowledges only a verified local import.

**Tech Stack:** Existing React 19/plain JavaScript/Vite/Vitest/Playwright; existing Supabase SDK confined to its adapter; Node 26.8.1 or newer in the 26.x line, native `node:http`, `node:sqlite`, `fetch`/`FormData`; service-only exact dependencies `jose@6.2.12` and `sharp@0.35.5`; Node's test runner for service integration tests.

**Spec:** `docs/superpowers/specs/2026-09-28-concept-refinement-relay-design.md` (user-approved 2026-09-28; read it and `CLAUDE.md` before execution).

## Global Constraints

- This first service version accepts only `operation: 'refine'`; reject `generate`. Reference composition and lettering are subsequent spec/plan cycles.
- One explicit click requests one image, not a batch; no blind paid retry or provider fallback.
- Initial limits: one active job per owner, ten accepted jobs per UTC day, no more than one source image, instructions up to 4,000 characters combined, request body up to 8 MiB, decoded image up to 16 megapixels, and a fixed maximum output profile.
- An unseen request key is admitted within five minutes of issue time, with at most 30 seconds future skew, measured when authenticated headers arrive. Known keys reconcile from durable records.
- Retain inputs until completion or at most 24 hours after acceptance; unacknowledged outputs/recovery metadata for 24 hours after completion; minimal prompt/image-free tombstones for seven days. Unconfirmed local inputs expire after 24 hours without resubmission.
- Real auth/local storage rejects missing identity, anonymous/legacy namespace claiming, and foreign-owner blob keys. Offline auth/local storage keeps its current compatibility behavior.
- Allow local/local, Supabase/local, and Supabase/Supabase auth/storage combinations; defaults stay offline. Auth-only configuration does not enable cloud sync.
- Relay authorization uses verified immutable `sub`, exact issuer/audience/algorithm/expiry, and fixed configured JWKS—not email, `user_metadata`, CORS, or simulated local sessions.
- Private activation requires invite-only auth, asymmetric signing keys, a 15-minute access-token lifetime, and owner-only library access. Signing out does not immediately revoke a JWT or cancel dispatched work.
- Public demo has no relay configuration. Existing text-to-image, screenshot analysis, and generated skin preview retain their existing BYOK integrations in every build.
- Keep originals, existing variants, rating, Best, notes, matching, image-key semantics, and existing try-on hand-off. No new gallery or artist-style cloning.
- Preserve Sable's existing drawer/dialog stack and dark editorial tokens in `CLAUDE.md`; new controls have visible keyboard focus and at least 44 × 44 touch targets. Comparison stacks on narrow screens.
- Tokens, prompts, source bytes, keys, and raw provider errors never enter logs, URLs, or relay tombstones. All relay responses are `no-store`; service-worker routing bypasses the relay.
- Paid result acknowledgement requires completed blob storage and a checked canonical-record readback. Browser persistence is not an off-device backup; download requested is not download verified.
- Cloud provisioning, deployment, live model-access checks, paid calls, monitoring, paid upgrades, and pushes are outside this execution plan. Activation is a separate explicit approval.

## Review Focus

1. Two tabs import the same recovered job while ordinary edits continue in the importing tab: one job-derived variant, no lost notes/Best edits, and no premature acknowledgement (Tasks 2, 5, 16).
2. A cached image resolution finishes after sign-out and re-login: old-owner display URLs must not repopulate the new identity's cache (Tasks 4, 16).
3. Gujarati/Japanese text, astral Unicode, and reordered JSON properties: the shown prompt survives exactly and semantically identical canonical requests do not conflict (Tasks 1, 8, 14).
4. The device clock jumps or acceptance straddles UTC midnight: stable IDs reconcile, admission uses header time, and quota belongs to the acceptance day (Tasks 9, 13, 15).
5. The source parent is removed or marked Best while an edit is in progress: the new image remains independent, lineage is honestly unavailable, and no newer UI draft is replaced (Tasks 2, 16, 17).

---

## Execution boundaries and file map

Execute in a fresh managed worktree after the user selects an execution method. Keep this design branch's approved documents as the starting point; never reset unrelated changes. Every task has a red/green cycle and a scoped Conventional Commit. Code excerpts below are the first tested increments, not permission to skip the explicit additional cases in the same task.

| Boundary | Files / responsibility |
|---|---|
| Shared wire contract | `shared/imageJobs.js`: browser-safe constants, strict request validation, deterministic JSON, prompt compilation, request keys and variant identity. No Node imports or secrets. |
| Saved metadata | `src/data/conceptVariants.js`: whitelist/lineage and duplicate-safe insertion. |
| Auth selection | `src/backend/index.js`, `types.js`, auth adapters, `AuthContext.jsx`, `ProtectedRoute.jsx`, demo/login guards: independent auth selection and owner gating. |
| Local ownership | `src/backend/ownerScope.js`, local store/blobs, `src/data/blobUrls.js`, purge: authoritative owner capture and cache invalidation. |
| Checked writes | `src/hooks/useStorage.js`, `src/data/checkedConceptImport.js`, `src/data/conceptResultUpload.js`: one coordinated write lane and verified receipts. |
| Device durability | `src/data/storagePersistence.js`, `portableBackup.js`, `backupStatus.js`, `BackupPanel.jsx`, `ConceptBackupStatus.jsx`: persistence, materialized backups, honest export status. |
| Relay authentication/config | `server/src/config.js`, `auth.js`; `server/package.json`/lockfile: fail-closed server configuration and JWT verifier. |
| Input boundary | `server/src/requestBody.js`, `imageInput.js`: bounded bytes/multipart, decoded formats, normalized source and raw-byte digest. |
| Durable jobs | `server/src/jobRepository.js`, `schema.sql`: SQLite acceptance, quota, states, owner queries and tombstones. |
| Durable files | `server/src/spool.js`: private input/output files, digest-validated completion manifests, cleanup. |
| Paid provider | `server/src/providers/openaiEdits.js`: one fixed-origin, single-attempt OpenAI edit call. |
| Worker | `server/src/worker.js`: claim-before-dispatch, timeout/uncertainty, restart reconciliation and retention. |
| HTTP surface | `server/src/http.js`, `main.js`: owner-checked routes, CORS, no-store, safe errors and shutdown. |
| Browser request journal | `src/data/imageJobs/pendingJobs.js`, `prepareSource.js`: exact prepared bytes and owner-scoped recovery markers. |
| Browser transport | `src/data/imageJobs/relayClient.js`: fresh bearer token, one refresh, stable replay, safe status/results. |
| Browser orchestration | `src/hooks/useConceptRefinement.js`: owner/destination/draft guards, recovery/import/ack ordering. |
| UI | `src/components/RefinementComposer.jsx`, `RefinementCompare.jsx`, existing viewer/lab and `Concepts.jsx`: inline refinement and manual fallback. |
| Proof/docs | `server/test/*`, `src/test/*`, `e2e/refinement*`, fake-auth fixture config, guides/Help/screenshots, architecture/workflows and activation checklist. |

### Locked shared contracts

Use JSDoc typedefs in `shared/imageJobs.js` (plain JS, not a TypeScript conversion):

```js
/** @typedef {{version:1, operation:'refine', profileId:string,
 * change:string, keep:string, palette:'black'|'colour', prompt:string}} RefinementRequest */
/** @typedef {{ownerId:string, conceptId:string, parentVariantId:string|null,
 * draftRevision:number}} RefinementDestination */
/** @typedef {{id:string, requestId:string, state:string, createdAt:string,
 * completedAt:string|null, expiresAt:string|null, errorCode:string|null,
 * sourceImageDigest:string, request:RefinementRequest|null,
 * generation:{version:1,jobId:string,provider:'openai',model:string,
 * profileId:string,createdAt:string,provenance:'relay'}} PublicImageJob */
/** @typedef {{requestId:string, ownerId:string, source:Blob|null,
 * sourceImageDigest:string, request:RefinementRequest,
 * destination:RefinementDestination, createdAt:number,
 * jobId:string|null, accepted:boolean}} PendingImageJob */
/** @typedef {{ownerId:string,conceptId:string,variantId:string,
 * imageKey:string,committed:true}} ConceptCommitReceipt */
/** @typedef {{enabled:boolean,operations:string[],provider:string,
 * profile:{id:string,model:string,size:string,quality:string,outputFormat:string},
 * quota:{active:number,dailyRemaining:number},serverTime:number}} ImageCapabilities */
```

Errors have `{code,status,serverTime?}`; never include raw network/provider errors in persisted records or UI. Store timestamps as UTC ISO strings in records, millisecond numbers for admission arithmetic. Wire JSON uses fixed ordered properties from strict validation, not stringification of arbitrary incoming objects. SHA-256 digests are lowercase hex. IDs are UUIDs; request IDs are `v1.<epoch-ms>.<uuid>`. No caller-provided filesystem path or external source URL crosses the HTTP boundary.

Profile: server-only `openai-refine-v1`, one PNG, `1024x1024`, `medium`, allowlisted model `gpt-image-2.5-sunburst`. This model/profile is a documented implementation candidate, not verified access to the user's account or a spending approval. Provider calls remain disabled until separate activation. Freeze the complete profile in the accepted job, never recompute it on replay.

### Test runners and fixtures

- Browser modules: `npx vitest run <exact files>` using existing jsdom and fake-indexeddb setup; keep real env settings overridden.
- Service modules: `npm --prefix server test -- <exact test files>` with script `node --test`; tests use temporary directories, test signing keys and stubbed fetch/provider. No production token or provider key.
- Service test fixture `server/test/fixtures.js` exports `makeJwtFixture()` → `{ownerId,issuer,audience,algorithm,keyResolver,issue(overrides):Promise<string>}`, using jose-generated ES256 keys. `issue` defaults to authenticated/non-anonymous owner, current `iat` and `exp=iat+900`.
- `makeDiskFixture(t)` → `{dir,spoolDir,dbPath}` uses `mkdtemp` below the OS temp directory and registers `t.after` cleanup of that exact generated directory. Never pass a repository/home path to recursive cleanup.
- `server/test/helpers.js` exports `startTestRelay(t,options)` → `{url,repo,spool,providerCalls,token,ownerId}`, once HTTP exists; it composes real service modules with fixture JWT keys and a stub provider.
- Browser relay tests use fake auth injected by a Vite virtual-module alias in a **separate** Playwright config. No `VITE_FAKE_AUTH`, global test hook, or pretend JWT bypass is admitted to production code.

## Task 1: Define the refinement wire contract and prompt

**Files:** Create `shared/imageJobs.js`; test `src/test/imageJobsContract.test.js`.

**Interfaces:** Produces `LIMITS`, `JOB_STATES`, `compileRefinementPrompt({change,keep,palette}):string`, `validateRefinementRequest(input):RefinementRequest`, `canonicalRequest(input):string`, `createRequestId(nowMs,nonce):string`, `parseRequestId(id):{issuedAt,nonce}`, `variantIdForJob(jobId):string`, and `imageJobError(code,status,serverTime?):Error`. Later service/browser tasks import this exact module.

- [ ] Write the first red test, including Unicode preservation:

```js
import { expect, it } from 'vitest'
import { canonicalRequest, compileRefinementPrompt } from '../../shared/imageJobs.js'
it('preserves the exact instruction text while canonicalizing field order', () => {
  const fields = { change: 'પ્રીતેશ — プリテシュ 🖋️', keep: 'Keep the ink texture', palette: 'colour' }
  const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
    ...fields, prompt: compileRefinementPrompt(fields) }
  expect(request.prompt).toContain(fields.change)
  expect(canonicalRequest(request)).toBe(canonicalRequest(Object.fromEntries(Object.entries(request).reverse())))
})
```

- [ ] Run `npx vitest run src/test/imageJobsContract.test.js`; expect missing-module/export failure.
- [ ] Add the minimal prompt implementation; keep exact user text, no global prohibition on text:

```js
export function compileRefinementPrompt({ change, keep, palette }) {
  return [
    'Create one original tattoo-concept variation from the attached source image.',
    `Change:\n${change}`, `Preserve:\n${keep}`,
    palette === 'colour' ? 'Palette: colour is allowed.' : 'Palette: black ink.',
    'This is inspiration for discussion with an artist, not a tattoo-ready stencil.',
  ].join('\n\n')
}
```

- [ ] Add strict validator/key code and tests: reject unknown properties, wrong versions/operation/profile shape, nonstrings, empty Change, malformed palettes, combined instructions over 4,000 characters, mismatched compiled prompt, invalid/noncanonical UUID keys and invalid timestamps. Keep valid Unicode unchanged. `canonicalRequest` returns `JSON.stringify(validateRefinementRequest(input))` with the validator constructing the fixed ordered object. `variantIdForJob` returns `relay:<validated UUID>`; error codes/status are safe fixed strings/numbers.
- [ ] Run the same test command; expect all contract cases pass without network.
- [ ] Commit:

```bash
git add shared/imageJobs.js src/test/imageJobsContract.test.js
git commit -m "feat(concepts): define refinement contract"
```

## Task 2: Preserve lineage and deduplicate recovered variants

**Files:** Modify `src/data/conceptVariants.js`; create `src/test/refinementVariants.test.js`; extend `src/test/conceptVariants.test.js` and `src/test/offlineImageRefs.test.jsx`.

**Interfaces:** Consumes `variantIdForJob(jobId):string`; extends `createConceptVariant(input,options)` whitelist with optional operation/lineage/generation/refinement fields; produces `upsertRefinementVariant(concept,variant):concept`. New generation records have the shared job fields plus optional user-import provenance; existing legacy variants remain untouched.

- [ ] Write the red dedupe test:

```js
import { expect, it } from 'vitest'
import { upsertRefinementVariant, removeConceptVariant } from '../data/conceptVariants'
it('retains saved user edits on repeat import and does not cascade parent deletion', () => {
  const variant = { id: 'relay:00000000-0000-4000-8000-000000000001', imageUrl: 'user/A/concepts/c/result.png',
    parentVariantId: 'parent', operation: 'refine', notes: '', rating: 0, isBest: false }
  const first = upsertRefinementVariant({ id: 'c', variants: [{ id: 'parent', imageUrl: '/source.png' }] }, variant)
  first.variants[0] = { ...first.variants[0], notes: 'Artist discussed', rating: 5, isBest: true }
  const again = upsertRefinementVariant(first, variant)
  expect(again.variants).toHaveLength(2)
  expect(again.variants[0]).toMatchObject({ notes: 'Artist discussed', rating: 5, isBest: true })
  expect(removeConceptVariant(again, 'parent').variants[0].imageUrl).toBe(variant.imageUrl)
})
```

- [ ] Run `npx vitest run src/test/refinementVariants.test.js`; expect missing export.
- [ ] Add minimal duplicate-safe insertion:

```js
export function upsertRefinementVariant(concept, variant) {
  const existing = getConceptVariants(concept)
  if (existing.some((item) => item.id === variant.id)) return concept
  return { ...concept, variants: [variant, ...existing] }
}
```

- [ ] Extend the existing explicit whitelist with validated version-1 fields; provider `openai` gets an OpenAI label, existing provider IDs remain valid. Never copy arbitrary nested input keys. Test legacy round trips, nullable original parent, absent parent, metadata through `conceptsCodec`, manual `user-import` vs service `relay`, and rating/Best unchanged on replay. Manual UI cannot supply a relay provenance object.
- [ ] Run `npx vitest run src/test/refinementVariants.test.js src/test/conceptVariants.test.js src/test/offlineImageRefs.test.jsx`; expect pass.
- [ ] Commit the exact edited/test files with `git commit -m "feat(concepts): preserve refinement lineage"`.

## Task 3: Separate real auth from library storage and public demo

**Files:** Modify `src/backend/index.js`, `src/backend/types.js`, `src/backend/local/localAuth.js`, `src/backend/supabase/supabaseAuth.js`, `src/backend/owner.js`, `src/hooks/useArtistStorage.js`, `src/context/AuthContext.jsx`, `src/components/ProtectedRoute.jsx`, `src/pages/Login.jsx`, `src/pages/Wall.jsx`, `src/data/demoSeed.js`, `vite.config.js`, `playwright.config.js`, `.github/workflows/deploy-pages.yml`, `.env.example`; create `src/test/authStorageSelection.test.js`; extend `src/test/auth.test.jsx`, `src/test/demoSeed.test.js`, `src/test/owner.test.js`, `src/test/backendContract.test.js`.

**Interfaces:** Produces `createBackend(storageKind, {authKind?,ownerId?}={}):Backend`; `backend.capabilities={offlineAuth:boolean,realAuth:boolean}`; `auth.getAccessToken({forceRefresh?:boolean}={}):Promise<string|null>`; `auth.getSession`/signIn/change retain their token-free UI session. Owner configuration is `VITE_PRIVATE_OWNER_ID`; `VITE_AUTH_BACKEND` defaults to storage selection. `ProtectedRoute` gates children on configured owner in real-auth mode.

- [ ] Write red tests with Supabase factory mocked, not a real client:

```js
import { expect, it, vi } from 'vitest'
vi.mock('../backend/supabase/supabaseAuth', () => ({ createSupabaseAuth: () => ({
  getSession: async () => null, getAccessToken: async () => 'test-token',
  onAuthStateChange: () => () => {}, signOut: async () => {},
}) }))
import { createBackend } from '../backend'
it('supports real auth with local documents without granting offline demo authority', async () => {
  const b = createBackend('local', { authKind: 'supabase', ownerId: 'owner-sub' })
  expect(b.kind).toBe('local')
  expect(b.capabilities).toEqual({ offlineAuth: false, realAuth: true })
  expect(await b.auth.getAccessToken()).toBe('test-token')
  expect(await createBackend('local').auth.getAccessToken()).toBeNull()
})
```

- [ ] Run `npx vitest run src/test/authStorageSelection.test.js`; expect capabilities/token failure.
- [ ] Add selection guard before constructing adapters:

```js
const authKind = options.authKind || import.meta.env.VITE_AUTH_BACKEND || storageKind
if (!['local', 'supabase'].includes(storageKind) || !['local', 'supabase'].includes(authKind) ||
    (storageKind === 'supabase' && authKind === 'local')) {
  throw new Error('Unsupported auth/storage combination')
}
const capabilities = { offlineAuth: authKind === 'local', realAuth: authKind === 'supabase' }
```

- [ ] Implement adapter token getter with `sb.auth.getSession()` (throw SDK errors; fresh auto-refreshed session token), and `sb.auth.refreshSession()` only for `forceRefresh`. Local returns null. Do not put access tokens in UI sessions. Fail private mode closed when owner config is missing; wrong owner sees an access-denied screen and no data hooks mount. Serialize identity transitions; on an identity-changing event immediately enter the loading gate/unmount data hooks, invalidate owner work, await purge, then publish the new session. Use a monotonically increasing transition revision so a slow older purge cannot publish over a newer identity. A late cached session cannot beat a later event; keyed owner children ensure A→B always remounts AppShell.
- [ ] Replace all `backend.kind === 'local'` demo/login decisions with offline-auth capability, including `maybeSeedDemo` and `canOfferDemo`. Extend `seedsOwnerData(user,enabled,offlineAuth)` in `src/backend/owner.js`, pass `backend.capabilities.offlineAuth` at all four `useArtistStorage` call sites, and never seed real-auth libraries solely from an email match. Preserve offline tests/helper defaults deliberately, never derive paid access from stored demo email. Pin `VITE_AUTH_BACKEND=local`, empty `VITE_AI_RELAY_URL`, and empty private-owner setting in unit, default browser and Pages builds. Test all allowed/rejected combinations and `?demo=1` under real-auth/local-store.
- [ ] Run `npx vitest run src/test/authStorageSelection.test.js src/test/auth.test.jsx src/test/demoSeed.test.js src/test/backendContract.test.js`; expect pass. No SDK/package upgrade in this task.
- [ ] Commit:

```bash
git add src/backend/index.js src/backend/types.js src/backend/local/localAuth.js src/backend/supabase/supabaseAuth.js src/backend/owner.js src/hooks/useArtistStorage.js src/context/AuthContext.jsx src/components/ProtectedRoute.jsx src/pages/Login.jsx src/pages/Wall.jsx src/data/demoSeed.js vite.config.js playwright.config.js .github/workflows/deploy-pages.yml .env.example src/test/authStorageSelection.test.js src/test/auth.test.jsx src/test/demoSeed.test.js src/test/owner.test.js src/test/backendContract.test.js
git commit -m "feat(auth): decouple login from storage"
```

## Task 4: Enforce captured local owners and cancel stale display resolutions

**Files:** Create `src/backend/ownerScope.js`; modify `src/backend/index.js`, `src/context/AuthContext.jsx`, `src/backend/local/localStore.js`, `src/backend/local/localBlobs.js`, `src/data/blobUrls.js`, `src/backend/purge.js`; create `src/test/privateLocalOwnership.test.js`; extend `src/test/localStoreUserIsolation.test.js`, `src/test/purge.test.js`.

**Interfaces:** Produces `createOwnerScope({privateMode,getOwnerId}):{capture():{ownerId,epoch},assertCurrent(snapshot):void,invalidate():void}`. Backend exposes `ownerScope`, `privateOwnerId` and `setIdentity(userId):void`; its authoritative in-memory identity starts null in private mode, updates/invalidate immediately on a session event, and is never read from `tattoo_local_session`. AuthContext calls setIdentity before purge/publication. Local factories accept `{ownerScope?,allowLegacy?:boolean}`; every operation captures once and uses that owner throughout. `clearBlobUrls()` increments a cache epoch so pending resolver completions cannot register stale URLs. Private blob keys require `user/<captured owner>/` exactly.

- [ ] Write red tests with mutable authoritative identity:

```js
import { expect, it } from 'vitest'
import { createOwnerScope } from '../backend/ownerScope'
import { createLocalStore } from '../backend/local/localStore'
it('never claims offline rows for a private identity', async () => {
  localStorage.clear()
  localStorage.setItem('tattoo_remote_concepts', JSON.stringify([{ id: 'legacy' }]))
  let owner = 'A'
  const scope = createOwnerScope({ privateMode: true, getOwnerId: () => owner })
  const store = createLocalStore({ ownerScope: scope, allowLegacy: false })
  await store.upsert('concepts', [{ id: 'a' }])
  owner = 'B'; scope.invalidate()
  expect(await store.list('concepts')).toEqual([])
  owner = 'A'; scope.invalidate()
  expect(await store.list('concepts')).toMatchObject([{ id: 'a' }])
  owner = null; scope.invalidate()
  await expect(store.list('concepts')).rejects.toMatchObject({ code: 'owner_changed' })
})
```

- [ ] Run `npx vitest run src/test/privateLocalOwnership.test.js`; expect missing ownerScope.
- [ ] Implement the owner capture with an epoch, not a reread of simulated local session:

```js
export function createOwnerScope({ privateMode, getOwnerId }) {
  let epoch = 0
  return {
    capture() {
      const ownerId = getOwnerId()
      if (privateMode && !ownerId) throw Object.assign(new Error('Owner unavailable'), { code: 'owner_changed' })
      return { ownerId: ownerId || 'anon', epoch }
    },
    assertCurrent(snapshot) {
      if (snapshot.epoch !== epoch || snapshot.ownerId !== (getOwnerId() || 'anon')) {
        throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
      }
    },
    invalidate() { epoch += 1 },
  }
}
```

- [ ] Pass captured namespace into load/save rather than calling `storageKey` repeatedly. In private mode reject read corruption and write/quota failures, never claim legacy/anon rows. Preserve offline legacy migration and legacy error behavior where unrelated ordinary workflows rely on it; checked writes must reject regardless of mode. Local blob upload checks owner argument/key, reads/removals check prefix and owner again after async boundaries. Late IDB completion may save only to its captured namespace, never B. No destructive migration of canonical rows/blobs on logout.
- [ ] Add delayed resolver coverage with a mocked local blob adapter:

```js
it('does not register a display URL after identity invalidation', async () => {
  let finish
  const response = new Promise((resolve) => { finish = resolve })
  vi.spyOn(backend.blobs, 'getUrl').mockReturnValueOnce(response)
  const pending = resolveBlobKey('user/A/concepts/c/image.png')
  clearBlobUrls()
  finish('data:image/png;base64,YQ==')
  expect(await pending).toBe('')
  expect(keyForUrl('data:image/png;base64,YQ==')).toBeFalsy()
})
```

  Import `vi` from Vitest, `backend` from `../backend`, and the three functions from `../data/blobUrls` in the same test file. Capture resolver cache epoch and check it before `registerBlobUrl`; return empty if invalidated. Test A→B→A, quota, corrupt rows, foreign keys, and purge retains canonical databases while clearing display cache and pending journal (journal clearing wired in Task 14).
- [ ] Run `npx vitest run src/test/privateLocalOwnership.test.js src/test/localStoreUserIsolation.test.js src/test/purge.test.js`; expect pass.
- [ ] Commit:

```bash
git add src/backend/ownerScope.js src/backend/index.js src/context/AuthContext.jsx src/backend/local/localStore.js src/backend/local/localBlobs.js src/data/blobUrls.js src/backend/purge.js src/test/privateLocalOwnership.test.js src/test/localStoreUserIsolation.test.js src/test/purge.test.js
git commit -m "fix(storage): isolate authenticated local data"
```

## Task 5: Add MIME-preserving uploads and checked concept commits

**Files:** Create `src/data/conceptResultUpload.js`, `src/data/checkedConceptImport.js`; modify `src/hooks/useStorage.js`, `src/backend/local/localStore.js`, `src/backend/types.js`, `src/App.jsx`; create `src/test/checkedConceptImport.test.js`, `src/test/useStorageChecked.test.jsx`; extend `src/test/useStorageSync.test.jsx`, `src/test/useStorageDirty.test.jsx`.

**Interfaces:** Produces `uploadConceptResult(blob,{ownerId,conceptId,jobId,ownerScope,blobs}):Promise<{imageKey,imageUrl}>`; `importCheckedConceptResult({blob,job,destination,ownerScope,blobs,commitConcepts}):Promise<ConceptCommitReceipt>`; third `useStorage` tuple member `commitChecked(updater,{ownerId,conceptId,variantId,imageKey}):Promise<ConceptCommitReceipt>` with `commitChecked.supported:boolean`. App passes it to Concepts as `commitConcepts`; false support disables paid submission before any purchase. Existing first/second tuple behavior remains compatible. Local store gains `upsertChecked(collection,rows,{ownerId}):Promise<Record[]>`; Supabase checked writes use existing rejecting `upsert` plus readback, not a second writer.

- [ ] Write a red test for the import boundary with all dependencies explicit:

```js
import { expect, it, vi } from 'vitest'
import { importCheckedConceptResult } from '../data/checkedConceptImport'
it('propagates quota failure and never returns a receipt', async () => {
  const quotaError = Object.assign(new Error('Storage full'), { code: 'storage_full' })
  const blobs = { upload: vi.fn().mockRejectedValue(quotaError) }
  const commitConcepts = vi.fn()
  const ownerScope = { capture: () => ({ ownerId: 'A', epoch: 1 }), assertCurrent: () => {} }
  await expect(importCheckedConceptResult({ blob: new Blob(['png'], { type: 'image/png' }),
    job: { id: '00000000-0000-4000-8000-000000000001' },
    destination: { ownerId: 'A', conceptId: 'c', parentVariantId: null, draftRevision: 1 },
    ownerScope, blobs, commitConcepts })).rejects.toMatchObject({ code: 'storage_full' })
  expect(commitConcepts).not.toHaveBeenCalled()
})
```

- [ ] Run `npx vitest run src/test/checkedConceptImport.test.js src/test/useStorageChecked.test.jsx`; expect missing imports/API.
- [ ] Implement uploader's strict save increment (validate IDs before interpolation):

```js
const extension = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob.type]
if (!extension) throw Object.assign(new Error('Unsupported result'), { code: 'invalid_result' })
const snapshot = ownerScope.capture()
if (snapshot.ownerId !== ownerId) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
const imageKey = `user/${ownerId}/concepts/${encodeURIComponent(conceptId)}/${jobId}.${extension}`
await blobs.upload(ownerId, imageKey, blob, blob.type)
ownerScope.assertCurrent(snapshot)
```

- [ ] Read back blob bytes through `blobs.getUrl`; require nonempty readable bytes and matching SHA-256 to the downloaded result, then register its display URL only while owner is current. Do not use existing JPEG `uploadDataUrl` or accept its swallowed failure. Add blob MIME/alpha roundtrip and upload/readback/owner rejection cases.
- [ ] Extend the existing flush chain, rather than writing directly beside it. `commitChecked` cancels the debounce, enqueues behind ongoing flushes, applies the updater to the latest `valueRef`, stamps edits with existing dirty/deletion machinery, updates refs/state, performs checked cache write, awaits canonical upsert and owner-scoped readback. Validate expected concept/variant/imageKey in both canonical readback and latest state before producing `{committed:true}`. Owner switch or deletion at any boundary rejects; it does not resurrect the row. Ordinary edits arriving during the await remain queued and are never replaced by the receipt snapshot. A bounded failure to obtain a stable receipt stays recoverable (`commit_conflict`), not best-effort success.
- [ ] Coordinate private local-store writes across tabs with `navigator.locks.request('sable:<owner>:<collection>', ...)` around load/merge/save/readback for both ordinary and checked writers. The checked updater merges into the latest authoritative target row while retaining same-tab current edits; never overwrite another variant solely from a stale render snapshot. If Web Locks are unavailable, checked paid import rejects `commit_unavailable` and retains the relay copy; manual/offline legacy workflows stay usable. Surface that limitation in private capabilities before paid submission rather than after purchasing an image. Supabase storage still uses rejecting upsert/readback; this local multi-tab lock is not a claim of a cross-device database transaction.
- [ ] Add checked-hook tests with existing concepts: ordinary edit during delayed flush retained, deleted destination rejection, thrown `localStorage.setItem`, blob present/record absent, unavailable lock, duplicate import serialized by two local tabs. Preserve already saved notes/Best on repeat import. Existing flush generation/tombstone tests stay green.
- [ ] Run `npx vitest run src/test/checkedConceptImport.test.js src/test/useStorageChecked.test.jsx src/test/useStorageSync.test.jsx src/test/useStorageDirty.test.jsx`; expect pass. `ack` is deliberately absent from this module; Task 16 owns it.
- [ ] Commit:

```bash
git add src/data/conceptResultUpload.js src/data/checkedConceptImport.js src/hooks/useStorage.js src/backend/local/localStore.js src/backend/types.js src/App.jsx src/test/checkedConceptImport.test.js src/test/useStorageChecked.test.jsx src/test/useStorageSync.test.jsx src/test/useStorageDirty.test.jsx
git commit -m "feat(storage): verify paid concept imports"
```

## Task 6: Make local paid-image backups portable and status honest

**Files:** Create `src/data/storagePersistence.js`, `src/data/portableBackup.js`, `src/data/backupStatus.js`, `src/components/ConceptBackupStatus.jsx`, `src/test/BackupPanel.test.jsx`; modify `src/components/BackupPanel.jsx`, `src/data/export.js`, `src/App.jsx`, `src/pages/Settings.jsx`, `src/backend/purge.js`; create `src/test/portableBackup.test.js`, `src/test/storagePersistence.test.js`, `src/test/backupStatus.test.js`.

**Interfaces:** Produces `getStoragePersistence(storage=navigator.storage,{request=false}={}):Promise<'granted'|'denied'|'unavailable'>`; `createPortableBackup(data,{ownerId,blobs,fetchImpl=fetch}):Promise<Backup>` compatible with `parseBackup`; `readBackupStatus(ownerId)`, `recordExportRequested(ownerId,at,paidVariantIds)`, `getBackupSummary(ownerId,concepts):{requestedAt,paidSinceExport}`. Shared export action receives all library arrays; Concepts invokes the same App-level action, not a partial concepts-only backup labelled complete.

- [ ] Write red portable export test:

```js
import { expect, it, vi } from 'vitest'
import { createPortableBackup } from '../data/portableBackup'
import { parseBackup } from '../data/export'
it('materializes canonical local images and keeps lineage on fresh restore', async () => {
  const dataUrl = 'data:image/png;base64,aW1hZ2U='
  const backup = await createPortableBackup({ concepts: [{ id: 'c', variants: [{
    id: 'relay:job', imageUrl: 'user/A/concepts/c/job.png', parentVariantId: null,
    generation: { version: 1, provenance: 'relay', jobId: 'job' },
  }] }] }, { ownerId: 'A', blobs: { getUrl: vi.fn().mockResolvedValue(dataUrl) } })
  const restored = parseBackup(JSON.stringify(backup))
  expect(restored.concepts[0].variants[0]).toMatchObject({ imageUrl: dataUrl,
    generation: { provenance: 'relay' } })
})
```

- [ ] Run `npx vitest run src/test/portableBackup.test.js src/test/storagePersistence.test.js`; expect missing modules.
- [ ] Implement persistence probing with actual refusal/unavailability handling:

```js
export async function getStoragePersistence(storage = navigator.storage, { request = false } = {}) {
  if (!storage?.persisted || !storage?.persist) return 'unavailable'
  try {
    if (await storage.persisted()) return 'granted'
    return request && await storage.persist() ? 'granted' : 'denied'
  } catch { return 'unavailable' }
}
```

- [ ] Materialize image slots deliberately: artists' canonical images plus `unresolvedImages`, ideas' image `{url,key,note}` slots, board `cover`, concept original/variants plus `unresolvedImageKey`. Prefer canonical keys from codec/cache mappings over temporary display URLs. For `user/<owner>/...` keys read actual blob bytes, preserve MIME, embed data URLs and remove now-redundant keys/unresolved fields. Reject missing/foreign/malformed required local images and temporary `blob:` URLs that cannot be read; preserve already embedded bytes. Known bundled static images and external portfolio URLs remain references with a top-level `externalImageReferences` manifest; do not arbitrary-fetch third-party portfolio URLs. Do not fetch any relay result URL from backup creation.
- [ ] Route existing BackupPanel export through the asynchronous portable action, with progress/errors and unchanged v1 import compatibility. Record timestamp and snapshot of paid variant IDs **only after** successful materialization and download initiation. Copy: “Download requested—check the file was saved”, “No export requested”, “Paid results saved since last export request”. Never “verified backup” or “Backup exported” based solely on link.click. Persistence warning requires explicit acknowledgement before first paid send per owner when denied/unavailable, not before manual actions. Logout clears display of backup indicators; owner-scoped status can remain with that owner's library.
- [ ] Correct Settings' current account copy: in real-auth/local-storage mode sign-out clears displayed caches, not the owner-namespaced canonical library; signing back in as the same owner restores that device's library, not an implied cloud copy. Cloud-store builds describe sync separately. Test the text for both configurations.
- [ ] Run `npx vitest run src/test/portableBackup.test.js src/test/storagePersistence.test.js src/test/backupStatus.test.js src/test/export.test.js`; expect pass. Add denied/throwing API, partial image failure (no download/status advance), external reference, Unicode metadata, and later-added paid variant cases.
- [ ] Commit:

```bash
git add src/data/storagePersistence.js src/data/portableBackup.js src/data/backupStatus.js src/components/ConceptBackupStatus.jsx src/components/BackupPanel.jsx src/data/export.js src/App.jsx src/pages/Settings.jsx src/backend/purge.js src/test/portableBackup.test.js src/test/storagePersistence.test.js src/test/backupStatus.test.js src/test/BackupPanel.test.jsx
git commit -m "feat(backup): export portable paid results"
```

## Task 7: Package the relay and verify owner JWTs

**Files:** Create `server/package.json`, `server/package-lock.json`, `server/.env.example`, `server/src/config.js`, `server/src/auth.js`, `server/test/fixtures.js`, `server/test/auth.test.js`, `server/test/config.test.js`; modify `.gitignore`, `package.json`, `vite.config.js`, `eslint.config.js`.

**Interfaces:** Produces `readRelayConfig(env):RelayConfig` and `createOwnerVerifier({issuer,audience,algorithm,ownerId,keyResolver}):({authorization})->Promise<{ownerId}>`. Production keyResolver is fixed `createRemoteJWKSet`; test fixture contracts are defined above. Config includes absolute data directory, exact origins, owner/issuer/audience/algorithm, fixed JWKS URL, profile, `paidEnabled`, upload/provider timeouts and bind address. No cloud credentials in browser.

- [ ] Create package with private ESM, Node engine `>=26.8.1 <27`, test script `node --test`, start script `node src/main.js`; install **only at approved execution** using `npm install --prefix server --save-exact jose@6.2.12 sharp@0.35.5`. Commit the generated lock. Ignore only `server/node_modules/`, `server/.env`, `server/.env.local`, `server/.data/`; never ignore source/tests. Vitest excludes `server/**` while retaining its standard exclusions. ESLint gives `server/**/*.js` Node globals and disables React hook/refresh rules there; browser lint stays strict. Root script `test:relay` is `npm --prefix server test`.
- [ ] Write the auth red test using fixture (fixture creates keys, not network):

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeJwtFixture } from './fixtures.js'
import { createOwnerVerifier } from '../src/auth.js'
test('an authenticated non-owner cannot submit', async () => {
  const f = await makeJwtFixture()
  const verify = createOwnerVerifier(f)
  const token = await f.issue({ sub: 'another-sub' })
  await assert.rejects(verify({ authorization: `Bearer ${token}` }), { code: 'forbidden_owner' })
})
```

- [ ] Run `npm --prefix server test -- test/auth.test.js test/config.test.js`; expect missing auth/config exports.
- [ ] Implement JWT verification increment:

```js
const { payload } = await jwtVerify(token, keyResolver, {
  issuer, audience, algorithms: [algorithm], requiredClaims: ['sub', 'iat', 'exp'],
  clockTolerance: 0,
})
if (payload.sub !== ownerId || payload.role !== 'authenticated' || payload.is_anonymous === true) {
  throw imageJobError('forbidden_owner', 403)
}
if (payload.exp - payload.iat > 900 || payload.iat > Math.floor(Date.now() / 1000)) {
  throw imageJobError('invalid_token', 401)
}
```

- [ ] Add Bearer format/length guard, safe JWT-error mapping, exact sub/algorithm allowlist ES256 or RS256 configured singly; reject HS256, forged/expired/missing/wrong iss/aud, anonymous role and API/service keys. Production JWKS URL must be configured HTTPS derived from the exact configured issuer (`.../auth/v1/.well-known/jwks.json`), never token discovery; cache max 10 minutes, cooldown 30 seconds, timeout 5 seconds. Test rotation and unavailable-JWKS fail closed. Config rejects arbitrary model/origin, weak defaults, relative data directory and missing owner. `RELAY_PAID_ENABLED` defaults false; missing live provider key is allowed only while disabled.
- [ ] Run the same relay tests and `npx eslint server/src server/test`; expect pass. No Supabase table/schema change or live login.
- [ ] Commit:

```bash
git add server/package.json server/package-lock.json server/.env.example server/src/config.js server/src/auth.js server/test/fixtures.js server/test/auth.test.js server/test/config.test.js .gitignore package.json vite.config.js eslint.config.js
git commit -m "feat(relay): authenticate the configured owner"
```

## Task 8: Bound multipart input and hash exact received bytes

**Files:** Create `server/src/requestBody.js`, `server/src/imageInput.js`, `server/test/imageInput.test.js`, `server/test/requestBody.test.js`.

**Interfaces:** Consumes shared strict validator/canonical JSON/LIMITS; produces `readBoundedMultipart(req,{deadlineMs,maxBytes}):Promise<{request,sourceBytes}>`, `hashRequest(request,sourceBytes):string`, `normalizeImage(sourceBytes):Promise<{bytes:Buffer,mime:'image/png',digest:string}>`. Authentication is performed by HTTP task before calling the body reader. Original bytes are hashed before normalization; `normalizeImage.digest` is SHA-256 of the original prepared bytes, not the re-encoded provider input.

- [ ] Write red byte identity/format test:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { hashRequest, normalizeImage } from '../src/imageInput.js'
import { compileRefinementPrompt } from '../../shared/imageJobs.js'
test('raw-byte identity changes even if source images would normalize alike', async () => {
  const fields = { change: 'પ્રીતેશ / プリテシュ', keep: 'Ink', palette: 'colour' }
  const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
    ...fields, prompt: compileRefinementPrompt(fields) }
  assert.notEqual(hashRequest(request, Buffer.from('a')), hashRequest(request, Buffer.from('b')))
  await assert.rejects(normalizeImage(Buffer.from('<svg/>')), { code: 'invalid_image' })
})
```

- [ ] Run `npm --prefix server test -- test/imageInput.test.js test/requestBody.test.js`; expect missing modules.
- [ ] Implement framed hashing and strict decoded-image input:

```js
export function hashRequest(request, sourceBytes) {
  const json = Buffer.from(canonicalRequest(request))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  return createHash('sha256').update(length).update(json).update(sourceBytes).digest('hex')
}
// After metadata validation (jpeg/png/webp, exactly one page, <= 16,000,000 pixels):
const bytes = await sharp(sourceBytes, { limitInputPixels: 16_000_000, failOn: 'warning' })
  .autoOrient().png().toBuffer()
```

- [ ] Read stream chunks with an 8 MiB total cap, exact declared length checks, 30-second independent upload deadline and abort/disconnect rejection. Parse only after bounded buffering using native `Request(...,{method:'POST',headers,body:buffer}).formData()`. Accept exactly one `image` File and one `request` JSON field; reject duplicate/extra fields, unknown content encodings and malformed boundaries before allocating decoded image memory. Metadata and full re-encode must both pass; reject animation/multipage, empty/zero-dimension, decompression bombs and mismatched advertised MIME. Preserve alpha, correct EXIF orientation, strip metadata. Bound normalized output as well (8 MiB); normalization failure is pre-dispatch/non-billable.
- [ ] Add JPEG/PNG/WebP fixtures generated by sharp locally; assert EXIF rotation, alpha pixels, metadata removal, 16 MP boundary, raw-image digest distinction, reordered JSON same digest, fake extension, oversized/chunked/slow body and duplicated fields. No external image fetch route.
- [ ] Run the same test command; expect pass.
- [ ] Commit:

```bash
git add server/src/requestBody.js server/src/imageInput.js server/test/imageInput.test.js server/test/requestBody.test.js
git commit -m "feat(relay): validate bounded image requests"
```

## Task 9: Reserve jobs and quotas in one durable transaction

**Files:** Create `server/src/schema.sql`, `server/src/jobRepository.js`, `server/test/jobRepository.test.js`; extend `server/test/fixtures.js`.

**Interfaces:** Produces `createJobRepository(dbPath,{now=Date.now}={}):Repository` with synchronous `accept({id,ownerId,requestId,requestHash,sourceImageDigest,request,profile,inputRef,admittedAt}):Job`, `findRequest(ownerId,requestId):Job|null`, `get(ownerId,id):Job|null`, `list(ownerId,{limit=50}={}):Job[]`, `listInternal():Job[]`, `quota(ownerId):{active,dailyRemaining}`, `claimNext():Job|null`, `transition(id,from,to,patch={}):Job`, `ack(ownerId,id):Job`, `cancelOrDiscard(ownerId,id):Job`, `expire(nowMs):Job[]`, `scrub(id):void`, `close():void`. Job includes owner/internal refs; HTTP serializes the shared safe PublicImageJob, not entire DB rows. `listInternal` is worker-only and has no HTTP route.

- [ ] Write red transactional replay test (complete acceptance fixture):

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createJobRepository } from '../src/jobRepository.js'
import { compileRefinementPrompt } from '../../shared/imageJobs.js'
test('replay does not reserve another quota slot', () => {
  const now = 1_800_000_000_000
  const repo = createJobRepository(':memory:', { now: () => now })
  const fields = { change: 'Add mist', keep: 'Temple', palette: 'black' }
  const input = { id: '00000000-0000-4000-8000-000000000001', ownerId: 'A',
    requestId: `v1.${now}.00000000-0000-4000-8000-000000000002`, requestHash: 'a'.repeat(64),
    sourceImageDigest: 'b'.repeat(64), inputRef: 'internal-input', admittedAt: now,
    request: { version: 1, operation: 'refine', profileId: 'openai-refine-v1', ...fields,
      prompt: compileRefinementPrompt(fields) },
    profile: { id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst', size: '1024x1024', quality: 'medium', outputFormat: 'png' } }
  try {
    assert.equal(repo.accept(input).id, repo.accept(input).id)
    assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 9 })
    assert.throws(() => repo.accept({ ...input, requestHash: 'c'.repeat(64) }), { code: 'idempotency_conflict' })
  } finally { repo.close() }
})
```

- [ ] Run `npm --prefix server test -- test/jobRepository.test.js`; expect missing repository.
- [ ] Define schema and SQLite safety before implementing acceptance:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, source_digest TEXT NOT NULL,
  state TEXT NOT NULL, accepted_at INTEGER NOT NULL, accepted_day TEXT NOT NULL,
  dispatched_at INTEGER, completed_at INTEGER, expires_at INTEGER,
  quota_used INTEGER NOT NULL DEFAULT 1, request_json TEXT, profile_json TEXT NOT NULL,
  input_ref TEXT, result_json TEXT, error_code TEXT, acknowledged_at INTEGER,
  UNIQUE(owner_id, request_id)
);
CREATE INDEX jobs_owner_state ON jobs(owner_id, state);
CREATE INDEX jobs_owner_day ON jobs(owner_id, accepted_day);
```

- [ ] `accept` uses `BEGIN IMMEDIATE`, first looks up owner/key and validates hash, then checks active1/day10, timestamp admission and inserts; COMMIT or ROLLBACK. Use parameter bindings everywhere, `DatabaseSync` defensive mode and bounded busy timeout. Derive UTC day from `admittedAt`, not body-completion or mutable client time. `claimNext` transitions accepted→dispatching atomically, sets dispatched_at before returning. Enforce the transition matrix: accepted→dispatching/cancelled/expired/failed; dispatching→running/succeeded/failed/outcome_unknown; running→succeeded/failed/outcome_unknown; succeeded→expired (ack/discard removes bytes without re-enabling work). Terminal uncertain jobs free active slot but keep quota. Only proven undispatched rejection/cancel/expiry sets quota_used=0.
- [ ] Add two-connection concurrency against a temporary DB, one claim, other-owner queries/ack/delete refusal, UTC-midnight acceptance, timestamp boundary/future30s/stale410, profile freeze across replay, known expired job replay, 10/day, corrupt transition refusal, and seven-day tombstone scrub. Deleting job rows never opens old request timestamps for admission. Keep accepted-day quota until its day has passed even if retention scrub is earlier.
- [ ] Pin UTC-midnight behavior in the existing acceptance test using its complete `input` fixture:

```js
test('replays across midnight preserve acceptance-day quota', () => {
  let clock = Date.parse('2026-09-28T23:59:59.000Z')
  const midnightRepo = createJobRepository(':memory:', { now: () => clock })
  const fields = { change: 'Add mist', keep: 'Temple', palette: 'black' }
  const accepted = { id: '00000000-0000-4000-8000-000000000001', ownerId: 'A',
    requestId: `v1.${clock}.00000000-0000-4000-8000-000000000002`, admittedAt: clock,
    requestHash: 'a'.repeat(64), sourceImageDigest: 'b'.repeat(64), inputRef: 'internal-input',
    request: { version: 1, operation: 'refine', profileId: 'openai-refine-v1', ...fields,
      prompt: compileRefinementPrompt(fields) },
    profile: { id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst', size: '1024x1024',
      quality: 'medium', outputFormat: 'png' } }
  try {
    const job = midnightRepo.accept(accepted)
    clock = Date.parse('2026-09-29T00:00:01.000Z')
    assert.equal(midnightRepo.accept(accepted).id, job.id)
    assert.equal(midnightRepo.quota('A').dailyRemaining, 10)
    assert.equal(midnightRepo.quota('A').active, 1)
  } finally { midnightRepo.close() }
})
```
- [ ] Run the same test command; expect pass.
- [ ] Commit:

```bash
git add server/src/schema.sql server/src/jobRepository.js server/test/jobRepository.test.js server/test/fixtures.js
git commit -m "feat(relay): reserve idempotent job quotas"
```

## Task 10: Commit spool manifests before database success

**Files:** Create `server/src/spool.js`, `server/test/spool.test.js`.

**Interfaces:** Produces `createSpool(dir,{fault=()=>{}}={}):Spool`; async `writeInput(jobId,bytes):Promise<string>`, `readInput(jobId):Promise<Buffer>`, `removeInput(jobId)`, `commitOutput(jobId,{bytes,mime}):Promise<{digest,mime,size}>`, `readOutput(jobId):Promise<{bytes,mime,digest,size}|null>`, `removeOutput(jobId)`, `sweep(liveJobIds,nowMs):Promise<{removed,errors}>`. Job UUIDs only; callers never supply paths. `fault(stage)` exists solely as an injected test seam.

- [ ] Write red manifest-crash test:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeDiskFixture } from './fixtures.js'
import { createSpool } from '../src/spool.js'
test('a completed manifest survives a crash before database success', async (t) => {
  const { spoolDir } = await makeDiskFixture(t)
  const id = '00000000-0000-4000-8000-000000000001'
  const spool = createSpool(spoolDir, { fault: (stage) => {
    if (stage === 'manifest_committed') throw new Error('simulated crash')
  } })
  await assert.rejects(spool.commitOutput(id, { bytes: Buffer.from('result'), mime: 'image/png' }))
  const recovered = await createSpool(spoolDir).readOutput(id)
  assert.equal(recovered.bytes.toString(), 'result')
})
```

- [ ] Run `npm --prefix server test -- test/spool.test.js`; expect missing spool.
- [ ] Implement atomic file increment with actual fsync:

```js
const file = await open(tempPath, 'wx', 0o600)
try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
await rename(tempPath, finalPath)
const directory = await open(jobDirectory, 'r')
try { await directory.sync() } finally { await directory.close() }
```

- [ ] Use job-private directories mode0700; reject symlinks/path traversal and validate all UUIDs. Commit image first, then versioned JSON manifest `{jobId,digest,mime,size}` via the same fsync/rename sequence, then fsync directory. `readOutput` requires complete manifest, exact matching digest/type/size and limits; file existence alone is not success. Input write is durable before DB acceptance; orphan input on rejected acceptance is removed or swept. Output read/delete and startup sweep are serialized against active worker writes. Never remove a live accepted input merely because directory mtime is old.
- [ ] Add faults before image rename, after image rename/before manifest, after manifest/before caller; ENOSPC, truncated/corrupt manifest/image, orphan/temp cleanup, symlink UUID directory, and idempotent deletion. Faults retain evidence for reconciliation; no re-dispatch.
- [ ] Run the same test command; expect pass.
- [ ] Commit:

```bash
git add server/src/spool.js server/test/spool.test.js
git commit -m "feat(relay): persist verifiable output manifests"
```

## Task 11: Add one fixed-profile OpenAI edit adapter

**Files:** Create `server/src/providers/openaiEdits.js`, `server/test/openaiEdits.test.js`.

**Interfaces:** Produces `createOpenAiEdits({apiKey,fetchImpl=fetch,timeoutMs=120000}):{edit({sourceBytes,prompt,profile,signal}):Promise<{bytes:Buffer,mime:'image/png'}>}`. No retry middleware/SDK defaults. Consumes frozen server profile; target is hard-coded `https://api.openai.com/v1/images/edits`. `paidEnabled` gate is checked before the worker calls this adapter.

- [ ] Write red timeout/no-retry test:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAiEdits } from '../src/providers/openaiEdits.js'
test('a failed paid request is attempted once, without fallback', async () => {
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async () => {
    calls += 1; throw new Error('socket closed with secret response')
  } })
  await assert.rejects(provider.edit({ sourceBytes: Buffer.from('source'), prompt: 'Change ink',
    profile: { id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst', size: '1024x1024',
      quality: 'medium', outputFormat: 'png' } }), { code: 'provider_uncertain' })
  assert.equal(calls, 1)
})
```

- [ ] Run `npm --prefix server test -- test/openaiEdits.test.js`; expect missing adapter.
- [ ] Build one multipart request, server-only key/profile:

```js
const form = new FormData()
form.set('model', profile.model)
form.set('prompt', prompt)
form.set('n', '1')
form.set('size', profile.size)
form.set('quality', profile.quality)
form.set('output_format', 'png')
form.set('image[]', new Blob([sourceBytes], { type: 'image/png' }), 'source.png')
const response = await fetchImpl('https://api.openai.com/v1/images/edits', {
  method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal,
})
```

- [ ] Combine provider timeout and shutdown signal; never expose key in query. Bound response stream to 16 MiB before JSON/base64 decode; require exactly one `data` item, strict nonempty base64 result ≤8 MiB, decoded PNG ≤ fixed output profile, then validate with sharp. Do not follow a returned external URL. Explicit provider rejection maps to sanitized `provider_rejected` but retains quota because dispatch occurred; timeout/network/malformed successful response maps `provider_uncertain`. No raw response in logs/errors. Service-resolved model/profile, not user attribution, becomes provenance.
- [ ] Add success multipart assertions (one image/n1/profile), arbitrary model/URL rejection, 429/5xx, abort, oversized/malformed JSON, returned URL instead of bytes, two outputs, fake PNG, and exactly-one-call for each failure. Recheck official edits parameters immediately before implementing; if model capability changed, stop for profile/design adjustment, not silent provider substitution.
- [ ] Run the same test command; expect pass with stubbed fetch only.
- [ ] Commit:

```bash
git add server/src/providers/openaiEdits.js server/test/openaiEdits.test.js
git commit -m "feat(relay): add single-attempt OpenAI edits"
```

## Task 12: Reconcile crashes, run jobs, and enforce retention

**Files:** Create `server/src/worker.js`, `server/test/worker.test.js`, `server/test/recovery.test.js`, `server/test/retention.test.js`.

**Interfaces:** Consumes Repository, Spool and provider contracts. Produces `createImageWorker({repo,spool,provider,paidEnabled,now=Date.now,log=()=>{}}):{start():Promise<void>,runOnce():Promise<boolean>,cleanup():Promise<void>,stop():Promise<void>}`. One service/worker instance with one persistent volume; startup recovery completes before accepting/claiming work.

- [ ] Write red no-redispatch recovery test:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createImageWorker } from '../src/worker.js'
test('startup promotes a valid manifest without calling the provider', async () => {
  const job = { id: 'job', state: 'running' }
  let paidCalls = 0
  const transitions = []
  const repo = { listInternal: () => [job], transition: (...args) => transitions.push(args),
    expire: () => [], scrub: () => {}, claimNext: () => null }
  const spool = { readOutput: async () => ({ bytes: Buffer.from('saved'), digest: 'd', mime: 'image/png', size: 5 }),
    removeInput: async () => {}, sweep: async () => ({ removed: 0, errors: [] }) }
  const worker = createImageWorker({ repo, spool, provider: { edit: async () => { paidCalls += 1 } },
    paidEnabled: false, now: () => 1_800_000_000_000 })
  await worker.start(); await worker.stop()
  assert.equal(paidCalls, 0)
  assert.equal(transitions[0][2], 'succeeded')
})
```

- [ ] Run `npm --prefix server test -- test/worker.test.js test/recovery.test.js test/retention.test.js`; expect missing worker.
- [ ] Implement recovery loop before any claims:

```js
for (const job of repo.listInternal()) {
  if (!['dispatching', 'running'].includes(job.state)) continue
  const output = await spool.readOutput(job.id)
  if (output) {
    repo.transition(job.id, job.state, 'succeeded', {
      result: { digest: output.digest, mime: output.mime, size: output.size },
      completedAt: now(), expiresAt: now() + 86_400_000,
    })
  } else {
    repo.transition(job.id, job.state, 'outcome_unknown', { errorCode: 'provider_uncertain' })
  }
}
```

- [ ] `runOnce`: recheck enabled gate, claim dispatching durably, read input, transition running, call provider once, commit spool manifest, then DB succeeded. After manifest persistence faults, leave state for safe reconciliation; after pre-manifest uncertainty mark outcome_unknown; never automatic retry. Remove source file once terminal. Preserve quota for any dispatched error. Accepted input expires before deletion. Cleanup removes acked/expired output and prompt-bearing recovery metadata, retains minimal tombstones and reports only safe failure codes; retries file cleanup on startup/periodic one-minute timer. Timers do not dispatch new work after stop/disabled gate.
- [ ] Use real temp DB/spool tests for crash before/after claim, after image rename, after manifest, database write failure, corrupt files, cancelled accepted work, outcome_unknown freeing active slot but charging daily quota, clock advance/input24h/output24h/tombstone7d, cleanup failure/retry, and disabled worker not dispatching queued work.
- [ ] Run all three test files; expect pass and provider-call counts prove no duplicate attempt.
- [ ] Commit:

```bash
git add server/src/worker.js server/test/worker.test.js server/test/recovery.test.js server/test/retention.test.js
git commit -m "feat(relay): reconcile without paid retries"
```

## Task 13: Expose owner-checked HTTP routes without caching

**Files:** Create `server/src/http.js`, `server/src/main.js`, `server/test/helpers.js`, `server/test/http.test.js`, `server/test/admission.test.js`, `server/test/privacy.test.js`; modify `src/sw/swStrategy.js`, `public/sw.js`, `src/test/swStrategy.test.js`.

**Interfaces:** Produces `createRelayServer({config,verifyOwner,repo,spool,worker,now=Date.now,log=()=>{}}):http.Server`; safe serialization `publicJob(job):PublicImageJob`. The seven approved endpoints use owner checks on every route. Browser SW adds `pathname` to `swStrategy` input and bypasses `/v1/image-capabilities` and `/v1/image-jobs` including descendants before cache-first logic.

- [ ] Write red HTTP ownership/no-store test:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestRelay } from './helpers.js'
test('anonymous requests fail before their image body is accepted', async (t) => {
  const relay = await startTestRelay(t)
  const response = await fetch(`${relay.url}/v1/image-jobs`, { method: 'POST', body: 'not multipart' })
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(relay.providerCalls(), 0)
})
```

- [ ] Run `npm --prefix server test -- test/http.test.js test/admission.test.js test/privacy.test.js`; expect missing HTTP/test helper.
- [ ] Establish authenticated header admission timestamp before consuming bytes:

```js
const headersArrivedAt = now()
const owner = await verifyOwner({ authorization: req.headers.authorization })
res.setHeader('Cache-Control', 'no-store')
// Body reader is called only for authenticated POST submission.
const { request, sourceBytes } = await readBoundedMultipart(req, { deadlineMs: 30_000, maxBytes: 8 * 1024 * 1024 })
const requestHash = hashRequest(request, sourceBytes)
const known = repo.findRequest(owner.ownerId, req.headers['idempotency-key'])
```

- [ ] Set no-store on **all responses including early errors** before auth. Known key checks hash and returns existing accepted/terminal job without provider/profile reselection. Unseen key checks timestamp against header arrival, enabled gate/quota/profile, validates image, saves input, atomically accepts and returns202. If acceptance fails clean that job's orphan input; do not release someone else's existing reservation. Return clock errors with serverTime. Authenticated GET caps returns serverTime/current fixed profile/quota; recent list max50; safe status/result/ack/delete query owner each time. Result requires unexpired unacknowledged succeeded manifest; result response has safe MIME/length/digest header, no-store, no public URL. Ack repeatably records receipt and deletes output/prompt recovery payload, with durable deletion intent so failed cleanup retries. DELETE returns conflict for dispatching/running/uncertain jobs, cancels accepted only, discards completed bytes without releasing its quota.
- [ ] CORS accepts exact configured origins, explicit methods/Authorization/Idempotency-Key, exposes result digest, never `*` with credentials. Reject unsupported method, unknown endpoint, invalid/encoded path IDs and oversized headers safely. Configure request/header deadlines and connection limits; production runbook requires ingress8MiB/30sec too. Logs whitelist opaque job ID/state/duration/error code and hashed owner correlation. `main.js` uses startup recovery then bind, handles SIGTERM stop; default disabled paid mode does not dispatch work or print secrets. No health endpoint with configuration dump.
- [ ] Add endpoint-by-endpoint other-owner tests, expired output410, idempotent ack, storage-save failure leaves server result, future/stale/known keys, body finishes beyond5min but admitted in-window, UTC clock jump, forbidden origin, no raw prompt/token/provider strings in captured logs, delete races and same-origin SW bypass test. Run relay suite and SW tests; expect pass.
- [ ] Commit:

```bash
git add server/src/http.js server/src/main.js server/test/helpers.js server/test/http.test.js server/test/admission.test.js server/test/privacy.test.js src/sw/swStrategy.js public/sw.js src/test/swStrategy.test.js
git commit -m "feat(relay): serve private recoverable image jobs"
```

## Task 14: Journal exact prepared browser inputs before upload

**Files:** Create `src/data/imageJobs/pendingJobs.js`, `src/data/imageJobs/prepareSource.js`, `src/test/pendingImageJobs.test.js`, `src/test/prepareRefinementSource.test.js`; modify `src/backend/purge.js`.

**Interfaces:** Produces `createPendingJobs({indexedDB=globalThis.indexedDB,now=Date.now}={}):{put(record),get(ownerId,requestId),list(ownerId),markAccepted(ownerId,requestId,jobId),remove(ownerId,requestId),clearAll(),expire()}` (all async); `prepareRefinementSource(blob):Promise<{blob:Blob,digest:string,previewUrl:string}>`; prepared Blob uses PNG, preserves alpha/orientation, capped8MiB/16MP. `previewUrl` is ephemeral, never journaled; caller revokes it. Journal retains request/snapshot after acceptance but nulls source bytes.

- [ ] Write red byte-for-byte journal test:

```js
import { expect, it } from 'vitest'
import { Blob } from 'node:buffer'
import { createPendingJobs } from '../data/imageJobs/pendingJobs'
it('keeps exact bytes and deletes input only after acceptance', async () => {
  const journal = createPendingJobs()
  const record = { requestId: 'v1.1800000000000.00000000-0000-4000-8000-000000000001', ownerId: 'A',
    source: new Blob(['exact original bytes'], { type: 'image/png' }), sourceImageDigest: 'a'.repeat(64),
    request: { version: 1, operation: 'refine', profileId: 'openai-refine-v1', change: 'પ્રીતેશ', keep: 'Ink', palette: 'colour', prompt: 'shown' },
    destination: { ownerId: 'A', conceptId: 'c', parentVariantId: null, draftRevision: 1 },
    createdAt: 1_800_000_000_000, jobId: null, accepted: false }
  await journal.put(record)
  expect(await (await journal.get('A', record.requestId)).source.text()).toBe('exact original bytes')
  expect(await journal.get('B', record.requestId)).toBeNull()
  await journal.markAccepted('A', record.requestId, 'job')
  expect((await journal.get('A', record.requestId)).source).toBeNull()
})
```

- [ ] Run `npx vitest run src/test/pendingImageJobs.test.js src/test/prepareRefinementSource.test.js`; expect missing modules.
- [ ] Implement transaction-completion journaling, not request-success-only promises:

```js
const tx = db.transaction('pending', 'readwrite')
tx.objectStore('pending').put(record, `${record.ownerId}:${record.requestId}`)
await new Promise((resolve, reject) => {
  tx.oncomplete = resolve
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error || new Error('Journal transaction aborted'))
})
```

- [ ] Use DB `sable-image-jobs-v1`, close connections on versionchange; restrict get/list/mutate to passed owner; failed journal persistence blocks send. Purge clears all transient pending inputs on identity change, keeping library canonical data. Expire only unconfirmed source-bearing records after24h, keep accepted recovery marker until terminal/import/expiry; no network/resubmission in cleanup. Input preparation uses decoded raster only and `createImageBitmap` orientation-correct drawing to a transparent canvas, PNG `toBlob`, dimensions/byte checks, SHA-256. Never fetch arbitrary URL automatically: caller supplies explicitly selected image bytes using existing canonical resolver and readable image/export errors. Reuse saved prepared bytes/digest on retry rather than URL/canvas regeneration.
- [ ] Add failed/aborted IDB write, owner switching, persisted Blob across reopen, non-ASCII request text, source changed after preparation, alpha/orientation browser case, malformed input and expired inputs. Use real browser tests for canvas semantics jsdom cannot prove.
- [ ] Run the same test command; expect pass.
- [ ] Commit:

```bash
git add src/data/imageJobs/pendingJobs.js src/data/imageJobs/prepareSource.js src/test/pendingImageJobs.test.js src/test/prepareRefinementSource.test.js src/backend/purge.js
git commit -m "feat(concepts): journal exact refinement inputs"
```

## Task 15: Add neutral authenticated relay transport

**Files:** Create `src/data/imageJobs/relayClient.js`, `src/test/relayClient.test.js`.

**Interfaces:** Consumes auth token getter and PendingImageJob; produces `createRelayClient({baseUrl,auth,fetchImpl=fetch,now=Date.now}):{capabilities(),submit(pending),list(),status(jobId),result(jobId),ack(jobId),discard(jobId),serverNow()}`. All network methods async. `result` returns `{blob,digest}`; `submit` returns PublicImageJob. Config absent/offline auth gives disabled capabilities without fetching. Only configured fixed relay base URL; no model/provider/key argument.

- [ ] Write red refresh/stable retry test:

```js
import { expect, it, vi } from 'vitest'
import { createRelayClient } from '../data/imageJobs/relayClient'
it('refreshes auth once while preserving the request key and source bytes', async () => {
  const auth = { getAccessToken: vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('fresh') }
  const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'job', state: 'accepted' }), { status: 202 }))
  const client = createRelayClient({ baseUrl: 'https://relay.example', auth, fetchImpl })
  const pending = { requestId: 'stable-key', source: new Blob(['exact']), request: { operation: 'refine' } }
  await client.submit(pending)
  expect(fetchImpl.mock.calls.map(([, options]) => options.headers['Idempotency-Key'])).toEqual(['stable-key', 'stable-key'])
  expect(auth.getAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true })
  expect(await fetchImpl.mock.calls[1][1].body.get('image').text()).toBe('exact')
})
```

- [ ] Run `npx vitest run src/test/relayClient.test.js`; expect missing client.
- [ ] Build multipart from frozen pending input on each transport attempt:

```js
const body = new FormData()
body.set('request', canonicalRequest(pending.request))
body.set('image', pending.source, 'source.png')
const token = await auth.getAccessToken()
const response = await fetchImpl(`${baseUrl}/v1/image-jobs`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': pending.requestId },
  body, cache: 'no-store', credentials: 'omit',
})
```

- [ ] Every endpoint gets current token and bounded response handling; exactly one explicit SDK refresh after401, never after403/providerfailure. A network submission error returns `acceptance_unknown` and leaves journal/key untouched; no automatic submit loop. Accepted markers use status/result only. Calibrate `serverNow` using capabilities serverTime and request midpoint; `key_clock_skew` recalibrates but **does not** silently replace existing key. Definitively expired unaccepted key requires explicit confirm before Task16 prepares a new key. Clock jumping after submission cannot mutate existing ID. Validate safe job/profile/result shape before using it, bound8MiB results, verify digest with SubtleCrypto, reject external result URLs. The red fixture above must use the full valid shared request/job shape once validation is added.
- [ ] Add null local token (nofetch), token failure, 401twice,403norefresh, no public/demo URL, timeoutexactkey, statusonlyafteraccepted, clockjump, malformedresults/digestmismatch and sanitized errors.
- [ ] Run the same test command; expect pass.
- [ ] Commit:

```bash
git add src/data/imageJobs/relayClient.js src/test/relayClient.test.js
git commit -m "feat(concepts): authenticate relay transport"
```

## Task 16: Orchestrate guarded recovery and acknowledge verified imports

**Files:** Create `src/hooks/useConceptRefinement.js`, `src/test/useConceptRefinement.test.jsx`; modify `src/App.jsx` and `src/pages/Concepts.jsx` for the checked commit, shared backup and relay dependencies.

**Interfaces:** Consumes transport/journal/preparation/checked import/persistence; produces `useConceptRefinement({ownerId,ownerScope,concepts,commitConcepts,blobs,relay,journal}):{state,openSource(destination,blob),setDraft(fields),submit({storageWarningAccepted}),recover(),importRecovered(jobId,conceptId),retryUnaccepted({confirmed}),discard(jobId),close()}` and `importAndAcknowledge({commit,ack,jobId}):Promise<ConceptCommitReceipt>`. State includes captured source/draftRevision/job/status/result/comparison/error/recoverable jobs. State machine has no provider-key access. Closing UI never implies cancelling accepted work.

- [ ] Write red owner/save/ack ordering test with dependency seams explicitly injected:

```js
import { expect, it, vi } from 'vitest'
import { importAndAcknowledge } from '../hooks/useConceptRefinement'
it('keeps a completed relay result recoverable when checked save fails', async () => {
  const commit = vi.fn().mockRejectedValue(Object.assign(new Error('Full'), { code: 'storage_full' }))
  const ack = vi.fn()
  await expect(importAndAcknowledge({ commit, ack, jobId: 'job' })).rejects.toMatchObject({ code: 'storage_full' })
  expect(ack).not.toHaveBeenCalled()
})
```

- [ ] Run `npx vitest run src/test/useConceptRefinement.test.jsx`; expect missing hook/export.
- [ ] Export the small tested ordering function without weakening its receipt check:

```js
export async function importAndAcknowledge({ commit, ack, jobId }) {
  const receipt = await commit()
  if (receipt?.committed !== true || receipt.variantId !== variantIdForJob(jobId)) {
    throw imageJobError('commit_unverified', 409)
  }
  await ack(jobId)
  return receipt
}
```

- [ ] Wire submit: validate draft/source/identity/destination and `commitConcepts.supported`; request caps and persistence warning; allocate key at online submission from calibrated time/cryptoUUID; prepare once, journal completed transaction, then send. Check owner epoch/concept/source/draft revision after every await, including immediately before ack and before publishing success. On202 mark accepted and remove source bytes; status polling uses bounded backoff and stops on unmount/signout/terminal. Unknown acceptance offers same-key retry/reconcile only. Disable double-click while preparing/submitting; server active quota protects separate tabs. Keep newer draft unchanged on job completion.
- [ ] Recovery on login/reload lists journal + service recent jobs, never auto-submits. Saved marker means known destination; missing marker or deleted concept requires explicit destination choice. Fetch/validate result, checked import deterministic variant, then ack. If ack fails after save keep marker and offer reconciliation; reimport dedupes. A foreign/new identity cannot download/write/register/display A results. A removed parent retains child and displays unavailable lineage; changed Best/rating/notes are preserved. Cleanup orphan local blob only after owner check and proving canonical record has no reference, otherwise leave for explicit recovery.
- [ ] Add hook tests for journalfailure noPOST, stablebytesreload, drafteditwhilepending, conceptdelete/chooseother, logoutduringprepare/status/download/commit, two-tab repeatedimport, checkedquotafailure noack, savedthenackfailure no duplicate, unknownoutcome newpaidconfirm, close-notcancel, and persistence warning not blocking manual fallback. `importAndAcknowledge` test uses valid job UUID/receipt fixtures for success path.
- [ ] Run hook plus checked-import/relay-client tests; expect pass.
- [ ] Commit:

```bash
git add src/hooks/useConceptRefinement.js src/test/useConceptRefinement.test.jsx src/App.jsx src/pages/Concepts.jsx
git commit -m "feat(concepts): recover and verify refinements"
```

## Task 17: Add inline refinement, manual fallback and comparison UI

**Files:** Create `src/components/RefinementComposer.jsx`, `src/components/RefinementCompare.jsx`; modify `src/pages/Concepts.jsx`, `src/components/ConceptViewer.jsx`, `src/components/ConceptVariantLab.jsx`, `src/components/ConceptBackupStatus.jsx`, `docs/06-concepts.md`, `docs/07-backup-and-settings.md`, `src/pages/Help.jsx`; create `src/test/RefinementComposer.test.jsx`, `src/test/RefinementCompare.test.jsx`; extend `src/test/ConceptsVariants.test.jsx`, `src/test/drawerStacking.test.jsx`, `src/test/a11yAffordances.spec.js`.

**Interfaces:** Produces `RefinementComposer({state,capabilities,persistence,onDraftChange,onSubmit,onCopyPrompt,onExportSource,onImportVariation,onRecover,onClose})` and `RefinementCompare({original,variant,parentAvailable,onMarkBest,onRate,onTryOn})`. Viewer/lab callback is `onRefine({conceptId,parentVariantId,imageUrl})`; original parent=null. No paid action on text-only variants. ConceptBackupStatus consumes shared backup summary/action from Task6.

- [ ] Write red composer disclosure/fallback test:

```js
import { expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RefinementComposer from '../components/RefinementComposer'
it('keeps manual actions when paid capability is unavailable', () => {
  const copy = vi.fn()
  render(<RefinementComposer state={{ draft: { change: 'More mist', keep: 'Temple', palette: 'colour' },
    sourcePreview: '/source.png', status: 'draft' }} capabilities={{ enabled: false }}
    persistence="unavailable" onCopyPrompt={copy} onClose={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Generate one variation' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Copy refinement prompt' }))
  expect(copy).toHaveBeenCalledOnce()
  expect(screen.getByText(/does not attach the image/i)).toBeInTheDocument()
})
```

- [ ] Run `npx vitest run src/test/RefinementComposer.test.jsx src/test/RefinementCompare.test.jsx`; expect missing UI.
- [ ] Add fallback controls inside existing dialog-focus/drawer pattern:

```jsx
<p className="font-v2-ui text-sm text-v2-muted">Copying the prompt does not attach the image. Export it separately.</p>
<button type="button" className="min-h-11 px-4 focus-visible:outline-2" onClick={onCopyPrompt}>
  Copy refinement prompt
</button>
<button type="button" className="min-h-11 px-4 focus-visible:outline-2" onClick={onExportSource}>
  Export source image
</button>
```

- [ ] Add Change/Keep/palette labels, exact prepared preview/compiled prompt, provider/profile/paid disclosure and consent before upload; do not send boards/bodyphotos/artistportfolio implicitly. Include current provider privacy-policy link without claiming zero retention. Empty source/read-failure offers explicit file selection, never silent remote fetch. Manual export downloads actual selected/prepared bytes; import uses decoded raster validation and explicit user provider label with user-import provenance. Clipboard copies real compiled text only. Neither missing persistence nor missing relay blocks manual paths.
- [ ] Mount recovery/status above inline variant lab, preserve source/draft on error and show uncertain/expired/disabled distinctions. Side-by-side comparison at desktop, stacked phone; original untouched, recorded missing parent labelled unavailable. Existing rating/Best/try-on actions work on saved variant. Extend only new controls to44px; don't redesign old unrelated pages. Use `useDialogFocus`/topmost check so Escape closes one drawer; closing doesn't label job cancelled. Show backup indicator and same full-library export action.
- [ ] Add tests for original/variant/text-only entrypoints, no relay on publicdemo, colour no contradictory monochrome instruction, draftretention, providerdisclosure, visiblefocus, unavailablelineage, Best/rating/try-on, copyactualtext/exportseparatebytes, importvalidation and existing directgeneration untouched.
- [ ] Pin removed-parent display without removing the child image:

```jsx
it('labels a missing source without hiding the saved variation', () => {
  render(<RefinementCompare original={null} parentAvailable={false}
    variant={{ id: 'child', imageUrl: '/child.png', title: 'Mist variation', parentVariantId: 'deleted' }}
    onMarkBest={() => {}} onRate={() => {}} onTryOn={() => {}} />)
  expect(screen.getByText('Source image unavailable')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Mist variation' })).toHaveAttribute('src', '/child.png')
})
```
- [ ] Run composer/compare plus existing ConceptsVariants/drawer/a11y suites; expect pass. Update guides/Help text in this task's UI commit; screenshots and architectural proof follow Task19 before completion.
- [ ] Commit:

```bash
git add src/components/RefinementComposer.jsx src/components/RefinementCompare.jsx src/pages/Concepts.jsx src/components/ConceptViewer.jsx src/components/ConceptVariantLab.jsx src/components/ConceptBackupStatus.jsx docs/06-concepts.md docs/07-backup-and-settings.md src/pages/Help.jsx src/test/RefinementComposer.test.jsx src/test/RefinementCompare.test.jsx src/test/ConceptsVariants.test.jsx src/test/drawerStacking.test.jsx src/test/a11yAffordances.spec.js
git commit -m "feat(concepts): add inline image refinement"
```

## Task 18: Prove browser recovery and fresh-context backups offline

**Files:** Create `e2e/refinement.e2e.js`, `e2e/refinement.desktop.e2e.js`, `e2e/refinement.manual.e2e.js`, `e2e/refinementFixtures.js`, `e2e/fixtures/fakeSupabaseAuth.js`, `playwright.refinement.config.js`, `vite.refinement.config.js`; modify `package.json`, `.github/workflows/ci.yml`, `e2e/README.md`.

**Interfaces:** Produces `openRefinementFixture(page):Promise<void>` (fictional concept/source plus fake real-auth owner), stub relay routes via Playwright interception, and separate `npm run test:e2e:refinement`. Vite test-only alias replaces the Supabase adapter **only in this config** with fake SDK-managed token adapter; production config has no injectable bypass. Existing offline/public demo browser config remains separate.

- [ ] Write the first red browser test using new fixture:

```js
import { test, expect } from '@playwright/test'
import { openRefinementFixture } from './refinementFixtures.js'
test('reload recovery imports once and acknowledges only after canonical save', async ({ page }) => {
  await openRefinementFixture(page)
  await page.getByRole('button', { name: 'Refine this' }).first().click()
  await page.getByLabel('Change').fill('Add mist around the temple')
  await page.getByRole('button', { name: 'Generate one variation' }).click()
  await page.reload()
  await expect(page.getByText('Variation saved')).toBeVisible()
  const variants = await page.evaluate(() => JSON.parse(localStorage.getItem('tattoo_remote_fixture-owner_concepts'))[0].variants)
  expect(variants).toHaveLength(1)
  expect(variants[0].imageUrl).toMatch(/^user\/fixture-owner\/concepts\//)
})
```

- [ ] Run `npm run test:e2e:refinement`; expect missing script/config/fixture initially.
- [ ] Add isolated fake auth module and alias with hard production separation:

```js
// vite.refinement.config.js only; regular vite.config.js never reads this alias.
resolve: { alias: {
  [fileURLToPath(new URL('./src/backend/supabase/supabaseAuth.js', import.meta.url))]:
    fileURLToPath(new URL('./e2e/fixtures/fakeSupabaseAuth.js', import.meta.url)),
} }
```

- [ ] Create fake caps/job/status/result routes with PNG fixtures generated locally, count POST/ack, simulate lost202 thenreplay, reload, failedcanonicalsave, logout, conceptdeletion, expiredresults, disabledcapabilities and provideruncertainty. Outgoing paid OpenAI origins abort; no real Supabase connection. Assertions at ack inspect canonical owner rows and IDB bytes, not just page text. Add two-tab submit/import, orientation/alpha and mobile overflow/focus/Escape tests. Fresh browser context imports JSON download with source context closed/cleared, asserts embeddedpaidimage visible offline and metadata preserved; external references remain labelled. Download test asserts “requested”, never “verified”. Default demo test checks manual fallback and existing generation route/keys unchanged.
- [ ] Add CI service install/test and refinement browser job using only fixture env, no secrets; existing public tests still run with local auth/empty relay. Ensure `server/node_modules` is excluded from root ESLint default ignores or explicit config. Validate production bundle contains no fake-token string/test fixture module.
- [ ] Run `npm run test:e2e:refinement` and `npm run test:e2e`; expect all scenarios pass on mobile+desktop/root+subpath. A fake iPhone Chromium viewport is not the real Safari/home-screen activation test.
- [ ] Commit:

```bash
git add e2e/refinement.e2e.js e2e/refinement.desktop.e2e.js e2e/refinement.manual.e2e.js e2e/refinementFixtures.js e2e/fixtures/fakeSupabaseAuth.js playwright.refinement.config.js vite.refinement.config.js package.json .github/workflows/ci.yml e2e/README.md
git commit -m "test(concepts): prove browser refinement recovery"
```

## Task 19: Synchronize guides, diagrams and activation gate; verify the branch

**Files:** Modify `docs/06-concepts.md`, `docs/07-backup-and-settings.md`, `docs/MAINTAINING.md`, `docs/ARCHITECTURE.md`, `docs/USER-WORKFLOWS.md`, `docs/README.md`, `src/pages/Help.jsx`, `CLAUDE.md`; create `docs/RELAY-ACTIVATION.md`, `server/README.md`, `scripts/captureRefinementGuide.mjs`, `src/test/refinementDocs.test.js`; recapture `public/guide/concepts.png`, `public/guide/concept-card.png`, `public/guide/settings.png`; add `public/guide/concept-refinement.png`, `public/guide/concept-refinement-compare.png` with matching references.

**Interfaces:** Documentation reflects built/tested feature behavior; deployment remains proposed/unactivated. Existing Help `SECTIONS` has matching user guide copy/screenshots. Capture script uses fictional artwork plus fake auth/service config, never portfolio/private/paid assets. Runbook is an approval checklist, not a provisioning script.

- [ ] Create `src/test/refinementDocs.test.js` with these local docs invariants:

```js
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
it('documents manual fallback, durability limits and deferred activation', () => {
  const concepts = readFileSync('docs/06-concepts.md', 'utf8')
  const activation = readFileSync('docs/RELAY-ACTIVATION.md', 'utf8')
  expect(concepts).toContain('Copy refinement prompt')
  expect(concepts).toContain('Export source image')
  expect(activation).toContain('15-minute')
  expect(activation).toContain('separate approval')
})
```

- [ ] Run `npx vitest run src/test/refinementDocs.test.js`; expect missing checklist/copy.
- [ ] Add actual guide wording:

```markdown
### Refine a saved image

Choose **Refine this**, describe **Change** and **Keep**, and choose black ink or colour.
Review the selected image and outgoing prompt. A private enabled relay can request
one paid variation; the public demo uses **Copy refinement prompt**, **Export source
image**, and **Import variation**. Copying text does not attach an image.

Paid results stay recoverable on the relay for 24 hours until Sable verifies a
local save and acknowledges it. A committed local save is not an off-device backup.
An export request starts a download; check the file was saved before relying on it.
```

- [ ] Update architecture component/sequence diagrams for publicoffline vs privateauthlocal, ownerJWT/relay/SQLite/spool/provider boundaries, preparedjournal→accept→spoolmanifest→checkedimport→ack, same-keyrecovery and uncertainoutcome. Label host/deployment unactivated, existingBYOKroutes unchanged. Update user workflows including manualfallback, deletion/destchoice and portablebackup. Keep diagrams truthful to implemented interfaces, not future reference/lettering features. Mermaid syntax checked by existing script.
- [ ] Write activation checklist with named host/account/region/cost approval, TLS/privateorigin/persistentdisk permissions/encryption/backups, Node SQLite release-candidate acceptance, ingress8MiB/30sec, asymmetric Supabase keys/issuer/aud/algorithm/fixedJWKS/owner, signups+anonymousoff, issuediat/exp≤900sec, ownerlibrarygate, Freeplanpausesmanualrecovery vs separatelyapprovednonpausingplan, provideraccess/key/profile/currentpricing+spendcontrols, retentioncleanup, no-store/SW, privateinstalledPWA iPhoneSafari/home-screenstoragecheck, portablebackupimport and one explicitly approved livepaidrequest. No keepawake traffic/automation/upgrade is created. Disable procedure: stop service (new submissions/undispatched jobs stop), optionally restart with paidEnabledfalse for recovery endpoints; wait out tokenTTL/revoke refresh sessions appropriately, do not promise revocation/cancellation of dispatched work.
- [ ] Capture screenshots per MAINTAINING using real mobile context 430 × 920 and desktop 1280 × 900, viewport-only, synthetic images. Start the test-only refinement preview at port4181; reuse the actual fixture setup before capture:

```js
import { chromium } from 'playwright'
import { openRefinementFixture } from '../e2e/refinementFixtures.js'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 920 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await openRefinementFixture(page)
  await page.getByRole('button', { name: 'Refine this' }).first().click()
  await page.screenshot({ path: 'public/guide/concept-refinement.png', fullPage: false })
} finally { await browser.close() }
```

- [ ] Execute verification commands with offline configuration; record exact pass counts/results in handoff, not stale historical counts:

```bash
npm test
npm run test:relay
npm run lint
npm run docs:check
VITE_BACKEND=local VITE_AUTH_BACKEND=local VITE_AI_RELAY_URL= VITE_PRIVATE_OWNER_ID= VITE_BASE=/ npm run build
VITE_BACKEND=local VITE_AUTH_BACKEND=local VITE_AI_RELAY_URL= VITE_PRIVATE_OWNER_ID= VITE_BASE=/sable/ npm run build -- --outDir dist-sable
npm run test:e2e
npm run test:e2e:refinement
git diff --check
```

- [ ] Verify every referenced guide image exists, no stale screenshot filenames, privatefakeauth absentproductionbundle, serversecrets absentbrowserassets, testenvnotrealaccount. Review complete branch with a fresh reviewer using the user's selected execution approach. Do not export repository source to Claude or another external CLI without new explicit payload permission; prior approval covered a spec-only review.
- [ ] Commit only the named docs/artifacts after verification:

```bash
git add docs/06-concepts.md docs/07-backup-and-settings.md docs/MAINTAINING.md docs/ARCHITECTURE.md docs/USER-WORKFLOWS.md docs/README.md src/pages/Help.jsx CLAUDE.md docs/RELAY-ACTIVATION.md server/README.md scripts/captureRefinementGuide.mjs src/test/refinementDocs.test.js public/guide/concepts.png public/guide/concept-card.png public/guide/settings.png public/guide/concept-refinement.png public/guide/concept-refinement-compare.png
git commit -m "docs(concepts): explain refinement and recovery"
```

  Offer merge/push/activation choices only after tests/review; do not infer them from this plan approval.

## Dependency order and acceptance map

Tasks 1→2 define wire/saved contracts. 3→4 establish identity; 2+4→5 establishes checked save; 5→6 makes local durability usable. Service chain is 1→7→8→9→10→11→12→13 (10 and11 are individually reviewable but execution order remains explicit). Browser chain 1+4→14, 3+13+14→15, 2+5+6+14+15→16, then17→18→19. No future reference or lettering editor is a dependency.

| Approved requirement | Task(s) / verification |
|---|---|
| Real auth independent of storage, invite-only/owner gating, demo isolation | 3,4,7; adapter/gate/namespace tests, default Pages fixture env |
| Exact outgoing image/prompt, Unicode, palette, manual fallback | 1,14,17,18; contract/canvas/component/browser tests |
| Stable bytes/ID, admission clock, replay/conflict/profile freeze | 8,9,13,14,15; hash/window/body-delay/clock tests |
| Atomic quota, one worker, no hidden retries/uncertain billing | 9,11,12; concurrency/provider-count/crash tests |
| Durable spool/restart recovery/privacy cleanup | 10,12,13; fault injection/corruption/expiry/log tests |
| Owner checks all endpoints/cache/SW | 4,7,13,16; foreign-owner, late-cache and logout-boundary tests |
| Checked image+record save before ack, deterministic import | 2,5,16,18; quota/readback/ack/two-tab tests |
| Persistence status/honest backup/fresh-origin restore | 6,18; denied API/materialization/download/fresh-context tests |
| Inline comparison, rating/Best/try-on, original retained | 2,16,17,18; metadata/parentdelete/draft/userflow tests |
| Existing BYOK generation unchanged, relay generate rejected | 1,3,11,17,18; strict contract/legacy browser assertions |
| Guides/Help/screenshots/architecture/workflows | 17,19; docs invariants/Mermaid/image audit |
| Separate live activation and operational limits | 19; unactivated checklist, no provisioning/live calls |

## Plan self-review and audit receipt

The approved spec, not the completed unrelated `.ijfw/state/workflow.json` or `.ijfw/memory/brief.md` (both convention-winners work), is the authoritative brief. Do not overwrite those artifacts or the older design-pass sentinel as part of this feature.

Before handoff, review this document against the full spec, scan for unresolved instructions, verify every consumed interface has a producer, and trace all five Review Focus cases to tests. No execute/ship claim follows merely from planning. Any discovered gap is fixed in this document before the user selects execution.

Audit completed 2026-09-28 against the approved spec:

```text
Plan audit: 19 tasks reviewed
Goal alignment:   19 trace to approved criteria / 0 need attention
Scope:            clean; refinement foundation only
Risk surface:     explicit auth, storage, paid-dispatch and activation gates
Dependency order: correct; all consumed interfaces have preceding producers
Verdict: PASS for user plan review, not authorization to activate or ship
```

Corrections made during review: existing test suffix/casing, worker-only list contract moved before its consumer, exact file footprints, disabled real-auth demo/owner seeding, keyed identity remounts/transition revisions, cross-tab checked-write serialization, Settings' device-vs-cloud copy, and explicit late-cache/UTC-midnight/missing-parent tests. The acceptance map above covers every first-slice section; the five Review Focus conditions have named owning tests.

Rollback boundary: all product changes are isolated on the implementation branch; default paid service is disabled, public builds remain offline, no canonical data is destructively migrated, and no real infrastructure is touched. Service test cleanup targets only freshly generated temporary directories. If private storage/backup tests fail, retain relay output and withhold acknowledgement; do not work around the failure by extending retention or silently moving to cloud sync.

## Technical source checks (2026-09-28)

- [Node SQLite docs](https://nodejs.org/api/sqlite.html): `DatabaseSync` is available and synchronous; SQLite is currently release-candidate stability. Keep operations short on this single-owner service and record explicit production acceptance rather than calling it universally stable.
- [jose remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) and [JWT verification](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md): maintained signature/claim verification with configured issuer/audience and bounded fixed-endpoint resolver. npm metadata checked `6.2.12` without installation.
- [sharp constructor](https://sharp.pixelplumbing.com/api-constructor/): decoded pixel limits and strict decoder options. npm metadata checked `0.35.5` without installation; full decode tests complement header checks.
- [Supabase changelog](https://supabase.com/changelog), [sessions API](https://supabase.com/docs/reference/javascript/auth-getsession), [JWT guidance](https://supabase.com/docs/guides/auth/jwts): checked auth-related breaking notices; self-hosted/SAML URL changes are not this hosted SDK/password-auth slice. No schema mutation or SDK upgrade is planned.
- [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation) and [model reference](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst): edits use image multipart and byte results; fixed candidate profile requires fresh account/model/pricing approval at activation, not a plan-time paid call.

## Execution handoff

User review of this plan and execution-method selection are required before code work.

- **Subagent-driven (recommended):** fresh implementer/reviewer gates per task, then a whole-branch review. These 19 tasks include paid dispatch, ownership isolation and acknowledgement ordering where a shipped mistake could lose an image or purchase work twice.
- **Native:** one implementer executes the full plan, with one fresh whole-branch reviewer at the end. Lower context cost and quicker coordination, but no independent per-task gate.

Either method keeps hosting/account changes, paid activation, merge and push behind separate explicit instructions.
