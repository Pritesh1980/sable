import { trimChars } from './textTrim'

export const DEFAULT_RELIEF_SETTINGS = {
  widthMm: 80,
  maxReliefMm: 3,
  baseMm: 1.2,
  detail: 'medium',
  smoothing: 'light',
  invert: false,
  // 'relief' maps brightness to height; 'lineart' splits at `threshold` into
  // plate or full height, so line work prints as crisp raised shapes;
  // 'lithophane' makes dark areas thick, so the image shows when backlit.
  mode: 'relief',
  threshold: 0.5,
  // A full-height rim around the edge: stiffens a thin lithophane, neatens a plaque.
  frame: false,
}

const FRAME_MM = 3

// Samples across the longest side. At the default 80mm, fine is ~0.31mm per
// sample, about a 0.4mm nozzle's line width.
export const DETAIL_PRESETS = {
  low: 48,
  medium: 96,
  high: 160,
  fine: 256,
}

const VALID_SMOOTHING = new Set(['off', 'light'])
const VALID_MODES = new Set(['relief', 'lineart', 'lithophane'])

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const finiteNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback)

export function normalizeReliefSettings(rawSettings = {}) {
  const settings = { ...DEFAULT_RELIEF_SETTINGS, ...rawSettings }
  const detail = Object.hasOwn(DETAIL_PRESETS, settings.detail) ? settings.detail : DEFAULT_RELIEF_SETTINGS.detail
  const smoothing = VALID_SMOOTHING.has(settings.smoothing)
    ? settings.smoothing
    : DEFAULT_RELIEF_SETTINGS.smoothing

  return {
    widthMm: clamp(finiteNumber(Number(settings.widthMm), DEFAULT_RELIEF_SETTINGS.widthMm), 20, 200),
    maxReliefMm: clamp(
      finiteNumber(Number(settings.maxReliefMm), DEFAULT_RELIEF_SETTINGS.maxReliefMm),
      0.5,
      10,
    ),
    baseMm: clamp(finiteNumber(Number(settings.baseMm), DEFAULT_RELIEF_SETTINGS.baseMm), 0.4, 6),
    detail,
    smoothing,
    invert: Boolean(settings.invert),
    mode: VALID_MODES.has(settings.mode) ? settings.mode : DEFAULT_RELIEF_SETTINGS.mode,
    threshold: clamp(finiteNumber(Number(settings.threshold), DEFAULT_RELIEF_SETTINGS.threshold), 0.05, 0.95),
    frame: Boolean(settings.frame),
  }
}

function validateHeightmap(heightmap) {
  if (!heightmap || !Number.isInteger(heightmap.width) || !Number.isInteger(heightmap.height)) {
    throw new Error('Relief heightmap must include integer width and height.')
  }

  if (heightmap.width < 2 || heightmap.height < 2) {
    throw new Error('Relief heightmap must be at least 2x2 pixels.')
  }

  if (!Array.isArray(heightmap.values) && !ArrayBuffer.isView(heightmap.values)) {
    throw new Error('Relief heightmap values must be an array.')
  }

  if (heightmap.values.length !== heightmap.width * heightmap.height) {
    throw new Error('Relief heightmap values length must match width * height.')
  }
}

function valueAt(grid, x, y) {
  return grid.values[y * grid.width + x]
}

function downsampleHeightmap(heightmap, maxDimension) {
  const largestDimension = Math.max(heightmap.width, heightmap.height)

  if (largestDimension <= maxDimension) {
    return {
      width: heightmap.width,
      height: heightmap.height,
      values: Array.from(heightmap.values, (value) => clamp(finiteNumber(Number(value), 0), 0, 1)),
    }
  }

  const scale = maxDimension / largestDimension
  const width = Math.max(2, Math.round(heightmap.width * scale))
  const height = Math.max(2, Math.round(heightmap.height * scale))
  const values = []

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(heightmap.height - 1, Math.round((y / (height - 1)) * (heightmap.height - 1)))

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(heightmap.width - 1, Math.round((x / (width - 1)) * (heightmap.width - 1)))
      values.push(clamp(finiteNumber(Number(valueAt(heightmap, sourceX, sourceY)), 0), 0, 1))
    }
  }

  return { width, height, values }
}

function smoothHeightmap(heightmap) {
  const values = []

  for (let y = 0; y < heightmap.height; y += 1) {
    for (let x = 0; x < heightmap.width; x += 1) {
      let total = 0
      let weightTotal = 0

      for (let dy = -1; dy <= 1; dy += 1) {
        const sampleY = y + dy
        if (sampleY < 0 || sampleY >= heightmap.height) continue

        for (let dx = -1; dx <= 1; dx += 1) {
          const sampleX = x + dx
          if (sampleX < 0 || sampleX >= heightmap.width) continue

          const weight = dx === 0 && dy === 0 ? 4 : 1
          total += valueAt(heightmap, sampleX, sampleY) * weight
          weightTotal += weight
        }
      }

      values.push(total / weightTotal)
    }
  }

  return { ...heightmap, values }
}

function vertexIndex(x, y, width) {
  return y * width + x
}

function addQuad(faces, a, b, c, d) {
  faces.push([a, c, b], [b, c, d])
}

function addWallQuad(faces, a, b, c, d) {
  faces.push([a, b, c], [b, d, c])
}

// Normalised surface heights (0 = plate, 1 = full relief) after the same
// downsample → smoothing → threshold → invert pipeline the mesh uses. The 2D
// line mask and the 3D model both read this, so they can't disagree.
export function buildReliefHeightField(heightmap, rawSettings = {}) {
  validateHeightmap(heightmap)

  const settings = normalizeReliefSettings(rawSettings)
  const sampled = downsampleHeightmap(heightmap, DETAIL_PRESETS[settings.detail])
  const prepared = settings.smoothing === 'light' ? smoothHeightmap(sampled) : sampled
  const values = new Float32Array(prepared.width * prepared.height)

  for (let y = 0; y < prepared.height; y += 1) {
    for (let x = 0; x < prepared.width; x += 1) {
      const raw = clamp(finiteNumber(Number(valueAt(prepared, x, y)), 0), 0, 1)
      // Thresholded after smoothing, so smoothing removes specks and noise
      // rather than softening the line edges.
      let height
      if (settings.mode === 'lithophane') {
        // Thickness blocks light: dark areas thick, highlights thin. Only
        // readable one way round, so invert doesn't apply.
        height = 1 - raw
      } else {
        const brightness = settings.mode === 'lineart' ? (raw >= settings.threshold ? 1 : 0) : raw
        height = settings.invert ? 1 - brightness : brightness
      }
      values[vertexIndex(x, y, prepared.width)] = height
    }
  }

  if (settings.frame) {
    const spacingMm = settings.widthMm / (prepared.width - 1)
    const band = Math.max(1, Math.ceil(FRAME_MM / spacingMm - 1e-9))
    for (let y = 0; y < prepared.height; y += 1) {
      for (let x = 0; x < prepared.width; x += 1) {
        if (x < band || y < band || x >= prepared.width - band || y >= prepared.height - band) {
          values[vertexIndex(x, y, prepared.width)] = 1
        }
      }
    }
  }

  return { width: prepared.width, height: prepared.height, values }
}

export function buildReliefMesh(heightmap, rawSettings = {}) {
  const settings = normalizeReliefSettings(rawSettings)
  const field = buildReliefHeightField(heightmap, settings)
  const depthMm = settings.widthMm * ((field.height - 1) / (field.width - 1))
  const xStep = settings.widthMm / (field.width - 1)
  const yStep = depthMm / (field.height - 1)
  const vertices = []
  const faces = []

  for (let y = 0; y < field.height; y += 1) {
    const coordinateY = depthMm - y * yStep

    for (let x = 0; x < field.width; x += 1) {
      const mapped = field.values[vertexIndex(x, y, field.width)]
      vertices.push([x * xStep, coordinateY, settings.baseMm + mapped * settings.maxReliefMm])
    }
  }

  const topCount = vertices.length
  const { width, height } = field

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      addQuad(
        faces,
        vertexIndex(x, y, width),
        vertexIndex(x + 1, y, width),
        vertexIndex(x, y + 1, width),
        vertexIndex(x + 1, y + 1, width),
      )
    }
  }

  // The bottom is flat, so it needs no interior vertices: just the perimeter
  // (shared with the walls, keeping the solid watertight) fanned from one
  // centre point. A full grid here doubled the file for no change in shape.
  // Walk the perimeter counter-clockwise as seen from above (+z); grid row
  // height-1 is the smallest world Y.
  const perimeter = []
  for (let x = 0; x < width - 1; x += 1) perimeter.push([x, height - 1])
  for (let y = height - 1; y > 0; y -= 1) perimeter.push([width - 1, y])
  for (let x = width - 1; x > 0; x -= 1) perimeter.push([x, 0])
  for (let y = 0; y < height - 1; y += 1) perimeter.push([0, y])

  const bottomIndex = new Map()
  for (const [x, y] of perimeter) {
    bottomIndex.set(vertexIndex(x, y, width), vertices.length)
    vertices.push([x * xStep, depthMm - y * yStep, 0])
  }
  const centre = vertices.length
  vertices.push([settings.widthMm / 2, depthMm / 2, 0])
  const bottom = (x, y) => bottomIndex.get(vertexIndex(x, y, width))

  // Reversed (centre, next, current) so the normals point down.
  for (let i = 0; i < perimeter.length; i += 1) {
    const [ax, ay] = perimeter[i]
    const [bx, by] = perimeter[(i + 1) % perimeter.length]
    faces.push([centre, bottom(bx, by), bottom(ax, ay)])
  }

  for (let x = 0; x < width - 1; x += 1) {
    addWallQuad(
      faces,
      vertexIndex(x, 0, width),
      vertexIndex(x + 1, 0, width),
      bottom(x, 0),
      bottom(x + 1, 0),
    )
    addWallQuad(
      faces,
      vertexIndex(x + 1, height - 1, width),
      vertexIndex(x, height - 1, width),
      bottom(x + 1, height - 1),
      bottom(x, height - 1),
    )
  }

  for (let y = 0; y < height - 1; y += 1) {
    addWallQuad(
      faces,
      vertexIndex(0, y + 1, width),
      vertexIndex(0, y, width),
      bottom(0, y + 1),
      bottom(0, y),
    )
    addWallQuad(
      faces,
      vertexIndex(width - 1, y, width),
      vertexIndex(width - 1, y + 1, width),
      bottom(width - 1, y),
      bottom(width - 1, y + 1),
    )
  }

  const heightMm = vertices.slice(0, topCount).reduce((max, vertex) => Math.max(max, vertex[2]), 0)

  return {
    vertices,
    faces,
    size: {
      widthMm: settings.widthMm,
      depthMm,
      heightMm,
    },
  }
}

export function triangleNormal(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  const length = Math.hypot(normal[0], normal[1], normal[2])

  if (length === 0) {
    return [0, 0, 0]
  }

  return normal.map((value) => value / length)
}

function formatNumber(value) {
  return finiteNumber(Number(value), 0).toFixed(6)
}

function sanitizeSolidName(solidName) {
  return trimChars(String(solidName || 'relief').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'), '_')
    || 'relief'
}

export function serializeAsciiStl(mesh, solidName = 'raven_relief') {
  const name = sanitizeSolidName(solidName)
  const lines = [`solid ${name}`]

  for (const face of mesh.faces) {
    const vertices = face.map((index) => mesh.vertices[index])
    const normal = triangleNormal(vertices[0], vertices[1], vertices[2])

    lines.push(
      `  facet normal ${formatNumber(normal[0])} ${formatNumber(normal[1])} ${formatNumber(normal[2])}`,
      '    outer loop',
    )

    for (const vertex of vertices) {
      lines.push(`      vertex ${formatNumber(vertex[0])} ${formatNumber(vertex[1])} ${formatNumber(vertex[2])}`)
    }

    lines.push('    endloop', '  endfacet')
  }

  lines.push(`endsolid ${name}`)
  return lines.join('\n')
}

// Binary STL: 80-byte header, uint32 triangle count, then 50 bytes per
// triangle (normal + 3 vertices as float32, uint16 attribute), little-endian.
// Roughly a fifth the size of the ASCII form and faster for slicers to load.
export function serializeBinaryStl(mesh, solidName = 'raven_relief') {
  const buffer = new ArrayBuffer(84 + 50 * mesh.faces.length)
  const view = new DataView(buffer)
  // Must not begin with "solid": some readers take that to mean ASCII.
  const header = new TextEncoder().encode(`Sable relief ${sanitizeSolidName(solidName)}`.slice(0, 80))
  new Uint8Array(buffer, 0, 80).set(header)
  view.setUint32(80, mesh.faces.length, true)

  let offset = 84
  for (const face of mesh.faces) {
    const vertices = face.map((index) => mesh.vertices[index])
    for (const value of [...triangleNormal(vertices[0], vertices[1], vertices[2]), ...vertices.flat()]) {
      view.setFloat32(offset, finiteNumber(Number(value), 0), true)
      offset += 4
    }
    view.setUint16(offset, 0, true)
    offset += 2
  }
  return buffer
}

export function buildReliefStl(heightmap, settings = {}) {
  return serializeBinaryStl(buildReliefMesh(heightmap, settings), settings.solidName || 'raven_relief')
}
