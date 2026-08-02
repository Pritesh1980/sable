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

  // Without an explicit `id`, a PWA's identity is derived from start_url — so
  // changing start_url re-keys the app and installed tiles stop updating
  // (they appear as a second, separate install). Pinning `id` decouples the
  // two, leaving start_url free to change.
  // Files can only be shared via POST/multipart; the service worker answers it
  // (a static host can't). The field name here is the one sw.js reads.
  it('declares a share_target the service worker can actually serve', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))
    const st = manifest.share_target

    expect(st).toBeTruthy()
    expect(st.method.toUpperCase()).toBe('POST')
    expect(st.enctype).toBe('multipart/form-data')
    expect(st.action.startsWith('/'), 'action must be relative like every other manifest URL').toBe(false)

    const files = st.params.files
    expect(Array.isArray(files) && files.length).toBeTruthy()
    expect(files[0].name).toBe('images')
    expect(files[0].accept.some((a) => a.startsWith('image/'))).toBe(true)
  })

  it('points share_target at the same path the worker intercepts', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))
    const sw = readFileSync(join(root, 'public/sw.js'), 'utf8')
    // './share' resolves against the manifest's own location, matching the
    // worker's BASE + 'share'.
    expect(manifest.share_target.action.replace(/^\.\//, '')).toBe('share')
    expect(sw).toContain("BASE + 'share'")
  })

  it('pins an explicit id so identity survives a start_url change', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))

    expect(manifest.id).toBeTruthy()
    expect(manifest.id.startsWith('/'), 'id must not be root-absolute').toBe(false)
  })
})
