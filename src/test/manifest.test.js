import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('PWA manifest', () => {
  it('points to installable icon files that exist', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))

    expect(manifest.name).toBe('Tattoo')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)

    for (const icon of manifest.icons) {
      const iconPath = join(root, 'public', icon.src.replace(/^\//, ''))
      expect(existsSync(iconPath), `${icon.src} should exist`).toBe(true)
      expect(icon.type).toBe('image/png')
      expect(icon.purpose).toContain('maskable')
    }
  })
})
