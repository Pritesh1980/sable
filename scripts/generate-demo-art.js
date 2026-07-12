#!/usr/bin/env node
// Generates the committable demo artwork under public/images/demo/ — abstract
// dark ink-style SVGs (near-black grounds, off-white strokes, one deep-red
// accent) for the fictional demo artists in src/data/demoSeed.js. Deterministic
// per (artist, index) so re-running the script reproduces the same files.
//
//   node scripts/generate-demo-art.js
//
// Unlike the curated artist reference images (third-party work, gitignored),
// these files are original generated art and are committed to the repo.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'images', 'demo')

const INK = '#0e0d0b'
const INK_SOFT = '#161411'
const CREAM = '#e8e2d6'
const ACCENT = '#c0392b'

// ── deterministic PRNG ────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashCode(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const lerp = (a, b, t) => a + (b - a) * t
const fmt = (n) => Math.round(n * 10) / 10

// ── stroke helpers ────────────────────────────────────────────────────────────

function wavePath(rnd, x0, y0, x1, y1, sway) {
  const mx = lerp(x0, x1, 0.33) + (rnd() - 0.5) * sway
  const my = lerp(y0, y1, 0.33) + (rnd() - 0.5) * sway
  const nx = lerp(x0, x1, 0.66) + (rnd() - 0.5) * sway
  const ny = lerp(y0, y1, 0.66) + (rnd() - 0.5) * sway
  return `M ${fmt(x0)} ${fmt(y0)} C ${fmt(mx)} ${fmt(my)}, ${fmt(nx)} ${fmt(ny)}, ${fmt(x1)} ${fmt(y1)}`
}

function scatterDots(rnd, w, h, count, rMax, fill, opacity) {
  let out = ''
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${fmt(rnd() * w)}" cy="${fmt(rnd() * h)}" r="${fmt(0.6 + rnd() * rMax)}" fill="${fill}" opacity="${fmt(opacity * (0.4 + rnd() * 0.6))}"/>`
  }
  return out
}

// ── motifs (one visual language per fictional artist) ────────────────────────

const MOTIFS = {
  // Botanical fine-line: branching stems with leaf strokes.
  botanical(rnd, w, h) {
    let s = ''
    const stems = 3 + Math.floor(rnd() * 3)
    for (let i = 0; i < stems; i++) {
      const x0 = w * (0.2 + rnd() * 0.6)
      s += `<path d="${wavePath(rnd, x0, h * 0.95, x0 + (rnd() - 0.5) * w * 0.4, h * (0.1 + rnd() * 0.2), w * 0.3)}" stroke="${CREAM}" stroke-width="1.4" fill="none" opacity="0.85"/>`
      for (let j = 0; j < 7; j++) {
        const t = 0.2 + rnd() * 0.7
        const lx = x0 + (rnd() - 0.5) * w * 0.28
        const ly = h * (1 - t)
        const dir = rnd() > 0.5 ? 1 : -1
        s += `<path d="M ${fmt(lx)} ${fmt(ly)} q ${fmt(dir * (12 + rnd() * 26))} ${fmt(-8 - rnd() * 18)} ${fmt(dir * (24 + rnd() * 40))} ${fmt(-4 - rnd() * 10)}" stroke="${CREAM}" stroke-width="1" fill="none" opacity="${fmt(0.35 + rnd() * 0.4)}"/>`
      }
    }
    const bx = w * (0.3 + rnd() * 0.4)
    const by = h * (0.2 + rnd() * 0.3)
    s += `<circle cx="${fmt(bx)}" cy="${fmt(by)}" r="${fmt(5 + rnd() * 7)}" fill="none" stroke="${ACCENT}" stroke-width="1.6" opacity="0.9"/>`
    s += scatterDots(rnd, w, h, 26, 1.4, CREAM, 0.35)
    return s
  },

  // Sacred geometry: concentric circles, polygons, radial spokes.
  geometry(rnd, w, h) {
    const cx = w * (0.35 + rnd() * 0.3)
    const cy = h * (0.35 + rnd() * 0.3)
    const R = Math.min(w, h) * (0.26 + rnd() * 0.12)
    let s = ''
    for (let i = 0; i < 4; i++) {
      s += `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(R * (0.35 + i * 0.24))}" fill="none" stroke="${CREAM}" stroke-width="${i === 0 ? 1.6 : 0.9}" opacity="${fmt(0.75 - i * 0.12)}"/>`
    }
    const sides = 3 + Math.floor(rnd() * 4)
    const rot = rnd() * Math.PI
    let pts = []
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2
      pts.push(`${fmt(cx + Math.cos(a) * R)},${fmt(cy + Math.sin(a) * R)}`)
    }
    s += `<polygon points="${pts.join(' ')}" fill="none" stroke="${CREAM}" stroke-width="1.2" opacity="0.8"/>`
    const spokes = 8 + Math.floor(rnd() * 8)
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + rot
      s += `<line x1="${fmt(cx + Math.cos(a) * R * 1.1)}" y1="${fmt(cy + Math.sin(a) * R * 1.1)}" x2="${fmt(cx + Math.cos(a) * R * (1.3 + rnd() * 0.3))}" y2="${fmt(cy + Math.sin(a) * R * (1.3 + rnd() * 0.3))}" stroke="${CREAM}" stroke-width="0.8" opacity="0.5"/>`
    }
    const aa = rnd() * Math.PI * 2
    s += `<circle cx="${fmt(cx + Math.cos(aa) * R)}" cy="${fmt(cy + Math.sin(aa) * R)}" r="${fmt(4 + rnd() * 5)}" fill="${ACCENT}" opacity="0.9"/>`
    s += scatterDots(rnd, w, h, 30, 1.1, CREAM, 0.3)
    return s
  },

  // Architectural sketch: fractured rectangles + fine hatching.
  architecture(rnd, w, h) {
    let s = ''
    const blocks = 5 + Math.floor(rnd() * 4)
    for (let i = 0; i < blocks; i++) {
      const bw = w * (0.12 + rnd() * 0.3)
      const bh = h * (0.08 + rnd() * 0.28)
      const x = rnd() * (w - bw)
      const y = rnd() * (h - bh)
      const tilt = (rnd() - 0.5) * 14
      s += `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="none" stroke="${CREAM}" stroke-width="${fmt(0.8 + rnd() * 0.8)}" opacity="${fmt(0.4 + rnd() * 0.45)}" transform="rotate(${fmt(tilt)} ${fmt(x + bw / 2)} ${fmt(y + bh / 2)})"/>`
      if (rnd() > 0.5) {
        for (let k = 0; k < 6; k++) {
          const hx = x + (bw / 6) * k
          s += `<line x1="${fmt(hx)}" y1="${fmt(y)}" x2="${fmt(hx + bw * 0.12)}" y2="${fmt(y + bh)}" stroke="${CREAM}" stroke-width="0.5" opacity="0.25" transform="rotate(${fmt(tilt)} ${fmt(x + bw / 2)} ${fmt(y + bh / 2)})"/>`
        }
      }
    }
    s += `<line x1="0" y1="${fmt(h * (0.3 + rnd() * 0.4))}" x2="${w}" y2="${fmt(h * (0.3 + rnd() * 0.4))}" stroke="${ACCENT}" stroke-width="1.4" opacity="0.85"/>`
    return s
  },

  // Cosmic dark-fantasy: moon arcs, wisps and star dots.
  cosmic(rnd, w, h) {
    const cx = w * (0.3 + rnd() * 0.4)
    const cy = h * (0.25 + rnd() * 0.3)
    const R = Math.min(w, h) * (0.18 + rnd() * 0.1)
    let s = `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(R)}" fill="none" stroke="${CREAM}" stroke-width="1.6" opacity="0.9"/>`
    s += `<circle cx="${fmt(cx + R * 0.35)}" cy="${fmt(cy - R * 0.2)}" r="${fmt(R * 0.82)}" fill="${INK}" opacity="0.92"/>`
    for (let i = 0; i < 5; i++) {
      const y0 = h * (0.45 + rnd() * 0.5)
      s += `<path d="${wavePath(rnd, -20, y0, w + 20, y0 + (rnd() - 0.5) * h * 0.2, h * 0.25)}" stroke="${CREAM}" stroke-width="${fmt(0.7 + rnd() * 1.1)}" fill="none" opacity="${fmt(0.2 + rnd() * 0.4)}"/>`
    }
    s += `<circle cx="${fmt(w * (0.15 + rnd() * 0.7))}" cy="${fmt(h * (0.6 + rnd() * 0.3))}" r="${fmt(3 + rnd() * 4)}" fill="${ACCENT}" opacity="0.9"/>`
    s += scatterDots(rnd, w, h, 42, 1.5, CREAM, 0.5)
    return s
  },

  // Soft-shaded figurative abstraction: layered translucent ellipses.
  shaded(rnd, w, h) {
    let s = ''
    const cx = w * (0.35 + rnd() * 0.3)
    const cy = h * (0.32 + rnd() * 0.25)
    for (let i = 0; i < 9; i++) {
      const rx = w * (0.08 + rnd() * 0.22)
      const ry = rx * (0.7 + rnd() * 0.9)
      const rot = (rnd() - 0.5) * 60
      s += `<ellipse cx="${fmt(cx + (rnd() - 0.5) * w * 0.25)}" cy="${fmt(cy + (rnd() - 0.3) * h * 0.4)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${CREAM}" opacity="${fmt(0.05 + rnd() * 0.09)}" transform="rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})"/>`
    }
    for (let i = 0; i < 3; i++) {
      s += `<path d="${wavePath(rnd, cx - w * 0.2, cy - h * 0.15, cx + w * 0.2, cy + h * (0.3 + rnd() * 0.2), w * 0.25)}" stroke="${CREAM}" stroke-width="1.3" fill="none" opacity="${fmt(0.5 + rnd() * 0.3)}"/>`
    }
    s += `<path d="${wavePath(rnd, cx, cy, cx + (rnd() - 0.5) * w * 0.3, cy + h * 0.35, w * 0.2)}" stroke="${ACCENT}" stroke-width="1.6" fill="none" opacity="0.85"/>`
    s += scatterDots(rnd, w, h, 18, 1.2, CREAM, 0.3)
    return s
  },

  // Bold blackwork: thick brush swipes over a slightly lifted ground.
  brush(rnd, w, h) {
    let s = `<rect x="0" y="0" width="${w}" height="${h}" fill="${INK_SOFT}"/>`
    const swipes = 4 + Math.floor(rnd() * 3)
    for (let i = 0; i < swipes; i++) {
      const y0 = h * (0.12 + rnd() * 0.75)
      const wgt = 8 + rnd() * 26
      s += `<path d="${wavePath(rnd, w * (rnd() * 0.15), y0, w * (0.85 + rnd() * 0.15), y0 + (rnd() - 0.5) * h * 0.35, h * 0.3)}" stroke="${CREAM}" stroke-width="${fmt(wgt)}" stroke-linecap="round" fill="none" opacity="${fmt(0.75 + rnd() * 0.2)}"/>`
      // dry-brush texture: a darker echo inside the swipe
      s += `<path d="${wavePath(rnd, w * (rnd() * 0.2), y0 + 3, w * (0.8 + rnd() * 0.2), y0 + (rnd() - 0.5) * h * 0.3, h * 0.3)}" stroke="${INK_SOFT}" stroke-width="${fmt(wgt * 0.3)}" stroke-linecap="round" fill="none" opacity="0.6"/>`
    }
    s += `<circle cx="${fmt(w * (0.15 + rnd() * 0.7))}" cy="${fmt(h * (0.15 + rnd() * 0.7))}" r="${fmt(6 + rnd() * 8)}" fill="${ACCENT}" opacity="0.9"/>`
    return s
  },

  // Delicate contours: flowing parallel curve bundles.
  contour(rnd, w, h) {
    let s = ''
    const bundles = 3 + Math.floor(rnd() * 2)
    for (let b = 0; b < bundles; b++) {
      const x0 = rnd() * w * 0.3
      const y0 = h * (0.1 + rnd() * 0.7)
      const x1 = w * (0.7 + rnd() * 0.3)
      const y1 = h * (0.1 + rnd() * 0.8)
      const base = wavePath(rnd, x0, y0, x1, y1, h * 0.35)
      for (let i = 0; i < 8; i++) {
        s += `<path d="${base}" stroke="${CREAM}" stroke-width="0.9" fill="none" opacity="${fmt(0.65 - i * 0.07)}" transform="translate(0 ${fmt(i * (3 + rnd() * 3))})"/>`
      }
    }
    s += `<path d="${wavePath(rnd, w * 0.2, h * (0.2 + rnd() * 0.5), w * 0.85, h * (0.3 + rnd() * 0.5), h * 0.3)}" stroke="${ACCENT}" stroke-width="1.3" fill="none" opacity="0.85"/>`
    s += scatterDots(rnd, w, h, 14, 1, CREAM, 0.3)
    return s
  },
}

// Aspect ratios cycled per image index so galleries/masonry get variety.
const SIZES = [
  [600, 750],
  [600, 600],
  [600, 800],
  [600, 700],
  [600, 620],
]

export function renderDemoSvg(artistId, motif, index) {
  const [w, h] = SIZES[index % SIZES.length]
  const rnd = mulberry32(hashCode(`${artistId}/${index}`))
  const body = MOTIFS[motif](rnd, w, h)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="${INK}"/>` +
    `<rect x="14" y="14" width="${w - 28}" height="${h - 28}" fill="none" stroke="${CREAM}" stroke-width="0.6" opacity="0.14"/>` +
    body +
    `</svg>`
  )
}

// artistId → motif; keep in sync with DEMO_ARTISTS in src/data/demoSeed.js.
export const DEMO_ART = {
  'mora.blackfern': 'botanical',
  hexen_atlas: 'geometry',
  'quietruin.ink': 'architecture',
  vesper_noctis: 'cosmic',
  'ashgrove.tattoo': 'shaded',
  ferrum_line: 'brush',
  'palefox.ink': 'contour',
}

const IMAGES_PER_ARTIST = 5

function main() {
  for (const [artistId, motif] of Object.entries(DEMO_ART)) {
    const dir = join(OUT, artistId)
    mkdirSync(dir, { recursive: true })
    for (let i = 0; i < IMAGES_PER_ARTIST; i++) {
      writeFileSync(join(dir, `${i + 1}.svg`), renderDemoSvg(artistId, motif, i))
    }
    console.log(`${artistId}: ${IMAGES_PER_ARTIST} images (${motif})`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
