import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindConfig from '../../tailwind.config.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

const V2_COLORS = {
  'v2-ink': '#131110',
  'v2-surface': '#1d1a17',
  'v2-cream': '#efe9dc',
  'v2-muted': '#a8a294',
  'v2-accent': '#c0392b',
  'v2-hairline': '#35312b',
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA))
  const lB = relativeLuminance(hexToRgb(hexB))
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA]
  return (lighter + 0.05) / (darker + 0.05)
}

// Every file that currently exists under src/pages and src/components — skipped by
// the colour-usage guard below because they predate the v2 tokens. Any NEW file in
// these directories is NOT in this list and is automatically protected.
const LEGACY_ALLOWLIST = [
  'src/components/AddArtistForm.jsx',
  'src/components/ArtistBrowse.jsx',
  'src/components/ArtistCard.jsx',
  'src/components/ArtistDetail.jsx',
  'src/components/ArtistImage.jsx',
  'src/components/ArtistTable.jsx',
  'src/components/BackupPanel.jsx',
  'src/components/BoardsSection.jsx',
  'src/components/CompareView.jsx',
  'src/components/ConceptVariantLab.jsx',
  'src/components/FilmstripView.jsx',
  'src/components/HowItWorksStrip.jsx',
  'src/components/Logo.jsx',
  'src/components/Nav.jsx',
  'src/components/PromptPackComposer.jsx',
  'src/components/ProtectedRoute.jsx',
  'src/components/QuickAddArtist.jsx',
  'src/components/RankingMode.jsx',
  'src/components/ReliefStlDrawer.jsx',
  'src/components/SortableArtistCard.jsx',
  'src/components/StyleWall.jsx',
  'src/components/TagPill.jsx',
  'src/components/Top5Coverflow.jsx',
  'src/components/Top5Hero.jsx',
  'src/pages/Brief.jsx',
  'src/pages/Concepts.jsx',
  'src/pages/Conventions.jsx',
  'src/pages/Dashboard.jsx',
  'src/pages/Gallery.jsx',
  'src/pages/Help.jsx',
  'src/pages/Login.jsx',
  'src/pages/Settings.jsx',
  'src/pages/Studios.jsx',
]

const BANNED_SUBSTRINGS = [
  'cream-muted/30',
  'cream-muted/40',
  'text-cream-muted/3',
  'text-cream-muted/4',
]

function listFilesRecursive(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full))
    else out.push(full)
  }
  return out
}

describe('v2 design tokens', () => {
  const { colors, fontFamily } = tailwindConfig.theme.extend

  it('exposes all six v2 colours with exactly those hex values', () => {
    for (const [name, hex] of Object.entries(V2_COLORS)) {
      expect(colors[name], `expected colors.${name} to be defined`).toBe(hex)
    }
  })

  it('exposes the v2 display and ui font families', () => {
    // Namespaced as v2-display / v2-ui (not display / ui) because the legacy
    // `display` fontFamily key (Playfair Display) is still used by existing pages.
    expect(fontFamily['v2-display']).toEqual(['Marcellus', 'serif'])
    expect(fontFamily['v2-ui']).toEqual(['Archivo', 'sans-serif'])
  })

  it('v2-muted on v2-ink meets WCAG AA contrast (>= 4.5)', () => {
    expect(contrastRatio(V2_COLORS['v2-muted'], V2_COLORS['v2-ink'])).toBeGreaterThanOrEqual(4.5)
  })

  it('does not use low-opacity cream-muted utilities outside the legacy allowlist', () => {
    const allowlistAbs = new Set(LEGACY_ALLOWLIST.map((p) => join(root, p)))
    const dirs = ['src/pages', 'src/components'].map((d) => join(root, d))

    const offenders = []
    for (const dir of dirs) {
      for (const file of listFilesRecursive(dir)) {
        if (allowlistAbs.has(file)) continue
        const contents = readFileSync(file, 'utf8')
        for (const banned of BANNED_SUBSTRINGS) {
          if (contents.includes(banned)) offenders.push(`${file}: ${banned}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
