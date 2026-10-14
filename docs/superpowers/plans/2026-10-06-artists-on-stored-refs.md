# Artists on Stored Image Refs (PR 5a, #116) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Artist state holds exactly what is stored (image refs: static paths, `{ key }`, `{ url, addedAt }`), and photos resolve at the leaf, so offline starts, reloads and cross-device pulls can never drop or duplicate a photo by construction.

**Architecture:** The artists codec stops resolving: `toDisplay` becomes (almost) the identity, `initial()` paints real refs at once, and the engine's `onEdit` hook normalises whatever a producer emitted (registered display URLs, `{ key }`, duplicates) into refs at the edit boundary. The two things the old display build did besides resolving URLs get explicit homes: the owner's `DEFAULT_ARTISTS` starter photos are unioned into stored rows by `applyDefaults`, and legacy IndexedDB-only photos stay as one small display overlay until #118 retires them. Components already render refs through `ArtistImage`/`useImageSrc` (#135); `ArtistDetail` renders per-ref tiles from `useImageSrc` status instead of `photoSlots`. The Taste Engine is re-keyed by `refIdentity` in a new DB.

**Tech Stack:** React 19, Vitest 5 + Testing Library + fake-indexeddb, the collection sync engine (`src/sync/collectionStore.js`), Playwright e2e (CI).

**Spec:** GitHub issue #109 (epic, section "PR 5a — Flip artists to refs"), issue #116, and this plan's "Decisions" section where it deliberately differs. Prior art already on `main`: #135 (resolver + `useImageSrc`), #136 (key-first identity), #137 (backup v2), #138 (`useImageBytes`).

## Global Constraints

- Imports from `react-router`, never `react-router-dom`. Tailwind v4 names: `rounded-xs`, `backdrop-blur-xs`, `outline-hidden`; hover-hidden controls use `can-hover:opacity-0 group-hover:opacity-100`.
- TDD: write the failing test, watch it fail for the right reason, then implement. `npm test` is pinned to the local backend.
- Tests live in `src/test/`; Vitest only. Never touch `DEFAULT_ARTISTS` content (the owner's curated taste); the data-integrity tests must stay green.
- The persisted data format does NOT change: stored artist rows keep today's canonical form. No data migration. The flip must be revert-safe.
- Commit messages: terse conventional (`feat(artists): …`), **no attribution trailers** (no `Co-Authored-By`, no `Claude-Session`). Reference `#116` with "part of" until the final PR.
- Every Gemini call keeps the key in the `x-goog-api-key` header (untouched here, but do not regress `geminiKeyHeader.test.js`).
- Never `import` a vendor SDK outside `src/backend/`. `@huggingface/transformers` stays dynamic-import only (`styleIndex.test.js` enforces it).
- Image paths stay base-relative in stored data; never add `BASE_URL` to seed data (a data test enforces it).
- Keep the user docs in step: `docs/`, `src/pages/Help.jsx`, and `CLAUDE.md`'s storage paragraph (`.claude/rules/docs-sync.md`).
- `README.md` states the suite's test and file counts and `src/test/readmeClaims.test.js` enforces the file count: update both numbers from a real full run.
- Work in a worktree off `origin/main` (never branch-switch the main checkout). Remove only your own worktree afterwards.

## Review Focus

Failure modes the epic implies but no single task's happy path exercises, most likely first. Each has a pinning test in the task named.

1. **Offline start with an uncached `{ key }`**: the ref must stay in state at its position, nothing is pushed stripped, and the tile reads "Available when online" (not blank, not a monogram letter, and not flashing that message while an online resolve is still in flight). Task 3 (state + tile), Task 4 (loading state).
2. **Removing a starter photo must stick**: delete a `DEFAULT_ARTISTS` photo, reload, pull: it must not come back (tombstone × the new union in `applyDefaults`). Task 2.
3. **The same photo twice** under different spellings (`{ key }` plus the registered data URL it was staged as; migration refs plus a hydrated copy; `/images/x` vs `images/x`): exactly one survives, in the first position. Task 3.
4. **A photo that can't be made a ref**: an unregistered inline data URL (a failed stage) must not be persisted (base64 never reaches localStorage) and must not make an edit throw; the legacy IndexedDB-only photo must keep displaying and must not vanish when the artist's images are edited. Task 3.
5. **Taste vectors for photos that can't be resolved right now**: skipped, not thrown, coverage counts them as un-embedded; a new session with a *new signed URL* for the same key must not re-embed. Task 1.

## Decisions this plan makes (confirm or change before executing)

These differ from, or settle gaps in, the epic text. Each is called out because a reviewer could reasonably choose otherwise.

- **D1. Starter photos become stored refs for the owner.** `DEFAULT_ARTISTS`' static photos were display-only (appended by `buildArtists`) but were already persisted opportunistically the moment an artist's images were edited. They now live in stored rows via `applyDefaults` (owner-only, tombstone-aware, de-duplicated by identity). Alternative: keep a display overlay. Rejected: it keeps a second representation alive.
- **D2. Legacy IndexedDB-only photos keep a narrow display overlay until #118.** The sweep that retires them is #118's design (it must not duplicate already-migrated photos). Until then `toDisplay` prepends un-keyed legacy data URLs exactly as `buildArtists` did. It is hardened over the old behaviour (agy review): the overlay is **idempotent** (a legacy photo already in `images` is not added again) and `onEdit` **refreshes the in-memory copy of the legacy cache** (`imageMap[id]`) as it writes it, so a legacy photo the user deleted cannot be re-shown by a later `toDisplay`. State holds legacy photos as inline data URLs; persisting strips them, as before.
- **D3. `ArtistImage`'s #82 expiry-retry stays until #117, not deleted here.** The epic lists it under 5a, but ideas and concepts still hold display URLs and rely on `refreshedBlobUrl`'s reverse map; deleting it now would regress their expired-URL recovery. It is deleted with `keyForUrl`/`refreshedBlobUrl` in 5b.
- **D4. Producers keep emitting what they emit.** `stageImage` still returns a display URL registered to the staged key (ideas/concepts need that until #117), so artist producers (`AddArtistModal`, `QuickAddArtist`, `Gallery`, `Wall` drop, `ArtistDetail` upload) are not rewritten; `onEdit` converts at the boundary. The `stageImage` contract change moves to 5b.
- **D5. An unregistered inline data URL no longer shows for the session.** Previously a failed/unsigned stage showed the data URL until reload (then it was gone from persisted data anyway). `withStagedImages` already refuses to commit a failed stage and the app always has a user (even the local backend), so this is unreachable in normal use; `normalizeArtistImages` keeps such an entry in memory rather than dropping it, and persistence still strips it.
- **D6. Photo counts now include offline photos** (`images.length`, "N with photos", the ranking queue). Intended by the epic. Small surfaces (avatars, thumbnails) show a monogram for an unavailable photo; only `ArtistDetail` shows the full "Available when online" tile.
- **D7. Two PRs, not one.** PR A (Task 1, Taste Engine re-key) is independent and ships first. It is behaviour-equivalent to today while state still holds display strings (a display URL's identity is `url:<url>`, exactly as unstable as the old URL key; static paths and `{ key }` refs already key stably) and starts saving the per-session re-embedding the moment PR B lands. PR B (Tasks 2-6) is the flip and is one atomic change.

## Execution notes

- **Node on this Mac:** Homebrew's `node` is broken (see the memory note `reference_node_vanishes_mid_session`). Run tools as `N=/Users/pritesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node; $N node_modules/vitest/vitest.mjs run <files> --maxWorkers=2` and `$N node_modules/eslint/bin/eslint.js . --max-warnings=0`; `npm ci --ignore-scripts` via `$N /usr/local/lib/node_modules/npm/bin/npm-cli.js`. Do NOT use ChatGPT.app's node (it rejects native add-ons). On a machine with a working node, use `npm test` / `npm run lint` instead.
- **Long runs:** use the Bash tool's `run_in_background` for the full suite, not `nohup`.
- **Flaky specs:** a single-file failure in a full run is suspect; rerun it isolated, and let CI arbitrate (see CLAUDE.md "Flaky under the full parallel run").
- **Before merging each PR:** CI green, then the cross-model reviews (`codex exec --sandbox read-only …`, `agy --print …` with the diff pasted; both read-only, ≤5 findings, verify each against the code). If codex is rate-limited, say so on the PR.
- **WIP commits are fine inside Task 3** (the repo squash-merges); only the task's final state must be green.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/data/styleIndex.js` | modify | vectors keyed by `refIdentity`, DB `tattoo-style-index-v2`, resolve each ref before embedding, drop v1 |
| `src/data/embeddings.js` | modify | `getVec` receives a ref; new `vectorLookup(vectors)` helper |
| `src/components/{SimilarArtists,TasteMap,ConceptVisualMatches,AddArtistModal,QuickAddArtist}.jsx` | modify | use `vectorLookup(vectors)` instead of `(src) => vectors.get(src)` |
| `src/data/artistsPolicy.js` | modify | `canonicalizeImages({ keepInline })`, `dedupeRefs`, `normalizeArtistImages`, `withStarterPhotos` in `applyDefaults`, identity `toDisplay`, real-ref `initial()`, `onEdit` normalisation; delete the display build |
| `src/data/legacyArtistImages.js` | modify | `withLegacyLocalPhotos` (the D2 overlay) |
| `src/hooks/useArtistStorage.js` | modify | drop re-exports of deleted functions |
| `src/components/PhotoTile.jsx` | create | one carousel tile, status-aware (ready / loading / unavailable) |
| `src/components/ArtistDetail.jsx` | modify | render refs through `PhotoTile`; delete slots/unresolved state |
| `src/components/ArtistImage.jsx` | modify | `loading` shows an empty box, not the monogram letter |
| `src/data/offlineImages.js` | delete | `photoSlots` / `fromSlots` |
| `e2e/tastemap.e2e.js` | modify | seed `tattoo-style-index-v2` by identity |
| `CLAUDE.md`, `docs/ARCHITECTURE.md`, `README.md` | modify | storage paragraph, offline-photo + style-index sections, counts |

---

# PR A

### Task 1: Taste Engine keyed by photo identity

Today vectors are keyed by display URL: with Supabase, a signed URL changes every session, so every photo is re-embedded every session, and an uncached key is silently skipped. Key them by `refIdentity` (stable across sessions, key-first, base-independent), resolve each ref just before embedding, and use a new DB so no key-format migration is needed (vectors are derivable).

**Files:**
- Modify: `src/data/styleIndex.js`, `src/data/embeddings.js`
- Modify: `src/components/SimilarArtists.jsx`, `TasteMap.jsx`, `ConceptVisualMatches.jsx`, `AddArtistModal.jsx`, `QuickAddArtist.jsx`
- Modify: `e2e/tastemap.e2e.js`; fixtures in `src/test/{styleIndex,embeddings,SimilarArtists,TasteMap,galleryTasteMap,ConceptVisualMatches,AddArtistModal,QuickAddArtist}.test.*`
- Create: `src/test/styleIndexIdentity.test.js`

**Interfaces:**
- Consumes: `refIdentity(ref) → string|null`, `resolveImage(ref) → Promise<string>` (`''` when unavailable), `EMBEDDING_MODEL_ID`, `getEmbedder()`.
- Produces:
  - `loadVectors(artists) → Promise<Map<identity, number[]>>` (key is `refIdentity(image)`).
  - `buildStyleIndex(artists, { onProgress }) → Promise<Map<identity, number[]>>`.
  - `getVec(image) → number[]|null` — **callers' `getVec` now receives the stored ref**, not a URL string.
  - `vectorLookup(vectors: Map) → (image) => number[]|null` exported from `embeddings.js`.

- [ ] **Step 1: Write the failing tests** — create `src/test/styleIndexIdentity.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const embed = vi.fn(async (src) => [String(src).length, 1])
vi.mock('../data/embedder', () => ({
  EMBEDDING_MODEL_ID: 'test-model',
  getEmbedder: async () => embed,
}))
const getUrl = vi.fn()
vi.mock('../backend', () => ({ backend: { blobs: { getUrl: (...a) => getUrl(...a) } } }))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { loadVectors, buildStyleIndex, clearStyleIndex } = await import('../data/styleIndex')

const artist = (images) => ({ id: 'a', images })

beforeEach(async () => {
  await clearStyleIndex()
  clearBlobUrls()
  embed.mockClear()
  getUrl.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('style index keyed by photo identity (#116)', () => {
  it('embeds a static photo once, keyed by its identity', async () => {
    const artists = [artist(['images/artists/a/1.jpg'])]
    await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledWith('/images/artists/a/1.jpg')
    expect([...(await loadVectors(artists)).keys()]).toEqual(['path:/images/artists/a/1.jpg'])
  })

  it('embeds a blob-key photo from its resolved url, and does not re-embed it when next session signs a new url', async () => {
    const artists = [artist([{ key: 'user/u1/artists/a/1.jpg' }])]
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=1')
    await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledTimes(1)
    expect(embed).toHaveBeenCalledWith('https://signed.example/a?t=1')

    clearBlobUrls() // a new session
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=2')
    const vectors = await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledTimes(1)
    expect(vectors.has('key:user/u1/artists/a/1.jpg')).toBe(true)
  })

  it('still works while state holds a display url string (before the flip): keyed by that url', async () => {
    const artists = [artist(['https://signed.example/a?t=1'])]
    await buildStyleIndex(artists)
    expect(embed).toHaveBeenCalledWith('https://signed.example/a?t=1')
    expect([...(await loadVectors(artists)).keys()]).toEqual(['url:https://signed.example/a?t=1'])
  })

  it('skips a photo it cannot resolve, keeps going, and still finishes its progress', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    const onProgress = vi.fn()
    const artists = [artist([{ key: 'user/u1/artists/a/gone.jpg' }, 'images/artists/a/2.jpg'])]
    const vectors = await buildStyleIndex(artists, { onProgress })
    expect(embed).toHaveBeenCalledTimes(1)
    expect(embed).toHaveBeenCalledWith('/images/artists/a/2.jpg')
    expect([...vectors.keys()]).toEqual(['path:/images/artists/a/2.jpg'])
    expect(onProgress).toHaveBeenLastCalledWith({ done: 2, total: 2 })
  })

  it('opens the v2 database and removes the legacy v1 one', async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('tattoo-style-index-v1', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('vectors')
      req.onsuccess = () => { req.result.close(); resolve() }
      req.onerror = () => reject(req.error)
    })
    await loadVectors([artist(['images/a.jpg'])])
    await vi.waitFor(async () => {
      const names = (await indexedDB.databases()).map((d) => d.name)
      expect(names).toContain('tattoo-style-index-v2')
      expect(names).not.toContain('tattoo-style-index-v1')
    })
  })
})
```

Add to `src/test/embeddings.test.js` (inside its existing top-level describe, or as a new `describe`):

```js
it('hands getVec the stored ref, not a url (#116)', () => {
  const seen = []
  const getVec = (image) => { seen.push(image); return [1, 0] }
  const ref = { key: 'user/u1/a.jpg', addedAt: 'x' }
  artistCentroids([{ id: 'a', images: [ref, 'images/b.jpg'] }], getVec)
  expect(seen).toEqual([ref, 'images/b.jpg'])
})

it('vectorLookup maps an image to its vector by identity', () => {
  const vectors = new Map([['path:/images/b.jpg', [0, 1]], ['key:user/u1/a.jpg', [1, 0]]])
  const get = vectorLookup(vectors)
  expect(get('images/b.jpg')).toEqual([0, 1])
  expect(get({ key: 'user/u1/a.jpg', addedAt: 'x' })).toEqual([1, 0])
  expect(get('images/missing.jpg')).toBeNull()
})
```
(add `vectorLookup` to that file's import from `../data/embeddings`).

- [ ] **Step 2: Run to verify they fail**

Run: `$N node_modules/vitest/vitest.mjs run src/test/styleIndexIdentity.test.js src/test/embeddings.test.js --maxWorkers=2`
Expected: FAIL — vectors keyed by URL (`/images/artists/a/1.jpg`, not `path:…`), `vectorLookup` is not a function, no `v2` database.

- [ ] **Step 3: Implement `styleIndex.js`.** Replace the constants, `vecKey`, `collectSrcs`, `loadVectors`, `buildStyleIndex`, and the `clearStyleIndex` name constant:

```js
import { refIdentity } from './imageRef'
import { resolveImage } from './imageResolver'
import { EMBEDDING_MODEL_ID, getEmbedder } from './embedder'

// v2 keys vectors by photo identity (refIdentity), not by display URL: a signed
// url changes every session, so the v1 index re-embedded every photo each time
// (#116). Vectors are derivable, so v1 is simply dropped.
const DB_NAME = 'tattoo-style-index-v2'
const LEGACY_DB_NAME = 'tattoo-style-index-v1'
const STORE = 'vectors'
```
In `openDB()`, inside `req.onsuccess` after `resolve(...)`:
```js
req.onsuccess = (e) => {
  resolve(e.target.result)
  indexedDB.deleteDatabase(LEGACY_DB_NAME) // fire and forget; vectors are derivable
}
```
Then:
```js
const vecKey = (identity) => `${EMBEDDING_MODEL_ID}:${identity}`

// identity -> the ref it came from (first seen), in collection order.
function collectRefs(artists) {
  const refs = new Map()
  for (const artist of artists) {
    for (const image of artist.images || []) {
      const id = refIdentity(image)
      if (id && !refs.has(id)) refs.set(id, image)
    }
  }
  return refs
}

// Map of photo identity → vector for every already-indexed photo.
export async function loadVectors(artists) {
  const ids = [...collectRefs(artists).keys()]
  const rows = await dbGetMany(ids.map(vecKey))
  const out = new Map()
  for (const id of ids) {
    const vec = rows.get(vecKey(id))
    if (vec) out.set(id, vec)
  }
  return out
}

export async function buildStyleIndex(artists, { onProgress } = {}) {
  const refs = collectRefs(artists)
  const existing = await loadVectors(artists)
  const missing = [...refs].filter(([id]) => !existing.has(id))
  const total = refs.size
  let done = total - missing.length
  onProgress?.({ done, total })
  if (!missing.length) return existing

  const embed = await getEmbedder()
  for (const [id, ref] of missing) {
    try {
      // Resolved here, not stored: a photo that can't be fetched right now is
      // skipped and picked up by a later build.
      const src = await resolveImage(ref)
      if (src) {
        const vec = await embed(src)
        await dbPut(vecKey(id), vec)
        existing.set(id, vec)
      }
    } catch (e) {
      console.error('[tattoo] style-index embed failed:', id, e)
    }
    done++
    onProgress?.({ done, total })
  }
  return existing
}
```
Delete the `getImageUrl` import and the old `collectSrcs`. Update the file's header comment (keyed by `${modelId}:${identity}`).

- [ ] **Step 4: Implement `embeddings.js`.** Drop the `getImageUrl` import; add `import { refIdentity } from './imageRef'`:

```js
const artistVectors = (artist, getVec) =>
  (artist.images || []).map((image) => getVec(image)).filter(Boolean)

// A getVec over a loadVectors() map: the vector for a photo, by identity.
export const vectorLookup = (vectors) => (image) => vectors.get(refIdentity(image)) || null
```
and in `indexCoverage` use `if (getVec(image)) embedded++`. Update the header comment: callers inject `getVec(image) → vector|null`.

- [ ] **Step 5: Update the five callers.** In each file import `vectorLookup` from `../data/embeddings` and replace the local `getVec`:
  - `SimilarArtists.jsx:42` `const getVec = (src) => vectors.get(src) || null` → `const getVec = vectorLookup(vectors)`
  - `ConceptVisualMatches.jsx:31` same replacement.
  - `AddArtistModal.jsx:214` and `QuickAddArtist.jsx:153`: `buildTasteVector(artists, (s) => vectors.get(s) || null)` → `buildTasteVector(artists, vectorLookup(vectors))`.
  - `TasteMap.jsx`: wherever `vectors.get(` is called with a src, use `vectorLookup(vectors)` (search the file; the layout call is `layoutTasteMap(artists, getVec, …)`).

- [ ] **Step 6: Update test fixtures to identity keys.** In `TasteMap.test.jsx`, `SimilarArtists.test.jsx`, `galleryTasteMap.test.jsx`, `ConceptVisualMatches.test.jsx`, `AddArtistModal.test.jsx`, `QuickAddArtist.test.jsx`, `styleIndex.test.js` replace URL-keyed vector maps, e.g.

```js
// before
const vectors = new Map([['/a1.jpg', [1, 0, 0]], ['/b1.jpg', [0, 1, 0]]])
// after
import { refIdentity } from '../data/imageRef'
const vectors = new Map([[refIdentity('/a1.jpg'), [1, 0, 0]], [refIdentity('/b1.jpg'), [0, 1, 0]]])
```
`styleIndex.test.js` assertions about `${model}:${url}` keys become `${model}:${refIdentity(url)}` and the DB name `tattoo-style-index-v2`.

- [ ] **Step 7: Update `e2e/tastemap.e2e.js`** (browser job, run by CI). The seeding block opens `tattoo-style-index-v1` and writes keys `${model}:${new URL(src, location.origin).pathname}`. Change to:

```js
const request = indexedDB.open('tattoo-style-index-v2', 1)
// …
// stored static paths are base-relative; identity is base-independent:
.put(vector(artist, image), `${model}:path:/${String(src).replace(/^\//, '')}`)
```

- [ ] **Step 8: Run the affected tests, then lint**

Run: `$N node_modules/vitest/vitest.mjs run src/test/styleIndexIdentity.test.js src/test/styleIndex.test.js src/test/embeddings.test.js src/test/taste.test.js src/test/tasteMap.test.js src/test/TasteMap.test.jsx src/test/SimilarArtists.test.jsx src/test/galleryTasteMap.test.jsx src/test/ConceptVisualMatches.test.jsx src/test/AddArtistModal.test.jsx src/test/QuickAddArtist.test.jsx --maxWorkers=2`
Expected: PASS. Then `$N node_modules/eslint/bin/eslint.js . --max-warnings=0` — clean.

- [ ] **Step 9: Docs.** `CLAUDE.md` (device-local list) and `docs/ARCHITECTURE.md` (the style-index paragraph that names `tattoo-style-index-v1`): v1 → v2, "keyed by model id and photo identity". Run the full suite in the background, set `README.md`'s counts from the result (`suite is N Vitest tests across M files`), rerun `src/test/readmeClaims.test.js`.

- [ ] **Step 10: Commit and open PR A**

```bash
git add -A
git commit -m "feat(taste): key style-index vectors by photo identity (part of #116)"
```
PR title `feat(taste): key style-index vectors by photo identity`; body: the per-session re-embedding it removes, the v1 drop, the deferred async-resolve item from #114 now done, "Part of #116". Let CI (incl. e2e `tastemap`) run; do not merge without the owner's approval.

---

# PR B

### Task 2: Starter photos live in stored rows (`applyDefaults`)

The owner's `DEFAULT_ARTISTS` photos are appended to display by `buildArtists`. Move that union into `applyDefaults` (owner-only by construction: it is only called when `ctx.owner`), de-duplicated by identity and honouring tombstones, so the flip in Task 3 has nothing left to merge at display time. This task is additive and green on its own (`buildArtists` already de-dupes, so nothing doubles).

**Files:**
- Modify: `src/data/artistsPolicy.js` (`applyDefaults`, new exported helpers; use `refIdentity` from `imageRef`)
- Create: `src/test/starterPhotos.test.js`

**Interfaces:**
- Consumes: `refIdentity` from `./imageRef` (key-first, base-independent) — **replaces the file's private `refIdentity`**.
- Produces:
  - `dedupeRefs(refs: Ref[]) → Ref[]` (first occurrence wins; identity-less entries kept).
  - `withStarterPhotos(images: Ref[], starters: string[], removedImages: {ref}[]) → Ref[]` (returns the **same array** when nothing is added).
  - `applyDefaults(artists)` — also unions starters into rows that have a default.

- [ ] **Step 1: Write the failing tests** — `src/test/starterPhotos.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

vi.mock('../data/artists', async (importOriginal) => ({
  ...(await importOriginal()),
  DEFAULT_ARTISTS: [
    { id: 'd1', handle: 'd1', name: '', tags: [], rank: 1, images: ['images/artists/d1/1.jpg', 'images/artists/d1/2.jpg'] },
  ],
}))

const { applyDefaults, dedupeRefs, withStarterPhotos } = await import('../data/artistsPolicy')

describe('starter photos in stored rows (#116)', () => {
  it('appends the starter photos after the artist’s own', () => {
    const [row] = applyDefaults([{ id: 'd1', handle: 'd1', rank: 1, images: [{ key: 'user/u1/own.jpg' }] }])
    expect(row.images).toEqual([{ key: 'user/u1/own.jpg' }, 'images/artists/d1/1.jpg', 'images/artists/d1/2.jpg'])
  })

  it('does not duplicate a starter that is already there under another spelling', () => {
    const [row] = applyDefaults([{ id: 'd1', handle: 'd1', rank: 1, images: ['/images/artists/d1/1.jpg'] }])
    expect(row.images).toEqual(['/images/artists/d1/1.jpg', 'images/artists/d1/2.jpg'])
  })

  it('never re-adds a starter the artist removed (tombstone)', () => {
    const [row] = applyDefaults([{
      id: 'd1', handle: 'd1', rank: 1, images: ['images/artists/d1/2.jpg'],
      removedImages: [{ ref: 'images/artists/d1/1.jpg', removedAt: '2026-01-01T00:00:00Z' }],
    }])
    expect(row.images).toEqual(['images/artists/d1/2.jpg'])
  })

  it('returns the same array when every starter is already present (no churn)', () => {
    const images = ['images/artists/d1/1.jpg', 'images/artists/d1/2.jpg']
    expect(withStarterPhotos(images, images, [])).toBe(images)
  })

  it('leaves an artist with no default untouched', () => {
    const row = { id: 'other', handle: 'o', rank: 2, images: ['x.jpg'] }
    expect(applyDefaults([row]).find((a) => a.id === 'other')).toBe(row)
  })

  it('dedupeRefs keeps the first of two spellings of one photo', () => {
    expect(dedupeRefs([{ key: 'user/u1/a.jpg' }, 'images/b.jpg', { key: 'user/u1/a.jpg', addedAt: 'x' }, '/images/b.jpg']))
      .toEqual([{ key: 'user/u1/a.jpg' }, 'images/b.jpg'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `$N node_modules/vitest/vitest.mjs run src/test/starterPhotos.test.js --maxWorkers=2`
Expected: FAIL — `dedupeRefs`/`withStarterPhotos` are not functions; `applyDefaults` leaves `images` as stored.

- [ ] **Step 3: Implement** in `artistsPolicy.js`. Delete the private `refIdentity` function and `import { refIdentity } from './imageRef'`. Add the helpers above `applyDefaults` and extend it:

```js
export function dedupeRefs(refs = []) {
  const seen = new Set()
  return refs.filter((ref) => {
    const id = refIdentity(ref)
    if (!id) return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

// DEFAULT_ARTISTS' static photos are the owner's starter gallery. They go after
// the artist's own photos, never twice, and never back in once removed (#55).
export function withStarterPhotos(images = [], starters = [], removedImages = []) {
  const have = new Set(images.map(refIdentity).filter(Boolean))
  const doomed = new Set(removedImages.map((t) => refIdentity(t.ref)).filter(Boolean))
  const add = starters.filter((s) => {
    const id = refIdentity(s)
    return id && !have.has(id) && !doomed.has(id)
  })
  return add.length ? [...images, ...add] : images
}
```
In `applyDefaults`'s first `map`, after the field-fill loop:
```js
const images = withStarterPhotos(a.images, def.images, a.removedImages)
if (images !== a.images) out.images = images
return out
```
(`out` is `{ ...a }` already filled with missing fields; ensure `images` absent → `a.images` is `undefined`, so `withStarterPhotos(undefined, …)` uses the default `[]` and `out.images` is set.)

- [ ] **Step 3b: Fix tombstone code that used the old private `refIdentity`** — `removedImageTombstones`, `mergeTombstones`, `applyImageTombstones`, `buildArtists`, `onEdit` all call the same name; with the import in place they use the new key-first, base-independent identity. Run the photo-resurrection tests to confirm:

Run: `$N node_modules/vitest/vitest.mjs run src/test/photoResurrection.test.jsx src/test/artistsPolicy.test.js src/test/starterPhotos.test.js --maxWorkers=2`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/artistsPolicy.js src/test/starterPhotos.test.js
git commit -m "feat(artists): starter photos live in stored rows via applyDefaults (part of #116)"
```

---

### Task 3: Flip the artists codec — state holds refs

The atomic change: identity codec, real-ref first paint, `onEdit` normalisation, the D2 legacy overlay, per-ref tiles in `ArtistDetail`, and deletion of the display build. Intermediate steps are red; commit WIP freely, the final state must be green.

**Files:**
- Modify: `src/data/artistsPolicy.js`, `src/data/legacyArtistImages.js`, `src/hooks/useArtistStorage.js`, `src/components/ArtistDetail.jsx`
- Create: `src/components/PhotoTile.jsx`, `src/test/artistRefsState.test.jsx`
- Delete: `src/data/offlineImages.js`
- Rewrite: `src/test/{artistsPolicy,offlineImageRefs,offlinePlaceholders,stagedPhotos,useArtistStorage,wallPersistence,photoResurrection}.test.*` and the `buildArtists` mention in `blobUrlExpiry.test.js` (table in Step 9)

**Interfaces:**
- Consumes: `dedupeRefs`, `withStarterPhotos` (Task 2), `useImageSrc(ref) → { src, status }` (`'ready'|'loading'|'unavailable'|'none'`), `OfflinePhoto`, `ArtistImage`.
- Produces:
  - `canonicalizeImages(images, { keepInline = false })` — with `keepInline`, an unregistered `data:` URL is kept instead of dropped.
  - `normalizeArtistImages(images) → Ref[]` = `dedupeRefs(canonicalizeImages(images, { keepInline: true }))`.
  - `canonicalizeArtist(a) → { …a, images: canonicalizeImages(a.images) }` (persisted form; no `unresolvedImages`).
  - `withLegacyLocalPhotos(artist, idbImages) → artist` in `legacyArtistImages.js`.
  - `<PhotoTile image label isCover onOpen onSetCover onRemove />`.

- [ ] **Step 1: Write the failing state tests** — `src/test/artistRefsState.test.jsx`. Reuse the harness from `src/test/offlineImageRefs.test.jsx` (`wrapper`, `seedReturningUser`, `goOffline`, `stateRow`, `cachedRow`, `KEY`, `firstId`); copy those helpers into this file. Tests:

```js
import { dbPut } from '../data/legacyArtistImages'
import { registerBlobUrl } from '../data/blobUrls'
// …plus the harness imports/helpers copied from offlineImageRefs.test.jsx
// (renderHook/act/waitFor, useArtistStorage, wrapper, seedReturningUser, goOffline,
//  mount, stateRow, cachedRow, noDuplicates, KEY, firstId, DEFAULT_ARTISTS, backend)

const edit = (result, change) =>
  act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId ? change(a) : a))))

describe('artist state holds refs (#116)', () => {
  it('keeps an uncached { key } in state at its position, offline, from the first paint', async () => {
    seedReturningUser()
    goOffline()
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())
    // no hydration wait: the ref is in the very first published value
    expect(stateRow(result, firstId).images[0]).toEqual({ key: KEY })
    expect(stateRow(result, firstId).images.length).toBeGreaterThan(1) // starters follow
    expect(stateRow(result, firstId)).not.toHaveProperty('unresolvedImages')
  })

  it('converts a registered display url a producer emitted into { key } at the edit', async () => {
    seedReturningUser({ ownPhoto: false })
    const result = await mount()
    registerBlobUrl('user/u1/artists/zoia/new.jpg', 'data:image/png;base64,NEW')
    edit(result, (a) => ({ ...a, images: [...a.images, 'data:image/png;base64,NEW'] }))
    expect(stateRow(result, firstId).images.at(-1)).toEqual({ key: 'user/u1/artists/zoia/new.jpg' })
    expect(localStorage.getItem('tattoo_artists_meta')).not.toContain('data:image')
  })

  it('keeps one copy when an edit adds a photo under a second spelling, first position wins', async () => {
    seedReturningUser()
    const result = await mount()
    const starter = stateRow(result, firstId).images.find((i) => typeof i === 'string')
    edit(result, (a) => ({ ...a, images: [...a.images, { key: KEY, addedAt: 'x' }, `/${starter}`] }))
    const images = stateRow(result, firstId).images
    expect(images[0]).toEqual({ key: KEY })
    expect(images.filter((i) => i?.key === KEY)).toHaveLength(1)
    expect(images.filter((i) => i === starter || i === `/${starter}`)).toHaveLength(1)
    noDuplicates(images)
  })

  it('an unregistered inline data url stays on screen but is never persisted', async () => {
    seedReturningUser({ ownPhoto: false })
    const result = await mount()
    edit(result, (a) => ({ ...a, images: [...a.images, 'data:image/png;base64,INLINE'] }))
    expect(stateRow(result, firstId).images).toContain('data:image/png;base64,INLINE')
    expect(localStorage.getItem('tattoo_artists_meta')).not.toContain('INLINE')
  })

  it('shows a legacy IndexedDB-only photo (the D2 overlay) and keeps it when another photo is added', async () => {
    seedReturningUser({ ownPhoto: false })
    await dbPut(firstId, ['data:image/png;base64,LEGACY'])
    const result = await mount()
    expect(stateRow(result, firstId).images[0]).toBe('data:image/png;base64,LEGACY')

    edit(result, (a) => ({ ...a, images: [...a.images, 'images/artists/extra.jpg'] }))
    expect(stateRow(result, firstId).images[0]).toBe('data:image/png;base64,LEGACY')
    expect(localStorage.getItem('tattoo_artists_meta')).not.toContain('LEGACY')
  })
})

// Policy-level: the D2 overlay is idempotent and a deleted legacy photo stays deleted.
describe('legacy overlay (D2)', () => {
  it('is idempotent and does not bring a deleted legacy photo back', async () => {
    const { policy, codec } = createArtistsPolicy() // from '../data/artistsPolicy'
    await dbPut('a', ['data:image/png;base64,LEGACY'])
    await policy.onMount()

    const shown = codec.toDisplay([{ id: 'a', images: [] }])
    expect(shown[0].images).toEqual(['data:image/png;base64,LEGACY'])
    expect(codec.toDisplay(shown)[0].images).toEqual(['data:image/png;base64,LEGACY']) // not doubled

    const [edited] = policy.onEdit([shown[0]], [{ ...shown[0], images: [] }], '2026-01-01T00:00:00Z')
    expect(codec.toDisplay([edited])[0].images).toEqual([]) // stays deleted
  })
})
```
(Fill the last test with the real `dbPut(firstId, ['data:image/png;base64,LEGACY'])` from `legacyArtistImages.js`, `mount()`, assertions as commented.)

- [ ] **Step 2: Run to verify they fail**

Run: `$N node_modules/vitest/vitest.mjs run src/test/artistRefsState.test.jsx --maxWorkers=2`
Expected: FAIL — `unresolvedImages` present / first paint has `images: []`, edit keeps the data-URL string, duplicates survive.

- [ ] **Step 3: Implement the data layer in `artistsPolicy.js`.**

`canonicalizeImages` gains the option (change the two `data:` branches):
```js
export function canonicalizeImages(images = [], { keepInline = false } = {}) {
  const out = []
  for (const img of images) {
    if (img && typeof img === 'object') {
      if (img.key) { out.push(img); continue }
      if (typeof img.url === 'string') {
        const key = keyForUrl(img.url)
        if (key) { out.push(img.addedAt ? { key, addedAt: img.addedAt } : { key }); continue }
        if (img.url.startsWith('data:') && !keepInline) continue
        out.push(img.addedAt ? { url: img.url, addedAt: img.addedAt } : img.url)
        continue
      }
      out.push(img)
      continue
    }
    if (typeof img !== 'string') continue
    const key = keyForUrl(img)
    if (key) out.push({ key })
    else if (img.startsWith('data:') && !keepInline) continue
    else out.push(img)
  }
  return out
}

export function normalizeArtistImages(images = []) {
  return dedupeRefs(canonicalizeImages(images, { keepInline: true }))
}

const sameList = (a, b) => Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])

// The persisted form of an artist. State already is this, apart from the D2
// legacy overlay, which persisting strips (inline data urls are never stored).
export function canonicalizeArtist(a) {
  return { ...a, images: canonicalizeImages(a.images) }
}
```
**Delete:** `stripImages`, `unhydrated`, `resolveImageRefs`, `displayFromCanonical`, `mergeStaticImages`, `buildArtists`, and the `resolveBlobKey`/`resolveAssetPath` imports if now unused.

Codec, `initial`, `merge` migration prepend, `onEdit` (replace the existing bodies):
```js
const codec = {
  toCanonical: (v) => v.map(canonicalizeArtist),
  // D2: the only display-only addition until #118 retires the legacy cache.
  toDisplay: (v) => v.map((a) => withLegacyLocalPhotos(a, imageMap[a.id])),
  ensureUploaded: async () => 0,
}

initial(rawCache, ctx) {
  if (!rawCache) return ctx.owner ? DEFAULT_ARTISTS : []
  return ctx.owner ? applyDefaults(rawCache) : rawCache
},
```
In `merge`, the migrated-refs fold-in becomes de-duplicated:
```js
nextMeta = nextMeta.map((a) =>
  byArtist.has(a.id) ? { ...a, images: dedupeRefs([...byArtist.get(a.id), ...(a.images || [])]) } : a
)
```
`onEdit`:
```js
onEdit(prev, stamped, at) {
  const prevById = new Map((prev || []).map((p) => [p?.id, p]))
  return stamped.map((row) => {
    const prevA = prevById.get(row?.id)
    if (!row || (prevA && prevA.images === row.images)) return row
    // Whatever the producer emitted becomes refs here, once (D4).
    const images = normalizeArtistImages(row.images)
    const a = sameList(images, row.images) ? row : { ...row, images }
    cacheImages(a)
    // Keep the in-memory legacy cache in step with what was just written, so a
    // legacy photo the user deleted is not re-shown by a later toDisplay (D2).
    imageMap[a.id] = displayCacheImages(a.images || [])
    if (!prevA) return a
    const liveIds = new Set(a.images.map(refIdentity).filter(Boolean))
    const survivors = (a.removedImages || []).filter((t) => !liveIds.has(refIdentity(t.ref)))
    const fresh = removedImageTombstones(prevA.images, a.images, at)
    if (survivors.length === (a.removedImages || []).length && !fresh.length) return a
    return { ...a, removedImages: [...survivors, ...fresh] }
  })
},
```
`pushDisplay` in `merge` is unchanged (it already canonicalises `display`).

- [ ] **Step 4: Add the overlay** to `legacyArtistImages.js`:
```js
// D2 (#116): a photo that exists only as an un-keyed data url in the legacy
// IndexedDB cache (never migrated) still has to show. Prepended like the old
// buildArtists legacy path; retired by the #118 sweep. A data url that is
// registered to a key is NOT legacy — the local backend resolves every blob to
// one, and showing it as well as its { key } would duplicate the photo.
export function withLegacyLocalPhotos(artist, idbImages) {
  const have = new Set(artist.images || [])
  const legacy = Array.isArray(idbImages)
    ? idbImages.filter((s) => typeof s === 'string' && s.startsWith('data:') && !keyForUrl(s) && !have.has(s))
    : []
  return legacy.length ? { ...artist, images: [...legacy, ...(artist.images || [])] } : artist
}
```
and `import { withLegacyLocalPhotos } from './legacyArtistImages'` in `artistsPolicy.js`.

- [ ] **Step 5: `useArtistStorage.js`** — remove the imports/re-exports of deleted names (`buildArtists`, `displayFromCanonical`, `mergeStaticImages`, `stripImages`; keep `canonicalizeImages`, `removedImageTombstones`, `applyImageTombstones`, `displayCacheImages` re-exports only if a test or consumer still imports them from the hook: `git grep -n "from '../hooks/useArtistStorage'" src` and update those imports to `../data/artistsPolicy`).

- [ ] **Step 6: `PhotoTile.jsx`** (create):

```jsx
import ArtistImage from './ArtistImage'
import OfflinePhoto from './OfflinePhoto'
import useImageSrc from '../hooks/useImageSrc'
import { activateOnKey } from '../a11y/activate'

const frame = (isCover) =>
  `relative snap-center shrink-0 w-[88%] sm:w-[520px] aspect-[4/5] rounded-xs overflow-hidden ${isCover ? 'ring-1 ring-accent' : ''}`

// One photo in the artist's carousel. A photo that can't be fetched right now
// keeps its place as an "Available when online" tile (#102); one still
// resolving is an empty box, never that message.
export default function PhotoTile({ image, label, position, isCover, onOpen, onSetCover, onRemove }) {
  const { status } = useImageSrc(image)
  if (status === 'unavailable') {
    return <div className={frame(isCover)}><OfflinePhoto className="w-full h-full" /></div>
  }
  if (status === 'loading') {
    return <div className={`${frame(isCover)} bg-ink-muted`} aria-busy="true" />
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View image ${position + 1} full screen`}
      onKeyDown={activateOnKey(onOpen)}
      onClick={onOpen}
      className={`${frame(isCover)} bg-ink-muted cursor-pointer`}
    >
      <ArtistImage src={image} label={label} className="w-full h-full object-cover" monogramClassName="text-6xl" loading="lazy" />
      {isCover && (
        <div className="absolute top-3 left-3 bg-accent/80 text-cream text-[0.6875rem] font-mono tracking-widest px-2 py-1 rounded-xs uppercase">Cover</div>
      )}
      <div className="absolute top-3 right-3 flex gap-1.5">
        {!isCover && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetCover() }}
            className="text-[0.6875rem] font-mono text-cream tracking-widest uppercase bg-ink-black/70 hover:bg-ink-black px-2.5 py-1 rounded-xs transition-colors backdrop-blur-xs"
          >Set cover</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="w-7 h-7 flex items-center justify-center text-accent text-xl leading-none bg-ink-black/70 hover:bg-ink-black rounded-xs transition-colors backdrop-blur-xs"
          title="Remove photo"
        >×</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: `ArtistDetail.jsx`.** Remove the imports of `imageSrc` and `photoSlots, fromSlots`; add `import PhotoTile from './PhotoTile'` and `import { refIdentity } from '../data/imageRef'`. Delete the `unresolved`, `unresolvedRef`, `ownsUnresolved` state and `const slots = photoSlots(…)`. Replace the save/remove/cover functions:

```js
function saveImages(newImages) {
  imagesRef.current = newImages
  setImages(newImages)
  onSave(identityRef.current.id, identityRef.current.generation, (current) => ({ ...current, images: newImages }))
}

// Positions are in the one list, offline photos included, so they keep their
// place relative to their neighbours.
function removeImage(pos) {
  if (!window.confirm('Remove this photo?')) return
  saveImages(imagesRef.current.filter((_, i) => i !== pos))
}

function setCover(pos) {
  if (pos === 0) return
  const list = imagesRef.current
  saveImages([list[pos], ...list.filter((_, i) => i !== pos)])
}
```
`handleFiles` becomes `saveImages([...imagesRef.current, ...uploaded])` (unchanged call, one arg). Replace every `slots.length` with `images.length` (the scroll effect, the counter, the dot indicator, the guard around the carousel) and the carousel body with:

```jsx
{images.map((image, pos) => (
  <PhotoTile
    key={`${refIdentity(image) ?? 'photo'}:${pos}`}
    image={image}
    label={artist.name || `@${artist.handle}`}
    position={pos}
    isCover={pos === 0}
    onOpen={() => setLightbox(pos)}
    onSetCover={() => setCover(pos)}
    onRemove={() => removeImage(pos)}
  />
))}
```
The dot indicator maps `images`. The lightbox: `src={images[lightbox]}` (the ref; drop `imageSrc`), and `GeneratedArtworkNotice images={[images[lightbox]]}` is unchanged (it takes refs).

- [ ] **Step 8: Delete `src/data/offlineImages.js`.** `git grep -n "offlineImages" src` must be empty.

- [ ] **Step 9: Rewrite the tests that pinned the old machinery.** Each keeps its *behavioural* intent, asserted against the new representation:

| File | What changes |
|---|---|
| `artistsPolicy.test.js` | `unresolvedImages`/`pending` assertions → the ref is in `images` in place; `canonicalizeArtist` round-trip; `initial()` returns real refs; `merge` migration prepend de-duplicates |
| `offlineImageRefs.test.jsx` | keep every offline-start/cache assertion; replace "hydrated" waits with first-paint checks; the "keeps … ref in the offline cache, in place" tests stay as written |
| `offlinePlaceholders.test.jsx` | `photoSlots`/`fromSlots` unit tests deleted; the DOM tests drive `ArtistDetail`/`PhotoTile` with `{ key }` refs: unavailable → "Photo available when online" tile in position, loading → `aria-busy` box, set-cover/remove keep neighbours' order |
| `stagedPhotos.test.jsx` | `unresolvedImages` expectations → `{ key }` entries in `images` |
| `useArtistStorage.test.js` | drop `stripImages`/`mergeStaticImages` cases (covered by Task 2); keep the rest |
| `wallPersistence.test.jsx` | `displayFromCanonical` → assert the refs in state directly |
| `photoResurrection.test.jsx` | `buildArtists`/`mergeStaticImages` cases → `applyDefaults` + tombstone cases (the Task 2 behaviour); `applyImageTombstones` cases unchanged |
| `blobUrlExpiry.test.js` | drop the `buildArtists` mention only; its `refreshedBlobUrl` tests stay (D3) |

- [ ] **Step 10: Run, targeted then full**

Run: `$N node_modules/vitest/vitest.mjs run src/test/artistRefsState.test.jsx src/test/artistsPolicy.test.js src/test/offlineImageRefs.test.jsx src/test/offlinePlaceholders.test.jsx src/test/stagedPhotos.test.jsx src/test/useArtistStorage.test.js src/test/wallPersistence.test.jsx src/test/photoResurrection.test.jsx src/test/blobUrlExpiry.test.js src/test/ArtistDetail*.test.jsx --maxWorkers=2`
Expected: PASS. Then the full suite (background) and `eslint . --max-warnings=0`. Fix every red test whose intent still holds; a test whose intent was the deleted machinery is deleted, not bent.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(artists): artist state holds stored refs (part of #116)"
```

---

### Task 4: Loading is an empty box; consumer sweep

Everything that lists artist photos now sees refs (some not yet resolved, some unavailable). Make "still resolving" visually neutral everywhere, and pin the count semantics (D6).

**Files:**
- Modify: `src/components/ArtistImage.jsx`
- Test: `src/test/artistImageRefs.test.jsx` (extend), `src/test/Gallery*.test.jsx` / `RankingMode*.test.jsx` (extend)

**Interfaces:** consumes `useImageSrc` status (already returned alongside `src`).

- [ ] **Step 1: Write the failing tests** — append to `src/test/artistImageRefs.test.jsx`:

```js
it('shows an empty box, not the monogram letter, while an uncached key resolves', async () => {
  let resolveUrl
  getUrl.mockReturnValue(new Promise((r) => { resolveUrl = r }))
  const { container } = render(<ArtistImage src={{ key: 'user/u1/slow.jpg' }} label="Zoia" />)
  expect(screen.queryByText('Z')).not.toBeInTheDocument()
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  resolveUrl('https://signed.example/slow')
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/slow'))
})

it('keeps the monogram for a key that could not be resolved', async () => {
  getUrl.mockRejectedValue(new Error('offline'))
  render(<ArtistImage src={{ key: 'user/u1/gone.jpg' }} label="Zoia" />)
  expect(await screen.findByText('Z')).toBeInTheDocument()
})
```
And count semantics (D6) in the Gallery and ranking tests: an artist whose only photo is an uncached `{ key }` counts toward "N with photos" and is in the swipe queue.

- [ ] **Step 2: Run to verify it fails** — the first test: the monogram letter shows while loading.

- [ ] **Step 3: Implement.** In `ArtistImage.jsx`: `const { src: resolved, status } = useImageSrc(src)`; in the fallback branch (`!displaySrc || failed`) render the same `div` but, when `status === 'loading'`, set `aria-busy="true"` and omit the letter `span`.

- [ ] **Step 4: Consumer sweep.** Every surface that lists artist photos now receives refs, some unresolved. Run each one's existing suite, then add one case per surface with an artist whose only photo is an uncached `{ key }` (it must render without throwing, show the monogram, and keep counts per D6). Surfaces: `ArtistCard`, `ArtistBrowse`, `ArtistTable` (its photo-removal **undo** runs `useUndoableRemoval` straight on `artist.images`, so it relies on #136's key-first `itemIdentity` — `artistTableVisibility.test.jsx` is the existing cover and must stay green with `{ key }` refs in the list), `CompareView`, `FilmstripView`, `RankingMode`, `StyleWall`, `Gallery` ("N with photos"), `Dashboard`, `Wall`/`WallPiece`/`WallViewer`, `Top5Hero`, `TasteMap`, `SimilarArtists`.

Run: `ls src/test | grep -i -E "ArtistCard|ArtistBrowse|ArtistTable|CompareView|Filmstrip|RankingMode|StyleWall|Gallery|Dashboard|Wall|Top5|TasteMap|SimilarArtists"` for the exact file names, then `$N node_modules/vitest/vitest.mjs run <those files> artistImageRefs --maxWorkers=2`
Expected: PASS. A test that fed display strings and asserted on a resolved URL is updated to assert on the ref or on the rendered `src`; a test whose intent was the deleted machinery is deleted. Then `eslint . --max-warnings=0`.

- [ ] **Step 5: Commit** — `git commit -am "fix(images): loading photos render an empty box, not a monogram (part of #116)"`.

---

### Task 5: The invariant — state is its own normalised form

The epic's acceptance line: "state equals stored form after hydrate / edit / pull". The precise, testable contract is that state is already normalised (`normalizeArtistImages` changes nothing): refs only, de-duplicated, producer-shaped URLs already converted. Persisting then only strips inline (never-uploaded) data URLs. Pin it so the flip cannot silently regress.

**Files:** Create `src/test/artistStateIsNormalised.test.jsx` (reuse the Task 3 harness).

- [ ] **Step 1: Write the test** — three moments, one assertion each:

```js
import { normalizeArtistImages } from '../data/artistsPolicy'
// …plus the Task 3 harness imports/helpers

// State is its own normalised form: normalising again changes nothing. (Inline
// data urls are kept by normalisation, so the D2 legacy overlay satisfies this too;
// only *persisting* strips them.)
const expectNormalised = (rows) =>
  rows.forEach((a) => expect(normalizeArtistImages(a.images)).toEqual(a.images))

describe('artist state is its own normalised form (#116)', () => {
  it('after hydrate', async () => {
    seedReturningUser()
    const result = await mount()
    expectNormalised(result.current[0])
  })

  it('after an edit with a producer-shaped photo', async () => {
    seedReturningUser({ ownPhoto: false })
    const result = await mount()
    registerBlobUrl('user/u1/artists/zoia/edit.jpg', 'data:image/png;base64,EDIT')
    act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId
      ? { ...a, images: [...a.images, 'data:image/png;base64,EDIT'] } : a))))
    expectNormalised(result.current[0])
  })

  it('after a pull that brings a remote photo and a remote removal', async () => {
    const rows = seedReturningUser()
    const removed = DEFAULT_ARTISTS[0].images[0]
    const remote = rows.map((a) => (a.id === firstId
      ? {
          ...a,
          images: [{ key: KEY }, { key: 'user/u1/artists/zoia/remote.jpg' }],
          removedImages: [{ ref: removed, removedAt: '2026-09-02T10:00:00.000Z' }],
          updatedAt: '2026-09-02T10:00:00.000Z',
        }
      : a))
    vi.spyOn(backend.store, 'list').mockResolvedValue(remote)
    const result = await mount()
    await waitFor(() =>
      expect(stateRow(result, firstId).images.some((i) => i?.key === 'user/u1/artists/zoia/remote.jpg')).toBe(true))
    expect(stateRow(result, firstId).images).not.toContain(removed)
    expectNormalised(result.current[0])
  })
})
```

- [ ] **Step 2: Run** — green (the Task 3 implementation already satisfies it); temporarily make `onEdit` skip `normalizeArtistImages` to confirm the second test goes red, then restore.

- [ ] **Step 3: Commit** — `git add src/test/artistStateIsNormalised.test.jsx && git commit -m "test(artists): pin that artist state is its own normalised form (part of #116)"`.

---

### Task 6: Browser checks, docs, counts, PR B

**Files:** `docs/ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `docs/MAINTAINING.md` (only if the e2e table row text drifts).

- [ ] **Step 1: Update the docs** (find the passages with `git grep -n -i "unresolvedImages\|canonicalizeArtist\|Available when online" CLAUDE.md docs/ARCHITECTURE.md`): the storage paragraph and ARCHITECTURE sections (~307, ~396, ~400) that describe `unresolvedImages` + `canonicalizeArtist` reinsertion become: "Artist state holds the stored refs; a ref that can't be resolved right now stays in place and renders as an 'Available when online' tile (`useImageSrc` status), so there is nothing to put back"; mention `applyDefaults` carrying the starter photos and the D2 overlay "until #118". The user-facing Help/guide wording ("Available when online" tile) is unchanged.

- [ ] **Step 2: Full verification** — full suite (background), `eslint . --max-warnings=0`, `vite build`. Update `README.md`'s counts from the run; `readmeClaims.test.js` green.

- [ ] **Step 3: Browser verification** (jsdom cannot see these): push the branch and let CI's `e2e` job run `offlinePlaceholders`, `offline`, `viewers`, `stl`, `tryon`, `tastemap` on the iPhone and `/sable/` projects. Locally, if a browser is available: `VITE_BACKEND=local npm run dev`, seeded fake session (never the real Supabase origin), then check Artist detail (tiles, set cover, remove), Wall, the offline start (DevTools offline + reload), and Taste map.

- [ ] **Step 4: Open PR B** titled `refactor(artists): artist state holds stored image refs`, body: the decisions D1-D7 verbatim, "Closes #116", the revert-safety note (no persisted-format change), and the list of rewritten tests with intent. Run the cross-model reviews (Execution notes), triage on the PR, then ask the owner before merging.

---

## Self-review

**Spec coverage (epic "PR 5a" bullets):**
- Codec stops resolving; value == stored → Task 3 (identity `toDisplay`, real-ref `initial`, `onEdit` boundary). ✔
- Delete `unresolvedImages`, `pending`, `buildArtists`' display build → Task 3 Step 3. ✔
- Delete `photoSlots`/`fromSlots` rebasing; offline tiles from `useImageSrc` status → Task 3 Steps 6-8. ✔
- Delete `ArtistImage`'s #82 retry machinery → **deliberately deferred to #117 (D3)**, with the reason. ⚠ flagged.
- Delete the dead-but-tested `stripImages`/`displayFromCanonical` → Task 3 Step 3. ✔
- Tombstones compute on stored refs → Task 2 (key-first identity, unchanged logic) + Task 3 `onEdit`. ✔
- Taste Engine keys by `refIdentity`, new v2 DB, delete v1, update `tastemap.e2e.js`; the #114-deferred async-resolve item → Task 1. ✔
- Photo counts include offline photos → Task 4 (pinned by tests, D6). ✔
- Epic verification line "state equals stored form after hydrate / edit / pull" → Task 5. ✔

**Gaps the epic did not mention, now covered:** starter photos (D1/Task 2), legacy IndexedDB-only photos (D2/Task 3), producers' output shape (D4), de-duplication across spellings (Task 2/3), the migration-prepend duplicate flagged in the #130 review (Task 3 `merge`).

**Placeholder scan:** every test body and production-code step is written out. The only deliberate elision is the repeated harness imports/helpers (`seedReturningUser`, `goOffline`, `mount`, `stateRow`, `cachedRow`, `noDuplicates`, `wrapper`, `KEY`, `firstId`), which are copied verbatim from `src/test/offlineImageRefs.test.jsx` (its lines 1-60) — Task 3 Step 1 and Task 5 name the list.

**Type consistency:** `normalizeArtistImages`, `dedupeRefs`, `withStarterPhotos`, `withLegacyLocalPhotos`, `vectorLookup`, `PhotoTile` props (`image, label, position, isCover, onOpen, onSetCover, onRemove`) are used identically wherever they appear. `getVec` receives a ref in Task 1 and nowhere else expects a URL afterwards.

## Review triage (cross-model, on this plan)

- **agy** (codex was rate-limited until 9 Oct 22:18 and could not review; run it before executing if available). Five findings, each checked against the plan and the code:
  1. *PR A breaks `main` before PR B* — **rejected**: with display-string state a photo's identity is `url:<url>`, the same instability as today's URL key; static paths and `{ key }` refs already key stably. Pinned by a Task 1 test; D7 now says so.
  2. *Legacy overlay can resurrect a deleted photo or double on edit* — **accepted in part**: the overlay read a closure copy of the IndexedDB data that edits never refreshed, and was not idempotent. Fixed by `onEdit` refreshing `imageMap[id]` and an idempotent `withLegacyLocalPhotos`; pinned by the Task 3 policy-level test; D2 updated.
  3. *`merge` re-inserts tombstoned photos via the migration prepend* — **rejected**: `byArtist` holds only `migratedRefs` (just-uploaded, freshly keyed), so none can be tombstoned; remote photos come through `reconcileRecords` + `applyImageTombstones`.
  4. *Lightbox renders `<img src={ref}>`* — **rejected**: the lightbox renders `<ArtistImage src={…}>`, which resolves the ref.
  5. *Invariant helper fails on inline data URLs* — **accepted**: the contract is "state is its own normalised form" (`normalizeArtistImages` keeps inline URLs), not "equals persisted form". Task 5 reworded; the D2 exception is no longer needed.
- agy judged D1, D3, D4, D5, D6 sound.
