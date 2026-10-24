# Sync concurrency audit

Date: 2026-10-24. Audited revision: `3a1771c`; repairs integrated on top of
`d9d1a0b`. Source line references in the findings refer to the audited revision.

The audit found two concurrency bugs, reproduced them with ordinary failing
tests, and then repaired them after owner approval. The original counterexample
models remain runnable. The JavaScript regressions now assert the repaired
behavior; none are skipped or marked as expected failures.

## Scope and limits

TLA+/TLC models two bounded episodes in the generic list-collection sync engine:
one user, one store, one row, one pull/delete, and at most one re-add. Boolean
row presence abstracts away fields and timestamps: these counterexamples concern
unconditional deletion and merging a missing local row, not timestamp ordering.

Actions represent synchronous JavaScript segments and asynchronous backend
operation boundaries. The guarded configurations explore the repaired safety
rules; a green model alone does **not** establish that JavaScript implements
those rules. The unit regressions provide independent executable evidence. These are
finite safety checks, not temporal liveness proofs, whole-program verification,
or a refinement proof between JavaScript and TLA+.

Not modelled: multiple tabs/devices, auth changes, singleton maps, image bytes,
quota failures, policy hooks, provider payment, or the private-concept persistence
path. The unit reproductions exercise ideas, not private concepts. No paid
requests or live backend calls are made.

## Confirmed findings

### 1. A delayed deletion retry removes a successfully re-added row

Source: `src/sync/collectionStore.js:506-524`, outside the `flushChain` at
`:369-374`; flush confirms row generations at `:365`.

`pull()` starts a pending delete directly against the adapter. It is not
serialized with subsequent flushes. A re-add can therefore upsert and clear its
dirty generation before the earlier remove takes effect. The delayed remove
then deletes the new row, with neither a pending delete nor a dirty generation
left. Local memory still displays the row while backend storage no longer has
it. This is loss of the backend copy, not evidence that every local copy was
destroyed.

TLC witness (`DeleteRetry.cfg`):

```text
Init:            local absent, remote present, delete pending
BeginRetry:      remove is in flight
ReaddLocally:    local present, dirty
FlushReadd:      remote present, clean, no pending delete
CompleteRetry:   remote absent, local present, still clean
```

Invariant: `ConfirmedReaddExists`. TLC reports violation in a five-state trace.
Before repair, the matching JavaScript test failed because the real adapter
returned `[]` instead of the confirmed `Re-added idea`.

The control test awaits the deletion before re-adding, and passes.
`DeleteRetryGuarded.cfg` serializes the retry before a later save; all eight
reachable states satisfy the invariant. Production now queues retries alongside
flushes and checked commits, rechecking live IDs and pending intent at the queue
head. This is not a proof about every failure mode.

### 2. An older list response resurrects a confirmed deletion

Source: successful flush clears tombstones at
`src/sync/collectionStore.js:356`; pull filters the saved list response using
only the current pending-delete sidecar at `:463-474`, then publishes at `:497`.

An outstanding list can hold a pre-delete snapshot. If the user deletes and a
flush confirms the remove before that response is processed, its tombstone has
already been cleared. The stale row is accepted into both memory and the
durable cache. The edit-sequence check does not catch this: the deletion
occurred before that particular merge round captured `editSeq`.

TLC witness (`StalePull.cfg`):

```text
Init:            row exists locally and remotely
BeginPull:       list snapshots the existing row; response waits
DeleteLocally:   local absent, tombstone pending
BeginFlush:      delete is being sent
CompleteFlush:   remote absent, tombstone cleared
CompletePull:    stale row restored locally
```

Invariant: `DeletedRowsStayDeleted`. TLC reports violation in a six-state
trace. Before repair, the matching JavaScript test observed the deleted row in
both memory and localStorage after the backend had confirmed its removal.

The control test processes the list while the tombstone is still pending, and
passes. `StalePullGuarded.cfg` retains deletion history for the lifetime of
the pull; all 14 reachable states satisfy the invariant. Production now retains
a separate history for each active pull, seeded from pending tombstones and
extended by local deletions. It filters only IDs still absent locally, so an
intentional re-add remains valid. Histories are released in `finally` or on
`stop()`; successful remote deletes can still clear their durable retry markers.

### Failure-path follow-up

Read-only review identified another route to the late-delete race: `runFlush`
used `Promise.all`, so a rejected upsert could release the queue while its
sibling remove was still running. A later confirmed re-add could then be
erased by that old remove. A gated unit test reproduced this before repair.

Flushes now await `Promise.allSettled` and propagate a rejection only after
every sibling finishes, before advancing `synced` or confirming sidecars.
This failure-path regression is unit-tested, not covered by the two TLA+ models.

## JavaScript evidence

File: `src/test/collectionStoreFormal.test.js`.

Tests use `createCollectionStore` and the real `createLocalStore` adapter.
Only list response delivery and remove execution are delayed with explicit
promise gates. Timer fakes prevent unrelated debounce pushes; there are no
wall-clock sleeps, fake reconciliation logic, or fabricated backend tables.
The two original controls demonstrate that relative ordering matters. Additional
cases cover pre-existing tombstones, intentional restores, failed retry
durability, and a failed flush with a delayed sibling delete.

```sh
npm test -- src/test/collectionStoreFormal.test.js
```

Expected after repair: **eight passing regressions and controls**. The original
four-test audit had two failing reproductions and two passing controls on the
audited revision. The unchanged baseline passed 2,367 tests across 233 files.

The initial audit-only full run had 2,369 passed and two failed across 234 files.
Those failures were deliberately preserved until production repair was approved.

Repair verification: **2,375 passing unit tests across 234 files**, all eight
formal regressions/controls green, and **189 passing offline relay tests**.
Lint, documentation validation (23 Mermaid diagrams), and the production build
passed. The build retains its existing large-chunk warnings. All four TLC
configurations were rerun with the expected results in the table below.

A read-only Codex review found no remaining blocker after the partial-failure
repair. The configured external `agy` review was not run: the approval system
blocked disclosure of source to another provider. No paid image requests,
live-backend writes, dependency changes, or UI changes were needed.

## Running TLC

Obtain `tla2tools.jar` from the [official TLA+ releases](https://github.com/tlaplus/tlaplus/releases).
No JAR or Java runtime is vendored in this repository. See the
[official command-line documentation](https://docs.tlapl.us/using%3Atlc%3Astart).

This run downloaded the `v1.8.0` release asset, which identified itself as
`TLC2 Version 2026.10.24.013619 (rev: 2ef2af8)`, and used OpenJDK 26.0.2.1.
Record the artifact hash, because release assets can change:

```text
SHA-256 d15655eeaff4b3f7b3d65c46b838bc0f35d131b2ef4b1e473689b62c98d4726f
```

Set `TLA2TOOLS_JAR` to an absolute path and run from `formal/`:

```sh
java -Xmx512m -XX:+UseParallelGC -jar "$TLA2TOOLS_JAR" \
  -workers 1 -noGenerateSpecTE -metadir /tmp/sable-tlc-stale \
  -config StalePull.cfg StalePull.tla
```

Repeat using the configurations below (use a separate `-metadir` each time).
Historical configurations deliberately exit nonzero for the named invariant,
not for a parse error. Guarded configurations must finish with no errors.

| Module | Configuration | Expected TLC exit | Observed distinct states |
| --- | --- | --- | --- |
| `StalePull.tla` | `StalePull.cfg` | 12, `DeletedRowsStayDeleted` violated | 13 before stopping |
| `StalePull.tla` | `StalePullGuarded.cfg` | 0, no error | 14, exhaustive |
| `DeleteRetry.tla` | `DeleteRetry.cfg` | 12, `ConfirmedReaddExists` violated | 9 before stopping |
| `DeleteRetry.tla` | `DeleteRetryGuarded.cfg` | 0, no error | 8, exhaustive |

`TypeOK` is also checked. Deadlock checking is disabled because a bounded episode
may intentionally finish with no enabled actions. Breadth-first search finds
short counterexamples; the violating runs stop early and do not exhaust the
state space. A green guarded model proves only its stated finite abstraction.
