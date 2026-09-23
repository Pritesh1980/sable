import { describe, expect, it, vi } from 'vitest'
import { buildReliefMesh } from '../data/reliefStl'
import { createReliefPreview, meshToGeometryArrays } from '../lib/reliefPreview'

const mesh = buildReliefMesh(
  { width: 3, height: 2, values: [0, 0.5, 1, 1, 0.5, 0] },
  { widthMm: 40, maxReliefMm: 4, baseMm: 1, smoothing: 'off' },
)

describe('meshToGeometryArrays', () => {
  it('shares vertices through an index, so three.js can smooth-shade the relief', () => {
    const { positions, indices } = meshToGeometryArrays(mesh)
    expect(positions).toBeInstanceOf(Float32Array)
    expect(positions.length).toBe(mesh.vertices.length * 3)
    expect(indices).toBeInstanceOf(Uint32Array)
    expect([...indices]).toEqual(mesh.faces.flat())
  })

  it('centres the plate on the origin in x and y so it spins in place', () => {
    const { positions } = meshToGeometryArrays(mesh)
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i])
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1])
    }
    expect(minX + maxX).toBeCloseTo(0)
    expect(minY + maxY).toBeCloseTo(0)
    expect(maxX - minX).toBeCloseTo(40)
  })
})

describe('createReliefPreview', () => {
  it('returns null when a WebGL renderer cannot be created', () => {
    const THREE = { WebGLRenderer: class { constructor() { throw new Error('no webgl') } } }
    const mount = { clientWidth: 100, clientHeight: 100, appendChild: vi.fn() }
    expect(createReliefPreview(THREE, mount)).toBeNull()
  })

  // On a phone the preview sits in a scrolling drawer: vertical swipes must
  // still scroll it (agy review), horizontal drags rotate.
  it('lets vertical swipes scroll the page on touch', () => {
    const style = {}
    const canvas = { style, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    const noop = class { add() {} remove() {} set() {} }
    const THREE = {
      WebGLRenderer: class { constructor() { this.domElement = canvas } setPixelRatio() {} setSize() {} render() {} dispose() {} },
      Scene: noop,
      PerspectiveCamera: class { constructor() { this.up = { set() {} }; this.position = { set() {} } } lookAt() {} updateProjectionMatrix() {} },
      HemisphereLight: noop,
      DirectionalLight: class { constructor() { this.position = { set() {} } } },
      MeshStandardMaterial: class { dispose() {} },
    }
    const mount = { clientWidth: 100, clientHeight: 100, appendChild: vi.fn() }
    expect(createReliefPreview(THREE, mount)).toBeTruthy()
    expect(style.touchAction).toBe('pan-y')
  })
})

