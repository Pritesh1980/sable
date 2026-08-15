import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const script = readFileSync(join(root, 'scripts/auditTouchTargets.mjs'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// The audit needs a real browser, so Vitest cannot run it. Same treatment as
// `public/sw.js`: the judgement lives in a pure module with unit tests
// (src/a11y/touchTargets.js), and this asserts the wrapper's invariants as text.
describe('touch-target audit script (#73)', () => {
  it('is wired to an npm script', () => {
    expect(pkg.scripts['audit:targets']).toBe('node scripts/auditTouchTargets.mjs')
  })

  it('reuses the tested judgement rather than re-implementing it', () => {
    expect(script).toMatch(/from '\.\.\/src\/a11y\/touchTargets\.js'/)
    expect(script).toMatch(/\bsummarise\b/)
    // A second hard-coded 44 here would be a number that could drift from the
    // one the tests pin.
    expect(script).not.toMatch(/\b44\b/)
  })

  // The distinction that makes the audit meaningful: a resized desktop context
  // still reports `hover: hover`, so hover-revealed controls would measure as
  // present-but-invisible or absent. Only a mobile context reports `hover: none`.
  it('measures in a real mobile context, not a narrow desktop one', () => {
    expect(script).toMatch(/isMobile:\s*true/)
    expect(script).toMatch(/hasTouch:\s*true/)
  })

  it('seeds the demo dataset, or there would be almost nothing to measure', () => {
    expect(script).toMatch(/\?demo=1/)
  })

  it('covers every deep-linkable route', () => {
    for (const route of ['/', '/gallery', '/brief', '/conventions', '/studios', '/concepts', '/settings', '/help']) {
      expect(script).toContain(`'${route}'`)
    }
  })

  // It reports findings; it does not gate on them. Making it fail on offenders
  // needs an agreed baseline first, and a red run on day one would just get
  // switched off.
  it('exits 0 however many offenders it finds', () => {
    expect(script).toMatch(/process\.exit\(0\)/)
  })

  // It does fail when it could not measure the right thing. An audit that
  // silently reports the Login page under all eight routes reads as good news
  // (codex review), which is worse than no audit.
  it('fails loudly when the demo did not seed', () => {
    expect(script).toMatch(/process\.exit\(1\)/)
    expect(script).toMatch(/onLogin/)
  })
})
