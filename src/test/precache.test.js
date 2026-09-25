import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { selectPrecacheAssets, isObsoleteAsset } from '../sw/precache'
import precachePlugin, { injectManifest } from '../../scripts/precachePlugin'

describe('selectPrecacheAssets', () => {
  const distFiles = [
    'index.html',
    'sw.js',
    'manifest.json',
    'favicon.svg',
    'icons.svg',
    'audit.html',
    'assets/index-BfUKuelg.css',
    'assets/index-CvExn1iI.js',
    'assets/three.module-UEBaNSRS.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'images/artists/zoia.ink/01.jpg',
    'images/demo/mora.blackfern/fern-v4.webp',
    'images/demo/mora.blackfern/fern-v4-thumb.webp',
    'guide/wall.png',
  ]

  it('includes hashed JS/CSS chunks and PWA shell assets, as root-relative URLs', () => {
    const urls = selectPrecacheAssets(distFiles)
    expect(urls).toContain('/assets/index-CvExn1iI.js')
    expect(urls).toContain('/assets/index-BfUKuelg.css')
    expect(urls).toContain('/assets/three.module-UEBaNSRS.js')
    expect(urls).toContain('/manifest.json')
    expect(urls).toContain('/favicon.svg')
    expect(urls).toContain('/icons.svg')
    expect(urls).toContain('/icons/icon-192.png')
    expect(urls).toContain('/images/demo/mora.blackfern/fern-v4.webp')
    expect(urls).toContain('/images/demo/mora.blackfern/fern-v4-thumb.webp')
  })

  it('excludes the shell, the SW itself, and heavy local-only content', () => {
    const urls = selectPrecacheAssets(distFiles)
    // index.html is already precached as APP_SHELL and served network-first.
    expect(urls).not.toContain('/index.html')
    expect(urls).not.toContain('/sw.js')
    expect(urls).not.toContain('/audit.html')
    // Personal reference images (potentially hundreds of MB) and guide
    // screenshots are runtime-cached on demand, never precached.
    expect(urls).not.toContain('/images/artists/zoia.ink/01.jpg')
    expect(urls.some((u) => u.startsWith('/guide/'))).toBe(false)
  })

  it('returns a sorted, deduplicated list', () => {
    const urls = selectPrecacheAssets([...distFiles, 'manifest.json'])
    expect(urls).toEqual([...new Set(urls)].sort())
  })

  it('prefixes every URL with the deploy base so a sub-path (GitHub Pages) resolves', () => {
    const urls = selectPrecacheAssets(distFiles, '/sable/')
    expect(urls).toContain('/sable/assets/index-CvExn1iI.js')
    expect(urls).toContain('/sable/manifest.json')
    expect(urls).toContain('/sable/images/demo/mora.blackfern/fern-v4.webp')
    expect(urls.every((u) => u.startsWith('/sable/'))).toBe(true)
  })
})

describe('isObsoleteAsset', () => {
  const manifest = ['/assets/index-NEW.js', '/assets/index-NEW.css', '/manifest.json']

  it('flags hashed assets from an older build for cleanup', () => {
    expect(isObsoleteAsset('/assets/index-OLD.js', manifest)).toBe(true)
    expect(isObsoleteAsset('/assets/three.module-OLD.js', manifest)).toBe(true)
  })

  it('keeps assets that are in the current manifest', () => {
    expect(isObsoleteAsset('/assets/index-NEW.js', manifest)).toBe(false)
  })

  it('never touches non-/assets/ cache entries (shell, fonts, runtime cache)', () => {
    expect(isObsoleteAsset('/index.html', manifest)).toBe(false)
    expect(isObsoleteAsset('/', manifest)).toBe(false)
    expect(isObsoleteAsset('/icons/icon-192.png', manifest)).toBe(false)
  })

  it('is base-aware: only sweeps assets under the given deploy base', () => {
    const m = ['/sable/assets/index-NEW.js']
    expect(isObsoleteAsset('/sable/assets/index-OLD.js', m, '/sable/')).toBe(true)
    expect(isObsoleteAsset('/sable/assets/index-NEW.js', m, '/sable/')).toBe(false)
    // A root-path asset is not ours to sweep when deployed under a sub-path.
    expect(isObsoleteAsset('/assets/index-OLD.js', m, '/sable/')).toBe(false)
  })
})

describe('injectManifest', () => {
  const source = "const BUILD_MANIFEST = /* __PRECACHE_MANIFEST__ */ []\n"

  it('replaces the placeholder with the JSON asset list', () => {
    const out = injectManifest(source, ['/assets/a.js', '/assets/b.css'])
    expect(out).toContain('const BUILD_MANIFEST = ["/assets/a.js","/assets/b.css"]')
    expect(out).not.toContain('__PRECACHE_MANIFEST__')
  })

  it('throws if the placeholder has drifted out of sw.js', () => {
    expect(() => injectManifest('const nope = []', ['/assets/a.js'])).toThrow(/__PRECACHE_MANIFEST__/)
  })
})

describe('precache build plugin', () => {
  it('refreshes an already-injected service worker on a repeated build', () => {
    const root = mkdtempSync(join(tmpdir(), 'sable-precache-'))
    try {
      mkdirSync(join(root, 'public'))
      mkdirSync(join(root, 'dist', 'assets'), { recursive: true })
      writeFileSync(join(root, 'public', 'sw.js'), 'const BUILD_MANIFEST = /* __PRECACHE_MANIFEST__ */ []')
      writeFileSync(join(root, 'dist', 'sw.js'), 'const BUILD_MANIFEST = ["/assets/old.js"]')
      writeFileSync(join(root, 'dist', 'assets', 'new.js'), '')
      const plugin = precachePlugin()
      plugin.configResolved({ root, build: { outDir: 'dist' }, base: '/' })

      plugin.closeBundle()

      expect(readFileSync(join(root, 'dist', 'sw.js'), 'utf8')).toContain('/assets/new.js')
      expect(readFileSync(join(root, 'dist', 'sw.js'), 'utf8')).not.toContain('/assets/old.js')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('public/sw.js precache contract', () => {
  const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

  it('carries the build-manifest placeholder for the Vite plugin to fill', () => {
    expect(sw).toMatch(/const BUILD_MANIFEST = \/\* __PRECACHE_MANIFEST__ \*\/ \[\]/)
  })

  it('bumps the cache version past v3 (precache is a caching-behaviour change)', () => {
    const match = sw.match(/const CACHE_NAME = '([^']+)'/)
    expect(match).toBeTruthy()
    expect(['tattoo-v1', 'tattoo-v2', 'tattoo-v3']).not.toContain(match[1])
  })

  it('precaches the build manifest tolerantly, so one missing file cannot brick install', () => {
    expect(sw).toContain('BUILD_MANIFEST')
    expect(sw).toMatch(/Promise\.allSettled/)
  })

  it('matches the cache with ignoreVary so Vary: Origin hosts cannot break offline', () => {
    // Precached entries are fetched without an Origin header; the page's
    // crossorigin module scripts send one. With a Vary: Origin response,
    // a default cache.match would miss and offline would ERR_FAILED.
    expect(sw).toMatch(/caches\.match\(request, \{ ignoreVary: true \}\)/)
  })

  it('cleans obsolete asset entries on activate instead of hoarding old builds', () => {
    expect(sw).toMatch(/BASE \+ 'assets\/'/)
    expect(sw).toMatch(/activate/)
  })

  it('derives its base from where it is served, so it works under any deploy path', () => {
    // '/sw.js' → '/', '/sable/sw.js' → '/sable/' — no build-time rewrite needed.
    expect(sw).toMatch(/const BASE = self\.location\.pathname\.replace\(\/sw\\\.js\$\/, ''\)/)
    expect(sw).toContain('const APP_SHELL = BASE +')
  })
})

describe('vite.config.js contract', () => {
  it('registers the precache plugin so builds actually get a manifest', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.js'), 'utf8')
    expect(config).toMatch(/precachePlugin/)
  })
})
