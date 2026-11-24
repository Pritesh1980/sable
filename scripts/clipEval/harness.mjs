// Shared harness for the offline CLIP evals (scripts/textSearchEval for #186,
// scripts/curationEval for #187). Runs the phone's runtime (transformers.js web
// + onnxruntime-web WASM) in headless Chromium against the local library
// (public/images/artists, gitignored, one folder per artist).
//
// Model files are fetched once from fixed URLs into <outDir>/hf-cache before
// the browser starts. The local server only ever serves that cache, the repo
// and the photos folder; it never fetches on a request's behalf.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repo = path.resolve(here, '../..')
const require = createRequire(path.join(repo, 'package.json'))

const MODEL = 'Xenova/clip-vit-base-patch32'
const MODEL_FILES = [
  'config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/vision_model_quantized.onnx', 'onnx/text_model_quantized.onnx',
]
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

export const defaultPhotosDir = () => path.join(repo, 'public/images/artists')

// Every photo in the library as a served URL, /photos/<artist folder>/<file>.
export function listPhotos(imgDir) {
  const images = []
  for (const artist of fs.readdirSync(imgDir)) {
    const d = path.join(imgDir, artist)
    if (!fs.statSync(d).isDirectory()) continue
    for (const f of fs.readdirSync(d)) if (/\.(jpe?g|png|webp)$/i.test(f)) images.push(`/photos/${artist}/${f}`)
  }
  return images
}

async function ensureModel(hfCache) {
  const downloaded = {}
  for (const name of MODEL_FILES) {
    const file = path.join(hfCache, MODEL, 'resolve/main', name)
    if (!fs.existsSync(file)) {
      const r = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${name}`)
      if (!r.ok) throw new Error(`model file ${name}: HTTP ${r.status}`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()))
    }
    downloaded[name] = fs.statSync(file).size
  }
  return downloaded
}

// A request path inside one root folder, or null for anything that escapes it.
function within(root, rel) {
  const base = path.resolve(root)
  const file = path.resolve(base, rel.replace(/^\/+/, ''))
  return file.startsWith(base + path.sep) ? file : null
}

function serve(mounts) {
  const server = http.createServer((req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url, 'http://local').pathname)
      const [prefix, root] = mounts.find(([p]) => url.startsWith(p))
      const file = within(root, url.slice(prefix.length))
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404)
        return res.end()
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    } catch {
      res.writeHead(500)
      res.end()
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

// Opens page.html with the model ready to load. Image vectors are cached in
// <outDir>/image-vectors.json across runs (and across both evals, when they
// share an outDir). Call close() when done.
export async function openClipPage({ out, imgDir }) {
  fs.mkdirSync(out, { recursive: true })
  const hfCache = path.join(out, 'hf-cache')
  const downloaded = await ensureModel(hfCache)
  const server = await serve([['/hf/', hfCache], ['/repo/', repo], ['/photos/', imgDir], ['/', here]])
  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (m) => console.log('[page]', m.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/page.html`)
  const vecPath = path.join(out, 'image-vectors.json')
  const cachedVectors = fs.existsSync(vecPath) ? JSON.parse(fs.readFileSync(vecPath, 'utf8')) : {}
  return {
    page,
    downloaded,
    cachedVectors,
    saveVectors: (vectors) => fs.writeFileSync(vecPath, JSON.stringify(vectors)),
    close: async () => {
      await browser.close()
      server.close()
    },
  }
}
