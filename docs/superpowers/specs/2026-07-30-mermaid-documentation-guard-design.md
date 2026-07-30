# Mermaid documentation guard — design

## Goal

Make Sable's architecture and workflow documentation easier to enter and harder to
silently break.

The change has three outcomes:

1. Architecture prose describes the implemented retry trigger accurately: a network
   connection returning does not itself start reconciliation; a later mount or edit does.
2. The documentation index gives product readers and engineers a compact visual route to
   the right level of detail.
3. CI parses every Mermaid block in Git-tracked Markdown with the real Mermaid parser.

Application runtime behaviour and user data formats do not change.

## Chosen approach

Add `mermaid` `11.16.0` as an exact development dependency and a separate
`npm run docs:check` gate. The gate scans every Git-tracked `*.md` file, extracts
fenced Mermaid blocks, parses them, and reports failures with the source file and
one-based block number.

This is preferred over:

- `@mermaid-js/mermaid-cli`, which adds browser rendering machinery when syntax parsing
  is the requirement.
- A regex-only checker, which can count fences but cannot validate Mermaid grammar.
- Adding Mermaid parsing to `npm test`, which would make application-test startup pay
  for documentation tooling on every run.

## Documentation changes

### Reconnect semantics

In `docs/ARCHITECTURE.md`:

- Replace “On reconnect” with “On a later mount or edit after reconnect.”
- Replace the sequence annotation “Later mount or reconnect” with “Later mount or edit
  after reconnect.”
- Keep the explanation aligned with `docs/USER-WORKFLOWS.md`: there is no `online`
  listener today.

The diagrams continue to describe current behaviour, not a desired automatic retry.

### Start-here map

Add a small Mermaid flowchart near the top of `docs/README.md` with one question and
three destinations:

- **Learn the app** → the numbered user guide.
- **Follow a planning journey** → `docs/USER-WORKFLOWS.md`.
- **Build or debug Sable** → `docs/ARCHITECTURE.md`.

The existing linked sections remain the clickable navigation. The map is orientation,
not a replacement table of contents.

## Documentation checker

### Files

- `scripts/checkMermaidDocs.js` — extraction, tracked-file discovery, parsing, CLI.
- `scripts/checkMermaidDocsTest.js` — separate Node test coverage for the checker,
  deliberately outside Vitest's `*.test.js` discovery pattern.
- `package.json` / `package-lock.json` — pinned Mermaid dependency and `docs:check`.
- `.github/workflows/ci.yml` — run `npm run docs:check` after `npm ci`.

### Discovery

The checker asks Git for tracked Markdown paths rather than walking the filesystem.
This prevents nested agent worktrees, `node_modules`, generated files, and untracked
notes from being validated accidentally.

All tracked Markdown is in scope, including the root README and future documentation
outside `docs/`.

### Extraction and parsing

The extractor recognises fenced blocks whose info string is exactly `mermaid`, allowing
surrounding horizontal whitespace. It returns blocks in file order with one-based
indices.

The CLI initialises the minimal DOM environment Mermaid needs, then parses blocks
sequentially. Sequential parsing keeps diagnostics deterministic and avoids Mermaid
sharing mutable parser state across concurrent calls.

Success output reports the total blocks and files checked. If the repository contains no
Mermaid blocks, the command fails: deleting every diagram should not turn the guard
silently green.

### Errors

Each parse failure is reported as:

```text
path/to/file.md:mermaid-block-N
<parser message>
```

The checker continues through all blocks so one run reports every invalid diagram, then
sets a non-zero exit code.

Git discovery failures and unreadable tracked files also fail the command with the
underlying path or command error.

## Test strategy

`scripts/checkMermaidDocsTest.js` uses Node's built-in test runner and temporary
fixtures. It verifies:

1. Mermaid fences are extracted in order while other code fences are ignored.
2. Block indices are one-based and tied to their source file.
3. Multiple parser failures are collected with actionable locations.
4. An empty diagram set fails instead of passing vacuously.

The test injects a small parser function so unit tests target checker behaviour without
testing Mermaid itself. The subsequent CLI invocation parses the repository with the
real Mermaid package.

`npm run docs:check` runs the Node tests first and the repository parse second. CI keeps
the existing application test and production build steps unchanged.

## Acceptance criteria

- Architecture retry wording contains no claim that connectivity restoration alone
  triggers reconciliation.
- The documentation index contains the three-way start-here map and retains direct links
  to the guide, workflow, and architecture documents.
- `npm run docs:check` parses every Mermaid block in tracked Markdown and exits zero.
- Introducing invalid Mermaid into a temporary fixture makes the checker report its file
  and block number and exit non-zero.
- `npm test` and `npm run build` remain green.
- The new CI step runs independently before application tests.

## Non-goals

- Rendering diagrams to SVG or PNG in CI.
- Automatically checking whether diagram statements remain semantically true.
- Adding automatic network-reconnect behaviour.
- Restructuring the existing architecture or workflow documents.
