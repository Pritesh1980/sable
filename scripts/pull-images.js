#!/usr/bin/env node
// Pulls images stored in the running app's IndexedDB and saves them to
// public/images/artists/<artistId>/<n>.<ext>
// Then updates src/data/artists.js with the new static paths.
//
// Usage: node scripts/pull-images.js [http://localhost:5173]

import fs from 'fs'
import { cpSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public', 'images', 'artists')
const ARTISTS_JS = path.join(ROOT, 'src', 'data', 'artists.js')

const url = process.argv[2] || 'http://localhost:5173'

const EXT_MAP = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/gif': 'gif',
}

async function readIndexedDB(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('tattoo-images-v1', 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = e => {
      const db = e.target.result
      const tx = db.transaction('artist-images', 'readonly')
      const out = {}
      tx.objectStore('artist-images').openCursor().onsuccess = e => {
        const c = e.target.result
        if (c) { out[c.key] = c.value; c.continue() }
        else resolve(out)
      }
      tx.onerror = () => reject(tx.error)
    }
  }))
}

function saveImages(artistId, images) {
  const dir = path.join(PUBLIC_DIR, artistId)
  fs.mkdirSync(dir, { recursive: true })

  const paths = []
  images.forEach((src, i) => {
    if (!src || typeof src !== 'string') return
    if (!src.startsWith('data:')) {
      // Already a static path — keep it
      paths.push(src)
      return
    }
    const match = src.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return
    const ext = EXT_MAP[match[1]] || 'jpg'
    const filename = `${i + 1}.${ext}`
    fs.writeFileSync(path.join(dir, filename), Buffer.from(match[2], 'base64'))
    paths.push(`/images/artists/${artistId}/${filename}`)
    console.log(`  saved  ${artistId}/${filename}`)
  })
  return paths
}

function updateArtistsJs(imagePathMap) {
  let src = fs.readFileSync(ARTISTS_JS, 'utf8')

  for (const [artistId, paths] of Object.entries(imagePathMap)) {
    if (!paths.length) continue
    const pathsLiteral = JSON.stringify(paths)
    // Replace the images array for this artist id
    const re = new RegExp(
      `(\\{[^}]*id:\\s*'${artistId}'[^}]*images:\\s*)\\[[^\\]]*\\]`,
      's'
    )
    if (re.test(src)) {
      src = src.replace(re, `$1${pathsLiteral}`)
    } else {
      console.warn(`  warn   could not find artist id '${artistId}' in artists.js`)
    }
  }

  fs.writeFileSync(ARTISTS_JS, src)
}

;(async () => {
  console.log(`Connecting to ${url} …`)

  // Copy the localhost IndexedDB from Chrome's profile so we can read it
  // without conflicting with a running Chrome instance.
  const chromeIDB = path.join(
    process.env.HOME,
    'Library/Application Support/Google/Chrome/Default/IndexedDB'
  )
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tattoo-pull-'))
  const idbSrc = path.join(chromeIDB, 'http_localhost_5173.indexeddb.leveldb')
  const idbBlob = path.join(chromeIDB, 'http_localhost_5173.indexeddb.blob')
  const idbDest = path.join(tmpDir, 'Default', 'IndexedDB')
  fs.mkdirSync(idbDest, { recursive: true })
  cpSync(idbSrc, path.join(idbDest, 'http_localhost_5173.indexeddb.leveldb'), { recursive: true })
  if (fs.existsSync(idbBlob)) {
    cpSync(idbBlob, path.join(idbDest, 'http_localhost_5173.indexeddb.blob'), { recursive: true })
  }

  const context = await chromium.launchPersistentContext(path.join(tmpDir, 'Default'), {
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check'],
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })

  console.log('Reading IndexedDB …')
  const data = await readIndexedDB(page)
  await context.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })

  const imagePathMap = {}
  let total = 0

  for (const [artistId, images] of Object.entries(data)) {
    if (!Array.isArray(images) || images.length === 0) continue
    console.log(`\n${artistId} (${images.length} image(s))`)
    const paths = saveImages(artistId, images)
    if (paths.length) {
      imagePathMap[artistId] = paths
      total += paths.length
    }
  }

  if (total === 0) {
    console.log('\nNo images found in IndexedDB.')
  } else {
    console.log(`\nUpdating src/data/artists.js …`)
    updateArtistsJs(imagePathMap)
    console.log(`\nDone — ${total} image(s) saved and artists.js updated.`)
  }
})()
