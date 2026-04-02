#!/usr/bin/env node
// Usage: node scripts/import-images.js <path-to-artist-images.json>
//
// Reads the JSON exported from IndexedDB and writes each image to
// public/images/artists/<artistId>/<n>.jpg (or .png/.webp based on data URL).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'images', 'artists')

const jsonPath = process.argv[2]
if (!jsonPath) {
  console.error('Usage: node scripts/import-images.js <path-to-artist-images.json>')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

const EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

let saved = 0
let skipped = 0

for (const [artistId, images] of Object.entries(data)) {
  if (!Array.isArray(images) || images.length === 0) continue

  const dir = path.join(PUBLIC_DIR, artistId)
  fs.mkdirSync(dir, { recursive: true })

  images.forEach((src, i) => {
    if (!src || typeof src !== 'string') return

    // Skip if it's already a static file path (not a data URL)
    if (!src.startsWith('data:')) {
      console.log(`  skip  ${artistId}/${i + 1} (already a static path: ${src})`)
      skipped++
      return
    }

    const match = src.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      console.warn(`  warn  ${artistId}/${i + 1} — unrecognised data URL format`)
      return
    }

    const mime = match[1]
    const ext = EXT_MAP[mime] || 'jpg'
    const filename = `${i + 1}.${ext}`
    const dest = path.join(dir, filename)

    fs.writeFileSync(dest, Buffer.from(match[2], 'base64'))
    console.log(`  saved ${artistId}/${filename}`)
    saved++
  })
}

console.log(`\nDone — ${saved} image(s) saved, ${skipped} skipped.`)
