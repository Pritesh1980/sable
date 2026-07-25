import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Contract test for the README's own factual claims — the same pattern used for
// public/sw.js: read a file that can't be imported and assert its invariants.
//
// Why this exists: the README claimed "535 Vitest tests across 71 files" long after
// the suite had grown to 632 across 81. Nothing failed, because prose isn't checked.
// A wrong number in the README is worse than no number — it's the first thing a
// reader can verify, and getting it wrong undermines everything next to it.

const ROOT = process.cwd()
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')

// Mirrors vitest's default include: any *.test / *.spec module anywhere under src/.
// Not all of them live in src/test — src/data/geminiImage.test.js sits beside its
// subject, and a guard that only globbed src/test would quietly under-count.
const TEST_FILE = /\.(test|spec)\.(js|jsx)$/

function collectTestFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collectTestFiles(path))
    else if (TEST_FILE.test(entry.name)) found.push(path)
  }
  return found
}

// A lower bound on the number of cases: one per `it(` / `test(` call site. Generated
// cases (`it.each`) expand to several at runtime, so the real total sits at or above
// this floor — which is why the assertion below is a band, not an equality.
function countCaseCallSites(files) {
  const CALL_SITE = /^[ \t]*(?:it|test)(?:\.[a-zA-Z]+)*\s*[([`]/gm
  return files.reduce(
    (n, file) => n + (readFileSync(file, 'utf8').match(CALL_SITE)?.length ?? 0),
    0
  )
}

describe('README claims stay true', () => {
  const claim = README.match(
    /The suite is (\d[\d,]*) Vitest tests across (\d+) files/
  )

  it('states its suite size in the expected form', () => {
    // If this fails, the sentence was reworded — update the pattern above rather
    // than deleting the guard, or the numbers go unchecked again.
    expect(claim, 'README should state "The suite is N Vitest tests across M files"')
      .not.toBeNull()
  })

  it('claims the real number of test files', () => {
    const actual = collectTestFiles(join(ROOT, 'src')).length
    expect(Number(claim[2])).toBe(actual)
  })

  it('claims a test total consistent with the suite', () => {
    const files = collectTestFiles(join(ROOT, 'src'))
    const floor = countCaseCallSites(files)
    const claimed = Number(claim[1].replace(/,/g, ''))

    // At least the statically-visible call sites...
    expect(claimed).toBeGreaterThanOrEqual(floor)
    // ...and not wildly above them. The headroom covers `it.each` expansion; a
    // stale claim left behind by a growing suite falls below the floor and fails.
    expect(claimed).toBeLessThanOrEqual(Math.ceil(floor * 1.15))
  })

  it('points at the detailed architecture doc, and it exists', () => {
    expect(README).toContain('docs/ARCHITECTURE.md')
    expect(existsSync(join(ROOT, 'docs/ARCHITECTURE.md'))).toBe(true)
  })
})
