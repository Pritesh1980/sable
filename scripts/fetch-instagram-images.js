#!/usr/bin/env node
// Fetches public Instagram grid thumbnails for one or more handles and saves
// them to public/images/artists/<id>/<n>.jpg, then patches src/data/artists.js.
//
// Usage:
//   node scripts/fetch-instagram-images.js [--count N] [--append] <handle> [<handle>...]
//   node scripts/fetch-instagram-images.js [--count N] [--append] --all
//
// Flags:
//   --count N    target image count (default 10)
//   --append     non-destructive: keep existing files, add new ones up to N total,
//                de-duped by SHA-256 of image bytes. Writes appear as N+1.jpg, N+2.jpg…
//                and are appended to the existing images array.
//   --all        run across every artist in DEFAULT_ARTISTS (handy with --append)
//
// The handle is looked up against DEFAULT_ARTISTS to determine the artist id
// (so id/handle mismatches like handle: 'johndarktattoo_' → id: 'johndarktattoo'
// are handled correctly).

import fs from 'fs'
import path from 'path'
import https from 'https'
import crypto from 'crypto'
import { fileURLToPath, pathToFileURL } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public', 'images', 'artists')
const ARTISTS_JS = path.join(ROOT, 'src', 'data', 'artists.js')
const SESSION_FILE = path.join(ROOT, '.ig-session.json')

function parseArgs(argv) {
  let count = 10
  let append = false
  let all = false
  const handles = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') { count = parseInt(argv[++i], 10); continue }
    if (argv[i] === '--append') { append = true; continue }
    if (argv[i] === '--all') { all = true; continue }
    handles.push(argv[i])
  }
  return { count, append, all, handles }
}

async function loadArtists() {
  const mod = await import(pathToFileURL(ARTISTS_JS).href)
  return mod.DEFAULT_ARTISTS
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function getExistingFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(f))
}

function getMaxNumber(files) {
  let max = 0
  for (const f of files) {
    const m = f.match(/^(\d+)\./)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

async function scrollGrid(page, targetItems) {
  let prev = 0
  for (let i = 0; i < 8; i++) {
    const count = await page.evaluate(() =>
      document.querySelectorAll('img[srcset]').length
    )
    if (count >= targetItems) break
    if (i > 1 && count === prev) break // no new loads after settling
    prev = count
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1500)
  }
}

async function extractPostImages(page, handle, target) {
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  // Abort if the profile is age-gated, rate-limited, or unavailable.
  const title = await page.title()
  if (/page couldn't load/i.test(title)) {
    return { error: `rate-limited by Instagram ("${title}")`, rateLimited: true }
  }
  if (/restricted profile|login/i.test(title) && !/photos and videos/i.test(title)) {
    return { error: `page title indicates no access: "${title}"` }
  }
  // Collect enough candidates for post-download dedupe headroom.
  await scrollGrid(page, target * 2)
  const urls = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    const posts = imgs
      .filter(i => !i.alt.toLowerCase().endsWith('profile picture'))
      .filter(i => i.src.includes('/t51.'))
    const picked = []
    const seenKeys = new Set()
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
      const key = best.split('?')[0]
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      picked.push(best)
    }
    return picked
  })
  return { urls }
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function replaceArtistImages(src, id, newArrayLiteral) {
  const re = new RegExp(`(\\{[^}]*id:\\s*'${id}'[^}]*images:\\s*)\\[[^\\]]*\\]`, 's')
  if (!re.test(src)) return { ok: false, src }
  return { ok: true, src: src.replace(re, `$1${newArrayLiteral}`) }
}

function readArtistImagesArray(src, id) {
  const re = new RegExp(`\\{[^}]*id:\\s*'${id}'[^}]*images:\\s*(\\[[^\\]]*\\])`, 's')
  const m = src.match(re)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  const { count, append, all, handles } = parseArgs(process.argv.slice(2))
  if (!all && handles.length === 0) {
    console.error('Usage: node scripts/fetch-instagram-images.js [--count N] [--append] (<handle>... | --all)')
    process.exit(1)
  }

  const artists = await loadArtists()
  const handleToArtist = Object.fromEntries(artists.map(a => [a.handle, a]))

  let targets
  if (all) {
    targets = artists.map(a => a.handle)
  } else {
    const unknown = handles.filter(h => !handleToArtist[h])
    if (unknown.length) {
      console.error(`Unknown handle(s): ${unknown.join(', ')}`)
      process.exit(1)
    }
    targets = handles
  }

  const hasSession = fs.existsSync(SESSION_FILE)
  if (hasSession) console.log('Using saved Instagram session (.ig-session.json)')
  else console.log('No session file found — running anonymously (may hit rate limits)')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 1600 },
    ...(hasSession ? { storageState: SESSION_FILE } : {}),
  })
  const page = await context.newPage()

  let srcJs = fs.readFileSync(ARTISTS_JS, 'utf8')
  const summary = []
  let rateLimitStreak = 0

  for (let idx = 0; idx < targets.length; idx++) {
    const handle = targets[idx]
    const artist = handleToArtist[handle]
    const id = artist.id
    const dir = path.join(PUBLIC_DIR, id)
    const existingFiles = getExistingFiles(dir)
    const existingHashes = new Set(
      existingFiles.map(f => hashBuffer(fs.readFileSync(path.join(dir, f))))
    )
    const currentArray = readArtistImagesArray(srcJs, id) || []

    if (append && currentArray.length >= count) {
      console.log(`\n${handle} → ${id}  [skip, already has ${currentArray.length} ≥ ${count}]`)
      summary.push({ id, added: 0, total: currentArray.length, skipped: true })
      continue
    }

    const needed = append ? Math.max(0, count - currentArray.length) : count
    console.log(`\n${handle} → ${id}  [need ${needed} more, currently ${currentArray.length}]`)

    const { urls, error, rateLimited } = await extractPostImages(page, handle, needed + existingFiles.length + 5)
    if (error) {
      console.warn(`  skip   ${error}`)
      summary.push({ id, added: 0, total: currentArray.length, error })
      if (rateLimited) {
        rateLimitStreak++
        if (rateLimitStreak >= 2) {
          console.warn(`\nInstagram is rate-limiting. Aborting the rest of the run — try again later.`)
          break
        }
        await sleep(15000) // one extra breather before the next attempt
      }
      continue
    }
    rateLimitStreak = 0
    if (!urls.length) {
      console.warn('  warn   no post images found')
      summary.push({ id, added: 0, total: currentArray.length, error: 'empty grid' })
      continue
    }

    fs.mkdirSync(dir, { recursive: true })
    let nextNum = append ? getMaxNumber(existingFiles) + 1 : 1
    const writtenPaths = []
    const writtenHashes = new Set()

    for (const url of urls) {
      if (writtenPaths.length >= needed) break
      let buf
      try {
        buf = await downloadBuffer(url)
      } catch (err) {
        console.warn(`  warn   download failed: ${err.message}`)
        continue
      }
      const h = hashBuffer(buf)
      if (append && (existingHashes.has(h) || writtenHashes.has(h))) continue
      const filename = `${nextNum}.jpg`
      fs.writeFileSync(path.join(dir, filename), buf)
      writtenPaths.push(`/images/artists/${id}/${filename}`)
      writtenHashes.add(h)
      console.log(`  saved  ${id}/${filename}`)
      nextNum++
    }

    if (writtenPaths.length === 0) {
      summary.push({ id, added: 0, total: currentArray.length })
      continue
    }

    // Patch artists.js
    const finalArray = append ? [...currentArray, ...writtenPaths] : writtenPaths
    const { ok, src: newSrc } = replaceArtistImages(srcJs, id, JSON.stringify(finalArray))
    if (!ok) console.warn(`  warn   could not patch artists.js for id '${id}'`)
    else srcJs = newSrc

    summary.push({ id, added: writtenPaths.length, total: finalArray.length })

    // Be polite to IG between profiles
    if (idx < targets.length - 1) await sleep(2500 + Math.random() * 1500)
  }

  fs.writeFileSync(ARTISTS_JS, srcJs)
  await browser.close()

  console.log('\n— Summary —')
  for (const s of summary) {
    if (s.error) console.log(`  ${s.id.padEnd(22)}  (skipped: ${s.error})`)
    else if (s.skipped) console.log(`  ${s.id.padEnd(22)}  (already full at ${s.total})`)
    else console.log(`  ${s.id.padEnd(22)}  +${s.added} → ${s.total} total`)
  }
})()
