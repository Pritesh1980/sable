#!/usr/bin/env node
// Starts a tiny HTTP server that receives IndexedDB data posted from the browser,
// saves the images to public/images/artists/, and updates src/data/artists.js.
// Designed to be used with the idbExportPlugin in vite.config.js.
//
// Usage: node scripts/export-server.js

import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public', 'images', 'artists')
const ARTISTS_JS = path.join(ROOT, 'src', 'data', 'artists.js')
const PORT = 5174

const EXT_MAP = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/gif': 'gif',
}

function saveImages(artistId, images) {
  const dir = path.join(PUBLIC_DIR, artistId)
  fs.mkdirSync(dir, { recursive: true })
  const paths = []
  images.forEach((src, i) => {
    if (!src || typeof src !== 'string') return
    if (!src.startsWith('data:')) { paths.push(src); return }
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
    const re = new RegExp(`(\\{[^}]*id:\\s*'${artistId}'[^}]*images:\\s*)\\[[^\\]]*\\]`, 's')
    if (re.test(src)) {
      src = src.replace(re, `$1${JSON.stringify(paths)}`)
    } else {
      console.warn(`  warn   could not find artist '${artistId}' in artists.js`)
    }
  }
  fs.writeFileSync(ARTISTS_JS, src)
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method !== 'POST' || req.url !== '/export-idb') {
    res.writeHead(404); res.end(); return
  }

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    try {
      const data = JSON.parse(body)
      const imagePathMap = {}
      let total = 0
      for (const [artistId, images] of Object.entries(data)) {
        if (!Array.isArray(images) || images.length === 0) continue
        console.log(`\n${artistId} (${images.length} image(s))`)
        const paths = saveImages(artistId, images)
        if (paths.length) { imagePathMap[artistId] = paths; total += paths.length }
      }
      if (total > 0) {
        console.log(`\nUpdating src/data/artists.js …`)
        updateArtistsJs(imagePathMap)
        console.log(`\nDone — ${total} image(s) saved.`)
      } else {
        console.log('\nNo base64 images to save.')
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, saved: total }))
    } catch (e) {
      console.error('Error:', e)
      res.writeHead(500); res.end(e.message)
    } finally {
      server.close()
    }
  })
})

server.listen(PORT, () => {
  console.log(`Export server listening on http://localhost:${PORT}`)
  console.log('Reload the app in your browser to trigger the export…')
})
