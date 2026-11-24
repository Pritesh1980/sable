// Offline eval for search by words (#186): runs the phrases in phrases.json
// against the local library in headless Chromium, with the phone's runtime
// (see scripts/clipEval/harness.mjs). Re-check TEXT_MIN_SCORE in
// src/data/textSearch.js with it: nonsense controls (the last three phrases)
// should score under the cut-off, and real subjects over it.
//
// Usage: node scripts/textSearchEval/run.mjs <outDir> [photosDir]
// photosDir defaults to public/images/artists (one folder per artist). From a
// worktree, point it at the main checkout's copy.
// Writes <outDir>/raw.json (top matches and scores per phrase and template).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openClipPage, listPhotos, defaultPhotosDir } from '../clipEval/harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(process.argv[2] || 'text-search-eval')
const imgDir = path.resolve(process.argv[3] || defaultPhotosDir())
const images = listPhotos(imgDir)
const PHRASES = JSON.parse(fs.readFileSync(path.join(here, 'phrases.json'), 'utf8'))

const clip = await openClipPage({ out, imgDir })
const result = await clip.page.evaluate(
  ({ images, cached, PHRASES }) => window.spike(images, cached, PHRASES),
  { images, cached: clip.cachedVectors, PHRASES },
)
clip.saveVectors(result.vectors)
delete result.vectors
result.downloaded = clip.downloaded
fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(result))
console.log(JSON.stringify({ timing: result.timing, downloaded: clip.downloaded }, null, 1))
await clip.close()
