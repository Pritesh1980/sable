# Architecture and User Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Sable's technical architecture documentation with structural and runtime diagrams, then document the app's typical tattoo-planning journeys as Mermaid workflows.

**Architecture:** Keep `README.md` as the concise public entry point. Treat `docs/ARCHITECTURE.md` as the technical source of truth and add a separate `docs/USER-WORKFLOWS.md` for intent-led journeys, linking both documents from the README and user-guide index.

**Tech Stack:** Markdown, GitHub-flavoured Mermaid, existing Vitest documentation contract tests

## Global Constraints

- Document only behaviour that exists in the current repository; mark reserved or planned capabilities explicitly.
- Use small Mermaid views in which every diagram answers one question.
- Keep technical component and persistence details in `docs/ARCHITECTURE.md`.
- Keep workflows task-oriented and understandable without source-code knowledge.
- Preserve the concise architecture overview already present in `README.md`.
- Do not modify UI files, so the in-app Help screenshot workflow is out of scope.
- Preserve the untracked `arch-md-github.png`.

---

### Task 1: Complete the technical architecture views

**Files:**
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: Current routes from `src/App.jsx`; persistence contracts from `src/hooks/useStorage.js`, `src/hooks/useArtistStorage.js`, `src/backend/dirty.js`, `src/backend/sync.js`; deployment lifecycle from `src/main.jsx`, `vite.config.js`, `scripts/precachePlugin.js`, and `public/sw.js`
- Produces: A technical reference whose structural and runtime views can be linked independently from user workflows

- [ ] **Step 1: Add a system-context and runtime-boundary diagram**

Add a Mermaid flowchart showing the owner/guest, installed browser PWA, optional OpenAI/Gemini calls, optional Supabase adapter, GitHub Pages static host, and entirely on-device CLIP execution. Distinguish selected runtime dependencies from reserved AWS support.

- [ ] **Step 2: Add a React composition and route-ownership diagram**

Add a Mermaid flowchart rooted at `main.jsx` → providers/router → `ProtectedRoute` → `AppShell`, with the five shared state collections and the eight deep-linkable feature routes grouped by primary navigation and drawer navigation.

- [ ] **Step 3: Turn the local-first write path into a sequence diagram**

Add a Mermaid `sequenceDiagram` covering: immediate React/localStorage update, edit-time stamping, durable dirty sidecar, 500 ms debounce, serialized backend upsert/remove, success clearing dirty state, failure retaining it, and later mount/reconnect reconciliation.

- [ ] **Step 4: Add the build and delivery pipeline**

Add a Mermaid flowchart covering source/build, `VITE_BASE`, route splitting, build-manifest injection into `dist/sw.js`, GitHub Actions deployment to Pages, service-worker install/activate, and later offline use.

- [ ] **Step 5: Review the architecture page against source**

Run:

```bash
rg -n "createBackend|ProtectedRoute|useArtistStorage|useStorage|stampChangedRows|BUILD_MANIFEST|VITE_BASE" \
  src scripts public vite.config.js
```

Expected: every named boundary in the new diagrams has a corresponding implementation reference.

- [ ] **Step 6: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs(architecture): add runtime views"
```

---

### Task 2: Add typical user-workflow diagrams

**Files:**
- Create: `docs/USER-WORKFLOWS.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `src/test/readmeClaims.test.js`

**Interfaces:**
- Consumes: User-facing terminology and navigation from `docs/README.md`, `docs/01-getting-started.md` through `docs/07-backup-and-settings.md`, and the current routes in `src/App.jsx`
- Produces: A workflow reference linked from both public documentation entry points; a contract test that prevents either link from silently disappearing

- [ ] **Step 1: Extend the documentation contract test first**

Add assertions to `src/test/readmeClaims.test.js` that:

```js
const workflows = readFileSync(resolve(root, 'docs/USER-WORKFLOWS.md'), 'utf8')
expect(readme).toContain('docs/USER-WORKFLOWS.md')
expect(guide).toContain('USER-WORKFLOWS.md')
expect(workflows).toContain('## 1. Discover an artist and decide where they belong')
expect(workflows).toContain('## 2. Turn an idea into an artist-ready brief')
expect(workflows).toContain('## 3. Generate and refine an AI concept')
expect(workflows).toContain('## 4. Plan contact, travel, and appointments')
expect(workflows).toContain('## 5. Work offline and recover safely')
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npx vitest run src/test/readmeClaims.test.js --exclude '**/.worktrees/**'
```

Expected: FAIL because `docs/USER-WORKFLOWS.md` and its links do not exist.

- [ ] **Step 3: Create the workflow document**

Create five Mermaid-backed sections:

1. Discover artist → screenshot/handle intake → Wall → full-screen inspection → compare/rank → shortlist status.
2. Capture idea → tag/place/link → suggested artists → optional board → copied artist brief.
3. Start from artist or idea → prompt pack or direct generation → paste/save variants → choose Best → concept-to-artist match → optional relief STL.
4. Pipeline → Radar/Studios → convention/studio context → contact next → contacted/booked.
5. Immediate local edit → offline continuation → background sync/retry → backup export → restore on another browser/device.

Start with one overview flow that shows how Artists, Ideas, Concepts, and Planning feed one another. Use decision diamonds only for genuine user choices and label alternate paths explicitly.

- [ ] **Step 4: Link both detailed documents**

Add `docs/USER-WORKFLOWS.md` next to `docs/ARCHITECTURE.md` in the README architecture area. Add an "Architecture and workflow maps" subsection to `docs/README.md` linking both documents without changing the numbered Help-page workflow list.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npx vitest run src/test/readmeClaims.test.js --exclude '**/.worktrees/**'
npm run lint
npm run build
```

Expected: the focused contract test, lint, and production build all pass.

- [ ] **Step 6: Inspect all Mermaid blocks**

Run:

```bash
rg -n '^```mermaid|^(flowchart|sequenceDiagram)' docs/ARCHITECTURE.md docs/USER-WORKFLOWS.md
```

Expected: every Mermaid fence is followed by one supported diagram declaration, and the number of opening Mermaid fences equals the number of closing fences in each document.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/README.md docs/USER-WORKFLOWS.md src/test/readmeClaims.test.js
git commit -m "docs(workflows): map planning journeys"
```

