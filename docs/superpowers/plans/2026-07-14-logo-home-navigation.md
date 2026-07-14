# Logo Home Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shared Sable page-header logo lockup a keyboard-accessible link to the Home/Wall route (`/`).

**Architecture:** Keep navigation ownership in the shared `Logo` component by replacing its non-interactive wrapper with React Router's `Link`. Leave `LogoMark` and `Wordmark` presentational, and prove the behavior with a focused router-level component test before updating the paired Markdown/in-app Help guidance and shared screenshot.

**Tech Stack:** React 19, React Router 7, Vitest 4, Testing Library, Tailwind CSS, Playwright capture workflow

## Global Constraints

- Perform all work in `/Users/pritesh/code/tattoo-app/.worktrees/logo-home-link` on `codex/logo-home-link`.
- The canonical Home/Wall route is exactly `/`.
- The complete koru-mark-plus-wordmark lockup is clickable; standalone `LogoMark` and `Wordmark` remain non-interactive.
- Preserve the current logo layout and visual appearance except for an explicit keyboard focus treatment.
- Follow TDD: observe the focused test fail before changing production code.
- Keep `docs/01-getting-started.md`, the `getting-started` entry in `src/pages/Help.jsx`, and the relevant guide screenshot synchronized.

---

### Task 1: Link the shared logo to Home

**Files:**
- Create: `src/test/Logo.test.jsx`
- Modify: `src/components/Logo.jsx`

**Interfaces:**
- Consumes: React Router `Link`, `MemoryRouter`, and `useLocation`.
- Produces: default `Logo({ size = 28, className = '' })`, exposed as a link whose visible accessible name is `Sable` and whose destination is `/`.

- [ ] **Step 1: Write the failing navigation test**

Create `src/test/Logo.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Logo from '../components/Logo'

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname}</output>
}

describe('Logo', () => {
  it('returns to the Home wall when activated', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Logo />
        <LocationProbe />
      </MemoryRouter>
    )

    const homeLink = screen.getByRole('link', { name: 'Sable' })
    expect(homeLink).toHaveAttribute('href', '/')

    fireEvent.click(homeLink)

    expect(screen.getByRole('status', { name: 'Current route' })).toHaveTextContent('/')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/test/Logo.test.jsx
```

Expected: FAIL at `getByRole('link', { name: 'Sable' })` because the current full logo renders a `div`, not a link.

- [ ] **Step 3: Implement the minimal shared link**

Update `src/components/Logo.jsx` to import `Link` and replace only the full lockup wrapper:

```jsx
import { Link } from 'react-router-dom'

// Inline SVG koru mark — inherits colour via currentColor.
export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M 4 24 Q 4 4 24 4 Q 44 4 44 24 Q 44 40 28 40 Q 14 40 14 28 Q 14 18 24 18 Q 30 18 30 24" />
      <circle cx="30" cy="24" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Wordmark-only component for reuse if needed.
export function Wordmark({ className = '' }) {
  return (
    <span className={`font-display tracking-[0.35em] text-sm uppercase ${className}`}>
      Sable
    </span>
  )
}

// Full lockup: mark + wordmark, used in page headers and linked to Home.
export default function Logo({ size = 28, className = '' }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2 rounded-sm text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-black ${className}`}
    >
      <LogoMark size={size} />
      <Wordmark />
    </Link>
  )
}
```

- [ ] **Step 4: Run focused and related tests and verify GREEN**

Run:

```bash
npx vitest run src/test/Logo.test.jsx src/test/routes.test.jsx src/test/Settings.test.jsx
```

Expected: all selected test files pass with no test failures.

- [ ] **Step 5: Review and commit the behavior**

Run:

```bash
git diff --check
git diff -- src/components/Logo.jsx src/test/Logo.test.jsx
git add src/components/Logo.jsx src/test/Logo.test.jsx
git commit -m "feat(nav): link page logo to home"
```

Expected: one focused behavior commit with the component and its regression test.

---

### Task 2: Synchronize Help guidance and screenshot

**Files:**
- Modify: `docs/01-getting-started.md`
- Modify: `src/pages/Help.jsx`
- Modify: `public/guide/help-overview.png`

**Interfaces:**
- Consumes: the established docs pairing between the Markdown guide, `SECTIONS`, and `public/guide` images.
- Produces: matching guidance that the page-header Sable logo returns to Home, plus a refreshed Help overview screenshot.

- [ ] **Step 1: Update both copies of the navigation guidance**

In `docs/01-getting-started.md`, extend the paragraph beginning “On the classic pages” to read:

```markdown
On the classic pages the familiar bottom bar is still there — with the **A+ / A−**
text size, **◑ / ◐** theme and **⏻** sign-out controls at its right end. Tap the
**Sable logo** at the top-left of any classic page to return to the Home Wall.
```

In the `getting-started` section of `src/pages/Help.jsx`, replace the step beginning “The old Home dashboard” with:

```jsx
'The old Home dashboard lives at Drawer → Pipeline, unchanged: Top 5 coverflow, shortlist pipeline, idea stats and matches. On the classic pages the familiar bottom bar is still there, with the A+/A− text size, ◑/◐ theme and ⏻ sign-out controls at its right end. Tap the Sable logo at the top-left of any classic page to return to the Home Wall.',
```

- [ ] **Step 2: Run the documentation drift reminder**

Run:

```bash
bash scripts/docs-drift-check.sh
```

Expected: no reminder that `docs/` or `src/pages/Help.jsx` is missing; a screenshot reminder may remain until the next step.

- [ ] **Step 3: Re-capture the Help overview screenshot**

Start the isolated local-backend server:

```bash
VITE_BACKEND=local npm run dev -- --port 5174
```

Using the in-app browser at a `430 × 920` viewport:

1. Open `http://localhost:5174/help`.
2. Set `tattoo_local_session` to `{"user":{"id":"local-owner@example.com","email":"owner@example.com"}}` in that origin's local storage.
3. Unregister service workers, clear caches, and reload `/help`.
4. Wait for the open Getting Started section and its image to render.
5. Save a viewport screenshot to `public/guide/help-overview.png`.

Expected: the refreshed image shows the Help overview at phone width and contains no real account data.

- [ ] **Step 4: Verify the docs image contract and focused tests**

Run:

```bash
bash scripts/docs-drift-check.sh
npx vitest run src/test/Logo.test.jsx src/test/routes.test.jsx
```

Expected: the drift script exits without missing-doc reminders and both test files pass.

- [ ] **Step 5: Review and commit the synchronized documentation**

Run:

```bash
git diff --check
git status --short
git add docs/01-getting-started.md src/pages/Help.jsx public/guide/help-overview.png
git commit -m "docs(nav): explain logo home shortcut"
```

Expected: one documentation commit containing both text surfaces and the shared screenshot.

---

### Task 3: Complete verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: fresh evidence that routing, documentation, linting, tests, and the production bundle are healthy.

- [ ] **Step 1: Run the full quality gate**

Run each command independently:

```bash
npm run lint
npm test
npm run build
bash scripts/docs-drift-check.sh
git diff --check HEAD~2..HEAD
git status --short --branch
```

Expected:

- ESLint exits `0`.
- Vitest reports all test files and tests passing; if the documented `useArtistStorage` migration flake occurs, rerun that file in isolation before diagnosing.
- Vite production build exits `0`.
- Docs drift check reports no missing synchronized artifacts.
- Diff check produces no output.
- Git status is clean on `codex/logo-home-link`.

- [ ] **Step 2: Inspect the final commit range**

Run:

```bash
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
```

Expected: the design commit, functional logo-link commit, and documentation commit are present; the diff is limited to the spec/plan, logo component/test, paired docs text, and refreshed Help screenshot.
