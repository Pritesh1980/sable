// Vite plugin: after the build, inject the list of built assets into
// dist/sw.js so the service worker can precache them on install. This closes
// the first-visit offline gap — page assets load before the SW claims the
// page, so without a manifest nothing but the shell is cached until the
// second visit. Dev is untouched (public/sw.js keeps an empty manifest).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { selectPrecacheAssets } from '../src/sw/precache.js'

const PLACEHOLDER = /const BUILD_MANIFEST = \/\* __PRECACHE_MANIFEST__ \*\/ \[\]/

export function injectManifest(swSource, assets) {
  if (!PLACEHOLDER.test(swSource)) {
    throw new Error('precachePlugin: __PRECACHE_MANIFEST__ placeholder not found in sw.js — did public/sw.js drift?')
  }
  return swSource.replace(PLACEHOLDER, `const BUILD_MANIFEST = ${JSON.stringify(assets)}`)
}

function walk(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full, root) : [relative(root, full).split('\\').join('/')]
  })
}

export default function precachePlugin() {
  let outDir = 'dist'
  return {
    name: 'sable-precache-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir)
    },
    closeBundle() {
      const assets = selectPrecacheAssets(walk(outDir))
      const swPath = join(outDir, 'sw.js')
      writeFileSync(swPath, injectManifest(readFileSync(swPath, 'utf8'), assets))
      console.log(`[precache] injected ${assets.length} assets into sw.js`)
    },
  }
}
