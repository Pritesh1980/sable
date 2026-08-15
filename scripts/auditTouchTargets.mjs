// Touch-target audit (issue #73) — `npm run audit:targets`.
//
// Walks the app's routes in a real mobile browser context and measures every
// interactive control, reporting anything under 44x44. This exists because the
// source-scan guard in `src/test/a11yAffordances.spec.js` provably cannot do the
// job: it reads `w-N`/`h-N` classes, so a control sized by padding is invisible
// to it, and a `<button>{label}</button>` cannot be told apart from one holding a
// sentence. The Artists view switcher sat at 24x28 for months with a green suite.
//
// The judgement lives in `src/a11y/touchTargets.js` and is unit-tested; this file
// is only the browser half, deliberately thin.
//
// Prerequisites: a dev server on the local backend, and Playwright's browsers
// (`npx playwright install chromium`). See docs/MAINTAINING.md.
//
//   VITE_BACKEND=local npm run dev -- --port 5174
//   npm run audit:targets -- http://localhost:5174
import { chromium } from 'playwright'
import { MIN_TARGET_PX, summarise, formatOffender } from '../src/a11y/touchTargets.js'

const BASE = (process.argv[2] || 'http://localhost:5174').replace(/\/$/, '')
const ROUTES = ['/', '/gallery', '/brief', '/conventions', '/studios', '/concepts', '/settings', '/help']

// A phone viewport is not a phone: only a mobile context reports `hover: none`,
// which decides whether hover-revealed controls are on screen at all. Same
// reasoning as the screenshot recipe.
const CONTEXT = { viewport: { width: 430, height: 920 }, isMobile: true, hasTouch: true }

// Occlusion needs each control scrolled into the middle of the screen first:
// the fixed bottom nav covers whatever happens to be under it, which is every
// control on every page at some scroll position, and reporting that would bury
// the real finding — a control enlarged until it covers its neighbour.
const findOccludedInPage = () => {
  const SELECTOR = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, summary'
  const covered = []
  const els = [...document.querySelectorAll(SELECTOR)]
  for (let index = 0; index < els.length; index++) {
    const el = els[index]
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) continue
    // Still clipped by a rail or drawer it could not be scrolled inside.
    let clipped = false
    for (let a = el.parentElement; a && !clipped; a = a.parentElement) {
      const st = getComputedStyle(a)
      if (!/(auto|scroll|hidden)/.test(st.overflowX + st.overflowY)) continue
      const ar = a.getBoundingClientRect()
      if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) clipped = true
    }
    if (clipped) continue
    const hit = document.elementFromPoint(cx, cy)
    if (!hit || el.contains(hit) || hit.contains(el)) continue
    covered.push(index)
  }
  return covered
}

const measureInPage = () => {
  const SELECTOR = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, summary'
  return [...document.querySelectorAll(SELECTOR)].map((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const own = (el.textContent || '').trim()
    const paragraph = el.closest('p')
    return {
      tag: el.tagName,
      // An identifier for the report, NOT the computed accessible name — those
      // differ, and conflating them is how a glyph-only button reads as fine
      // here while announcing as "⊞" to a screen reader (codex review).
      label: (el.getAttribute('aria-label') || el.title || own || '').trim(),
      width: r.width,
      height: r.height,
      visibility: cs.visibility,
      display: cs.display,
      pointerEvents: cs.pointerEvents,
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      // Text around the control, so a <p> used as a wrapper for one call to
      // action is not mistaken for prose.
      proseAround: paragraph ? Math.max(0, (paragraph.textContent || '').trim().length - own.length) : 0,
      // Does a tap at the centre actually reach this control? Enlarging targets
      // is what makes them cover each other, and size alone cannot see it.
      // Filled in by the occlusion pass below, which has to scroll.
      occluded: false,
    }
  })
}

const browser = await chromium.launch()
const context = await browser.newContext(CONTEXT)
const page = await context.newPage()

// Seed the fictional demo dataset so pages have real content to measure; an
// empty app has almost no controls and would audit as clean.
await page.goto(`${BASE}/?demo=1`)
await page.waitForTimeout(2500)

// Fail loudly rather than measure the wrong thing. Pointed at a server on a
// non-local backend, `?demo=1` does not seed and every route renders the same
// Login page — the audit would then report a tidy handful of controls and look
// like good news (codex review).
const seeded = await page.evaluate(() => ({
  onLogin: /sign in|no account/i.test(document.body.textContent || ''),
  artists: document.body.textContent?.includes('Mora Vane'),
}))
if (seeded.onLogin || !seeded.artists) {
  console.error(
    `\nNot signed in to the demo at ${BASE} — the audit would measure the Login page under every route.\n` +
      'Start the server on the local backend: VITE_BACKEND=local npm run dev -- --port 5174\n'
  )
  await browser.close()
  process.exit(1)
}

const all = []
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`)
  await page.waitForTimeout(1200)
  // A lazily-loaded route can still be showing an empty Suspense fallback, which
  // would audit as a clean page.
  await page.waitForSelector('nav a, [role="navigation"] a', { timeout: 10000 }).catch(() => {})
  const found = await page.evaluate(measureInPage)
  if (found.length === 0) console.error(`  ! ${route} rendered no controls — check it loaded`)
  // Positional identity: both passes walk the same selector in document order,
  // so index is the only thing that distinguishes six identical rank buttons.
  const covered = new Set(await page.evaluate(findOccludedInPage))
  all.push(...found.map((el, i) => ({ ...el, route, occluded: covered.has(i) })))
}

await browser.close()

const { checked, offenders, uniqueOffenders, occluded, byRoute } = summarise(all, MIN_TARGET_PX)

console.log(`\nTouch-target audit — minimum ${MIN_TARGET_PX}x${MIN_TARGET_PX}, ${CONTEXT.viewport.width}x${CONTEXT.viewport.height} mobile context`)
console.log(`checked ${checked} controls across ${ROUTES.length} routes`)
console.log(`under ${MIN_TARGET_PX}pt: ${offenders.length} sightings, ${uniqueOffenders.length} distinct controls\n`)
for (const [route, count] of Object.entries(byRoute).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${route}`)
}
// The distinct list is the worklist; the raw count mostly measures how many
// routes the shared shell appears on.
console.log('')
if (occluded.length > 0) {
  console.log(`\ncovered by something else — a tap at the centre misses (${occluded.length}):`)
  for (const el of occluded) console.log('  ' + formatOffender(el))
  console.log('')
}

for (const el of uniqueOffenders) {
  const repeats = el.sightings > 1 ? `  x${el.sightings}` : ''
  const shared = el.routes.length > 1 ? ` across ${el.routes.length} routes` : ''
  console.log(formatOffender(el) + repeats + shared)
}

// Reporting tool, not a gate: it always exits 0 so a run never blocks anything.
// Turning it into a gate needs a baseline first — see #73.
process.exit(0)
