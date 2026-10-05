import { expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

it('documents manual fallback, durability limits and deferred activation', () => {
  const concepts = readFileSync('docs/06-concepts.md', 'utf8')
  const activation = readFileSync('docs/RELAY-ACTIVATION.md', 'utf8')
  expect(concepts).toContain('Copy refinement prompt')
  expect(concepts).toContain('Export source image')
  expect(activation).toContain('15-minute')
  expect(activation).toContain('separate approval')
  expect(activation).toContain('Unactivated')
  expect(activation).toContain('Safari')
  expect(activation).toContain('8 MiB')
  expect(activation).toContain('dispatched')
})

it('keeps the new guide images referenced in the user guide and Help', () => {
  const guide = readFileSync('docs/06-concepts.md', 'utf8')
  const help = readFileSync('src/pages/Help.jsx', 'utf8')
  for (const file of ['concept-refinement.png', 'concept-refinement-compare.png']) {
    expect(guide).toContain(file)
    expect(help).toContain(file)
    expect(existsSync(`public/guide/${file}`)).toBe(true)
  }
})
