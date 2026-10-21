# Relay Main Integration

Goal: integrate the existing, unactivated refinement relay with main at
`75c7c95`, entirely in `codex/relay-main-integration`.

Constraints: no changes to the primary checkout or original relay worktree;
no push, deployment, real accounts, infrastructure or paid provider calls.
Keep current canonical photo refs, staging/outbox and collection engine.
Preserve owner isolation, checked persistence before acknowledgement,
recovery without paid retries and per-request consent.

## Tasks

- [x] Establish the relay baseline with locked dependencies and local tests.
- [x] Merge the pinned main commit; reconcile storage/auth/backup boundaries
  without restoring retired photo-cache behavior. Add focused integration
  regressions before changing shared-engine behavior.
- [x] Resolve docs and UI conflicts preserving current mobile layout/demo
  ordering and relay guidance; update matching Help and screenshots as needed.
- [x] Run app, relay, lint/docs and production browser suites (root/subpath,
  refinement recovery, offline/owner/checked-save cases); use fake auth and
  intercepted provider responses only.
- [x] Review the integrated branch, record evidence and remaining activation
  gates, then leave the worktree ready for user review, unmerged/unpushed.

## Progress

- Isolated worktree created; original branch remains at `d3abe5f`.
- Preview finds 20 conflicts, including the retired storage hooks.
- Earlier temporary Node runtime was removed; using the installed runtime
  after checking its version rather than changing dependencies.
- Baseline: 1,964 app and 189 relay tests passed. Main's locked dependencies
  replace the older relay versions; no new dependency was introduced.
- Kept the current shared collection engine. Private concept field intent and
  checked receipts now run through `privateConceptPersistence.js`; state holds
  canonical keys, including verified results and manually imported variations.
- Reconciled retired-cache safety cases into `relayPhotoStorage.test.jsx`:
  mixed/foreign-owner old bytes, offline reload, concurrent additions, owner
  changes, failed uploads and ambiguous old cache entries. Existing tombstone
  tests remain; production never reopens the retired cache.
- Reproduced and fixed real-auth seed/staging/resolver ownership gaps. Existing
  URL-invalidation fixtures now wait for the backend read they intend to race.
- One read-only reviewer reported four integration findings. All reproduced
  before fixes: key-only manual import, staged-only source preparation,
  staged-only portable backup, and private concept outbox retry. All addressed;
  no minor findings deferred. Added private stop/remount recovery coverage.
- Refinement production browser suite: 39 passed, including the new staged-only
  source checks at root/subpath and key-only manual import in the public demo.
- Initial public browser run: 49 passed, two route cases exceeded the unchanged
  45-second timeout under combined load. Rechecking those alone with one worker.
- Guide captures refreshed and visually inspected; lint and Mermaid docs checks
  passed. Production public assets contain no fixture auth token/owner or relay
  server secret identifiers. Paid relay activation remains unapproved/disabled.

## Integration Decisions

- A new worktree/branch leaves both original checkouts unchanged. Main is pinned
  to `75c7c95`; any subsequent Claude changes need a later integration check.
- Prefer main's staging/outbox and collection engine over reinstating old cache
  migration code. Risk if wrong: existing photo persistence would regress;
  current and translated photo-safety suites cover the boundary.
- Keep ordinary offline v2 backup export and private complete-only export as
  separate modes. Risk if wrong: partial files could be mistaken for complete
  paid-result backups; both modes and fresh-context restoration are tested.
- Keep all hosting, real auth/provider requests, payment, main merge and push
  outside this task. No approval for any activation step is inferred here.

## Final Verification

- App: 2,367 tests passed across 233 files after the review fix pass.
- Refinement browser: 39 passed, root/subpath, phone/desktop/manual public flow.
- Public browser: 49 passed initially; the two route checks that timed out at
  320/390 px both passed alone with one worker and unchanged timeouts.
- Relay: all 189 tests passed; server files are unchanged from that baseline.
- Lint, documentation diagrams, public production root/subpath builds, staged
  diff whitespace and public-bundle fixture/secret-identifier checks passed.
- Guide screenshots refreshed in this worktree and visually inspected.
- Review: four findings, all reproduced and fixed in one pass. No deferred
  minor findings. Private stop/remount recovery is now explicitly tested.
- Primary checkout remains on `main` at `75c7c95` with its pre-existing local
  changes untouched. Original relay worktree remains at `d3abe5f`.
- Separate offline preview: `http://localhost:5190/?demo=1`.
- Not approved or performed: main merge, push, live auth, infrastructure,
  deployment, or any paid request. Real iPhone/home-screen and live activation
  gates in `docs/RELAY-ACTIVATION.md` remain outstanding.
