import { expect, it } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'

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
  const help = readFileSync('src/pages/Help.jsx', 'utf8')
  expect(help).toContain('only cloud-storage builds sync')
  expect(help).not.toContain('stored in your account, and synced')
  expect(help + concepts).not.toContain('$0.04')
  const workflows = readFileSync('docs/USER-WORKFLOWS.md', 'utf8')
  expect(workflows).toContain('Backup export embeds canonical image blobs')
  expect(workflows).not.toContain('signed image URLs are not fetched')
})

it('keeps the new guide images referenced in the user guide and Help', () => {
  const guide = readFileSync('docs/06-concepts.md', 'utf8')
  const help = readFileSync('src/pages/Help.jsx', 'utf8')
  for (const file of ['concept-refinement.png', 'concept-refinement-compare.png']) {
    expect(guide).toContain(file)
    expect(help).toContain(file)
    expect(existsSync(`public/guide/${file}`)).toBe(true)
  }
  const docs = readdirSync('docs').filter((file) => file.endsWith('.md'))
    .map((file) => readFileSync(`docs/${file}`, 'utf8')).join('\n')
  const readme = readFileSync('README.md', 'utf8')
  const referenced = [...new Set([...`${docs}\n${readme}`.matchAll(/guide\/([a-z-]+\.png)/g)]
    .map((match) => match[1]))].sort()
  const files = readdirSync('public/guide').filter((file) => file.endsWith('.png')).sort()
  expect(referenced).toEqual(files)
})
