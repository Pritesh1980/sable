import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const MAX_WEBP_BYTES = 250 * 1024
const DEMO_RENDERS = [
  'docs/images/demo-on-body-hero.webp',
  'docs/images/demo-on-body-upper.webp',
  'docs/images/demo-on-body-forearm.webp',
]

function isWebp(path) {
  const bytes = readFileSync(path)
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
}

describe('Blender fictional demo and guide renders (#194)', () => {
  it('commits compact WebP renders under docs/images/', () => {
    for (const rel of DEMO_RENDERS) {
      const full = join(ROOT, rel)
      expect(existsSync(full), `${rel} should exist`).toBe(true)
      expect(isWebp(full), `${rel} should be a valid WebP file`).toBe(true)
      expect(statSync(full).size, `${rel} should stay under 250 KiB`).toBeLessThan(MAX_WEBP_BYTES)
    }
  })

  it('references the renders in README.md and Concepts guide and documents regeneration', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    const concepts = readFileSync(join(ROOT, 'docs/06-concepts.md'), 'utf8')
    const blenderDoc = readFileSync(join(ROOT, 'docs/BLENDER.md'), 'utf8')

    expect(readme).toContain('docs/images/demo-on-body-hero.webp')
    expect(concepts).toContain('images/demo-on-body-upper.webp')
    expect(concepts).toContain('images/demo-on-body-forearm.webp')
    expect(blenderDoc).toContain('npm run render:demo-guide')
  })
})
