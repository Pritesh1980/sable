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

// A className is frequently a multi-line template literal or ternary, so scanning
// line-by-line lets `opacity-0` on one line and `group-hover:opacity-100` on the next
// slip past. Collapse each className expression to a single string, keeping the line
// it starts on for reporting.
function classNameExpressions(src) {
  const out = []
  const re = /className\s*=\s*(\{`|\{|")/g
  let m
  while ((m = re.exec(src)) !== null) {
    const open = m[1]
    const start = m.index + m[0].length
    let end
    if (open === '"') {
      end = src.indexOf('"', start)
    } else {
      // Balance braces so nested ${...} and ternaries are captured whole.
      let depth = 1
      let i = start
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
        i++
      }
      end = i - 1
    }
    if (end === -1 || end <= start) continue
    const text = src.slice(start, end)
    // The element this className belongs to: scan back to the opening `<tag`.
    const before = src.slice(0, m.index)
    const tag = (before.match(/<([A-Za-z][\w.]*)(?![\s\S]*<[A-Za-z])/) || [])[1] || '?'
    out.push({
      line: before.split('\n').length,
      text: text.replace(/\s+/g, ' '),
      tag,
    })
  }
  return out
}

// Decorative overlays are not tap targets; controls are. A drag handle is a `div`
// spread with dnd-kit listeners, so treat `cursor-grab` as interactive too.
function isInteractive({ tag, text }) {
  if (/pointer-events-none/.test(text)) return false
  return tag === 'button' || tag === 'a' || /cursor-grab/.test(text)
}

// Tailwind spacing unit is 0.25rem, so 11 => 44px. Anything at or above that on
// both axes clears the 44pt minimum.
function meetsTouchTarget(text) {
  const axis = (props) => {
    const re = new RegExp(`(?:^|[\\s'"\`])(?:min-)?(?:${props})-(\\d+)(?![\\w-])`, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      if (Number(m[1]) >= 11) return true
    }
    return false
  }
  return axis('w') && axis('h')
}

// `ring-0` and transparent colours satisfy a naive "has a focus affordance" check
// while rendering nothing. Anything matching these is not an affordance.
const NULL_AFFORDANCE = /(?:ring|border)-(?:0|transparent)(?![\w-])/

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
      for (const { line, text } of classNameExpressions(src)) {
        if (!/group-hover:opacity-/.test(text)) continue
        // Bare `opacity-0` — not preceded by a variant prefix such as `can-hover:`.
        if (/(?<![\w:-])opacity-0(?![\w-])/.test(text)) {
          offenders.push(`${rel}:${line} — opacity-0 → use can-hover:opacity-0`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  // Opacity changes painting, not hit-testing — a full-bleed hover-revealed control
  // is a tap-anywhere target whether or not you can see it. Made visible on touch, a
  // `inset-0` destructive overlay also veils the image it sits on. Localised targets
  // only.
  it('has no full-bleed hover-revealed controls', () => {
    const offenders = []
    for (const { rel, src } of uiFiles()) {
      for (const { line, text } of classNameExpressions(src)) {
        if (!/can-hover:opacity-0/.test(text)) continue
        if (/(?<![\w-])inset-0(?![\w-])/.test(text)) {
          offenders.push(`${rel}:${line} — inset-0 hover-revealed control; use a localised target`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  // #51. Making these controls visible on touch (#49) did not make them reachable:
  // the filmstrip rank nudges were 16x14px. Apple asks for 44x44pt. The hit area is
  // what has to grow — the visible chip stays small, nested inside.
  it('gives every hover-revealed control a 44pt hit area', () => {
    const offenders = []
    for (const { rel, src } of uiFiles()) {
      for (const expr of classNameExpressions(src)) {
        if (!/can-hover:opacity-0/.test(expr.text)) continue
        if (!isInteractive(expr)) continue
        if (!meetsTouchTarget(expr.text)) {
          offenders.push(`${rel}:${expr.line} — <${expr.tag}> below 44pt; needs w/h >= 11`)
        }
      }
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
    // actively causes sticky-hover states on iOS. Matches the shorthand and the
    // block form (`@custom-variant hover { &:hover { @slot } }`) alike — anything
    // that redefines the bare `hover` variant at all.
    expect(css).not.toMatch(/@custom-variant\s+hover\s*[({]/)
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
      for (const { line, text } of classNameExpressions(src)) {
        if (!/outline-hidden/.test(text)) continue
        const affordances = text.match(/(?:focus-visible:ring|focus:border|focus:bg)-[\w./[\]-]+/g) || []
        const real = affordances.filter((a) => !NULL_AFFORDANCE.test(a))
        if (real.length === 0) {
          offenders.push(`${rel}:${line} — outline-hidden with no visible focus affordance`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
