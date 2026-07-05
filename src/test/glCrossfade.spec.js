import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGlEngine } from '../lib/glCrossfade'

// A minimal mock of the slice of three.js the engine touches. Every disposable
// records its dispose calls so we can assert full teardown.
function makeThree() {
  const record = { geometry: 0, material: 0, renderer: 0, forceContextLoss: 0, textures: [] }

  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y }
    set(x, y) { this.x = x; this.y = y; return this }
  }

  const canvas = {
    style: {},
    parentNode: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }

  const THREE = {
    Scene: class { add() {} },
    Camera: class {},
    Vector2,
    ClampToEdgeWrapping: 1001,
    LinearFilter: 1006,
    SRGBColorSpace: 'srgb',
    PlaneGeometry: class { dispose() { record.geometry += 1 } },
    ShaderMaterial: class { constructor(opts) { Object.assign(this, opts) } dispose() { record.material += 1 } },
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m } },
    TextureLoader: class {
      setCrossOrigin() {}
      load(src, onLoad) {
        const tex = { image: { width: 120, height: 80 }, dispose: vi.fn() }
        record.textures.push(tex)
        onLoad(tex)
        return tex
      }
    },
    WebGLRenderer: class {
      constructor() { this.domElement = canvas }
      setPixelRatio() {}
      setSize() {}
      setClearColor() {}
      render() {}
      dispose() { record.renderer += 1 }
      forceContextLoss() { record.forceContextLoss += 1 }
    },
  }

  return { THREE, record, canvas }
}

function makeMount() {
  const mount = {
    clientWidth: 200,
    clientHeight: 100,
    appendChild: vi.fn((c) => { c.parentNode = mount }),
    removeChild: vi.fn((c) => { c.parentNode = null }),
  }
  return mount
}

const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('createGlEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('mounts a canvas and returns a handle', () => {
    const { THREE, canvas } = makeThree()
    const mount = makeMount()
    const engine = createGlEngine(THREE, mount)
    expect(engine).toBeTruthy()
    expect(mount.appendChild).toHaveBeenCalledWith(canvas)
    expect(typeof engine.setImage).toBe('function')
    expect(typeof engine.transitionTo).toBe('function')
    expect(typeof engine.dispose).toBe('function')
  })

  it('returns null when a WebGL renderer cannot be constructed', () => {
    const { THREE } = makeThree()
    THREE.WebGLRenderer = class { constructor() { throw new Error('no webgl context') } }
    expect(createGlEngine(THREE, makeMount())).toBeNull()
  })

  it('disposes geometry, material, textures and the renderer on dispose', async () => {
    const { THREE, record, canvas } = makeThree()
    const mount = makeMount()
    const engine = createGlEngine(THREE, mount)

    engine.setImage('a.jpg')
    await flush()

    engine.dispose()

    expect(record.geometry).toBe(1)
    expect(record.material).toBe(1)
    expect(record.renderer).toBe(1)
    expect(record.forceContextLoss).toBe(1)
    expect(record.textures.some((t) => t.dispose.mock.calls.length > 0)).toBe(true)
    expect(mount.removeChild).toHaveBeenCalledWith(canvas)
  })

  it('is idempotent: a second dispose does nothing', () => {
    const { THREE, record } = makeThree()
    const engine = createGlEngine(THREE, makeMount())
    engine.dispose()
    engine.dispose()
    expect(record.renderer).toBe(1)
    expect(record.forceContextLoss).toBe(1)
  })

  it('starts an animation frame when transitioning to a new image', async () => {
    const { THREE } = makeThree()
    const engine = createGlEngine(THREE, makeMount())
    engine.setImage('a.jpg')
    await flush()
    requestAnimationFrame.mockClear()
    engine.transitionTo('b.jpg')
    await flush()
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('notifies onContextLost when the canvas loses its WebGL context', () => {
    const { THREE, canvas } = makeThree()
    const onContextLost = vi.fn()
    createGlEngine(THREE, makeMount(), { onContextLost })
    const call = canvas.addEventListener.mock.calls.find((c) => c[0] === 'webglcontextlost')
    expect(call).toBeTruthy()
    const handler = call[1]
    handler({ preventDefault: vi.fn() })
    expect(onContextLost).toHaveBeenCalledTimes(1)
  })
})
