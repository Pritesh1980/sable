import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function listFilesRecursive(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full))
    else out.push(full)
  }
  return out
}

function uiFiles() {
  return ['src/pages', 'src/components']
    .flatMap((d) => listFilesRecursive(join(root, d)))
    .filter((f) => /\.jsx?$/.test(f))
    .map((f) => ({ path: f, rel: f.replace(root + '/', ''), src: readFileSync(f, 'utf8') }))
}

// Full-screen viewer containers that take programmatic focus so keyboard events
// (arrows, Escape) reach them. They are not controls the user tabs to, and a ring
// around the entire viewport would be noise — suppressing the outline is correct.
const OUTLINE_EXEMPT = ['src/components/WallViewer.jsx', 'src/components/ConceptViewer.jsx']

describe('touch affordances (#49)', () => {
  // Hover-to-reveal is unreachable on a touch device: `group-hover:` only ever
  // applies under `@media (hover: hover)`, but the `opacity-0` that hides the
  // control is unconditional. On iPhone that left four live buttons — including
  // Brief's destructive remove-photo — invisible yet tappable, reachable only via
  // iOS's sticky :hover (tap to reveal, tap again to act).
  //
  // The fix is to make the *hiding* conditional too: `can-hover:opacity-0` so the
  // control is simply always visible on touch, and unchanged on a mouse.
  it('never hides a hover-revealed control unconditionally', () => {
    const offenders = []
    for (const { rel, src } of uiFiles()) {
      src.split('\n').forEach((line, i) => {
        if (!/group-hover:opacity-/.test(line)) return
        // Bare `opacity-0` — not preceded by a variant prefix such as `can-hover:`.
        if (/(?<![\w:-])opacity-0(?![\w-])/.test(line)) {
          offenders.push(`${rel}:${i + 1} — opacity-0 → use can-hover:opacity-0`)
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('defines the can-hover variant and no longer overrides hover globally', () => {
    // Comments stripped: index.css explains why the old shim was removed, and
    // naming it in prose must not read as redeclaring it.
    const css = readFileSync(join(root, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

    // Either the block form (`@custom-variant can-hover { @media … { @slot } }`)
    // or the `(@media …)` shorthand — they compile identically. This asserts the
    // declaration exists and gates on hover; that it lands inside the media query
    // in the built CSS is only checkable against dist, not source.
    expect(css).toMatch(/@custom-variant\s+can-hover\b[\s\S]{0,80}?@media\s*\(hover:\s*hover\)/)
    // The Tailwind 4 migration shim. Once hiding is gated on `can-hover`, forcing
    // every `hover:` in the app to apply on touch is no longer needed — and it
    // actively causes sticky-hover states on iOS.
    expect(css).not.toMatch(/@custom-variant\s+hover\s+\(&:hover\)/)
  })
})

describe('focus affordances (#50)', () => {
  // `outline-hidden` removes the browser's default focus ring. Anything that does
  // so must put something visible back, or keyboard focus becomes invisible.
  it('pairs every outline suppression with a visible focus state', () => {
    const exempt = new Set(OUTLINE_EXEMPT)
    const offenders = []

    for (const { rel, src } of uiFiles()) {
      if (exempt.has(rel)) continue
      src.split('\n').forEach((line, i) => {
        if (!/outline-hidden/.test(line)) return
        const hasAffordance = /focus-visible:ring|focus:border-|focus:bg-/.test(line)
        if (!hasAffordance) {
          offenders.push(`${rel}:${i + 1} — outline-hidden with no focus affordance`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
