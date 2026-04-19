#!/usr/bin/env node
// Fetches public Instagram grid thumbnails for one or more handles and saves
// them to public/images/artists/<id>/<n>.jpg, then patches src/data/artists.js.
//
// Usage: node scripts/fetch-instagram-images.js [--count N] <handle> [<handle>...]
//
// The handle is looked up against DEFAULT_ARTISTS to determine the artist id
// (so id/handle mismatches like handle: 'johndarktattoo_' → id: 'johndarktattoo'
// are handled correctly). Existing files in the target folder are overwritten.

import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath, pathToFileURL } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public', 'images', 'artists')
const ARTISTS_JS = path.join(ROOT, 'src', 'data', 'artists.js')

function parseArgs(argv) {
  let count = 10
  const handles = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') { count = parseInt(argv[++i], 10); continue }
    handles.push(argv[i])
  }
  return { count, handles }
}

async function loadHandleToId() {
  const mod = await import(pathToFileURL(ARTISTS_JS).href)
  const map = {}
  for (const a of mod.DEFAULT_ARTISTS) map[a.handle] = a.id
  return map
}

async function extractPostImages(page, handle, count) {
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  return page.evaluate((limit) => {
    const imgs = Array.from(document.querySelectorAll('img'))
    const posts = imgs
      .filter(i => !i.alt.toLowerCase().endsWith('profile picture'))
      .filter(i => i.src.includes('/t51.'))
    const picked = []
    const seen = new Set()
    for (const i of posts) {
      let best = i.src
      if (i.srcset) {
        let bestW = 0
        for (const part of i.srcset.split(',')) {
          const [url, wStr] = part.trim().split(' ')
          const w = parseInt(wStr || '0', 10)
          if (w > bestW) { bestW = w; best = url }
        }
      }
      // Dedupe by the underlying media id (path segment before first '?')
      const key = best.split('?')[0]
      if (seen.has(key)) continue
      seen.add(key)
      picked.push(best)
      if (picked.length >= limit) break
    }
    return picked
  }, count)
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }).on('error', reject)
  })
}

function updateArtistsJs(idToPaths) {
  let src = fs.readFileSync(ARTISTS_JS, 'utf8')
  for (const [id, paths] of Object.entries(idToPaths)) {
    if (!paths.length) continue
    const pathsLiteral = JSON.stringify(paths)
    const re = new RegExp(`(\\{[^}]*id:\\s*'${id}'[^}]*images:\\s*)\\[[^\\]]*\\]`, 's')
    if (re.test(src)) {
      src = src.replace(re, `$1${pathsLiteral}`)
    } else {
      console.warn(`  warn   could not find artist id '${id}' in artists.js`)
    }
  }
  fs.writeFileSync(ARTISTS_JS, src)
}

;(async () => {
  const { count, handles } = parseArgs(process.argv.slice(2))
  if (handles.length === 0) {
    console.error('Usage: node scripts/fetch-instagram-images.js [--count N] <handle> [<handle>...]')
    process.exit(1)
  }

  const handleToId = await loadHandleToId()
  const unknown = handles.filter(h => !handleToId[h])
  if (unknown.length) {
    console.error(`Unknown handle(s) (not in artists.js): ${unknown.join(', ')}`)
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  const idToPaths = {}

  for (const handle of handles) {
    const id = handleToId[handle]
    console.log(`\n${handle} → ${id}`)
    let urls = []
    try {
      urls = await extractPostImages(page, handle, count)
    } catch (err) {
      console.error(`  error  ${err.message}`)
      continue
    }
    if (urls.length === 0) {
      console.warn('  warn   no post images found')
      continue
    }
    const dir = path.join(PUBLIC_DIR, id)
    fs.mkdirSync(dir, { recursive: true })
    const saved = []
    for (let i = 0; i < urls.length; i++) {
      const filename = `${i + 1}.jpg`
      const dest = path.join(dir, filename)
      try {
        await download(urls[i], dest)
        saved.push(`/images/artists/${id}/${filename}`)
        console.log(`  saved  ${id}/${filename}`)
      } catch (err) {
        console.error(`  error  ${id}/${filename}: ${err.message}`)
      }
    }
    if (saved.length) idToPaths[id] = saved
  }

  await browser.close()

  if (Object.keys(idToPaths).length) {
    console.log('\nUpdating src/data/artists.js …')
    updateArtistsJs(idToPaths)
    const total = Object.values(idToPaths).reduce((n, p) => n + p.length, 0)
    console.log(`Done — ${total} image(s) saved.`)
  } else {
    console.log('\nNothing saved.')
  }
})()
