# Sable — Architecture

Sable is a local-first tattoo-planning PWA for a single user. It is built as though
it had a team, because the constraints of a personal app are real constraints: it has
to work on a phone in a tunnel, it must not leak the owner's curated collection to
anyone else, and it should be possible to change hosting provider without rewriting
the app.

Three ideas carry the design:

- a **vendor-SDK boundary**, so the backend can be swapped without touching app code
- **local-first sync**, so the UI never waits for a network
- **on-device AI**, so reference images never leave the phone

The README has the short version. This document is the detailed one, including the
trade-offs that were taken deliberately and the limits that are still open.

---

## 1. The app never imports a vendor SDK

Every call that leaves the app passes through `src/backend/`. `createBackend()`
(`src/backend/index.js`) selects one adapter set — `auth`, `store`, `blobs` — from
`VITE_BACKEND` (`local` | `supabase` | `aws`, default `local`). The Supabase SDK is
loaded lazily, only when that adapter is the one selected.

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
  subgraph BE["src/backend — the only way out"]
    SEAM{{"createBackend()<br/>VITE_BACKEND"}}
    L["local<br/>offline default"]
    S["supabase<br/>lazy-loaded"]
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
`tattoo_remote_*` namespace, blobs in IndexedDB. That is why the entire suite and the
public demo run with **no network and no credentials** — `npm test` is pinned to the
local backend in `vite.config.js`, so a `VITE_BACKEND=supabase` in a local `.env`
cannot leak into a test run.

All adapters share one contract test (`src/test/backendContract.test.js`), so they
honour the same seam instead of drifting into three subtly different behaviours.

**Owner gating.** `src/backend/owner.js` defines a single owner account by email
(`VITE_OWNER_EMAIL`). The owner keeps the curated `DEFAULT_ARTISTS`; every other
account starts empty. This rule is applied in two places that must agree — the sync
reconcile *and* the first render — see §2.

---

## 2. The write path: re-ranking an artist with no signal

Local-first means the UI never waits for a server. The edit lands in memory and on
the device immediately; reconciliation is a background concern. The engineering is in
what happens when the network is absent, and then returns.

1. **The edit applies locally first.** State updates, metadata cache is written. No
   spinner, no network in the path.
2. **Changed rows are stamped, once.** Only genuinely-edited records get a fresh
   `updatedAt` (`stampChangedRows`, `src/backend/dirty.js`). Over-stamping would let
   untouched rows outrank real edits made on another device.
3. **A durable dirty marker is written.** The pending edit is recorded in a sidecar
   that survives a reload or crash, so an interrupted sync is retried rather than
   silently dropped.
4. **Deletes are tombstoned separately.** An artist removed offline must not ride
   back in on the next pull, so pending deletes are held until the remote confirms —
   and are cancelled if the same handle is re-added before the sync lands.
5. **Flushes are chained, never concurrent.** Two in-flight pushes could complete out
   of order and regress the synced baseline, so each waits for the previous one.
   Ordering is a correctness property here, not a nicety.
6. **Reconcile by last-write-wins.** On reconnect, local and remote merge per record
   on `updatedAt` (`reconcileRecords`, `src/backend/sync.js`).

### First paint must agree with the reconcile

A subtle class of bug lives here. `useArtistStorage` renders from the local cache
before sync resolves, so **whatever the first paint computes must match what the
reconcile will settle on** — any divergence is visible as a flash of the wrong data.

The specific case (issue #25): `applyDefaults()` does not only fill in missing fields,
it *appends* every `DEFAULT_ARTISTS` entry not already stored. Applying it
unconditionally on first paint meant a non-owner briefly saw their own data plus all
30 of the owner's curated artists, which the reconcile then removed. The fix gates the
initializer on `isOwner(user)`, the same rule the reconcile uses.

This is safe because `App.jsx` mounts `AppShell` inside `ProtectedRoute`, which holds
a spinner until the session resolves — so `user` is known before the hook's first
render. Sign-out nulls the user and purges local caches, so an account switch unmounts
and re-runs the initializer.

The guarantee is **membership parity with the cache**, not with the final state: a
later pull can still add remote rows the cache never had, and images hydrate
separately. Those are hydration, not a flash of the wrong identities.

---

## 3. Images never travel inside documents

A synced record carries a small canonical reference — a storage key — while the bytes
live in blob storage. In memory the same field is a displayable URL, so components
(and features like STL export) are unaware of the split.

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

---

## 4. On-device taste model

Sable matches artists by visual similarity, not only tag overlap. CLIP embeddings are
computed **in the browser** via `@huggingface/transformers`, so reference images never
leave the device — the privacy-preserving choice, and the one with no inference bill.

```mermaid
flowchart TB
  IMG[("Reference images<br/>on device")]
  EMB["embedder.js<br/>dynamic import only"]
  IDX[("Style index — IndexedDB<br/>keyed by model id, not synced")]
  SIG["Taste signal<br/>from rank and status history"]
  OUT1["Similar-ink artist matching"]
  OUT2["Concept to artist matching"]
  NET(["Network"])
  IMG --> EMB --> IDX
  IDX --> OUT1
  IDX --> OUT2
  SIG --> OUT1
  EMB -. "never crosses" .-x NET
```

The model is heavy, so the binding constraint is that it must never enter the initial
bundle. That is enforced by a contract test (`src/test/styleIndex.test.js`) asserting
the library is only ever reached through a **dynamic** `import()` inside one embedder
module — a guarantee a code comment cannot make.

The index is treated as a cache, not as data: it lives in IndexedDB
(`tattoo-style-index-v1`), keyed by model id, excluded from sync, and rebuilt per
device — because it is fully derivable from images the device already has. Losing it
costs time, never data.

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

---

## 6. Offline delivery and the service worker

The service worker is not bundled, so Vitest cannot import it — the classic gap where
stale-cache bugs live. The pattern here splits the difference: decision logic lives in
ordinary importable modules with unit tests (`src/sw/swStrategy.js`,
`src/sw/precache.js`), and a **contract test reads the shipped `public/sw.js` as text**
and asserts its invariants still hold.

```mermaid
flowchart TB
  REQ(["fetch"]) --> Q1{"navigation or document?"}
  Q1 -- yes --> NF["network-first<br/>a deploy is never masked"]
  Q1 -- no --> Q2{"same-origin hashed asset?"}
  Q2 -- yes --> CF["cache-first<br/>name changes with contents"]
  Q2 -- no --> PASS["pass through"]
  NF --> OK([response])
  CF --> OK
  PASS --> OK
```

The routing rule is deliberately asymmetric. Navigations are network-first, so a
deploy is never masked by a cached HTML document; hashed static assets are
cache-first, because their names change when their contents do. A bumped cache name
purges old entries on activate, and the page reloads once when a new worker takes
control.

The build is **base-aware**: the router `basename`, the worker, and the precache
manifest all derive their base path from `VITE_BASE`, so the same code serves from a
domain root or a project sub-path (the demo runs under `/sable/`).

---

## 7. Demo integrity

The public demo is the same code seeded with a wholly fictional dataset — invented
artists with original, committed artwork, because the owner's real references are
third-party work that never enters the repository (`src/data/demoSeed.js`).

Two problems make this more than a fixture:

- **Stale datasets.** A returning visitor can hold data from an older deploy, so
  seeds are versioned (`DEMO_SEED_VERSION`) and re-seeded on any boot — an installed
  PWA launches from `start_url` without the `?demo=1` query that started it. A version
  from a *newer* deploy is left alone, so a rollback in flight never downgrades.
- **Spoofing.** A real account must never be overwritten, so ownership is proved by a
  `demo: true` marker that only the seeder writes. `localAuth.signIn` writes only
  `{ user }`, so no sign-in — even with the demo's own email — can forge it.

---

## 8. Testing approach

TDD-first: behaviour is specified in a failing test before implementation, and any
change to seed data must keep the data-integrity tests green.

The pattern worth naming is the **contract test**: where a file cannot be imported
(the service worker) or a rule cannot be expressed in types (the dynamic-import
constraint on the AI library, the README's own claims), a test reads the artefact and
asserts the invariant. See `src/test/precache.test.js`,
`src/test/swStrategy.test.js`, `src/test/styleIndex.test.js`,
`src/test/readmeClaims.test.js`.

> **Running the suite with worktrees present.** Agent worktrees live inside the repo
> (`.worktrees/`, `.claude/worktrees/`) and Vitest globs their copies from the repo
> root, roughly doubling the reported totals. Use
> `npx vitest run --exclude '**/.worktrees/**'`. Note that `vitest run src/` does *not*
> work — it matches as a substring and picks the worktree copies up anyway.

---

## 9. Trade-offs taken deliberately

Every one of these is a choice with a reason. A design with no stated limits is
usually one whose limits have not been found yet.

**Last-write-wins, not CRDTs.** Conflict resolution is per-record and
timestamp-based. For one user across two devices, concurrent edits to the same record
are rare and the failure mode is losing the older of two edits — acceptable against
the cost of merge structures and a merge UI. Revisit if the app ever gains a second
writer.

**Cross-tab coordination is open.** Two tabs can each hold their own view of a
collection, and an old tab can write over newer state. Tracked as issues rather than
hoped away; the durable dirty-state work was the first step.

**Auth transitions are not fully hardened.** A direct A-to-B session change with no
committed `null` in between does not remount the data shell, so the first paint can
briefly reflect the previous identity until the sync effect re-runs. Reachable only
via passive transitions (cross-tab sign-in, session expiry), not the UI sign-out
path, which purges. Tracked in #28.

**Full offline needs one online visit.** Assets are precached from a build-time
manifest, but on a first-ever visit they load before the worker takes control. The app
is reliably offline from the second visit; a true cold-start guarantee is larger work.

**Pinned model ids go stale.** Hosted generative model ids are pinned and providers
retire them on their own schedule. Documented as a known maintenance task with the
deprecation page to check, rather than pretending the pin is permanent.

**Two specs are flaky under parallel load.** Two suites fail intermittently on a
loaded machine and always pass in isolation and on CI — a fake-IndexedDB timing
artefact (#23). The protocol is written down: re-run isolated, and CI is the arbiter.

---

## Where things live

| Path | Role |
|---|---|
| `src/backend/` | The vendor boundary: `index.js` factory, `sync.js`, `dirty.js`, `owner.js`, `purge.js`, `local/`, `supabase/` |
| `src/hooks/` | `useStorage.js`, `useArtistStorage.js` — local-first read/write and reconcile |
| `src/data/` | Domain data and logic: artists, planning, embeddings, taste, screenshot intake, demo seed |
| `src/sw/` | Pure service-worker logic, contract-tested against `public/sw.js` |
| `src/pages/`, `src/components/` | UI, 8 deep-linkable routes |
| `src/test/` | The suite, including the contract tests |
| `CLAUDE.md` | Agent-facing operations doc: conventions, review protocol, flake protocol |
