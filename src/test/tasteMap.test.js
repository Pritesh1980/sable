import { describe, expect, it } from 'vitest'
import { fitToBox, layoutTasteMap, projectTo2D, spreadPoints } from '../data/tasteMap'

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)

// Points that truly live on a 2D plane, embedded in 6 dimensions along two
// orthonormal directions. PCA should recover their layout (up to rotation,
// reflection and one uniform scale).
const u = [1, 1, 0, 0, 1, 1].map((v) => v / 2)
const w = [1, -1, 1, -1, 0, 0].map((v) => v / 2)
const plane = [[0, 0], [3, 0], [0, 1], [3, 1], [1.5, 2.5], [-1, 0.5]]
const embed = ([a, b]) => u.map((ui, i) => a * ui + b * w[i] + 0.1)

describe('projectTo2D', () => {
  it('keeps the true layout of data that lies on a plane (relative distances preserved)', () => {
    const { points } = projectTo2D(plane.map(embed))
    const truth = plane.map(([x, y]) => ({ x, y }))
    const ratio = dist(points[0], points[1]) / dist(truth[0], truth[1])
    for (let i = 0; i < plane.length; i += 1) {
      for (let j = i + 1; j < plane.length; j += 1) {
        expect(dist(points[i], points[j])).toBeCloseTo(dist(truth[i], truth[j]) * ratio, 4)
      }
    }
  })

  it('is deterministic', () => {
    expect(projectTo2D(plane.map(embed)).points).toEqual(projectTo2D(plane.map(embed)).points)
  })

  it('projects a new vector onto the same axes', () => {
    const result = projectTo2D(plane.map(embed))
    const again = result.project(embed(plane[4]))
    expect(again.x).toBeCloseTo(result.points[4].x)
    expect(again.y).toBeCloseTo(result.points[4].y)
  })

  it('copes with one or zero vectors', () => {
    expect(projectTo2D([]).points).toEqual([])
    expect(projectTo2D([[1, 2, 3]]).points).toEqual([{ x: 0, y: 0 }])
  })
})

describe('fitToBox', () => {
  it('scales both axes by the same factor and centres the result', () => {
    const fitted = fitToBox([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 2 }], 200, 200, 20)
    expect(fitted[1].x - fitted[0].x).toBeCloseTo(160)
    expect(fitted[2].y - fitted[0].y).toBeCloseTo(32)
    const midY = (fitted[0].y + fitted[2].y) / 2
    expect(midY).toBeCloseTo(100)
  })
})

describe('spreadPoints', () => {
  it('pushes overlapping points apart until none are closer than the minimum', () => {
    const crowded = [{ x: 100, y: 100 }, { x: 102, y: 101 }, { x: 99, y: 103 }, { x: 300, y: 300 }]
    const spread = spreadPoints(crowded, 40, { width: 400, height: 400 })
    for (let i = 0; i < spread.length; i += 1) {
      for (let j = i + 1; j < spread.length; j += 1) {
        expect(dist(spread[i], spread[j])).toBeGreaterThanOrEqual(40 * 0.95)
      }
    }
    // an isolated point stays put
    expect(spread[3]).toEqual({ x: 300, y: 300 })
  })
})

describe('layoutTasteMap', () => {
  const artists = [
    { id: 'a', tags: ['blackwork'], images: ['/a1.jpg'], rank: 1, status: 'shortlisted' },
    { id: 'b', tags: ['fine-line'], images: ['/b1.jpg'], rank: 2 },
    { id: 'c', tags: ['realism'], images: ['/c1.jpg'], rank: 3 },
    { id: 'none', tags: ['realism'], images: ['/missing.jpg'], rank: 4 },
  ]
  const vectors = new Map([
    ['/a1.jpg', [1, 0, 0]],
    ['/b1.jpg', [0, 1, 0]],
    ['/c1.jpg', [0, 0, 1]],
  ])
  const getVec = (src) => vectors.get(src) || null

  it('places every artist with indexed images, inside the box, with their main style', () => {
    const map = layoutTasteMap(artists, getVec, { width: 360, height: 480, nodeSize: 44 })
    expect(map.nodes.map((n) => n.artist.id).sort()).toEqual(['a', 'b', 'c'])
    for (const node of map.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.x).toBeLessThanOrEqual(360)
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.y).toBeLessThanOrEqual(480)
    }
    expect(map.nodes.find((n) => n.artist.id === 'b').style).toBe('fine-line')
  })

  it('leaves room under each node for its name label', () => {
    // a and b are near-identical; c is far away, so a and b start almost on top of each other.
    const crowded = [
      { id: 'a', tags: ['x'], images: ['/a.jpg'] },
      { id: 'b', tags: ['x'], images: ['/b.jpg'] },
      { id: 'c', tags: ['y'], images: ['/c.jpg'] },
    ]
    const near = new Map([['/a.jpg', [1, 0, 0.001]], ['/b.jpg', [1, 0.001, 0]], ['/c.jpg', [0, 0, 1]]])
    const map = layoutTasteMap(crowded, (src) => near.get(src) || null, { width: 360, height: 480, nodeSize: 44 })
    expect(dist(map.nodes[0], map.nodes[1])).toBeGreaterThanOrEqual(44 * 1.5 * 0.95)
  })

  it('marks your taste, pulled towards the artists you rank highest', () => {
    const map = layoutTasteMap(artists, getVec, { width: 360, height: 480, nodeSize: 44 })
    const at = (id) => map.nodes.find((n) => n.artist.id === id)
    expect(map.taste).not.toBeNull()
    expect(dist(map.taste, at('a'))).toBeLessThan(dist(map.taste, at('c')))
  })

  // The taste vector is unit length but the centroids it blends are shorter,
  // so projecting it raw nudges the marker off the cloud. With every artist
  // weighted equally it belongs exactly at the centre of the artists.
  it('puts an evenly weighted taste at the centre of the artists', () => {
    const even = [
      { id: 'p', tags: ['x'], images: ['/p.jpg'] },
      { id: 'q', tags: ['x'], images: ['/q.jpg'] },
      { id: 'r', tags: ['y'], images: ['/r.jpg'] },
      { id: 's', tags: ['y'], images: ['/s.jpg'] },
    ]
    const vecs = new Map([
      ['/p.jpg', [0.9, 0.3, 0.1, 0.3]],
      ['/q.jpg', [0.7, 0.6, 0.2, 0.3]],
      ['/r.jpg', [0.6, 0.1, 0.7, 0.4]],
      ['/s.jpg', [0.8, 0.2, 0.4, 0.4]],
    ])
    const map = layoutTasteMap(even, (src) => vecs.get(src) || null, { width: 2000, height: 2000, nodeSize: 10 })
    const cx = map.nodes.reduce((sum, n) => sum + n.x, 0) / map.nodes.length
    const cy = map.nodes.reduce((sum, n) => sum + n.y, 0) / map.nodes.length
    expect(map.taste.x).toBeCloseTo(cx, 0)
    expect(map.taste.y).toBeCloseTo(cy, 0)
  })

  it('is empty when nothing is indexed yet', () => {
    const map = layoutTasteMap(artists, () => null, { width: 360, height: 480, nodeSize: 44 })
    expect(map.nodes).toEqual([])
    expect(map.taste).toBeNull()
  })
})
