// The rule Manage ships (#187), measured on the local library: imports
// src/data/curation.js itself, so it checks the code, not a copy of it.
// Each artist's own tags are hidden and its suggestions compared with them;
// every other artist keeps its tags, as in real use. No threshold is fitted.
//
// Usage, after run.mjs has written <outDir>/image-vectors.json:
//   npx vite-node scripts/curationEval/shipped.mjs <outDir>
// (vite-node, because the app's modules use extensionless imports.)
import fs from 'node:fs'
import path from 'node:path'
import { suggestTags, offStyleImages, SUGGESTIBLE_TAGS } from '../../src/data/curation.js'
import { DEFAULT_ARTISTS } from '../../src/data/artists.js'

const out = path.resolve(process.argv[2] || 'text-search-eval')
const vectors = JSON.parse(fs.readFileSync(path.join(out, 'image-vectors.json'), 'utf8'))
const getVec = (img) => (typeof img === 'string' ? vectors[`/${img.replace(/^images\/artists\//, 'photos/')}`] : null) || null

for (const tag of SUGGESTIBLE_TAGS) {
  let tp = 0
  let fp = 0
  let fn = 0
  for (const artist of DEFAULT_ARTISTS) {
    const hidden = { ...artist, tags: [] }
    const library = DEFAULT_ARTISTS.map((a) => (a.id === artist.id ? hidden : a))
    const suggested = suggestTags(hidden, library, getVec).some((s) => s.tag === tag)
    const truth = artist.tags.includes(tag)
    if (suggested && truth) tp++
    else if (suggested) fp++
    else if (truth) fn++
  }
  const precision = tp + fp ? (tp / (tp + fp)).toFixed(2) : '–'
  const recall = tp + fn ? (tp / (tp + fn)).toFixed(2) : '–'
  console.log(`${tag.padEnd(10)} precision ${precision} recall ${recall} (tp ${tp}, fp ${fp}, fn ${fn})`)
}

// What Manage would show today, with every tag in place.
let suggestions = 0
let flags = 0
for (const artist of DEFAULT_ARTISTS) {
  suggestions += suggestTags(artist, DEFAULT_ARTISTS, getVec).length
  flags += offStyleImages(artist, getVec).length
}
console.log(`today: ${suggestions} tag suggestions, ${flags} photos to check`)
