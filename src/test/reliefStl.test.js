import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RELIEF_SETTINGS,
  buildReliefMesh,
  buildReliefStl,
  normalizeReliefSettings,
  serializeAsciiStl,
  serializeBinaryStl,
  triangleNormal,
} from '../data/reliefStl'

const twoByTwo = { width: 2, height: 2, values: [0, 0.5, 0.75, 1] }

const flatOff = { widthMm: 20, maxReliefMm: 4, baseMm: 1, detail: 'high', smoothing: 'off', invert: false }

// Watertight + consistently wound: every directed edge appears exactly once,
// and its reverse exactly once (the neighbouring face).
function assertClosedManifold(mesh) {
  const directed = new Map()
  for (const [a, b, c] of mesh.faces) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = `${u}>${v}`
      directed.set(k, (directed.get(k) || 0) + 1)
    }
  }
  for (const [k, n] of directed) {
    expect(n, `edge ${k} used ${n}x`).toBe(1)
    const [u, v] = k.split('>')
    expect(directed.get(`${v}>${u}`), `edge ${k} has no twin`).toBe(1)
  }
}

// Perimeter edge count of a w x h grid.
const perimeterEdges = (w, h) => 2 * (w - 1) + 2 * (h - 1)

describe('relief STL geometry', () => {
  it('clamps invalid relief settings', () => {
    const result = normalizeReliefSettings({
      widthMm: -10,
      maxReliefMm: 99,
      baseMm: 0,
      detail: 'huge',
      smoothing: 'unknown',
      invert: true,
    })

    expect(result).toEqual({
      ...DEFAULT_RELIEF_SETTINGS,
      widthMm: 20,
      maxReliefMm: 10,
      baseMm: 0.4,
      invert: true,
    })
  })

  it('maps brighter pixels to taller top vertices', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
    })

    expect(mesh.vertices.slice(0, 4).map((vertex) => vertex[2])).toEqual([1, 3, 4, 5])
  })

  it('inverts brightness before mapping top vertices', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: true,
    })

    expect(mesh.vertices.slice(0, 4).map((vertex) => vertex[2])).toEqual([5, 3, 2, 1])
  })

  it('builds a closed 2x2 relief mesh', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
    })

    // 4 top + 4 bottom-perimeter + 1 bottom centre; 2 top + 4 bottom-fan + 8 wall faces.
    expect(mesh.vertices).toHaveLength(9)
    expect(mesh.faces).toHaveLength(14)
    assertClosedManifold(mesh)
    expect(mesh.size.widthMm).toBe(20)
    expect(mesh.size.depthMm).toBe(20)
    expect(mesh.size.heightMm).toBe(5)
  })

  it('orders faces as top surface, bottom surface, then side walls', () => {
    const mesh = buildReliefMesh({
      width: 3,
      height: 2,
      values: [0, 0.25, 0.5, 0.5, 0.75, 1],
    }, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
    })

    const bottomFaces = perimeterEdges(3, 2)
    expect(mesh.faces.slice(0, 4).flat().every((index) => index < 6)).toBe(true)
    expect(mesh.faces.slice(4, 4 + bottomFaces).flat().every((index) => index >= 6)).toBe(true)
    expect(mesh.faces.slice(4 + bottomFaces).every((face) => (
      face.some((index) => index < 6) && face.some((index) => index >= 6)
    ))).toBe(true)
  })

  it('winds boundary side walls with outward-facing normals', () => {
    const mesh = buildReliefMesh(twoByTwo, {
      widthMm: 20,
      maxReliefMm: 4,
      baseMm: 1,
      detail: 'high',
      smoothing: 'off',
      invert: false,
    })

    const normals = mesh.faces.slice(2 + perimeterEdges(2, 2)).map((face) => triangleNormal(
      mesh.vertices[face[0]],
      mesh.vertices[face[1]],
      mesh.vertices[face[2]],
    ))

    expect(normals.slice(0, 2).every((normal) => normal[1] > 0)).toBe(true)
    expect(normals.slice(2, 4).every((normal) => normal[1] < 0)).toBe(true)
    expect(normals.slice(4, 6).every((normal) => normal[0] < 0)).toBe(true)
    expect(normals.slice(6, 8).every((normal) => normal[0] > 0)).toBe(true)
  })

  it('downsamples high-resolution heightmaps according to the detail preset', () => {
    const values = Array.from({ length: 100 * 50 }, (_, index) => (index % 255) / 255)
    const mesh = buildReliefMesh({
      width: 100,
      height: 50,
      values,
    }, {
      widthMm: 80,
      maxReliefMm: 3,
      baseMm: 1.2,
      detail: 'low',
      smoothing: 'off',
      invert: false,
    })

    expect(mesh.vertices).toHaveLength(48 * 24 + perimeterEdges(48, 24) + 1)
  })

  it('applies light smoothing before converting brightness to height', () => {
    const mesh = buildReliefMesh({
      width: 3,
      height: 3,
      values: [
        0, 0, 0,
        0, 1, 0,
        0, 0, 0,
      ],
    }, {
      widthMm: 20,
      maxReliefMm: 8,
      baseMm: 1,
      detail: 'high',
      smoothing: 'light',
      invert: false,
    })

    expect(mesh.vertices[4][2]).toBeCloseTo(1 + (8 / 3))
  })

  it('rejects invalid heightmaps before mesh generation', () => {
    expect(() => buildReliefMesh({
      width: 1,
      height: 2,
      values: [0, 1],
    })).toThrow('Relief heightmap must be at least 2x2 pixels.')

    expect(() => buildReliefMesh({
      width: 2,
      height: 2,
      values: [0, 1],
    })).toThrow('Relief heightmap values length must match width * height.')
  })

  it('serializes a finite ASCII STL', () => {
    const stl = serializeAsciiStl(buildReliefMesh(twoByTwo, flatOff), 'raven relief')

    expect(stl.startsWith('solid raven_relief')).toBe(true)
    expect(stl).toContain('facet normal')
    expect(stl).toContain('vertex 0.000000 20.000000 1.000000')
    expect(stl.trim().endsWith('endsolid raven_relief')).toBe(true)
    expect(stl).not.toMatch(/NaN|Infinity/)
  })

  it('keeps the bottom flat, facing down, with only perimeter-many triangles', () => {
    const mesh = buildReliefMesh({ width: 5, height: 4, values: Array(20).fill(0.5) }, flatOff)
    const bottom = mesh.faces.slice(2 * 4 * 3, 2 * 4 * 3 + perimeterEdges(5, 4))
    for (const [a, b, c] of bottom) {
      for (const i of [a, b, c]) expect(mesh.vertices[i][2]).toBe(0)
      expect(triangleNormal(mesh.vertices[a], mesh.vertices[b], mesh.vertices[c])[2]).toBeLessThan(0)
    }
  })

  it('is a closed, consistently wound solid at every size', () => {
    for (const [w, h] of [[2, 2], [3, 2], [2, 5], [7, 4], [30, 17]]) {
      const values = Array.from({ length: w * h }, (_, i) => ((i * 37) % 101) / 100)
      assertClosedManifold(buildReliefMesh({ width: w, height: h, values }, flatOff))
    }
  })

  it('serializes a binary STL: 80-byte header, count, 50 bytes per triangle', () => {
    const mesh = buildReliefMesh(twoByTwo, flatOff)
    const buffer = serializeBinaryStl(mesh, 'raven relief')
    const view = new DataView(buffer)
    expect(buffer.byteLength).toBe(84 + 50 * mesh.faces.length)
    // A binary file whose header begins "solid" gets misread as ASCII by some slicers.
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 80))
    expect(header.startsWith('solid')).toBe(false)
    expect(header).toContain('raven_relief')
    expect(view.getUint32(80, true)).toBe(mesh.faces.length)

    const [a, b, c] = mesh.faces[0]
    const normal = triangleNormal(mesh.vertices[a], mesh.vertices[b], mesh.vertices[c])
    const at = (i) => view.getFloat32(84 + i * 4, true)
    expect([at(0), at(1), at(2)].map((n) => +n.toFixed(5))).toEqual(normal.map((n) => +n.toFixed(5)))
    expect([at(3), at(4), at(5)]).toEqual(mesh.vertices[a].map(Math.fround))
    expect(view.getUint16(84 + 48, true)).toBe(0)
  })

  it('buildReliefStl returns the binary file, about 10x smaller than the old ASCII one at high detail', () => {
    const w = 160
    const h = 160
    const values = Array.from({ length: w * h }, (_, i) => (i % 97) / 96)
    const stl = buildReliefStl({ width: w, height: h, values }, { detail: 'high' })
    expect(stl).toBeInstanceOf(ArrayBuffer)
    // Old: two full grids ≈ 2·(2·159²) triangles ≈ 101k ⇒ ~25MB of ASCII.
    expect(stl.byteLength).toBeLessThan(3 * 1024 * 1024)
  })

  it('computes normalized triangle normals', () => {
    expect(triangleNormal([0, 0, 0], [1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
  })

  it('returns a zero normal for degenerate triangles', () => {
    expect(triangleNormal([0, 0, 0], [1, 1, 1], [2, 2, 2])).toEqual([0, 0, 0])
  })
})
