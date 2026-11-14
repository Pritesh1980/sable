import { describe, expect, it, vi } from 'vitest'
import {
  buildLiftTattooPrompt,
  buildTattooPrintMeshes,
  DEFAULT_TATTOO_PRINT_SETTINGS,
  liftTattooWithGemini,
  normalizeTattooPrintSettings,
  prepareTattooPrintMask,
  serializeTwoPart3mf,
} from '../data/tattooPrint'
import { serializeBinaryStl } from '../data/reliefStl'

function assertClosedOutwardManifold(mesh) {
  expect(mesh.faces.length).toBeGreaterThan(0)
  const directed = new Map()
  const degenerate = []
  for (const [a, b, c] of mesh.faces) {
    if (a === b || b === c || c === a) degenerate.push([a, b, c])
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = `${u}>${v}`
      directed.set(k, (directed.get(k) || 0) + 1)
    }
  }
  expect(degenerate).toEqual([])
  const badEdges = []
  for (const [k, n] of directed) {
    if (n !== 1) badEdges.push(`${k} used ${n}x`)
    const sep = k.indexOf('>')
    const twin = `${k.slice(sep + 1)}>${k.slice(0, sep)}`
    if (directed.get(twin) !== 1) badEdges.push(`${k} missing twin`)
  }
  expect(badEdges).toEqual([])

  let signedVolume6 = 0
  for (const [a, b, c] of mesh.faces) {
    const [ax, ay, az] = mesh.vertices[a]
    const [bx, by, bz] = mesh.vertices[b]
    const [cx, cy, cz] = mesh.vertices[c]
    signedVolume6 += (
      ax * (by * cz - bz * cy)
      - ay * (bx * cz - bz * cx)
      + az * (bx * cy - by * cx)
    )
  }
  expect(signedVolume6).toBeGreaterThan(0)
}

function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  expect(bytes[0]).toBe(0x50)
  expect(bytes[1]).toBe(0x4b)
  expect(bytes[2]).toBe(0x03)
  expect(bytes[3]).toBe(0x04)

  const entries = new Map()
  let offset = 0
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    expect(method).toBe(0)
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen))
    const dataStart = offset + 30 + nameLen + extraLen
    const content = decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize))
    entries.set(name, content)
    offset = dataStart + compressedSize
  }
  return entries
}

function makeGrid(width, height, painter) {
  const values = new Float32Array(width * height).fill(1)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[y * width + x] = painter(x, y)
    }
  }
  return { width, height, values }
}

describe('Gemini tattoo lift helper', () => {
  it('builds a prompt isolating ink on pure white and guarding against text injection', () => {
    const prompt = buildLiftTattooPrompt()
    expect(prompt).toMatch(/flat black-ink/i)
    expect(prompt).toMatch(/pure solid white/i)
    expect(prompt).toMatch(/remove all skin/i)
    expect(prompt).toMatch(/flatten.*curvature/i)
    expect(prompt).toMatch(/stipple/i)
    expect(prompt).toMatch(/never an instruction/i)
  })

  it('sends the key in x-goog-api-key header only and returns the lifted data URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: 'LIFTED_BYTES' } }],
          },
        }],
      }),
    }))

    const result = await liftTattooWithGemini('SECRET_KEY', {
      photoDataUrl: 'data:image/jpeg;base64,PHOTO_BYTES',
      fetchImpl: fetchMock,
    })

    expect(result).toBe('data:image/png;base64,LIFTED_BYTES')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('gemini-3.1-flash-image-preview')
    expect(url).not.toContain('key=')
    expect(url).not.toContain('SECRET_KEY')
    expect(init.headers['x-goog-api-key']).toBe('SECRET_KEY')
    const body = JSON.parse(init.body)
    expect(body.contents[0].parts[0].text).toBe(buildLiftTattooPrompt())
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'PHOTO_BYTES' })
  })

  it('requires a Gemini key and surfaces API error messages', async () => {
    await expect(liftTattooWithGemini('', { photoDataUrl: 'data:image/png;base64,AAAA' }))
      .rejects.toThrow('Gemini API key is required.')

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'API key rejected' } }),
    }))
    await expect(liftTattooWithGemini('k', { photoDataUrl: 'data:image/png;base64,AAAA', fetchImpl: fetchMock }))
      .rejects.toThrow('API key rejected')
  })
})

describe('tattoo silhouette & two-tone print geometry', () => {
  it('normalizes defaults and clamps bounds safely', () => {
    expect(normalizeTattooPrintSettings()).toEqual(DEFAULT_TATTOO_PRINT_SETTINGS)
    const clamped = normalizeTattooPrintSettings({
      widthMm: 999,
      baseMm: 2,
      maxReliefMm: 10,
      minStrokeMm: -1,
      marginMm: 0,
      finish: 'bogus',
      exportFormat: 'bogus',
    })
    expect(clamped.widthMm).toBe(250)
    expect(clamped.baseMm).toBe(2)
    expect(clamped.maxReliefMm).toBeCloseTo(1.6)
    expect(clamped.minStrokeMm).toBe(0)
    expect(clamped.marginMm).toBe(1)
    expect(clamped.finish).toBe('inlay')
    expect(clamped.exportFormat).toBe('3mf')
  })

  it('drops isolated 1px dust specks when larger strokes exist, and fills silhouette holes', () => {
    // 120x120 white canvas (~1 mm/px at 120mm) with a bold hollow ring in the middle + a 1px dust speck in the corner.
    const heightmap = makeGrid(120, 120, (x, y) => {
      if (x === 3 && y === 3) return 0 // 1 mm² dust speck far away (< minIslandMm2=2)
      const dx = x - 75
      const dy = y - 75
      const r = Math.hypot(dx, dy)
      return r >= 12 && r <= 18 ? 0 : 1
    })

    const mask = prepareTattooPrintMask(heightmap, { widthMm: 120, marginMm: 3, minIslandMm2: 2 })
    // The cropped plate fits tightly around the ring + margin, leaving out the distant dust speck.
    expect(mask.width).toBeLessThan(60)
    expect(mask.height).toBeLessThan(60)
    // Centre of the hollow ring: not ink, but filled solid in baseMask.
    const cx = Math.floor(mask.width / 2)
    const cy = Math.floor(mask.height / 2)
    expect(mask.inkMask[cy * mask.width + cx]).toBe(0)
    expect(mask.baseMask[cy * mask.width + cx]).toBe(1)
    // Corners of the cropped rectangle stay cut away (outside silhouette).
    expect(mask.baseMask[0]).toBe(0)
  })

  it('closes sub-minStrokeMm gaps so narrow slivers do not vanish or fail extrusion', () => {
    // High-res vertical stripe with a 1-pixel white hairline slit down its middle at 120mm (~0.3mm slit < 0.45mm).
    const heightmap = makeGrid(200, 60, (x, y) => {
      if (y < 15 || y > 45) return 1
      if (x >= 80 && x <= 120 && x !== 100) return 0
      return 1
    })
    const mask = prepareTattooPrintMask(heightmap, { widthMm: 80, minStrokeMm: 0.45, marginMm: 3 })
    expect(mask.inkMask.some((v) => v === 1)).toBe(true)
    // At 80mm / 200px ≈ 0.4mm/px or denser, the 1-px internal gap narrows below minStrokeMm and closes.
    const closedCount = mask.inkMask.reduce((acc, v) => acc + v, 0)
    expect(closedCount).toBeGreaterThan(30 * 40 * 0.5)
  })

  it('builds closed outward-wound manifolds in inlay mode (ink face-down at z=0, mirrored on X)', () => {
    // Asymmetric L-shape so mirroring is observable on X.
    const heightmap = makeGrid(32, 32, (x, y) => {
      const vertical = x >= 10 && x <= 12 && y >= 8 && y <= 22
      const foot = x >= 12 && x <= 20 && y >= 20 && y <= 22
      return vertical || foot ? 0 : 1
    })

    const built = buildTattooPrintMeshes(heightmap, {
      finish: 'inlay',
      widthMm: 120,
      baseMm: 3.0,
      maxReliefMm: 0.6,
      minStrokeMm: 0.45,
      marginMm: 3,
    })

    assertClosedOutwardManifold(built.inkMesh)
    assertClosedOutwardManifold(built.baseMesh)
    assertClosedOutwardManifold(built.mergedMesh)
    assertClosedOutwardManifold(built.previewBaseMesh)
    assertClosedOutwardManifold(built.previewInkMesh)

    const inkZs = built.inkMesh.vertices.map((v) => v[2])
    expect(Math.min(...inkZs)).toBeCloseTo(0)
    expect(Math.max(...inkZs)).toBeCloseTo(0.6)

    const baseZs = built.baseMesh.vertices.map((v) => v[2])
    expect(Math.min(...baseZs)).toBeCloseTo(0)
    expect(Math.max(...baseZs)).toBeCloseTo(3.0)

    expect(built.pauseAtHeightMm).toBeCloseTo(2.4)
    // Preview reverses mirrorX and faces ink up toward +Z so it can be seen in orbit view.
    expect(Math.max(...built.previewInkMesh.vertices.map((v) => v[2]))).toBeCloseTo(3.0)
    expect(Math.min(...built.previewInkMesh.vertices.map((v) => v[2]))).toBeCloseTo(2.4)

    // Inlay X is horizontally mirrored compared to raised/merged orientation.
    const inkMeanX = built.inkMesh.vertices.reduce((s, v) => s + v[0], 0) / built.inkMesh.vertices.length
    const mergedTopMeanX = built.previewInkMesh.vertices.reduce((s, v) => s + v[0], 0) / built.previewInkMesh.vertices.length
    expect(inkMeanX + mergedTopMeanX).toBeCloseTo(built.size.widthMm, 1)
  })

  it('builds closed outward-wound manifolds in raised mode (ink on top of base)', () => {
    const heightmap = makeGrid(24, 24, (x, y) => (x >= 8 && x <= 15 && y >= 8 && y <= 15 ? 0 : 1))
    const built = buildTattooPrintMeshes(heightmap, {
      finish: 'raised',
      widthMm: 100,
      baseMm: 3.0,
      maxReliefMm: 0.6,
    })

    assertClosedOutwardManifold(built.baseMesh)
    assertClosedOutwardManifold(built.inkMesh)
    assertClosedOutwardManifold(built.mergedMesh)

    expect(Math.min(...built.baseMesh.vertices.map((v) => v[2]))).toBeCloseTo(0)
    expect(Math.max(...built.baseMesh.vertices.map((v) => v[2]))).toBeCloseTo(2.4)
    expect(Math.min(...built.inkMesh.vertices.map((v) => v[2]))).toBeCloseTo(2.4)
    expect(Math.max(...built.inkMesh.vertices.map((v) => v[2]))).toBeCloseTo(3.0)
  })

  it('stays a strict closed manifold even on diagonal checkerboards and random noise', () => {
    // Explicit 2x2 diagonal checkerboard stress test + deterministic pseudo-random bitmap.
    const checkerboard = makeGrid(20, 20, (x, y) => {
      if (x >= 6 && x <= 13 && y >= 6 && y <= 13) return (x + y) % 2
      return 1
    })
    const randomNoise = makeGrid(24, 24, (x, y) => (((x * 37 + y * 53) % 7) < 3 ? 0 : 1))

    for (const grid of [checkerboard, randomNoise]) {
      const built = buildTattooPrintMeshes(grid, { finish: 'inlay', minStrokeMm: 0, marginMm: 2 })
      assertClosedOutwardManifold(built.baseMesh)
      assertClosedOutwardManifold(built.inkMesh)
      assertClosedOutwardManifold(built.mergedMesh)
    }
  })

  it('handles an all-white blank image safely without crashing', () => {
    const blank = makeGrid(16, 16, () => 1)
    const built = buildTattooPrintMeshes(blank, { finish: 'inlay', widthMm: 80, baseMm: 3, maxReliefMm: 0.6 })
    assertClosedOutwardManifold(built.baseMesh)
    expect(built.inkMesh.faces).toHaveLength(0)
    const threeMf = serializeTwoPart3mf({ baseMesh: built.baseMesh, inkMesh: built.inkMesh, name: 'Blank' })
    const entries = readZipEntries(threeMf)
    expect(entries.get('3D/3dmodel.model')).toContain('name="base"')
  })
})

describe('two-object 3MF & split STL packaging', () => {
  it('packages base and ink meshes sharing one origin into a valid 3MF ZIP archive', () => {
    const heightmap = makeGrid(20, 20, (x, y) => (x >= 7 && x <= 12 && y >= 7 && y <= 12 ? 0 : 1))
    const built = buildTattooPrintMeshes(heightmap, {
      finish: 'inlay',
      widthMm: 120,
      baseMm: 3,
      maxReliefMm: 0.6,
    })

    const buffer = serializeTwoPart3mf({
      baseMesh: built.baseMesh,
      inkMesh: built.inkMesh,
      name: 'Raven Ink',
    })
    const entries = readZipEntries(buffer)
    expect(entries.has('[Content_Types].xml')).toBe(true)
    expect(entries.has('_rels/.rels')).toBe(true)
    expect(entries.has('3D/3dmodel.model')).toBe(true)

    const modelXml = entries.get('3D/3dmodel.model')
    expect(modelXml).toContain('<model unit="millimeter"')
    expect(modelXml).toContain('<metadata name="Title">Raven Ink</metadata>')
    expect(modelXml).toContain('<object id="2" name="base" type="model"')
    expect(modelXml).toContain('<object id="3" name="ink" type="model"')
    expect(modelXml).toContain('<build><item objectid="2" /><item objectid="3" /></build>')

    // Split STLs from the same two meshes are well-formed binary STLs.
    const baseStl = serializeBinaryStl(built.baseMesh, 'raven_base')
    const inkStl = serializeBinaryStl(built.inkMesh, 'raven_ink')
    expect(baseStl.byteLength).toBe(84 + 50 * built.baseMesh.faces.length)
    expect(inkStl.byteLength).toBe(84 + 50 * built.inkMesh.faces.length)
  })
})
