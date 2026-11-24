import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const MIN_WEBP_BYTES = 4096
const MAX_WEBP_BYTES = 250 * 1024
const DEMO_RENDERS = [
  'docs/images/demo-on-body-hero.webp',
  'docs/images/demo-on-body-upper.webp',
  'docs/images/demo-on-body-forearm.webp',
]

function parseWebpDimensions(bytes) {
  if (bytes.length < 24) return null
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null
  const riffEnd = 8 + bytes.readUInt32LE(4)
  if (riffEnd < 20 || riffEnd > bytes.length) return null
  let pos = 12
  while (pos + 8 <= riffEnd) {
    const tag = bytes.subarray(pos, pos + 4).toString('ascii')
    const chunkLen = bytes.readUInt32LE(pos + 4)
    const payload = pos + 8
    if (payload + chunkLen > riffEnd) return null
    if (tag === 'VP8 ' && chunkLen >= 10) {
      if ((bytes[payload] & 1) !== 0 || bytes[payload + 3] !== 0x9d || bytes[payload + 4] !== 0x01 || bytes[payload + 5] !== 0x2a) {
        return null
      }
      return {
        width: bytes.readUInt16LE(payload + 6) & 0x3fff,
        height: bytes.readUInt16LE(payload + 8) & 0x3fff,
      }
    }
    if (tag === 'VP8L' && chunkLen >= 5 && bytes[payload] === 0x2f) {
      const bits = bytes.readUInt32LE(payload + 1)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      }
    }
    if (tag === 'VP8X' && chunkLen >= 10) {
      return {
        width: 1 + bytes[payload + 4] + (bytes[payload + 5] << 8) + (bytes[payload + 6] << 16),
        height: 1 + bytes[payload + 7] + (bytes[payload + 8] << 8) + (bytes[payload + 9] << 16),
      }
    }
    pos = payload + chunkLen + (chunkLen & 1)
  }
  return null
}

describe('Blender fictional demo and guide renders (#194)', () => {
  it('commits valid portrait WebP renders under docs/images/', () => {
    for (const rel of DEMO_RENDERS) {
      const full = join(ROOT, rel)
      expect(existsSync(full), `${rel} should exist`).toBe(true)
      const bytes = readFileSync(full)
      const dims = parseWebpDimensions(bytes)
      expect(dims, `${rel} should contain a valid WebP frame`).not.toBeNull()
      expect(dims.width, `${rel} width should be >= 512px`).toBeGreaterThanOrEqual(512)
      expect(dims.height, `${rel} height should be >= 768px`).toBeGreaterThanOrEqual(768)
      const { size } = statSync(full)
      expect(size, `${rel} should stay above 4 KiB`).toBeGreaterThanOrEqual(MIN_WEBP_BYTES)
      expect(size, `${rel} should stay under 250 KiB`).toBeLessThan(MAX_WEBP_BYTES)
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
