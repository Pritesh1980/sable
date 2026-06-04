# Relief STL Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-side relief STL export from saved AI concept result images.

**Architecture:** Keep printable geometry generation in a pure `src/data/reliefStl.js` module and keep browser image/canvas/download work in a focused drawer component. Integrate the drawer through `ConceptVariantLab` with an optional callback so result-variant behavior stays localized.

**Tech Stack:** React 19, Vite, Tailwind CSS, Vitest, Testing Library, browser Canvas API, Blob download.

---

## Worktree Setup

Implementation must happen in a git worktree, not the main checkout.

Run from `/Users/pritesh/code/tattoo-app`:

```bash
git worktree add ../tattoo-app-relief-stl -b codex/relief-stl-export
cd ../tattoo-app-relief-stl
```

Expected:

- New worktree at `/Users/pritesh/code/tattoo-app-relief-stl`.
- New branch `codex/relief-stl-export`.
- Existing unstaged changes in the main checkout are not touched.

## File Structure

- Create `src/data/reliefStl.js`
  - Pure heightmap normalization, mesh generation, smoothing, STL serialization.
- Create `src/test/reliefStl.test.js`
  - Unit coverage for height mapping, invert, side walls, settings normalization, STL output.
- Create `src/components/ReliefStlDrawer.jsx`
  - Drawer/modal UI, image loading, canvas grayscale extraction, download Blob creation.
- Create `src/test/ReliefStlDrawer.test.jsx`
  - UI behavior for defaults, validation, image-load errors, and download invocation.
- Modify `src/components/ConceptVariantLab.jsx`
  - Add **Make STL** action for image-bearing expanded variants.
- Modify `src/test/ConceptVariantLab.test.jsx`
  - Cover button visibility and callback payload.
- Modify `src/pages/Concepts.jsx`
  - Own drawer state and pass `onMakeStl` into `ConceptVariantLab`.
- Modify `src/test/ConceptsVariants.test.jsx`
  - Cover opening the drawer from a saved result variant.
- Modify `docs/06-concepts.md`
  - Add short user guidance for relief STL export.
- Modify `src/pages/Help.jsx`
  - Add matching in-app Help text.

---

### Task 1: Pure Relief STL Module

**Files:**
- Create: `src/data/reliefStl.js`
- Create: `src/test/reliefStl.test.js`

- [ ] **Step 1: Write failing tests for settings and mesh generation**

Create `src/test/reliefStl.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RELIEF_SETTINGS,
  buildReliefMesh,
  buildReliefStl,
  normalizeReliefSettings,
  triangleNormal,
} from '../data/reliefStl'

const twoByTwo = {
  width: 2,
  height: 2,
  values: [
    0, 0.5,
    0.75, 1,
  ],
}

describe('reliefStl', () => {
  it('normalizes invalid settings to printable defaults and clamps extremes', () => {
    expect(normalizeReliefSettings({
      widthMm: -10,
      maxReliefMm: 99,
      baseMm: 0,
      detail: 'huge',
      smoothing: 'unknown',
      invert: true,
    })).toEqual({
      ...DEFAULT_RELIEF_SETTINGS,
      widthMm: 20,
      maxReliefMm: 10,
      baseMm: 0.4,
      invert: true,
    })
  })

  it('maps brighter pixels to higher top-surface z values', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
    })

    const topZ = mesh.vertices.slice(0, 4).map((vertex) => vertex[2])

    expect(topZ).toEqual([1, 3, 4, 5])
  })

  it('inverts brightness-to-height mapping when requested', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: true,
    })

    const topZ = mesh.vertices.slice(0, 4).map((vertex) => vertex[2])

    expect(topZ).toEqual([5, 3, 2, 1])
  })

  it('creates a closed relief mesh with top, bottom, and side-wall faces', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
    })

    expect(mesh.vertices).toHaveLength(8)
    expect(mesh.faces).toHaveLength(12)
    expect(mesh.size.widthMm).toBe(20)
    expect(mesh.size.depthMm).toBe(20)
    expect(mesh.size.heightMm).toBe(5)
  })

  it('serializes an ASCII STL with finite normals and facets', () => {
    const stl = buildReliefStl(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
      solidName: 'raven relief',
    })

    expect(stl.startsWith('solid raven_relief')).toBe(true)
    expect(stl).toContain('facet normal')
    expect(stl).toContain('vertex 0.000000 20.000000 1.000000')
    expect(stl.trim().endsWith('endsolid raven_relief')).toBe(true)
    expect(stl).not.toContain('NaN')
    expect(stl).not.toContain('Infinity')
  })

  it('computes a stable normal for a non-degenerate triangle', () => {
    expect(triangleNormal(
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0]
    )).toEqual([0, 0, 1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/test/reliefStl.test.js
```

Expected: FAIL because `src/data/reliefStl.js` does not exist.

- [ ] **Step 3: Implement the pure relief module**

Create `src/data/reliefStl.js`:

```js
export const DEFAULT_RELIEF_SETTINGS = {
  widthMm: 80,
  maxReliefMm: 3,
  baseMm: 1.2,
  detail: 'medium',
  smoothing: 'light',
  invert: false,
}

export const DETAIL_PRESETS = {
  low: 48,
  medium: 96,
  high: 160,
}

const SMOOTHING_PRESETS = new Set(['off', 'light'])

function clamp(value, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, numeric))
}

function cleanSolidName(value) {
  const cleaned = String(value || 'tattoo relief')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned || 'tattoo_relief'
}

export function normalizeReliefSettings(settings = {}) {
  const detail = Object.hasOwn(DETAIL_PRESETS, settings.detail)
    ? settings.detail
    : DEFAULT_RELIEF_SETTINGS.detail
  const smoothing = SMOOTHING_PRESETS.has(settings.smoothing)
    ? settings.smoothing
    : DEFAULT_RELIEF_SETTINGS.smoothing

  return {
    widthMm: clamp(settings.widthMm, 20, 200),
    maxReliefMm: clamp(settings.maxReliefMm, 0.5, 10),
    baseMm: clamp(settings.baseMm, 0.4, 6),
    detail,
    smoothing,
    invert: Boolean(settings.invert),
  }
}

function assertHeightmap(heightmap) {
  if (!heightmap || typeof heightmap !== 'object') {
    throw new Error('Heightmap is required.')
  }
  if (!Number.isInteger(heightmap.width) || !Number.isInteger(heightmap.height)) {
    throw new Error('Heightmap width and height must be integers.')
  }
  if (heightmap.width < 2 || heightmap.height < 2) {
    throw new Error('Heightmap must be at least 2 by 2 pixels.')
  }
  if (!Array.isArray(heightmap.values) && !(heightmap.values instanceof Float32Array)) {
    throw new Error('Heightmap values must be an array.')
  }
  if (heightmap.values.length !== heightmap.width * heightmap.height) {
    throw new Error('Heightmap values must match width times height.')
  }
}

function valueAt(heightmap, x, y) {
  return clamp(heightmap.values[y * heightmap.width + x], 0, 1)
}

function smoothValue(heightmap, x, y) {
  let total = 0
  let count = 0

  for (let yy = Math.max(0, y - 1); yy <= Math.min(heightmap.height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(heightmap.width - 1, x + 1); xx += 1) {
      total += valueAt(heightmap, xx, yy)
      count += 1
    }
  }

  return total / count
}

function sampledHeightmap(heightmap, detail) {
  const maxSide = DETAIL_PRESETS[detail]
  const longest = Math.max(heightmap.width, heightmap.height)
  if (longest <= maxSide) return heightmap

  const scale = maxSide / longest
  const width = Math.max(2, Math.round(heightmap.width * scale))
  const height = Math.max(2, Math.round(heightmap.height * scale))
  const values = []

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(heightmap.height - 1, Math.round((y / (height - 1)) * (heightmap.height - 1)))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(heightmap.width - 1, Math.round((x / (width - 1)) * (heightmap.width - 1)))
      values.push(valueAt(heightmap, sourceX, sourceY))
    }
  }

  return { width, height, values }
}

function addFace(faces, a, b, c) {
  faces.push([a, b, c])
}

function addWall(faces, topA, topB, bottomA, bottomB) {
  addFace(faces, topA, bottomA, topB)
  addFace(faces, topB, bottomA, bottomB)
}

export function buildReliefMesh(heightmap, rawSettings = {}) {
  assertHeightmap(heightmap)
  const settings = normalizeReliefSettings(rawSettings)
  const source = sampledHeightmap(heightmap, settings.detail)
  const width = source.width
  const height = source.height
  const widthMm = settings.widthMm
  const stepMm = widthMm / (width - 1)
  const depthMm = stepMm * (height - 1)
  const vertices = []
  const faces = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const raw = settings.smoothing === 'light'
        ? smoothValue(source, x, y)
        : valueAt(source, x, y)
      const mapped = settings.invert ? 1 - raw : raw
      vertices.push([
        x * stepMm,
        (height - 1 - y) * stepMm,
        settings.baseMm + mapped * settings.maxReliefMm,
      ])
    }
  }

  const bottomOffset = vertices.length
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      vertices.push([
        x * stepMm,
        (height - 1 - y) * stepMm,
        0,
      ])
    }
  }

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = y * width + x
      const b = a + 1
      const c = a + width
      const d = c + 1
      addFace(faces, a, c, b)
      addFace(faces, b, c, d)

      const ba = bottomOffset + a
      const bb = bottomOffset + b
      const bc = bottomOffset + c
      const bd = bottomOffset + d
      addFace(faces, ba, bb, bc)
      addFace(faces, bb, bd, bc)
    }
  }

  for (let x = 0; x < width - 1; x += 1) {
    addWall(faces, x, x + 1, bottomOffset + x, bottomOffset + x + 1)

    const topA = (height - 1) * width + x
    const topB = topA + 1
    addWall(faces, topB, topA, bottomOffset + topB, bottomOffset + topA)
  }

  for (let y = 0; y < height - 1; y += 1) {
    const leftA = y * width
    const leftB = (y + 1) * width
    addWall(faces, leftB, leftA, bottomOffset + leftB, bottomOffset + leftA)

    const rightA = y * width + (width - 1)
    const rightB = (y + 1) * width + (width - 1)
    addWall(faces, rightA, rightB, bottomOffset + rightA, bottomOffset + rightB)
  }

  return {
    vertices,
    faces,
    size: {
      widthMm,
      depthMm,
      heightMm: settings.baseMm + settings.maxReliefMm,
    },
  }
}

export function triangleNormal(a, b, c) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz)

  if (!length) return [0, 0, 0]

  return [nx / length, ny / length, nz / length]
}

function formatNumber(value) {
  return Number(value).toFixed(6)
}

export function serializeAsciiStl(mesh, solidName = 'tattoo relief') {
  const name = cleanSolidName(solidName)
  const lines = [`solid ${name}`]

  mesh.faces.forEach(([ia, ib, ic]) => {
    const a = mesh.vertices[ia]
    const b = mesh.vertices[ib]
    const c = mesh.vertices[ic]
    const normal = triangleNormal(a, b, c)
    lines.push(`  facet normal ${normal.map(formatNumber).join(' ')}`)
    lines.push('    outer loop')
    lines.push(`      vertex ${a.map(formatNumber).join(' ')}`)
    lines.push(`      vertex ${b.map(formatNumber).join(' ')}`)
    lines.push(`      vertex ${c.map(formatNumber).join(' ')}`)
    lines.push('    endloop')
    lines.push('  endfacet')
  })

  lines.push(`endsolid ${name}`)
  return `${lines.join('\n')}\n`
}

export function buildReliefStl(heightmap, settings = {}) {
  const mesh = buildReliefMesh(heightmap, settings)
  return serializeAsciiStl(mesh, settings.solidName)
}
```

- [ ] **Step 4: Run tests to verify the module passes**

Run:

```bash
npx vitest run src/test/reliefStl.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/reliefStl.js src/test/reliefStl.test.js
git commit -m "feat(ai): add relief stl geometry"
```

---

### Task 2: Relief STL Drawer Component

**Files:**
- Create: `src/components/ReliefStlDrawer.jsx`
- Create: `src/test/ReliefStlDrawer.test.jsx`

- [ ] **Step 1: Write failing drawer tests**

Create `src/test/ReliefStlDrawer.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReliefStlDrawer from '../components/ReliefStlDrawer'

const source = {
  imageUrl: 'data:image/png;base64,abc',
  label: 'Raven pass',
  filenameSeed: 'Raven chest tattoo',
}

function installCanvasMock() {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
        128, 128, 128, 255,
        64, 64, 64, 255,
      ]),
    })),
  }))
}

describe('ReliefStlDrawer', () => {
  beforeEach(() => {
    installCanvasMock()
    global.URL.createObjectURL = vi.fn(() => 'blob:relief')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('renders default print settings for the selected image', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'Make Relief STL' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Raven pass STL source' })).toBeTruthy()
    expect(screen.getByLabelText('Width in millimetres')).toHaveValue(80)
    expect(screen.getByLabelText('Maximum relief height in millimetres')).toHaveValue(3)
    expect(screen.getByLabelText('Base thickness in millimetres')).toHaveValue(1.2)
    expect(screen.getByLabelText('Detail preset')).toHaveValue('medium')
    expect(screen.getByLabelText('Smoothing preset')).toHaveValue('light')
  })

  it('disables download when numeric settings are outside supported ranges', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Width in millimetres'), {
      target: { value: '5' },
    })

    expect(screen.getByRole('button', { name: 'Download STL' })).toBeDisabled()
    expect(screen.getByText('Width must be between 20mm and 200mm.')).toBeTruthy()
  })

  it('loads image pixels and starts an STL download', async () => {
    const appendChild = vi.spyOn(document.body, 'appendChild')
    const removeChild = vi.spyOn(document.body, 'removeChild')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    const image = screen.getByRole('img', { name: 'Raven pass STL source' })
    Object.defineProperty(image, 'naturalWidth', { value: 2, configurable: true })
    Object.defineProperty(image, 'naturalHeight', { value: 2, configurable: true })
    fireEvent.load(image)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download STL' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Download STL' }))

    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(click).toHaveBeenCalled()
    })

    expect(appendChild).toHaveBeenCalled()
    expect(removeChild).toHaveBeenCalled()

    click.mockRestore()
  })

  it('shows an error when the image fails to load', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.error(screen.getByRole('img', { name: 'Raven pass STL source' }))

    expect(screen.getByText('Could not load this image for STL export.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/test/ReliefStlDrawer.test.jsx
```

Expected: FAIL because `ReliefStlDrawer` does not exist.

- [ ] **Step 3: Implement the drawer component**

Create `src/components/ReliefStlDrawer.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { DEFAULT_RELIEF_SETTINGS, buildReliefStl } from '../data/reliefStl'

const FIELD_LIMITS = {
  widthMm: { min: 20, max: 200, message: 'Width must be between 20mm and 200mm.' },
  maxReliefMm: { min: 0.5, max: 10, message: 'Maximum relief must be between 0.5mm and 10mm.' },
  baseMm: { min: 0.4, max: 6, message: 'Base thickness must be between 0.4mm and 6mm.' },
}

function fieldClass() {
  return 'w-full rounded-sm border border-ink-border bg-ink-muted px-3 py-2 text-sm text-cream outline-none transition-colors focus:border-cream-muted/50'
}

function FieldLabel({ children }) {
  return (
    <span className="mb-1 block font-mono text-[0.625rem] uppercase tracking-widest text-cream-muted/60">
      {children}
    </span>
  )
}

function filenameFromSeed(seed) {
  const slug = String(seed || 'tattoo-relief')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return `tattoo-relief-${slug || 'concept'}.stl`
}

function numericValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function validate(settings) {
  const errors = []

  Object.entries(FIELD_LIMITS).forEach(([field, limits]) => {
    const value = numericValue(settings[field])
    if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
      errors.push(limits.message)
    }
  })

  return errors
}

function imageToHeightmap(image, detail) {
  const maxSide = { low: 48, medium: 96, high: 160 }[detail] || 96
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Image dimensions are not available.')
  }

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(2, Math.round(sourceWidth * scale))
  const height = Math.max(2, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available in this browser.')

  context.drawImage(image, 0, 0, width, height)

  let pixels
  try {
    pixels = context.getImageData(0, 0, width, height).data
  } catch {
    throw new Error('This image cannot be read by the browser. Use an uploaded image or data URL.')
  }

  const values = []
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255
    values.push(brightness)
  }

  return { width, height, values }
}

export default function ReliefStlDrawer({ source, onClose }) {
  const [settings, setSettings] = useState(DEFAULT_RELIEF_SETTINGS)
  const [imageElement, setImageElement] = useState(null)
  const [imageError, setImageError] = useState('')
  const [exportError, setExportError] = useState('')

  const errors = useMemo(() => validate(settings), [settings])
  const canDownload = Boolean(source?.imageUrl && imageElement && !imageError && errors.length === 0)

  if (!source) return null

  function update(field, value) {
    setSettings((current) => ({ ...current, [field]: value }))
    setExportError('')
  }

  function download() {
    if (!canDownload) return

    try {
      const heightmap = imageToHeightmap(imageElement, settings.detail)
      const stl = buildReliefStl(heightmap, {
        ...settings,
        widthMm: numericValue(settings.widthMm),
        maxReliefMm: numericValue(settings.maxReliefMm),
        baseMm: numericValue(settings.baseMm),
        solidName: source.filenameSeed || source.label,
      })
      const blob = new Blob([stl], { type: 'model/stl' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filenameFromSeed(source.filenameSeed || source.label)
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error.message || 'Could not create STL.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-black/80 px-4 py-6 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Make Relief STL"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border border-ink-border bg-ink-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-border px-5 py-4">
          <div>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.3em] text-accent">
              3D print export
            </p>
            <h2 className="font-display text-2xl text-cream">Make Relief STL</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-ink-border px-3 py-2 text-xs text-cream-muted transition-colors hover:border-cream-muted/50 hover:text-cream"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <FieldLabel>Source</FieldLabel>
            <img
              src={source.imageUrl}
              alt={`${source.label || 'Selected image'} STL source`}
              className="aspect-square w-full rounded-sm border border-ink-border object-cover"
              crossOrigin={source.imageUrl?.startsWith('http') ? 'anonymous' : undefined}
              onLoad={(event) => {
                setImageElement(event.currentTarget)
                setImageError('')
              }}
              onError={() => {
                setImageElement(null)
                setImageError('Could not load this image for STL export.')
              }}
            />
            <p className="mt-2 text-xs leading-relaxed text-cream-muted/60">
              Bright areas become higher relief. STL units are interpreted as millimetres by most slicers.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <FieldLabel>Width</FieldLabel>
                <input
                  aria-label="Width in millimetres"
                  type="number"
                  min="20"
                  max="200"
                  step="1"
                  className={fieldClass()}
                  value={settings.widthMm}
                  onChange={(event) => update('widthMm', event.target.value)}
                />
              </label>
              <label>
                <FieldLabel>Max relief</FieldLabel>
                <input
                  aria-label="Maximum relief height in millimetres"
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.1"
                  className={fieldClass()}
                  value={settings.maxReliefMm}
                  onChange={(event) => update('maxReliefMm', event.target.value)}
                />
              </label>
              <label>
                <FieldLabel>Base</FieldLabel>
                <input
                  aria-label="Base thickness in millimetres"
                  type="number"
                  min="0.4"
                  max="6"
                  step="0.1"
                  className={fieldClass()}
                  value={settings.baseMm}
                  onChange={(event) => update('baseMm', event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel>Detail</FieldLabel>
                <select
                  aria-label="Detail preset"
                  className={fieldClass()}
                  value={settings.detail}
                  onChange={(event) => update('detail', event.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                <FieldLabel>Smoothing</FieldLabel>
                <select
                  aria-label="Smoothing preset"
                  className={fieldClass()}
                  value={settings.smoothing}
                  onChange={(event) => update('smoothing', event.target.value)}
                >
                  <option value="off">Off</option>
                  <option value="light">Light</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-3 rounded-sm border border-ink-border bg-ink-muted/30 px-3 py-2 text-sm text-cream-muted">
              <input
                aria-label="Invert relief height"
                type="checkbox"
                checked={settings.invert}
                onChange={(event) => update('invert', event.target.checked)}
              />
              Invert height mapping
            </label>

            {(imageError || exportError || errors.length > 0) && (
              <div className="rounded-sm border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-accent">
                {[imageError, exportError, ...errors].filter(Boolean).map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={!canDownload}
              onClick={download}
              className="w-full rounded-sm bg-accent px-4 py-3 text-sm text-cream transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-30"
            >
              Download STL
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run drawer tests**

Run:

```bash
npx vitest run src/test/ReliefStlDrawer.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReliefStlDrawer.jsx src/test/ReliefStlDrawer.test.jsx
git commit -m "feat(ai): add relief stl drawer"
```

---

### Task 3: Add Make STL Action To Result Variants

**Files:**
- Modify: `src/components/ConceptVariantLab.jsx`
- Modify: `src/test/ConceptVariantLab.test.jsx`

- [ ] **Step 1: Add failing component tests**

Append these tests inside the existing `describe('ConceptVariantLab', () => { ... })` block in `src/test/ConceptVariantLab.test.jsx`:

```jsx
  it('shows Make STL for expanded variants with images and calls onMakeStl', () => {
    const onMakeStl = vi.fn()
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-image',
            provider: 'chatgpt',
            title: 'Relief candidate',
            imageUrl: 'data:image/png;base64,relief',
            response: '',
            notes: '',
            rating: 4,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
        ],
      },
      onMakeStl,
    })

    fireEvent.click(screen.getByRole('button', {
      name: 'Expand Relief candidate result for Raven chest tattoo',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Make STL from Relief candidate result for Raven chest tattoo',
    }))

    expect(onMakeStl).toHaveBeenCalledWith({
      conceptId: 'concept-1',
      conceptLabel: 'Raven chest tattoo',
      variantId: 'variant-image',
      variantLabel: 'Relief candidate',
      imageUrl: 'data:image/png;base64,relief',
    })
  })

  it('does not show Make STL for variants without images', () => {
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-text',
            provider: 'claude',
            title: 'Text only',
            imageUrl: '',
            response: 'Use this as language.',
            notes: '',
            rating: 3,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', {
      name: 'Expand Text only result for Raven chest tattoo',
    }))

    expect(screen.queryByRole('button', {
      name: 'Make STL from Text only result for Raven chest tattoo',
    })).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/test/ConceptVariantLab.test.jsx
```

Expected: FAIL because `onMakeStl` is not wired and the button does not exist.

- [ ] **Step 3: Modify `ConceptVariantLab.jsx`**

Change `VariantDetails` props to include `onMakeStl`:

```jsx
function VariantDetails({
  conceptId,
  label,
  variant,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
  onMakeStl,
}) {
```

Inside the existing action button group in `VariantDetails`, before the Best/Delete buttons, add:

```jsx
            {imageUrl && onMakeStl && (
              <button
                type="button"
                aria-label={`Make STL from ${title} result for ${label}`}
                onClick={() => onMakeStl({
                  conceptId,
                  conceptLabel: label,
                  variantId: variant.id,
                  variantLabel: title,
                  imageUrl,
                })}
                className="rounded-sm border border-cream-muted/25 px-3 py-2 text-xs text-cream-muted transition-colors hover:border-cream-muted/60 hover:text-cream"
              >
                Make STL
              </button>
            )}
```

Pass `onMakeStl` through `VariantCard`:

```jsx
function VariantCard({
  conceptId,
  label,
  variant,
  isExpanded,
  onToggle,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
  onMakeStl,
}) {
```

And into `VariantDetails`:

```jsx
          <VariantDetails
            conceptId={conceptId}
            label={label}
            variant={variant}
            onMarkBest={onMarkBest}
            onDeleteVariant={onDeleteVariant}
            onRateVariant={onRateVariant}
            onMakeStl={onMakeStl}
          />
```

Add the optional prop at the exported component boundary:

```jsx
export default function ConceptVariantLab({
  concept,
  onAddVariant,
  onMarkBest,
  onDeleteVariant,
  onRateVariant,
  onMakeStl,
}) {
```

Pass it into each `VariantCard`:

```jsx
              onRateVariant={onRateVariant}
              onMakeStl={onMakeStl}
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npx vitest run src/test/ConceptVariantLab.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConceptVariantLab.jsx src/test/ConceptVariantLab.test.jsx
git commit -m "feat(ai): expose relief stl action"
```

---

### Task 4: Wire Drawer Into Concepts Page

**Files:**
- Modify: `src/pages/Concepts.jsx`
- Modify: `src/test/ConceptsVariants.test.jsx`

- [ ] **Step 1: Add failing integration test**

Add a test to `src/test/ConceptsVariants.test.jsx` that renders a concept with an image-bearing variant and opens the drawer:

```jsx
  it('opens the relief STL drawer from an image result variant', () => {
    const concepts = [
      {
        id: 'concept-1',
        prompt: 'Raven chest tattoo',
        imageUrl: '',
        response: '',
        tags: [],
        createdAt: '2026-05-31T08:00:00.000Z',
        variants: [
          {
            id: 'variant-image',
            provider: 'chatgpt',
            title: 'Relief candidate',
            imageUrl: 'data:image/png;base64,relief',
            response: '',
            notes: '',
            rating: 4,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
        ],
      },
    ]

    render(
      <Concepts
        concepts={concepts}
        setConcepts={() => {}}
        artists={[]}
        ideas={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Expand Relief candidate result for Raven chest tattoo',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Make STL from Relief candidate result for Raven chest tattoo',
    }))

    expect(screen.getByRole('dialog', { name: 'Make Relief STL' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Relief candidate STL source' })).toBeTruthy()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/test/ConceptsVariants.test.jsx
```

Expected: FAIL because `Concepts` does not import or render `ReliefStlDrawer`.

- [ ] **Step 3: Modify `Concepts.jsx`**

Add import:

```jsx
import ReliefStlDrawer from '../components/ReliefStlDrawer'
```

Add state near other `useState` calls:

```jsx
  const [stlSource, setStlSource] = useState(null)
```

Add callback near the variant handlers:

```jsx
  function makeStlFromVariant(input) {
    setStlSource({
      imageUrl: input.imageUrl,
      label: input.variantLabel,
      filenameSeed: `${input.conceptLabel} ${input.variantLabel}`,
    })
  }
```

Pass it into `ConceptVariantLab`:

```jsx
                  onRateVariant={rateVariant}
                  onMakeStl={makeStlFromVariant}
```

Render the drawer as the last child inside the page root `<div>`:

```jsx
      <ReliefStlDrawer
        source={stlSource}
        onClose={() => setStlSource(null)}
      />
```

- [ ] **Step 4: Run Concepts tests**

Run:

```bash
npx vitest run src/test/ConceptsVariants.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Concepts.jsx src/test/ConceptsVariants.test.jsx
git commit -m "feat(ai): wire relief stl drawer"
```

---

### Task 5: Documentation And Help

**Files:**
- Modify: `docs/06-concepts.md`
- Modify: `src/pages/Help.jsx`

- [ ] **Step 1: Update Markdown guide**

In `docs/06-concepts.md`, add this section near the result variants guidance:

```md
## Export a relief STL

When a saved AI result has an image, open the result and choose **Make STL**. Tattoo turns
the image into a relief-style heightmap where brighter areas become raised surface detail.

Start with the defaults:

- Width: `80mm`
- Max relief: `3mm`
- Base: `1.2mm`
- Detail: `medium`
- Smoothing: `light`

Use **Invert** when the wrong parts of the image are raised. Download the STL and open it
in your slicer before printing. This first version creates relief plaques only; lithophane,
line-art extrusion, and live 3D preview are later enhancements.
```

- [ ] **Step 2: Update in-app Help**

In the `concepts` section of `src/pages/Help.jsx`, add this step after the result variants step:

```js
      'For result variants with images, open the result and use Make STL to export a printable relief-style heightmap file.',
```

- [ ] **Step 3: Run docs-related checks**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/06-concepts.md src/pages/Help.jsx
git commit -m "docs(ai): document relief stl export"
```

---

### Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run src/test/reliefStl.test.js src/test/ReliefStlDrawer.test.jsx src/test/ConceptVariantLab.test.jsx src/test/ConceptsVariants.test.jsx
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Browser verification**

Run:

```bash
npm run dev
```

Open the Vite URL. In the browser:

1. Go to **AI**.
2. Add or use a saved concept with an image result variant.
3. Expand the result variant.
4. Click **Make STL**.
5. Confirm the drawer opens.
6. Confirm defaults are `80`, `3`, `1.2`, `medium`, `light`.
7. Click **Download STL** after the image has loaded.
8. Confirm the browser downloads a non-empty `.stl` file.
9. Change width to `5`.
10. Confirm **Download STL** disables and the width validation message appears.

Expected: the feature works without console errors.

- [ ] **Step 6: Final commit if verification required fixes**

If verification required any follow-up edits:

```bash
git add src docs
git commit -m "fix(ai): harden relief stl export"
```

If no follow-up edits were required, do not create an empty commit.
