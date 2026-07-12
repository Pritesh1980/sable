# Sable — Improvement Plan (July 2026)

Focus: **ease of use** (Pritesh's daily tattoo-planning workflow on iPhone) and
**portfolio impact** (a public repo + live demo a reviewer can be impressed by
in under two minutes). Code-quality and test-infrastructure work is explicitly
deprioritised — the suite is already green (506/506) and that's good enough.

Each workstream is sized for a Sonnet/Opus-level session with concrete
acceptance criteria.

## Review snapshot (2026-07-12, main @ 9473569)

What a portfolio reviewer or daily user actually experiences today:

- **No live URL.** The app only runs on localhost. For a portfolio, no demo
  link means most reviewers never see it at all; for daily use, Pritesh can't
  open it away from the Mac.
- **A fresh clone looks empty.** Curated artist images are (rightly)
  gitignored, so anyone cloning the repo sees monogram placeholders on every
  card — the striking visual design never gets a chance to land.
- **The README undersells the work.** The best material — the dark editorial
  design, the Wall, the local-first sync architecture — is invisible: no
  screenshots, no architecture story, no badges.
- **Initial load is heavy for an iPhone PWA**: 762 KB eager JS + 724 KB
  three.js, no route splitting. On mobile data this is a felt UX cost.
- **Offline is almost-but-not-quite**: known gap where a first visit doesn't
  precache assets, so the PWA can fail offline until the second visit.

---

## Workstream 1 — Live deploy (highest value; Opus; ~2 sessions)

The single move that serves both goals: a URL on Pritesh's phone home screen
and a demo link at the top of the README.

**Decisions needed first:**
1. Hosting: S3 + CloudFront as long-planned (issue #6), or an interim
   zero-config host (CloudFront can come later) to get a URL this week?
2. Accounts: provision Supabase now (issue #4) so data syncs across devices,
   or deploy local-only first? Local-only still gives the phone-installable
   PWA and the portfolio link; sync can follow.

**Work (issue #6):** static hosting with SPA deep-link handling (404/403 →
`index.html`), cache headers (immutable hashed assets; no-cache `index.html` +
`sw.js`), deploy on push to main.
**Accept:** live URL; installable on the iPhone home screen; refreshing
`/gallery` works; a fresh deploy shows up without a stale-SW fight.

## Workstream 2 — Demo mode + portfolio-ready README (Sonnet; ~1–2 sessions)

Make the repo sell itself.

### 2a. Seeded demo data
- A `scripts/seed-demo.js` (or `?demo=1` path) that fills a local session with
  fictional artists and committable images (CC0 or self-generated — no
  third-party portfolio work), so a fresh clone or demo visit sees the Wall,
  Top-5 dock, and gallery looking alive instead of monograms.
- Once deployed (WS1), this doubles as a public **"try the demo"** mode —
  arguably the strongest portfolio artefact possible.

### 2b. README upgrade
- Hero screenshot of the Wall + 2–3 more (Gallery, Brief) captured from the
  seeded state into `docs/images/`.
- Live-demo link (after WS1), CI badge, and a short architecture section with
  a Mermaid diagram of the backend adapter boundary (`local | supabase | aws`)
  and local-first sync — currently buried in CLAUDE.md where no reviewer looks.
- Closes the spirit of issue #12 (guide screenshots) with the same captures.
**Accept:** README communicates design + engineering within one scroll; fresh
clone + seed looks like the screenshots.

## Workstream 3 — Faster on iPhone (Sonnet; ~1 session)

Perf as UX, not code quality: the app should open instantly from the home screen.

- `React.lazy` the 8 route pages in `src/App.jsx` (keep Wall eager) with a
  v2-token styled Suspense fallback.
- Dynamic-import `three` inside its GL entry points (`ReliefStlDrawer`,
  `lib/gl.js` / `GlCrossfade`) so 185 KB gzip of three.js loads only when STL
  export or GL mode is actually used.
**Accept:** eager payload cut to roughly a third (main chunk ≲120 KB gzip);
app still behaves identically; tests green.

## Workstream 4 — Offline that actually works (Opus; ~1 session; after WS1/3)

For the "on the tube / at a convention with no signal" moment — and "a PWA
with real offline support" is a strong portfolio line.

- Build-time precache: inject the built asset manifest into the existing
  `sw.js` + `swStrategy.js` (keeping the hand-rolled SW rather than swapping
  in Workbox), closing the known first-visit gap.
**Accept:** first online visit → airplane mode → full app boots with assets.

## Workstream 5 — Small UX debts (Sonnet; opportunistic)

- `index.html`: add the non-prefixed `mobile-web-app-capable` meta (console
  deprecation warning on every load).
- One-time real-iPhone tap test on idea cards (open from June — Pritesh-only,
  5 minutes once WS1 gives a URL).
- Decide curated-handle resurrection before sharing an account with the
  tattoo artist: a non-owner adding a `DEFAULT_ARTISTS` handle inherits the
  bundled curated images (decision, not code).
- Empty-state pass for non-owner/fresh accounts — largely absorbed by the
  demo-seed work in 2a.

## Deprioritised (parked, not planned)

- Lint fixes + lint-in-CI, Playwright E2E suite — pure code-quality/test work.
  (One caveat: if a portfolio reviewer runs `npm run lint`, it currently fails
  with 8 errors. A single small "make lint pass" commit is cheap insurance
  before publicising the repo; entirely optional.)
- Tailwind 4 migration (issue #11) — deliberate, standalone, zero user-visible value.
- AWS backend adapter (issue #5) — after Supabase proves out.
- TypeScript migration — skip.

## Suggested order

| Order | Workstream | Model | Size | Blocked on |
|---|---|---|---|---|
| 1 | Live deploy | Opus | large | hosting + accounts decisions |
| 2 | Demo mode + README | Sonnet | medium | screenshots best after 1 |
| 3 | Faster on iPhone | Sonnet | small-med | — |
| 4 | Offline precache | Opus | medium | 1, 3 |
| 5 | Small UX debts | Sonnet | tiny | — |

WS3 and WS5 are unblocked today and safe to hand to a lesser model as-is.
WS1 needs the two decisions above; WS2's screenshots land best once there's a
deployed demo to point at. One branch/PR per workstream, `fixes #N` per the
work-intake convention.
