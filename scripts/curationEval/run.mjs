// Offline eval for the curation assistant (#187), on the local library in
// headless Chromium with the phone's runtime (scripts/clipEval/harness.mjs).
//
// 1. Tag suggestions: score every photo against the text prompts for each style
//    tag (prompts.json), roll the scores up per artist, and measure how well
//    that recovers the curated tags on DEFAULT_ARTISTS (read, never written):
//    ROC AUC, a permutation p-value, and leave-one-out precision/recall at a
//    threshold learnt from the other artists.
// 2. Off-style flags: each photo's similarity to its artist's centroid of the
//    *other* photos. The lowest go on a contact sheet to check by eye.
//
// Usage: node scripts/curationEval/run.mjs <outDir> [photosDir]
// Share an outDir with scripts/textSearchEval to reuse its image vectors.
// Writes <outDir>/curation.json and <outDir>/offstyle.html (the contact sheet,
// local only: the photos are third-party work, never commit or post it).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openClipPage, listPhotos, defaultPhotosDir, repo } from '../clipEval/harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(process.argv[2] || 'text-search-eval')
const imgDir = path.resolve(process.argv[3] || defaultPhotosDir())
const PROMPTS = JSON.parse(fs.readFileSync(path.join(here, 'prompts.json'), 'utf8'))
const TAGS = Object.keys(PROMPTS.tags)
const { DEFAULT_ARTISTS } = await import(pathToFileURL(path.join(repo, 'src/data/artists.js')))

// ---- embed ---------------------------------------------------------------
const strings = [...new Set([...Object.values(PROMPTS.tags).flat(), ...PROMPTS.stray])]
const clip = await openClipPage({ out, imgDir })
const { vectors } = await clip.page.evaluate(({ images, cached }) => window.embedImages(images, cached), {
  images: listPhotos(imgDir),
  cached: clip.cachedVectors,
})
clip.saveVectors(vectors)
const text = await clip.page.evaluate((s) => window.embedTexts(s), strings)
await clip.close()
const textVec = Object.fromEntries(strings.map((s, i) => [s, text.vectors[i]]))

// ---- maths ---------------------------------------------------------------
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
const unit = (v) => {
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}
const mean = (vs) => unit(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0)))
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

// Mann-Whitney AUC: the chance a random tagged artist outscores an untagged one.
function auc(scores, labels) {
  let pairs = 0
  let wins = 0
  scores.forEach((s, i) => {
    if (!labels[i]) return
    scores.forEach((t, j) => {
      if (labels[j]) return
      pairs++
      wins += s > t ? 1 : s === t ? 0.5 : 0
    })
  })
  return pairs ? wins / pairs : NaN
}

// Seeded shuffle so the p-values don't move between runs.
function rng(seed) {
  let x = seed
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
}
function permutationP(scores, labels, observed, rounds = 5000) {
  const rand = rng(187)
  const l = [...labels]
  let atLeast = 0
  for (let r = 0; r < rounds; r++) {
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[l[i], l[j]] = [l[j], l[i]]
    }
    if (auc(scores, l) >= observed) atLeast++
  }
  return (atLeast + 1) / (rounds + 1)
}

// The F1-best threshold on a training set (ties go to the higher threshold).
function bestThreshold(scores, labels) {
  const sorted = [...new Set(scores)].sort((a, b) => a - b)
  let best = { f1: -1, thr: Infinity }
  for (let k = 0; k < sorted.length; k++) {
    const thr = k ? (sorted[k - 1] + sorted[k]) / 2 : sorted[0] - 1e-9
    let tp = 0, fp = 0, fn = 0
    scores.forEach((s, i) => {
      if (s >= thr && labels[i]) tp++
      else if (s >= thr) fp++
      else if (labels[i]) fn++
    })
    const f1 = tp ? (2 * tp) / (2 * tp + fp + fn) : 0
    if (f1 >= best.f1) best = { f1, thr }
  }
  return best.thr
}

// Each artist predicted from a threshold learnt on the others.
function leaveOneOut(scores, labels) {
  let tp = 0, fp = 0, fn = 0
  const suggested = []
  scores.forEach((s, i) => {
    const rest = (xs) => xs.filter((_, j) => j !== i)
    const yes = s >= bestThreshold(rest(scores), rest(labels))
    if (yes && labels[i]) tp++
    else if (yes) {
      fp++
      suggested.push(i)
    } else if (labels[i]) fn++
  })
  return { precision: tp + fp ? tp / (tp + fp) : NaN, recall: tp / (tp + fn), tp, fp, fn, suggested }
}

// ---- tag suggestions ------------------------------------------------------
const photoUrl = (img) => (typeof img === 'string' ? `/${img.replace(/^images\/artists\//, 'photos/')}` : null)
const artists = DEFAULT_ARTISTS.map((a) => ({
  handle: a.handle,
  tags: new Set(a.tags),
  photos: a.images.map(photoUrl).filter((u) => u && vectors[u]),
})).filter((a) => a.photos.length)

const STRATEGIES = {
  single: (tag) => textVec[PROMPTS.tags[tag][0]],
  ensemble: (tag) => mean(PROMPTS.tags[tag].map((p) => textVec[p])),
}
// How an artist's photos become one score per tag.
const MODES = {
  meanCos: (photos, tv) => Object.fromEntries(TAGS.map((t) => [t, avg(photos.map((u) => dot(vectors[u], tv[t])))])),
  centroid: (photos, tv) => {
    const c = mean(photos.map((u) => vectors[u]))
    return Object.fromEntries(TAGS.map((t) => [t, dot(c, tv[t])]))
  },
  softmax: (photos, tv) => {
    const sum = Object.fromEntries(TAGS.map((t) => [t, 0]))
    for (const u of photos) {
      const e = TAGS.map((t) => Math.exp(100 * dot(vectors[u], tv[t])))
      const z = e.reduce((a, b) => a + b, 0)
      TAGS.forEach((t, k) => (sum[t] += e[k] / z / photos.length))
    }
    return sum
  },
}

const tagResults = []
for (const [strategy, vecFor] of Object.entries(STRATEGIES)) {
  const tv = Object.fromEntries(TAGS.map((t) => [t, vecFor(t)]))
  for (const [mode, score] of Object.entries(MODES)) {
    const perArtist = artists.map((a) => score(a.photos, tv))
    for (const tag of TAGS) {
      const scores = perArtist.map((s) => s[tag])
      const labels = artists.map((a) => a.tags.has(tag))
      const a = auc(scores, labels)
      const loo = leaveOneOut(scores, labels)
      tagResults.push({
        strategy, mode, tag,
        positives: labels.filter(Boolean).length,
        auc: a,
        p: permutationP(scores, labels, a),
        ...loo,
        suggested: loo.suggested.map((i) => artists[i].handle),
      })
    }
  }
}

// Learnt from the owner's own tags instead of text prompts: each artist is
// scored only from the *other* artists' tags, so the AUC is out-of-sample.
const centroids = artists.map((a) => mean(a.photos.map((u) => vectors[u])))
// Similarity-weighted share of the K visually nearest artists carrying the tag.
const knn = (k) => (i, tag) => {
  const near = artists
    .map((_, j) => ({ j, s: dot(centroids[i], centroids[j]) }))
    .filter(({ j }) => j !== i)
    .sort((x, y) => y.s - x.s)
    .slice(0, k)
  return near.reduce((n, { j, s }) => n + (artists[j].tags.has(tag) ? s : 0), 0) / near.reduce((n, { s }) => n + s, 0)
}
const LEARNT = {
  knn3: knn(3),
  knn5: knn(5),
  knn7: knn(7),
  // Direction from untagged to tagged artists' photos (a centroid classifier).
  prototype: (i, tag) => {
    const others = artists.filter((_, j) => j !== i)
    const yes = others.filter((a) => a.tags.has(tag)).flatMap((a) => a.photos.map((u) => vectors[u]))
    const no = others.filter((a) => !a.tags.has(tag)).flatMap((a) => a.photos.map((u) => vectors[u]))
    const away = mean(no)
    const dir = mean(yes).map((x, k) => x - away[k])
    return dot(centroids[i], dir)
  },
}
for (const [mode, score] of Object.entries(LEARNT)) {
  for (const tag of TAGS) {
    const scores = artists.map((_, i) => score(i, tag))
    const labels = artists.map((a) => a.tags.has(tag))
    const a = auc(scores, labels)
    const loo = leaveOneOut(scores, labels)
    tagResults.push({ strategy: 'learnt', mode, tag, positives: labels.filter(Boolean).length, auc: a, p: permutationP(scores, labels, a), ...loo, suggested: loo.suggested.map((k) => artists[k].handle) })
  }
}

// ---- off-style flags ------------------------------------------------------
const offStyle = []
for (const a of artists) {
  if (a.photos.length < 4) continue
  for (const u of a.photos) {
    const others = mean(a.photos.filter((x) => x !== u).map((x) => vectors[x]))
    offStyle.push({ handle: a.handle, u, sim: dot(vectors[u], others) })
  }
}
const sims = offStyle.map((o) => o.sim)
const mu = avg(sims)
const sd = Math.sqrt(avg(sims.map((s) => (s - mu) ** 2)))
for (const a of artists) {
  const own = offStyle.filter((o) => o.handle === a.handle)
  if (!own.length) continue
  const m = avg(own.map((o) => o.sim))
  const s = Math.sqrt(avg(own.map((o) => (o.sim - m) ** 2))) || 1
  for (const o of own) o.zWithin = (o.sim - m) / s
}
for (const o of offStyle) {
  o.zLibrary = (o.sim - mu) / sd
  o.stray = Object.fromEntries(PROMPTS.stray.map((p) => [p, dot(vectors[o.u], textVec[p])]))
}
offStyle.sort((x, y) => x.sim - y.sim)
const pct = (q) => [...sims].sort((x, y) => x - y)[Math.floor(q * (sims.length - 1))]

fs.writeFileSync(
  path.join(out, 'curation.json'),
  JSON.stringify({ artists: artists.length, photos: artists.reduce((n, a) => n + a.photos.length, 0), tagResults, offStyle, simStats: { mu, sd, p05: pct(0.05), p10: pct(0.1), median: pct(0.5) } }, null, 1),
)
const sheet = offStyle.slice(0, 40).map((o) => {
  const strayTop = Object.entries(o.stray).sort((x, y) => y[1] - x[1])[0]
  return `<figure><img src="${pathToFileURL(path.join(imgDir, o.u.replace(/^\/photos\//, '')))}"><figcaption>${o.handle}<br>sim ${o.sim.toFixed(3)} · z ${o.zWithin.toFixed(1)}<br>${strayTop[0].replace(/^an? /, '')} ${strayTop[1].toFixed(3)}</figcaption></figure>`
})
fs.writeFileSync(
  path.join(out, 'offstyle.html'),
  `<!doctype html><meta charset="utf-8"><style>body{background:#111;color:#ddd;font:11px sans-serif;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin:6px}figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:cover}</style>${sheet.join('')}`,
)

// ---- summary ---------------------------------------------------------------
const f = (x, d = 2) => (Number.isNaN(x) ? '–' : x.toFixed(d))
console.log(`${artists.length} artists, ${offStyle.length} photos in off-style check\n`)
console.log('strategy  mode      tag                pos  AUC   p      LOO-P  LOO-R  fp')
for (const r of tagResults) {
  console.log(`${r.strategy.padEnd(9)} ${r.mode.padEnd(9)} ${r.tag.padEnd(18)} ${String(r.positives).padStart(3)}  ${f(r.auc)}  ${f(r.p, 3)}  ${f(r.precision)}   ${f(r.recall)}   ${r.fp}`)
}
console.log(`\nphoto→own-centroid similarity: mean ${f(mu, 3)} sd ${f(sd, 3)} p05 ${f(pct(0.05), 3)} p10 ${f(pct(0.1), 3)}`)
console.log('lowest 15:')
for (const o of offStyle.slice(0, 15)) console.log(`  ${o.sim.toFixed(3)} z${f(o.zWithin, 1).padStart(5)} ${o.handle} ${o.u.split('/').pop()}`)
