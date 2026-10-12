import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// SonarQube S6848 (#104): a non-interactive element with an onClick either says
// what it is (role="button" with tabIndex + a key handler, or role="presentation"
// on a backdrop whose keyboard path is Escape) or it is invisible to keyboard and
// screen-reader users. The per-component specs cover behaviour; this catches a
// new click target written without a role anywhere in the UI.

const ROOTS = ['src/components', 'src/pages']
// Remove once #146 merges: it rewrites ConceptPiece's <figure>, so keyboard
// access is added on top of that rather than in a conflicting parallel edit.
const PENDING = new Set(['src/components/ConceptPiece.jsx'])
const NON_INTERACTIVE = new Set(['div', 'span', 'li', 'figure', 'section', 'article', 'img', 'p', 'ul'])

function jsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return jsxFiles(path)
    return entry.name.endsWith('.jsx') ? [path] : []
  })
}

// The opening tag starting at `start` ('<'), skipping over {…} expressions and
// quoted strings so a `>` inside an arrow function doesn't end it early.
// Linear in the tag's length.
function openingTag(source, start) {
  let depth = 0
  let quote = null
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
    } else if (ch === '>' && depth === 0) {
      return source.slice(start, i + 1)
    }
  }
  return source.slice(start)
}

export function unlabelledClickTargets(source) {
  const found = []
  for (const match of source.matchAll(/<([a-z]+)[\s>]/g)) {
    if (!NON_INTERACTIVE.has(match[1])) continue
    const tag = openingTag(source, match.index)
    if (/\sonClick=/.test(tag) && !/\srole=/.test(tag)) {
      found.push(`line ${source.slice(0, match.index).split('\n').length}: <${match[1]}>`)
    }
  }
  return found
}

describe('clickable non-interactive elements carry a role', () => {
  it('detects a bare click target, and accepts one with a role', () => {
    expect(unlabelledClickTargets('<div className="x" onClick={() => a > b}>hi</div>')).toEqual(['line 1: <div>'])
    expect(unlabelledClickTargets('<div role="presentation"\n  onClick={close}>hi</div>')).toEqual([])
    expect(unlabelledClickTargets('<button onClick={go}>go</button>')).toEqual([])
  })

  it('holds across src/components and src/pages', () => {
    const offenders = ROOTS.flatMap(jsxFiles).filter((file) => !PENDING.has(file)).flatMap((file) =>
      unlabelledClickTargets(readFileSync(file, 'utf8')).map((where) => `${file} ${where}`))
    expect(offenders).toEqual([])
  })
})
