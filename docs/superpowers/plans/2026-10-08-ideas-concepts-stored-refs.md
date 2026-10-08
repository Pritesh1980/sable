# Ideas, Concepts and Variants on Stored Image Refs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Idea, concept and variant state holds the stored image ref (a `{ key }` object or a bare key string), not a resolved display URL, so an offline start or an expired signed URL can no longer lose, blank or mis-save a photo.

**Architecture:** The collection store's `ensureUploaded` hook returns the value it changed instead of relying on the URL→key reverse map. Producers put the staged key into state. The idea and concept codecs stop resolving, and every consumer resolves at the leaf through `useImageSrc` / `useImageBytes` / `resolveImage*`, exactly as artists already do (#116). "Offline" becomes a render status.

**Tech Stack:** React 19, Vitest 5 + Testing Library, the collection sync engine (`src/sync/collectionStore.js`), `src/data/imageResolver.js`, `src/data/imageStaging.js`.

**Spec:** GitHub issue #109 (epic — section "PR 5b", "Render rules", "Invariants", "Test strategy") and issue #117. Read both with `gh issue view 109` / `gh issue view 117` before starting.

## Scope

Two PRs, in order, each from the latest `main`:

| PR | Branch | Tasks | Closes |
|---|---|---|---|
| 1 | `refactor/idea-stored-refs` | 1–3 | part of #117 |
| 2 | `refactor/concept-stored-refs` | 4–8 | #117 |

**Out of scope, on purpose:** flipping the *artist* producers (`uploadImages`, `AddArtistModal`, `Gallery`, `Wall`) to emit refs, and deleting `keyForUrl` / `urlToKey`. Those files are being changed by concurrent intake work, and the last users of the reverse map are the legacy overlay that #118 rewrites. They get their own plan after PR 2 lands. `refreshedBlobUrl` **is** deleted here (Task 7).

## Global Constraints

- Stored and synced format is unchanged: idea images are `{ key, note }` or `{ url, note }`; a concept's or variant's `imageUrl` is a bare key string, an external URL, or `''`. No data migration.
- Base64 never reaches the remote store. Do not make the signed-out local cache any worse than it is today.
- A blob key always starts with `user/`. Every test fixture key MUST start with `user/` — `refKey` returns `''` for anything else, and a test built on such a key passes without exercising the code.
- `resolveImage(ref)`, `resolveImageBlob(ref)` and `resolveImageBytes(ref)` never reject; they resolve to `''` / `null` / `{ src: '' }` when the photo is unavailable.
- TDD: write the failing test, run it and see it fail for the stated reason, then implement. After each task run the whole suite (`npx vitest run`) from inside the worktree, plus `npx eslint .`.
- Mutation-check every new guard: revert the fix, confirm a test goes red, restore it.
- No commit attribution trailers. Terse conventional messages ending `(part of #117)`.
- Do not write this plan's task numbers or any private label from it into code, comments, test names or docs.
- Match the surrounding code's comment density and idiom. Tailwind v4: `rounded-xs`, `backdrop-blur-xs`, `outline-hidden`.
- Do not touch `src/components/AddArtistModal.jsx`, `src/pages/Gallery.jsx`, `src/pages/Wall.jsx` or `src/hooks/useImageUpload.js`.
- A single-file failure in a full run is suspect, not proof: rerun it isolated. `docImages.test.jsx` has failed under load three times in a row; Task 3 rewrites it, so assert on images inside `waitFor`.

## Review Focus

1. **An edit lands while a legacy inline photo is uploading.** The store drops the upload's replaced value. The next flush must reuse the same key, not mint a second one (Task 1 test `does not publish a replaced value over an edit made meanwhile`, Task 2 test `stageInlineOnce reuses the key for the same photo`).
2. **A concept whose image is a key the device cannot fetch.** It must stay on the wall as an offline piece, stay out of the viewer, and must not become a draft (Task 5, Task 6 tests).
3. **A signed URL that expires mid-session.** The `<img>` error must re-resolve by key and recover, with no reverse map (Task 7 test).
4. **Static demo paths under `/sable/`.** Concept images now pass through the resolver, which applies the deploy base; a path must not be based twice (Task 6 test with `BASE_URL` stubbed).
5. **Two idea photos that are both unavailable.** Removing or annotating one must not touch the other (Task 3 test).

---

# PR 1 — Ideas

### Task 1: `ensureUploaded` returns the value it changed

**Files:**
- Modify: `src/sync/collectionStore.js` (the `ID_CODEC` near line 86, `runFlush` near 271, the pull near 420, and the contract comment near 79)
- Modify: `src/data/imageCodec.js` (both `ensureUploaded`)
- Modify: `src/data/artistsPolicy.js:191`
- Modify: `src/test/useStorageUploadRace.test.jsx:35-41`
- Test: `src/test/ensureUploadedValue.test.jsx` (new)

**Interfaces:**
- Produces: `codec.ensureUploaded(value, { userId }) → Promise<{ value, moved }>`. `value` is the input when nothing moved, otherwise a new value with each uploaded inline image replaced by its key. The store publishes a changed value only if state has not moved on.

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/ensureUploadedValue.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCollectionStore } from '../sync/collectionStore'
import { backend } from '../backend'

const USER = { id: 'u1', email: 'owner@example.com' }
const KEY = 'user/u1/ideas/i1/a.jpg'

function codecThatMoves() {
  return {
    toCanonical: (v) => v,
    toDisplay: async (v) => v,
    ensureUploaded: vi.fn(async (rows) => {
      const inline = rows.some((r) => r.image === 'data:x')
      if (!inline) return { value: rows, moved: 0 }
      return { value: rows.map((r) => (r.image === 'data:x' ? { ...r, image: KEY } : r)), moved: 1 }
    }),
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: USER }))
})

describe('ensureUploaded hands back the value it changed', () => {
  it('publishes the replaced value and pushes it', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([{ id: 'i1', image: 'data:x', updatedAt: '2026-10-01T00:00:00.000Z' }]))
    const store = createCollectionStore({ key: 'tattoo_ideas', defaultValue: [], codec: codecThatMoves() })
    await store.start(USER)
    await vi.waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows[0]?.image).toBe(KEY)
    })
    expect(store.getSnapshot()[0].image).toBe(KEY)
    expect(JSON.parse(localStorage.getItem('tattoo_ideas'))[0].image).toBe(KEY)
    store.stop()
  })

  it('does not publish a replaced value over an edit made meanwhile', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([{ id: 'i1', image: 'data:x', title: 'old', updatedAt: '2026-10-01T00:00:00.000Z' }]))
    let release
    const gate = new Promise((r) => { release = r })
    const codec = codecThatMoves()
    const upload = codec.ensureUploaded
    codec.ensureUploaded = vi.fn(async (rows, ctx) => { await gate; return upload(rows, ctx) })
    const store = createCollectionStore({ key: 'tattoo_ideas', defaultValue: [], codec })
    const started = store.start(USER)
    await vi.waitFor(() => expect(codec.ensureUploaded).toHaveBeenCalled())
    store.set((prev) => prev.map((r) => ({ ...r, title: 'edited' })))
    release()
    await started
    await vi.waitFor(() => expect(store.getSnapshot()[0].image).toBe(KEY))
    expect(store.getSnapshot()[0].title).toBe('edited')
    store.stop()
  })
})
```

The store's public surface is `{ getSnapshot, subscribe, set, start, stop, flush }`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/test/ensureUploadedValue.test.jsx`
Expected: FAIL — the image stays `data:x` (the store ignores the returned value).

- [ ] **Step 3: Implement**

In `src/sync/collectionStore.js`, update the contract comment and `ID_CODEC`:

```js
//   ensureUploaded(value, ctx)    upload inline data-URLs → { value, moved }: the
//                                 value with each one replaced by its key
const ID_CODEC = {
  toCanonical: (v) => v,
  toDisplay: async (v) => v,
  ensureUploaded: async (v) => ({ value: v, moved: 0 }),
}
```

In `runFlush`, replace the upload loop:

```js
    let next = value
    for (let round = 0; ; round += 1) {
      const uploaded = await codec.ensureUploaded(next, { userId: flushUser.id })
      if (value === next) {
        // Nothing moved on while it uploaded, so the keys can replace the
        // inline photos they were minted for.
        if (uploaded.moved > 0 && uploaded.value !== next) {
          replace(uploaded.value)
          next = uploaded.value
        }
        break
      }
      if (round >= 2) return
      next = value
    }
```

In the pull, replace `const moved = await codec.ensureUploaded(display, { userId: pullUser.id })`:

```js
      const uploaded = await codec.ensureUploaded(display, { userId: pullUser.id })
      // An edit made while it uploaded wins; the next flush uploads again and
      // gets the same keys back.
      if (live() && uploaded.moved > 0 && value === display) replace(uploaded.value)
      const moved = uploaded.moved
```

In `src/data/artistsPolicy.js:191`: `ensureUploaded: async (v) => ({ value: v, moved: 0 }),`

In `src/data/imageCodec.js`, both codecs keep their current bodies (the reverse map still canonicalises until Tasks 3 and 5) and end with `return { value: ideas, moved }` / `return { value: concepts, moved }`.

In `src/test/useStorageUploadRace.test.jsx`, the test codec returns `{ value: v, moved: 0 }` in both places (take the value as the function's first argument).

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/test/ensureUploadedValue.test.jsx src/test/useStorageUploadRace.test.jsx src/test/docImages.test.jsx src/test/useStorageSync.test.jsx`
Expected: PASS. Then `npx vitest run` and `npx eslint .`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(sync): ensureUploaded returns the value it changed (part of #117)"
```

---

### Task 2: Staging hands back keys; resolver utilities

**Files:**
- Modify: `src/data/imageStaging.js` (`withStagedImages`; add `stageImageRefs`, `stageInlineOnce`)
- Modify: `src/data/imageResolver.js` (add `warmImageCache`)
- Modify: `src/data/skinPreview.js` (`imageUrlToDataUrl` accepts a stored ref)
- Test: `src/test/stagingRefs.test.js` (new), `src/test/skinPreview.test.js` (add cases)

**Interfaces:**
- Produces:
  - `withStagedImages(images, ctx, commit)` — `commit(keys)` where `keys[i]` is the key staged for `images[i]`, or `''` when that image needed no staging. Existing callers that ignore the argument keep working.
  - `stageImageRefs(dataUrls, ctx) → Promise<Array<{ key } | { url }>>` — failed photos are left out and reported, as `stageImages` does.
  - `stageInlineOnce(dataUrl, ctx) → Promise<string|null>` — the key for an inline data URL, staged at most once per session per `userId` + URL.
  - `warmImageCache(refs)` — fire-and-forget `resolveBlobKey` for every blob key in `refs`; returns nothing; never throws.
  - `imageUrlToDataUrl(ref)` — a data URL for a data URL, external URL, blob key or `{ key }` / `{ url }` ref; rejects with `Error('Could not read the design image.')` when unavailable.

- [ ] **Step 1: Write the failing tests**

```js
// src/test/stagingRefs.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { withStagedImages, stageImageRefs, stageInlineOnce } from '../data/imageStaging'
import { warmImageCache } from '../data/imageResolver'
import { clearBlobUrls, getCachedBlobUrl } from '../data/blobUrls'
import { backend } from '../backend'

const PHOTO = 'data:image/jpeg;base64,QUJD'
const ctx = { userId: 'u1', scope: 'ideas', id: 'i1' }

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
})

describe('staging hands back keys', () => {
  it('gives commit the key staged for each inline photo, in order', async () => {
    const commit = vi.fn()
    await withStagedImages(['https://example.com/a.jpg', PHOTO], ctx, commit)
    const [keys] = commit.mock.calls[0]
    expect(keys[0]).toBe('')
    expect(keys[1]).toMatch(/^user\/u1\/ideas\/i1\/.+\.jpg$/)
  })

  it('commits at once, with no keys, when nothing needs staging', () => {
    const commit = vi.fn()
    expect(withStagedImages(['https://example.com/a.jpg'], ctx, commit)).toBeUndefined()
    expect(commit).toHaveBeenCalledWith([''])
  })

  it('stageImageRefs returns a { key } per photo', async () => {
    const refs = await stageImageRefs([PHOTO], ctx)
    expect(refs).toHaveLength(1)
    expect(refs[0].key).toMatch(/^user\/u1\/ideas\/i1\//)
    expect(refs[0].url).toBeUndefined()
  })

  it('stageImageRefs returns the url itself when signed out', async () => {
    expect(await stageImageRefs([PHOTO], { scope: 'ideas', id: 'i1' })).toEqual([{ url: PHOTO }])
  })

  it('stageInlineOnce tries again after a failure', async () => {
    const { putStagedBytes } = await import('../data/stagedImageStore')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('alert', vi.fn())
    const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    const store = await import('../data/stagedImageStore')
    const put = vi.spyOn(store, 'putStagedBytes').mockRejectedValue(new Error('quota'))
    const other = 'data:image/jpeg;base64,UkVUUlk='
    expect(await stageInlineOnce(other, ctx)).toBeNull()
    put.mockRestore()
    upload.mockRestore()
    expect(await stageInlineOnce(other, ctx)).toMatch(/^user\/u1\//)
    void putStagedBytes
  })

  it('stageInlineOnce reuses the key for the same photo', async () => {
    const first = await stageInlineOnce(PHOTO, ctx)
    const second = await stageInlineOnce(PHOTO, ctx)
    expect(first).toMatch(/^user\/u1\//)
    expect(second).toBe(first)
  })
})

describe('warmImageCache', () => {
  it('resolves every blob key and ignores everything else', async () => {
    const key = 'user/u1/ideas/i1/warm.jpg'
    await backend.blobs.upload('u1', key, PHOTO, 'image/jpeg')
    warmImageCache([{ key }, 'images/demo/a.jpg', { url: 'https://example.com/a.jpg' }, null])
    await vi.waitFor(() => expect(getCachedBlobUrl(key)).toBeTruthy())
  })

  it('does not throw when a key cannot be resolved', () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => warmImageCache([{ key: 'user/u1/ideas/i1/gone.jpg' }])).not.toThrow()
  })
})
```

Add to `src/test/skinPreview.test.js` (inside its existing `describe` for `imageUrlToDataUrl`, reusing that file's imports):

```js
  it('reads a stored blob key through the resolver', async () => {
    const key = 'user/u1/concepts/c1/design.jpg'
    const photo = 'data:image/jpeg;base64,QUJD'
    await backend.blobs.upload('u1', key, photo, 'image/jpeg')
    expect(await imageUrlToDataUrl(key)).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('rejects when the stored photo is unavailable', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(imageUrlToDataUrl('user/u1/concepts/c1/gone.jpg')).rejects.toThrow('Could not read the design image.')
  })
```

Import `backend` from `'../backend'` and `clearBlobUrls` from `'../data/blobUrls'` there, and call `clearBlobUrls()` in that file's `beforeEach`.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/test/stagingRefs.test.js src/test/skinPreview.test.js`
Expected: FAIL — `stageImageRefs` / `stageInlineOnce` / `warmImageCache` are not exported; `commit` is called with no arguments.

- [ ] **Step 3: Implement**

`src/data/imageStaging.js` — replace `withStagedImages` and add the two helpers:

```js
// The stored ref for a staged photo: its key, or the url itself when there was
// nothing to stage (signed out, or not an inline photo).
const stagedRef = (result) => (result.key ? { key: result.key } : { url: result.url })

// stageImages, returning stored refs for state instead of display urls.
export async function stageImageRefs(dataUrls = [], ctx) {
  const results = await Promise.all(Array.from(dataUrls, (dataUrl) => stageImage(dataUrl, ctx)))
  if (results.some((r) => r.failed)) reportStagingFailure()
  return results.filter((r) => !r.failed).map(stagedRef)
}

// Runs `commit(keys)` once every inline photo in `images` (URLs or { url }
// refs) is staged: keys[i] is the key for images[i], or '' when that image
// needed no staging. With nothing to stage — no inline photo, or nobody signed
// in — it commits at once, synchronously.
export function withStagedImages(images = [], ctx, commit) {
  const inline = images.map((image) => needsStaging(image, ctx))
  if (!inline.some(Boolean)) {
    commit(images.map(() => ''))
    return undefined
  }
  return Promise.all(
    images.map((image, i) => (inline[i] ? stageImage(urlOf(image), ctx) : null)),
  ).then((results) => {
    // Nothing is committed for a photo that failed to stage: its base64 would
    // reach persisted state.
    if (results.some((r) => r?.failed)) reportStagingFailure()
    else commit(results.map((r) => r?.key || ''))
  })
}

// An inline photo found in stored data (saved before staging existed, or while
// signed out) is staged once per session: a second pass over the same rows —
// after an edit raced the first — gets the same key back, not a second copy.
const stagedInline = new Map() // `${userId}\n${dataUrl}` -> Promise<key|null>
export function stageInlineOnce(dataUrl, { userId, scope, id } = {}) {
  if (!userId || !isBase64DataUrl(dataUrl)) return Promise.resolve(null)
  const memo = `${userId}\n${dataUrl}`
  if (!stagedInline.has(memo)) {
    // A failure is not remembered: the next flush tries again.
    stagedInline.set(memo, stageImage(dataUrl, { userId, scope, id }).then((r) => {
      if (!r.key) stagedInline.delete(memo)
      return r.key || null
    }))
  }
  return stagedInline.get(memo)
}
```

`needsStaging` keeps its current body in this task.

`src/data/imageResolver.js` — add:

```js
// Starts resolving every blob key in `refs`, so the first render after a load
// or a pull finds them in the cache. Fire and forget: a key that cannot be
// resolved is reported by whoever renders it.
export function warmImageCache(refs = []) {
  for (const ref of refs) {
    const key = refKey(ref)
    if (key) void resolveBlobKey(key).catch(() => {})
  }
}
```

`src/data/skinPreview.js` — replace `imageUrlToDataUrl`:

```js
// A concept image is a data URL, a stored blob key or a remote URL; Gemini and
// the camera overlay need the bytes inline.
export async function imageUrlToDataUrl(ref) {
  if (typeof ref === 'string' && ref.startsWith('data:')) return ref
  const blob = await resolveImageBlob(ref)
  if (!blob) throw new Error('Could not read the design image.')
  return blobToDataUrl(blob)
}
```

with `import { resolveImageBlob } from './imageResolver'` and `import { blobToDataUrl } from './imageStaging'`. If `blobToDataUrl`'s rejection is not an `Error` with that message, wrap it: `.catch(() => { throw new Error('Could not read the design image.') })`.

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/test/stagingRefs.test.js src/test/skinPreview.test.js src/test/imageStaging.test.js src/test/stagingProducers.test.jsx src/test/SkinPreviewDrawer.test.jsx src/test/LiveTryOn.test.jsx`
Expected: PASS. If an existing `skinPreview` test stubbed `fetch` with an object lacking `ok`/`blob`, give the stub both — do not weaken `resolveImageBlob`. Then the full suite and lint.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(images): staging hands back keys; resolver warm-up (part of #117)"
```

---

### Task 3: Idea state holds stored refs

**Files:**
- Modify: `src/data/imageCodec.js` (`ideasCodec`)
- Modify: `src/data/planning.js` (`normalizeReferenceImages`)
- Modify: `src/pages/Brief.jsx` (`addImage`, `addFiles`, `analyzableImage`, `analyzeImage`, `makeStl`, the photo grid near line 380)
- Modify: `src/components/BoardsSection.jsx` (lines 25–30, 166, 192)
- Modify: `src/data/boards.js` (`getBoardCover`)
- Modify: `src/data/export.js` (`formatImageList`, `restoreBackupImages` for ideas)
- Modify: `docs/ARCHITECTURE.md`, `CLAUDE.md` (storage paragraph), `README.md` (test counts)
- Test: `src/test/ideaRefsState.test.jsx` (new); rewrite the idea cases of `src/test/docImages.test.jsx`; update `src/test/brief.test.js`, `src/test/boards.test.js`, `src/test/ideaStlSource.test.jsx`, `src/test/stagingProducers.test.jsx`, `src/test/backupV2.test.js`, `src/test/offlinePlaceholders.test.jsx` as their assertions require

**Interfaces:**
- Consumes: `stageImageRefs`, `withStagedImages(…, commit(keys))`, `stageInlineOnce`, `warmImageCache`, `imageUrlToDataUrl(ref)` from Task 2; `{ value, moved }` from Task 1.
- Produces: `idea.images` in state is `Array<{ key, note } | { url, note }>` — identical to what is stored. `getBoardCover(board, ideas)` returns a stored ref (string or object) or `''`.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/test/ideaRefsState.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { useStorage } from '../hooks/useStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { ideasCodec } from '../data/imageCodec'
import { normalizeReferenceImages, setImageNote } from '../data/planning'
import { getBoardCover } from '../data/boards'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const KEY = 'user/u1/ideas/i1/photo.jpg'
const KEY2 = 'user/u1/ideas/i1/other.jpg'

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))
const mount = () => renderHook(() => useStorage('tattoo_ideas', [], ideasCodec), { wrapper })

function seed(images) {
  const rows = [{ id: 'i1', title: 'Koi', images, updatedAt: '2026-10-01T00:00:00.000Z' }]
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
  localStorage.setItem('tattoo_ideas', JSON.stringify(rows))
  localStorage.setItem('tattoo_remote_u1_ideas', JSON.stringify(rows))
}

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('idea state holds stored refs', () => {
  it('keeps a { key } ref as it is stored, online', async () => {
    seed([{ key: KEY, note: 'n' }])
    await backend.blobs.upload('u1', KEY, 'data:image/jpeg;base64,QUJD', 'image/jpeg')
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]?.[0]?.images).toEqual([{ key: KEY, note: 'n' }]))
  })

  it('keeps it offline, in state and in the cache', async () => {
    seed([{ key: KEY, note: 'n' }])
    vi.spyOn(backend.store, 'list').mockRejectedValue(new Error('offline'))
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]?.[0]?.images).toEqual([{ key: KEY, note: 'n' }]))
    act(() => result.current[1]((prev) => prev.map((i) => ({ ...i, title: 'Edited offline' }))))
    expect(JSON.parse(localStorage.getItem('tattoo_ideas'))[0].images).toEqual([{ key: KEY, note: 'n' }])
  })

  it('replaces a stored inline photo with its key, in state and remotely', async () => {
    seed([{ url: 'data:image/jpeg;base64,QUJD', note: 'n' }])
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]?.[0]?.images?.[0]?.key).toMatch(/^user\/u1\/ideas\/i1\//))
    expect(result.current[0][0].images[0]).toEqual({ key: result.current[0][0].images[0].key, note: 'n' })
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows[0]?.images?.[0]?.key).toBe(result.current[0][0].images[0].key)
      expect(rows[0]?.images?.[0]?.url).toBeUndefined()
    })
  })
})

describe('idea photo helpers work on stored refs', () => {
  it('normalizes to the stored shape', () => {
    expect(normalizeReferenceImages([
      'https://example.com/a.jpg',
      { key: KEY, note: 'n', url: 'blob:stale' },
      { url: '', note: 'empty' },
    ])).toEqual([
      { url: 'https://example.com/a.jpg', note: '' },
      { key: KEY, note: 'n' },
    ])
  })

  it('annotates one of two unavailable photos without touching the other', () => {
    const images = [{ key: KEY, note: '' }, { key: KEY2, note: '' }]
    expect(setImageNote(images, images[1], 'second')).toEqual([
      { key: KEY, note: '' },
      { key: KEY2, note: 'second' },
    ])
  })

  it('a board cover is the first idea photo as a stored ref', () => {
    const ideas = [{ id: 'i1', images: [{ key: KEY, note: '' }] }]
    expect(getBoardCover({ ideaIds: ['i1'] }, ideas)).toEqual({ key: KEY, note: '' })
    expect(getBoardCover({ cover: 'images/demo/a.jpg', ideaIds: ['i1'] }, ideas)).toBe('images/demo/a.jpg')
    expect(getBoardCover({ ideaIds: [] }, ideas)).toBe('')
  })
})
```

The local remote's storage key is `tattoo_remote_<userId>_<collection>` (`src/backend/local/localStore.js`).

Add a composer test to `src/test/stagingProducers.test.jsx` (reuse that file's Brief render helper and its fake file): after attaching a photo and saving, the saved idea's `images[0]` equals `{ key: expect.stringMatching(/^user\//), note: '' }` — no `url`.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/test/ideaRefsState.test.jsx`
Expected: FAIL — images come back as `{ url, note, key }` display objects; `getBoardCover` returns a resolved string.

- [ ] **Step 3: Implement the data layer**

`src/data/imageCodec.js` — replace the ideas section (keep `canonUrl`, `displayUrl`, `isBlobKey` for concepts until Task 5):

```js
// ── ideas: images is [{ key, note } | { url, note }] — state holds this form ──

const ideaImage = (img) => {
  if (typeof img === 'string') return { url: img, note: '' }
  if (img?.key) return { key: img.key, note: img.note || '' }
  return { url: img?.url || '', note: img?.note || '' }
}
const ideaRefs = (ideas) => ideas.flatMap((i) => i.images || [])

export const ideasCodec = {
  toCanonical: (ideas = []) => ideas.map((i) => ({ ...i, images: (i.images || []).map(ideaImage) })),
  toDisplay: async (ideas = []) => {
    warmImageCache(ideaRefs(ideas))
    return ideas
  },
  ensureUploaded: async (ideas = [], { userId }) => {
    let moved = 0
    const next = []
    for (const idea of ideas) {
      let images = idea.images
      for (const [i, img] of (idea.images || []).entries()) {
        const url = typeof img === 'string' ? img : img?.url
        if (img?.key || typeof url !== 'string' || !url.startsWith('data:')) continue
        const key = await stageInlineOnce(url, { userId, scope: 'ideas', id: idea.id || 'misc' })
        if (!key) continue
        if (images === idea.images) images = [...idea.images]
        images[i] = { key, note: (typeof img === 'object' && img.note) || '' }
        moved += 1
      }
      next.push(images === idea.images ? idea : { ...idea, images })
    }
    return { value: moved ? next : ideas, moved }
  },
}
```

Imports: `warmImageCache` from `./imageResolver`, `stageInlineOnce` from `./imageStaging`. Rewrite the file's header comment: ideas hold the stored form; concepts still convert (until the next change).

`src/data/planning.js`:

```js
export function normalizeReferenceImages(images = []) {
  return images
    .map((image) => {
      if (typeof image === 'string') return { url: image, note: '' }
      if (image?.key) return { key: image.key, note: image.note || '' }
      return { url: image?.url || '', note: image?.note || '' }
    })
    .filter((image) => image.key || image.url)
}
```

`src/data/boards.js` — `getBoardCover` returns `idea.images[0]` (the ref) instead of `getImageUrl(idea.images[0])`; drop the unused import.

`src/data/export.js`:
- `formatImageList`: `const label = (refKey(image) || url.startsWith('data:')) ? '[uploaded photo]' : url`.
- `restoreBackupImages`: for `scope === 'ideas'`, return the stored ref — `typeof image === 'string' ? { key: staged.key, note: '' } : { key: staged.key, note: image.note || '' }` when `staged.key` exists; otherwise today's result. Other scopes unchanged in this task.

- [ ] **Step 4: Implement the consumers**

`src/pages/Brief.jsx`:

```jsx
  function addImage() {
    const url = newImage.trim()
    if (url) {
      setUploading(true)
      const staging = withStagedImages([url], { userId, scope: 'ideas', id: idea.id || 'misc' }, ([key]) => {
        touch('images')
        setDraft((d) => ({ ...d, images: [...(d.images || []), key ? { key, note: '' } : { url, note: '' }] }))
      })
      void Promise.resolve(staging).finally(() => setUploading(false))
    }
    setNewImage('')
  }
```

In `addFiles`, `stageImages` → `stageImageRefs`, and append `...refs.map((ref) => ({ ...ref, note: '' }))`.

Fill-from-image no longer needs the photo to be an inline data URL:

```jsx
  const analyzableImage = normalizeReferenceImages(draft.images)
    .find((image) => image.key || image.url.startsWith('data:'))
```

and in `analyzeImage`, before the Gemini call:

```jsx
      let dataUrl
      try {
        dataUrl = await imageUrlToDataUrl(analyzableImage.key || analyzableImage.url)
      } catch {
        setAnalyzeNote('That photo is not available right now.')
        return
      }
      const result = await analyzeIdeaImageWithGemini(geminiKey, dataUrl)
```

Keep the existing `finally` that clears `analyzing`. Import `imageUrlToDataUrl` from `'../data/skinPreview'`.

The photo grid: replace the raw `<img>` with the render boundary, and hand the STL drawer a string ref:

```jsx
              {images.map((image, index) => (
                <div key={itemIdentity(image) || index} className="bg-ink-muted rounded-xs overflow-hidden border border-ink-border">
                  <div className="relative aspect-square group">
                    <IdeaPhoto image={image} />
```

```jsx
// One reference photo in the composer: the image, an empty box while it
// resolves, or the offline placeholder when its bytes can't be fetched.
function IdeaPhoto({ image }) {
  const { src, status } = useImageSrc(image)
  if (status === 'unavailable') return <OfflinePhoto className="w-full h-full" />
  if (status !== 'ready') return <div className="w-full h-full bg-ink-muted" aria-busy={status === 'loading' ? 'true' : undefined} />
  return <img src={src} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
}
```

`makeStl(image, index)` sets `imageUrl: image.key || image.url` (a string the drawer can key on and `useImageBytes` can resolve); the button calls `makeStl(image, index)`. Remove `getImageUrl` from Brief's imports if nothing else uses it.

`src/components/BoardsSection.jsx`: the cover `<img src={cover}>` and both idea thumbnails become `<ArtistImage src={…} label="" className="…same classes…" fallbackClassName="…" />`; keep the `{cover ? … : …}` branch. `GeneratedArtworkNotice images={[cover]}` already accepts a ref.

Then run `grep -rn "getImageUrl(" src --include='*.jsx' --include='*.js' | grep -v "^src/test"` — the only remaining callers should be `export.js` (text label) and `planning.js` itself. Any other caller rendering an idea photo must go through `ArtistImage` or `useImageSrc`.

- [ ] **Step 5: Bring the existing tests across**

- `src/test/docImages.test.jsx`, idea case: rename to "migrates an inline idea image to a blob key", and assert **inside `waitFor`** that state holds `{ key, note: 'n' }` and that the remote row holds the same key. Leave the concept cases alone.
- `src/test/brief.test.js`, `boards.test.js`, `ideaStlSource.test.jsx`, `backupV2.test.js`, `offlinePlaceholders.test.jsx`: update only assertions that pinned the display shape (`{ url, note, key }`, a resolved cover string, a `data:` `imageUrl` handed to the STL drawer). Keep every DOM expectation ("Photo available when online", undo toasts).
- For each rewritten assertion, state in the commit body which production change would break it.

- [ ] **Step 6: Run and verify**

Run: `npx vitest run src/test/ideaRefsState.test.jsx src/test/docImages.test.jsx src/test/brief.test.js src/test/boards.test.js src/test/BriefTabs.test.jsx src/test/ideaStlSource.test.jsx src/test/stagingProducers.test.jsx src/test/backupV2.test.js src/test/offlinePlaceholders.test.jsx`
Expected: PASS. Then the full suite, `npx eslint .`, `npm run build`.

Mutation checks (each must turn a named test red, then be restored):
1. `ideasCodec.toDisplay` resolves keys to `{ url }` again → `keeps a { key } ref as it is stored, online`.
2. `ensureUploaded` returns `{ value: ideas, moved }` (drops the replacement) → `replaces a stored inline photo with its key`.
3. `normalizeReferenceImages` keeps `url` beside `key` → `normalizes to the stored shape`.

- [ ] **Step 7: Docs and counts**

- `docs/ARCHITECTURE.md`: wherever idea images are described as display URLs in memory (search "ideasCodec", "display URL", "imageCodec"), say idea state holds the stored `{ key, note }` form and resolves at render.
- `CLAUDE.md` storage paragraph: the sentence beginning "Idea and concept images use the same key-based blob storage" — ideas now hold `{ key }` in memory; concepts still hold a display URL until the next change.
- `README.md`: re-take the test and file counts from a real `npx vitest run` (`src/test/readmeClaims.test.js` asserts them).
- Fill-from-image now works on any saved photo, not only one just attached: if `src/pages/Help.jsx` or `docs/` says otherwise, correct it.

- [ ] **Step 8: Commit, push, open PR 1**

```bash
git add -A && git commit -m "refactor(ideas): idea state holds stored image refs (part of #117)"
git push -u origin refactor/idea-stored-refs
gh pr create --title "refactor(ideas): idea state holds stored image refs" --body "Part of #117. …"
```

PR body: what changed, the three mutation checks, and the one behaviour change (fill-from-image works on saved photos).

---

# PR 2 — Concepts and variants

Start from the latest `main` after PR 1 merges.

### Task 4: `useImageStatuses`

**Files:**
- Create: `src/hooks/useImageStatuses.js`
- Test: `src/test/useImageStatuses.test.jsx` (new)

**Interfaces:**
- Produces: `useImageStatuses(refs) → Array<'ready' | 'loading' | 'unavailable' | 'none'>`, one per ref, in order. Same meanings as `useImageSrc`. A re-created but identical `refs` array must not restart anything.

- [ ] **Step 1: Write the failing test**

```jsx
// src/test/useImageStatuses.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import useImageStatuses from '../hooks/useImageStatuses'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const HERE = 'user/u1/concepts/c1/here.jpg'
const GONE = 'user/u1/concepts/c2/gone.jpg'

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useImageStatuses', () => {
  it('reports each ref: a static path at once, keys once they settle', async () => {
    await backend.blobs.upload('u1', HERE, 'data:image/jpeg;base64,QUJD', 'image/jpeg')
    const realGetUrl = backend.blobs.getUrl.bind(backend.blobs)
    vi.spyOn(backend.blobs, 'getUrl').mockImplementation((key) => (
      key === GONE ? Promise.reject(new Error('offline')) : realGetUrl(key)
    ))
    const refs = ['images/demo/a.jpg', HERE, GONE, '']
    const { result } = renderHook(() => useImageStatuses(refs))
    expect(result.current).toEqual(['ready', 'loading', 'loading', 'none'])
    await waitFor(() => expect(result.current).toEqual(['ready', 'ready', 'unavailable', 'none']))
  })

  it('does not start again for a re-created list of the same refs', async () => {
    await backend.blobs.upload('u1', HERE, 'data:image/jpeg;base64,QUJD', 'image/jpeg')
    const getUrl = vi.spyOn(backend.blobs, 'getUrl')
    const { result, rerender } = renderHook(() => useImageStatuses([HERE]))
    await waitFor(() => expect(result.current).toEqual(['ready']))
    const calls = getUrl.mock.calls.length
    rerender()
    rerender()
    expect(getUrl.mock.calls.length).toBe(calls)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/test/useImageStatuses.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/hooks/useImageStatuses.js
import { useEffect, useState } from 'react'
import { resolveImage, resolveImageRef } from '../data/imageResolver'
import { refKey } from '../data/imageRef'

// useImageSrc for a list: the render status of each stored ref, in order
// ('ready' | 'loading' | 'unavailable' | 'none'), for callers that need to know
// which photos can be shown before rendering them — the concept viewer only
// swipes through pieces it can show (#102).
export default function useImageStatuses(refs = []) {
  const [settled, setSettled] = useState(() => new Map()) // key -> 'ready' | 'unavailable'
  const sync = refs.map((ref) => resolveImageRef(ref).status)
  const keys = refs.map(refKey)
  // A string, so a re-created list of the same refs does not restart anything.
  const pending = keys.filter((key, i) => key && sync[i] === 'loading' && !settled.has(key)).join('\n')

  useEffect(() => {
    if (!pending) return undefined
    let live = true
    for (const key of pending.split('\n')) {
      void resolveImage(key).then((src) => {
        if (live) setSettled((prev) => new Map(prev).set(key, src ? 'ready' : 'unavailable'))
      })
    }
    return () => {
      live = false
    }
  }, [pending])

  return sync.map((status, i) => (status === 'loading' ? settled.get(keys[i]) || 'loading' : status))
}
```

- [ ] **Step 4: Run and verify** — `npx vitest run src/test/useImageStatuses.test.jsx` → PASS; full suite; lint.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(images): useImageStatuses for lists of stored refs (part of #117)"
```

---

### Task 5: Concept and variant state holds stored refs

**Files:**
- Modify: `src/data/imageCodec.js` (`conceptsCodec`; delete `isBlobKey`, `canonUrl`, `displayUrl`, `displayImage`, `canonImage`)
- Modify: `src/data/concepts.js` (`isDraftConcept`, `buildConceptWallItems`)
- Modify: `src/pages/Concepts.jsx` (`generate`, `handleComposerPaste`, `addVariant`, `viewerItems`, `openViewer`)
- Modify: `src/components/ConceptPiece.jsx`
- Modify: `src/data/export.js` (`restoreBackupImages` for concepts)
- Modify: `src/sync/collectionStore.js:136-139` (the comment about `unresolvedImageKey`)
- Test: `src/test/conceptRefsState.test.jsx` (new); rewrite concept cases in `src/test/docImages.test.jsx`, `src/test/offlineImageRefs.test.jsx`; update `src/test/concepts.spec.js`, `src/test/stagingProducers.test.jsx`, `src/test/backupV2.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces: `concept.imageUrl` and `variant.imageUrl` in state are the stored string — a blob key, an external URL, or `''`. `unresolvedImageKey` no longer exists. `isDraftConcept(c)` is `!c.imageUrl`. Wall items no longer carry `offline`; `item.imageUrl` is the stored ref.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/test/conceptRefsState.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { conceptsCodec } from '../data/imageCodec'
import { isDraftConcept, buildConceptWallItems } from '../data/concepts'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const KEY = 'user/u1/concepts/c1/main.jpg'
const VKEY = 'user/u1/concepts/c1/v1.jpg'
const concept = { id: 'c1', prompt: 'moth', imageUrl: KEY, variants: [{ id: 'v1', imageUrl: VKEY }] }

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('concept state holds stored refs', () => {
  it('toDisplay returns the stored value, online or offline', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    expect(await conceptsCodec.toDisplay([concept])).toEqual([concept])
  })

  it('toCanonical is the identity on stored concepts', () => {
    expect(conceptsCodec.toCanonical([concept])).toEqual([concept])
  })

  it('never leaves unresolvedImageKey behind', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const [out] = await conceptsCodec.toDisplay([concept])
    expect('unresolvedImageKey' in out).toBe(false)
    expect('unresolvedImageKey' in out.variants[0]).toBe(false)
  })

  it('replaces a stored inline image and inline variant image with keys', async () => {
    const inline = { id: 'c2', prompt: 'koi', imageUrl: 'data:image/jpeg;base64,QUJD', variants: [{ id: 'v1', imageUrl: 'data:image/jpeg;base64,REVG' }] }
    const { value, moved } = await conceptsCodec.ensureUploaded([inline], { userId: 'u1' })
    expect(moved).toBe(2)
    expect(value[0].imageUrl).toMatch(/^user\/u1\/concepts\/c2\//)
    expect(value[0].variants[0].imageUrl).toMatch(/^user\/u1\/concepts\/c2\//)
    expect(value[0].variants[0].imageUrl).not.toBe(value[0].imageUrl)
  })

  it('returns the same value when nothing is inline', async () => {
    const rows = [concept]
    expect(await conceptsCodec.ensureUploaded(rows, { userId: 'u1' })).toEqual({ value: rows, moved: 0 })
  })
})

describe('drafts and wall items', () => {
  it('a concept with a stored key is not a draft, whether or not it can load', () => {
    expect(isDraftConcept({ imageUrl: KEY })).toBe(false)
    expect(isDraftConcept({ imageUrl: '' })).toBe(true)
    expect(isDraftConcept({})).toBe(true)
  })

  it('wall items carry the stored ref and no offline flag', () => {
    const [item] = buildConceptWallItems([concept], [])
    expect(item.imageUrl).toBe(KEY)
    expect('offline' in item).toBe(false)
  })
})
```

Add to `src/test/stagingProducers.test.jsx`, using that file's Concepts render helper: a pasted image creates a concept whose `imageUrl` matches `/^user\//`; a saved variant's `imageUrl` matches `/^user\//`. Neither is a `data:` URL.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/test/conceptRefsState.test.jsx`
Expected: FAIL — `toDisplay` returns `imageUrl: ''` with `unresolvedImageKey`; `ensureUploaded` returns the input unchanged; items carry `offline`.

- [ ] **Step 3: Implement the data layer**

`src/data/imageCodec.js` — the concepts section becomes:

```js
// ── concepts: imageUrl string at top level and on each variant — state holds
// the stored string: a blob key, an external URL, or '' ────────────────────────

const conceptRefs = (concepts) => concepts.flatMap((c) => [c.imageUrl, ...(c.variants || []).map((v) => v.imageUrl)])
const isInline = (url) => typeof url === 'string' && url.startsWith('data:')

export const conceptsCodec = {
  toCanonical: (concepts = []) => concepts,
  toDisplay: async (concepts = []) => {
    warmImageCache(conceptRefs(concepts))
    return concepts
  },
  ensureUploaded: async (concepts = [], { userId }) => {
    let moved = 0
    const stage = async (url, id) => {
      if (!isInline(url)) return url
      const key = await stageInlineOnce(url, { userId, scope: 'concepts', id: id || 'misc' })
      if (!key) return url
      moved += 1
      return key
    }
    const next = []
    for (const c of concepts) {
      const imageUrl = await stage(c.imageUrl, c.id)
      let variants = c.variants
      if (Array.isArray(c.variants)) {
        const staged = []
        for (const v of c.variants) {
          const url = await stage(v.imageUrl, c.id)
          staged.push(url === v.imageUrl ? v : { ...v, imageUrl: url })
        }
        if (staged.some((v, i) => v !== c.variants[i])) variants = staged
      }
      next.push(imageUrl === c.imageUrl && variants === c.variants ? c : { ...c, imageUrl, ...(variants ? { variants } : {}) })
    }
    return { value: moved ? next : concepts, moved }
  },
}
```

Delete the now-unused helpers and the `keyForUrl` / `resolveBlobKey` / `uploadDataUrl` imports. Rewrite the header comment: both collections hold the stored form; the codec only warms the cache and moves inline photos stored before staging existed.

`src/data/concepts.js`:

```js
// Only concepts with a saved image render on the wall — text-only responses
// and empty paste-pending concepts stay in the composer's paste zone until an
// image lands. A stored key counts whether or not its bytes can be fetched
// right now: that is a render status, not a draft (#102).
export function isDraftConcept(concept) {
  return !concept.imageUrl
}
```

and drop `offline: !concept.imageUrl` from the item.

`src/pages/Concepts.jsx` producers put the key in state:

```jsx
      const { key, url } = await stageImage(dataUrl, stagingFor(id))
      const concept = { id, prompt: idea, imageUrl: key || url, /* …unchanged… */ }
```

```jsx
    void withStagedImages([dataUrlOrUrl], stagingFor(id), ([key]) => {
      const imageUrl = key || dataUrlOrUrl
      // …both branches use imageUrl in place of dataUrlOrUrl…
    })
```

```jsx
  function addVariant(conceptId, input) {
    void withStagedImages([input.imageUrl], stagingFor(conceptId), ([key]) => {
      const staged = key ? { ...input, imageUrl: key } : input
      setConcepts((prev) => prev.map((c) => (
        c.id === conceptId ? addConceptVariant(c, staged) : c
      )))
    })
  }
```

`src/data/export.js` `restoreBackupImages`: for `scope === 'concepts'` return `staged.key || staged.url`.

`src/sync/collectionStore.js:136-139`: the comment's reason (a display value losing `unresolvedImageKey`) is gone. Read the surrounding code; keep the behaviour and rewrite the comment to state the reason that still holds (the cache must not be rewritten from a value the codec has not produced yet), or say plainly that it now only matters for the artists codec.

Dropping `offline` from the wall items means the two things that read it move in this task too.

`src/components/ConceptPiece.jsx`:

```jsx
import useImageSrc from '../hooks/useImageSrc'

export default function ConceptPiece({ item, onOpen }) {
  const { src, status } = useImageSrc(item.imageUrl)
  const ready = status === 'ready'
  return (
    <figure
      className={`relative mb-[6px] break-inside-avoid overflow-hidden group ${ready ? 'cursor-zoom-in' : ''}`}
      onClick={ready ? () => onOpen(item) : undefined}
    >
      {ready ? (
        <>
          <img src={src} alt={item.title} loading="lazy" className="w-full block grayscale-[0.15] group-hover:grayscale-0 transition-[filter] duration-300" />
          <GeneratedArtworkNotice images={[item.imageUrl]} className="absolute top-2 right-2 max-w-[65%] rounded-xs bg-v2-ink/85 px-2 py-1" />
        </>
      ) : status === 'loading' ? (
        <div className="w-full aspect-square bg-ink-muted" aria-busy="true" />
      ) : (
        <OfflinePhoto className="w-full aspect-square" />
      )}
      {/* badge and figcaption unchanged */}
```

`src/pages/Concepts.jsx` — the viewer skip reads render status:

```jsx
  const statuses = useImageStatuses(wallItems.map((item) => item.imageUrl))
  const statusKey = statuses.join()
  // The viewer only swipes through pieces it can show; a piece whose image is
  // not available holds its place on the wall but can't be opened (#102).
  const viewerItems = useMemo(
    () => wallItems.filter((_, i) => statusKey.split(',')[i] === 'ready'),
    [wallItems, statusKey],
  )
```

`openViewer(item)`: `const index = viewerItems.indexOf(item); if (index !== -1) setViewerIndex(index)`.

- [ ] **Step 4: Bring the existing tests across**

- `docImages.test.jsx` concept cases: state holds the key; assert inside `waitFor`.
- `offlineImageRefs.test.jsx` `keeps a concept's and its variant's image keys through the display round-trip`: becomes "…are what state holds offline": `toDisplay` returns the concept unchanged.
- `concepts.spec.js`: drop `offline` / `unresolvedImageKey` expectations; add the stored-key-is-not-a-draft case if not already covered above.
- `backupV2.test.js`: a restored concept's `imageUrl` is a `user/` key.
- `backupV2.test.js`: also pin export — a concept and a variant whose `imageUrl` is a `user/` key are embedded as `data:` URLs by `createBackupWithImages` (`isEmbeddable` already recognises a bare key through `refKey`; this guards it).

- [ ] **Step 5: Run and verify**

Run: `npx vitest run src/test/conceptRefsState.test.jsx src/test/docImages.test.jsx src/test/offlineImageRefs.test.jsx src/test/concepts.spec.js src/test/stagingProducers.test.jsx src/test/backupV2.test.js`
Expected: PASS. Then the full suite and lint. `ConceptViewer` and `ConceptVariantLab` still hand the stored string to `<img>` until the next task, so a test that renders a *keyed* concept inside them may fail here: if one does, fix that component now using the next task's code for it and say so in the report — never skip or weaken the test.

Mutation checks:
1. `isDraftConcept` returns `!concept.imageUrl || !resolved` (any resolution-dependent form) → `a concept with a stored key is not a draft`.
2. `ensureUploaded` returns `{ value: concepts, moved }` → `replaces a stored inline image…`.
3. `generate` stores `url` instead of `key || url` → the new `stagingProducers` case.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(concepts): concept and variant state holds stored image refs (part of #117)"
```

---

### Task 6: Concept consumers resolve at the leaf

**Files:**
- Modify: `src/components/ConceptViewer.jsx` (~lines 248–272), `src/components/ConceptVariantLab.jsx` (~308–330, ~438–460), `src/components/SkinPreviewDrawer.jsx` (~155), `src/components/ConceptVisualMatches.jsx`
- Test: `src/test/conceptImageSweep.test.jsx` (new); update `src/test/offlinePlaceholders.test.jsx`, `src/test/ConceptVisualMatches.test.jsx`, `src/test/SkinPreviewDrawer.test.jsx`, `src/test/ConceptVariantLab.test.jsx` as needed

**Interfaces:**
- Consumes: `useImageSrc`, `useImageStatuses`, `resolveImage`, `imageUrlToDataUrl(ref)`.
- Produces: no component passes a concept or variant `imageUrl` straight to `<img src>`.

- [ ] **Step 1: Write the failing sweep test**

```jsx
// src/test/conceptImageSweep.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ConceptPiece from '../components/ConceptPiece'
import ConceptVariantLab from '../components/ConceptVariantLab'
import { buildConceptWallItems } from '../data/concepts'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

const HERE = 'user/u1/concepts/c1/here.jpg'
const GONE = 'user/u1/concepts/c2/gone.jpg'
const PHOTO = 'data:image/jpeg;base64,QUJD'

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await backend.blobs.upload('u1', HERE, PHOTO, 'image/jpeg')
  const realGetUrl = backend.blobs.getUrl.bind(backend.blobs)
  vi.spyOn(backend.blobs, 'getUrl').mockImplementation((key) => (
    key === GONE ? Promise.reject(new Error('offline')) : realGetUrl(key)
  ))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const item = (imageUrl) => buildConceptWallItems([{ id: 'c', prompt: 'Moth', imageUrl }], [])[0]

describe('concept images resolve at the leaf', () => {
  it('ConceptPiece shows a stored key once it resolves, never the key as a src', async () => {
    const onOpen = vi.fn()
    render(<ConceptPiece item={item(HERE)} onOpen={onOpen} />)
    const img = await screen.findByRole('img', { name: 'Moth' })
    expect(img.getAttribute('src')).not.toContain('user/u1')
    expect(img.getAttribute('src')).toMatch(/^(data:|blob:)/)
  })

  it('ConceptPiece shows the offline placeholder for a key it cannot fetch, and does not open', async () => {
    const onOpen = vi.fn()
    const { container } = render(<ConceptPiece item={item(GONE)} onOpen={onOpen} />)
    expect(await screen.findByRole('img', { name: 'Photo available when online' })).toBeInTheDocument()
    container.querySelector('figure').click()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('ConceptPiece applies the deploy base to a static path exactly once', async () => {
    vi.stubEnv('BASE_URL', '/sable/')
    render(<ConceptPiece item={item('images/demo/moth.jpg')} onOpen={vi.fn()} />)
    const img = await screen.findByRole('img', { name: 'Moth' })
    expect(img.getAttribute('src')).toBe('/sable/images/demo/moth.jpg')
  })

  it('a variant with a key it cannot fetch shows the offline placeholder, not "No image"', async () => {
    const concept = { id: 'c1', prompt: 'Moth', imageUrl: HERE, variants: [{ id: 'v1', provider: 'pasted', imageUrl: GONE, createdAt: '2026-10-01T00:00:00.000Z' }] }
    render(
      <ConceptVariantLab
        concept={concept}
        onAddVariant={vi.fn()} onMarkBest={vi.fn()} onDeleteVariant={vi.fn()} onRateVariant={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Photo available when online' }).length).toBeGreaterThan(0))
    expect(screen.queryByText('No image')).not.toBeInTheDocument()
  })
})
```

`vi.stubEnv('BASE_URL', '/sable/')` is the technique `src/test/GlCrossfade.test.jsx` already uses.

Add to `src/test/offlinePlaceholders.test.jsx` if it is not already pinned there: on the Concepts page with one loadable and one unloadable concept, opening the loadable piece opens the viewer, and paging next does not land on the unloadable one.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/test/conceptImageSweep.test.jsx`
Expected: the `ConceptVariantLab` case FAILS (`No image` shown for an unavailable key). The three `ConceptPiece` cases pass already — they pin the previous task's change; run mutation check 1 below to prove they can fail.

- [ ] **Step 3: Implement**

`ConceptPiece.jsx` and the viewer skip in `Concepts.jsx` were done with the data change; this task covers what still hands a stored string to an `<img>`.

`ConceptViewer.jsx`: `const { src: currentSrc } = useImageSrc(current.imageUrl)` and the plain `<img>` uses `src={currentSrc}`; `GlCrossfade` already takes a stored ref and keeps `src={current.imageUrl}`. Call the hook before any early return.

`ConceptVariantLab.jsx` — one shared piece for both the detail image and the thumbnail:

```jsx
// A variant's saved image: the photo, an empty box while it resolves, the
// offline placeholder when its bytes can't be fetched, or `empty` when the
// variant never had one.
function VariantImage({ value, alt, className, compact = false, empty }) {
  const { src, status } = useImageSrc(value)
  if (status === 'ready') return <img src={src} alt={alt} className={className} />
  if (status === 'none') return empty
  if (status === 'loading') return <div className={`${className} bg-ink-muted`} aria-busy="true" />
  return <OfflinePhoto compact={compact} className={className.replace('object-cover', '').trim()} />
}
```

Replace both three-way `imageUrl ? … : variant.unresolvedImageKey ? … : …` blocks with `<VariantImage value={imageUrl} alt=… className=… compact={…} empty={<div …existing "No image saved" / "No image" markup…/>} />`. The STL and try-on buttons keep `imageUrl && …` (a stored key is truthy, and both drawers resolve it).

`SkinPreviewDrawer.jsx:155`: `<ArtistImage src={source.imageUrl} label={`${label} design`} className="…same classes…" />`. `handleGenerate` and `LiveTryOn` already go through `imageUrlToDataUrl`, which now accepts the key.

`ConceptVisualMatches.jsx`: resolve before embedding —

```jsx
        const url = await resolveImage(src)
        if (!alive) return
        if (!url) {
          setState({ status: 'failed' })
          return
        }
        const vec = await vectorFor(url, `concept:${concept.id}`)
```

Finally: `grep -rn "unresolvedImageKey" src e2e` must print nothing, and `grep -rn "imageUrl}" src/components src/pages | grep "src="` must show only form previews of a just-picked file (`AddVariantForm`) and refs handed to `GlCrossfade` / `ArtistImage`.

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/test/conceptImageSweep.test.jsx src/test/offlinePlaceholders.test.jsx src/test/Concepts.test.jsx src/test/ConceptsVariants.test.jsx src/test/ConceptVariantLab.test.jsx src/test/conceptViewerClose.test.jsx src/test/conceptViewerIndexReset.test.jsx src/test/ConceptVisualMatches.test.jsx src/test/SkinPreviewDrawer.test.jsx src/test/LiveTryOn.test.jsx src/test/ReliefStlDrawer.test.jsx`
Expected: PASS. Full suite, lint, `npm run build`.

Mutation checks:
1. `ConceptPiece` renders `<img src={item.imageUrl}>` → `shows a stored key once it resolves`.
2. `viewerItems = wallItems` → the viewer-skip case.
3. `VariantImage` returns `empty` for `'unavailable'` → the variant case.
4. `ConceptVisualMatches` embeds `src` without resolving → add or point to the `ConceptVisualMatches.test.jsx` case that feeds it a `user/` key and asserts the embedder received a `data:`/`blob:` URL.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(concepts): concept images resolve at the leaf (part of #117)"
```

---

### Task 7: `ArtistImage` recovers an expired URL by key; delete `refreshedBlobUrl`

**Files:**
- Modify: `src/data/blobUrls.js` (replace `refreshedBlobUrl` with `refreshBlobKey`)
- Modify: `src/components/ArtistImage.jsx` (the `handleError` call and its comment)
- Test: `src/test/blobUrlExpiry.test.js`, `src/test/ArtistImage.test.jsx` (rewrite the `refreshedBlobUrl` cases)

**Interfaces:**
- Produces: `refreshBlobKey(key, failedUrl) → Promise<string|null>` — a different URL for the same key, or `null` when there is no key or the cache still considers `failedUrl` fresh (a genuinely broken image, not an expiry). `refreshedBlobUrl` no longer exists.

- [ ] **Step 1: Rewrite the tests first**

In `src/test/blobUrlExpiry.test.js`, every `refreshedBlobUrl(url)` case becomes `refreshBlobKey(key, url)` with the same expectations, plus:

```js
  it('returns null when there is no key', async () => {
    expect(await refreshBlobKey('', 'https://signed.example/a.jpg')).toBeNull()
  })

  it('needs no reverse mapping: it works for a url that was never registered', async () => {
    const key = 'user/u1/artists/a1/p.jpg'
    vi.spyOn(backend.blobs, 'getUrl').mockResolvedValue('https://signed.example/fresh.jpg')
    expect(await refreshBlobKey(key, 'https://signed.example/never-registered.jpg')).toBe('https://signed.example/fresh.jpg')
  })
```

In `src/test/ArtistImage.test.jsx`, the retry cases mock `refreshBlobKey` instead, render `<ArtistImage src={{ key: 'user/u1/artists/a1/p.jpg' }} … />` with the key's URL registered through `registerBlobUrl`, and assert the mock is called with `('user/u1/artists/a1/p.jpg', <the failed url>)`. Keep every behavioural case (one retry, pending duplicate error, re-arm on load, A→B→A).

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/test/blobUrlExpiry.test.js src/test/ArtistImage.test.jsx`
Expected: FAIL — `refreshBlobKey` is not exported.

- [ ] **Step 3: Implement**

`src/data/blobUrls.js` — replace `refreshedBlobUrl` and its comment:

```js
// An <img> showing `failedUrl` for `key` has just errored. State holds the key,
// not the url, so the usual cause is a signed url that expired while the image
// sat on screen (#82). Hands back a different url if the key can produce one,
// or null when there is nothing more to try: no key, or a url the cache still
// considers fresh — that is a genuinely broken image, not an expiry.
export async function refreshBlobKey(key, failedUrl) {
  if (!key) return null
  const fresh = await resolveBlobKey(key)
  return fresh && fresh !== failedUrl ? fresh : null
}
```

`src/components/ArtistImage.jsx`: import `refreshBlobKey` and `refKey`; in `handleError`, `fresh = await refreshBlobKey(refKey(src), displaySrc)`. Update the two comments that describe the reverse lookup: the key now comes from the ref the caller passed.

`grep -rn "refreshedBlobUrl" src` must print nothing.

- [ ] **Step 4: Run and verify** — the two files PASS; full suite; lint.

Mutation check: make `refreshBlobKey` return `null` unconditionally → an `ArtistImage` recovery case goes red.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(images): recover an expired url by key, not by reverse lookup (part of #117)"
```

---

### Task 8: Invariant test, docs, counts, PR 2

**Files:**
- Test: `src/test/docStateIsStoredForm.test.jsx` (new)
- Modify: `docs/ARCHITECTURE.md`, `CLAUDE.md`, `README.md`; `src/pages/Help.jsx` / `docs/` only if they describe offline concept behaviour that changed

- [ ] **Step 1: Write the invariant test**

```jsx
// src/test/docStateIsStoredForm.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { useStorage } from '../hooks/useStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { ideasCodec, conceptsCodec } from '../data/imageCodec'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

const IDEAS = [{ id: 'i1', title: 'Koi', images: [{ key: 'user/u1/ideas/i1/a.jpg', note: 'n' }, { url: 'https://example.com/b.jpg', note: '' }], updatedAt: '2026-10-01T00:00:00.000Z' }]
const CONCEPTS = [{ id: 'c1', prompt: 'Moth', imageUrl: 'user/u1/concepts/c1/a.jpg', variants: [{ id: 'v1', imageUrl: 'user/u1/concepts/c1/v.jpg' }], updatedAt: '2026-10-01T00:00:00.000Z' }]

const cases = [
  ['ideas', 'tattoo_ideas', ideasCodec, IDEAS],
  ['concepts', 'tattoo_concepts', conceptsCodec, CONCEPTS],
]

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
})
afterEach(() => vi.restoreAllMocks())

describe.each(cases)('%s state is its own stored form', (collection, key, codec, rows) => {
  const seed = () => {
    localStorage.setItem(key, JSON.stringify(rows))
    localStorage.setItem(`tattoo_remote_u1_${collection}`, JSON.stringify(rows))
  }
  const mount = () => renderHook(() => useStorage(key, [], codec), { wrapper })
  const expectStored = (value) => expect(codec.toCanonical(value)).toEqual(value)

  it('after hydrate and the first pull, online', async () => {
    seed()
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]).toEqual(rows))
    expectStored(result.current[0])
  })

  it('after hydrate, offline', async () => {
    seed()
    vi.spyOn(backend.store, 'list').mockRejectedValue(new Error('offline'))
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]).toEqual(rows))
    expectStored(result.current[0])
  })

  it('after an edit, and the cache matches state', async () => {
    seed()
    const { result } = mount()
    await waitFor(() => expect(result.current?.[0]).toEqual(rows))
    act(() => result.current[1]((prev) => prev.map((r) => ({ ...r, tags: ['blackwork'] }))))
    expectStored(result.current[0])
    const cached = JSON.parse(localStorage.getItem(key)).map(({ editGen, updatedAt, ...rest }) => rest)
    const state = result.current[0].map(({ editGen, updatedAt, ...rest }) => rest)
    expect(cached).toEqual(state)
  })
})
```

`tattoo_ideas` and `tattoo_concepts` are the cache keys `App.jsx` passes to `useStorage`.

- [ ] **Step 2: Run it** — `npx vitest run src/test/docStateIsStoredForm.test.jsx` → PASS (Tasks 3 and 5 already made it true). Mutation check: make `conceptsCodec.toDisplay` blank `imageUrl` → the offline case goes red. Restore.

- [ ] **Step 3: Docs**

- `docs/ARCHITECTURE.md` §2, §3 and "Where things live": idea, concept and variant state holds stored refs; resolution happens at render through `useImageSrc` / `useImageStatuses` / `resolveImage*`; `ensureUploaded` returns `{ value, moved }`; `unresolvedImageKey` and `refreshedBlobUrl` are gone; the reverse map survives only for artist producers and the legacy overlay (#118). Run `npm run docs:check` if a Mermaid diagram changed.
- `CLAUDE.md` storage paragraph: replace "the in-memory value stays a displayable URL (so consumers like STL export are unchanged) while only `{ key }` is persisted/synced" with a sentence saying the in-memory value is the stored ref and consumers resolve at the leaf.
- `README.md`: re-take the counts from a real run.

- [ ] **Step 4: Full verification**

`npx vitest run`, `npx eslint .`, `npm run build`. CI's e2e job is the arbiter for `offlinePlaceholders.e2e.js`, `viewers.e2e.js`, `stl.e2e.js`, `tryon.e2e.js`, `routes.subpath.e2e.js`.

- [ ] **Step 5: Commit, push, open PR 2**

```bash
git add -A && git commit -m "test,docs: idea and concept state is its stored form (fixes #117)"
git push -u origin refactor/concept-stored-refs
gh pr create --title "refactor(concepts): concept and variant state holds stored image refs" --body "Fixes #117. …"
```

PR body: what changed, every mutation check, and the follow-ups below.

## Follow-ups (not in this plan)

- Artist producers emit refs, then delete `keyForUrl` / `urlToKey` — its own plan, together with #118's legacy sweep, once the intake work on `AddArtistModal` / `Gallery` settles.
- A photo that settles `unavailable` is not retried when the connection returns until the component remounts — same as `useImageSrc` today.
