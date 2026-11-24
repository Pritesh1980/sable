// Offline eval for search by words (#186): runs the phrases in phrases.json
// against the local library (public/images/artists, gitignored) in headless
// Chromium, with the phone's runtime (transformers.js web + onnxruntime-web
// WASM). Re-check TEXT_MIN_SCORE in src/data/textSearch.js with it: nonsense
// controls (the last three phrases) should score under the cut-off, and real
// subjects over it. Model files are fetched once and kept in <outDir>/hf-cache.
//
// Usage: node scripts/textSearchEval/run.mjs <outDir> [photosDir]
// photosDir defaults to public/images/artists (one folder per artist). From a
// worktree, point it at the main checkout's copy.
// Writes <outDir>/raw.json (top matches and scores per phrase and template).
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const out = path.resolve(process.argv[2] || 'text-search-eval')
fs.mkdirSync(out, { recursive: true })
const require = createRequire(path.join(repo, 'package.json'))
const { chromium } = require('playwright')
const hfCache = path.join(out, 'hf-cache')
const imgDir = path.resolve(process.argv[3] || path.join(repo, 'public/images/artists'))
const images = []
for (const artist of fs.readdirSync(imgDir)) {
  const d = path.join(imgDir, artist)
  if (!fs.statSync(d).isDirectory()) continue
  for (const f of fs.readdirSync(d)) if (/\.(jpe?g|png|webp)$/i.test(f)) images.push(`/photos/${artist}/${f}`)
}
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const downloaded = {}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  try {
    if (url.startsWith('/hf/')) {
      // caching proxy to huggingface.co so reruns don't re-download
      const rel = url.slice(4)
      const file = path.join(hfCache, rel)
      if (!fs.existsSync(file)) {
        const r = await fetch(`https://huggingface.co/${rel}`)
        if (!r.ok) { res.writeHead(r.status); return res.end() }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
      }
      downloaded[rel] = fs.statSync(file).size
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
      return fs.createReadStream(file).pipe(res)
    }
    const file = url.startsWith('/repo/') ? path.join(repo, url.slice(6))
      : url.startsWith('/photos/') ? path.join(imgDir, url.slice(8))
      : path.join(here, url)
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  } catch (e) { res.writeHead(500); res.end(String(e)) }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => console.log('[page]', m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(`${base}/page.html`)
const vecPath = path.join(out, 'image-vectors.json')
const cached = fs.existsSync(vecPath) ? JSON.parse(fs.readFileSync(vecPath, 'utf8')) : {}
const PHRASES = JSON.parse(fs.readFileSync(path.join(here, 'phrases.json'), 'utf8'))
const result = await page.evaluate(({ images, cached, PHRASES }) => window.spike(images, cached, PHRASES), { images, cached, PHRASES })
fs.writeFileSync(vecPath, JSON.stringify(result.vectors))
delete result.vectors
result.downloaded = downloaded
fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(result))
console.log(JSON.stringify({ timing: result.timing, downloaded }, null, 1))
await browser.close()
server.close()
