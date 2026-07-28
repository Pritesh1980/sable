import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('PWA manifest', () => {
  it('points to installable icon files that exist', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))

    expect(manifest.name).toBe('Sable')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)

    for (const icon of manifest.icons) {
      const iconPath = join(root, 'public', icon.src.replace(/^\//, ''))
      expect(existsSync(iconPath), `${icon.src} should exist`).toBe(true)
      expect(icon.type).toBe('image/png')
      expect(icon.purpose).toContain('maskable')
    }
  })

  // public/ is copied verbatim by Vite — unlike index.html, nothing rewrites
  // `base` into it. Root-absolute paths therefore resolve against the domain
  // root and 404 on a sub-path deploy (GitHub Pages serves under /sable/).
  // Relative URLs resolve against the manifest's own location, so the same
  // file works at both '/' and '/sable/'.
  it('uses relative URLs so a sub-path deploy resolves them', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))

    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/'), `${icon.src} must not be root-absolute`).toBe(false)
    }
    expect(manifest.start_url.startsWith('/'), 'start_url must not be root-absolute').toBe(false)
    expect(manifest.scope.startsWith('/'), 'scope must not be root-absolute').toBe(false)
  })
})
