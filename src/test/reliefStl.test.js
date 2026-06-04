import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RELIEF_SETTINGS,
  buildReliefMesh,
  buildReliefStl,
  normalizeReliefSettings,
  triangleNormal,
} from '../data/reliefStl'

const twoByTwo = { width: 2, height: 2, values: [0, 0.5, 0.75, 1] }

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

    expect(mesh.vertices).toHaveLength(8)
    expect(mesh.faces).toHaveLength(12)
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

    expect(mesh.faces.slice(0, 4).flat().every((index) => index < 6)).toBe(true)
    expect(mesh.faces.slice(4, 8).flat().every((index) => index >= 6)).toBe(true)
    expect(mesh.faces.slice(8).every((face) => (
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

    const normals = mesh.faces.slice(4).map((face) => triangleNormal(
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

    expect(mesh.vertices).toHaveLength(48 * 24 * 2)
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
    expect(stl).not.toMatch(/NaN|Infinity/)
  })

  it('computes normalized triangle normals', () => {
    expect(triangleNormal([0, 0, 0], [1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
  })

  it('returns a zero normal for degenerate triangles', () => {
    expect(triangleNormal([0, 0, 0], [1, 1, 1], [2, 2, 2])).toEqual([0, 0, 0])
  })
})
