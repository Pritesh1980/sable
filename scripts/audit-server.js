#!/usr/bin/env node
// Companion server for public/audit.html.
// Receives a POST /apply with a JSON array of image paths to remove,
// deletes the files, renumbers the remaining ones, and updates artists.js.
//
// Usage: node scripts/audit-server.js

import fs from 'fs'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const ARTISTS_JS = path.join(ROOT, 'src', 'data', 'artists.js')
const PORT = 5175

function renumberFolder(folder) {
  const files = fs.readdirSync(folder)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))

  const newPaths = []
  files.forEach((file, i) => {
    const ext = path.extname(file)
    const newName = `${i + 1}${ext}`
    if (file !== newName) {
      fs.renameSync(path.join(folder, file), path.join(folder, newName))
    }
    const rel = '/' + path.relative(PUBLIC_DIR, path.join(folder, newName)).replace(/\\/g, '/')
    newPaths.push(rel)
  })
  return newPaths
}

function updateArtistsJs(artistId, newPaths) {
  let src = fs.readFileSync(ARTISTS_JS, 'utf8')
  const re = new RegExp(`(\\{[^}]*id:\\s*'${artistId.replace(/\./g, '\\.')}[^}]*images:\\s*)\\[[^\\]]*\\]`, 's')
  if (re.test(src)) {
    src = src.replace(re, `$1${JSON.stringify(newPaths)}`)
    fs.writeFileSync(ARTISTS_JS, src)
    return true
  }
  return false
}

function scanArtists() {
  return fs.readdirSync(path.join(PUBLIC_DIR, 'images', 'artists'))
    .sort()
    .map(id => {
      const dir = path.join(PUBLIC_DIR, 'images', 'artists', id)
      const files = fs.readdirSync(dir)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .sort((a, b) => parseInt(a) - parseInt(b))
      return { id, images: files.map(f => `/images/artists/${id}/${f}`) }
    })
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'GET' && req.url === '/artists') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(scanArtists()))
    return
  }

  if (req.method === 'POST' && req.url === '/apply') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const paths = JSON.parse(body)
        if (!Array.isArray(paths) || paths.length === 0) {
          res.writeHead(400); res.end('Expected non-empty array'); return
        }

        const byFolder = {}
        for (const p of paths) {
          const abs = path.join(PUBLIC_DIR, p)
          const folder = path.dirname(abs)
          if (!byFolder[folder]) byFolder[folder] = []
          byFolder[folder].push(abs)
        }

        const results = []
        for (const [folder, files] of Object.entries(byFolder)) {
          let deleted = 0
          for (const f of files) {
            if (fs.existsSync(f)) { fs.unlinkSync(f); deleted++ }
          }
          const newPaths = renumberFolder(folder)
          const artistId = path.basename(folder)
          const updated = updateArtistsJs(artistId, newPaths)
          results.push({ artistId, deleted, remaining: newPaths.length, updated })
          console.log(`  ${artistId}: deleted ${deleted}, ${newPaths.length} remaining, artists.js ${updated ? 'updated' : 'NOT FOUND'}`)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, results }))
      } catch (e) {
        console.error('Error:', e)
        res.writeHead(500); res.end(e.message)
      }
    })
    return
  }

  res.writeHead(404); res.end()
})

server.listen(PORT, () => {
  console.log(`Audit server listening on http://localhost:${PORT}`)
  console.log('Keep this running while you use the audit tool.')
})
