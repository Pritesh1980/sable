# Sable — Architecture

Sable is a local-first tattoo-planning PWA for a single user. It is built as though
it had a team, because the constraints of a personal app are real constraints: it has
to work on a phone in a tunnel, it must not leak the owner's curated collection to
anyone else, and it should be possible to change hosting provider without rewriting
the app.

Three ideas carry the design:

- a **vendor-SDK boundary**, so the backend can be swapped without touching app code
- **local-first sync**, so the UI never waits for a network
- **on-device visual matching**, so the saved artist library is not uploaded for
  embedding

The README has the short version. This document is the detailed one, including the
trade-offs that were taken deliberately and the limits that are still open.

Checked against the source on **12 September 2026**. Diagrams describe implemented
runtime paths; checked-in data and planned features are identified separately.

---

## System context

Sable's main runtime is the browser: React, the offline cache, image processing, and
the Taste Engine all execute on the device. Static assets arrive from GitHub Pages.
Persistent account data crosses the backend adapter boundary, while explicitly
requested generation, screenshot analysis, or artist discovery calls the selected AI
provider directly with a key supplied by the user.

```mermaid
flowchart LR
  PERSON["Owner or demo visitor"]

  subgraph DEVICE["Browser or installed PWA"]
    PWA["Sable React app"]
    CACHE[("localStorage and IndexedDB<br/>offline cache")]
    CLIP["CLIP Taste Engine<br/>on-device only"]
    SEAM{{"Backend adapter<br/>auth · documents · blobs"}}
    PWA <--> CACHE
    PWA --> CLIP
    PWA --> SEAM
    RADAR["Radar imports and Top picks<br/>device-local / derived"]
    PWA --> RADAR
    RADAR <--> CACHE
  end

  PAGES["GitHub Pages<br/>static host"] -- "app shell and route chunks" --> PWA
  SEAM --> LOCAL["Local adapter<br/>default and demo"]
  SEAM -. "optional selected adapter" .-> SUPA["Supabase"]
  SEAM -. "reserved, not implemented" .-> AWS["AWS"]
  PWA -. "user-initiated generation, discovery,<br/>or screenshot analysis" .-> AI["OpenAI or Gemini APIs"]
  MODELS["Model hosting"] -- "download model / processor on demand" --> CLIP
  PERSON --> PWA
```

This view separates three things that are easy to conflate:

- **delivery** comes from GitHub Pages
- **synced account data** goes through the backend seam; device-only imports,
  preferences and derived caches do not
- **optional AI requests** go directly to a provider and never become an implicit
  backend dependency

---

## 1. The app never imports a vendor SDK

Account auth, synced documents, and backend blob calls pass through `src/backend/`.
`createBackend()` (`src/backend/index.js`) selects one adapter set — `auth`, `store`,
`blobs` — from `VITE_BACKEND` (`local` | `supabase` | `aws`, default `local`). The
Supabase adapter is statically bundled today, but its client is constructed lazily only
when that adapter is selected. Optional AI calls use direct HTTP modules under
`src/data/`; they do not bypass this persistence boundary because they do not own
account or synced application data.

```mermaid
flowchart LR
  subgraph APP["React app"]
    UI["Pages and components"]
    HOOKS["useStorage / useArtistStorage"]
  end
  subgraph CACHE["Device cache — always available"]
    LS[("localStorage<br/>tattoo_* metadata")]
    IDB[("IndexedDB<br/>image bytes")]
  end
  subgraph BE["src/backend — account persistence boundary"]
    SEAM{{"createBackend()<br/>VITE_BACKEND"}}
    L["local<br/>offline default"]
    S["supabase<br/>client created on selection"]
    A["aws<br/>reserved"]
  end
  UI --> HOOKS
  HOOKS --> LS
  HOOKS --> IDB
  HOOKS -- "last-write-wins on updatedAt" --> SEAM
  SEAM --> L
  SEAM --> S
  SEAM --> A
```

The payoff is concrete. Moving from Supabase to AWS means writing one new adapter,
not editing pages, hooks or components.

The local adapter (`src/backend/local/`) is a complete offline stand-in rather than a
stub: sessions in `localStorage`, a simulated remote document store under its own
`tattoo_remote_*` namespace, blobs in IndexedDB. That is why the entire suite runs with
**no network and no credentials**, and why the public demo needs no account backend or
provider credentials — `npm test` is pinned to the local backend in `vite.config.js`,
so a `VITE_BACKEND=supabase` in a local `.env` cannot leak into a test run.

The local adapter and an in-memory mock run through the same contract test
(`src/test/backendContract.test.js`), proving that the seam is substitutable without
requiring provider credentials. The Supabase adapter implements the same documented
interface but is not exercised by that offline suite; AWS remains reserved.

**Owner gating.** `src/backend/owner.js` defines a single owner account by email
(`VITE_OWNER_EMAIL`). The owner keeps the curated `DEFAULT_ARTISTS`; every other
account starts empty. This rule is applied in two places that must agree — the sync
reconcile *and* the first render — see §2.

### React composition and route ownership

`AppShell` is the composition root for user data. It mounts only after
`ProtectedRoute` has resolved an authenticated user, owns five synced collections and
two device-only convention collections,
and passes them down to route-level pages. It is keyed by the user's id, so signing in
as someone else remounts it, and every collection store with it, rather than handing
one user's in-memory data to the next (§10). The Wall is eager for first paint; every
other page is lazy-loaded on first navigation and cached by the service worker after
delivery.

```mermaid
flowchart TB
  ENTRY["main.jsx"]
  PROVIDERS["AuthProvider → ThemeProvider<br/>BrowserRouter with deploy basename"]
  GATE{"ProtectedRoute"}
  LOGIN["Login"]
  SHELL["AppShell, keyed by user id<br/>shared data and navigation"]
  STATE["useArtistStorage<br/>useStorage: ideas · concepts · boards · convention overrides"]
  LOCALSTATE["Device-only useStorage<br/>convention lineups · winners"]
  UNDO["UndoProvider<br/>one shared offer above routes"]

  subgraph PRIMARY["Primary navigation"]
    WALL["/ — Wall"]
    GALLERY["/gallery — Artists"]
    BRIEF["/brief — Ideas and Boards"]
    CONCEPTS["/concepts — AI Concepts"]
  end

  subgraph SUPPORT["Supporting journeys"]
    PIPELINE["/pipeline — Pipeline"]
    RADAR["/conventions — Radar"]
    STUDIOS["/studios — Studios"]
    SETTINGS["/settings — Settings"]
    HELP["/help — Help"]
  end

  LEGACY["Legacy redirects<br/>/manage → /gallery?mode=manage<br/>/boards → /brief?tab=boards"]
  SHARE["Share landing redirect<br/>/share → /gallery?shared=1"]

  ENTRY --> PROVIDERS --> GATE
  GATE -- "signed out" --> LOGIN
  GATE -- "signed in" --> SHELL
  SHELL --> STATE
  SHELL --> LOCALSTATE
  SHELL --> UNDO
  UNDO --> PRIMARY
  UNDO --> SUPPORT
  LEGACY --> PRIMARY
  SHARE --> PRIMARY
```

There are nine current feature routes: four primary destinations and five supporting
ones. Two legacy redirects preserve old links, and `/share` is a third redirect for
screenshot intake (§5). Redirects do not own state or UI. `UndoProvider` sits above
the routes so a saved-image removal remains undoable after closing its viewer or
navigating; its offer is in memory, not persisted across reloads.

### Which state takes which path?

`collectionFor()` in `src/backend/sync.js`, not the use of `useStorage` alone,
determines whether a value syncs.

| State | Storage key / processing | Backend collection |
|---|---|---|
| Artists | `tattoo_artists_meta` | `artistsMeta` |
| Ideas | `tattoo_ideas` | `ideas` |
| Concepts | `tattoo_concepts` | `concepts` |
| Boards | `tattoo_boards` | `boards` |
| Convention attendance overrides | `tattoo_convention_attending` | `conventionOverrides` |
| Imported lineups | `tattoo_convention_lineups` | Not synced |
| Imported winners | `tattoo_convention_winners` | Not synced |
| Winner photo bytes | `tattoo-winner-photos-v1` IndexedDB; records carry `photoIds` | No |
| Top picks | Derived in memory from lineup, gallery, studios and curated picks | No separate collection |
| Theme, font, API keys, composer draft | Device-local preferences / draft | No |
| CLIP vectors | Model-keyed IndexedDB cache | No |
| Shared screenshot awaiting intake | `sable-share-v1` Cache Storage, consumed once | No |

Here, “sync” means the selected backend protocol. The local adapter's simulated remote
is still on this device; only a configured remote adapter enables cross-device data.
The seven `tattoo_*` keys above are localStorage metadata stores. Attendance overrides sync as
one singleton map with whole-map last-write-wins; the other synced collections use
individual records. `readmeClaims.test.js` compares this table with the runtime sync
mapping, including the two device-only convention stores. It does not validate every
claim in these diagrams; the behavioural suites and source review remain necessary.

---

## 2. The write path: re-ranking an artist with no signal

Local-first means the UI never waits for a server. The edit lands in memory and on
the device immediately; reconciliation is a background concern. The engineering is in
what happens when the network is absent, then the app mounts or the user edits after
connectivity returns.

1. **The edit applies locally first.** State updates and the metadata cache is written
   in the same call, before React re-renders. No spinner, no network in the path.
2. **Changed rows are stamped, once.** Only genuinely-edited records get a fresh
   `updatedAt` (`stampChangedRows`, `src/backend/dirty.js`). Over-stamping would let
   untouched rows outrank real edits made on another device.
3. **Durable edit generations are written.** List rows carry a local `editGen`,
   mirrored in a per-row sidecar. The attendance singleton uses a per-key dirty flag,
   timestamp and generation. These survive a reload so interrupted work can retry.
4. **Deletes are tombstoned separately.** An artist removed offline must not ride
   back in on the next pull, so pending deletes are held until the remote confirms —
   and are cancelled if the same handle is re-added before the sync lands.
5. **Flushes are chained, never concurrent.** Two in-flight pushes could complete out
   of order and regress the synced baseline, so each waits for the previous one.
   Ordering is a correctness property here, not a nicety.
6. **Reconcile by last-write-wins.** On a later mount or edit after reconnect, local
   and remote merge per record on `updatedAt` (`reconcileRecords`,
   `src/backend/sync.js`).

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as Page or component
  participant Hook as Storage hook
  participant Cache as localStorage
  participant Sidecar as Edit generations and delete sidecars
  participant Queue as Serialized flush queue
  participant Remote as Selected backend store

  User->>UI: Edit, rank, or delete a record
  UI->>Hook: setValue updater
  Hook->>Hook: Stamp only changed rows
  Hook->>Cache: Persist canonical value immediately
  Hook->>Sidecar: Track edit generations and record tombstones
  Hook-->>UI: Render updated state without waiting

  Note over Hook,Queue: Debounce for 500 ms
  Hook->>Queue: Enqueue latest flush
  Queue->>Remote: Upsert rows without editGen and remove tombstoned ids

  alt Remote write succeeds
    Remote-->>Queue: Confirm writes
    Queue->>Sidecar: Confirm matching generations and completed tombstones
    Queue->>Hook: Advance synced baseline
  else Offline, interrupted, or provider error
    Remote--xQueue: Write fails
    Queue-->>Sidecar: Leave durable sidecars in place
  end

  Note over Hook,Remote: Later mount or edit after reconnect
  Hook->>Remote: List remote collection
  Remote-->>Hook: Return persisted rows
  Note over Hook,Sidecar: Sidecars are read after the await, not before it
  Hook->>Sidecar: Read dirty state and pending deletes
  Hook->>Hook: Filter tombstones and reconcile by updatedAt
  Hook->>Cache: Persist reconciled canonical value
  Hook-->>UI: Hydrate reconciled display value
  Hook->>Queue: Retry while dirty state remains
```

The dirty marker and tombstones are deliberately separate from the cached collection:
the collection describes what the user currently wants, while the sidecars describe
which remote effects have not yet been acknowledged. That distinction is what lets a
delete survive closing the tab inside the debounce window. A successful push clears
only the generation it actually sent: another tab's newer row remains pending. The
row's own `editGen` is the proof, not a snapshot of the shared sidecar at flush start.
This is acknowledgement safety, not live cross-tab state broadcasting.

**The first pull reads the sidecars after the list call returns, not before it.** The
remote list is an `await`, and the user can edit or delete a row while it is in flight.
Reading dirty state and pending deletes first meant a mid-pull edit was overwritten by
the older remote row, and an artist deleted mid-pull was resurrected by it. Ideas and
concepts already read late; artists now do too (#101). The diagram above shows the
corrected order.

### One engine, and its lifecycle

The protocol above lives in one place, `src/sync/collectionStore.js` (#111): a
framework-free store per collection, bound to React by `useCollection`
(`useSyncExternalStore`, with a setter that never changes). `useStorage` is a thin
wrapper that creates one per component and starts it with the signed-in user; it backs
ideas, concepts, boards, attendance and the device-only stores. `useArtistStorage` is
the same wrapper plus a **policy** (#112, `src/data/artistsPolicy.js`): optional hooks
the engine calls for what is specific to a collection. `initial` shapes the first paint
(owner seeding, #25), `onMount` runs once before hydration (the legacy `tattoo_artists`
import and the IndexedDB photo cache, `src/data/legacyArtistImages.js`),
`beforeFirstPull` runs before the list (the one-time legacy photo migration) and hands
its result to `merge`, which replaces the generic reconcile (LWW, image tombstones #55,
owner defaults, the empty-remote seed push, the post-migration restamp), and `onEdit`
runs on the stamped rows (normalising to refs, tombstones, display cache). Artist state
holds the stored refs themselves (#116), so the codec is thin: `toCanonical` is
`canonicalizeArtist` and `toDisplay` only adds the legacy overlay (§3). `src/test/collectionStore.test.js`
and `collectionStorePolicy.test.js` pin the engine without React;
`artistsPolicy.test.js` pins each artist rule.

`set(updater)` does the stamping, tombstones and generations outside any React updater
and writes the offline cache before it returns. Previously the cache was written in an
effect after the render, so this is strictly more durable. A store with no backend
collection only persists.

The lifecycle is written down because React runs it twice in development:

- **Creating a store has no side effects.** It only reads the offline cache, because
  StrictMode calls lazy initialisers twice.
- **`start(user)` and `stop()` are re-entrant.** Each start opens an epoch, and a
  hydration or pull result from an older epoch is discarded, as the hook's per-effect
  `cancelled` flags used to do. A start's work begins a microtask later, so StrictMode's
  start → stop → start in development lists the remote once, not twice.
- **Hydration is independent of the first pull.** The generic engine resolves cached
  refs to display URLs even while `list()` hangs offline (artists have nothing to
  resolve: they paint refs, and `toDisplay` only overlays legacy photos). A hydration that loses the race to an edit or to
  the pull is dropped rather than applied over them, so a late one can never undo an
  edit or hide rows the pull brought in.
- **`stop()` cancels the pending push but not a flush in flight.** That flush still lands
  and clears its own tombstones and generations. Anything still unconfirmed is pushed
  by the next start's pull, from the durable sidecars. An edit made while stopped is
  parked, as React treats a state update: applied if the store starts again
  (StrictMode's dev remount re-runs child effects before the shell's), dropped if its
  owner has really unmounted. So a slow callback finishing after sign-out cannot write
  into the cache the next account reads.

### First paint must agree with the reconcile

A subtle class of bug lives here. `useArtistStorage` renders from the local cache
before sync resolves, so **whatever the first paint computes must match what the
reconcile will settle on** — any divergence is visible as a flash of the wrong data.

The specific case (issue #25): `applyDefaults()` does not only fill in missing fields,
it *appends* every `DEFAULT_ARTISTS` entry not already stored. Applying it
unconditionally on first paint meant a non-owner briefly saw their own data plus all
of the owner's curated artists, which the reconcile then removed. The current
initializer and reconcile use `seedsOwnerData(user)`: owner identity plus the build's
owner-seed flag.

This is safe because `App.jsx` mounts `AppShell` inside `ProtectedRoute`, which holds
a spinner until the session resolves — so `user` is known before the hook's first
render. An explicit sign-out nulls the user and purges local caches, so signing in
again remounts and re-runs the initializer. A direct signed-in identity swap remounts
it too, because the shell is keyed by the user's id (§10).

The guarantee is **membership parity with the cache**, not with the final state: a
later pull can still add remote rows the cache never had. That is a pull, not a flash
of the wrong identities. (Artist photos no longer hydrate separately: the rows paint
with their refs, #116.)

---

## 3. Images never travel inside documents

A synced record carries a small canonical reference — a storage key — while the bytes
live in blob storage. For ideas and concepts the in-memory field is a displayable URL, so
components (and features like STL export) are unaware of the split; artists hold the
stored refs themselves (#116) and resolve each at display time.

```mermaid
flowchart LR
  MEM["In memory<br/>displayable URL"]
  CODEC{{"per-collection codec"}}
  DOC["Synced document<br/>{ key } only"]
  BLOB[("Blob storage<br/>bytes")]
  MEM --> CODEC
  CODEC -- "canonical ref" --> DOC
  CODEC -- "bytes uploaded once" --> BLOB
  DOC -. "resolve on read" .-> MEM
  BLOB -. "resolve on read" .-> MEM
```

Per-collection codecs (`src/data/imageCodec.js`) translate at the persistence
boundary. The rule that makes it hold is enforced rather than trusted: base64 data
never reaches `localStorage` or the remote store, and there is a test asserting it.
Legacy inline images migrate to blobs on first authenticated load.

Documents stay small enough to sync cheaply; bytes move once.

### A ref that cannot be resolved is not a ref that is gone

Turning a `{ key }` into a displayable URL needs the bytes, and offline the bytes may
not be reachable. Before #101 an unresolved ref simply vanished from the in-memory
list, and the next save wrote that shortened list back — a device that merely
*started* offline would then have removed its own photos from the server.

Now nothing is held aside. Artist state holds the stored refs (#116): `artist.images`
is static paths, `{ key }` and `{ url, addedAt }`, one entry per photo, so an unresolved
ref is simply still in the list and `canonicalizeArtist` has nothing to reinsert (it
only strips inline data URLs). `initial()` paints those rows directly; for the owner
`applyDefaults` unions the starter photos in, tombstone-aware and de-duplicated by
identity. `codec.toDisplay` is async and does one display-only thing, the legacy-cache
overlay: never-migrated IndexedDB data URLs are prepended (idempotent; for an artist
whose cache holds data URLs not yet recognised it first resolves that artist's own blob
keys, so a keyed photo is not shown twice), and `onEdit` refreshes the in-memory legacy
cache. `onEdit` also normalises whatever a producer emitted into refs
(`normalizeArtistImages`, `dedupeRefs`) and writes the tombstones. Concepts and their
variants still use `unresolvedImageKey` in `imageCodec.js`. What the user sees is
unchanged: `ArtistDetail` renders one `PhotoTile` per ref (`src/components/PhotoTile.jsx`).
A ready photo is interactive; a key still resolving is an empty `aria-busy` box, so a
normal online start shows no placeholder flash; an unavailable one is the `OfflinePhoto`
"Available when online" tile at its original position (#102). Remove and Set-cover act
on the latest list, and a photo that is not ready cannot be opened or edited. A concept
with an `unresolvedImageKey` stays on the wall as an offline piece rather than dropping
into Drafts. Photo counts ("N with photos", the ranking queue) include offline photos.

### An old URL must still lead back to its key

Saving turns display values back into refs through the URL→key map in
`src/data/blobUrls.js`, and a signed URL resolved at hydration can still be in state
long after its TTL refresh. So a superseded URL keeps its mapping for the session
(#110). Dropping it, as the map once did to stay small, meant the next save stored
the expiring URL in place of the key, and last-write-wins spread that to every
device. Keeping refs in state removes the reverse map altogether: artists now do (#116), ideas
and concepts are planned in #109.

### Bytes are staged before the key exists

Every add path (`withStagedImages` / `stageImages` in `src/data/imageStaging.js`) writes
the bytes to IndexedDB (`tattoo-staged-images-v1`) and an entry to the
`tattoo_upload_outbox` list before the `{ key }` ref reaches state, so base64 never
reaches localStorage or the remote and a photo added offline survives a reload.
`resolveBlobKey` consults staged bytes before the backend, so a staged photo displays
immediately. `drainOutbox` uploads on launch, on the `online` event and at the start of
every flush, and drops an entry from the outbox only after the upload is confirmed. The device copy of the bytes is kept after that, because the display cache holds only `{ key }` and the copy is what keeps the photo visible on an offline reload. The IndexedDB
display cache stores keyed photos as `{ key }`, not a data URL, so a reload cannot show
the same photo twice. Both stores are device-local and purged on sign-out.

### The same split, without the sync half

Photos of competition-winning tattoos (`src/data/winnerPhotos.js`) take a shorter
version of this path. The record keeps an id and the bytes go to IndexedDB — but
directly, with no codec and no blob storage, because the winners collection is
device-local and never syncs.

The reason for splitting at all is different too, and worth stating because it is
easy to get wrong twice. For synced collections the driver is *sync cost*: a
document carrying base64 is expensive to move. Here the driver is **quota**.
Winners arrive as phone screenshots, and a dozen data URLs exceed the browser's
~5MB per-origin `localStorage` budget — a budget shared with the gallery's entire
offline cache, so overflowing it does not degrade the winners board, it breaks the
app. A contract test asserts `winnerPhotos.js` never calls `localStorage`.

| | Synced collections | Winner photos |
|---|---|---|
| Record holds | `{ key }` canonical ref | `photoIds: []` |
| Bytes live in | blob storage, via codec | IndexedDB, directly |
| Split exists because | sync cost | localStorage quota |
| Sign-out behaviour | Account data retained by backend; display cache purged | Board references purged; photo bytes currently remain |

The current `purgeLocalUserData()` does **not** invoke `clearWinnerPhotos()` or delete
the winner-photo database. Removing board references is not secure byte erasure;
orphaned winner images can remain on the device. This is an implementation gap, not a
promised cleanup guarantee.

---

## 4. On-device taste model

Sable matches artists by visual similarity, not only tag overlap. CLIP embeddings are
computed **in the browser** via `@huggingface/transformers`, so building matches never
uploads the saved reference library — the privacy-preserving choice, and the one with
no inference bill. This is distinct from screenshot intake (§5), where the user
explicitly chooses one image to send to Gemini for analysis.

```mermaid
flowchart TB
  IMG[("Reference images<br/>on device")]
  EMB["embedder.js<br/>dynamic import only"]
  IDX[("Style index — IndexedDB<br/>keyed by model id, not synced")]
  SIG["Taste signal<br/>from rank and status history"]
  OUT1["Similar-ink artist matching"]
  OUT2["Concept to artist matching"]
  MODEL["Hosted CLIP model and processor"]
  IMG --> EMB --> IDX
  IDX --> OUT1
  IDX --> OUT2
  SIG --> OUT1
  MODEL -- "on-demand download; WebGPU / WASM inference locally" --> EMB
```

The model is heavy, so the binding constraint is that it must never enter the initial
bundle. That is enforced by a contract test (`src/test/styleIndex.test.js`) asserting
the library is only ever reached through a **dynamic** `import()` inside one embedder
module — a guarantee a code comment cannot make.

The index is treated as a cache, not as data: it lives in IndexedDB
(`tattoo-style-index-v2`), keyed by model id and photo identity (`refIdentity`, stable across sessions), excluded from sync, and rebuilt per
device — because it is fully derivable from images the device already has. Losing it
costs time, never data.

“On-device” describes inference, not a network-free first run: model files must be
downloaded, and remote reference URLs may need fetching. Reference pixels are not
uploaded to a model service to compute embeddings.

Relevant modules: `src/data/embeddings.js`, `taste.js`, `styleIndex.js`, `embedder.js`.

---

## 5. A screenshot is untrusted input

Artists are discovered on Instagram, so Sable accepts a screenshot and pre-fills a
form from it using a vision model (`src/data/screenshotIntake.js`). That makes an
image an untrusted input channel, and text inside an image is a documented
prompt-injection vector.

Three defences, all in the parsing layer rather than in prose:

| Layer | Defence |
|---|---|
| Prompt | States that text visible in the image is **data to extract, never instructions to follow**, and says so in both intake prompts. |
| Parser | Strict: one accepted pipe-delimited shape, with handles and style tags validated against allowlists, so a hallucinated tag cannot enter the data model. |
| Transport | The user-supplied key travels in an `x-goog-api-key` **header**, never a query string — the version that ends up in logs and browser history. |

The model is treated as a suggestion engine whose output must survive validation, not
as a trusted source.

### Share delivery and staged-image lifetime

On supported installed PWAs, the service worker handles the share POST itself;
GitHub Pages cannot serve that POST. **iOS Safari does not support Web Share Target**
([WebKit tracking issue](https://bugs.webkit.org/show_bug.cgi?id=194593), checked
17 September 2026). On iPhone, use the Shortcut/paste route: it reaches the same
intake screen without this POST path. See the [setup guide](02-managing-artists.md#share-a-screenshot-straight-from-instagram).

```mermaid
flowchart TB
  OS["Supported Web Share Target platforms<br/>OS shares image to installed PWA — not iOS Safari"]
  POST["Same-origin POST to base + share"]
  SW["Service worker<br/>clear old stash; keep first image"]
  STASH[("sable-share-v1<br/>one pending screenshot")]
  LAND["303 → /share?shared=1<br/>route → /gallery?shared=1"]
  TAKE["takeSharedImage<br/>read and delete stash once"]
  PASTE["iPhone: Shortcut → paste<br/>Also: paste, drop or file picker"]
  STAGE["AddArtistModal<br/>staged File + analysis generation"]
  AI["Optional Gemini analysis<br/>validated details and crop bounds"]
  CROP["Local canvas crop<br/>retain original for restore"]
  TASTE["Optional local taste score<br/>only with existing style vectors"]
  VERIFY["User verifies fields and image<br/>manual edits retain ownership"]
  SAVE["Upload selected bytes via backend<br/>add artist or append to existing"]

  OS --> POST --> SW --> STASH
  SW --> LAND --> TAKE
  STASH --> TAKE --> STAGE
  PASTE --> STAGE
  STAGE -- "key available" --> AI --> CROP --> TASTE
  STAGE -- "no key: whole image, rough score" --> TASTE
  TASTE --> VERIFY --> SAVE
```

Async results belong to one staged file and analysis generation. Removing that file
invalidates its pending results, clears only AI-owned prefills, and starts analysis of
the next file. Taste scoring has an additional revision guard so restoring the whole
screenshot cannot be overwritten by a late crop score. Saving a new artist is blocked
while intake processing is busy. See `AddArtistModal.jsx`, `screenshotCrop.js`, and
`src/sw/shareTarget.js`.

Saved-image removal uses a separate recovery path: the removal persists immediately,
then the app-wide undo offer can restore it through the normal storage setters.
Consecutive removals from one source can form one batch (5-second offer, 12-second
maximum batch lifetime). Closing a route does not discard a durable offer; reloading
the app does. Undo is a new local edit, not a rollback transaction in the backend.

---

## 6. Offline delivery and the service worker

The service worker is not bundled, so Vitest cannot import it — the classic gap where
stale-cache bugs live. The pattern here splits the difference: decision logic lives in
ordinary importable modules with unit tests (`src/sw/swStrategy.js`,
`src/sw/precache.js`), and a **contract test reads the shipped `public/sw.js` as text**
and asserts its invariants still hold.

```mermaid
flowchart TB
  REQ(["fetch"]) --> SHARE{"same-origin POST<br/>to base + share?"}
  SHARE -- yes --> INTAKE["stash first image<br/>303 redirect to share landing"]
  SHARE -- no --> GET{"GET?"}
  GET -- no --> PASS["pass through"]
  GET -- yes --> ORIGIN{"same origin<br/>or Google Fonts?"}
  ORIGIN -- no --> PASS
  ORIGIN -- yes --> Q1{"navigation or document?"}
  Q1 -- yes --> NF["network-first<br/>a deploy is never masked"]
  Q1 -- no --> CF["cache-first<br/>with background refresh"]
  INTAKE --> OK([response])
  NF --> OK
  CF --> OK
  PASS --> OK
```

The routing rule is deliberately asymmetric. Navigations are network-first, so a
deploy is never masked by a cached HTML document. Every same-origin non-document GET,
plus Google Fonts, is currently cache-first with a background refresh; cross-origin
requests other than those fonts bypass the worker. The intended same-origin traffic is
static assets, but the predicate is broader than `/assets/`: any future same-origin API
or private-image route must add an explicit bypass or tighten the predicate before it
ships. Activation preserves the separate share stash, removes obsolete asset buckets
and sweeps hashed assets absent from the current manifest. The page reloads once
when a new worker takes control.

The build is **base-aware**: the router `basename`, the worker, and the precache
manifest all derive their base path from `VITE_BASE`, so the same code serves from a
domain root or a project sub-path (the demo runs under `/sable/`). The PWA manifest
gets there differently — `public/` is copied verbatim, so nothing rewrites `base` into
it and its URLs are relative (`./icons/…`), resolved by the browser against the
manifest's own location.

Image paths are the one place where the base must *not* be applied early. They are
persisted and synced — `canonicalizeImages` writes static paths verbatim into
localStorage, IndexedDB and the remote store — so a build-time base written into a
record outlives the build that made it, and a later move to a different base would
strand every stored path on every device. Seed data is therefore base-relative
(`images/artists/…`), and `resolveAssetPath` (`src/data/assetPath.js`) applies the base
at display time. Artist photos render through one boundary: `ArtistImage` takes the
stored ref and resolves it with `useImageSrc` (`src/hooks/useImageSrc.js`, backed by
`src/data/imageResolver.js`), so selectors such as `buildWallItems` carry refs, never
resolved strings. A ref is a static path, a display URL, `{ url, addedAt }` or a blob
key (`src/data/imageRef.js`: `isBlobKey` is `startsWith('user/')`, `refIdentity` is
key-first and base-independent); a cached key is `ready` on the first render, an
uncached one is `loading` until it resolves. Ideas and concepts still go through
`getImageUrl`. `resolveAssetPath` passes protocol URLs (`blob:`, `data:`, `http(s):`)
through untouched and rebases legacy root-absolute or already-based paths, so stored
records heal on read rather than needing a migration.

### Build and delivery pipeline

Base awareness is threaded through the whole delivery path rather than patched at the
router alone. A Pages build prefixes assets and routes with `/sable/`; a root-hosted
build uses `/`. The precache plugin then injects the exact emitted filenames into the
worker that ships beside them.

```mermaid
flowchart TB
  SOURCE["React source<br/>public/sw.js"]
  CONFIG["Vite build<br/>base = VITE_BASE or /"]
  SPLIT["Eager Wall shell<br/>lazy route chunks"]
  DIST[("dist/<br/>hashed assets")]
  MANIFEST["precachePlugin<br/>select emitted assets"]
  WORKER["dist/sw.js<br/>injected BUILD_MANIFEST"]
  ACTIONS["GitHub Actions<br/>deploy-pages.yml"]
  PAGES["GitHub Pages<br/>/sable/"]
  BROWSER["Browser loads app<br/>router uses same basename"]
  INSTALL["Service worker install<br/>precache emitted assets"]
  ACTIVATE["Activate<br/>purge old cache"]
  OFFLINE["Later offline launch<br/>cached shell and chunks"]

  SOURCE --> CONFIG --> SPLIT --> DIST
  DIST --> MANIFEST --> WORKER
  DIST --> ACTIONS
  WORKER --> ACTIONS --> PAGES --> BROWSER
  BROWSER --> INSTALL --> ACTIVATE --> OFFLINE
```

The manifest is produced from build output, not maintained by hand. That prevents a
new route chunk from being omitted simply because someone forgot to update a static
asset list.

---

## 7. Convention ingestion and derived show planning

Radar joins public show information with private gallery decisions. There is no
background roster scraper and no AI request in Top picks. Import and ranking are
separate stages, so importing a show does not add hundreds of artists to the gallery.

```mermaid
flowchart TB
  SEED["Shipped Big London lineup text"]
  PASTE["User pastes published lineup"]
  SHOW["Show page in external browser"]
  GRAB["User-run bookmarklet<br/>scroll and collect Instagram links"]
  HASH["Radar URL fragment handoff<br/>known show id; clear fragment after reading"]
  PARSE["Strict parseLineup<br/>normalize and deduplicate"]
  STORE[("Device-only imported entries<br/>and cleared flag")]
  MERGE["mergeLineupSeeds<br/>user imports override seed floor"]
  GALLERY["Saved artists + attendance"]
  INDEX["indexLineup<br/>match against gallery"]
  AZ["All / Saved / New<br/>searchable artist index"]
  PLAN["buildShowPlan<br/>rank · status · styles · studio connections"]
  CURATED["Bundled studios and curated picks<br/>priority / wildcard reasons"]
  PICKS["Top picks<br/>Must see · Wildcards · Worth a look<br/>unmatched curated picks reported"]
  KEEP["Explicit Add artist / attendance toggle"]
  SYNC["Gallery and attendance setters<br/>normal backend sync"]

  SHOW --> GRAB --> HASH --> PARSE
  PASTE --> PARSE --> STORE
  SEED -- "same parser" --> MERGE
  STORE --> MERGE --> INDEX
  GALLERY --> INDEX --> AZ
  INDEX --> PLAN
  GALLERY --> PLAN
  CURATED --> PLAN --> PICKS
  AZ --> KEEP
  PICKS --> KEEP --> SYNC
```

The shipped seed is merged at read time, not copied wholesale into localStorage.
`cleared: true` suppresses it until a new import lifts the flag. Scoring uses existing
gallery rank/status/tags, attendance, studio connections and curated reasons; artists
marked **Pass** are excluded from picks. Unmatched strangers remain in the A–Z list
without invented style scores. `bigLondon2026Floorplan.js` contains checked-in booth
coordinates, but no runtime component consumes them yet: a walking route or map is
not an implemented output of `ShowPlanView`.

```mermaid
flowchart TB
  SOURCE["Pasted published results"] --> PARSER["parseWinners<br/>category · place · artist, not collector"]
  PARSER --> BOARD[("Device-only winners board<br/>merge imports, preserve photoIds")]
  BOARD --> MATCH["Gallery cross-reference<br/>handle, exact name, guarded unique prefix"]
  PHOTO["User attaches winning-piece photo"] --> BYTES[("Winner-photo IndexedDB")]
  BYTES -- "photo id only" --> BOARD
  MATCH --> VIEW["ConventionWinners view<br/>award groups and match rationale"]
  VIEW -- "explicit Add" --> KEEP["Gallery artist with award note<br/>and convention attendance"]
  KEEP --> SYNC["Normal account sync"]
```

Winners are imported from pasted text, not automatically fetched by Gemini. Match
provenance (`matchedBy`) distinguishes exact identity from a guarded name-prefix
match. The gallery artist and attendance record can sync; the imported award board
and its photos cannot. Implementation: `lineup.js`, `lineupGrabber.js`,
`lineupSeeds.js`, `showPlan.js`, `winners.js`, `winnerPhotos.js`, and `Conventions.jsx`.

---

## 8. Demo integrity

The public demo is the same code seeded with a wholly fictional dataset — invented
artists with original AI-generated tattoo imagery, because the owner's real references are
third-party work that never enters the repository (`src/data/demoSeed.js`).

`demoArtwork.js` allowlists immutable full-size WebP paths and their thumbnails.
Stored image references and CLIP inputs keep the full-size path; `ArtistImage`
selects a responsive display source without changing the persistence schema.
`GeneratedArtworkNotice` recognises those asset paths, so provenance remains
visible independently of editable notes or a dismissed introduction. Old SVGs
remain available for previously saved references. The service worker caches these
images on demand, not in the app-shell precache.

Three problems make this more than a fixture:

- **Stale datasets.** A returning visitor can hold data from an older deploy, so
  seeds are versioned (`DEMO_SEED_VERSION`) and re-seeded on any boot — an installed
  PWA launches from `start_url` without the `?demo=1` query that started it. A version
  from a *newer* deploy is left alone, so a rollback in flight never downgrades.
- **Spoofing.** A real account must never be overwritten, so ownership is proved by a
  `demo: true` marker that only the seeder writes. `localAuth.signIn` writes only
  `{ user }`, so no sign-in — even with the demo's own email — can forge it.
- **The other seed.** `DEFAULT_ARTISTS` is the owner's curated list, and its images are
  gitignored third-party work that the public build does not ship. Seeding it there
  showed anyone signing in as the owner a wall of monograms and hundreds of 404s, and
  `OWNER_EMAIL`'s fallback is guessable. The deploy therefore builds with
  `VITE_OWNER_SEED=0` (`src/backend/owner.js`), which is the one behavioural difference
  between the demo build and a real one: identity (`isOwner`) is unchanged, only
  whether a session receives the curated seed (`seedsOwnerData`).

---

## 9. Testing approach

TDD-first: behaviour is specified in a failing test before implementation, and any
change to seed data must keep the data-integrity tests green.

The pattern worth naming is the **contract test**: where a file cannot be imported
(the service worker) or a rule cannot be expressed in types (the dynamic-import
constraint on the AI library, the README's own claims), a test reads the artefact and
asserts the invariant. See `src/test/precache.test.js`,
`src/test/swStrategy.test.js`, `src/test/styleIndex.test.js`,
`src/test/readmeClaims.test.js`.

### A parser is only as good as the data it was written against

TDD guarantees the code matches the test. It guarantees nothing about whether the
test matches reality — and for a parser, that gap is the whole risk.

The winners parser (`src/data/winners.js`) shipped green: 61 tests, every one
passing, written against a plausible-looking results format. Checked afterwards
against an actual published board it read the literal word "Place" as the artist's
name, dropped two rows in three, and — because a real row reads
`1st Place - <collector> tattooed by <artist>` — credited the *collector wearing
the tattoo* rather than the artist, which is backwards for an app about artists.
None of those failures were reachable from the invented format. The tests were
self-consistent and wrong together.

So parsers here are fixtured from **verbatim source data**, and the fixture says
where it came from and when (`src/test/winnersRealFormat.test.js`). The same
applies to `src/data/lineup.js`, whose fixtures come from real pasted line-ups.
When a parser's input is something a third party publishes, an invented fixture
is a guess wearing a test's clothing.

### What jsdom cannot see

Vitest runs in jsdom, which has no layout, no real touch, no stacking order, no camera,
no WebGL and no service worker. A separate Playwright suite (`e2e/`, `npm run test:e2e`)
drives the *built* demo on an emulated iPhone, plus a desktop project and a second build
under `/sable/`. It is its own CI job. It guards page width at 320–390px, swipes and
pinches, which overlay is on top, the fake-camera try-on, the STL download parsed byte by
byte, hover controls on touch, and starting offline. How to run it and what each file
guards is in [MAINTAINING.md](MAINTAINING.md#browser-tests-e2e).

It earns its keep: the Escape-stacking bug (one key press closed a drawer *and* the
viewer beneath it) was invisible to Vitest, because real key presses let React flush
between listeners and `fireEvent` does not.

### A flake is a finding until proven otherwise

Two specs failed intermittently under full-suite load and were long written off as a
fake-IndexedDB artefact (#23). Both had real causes. `useArtistStorage` read an artist's
images straight after mount, but artists then painted with `images: []` and hydrated
from IndexedDB afterwards, so the assertions wait for them (since #116 artists paint
their refs at once; the legacy overlay is still async). `a11yAffordances` scanned each
file for the tag around every expression, which is quadratic in file length; it hit the
5 s timeout under load, and now runs in milliseconds with identical results. Looking for
the second cause also exposed the offline data-loss bug described in §3. The protocol
stays — re-run isolated, CI is the arbiter — with one addition: time a recurring flake
(`npx vitest run --reporter=json`) before calling it environment.

> **Running the suite with worktrees present.** Agent worktrees live inside the repo
> (`.worktrees/`, `.claude/worktrees/`) and Vitest globs their copies from the repo
> root, roughly doubling the reported totals. Use
> `npx vitest run --exclude '**/.worktrees/**'`. Note that `vitest run src/` does *not*
> work — it matches as a substring and picks the worktree copies up anyway.

---

## 10. Trade-offs taken deliberately

Every one of these is a choice with a reason. A design with no stated limits is
usually one whose limits have not been found yet.

**Last-write-wins, not CRDTs.** Conflict resolution is per-record and
timestamp-based. For one user across two devices, concurrent edits to the same record
are rare and the failure mode is losing the older of two edits — acceptable against
the cost of merge structures and a merge UI. Revisit if the app ever gains a second
writer.

**Cross-tab acknowledgement is guarded, live state is not broadcast.** Per-row
generations stop a stale tab's successful push from acknowledging another tab's
unconfirmed edit. Singleton generations protect the attendance map similarly. Tabs
can still hold different in-memory collections; these guards do not provide a shared
live view or conflict-free merging.

**Identity changes purge caches and remount the shell.** `AuthProvider` tracks the last
user across reloads and purges before publishing a different identity, including
passive transitions. `App.jsx` keys `AppShell` by the user's id (#111), so a direct
signed-in A-to-B transition also remounts every in-memory state owner: B's collection
stores start from the purged cache, and stopping A's discards their in-flight pulls.
One narrow gap remains. A push A's store had already started, for instance parked in an
image upload, is not cancelled, and both adapters attribute a write to whoever is signed
in when it lands.

**Winner-photo cleanup is incomplete.** Sign-out removes winners metadata but the
current purge path leaves the separate photo database untouched (§3).

**Full offline needs one online visit.** Assets are precached from a build-time
manifest, but on a first-ever visit they load before the worker takes control. The app
is reliably offline from the second visit; a true cold-start guarantee is larger work.

**Pinned model ids go stale.** Hosted generative model ids are pinned and providers
retire them on their own schedule. Documented as a known maintenance task with the
deprecation page to check, rather than pretending the pin is permanent.

**Load can still expose timing-sensitive specs.** The two long-standing flakes were
root-caused and fixed (§9), but a loaded machine can still surface a different one. The
protocol is written down: re-run isolated, CI is the arbiter, and time it before
blaming the environment.

**Offline placeholders appear only where the photo set is the point.** The artist
detail carousel, the Concepts wall and variant cards show "Available when online" tiles
(§3). Card and wall views that show a single cover fall back to the next loaded photo or
the monogram instead. In the carousel, remove and set cover act on the whole slot
sequence (`fromSlots`), so an offline photo keeps its place relative to its neighbours.

---

## Where things live

| Path | Role |
|---|---|
| `src/backend/` | The vendor boundary: `index.js` factory, `sync.js`, `dirty.js`, `owner.js`, `purge.js`, `local/`, `supabase/` |
| `src/sync/` | `collectionStore.js` — the local-first sync engine (edit-time stamping, tombstones and generations, first pull, chained pushes, start/stop epochs); `useCollection.js` — its React binding |
| `src/hooks/` | `useStorage.js` — thin wrapper over the engine; `useArtistStorage.js` — artists, the same wrapper plus `data/artistsPolicy.js` (#112) |
| `src/data/` | Domain logic: planning, embeddings, taste, staged screenshot intake, convention ingestion and Top picks, demo seed |
| `src/data/lineups/` | Shipped roster and curated picks; floorplan coordinates are data-only, not a runtime map |
| `src/context/UndoContext.jsx` | Shared, time-bounded undo offer and restoration feedback |
| `src/sw/` | Pure service-worker logic, contract-tested against `public/sw.js` |
| `src/pages/`, `src/components/` | UI, 9 feature routes plus 2 legacy redirects and the share landing redirect |
| `src/test/` | The suite, including the contract tests |
| `e2e/`, `playwright.config.js` | Browser suite: emulated iPhone, desktop and `/sable/` sub-path projects; `smoke.live.js` targets the deployed demo |
| `CLAUDE.md` | Agent-facing operations doc: conventions, review protocol, flake protocol |
