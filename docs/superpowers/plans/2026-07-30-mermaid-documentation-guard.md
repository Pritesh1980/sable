# Mermaid Documentation Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Sable's reconnect documentation, add a reader-orientation map, and make real Mermaid parsing a separate required CI gate.

**Architecture:** A focused Node CLI discovers Git-tracked Markdown, extracts Mermaid fences, and parses them sequentially with Mermaid 11.16.0 after installing a minimal JSDOM environment. Node's built-in test runner covers checker behaviour; human prose and GitHub Actions source are reviewed as documentation and configuration rather than protected by brittle source-text assertions.

**Tech Stack:** Node.js 26, Mermaid 11.16.0, JSDOM 29, Node test runner, Vitest 4, GitHub Actions

## Global Constraints

- Validate every Mermaid block in Git-tracked `*.md`, not only the two diagram documents.
- Run validation through a separate `npm run docs:check` command and CI step, not through `npm test`.
- Pin `mermaid` exactly to `11.16.0`.
- Report parse failures with the tracked path and one-based Mermaid block number.
- Fail when no Mermaid blocks are found.
- Parse sequentially for deterministic diagnostics.
- Do not change application runtime behaviour or user data formats.
- Do not add rendering, screenshots, SVG, PNG, or Mermaid CLI browser machinery.
- Do not add tests whose only observable behaviour is exact human prose or CI source text.
- Work in an isolated `codex/mermaid-doc-guard` worktree; do not touch other registered worktrees.

---

### Task 1: Repository-owned Mermaid parser

**Files:**
- Create: `scripts/checkMermaidDocs.js`
- Create: `scripts/checkMermaidDocs.test.js`
- Modify: `package.json:6-13`
- Modify: `package.json:25-44`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Git's tracked `*.md` paths; Markdown strings; an async parser with signature `(source: string) => Promise<unknown>`.
- Produces: `extractMermaidBlocks(markdown: string): string[]`.
- Produces: `validateMermaidSources(sources: Array<{path: string, markdown: string}>, parse: Function): Promise<{diagramCount: number, fileCount: number}>`.
- Produces: `trackedMarkdownFiles(cwd?: string): string[]`.
- Produces: CLI command `npm run docs:check`.

- [ ] **Step 1: Write the failing checker tests**

Create `scripts/checkMermaidDocs.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractMermaidBlocks,
  validateMermaidSources,
} from './checkMermaidDocs.js'

test('extracts Mermaid fences in order and ignores other code fences', () => {
  const markdown = [
    '# Diagrams',
    '```js',
    'const ignored = true',
    '```',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '```mermaid   ',
    'sequenceDiagram',
    '  A->>B: Hello',
    '```',
  ].join('\n')

  assert.deepEqual(extractMermaidBlocks(markdown), [
    'flowchart LR\n  A --> B\n',
    'sequenceDiagram\n  A->>B: Hello\n',
  ])
})

test('collects parser failures with file and one-based block locations', async () => {
  const sources = [
    {
      path: 'docs/a.md',
      markdown: [
        '```mermaid',
        'valid one',
        '```',
        '```mermaid',
        'invalid two',
        '```',
      ].join('\n'),
    },
    {
      path: 'README.md',
      markdown: ['```mermaid', 'invalid three', '```'].join('\n'),
    },
  ]
  const parse = async (source) => {
    if (source.includes('invalid')) throw new Error(`bad syntax: ${source.trim()}`)
  }

  await assert.rejects(
    validateMermaidSources(sources, parse),
    (error) => {
      assert.match(error.message, /docs\/a\.md:mermaid-block-2/)
      assert.match(error.message, /README\.md:mermaid-block-1/)
      assert.match(error.message, /bad syntax: invalid two/)
      assert.match(error.message, /bad syntax: invalid three/)
      return true
    }
  )
})

test('fails when tracked Markdown contains no Mermaid diagrams', async () => {
  await assert.rejects(
    validateMermaidSources([{ path: 'README.md', markdown: '# No diagrams' }], async () => {}),
    /No Mermaid blocks found/
  )
})
```

- [ ] **Step 2: Run the checker tests and verify RED**

Run:

```bash
node --test scripts/checkMermaidDocs.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/checkMermaidDocs.js`.

- [ ] **Step 3: Install the exact parser dependency**

Run:

```bash
npm install --save-dev --save-exact mermaid@11.16.0
```

Expected: `package.json` contains `"mermaid": "11.16.0"` and `package-lock.json` resolves that exact package.

- [ ] **Step 4: Add the package command**

Add this script after `build` in `package.json`:

```json
"docs:check": "node --test scripts/checkMermaidDocs.test.js && node scripts/checkMermaidDocs.js",
```

- [ ] **Step 5: Implement the minimal checker**

Create `scripts/checkMermaidDocs.js`:

```js
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import { JSDOM } from 'jsdom'

const MERMAID_FENCE = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm

export function extractMermaidBlocks(markdown) {
  return [...String(markdown).matchAll(MERMAID_FENCE)].map((match) => match[1])
}

export async function validateMermaidSources(sources, parse) {
  const diagrams = sources.flatMap(({ path, markdown }) =>
    extractMermaidBlocks(markdown).map((source, index) => ({
      path,
      block: index + 1,
      source,
    }))
  )
  if (diagrams.length === 0) throw new Error('No Mermaid blocks found in tracked Markdown.')

  const failures = []
  for (const diagram of diagrams) {
    try {
      await parse(diagram.source)
    } catch (error) {
      failures.push(
        `${diagram.path}:mermaid-block-${diagram.block}\n${error?.message || String(error)}`
      )
    }
  }
  if (failures.length) throw new Error(failures.join('\n\n'))

  return {
    diagramCount: diagrams.length,
    fileCount: new Set(diagrams.map(({ path }) => path)).size,
  }
}

export function trackedMarkdownFiles(cwd = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd })
    .toString()
    .split('\0')
    .filter(Boolean)
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://docs.sable.test/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: dom.window.CSS,
  })
}

export async function checkTrackedMermaid({ cwd = process.cwd() } = {}) {
  const files = trackedMarkdownFiles(cwd)
  const sources = files.map((path) => ({
    path,
    markdown: readFileSync(new URL(path, pathToFileURL(`${cwd}/`)), 'utf8'),
  }))

  installDom()
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false })
  return validateMermaidSources(sources, (source) => mermaid.parse(source))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkTrackedMermaid()
    .then(({ diagramCount, fileCount }) => {
      console.log(`Parsed ${diagramCount} Mermaid diagrams across ${fileCount} Markdown files.`)
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
node --test scripts/checkMermaidDocs.test.js
```

Expected: 3 tests pass.

- [ ] **Step 7: Parse the current repository diagrams**

Run:

```bash
npm run docs:check
```

Expected: the Node tests pass, then the command reports 15 parsed diagrams across the Markdown files that contain them.

- [ ] **Step 8: Lint the new checker**

Run:

```bash
npx eslint scripts/checkMermaidDocs.js scripts/checkMermaidDocs.test.js
```

Expected: exit 0.

- [ ] **Step 9: Commit the checker**

```bash
git add package.json package-lock.json scripts/checkMermaidDocs.js scripts/checkMermaidDocs.test.js
git commit -m "test(docs): validate Mermaid syntax"
```

---

### Task 2: Accurate retry wording and reader map

**Files:**
- Modify: `docs/ARCHITECTURE.md:164-225`
- Modify: `docs/README.md:12-56`

**Interfaces:**
- Consumes: Existing architecture and workflow document links.
- Produces: Architecture wording that requires a mount or edit after reconnect.
- Produces: `## Start here` map with the labels `Learn the app`, `Follow a planning journey`, and `Build or debug Sable`.

- [ ] **Step 1: Correct the architecture wording**

In `docs/ARCHITECTURE.md`, replace:

```markdown
6. **Reconcile by last-write-wins.** On reconnect, local and remote merge per record
```

with:

```markdown
6. **Reconcile by last-write-wins.** On a later mount or edit after reconnect, local
   and remote merge per record
```

Replace the sequence annotation:

```text
Note over Hook,Remote: Later mount or reconnect
```

with:

```text
Note over Hook,Remote: Later mount or edit after reconnect
```

Also replace “what happens when the network is absent, and then returns” with:

```markdown
what happens when the network is absent, then the app mounts or the user edits after
connectivity returns.
```

- [ ] **Step 2: Add the compact start-here map**

Insert a `## Start here` section in `docs/README.md` after the opening screenshot and
first divider. Add a `mermaid` fenced block containing:

```text
flowchart LR
  NEED{"What do you need?"}
  GUIDE["Learn the app<br/>numbered user guide"]
  JOURNEY["Follow a planning journey<br/>typical user workflows"]
  ENGINEERING["Build or debug Sable<br/>technical architecture"]

  NEED -- "use a feature" --> GUIDE
  NEED -- "connect the steps" --> JOURNEY
  NEED -- "understand the system" --> ENGINEERING
```

After the diagram, add:

```markdown
Use the numbered sections below to learn individual features, the
[typical user workflows](USER-WORKFLOWS.md) to follow end-to-end journeys, or the
[technical architecture](ARCHITECTURE.md) to build and debug the system.

---
```

- [ ] **Step 3: Parse every diagram, including the new map**

Run:

```bash
npm run docs:check
```

Expected: 3 Node tests pass and 16 Mermaid diagrams parse.

- [ ] **Step 4: Review the prose against implemented retry triggers**

Run:

```bash
rg -n 'On reconnect|Later mount or reconnect|online event|later mount|after reconnect' \
  docs/ARCHITECTURE.md docs/USER-WORKFLOWS.md
```

Expected: no architecture claim says connectivity restoration alone triggers work;
the architecture and workflow documents both require a later mount or edit.

- [ ] **Step 5: Commit the documentation fixes**

```bash
git add docs/ARCHITECTURE.md docs/README.md
git commit -m "docs(architecture): align diagram guidance"
```

---

### Task 3: Required CI documentation gate

**Files:**
- Modify: `.github/workflows/ci.yml:17-21`

**Interfaces:**
- Consumes: `npm run docs:check` from Task 1.
- Produces: CI ordering `npm ci` → `npm run docs:check` → `npm test` → `npm run build`.

- [ ] **Step 1: Add the CI step**

In `.github/workflows/ci.yml`, insert after `npm ci`:

```yaml
      # Parse every Mermaid block in tracked Markdown before application checks.
      - run: npm run docs:check
```

- [ ] **Step 2: Run the complete documentation gate**

Run:

```bash
npm run docs:check
```

Expected: 3 Node tests pass and 16 Mermaid diagrams parse.

- [ ] **Step 3: Review CI ordering**

Run:

```bash
sed -n '12,26p' .github/workflows/ci.yml
```

Expected: `npm ci`, `npm run docs:check`, `npm test`, then `npm run build`.

- [ ] **Step 4: Commit the CI gate**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(docs): enforce Mermaid validation"
```

---

### Task 4: Final verification and review

**Files:**
- Verify only; modify files only for confirmed review findings.

**Interfaces:**
- Consumes: All commits from Tasks 1-3.
- Produces: A clean branch whose documentation, application tests, and build all pass.

- [ ] **Step 1: Run the documentation gate**

```bash
npm run docs:check
```

Expected: 3 Node tests pass and 16 Mermaid diagrams parse.

- [ ] **Step 2: Run the full application suite**

```bash
npm test
```

Expected: 638 tests across 82 files pass.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: exit 0; the existing chunk-size advisory may remain.

- [ ] **Step 4: Lint every changed JavaScript file**

```bash
npx eslint scripts/checkMermaidDocs.js scripts/checkMermaidDocs.test.js
```

Expected: exit 0.

- [ ] **Step 5: Check repository hygiene**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted files.

- [ ] **Step 6: Review the complete branch**

Review the diff from the plan/spec base through `HEAD` for:

- accidental runtime changes
- Markdown files omitted from tracked discovery
- Mermaid parser errors without actionable locations
- CI ordering drift
- reconnect wording that still implies an automatic `online` listener

Verify each finding against the source before changing anything.
