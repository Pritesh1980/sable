import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createArmEngine, loadDesign, MAX_TEXTURE_PX } from '../lib/armPlacement'

// A mock of the slice of three.js the engine touches, with a real jsdom canvas
// so pointer and wheel events go through the real listeners. Disposables count
// their dispose calls, to assert a full teardown.
function makeThree() {
  const record = { renders: 0, disposed: [], textures: [], meshes: [], loader: null }
  const disposable = (name) => class {
    constructor(...args) { this.args = args }
    dispose() { record.disposed.push(name) }
  }
  class Group {
    constructor() { this.rotation = { x: 0, y: 0 }; this.position = { y: 0 }; this.children = [] }
    add(child) { this.children.push(child) }
  }
  const canvas = document.createElement('canvas')
  const THREE = {
    SRGBColorSpace: 'srgb',
    MathUtils: {
      degToRad: (d) => (d * Math.PI) / 180,
      clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    },
    Scene: Group,
    Group,
    PerspectiveCamera: class {
      constructor(fov) {
        this.fov = fov
        this.aspect = 1
        this.position = { z: 0, set: (x, y, z) => { this.position.z = z } }
        this.updateProjectionMatrix = vi.fn()
        record.camera = this
      }
    },
    Vector4: class { set(...v) { this.v = v } },
    Color: class { constructor(hex) { this.hex = hex } },
    DataTexture: disposable('blank'),
    ShaderMaterial: class extends disposable('material') {
      constructor(opts) { super(); Object.assign(this, opts) }
    },
    CanvasTexture: class {
      constructor(image) { this.image = image; record.textures.push(this) }
      dispose() { record.disposed.push('texture') }
    },
    Mesh: class { constructor(geometry, material) { Object.assign(this, { geometry, material }); record.meshes.push(this) } },
    WebGLRenderer: class {
      constructor() {
        this.domElement = canvas
        this.capabilities = { getMaxAnisotropy: () => 8 }
        this.setPixelRatio = vi.fn()
        this.setClearColor = vi.fn()
        this.setSize = vi.fn()
      }
      render(scene, camera) {
        record.renders += 1
        // What the frame showed: how far back the camera was, how far the arm was turned.
        record.frame = { z: camera?.position.z, yaw: scene?.children[0].children[0].rotation.y }
      }
      dispose() { record.disposed.push('renderer') }
    },
  }
  class GLTFLoader {
    load(url, onLoad, onProgress, onError) { record.loader = { url, onLoad, onError } }
  }
  return { THREE, GLTFLoader, record, canvas }
}

const gltfWith = (...nodes) => ({ scene: { traverse: (visit) => nodes.forEach(visit) } })
const armGeometry = () => ({ index: { count: 300 }, dispose: vi.fn() })

const TABLE = [[0, 30], [31, 30]]
const PLACED = { widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 0 }

let frames
let observers
const tick = (n = 1) => { for (let i = 0; i < n; i += 1) frames.pop()?.() }

beforeEach(() => {
  frames = []
  observers = []
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { frames = [] }))
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { this.cb = cb; this.disconnect = vi.fn(); observers.push(this) }
    observe() {}
  })
})
afterEach(() => vi.unstubAllGlobals())

function start(callbacks = {}, [width, height] = [400, 400]) {
  const three = makeThree()
  const mount = document.createElement('div')
  Object.defineProperty(mount, 'clientWidth', { value: width })
  Object.defineProperty(mount, 'clientHeight', { value: height })
  const engine = createArmEngine(three.THREE, three.GLTFLoader, mount, { modelUrl: '/models/arm.glb', callbacks })
  return { ...three, mount, engine, callbacks }
}

const pointer = (canvas, type, id, x, y) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })
  Object.defineProperty(event, 'pointerId', { value: id })
  canvas.dispatchEvent(event)
}

describe('createArmEngine', () => {
  it('mounts a canvas that takes the gestures itself and hides from assistive tech', () => {
    const { mount, canvas } = start()
    expect(mount.contains(canvas)).toBe(true)
    expect(canvas.style.touchAction).toBe('none')
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
  })

  it('loads the model, adds the arm and reports ready', () => {
    const onReady = vi.fn()
    const { record } = start({ onReady })
    expect(record.loader.url).toBe('/models/arm.glb')
    const geometry = armGeometry()
    record.loader.onLoad(gltfWith({ isMesh: false }, { isMesh: true, geometry }))
    expect(record.meshes).toHaveLength(1)
    expect(record.meshes[0].geometry).toBe(geometry)
    expect(onReady).toHaveBeenCalledWith({ triangles: 100 })
  })

  it('reports a model that fails to load, or has no mesh in it', () => {
    const onError = vi.fn()
    const onReady = vi.fn()
    const { record } = start({ onError, onReady })
    record.loader.onLoad(gltfWith({ isMesh: false }))
    expect(onReady).not.toHaveBeenCalled()
    record.loader.onError(new Error('404'))
    expect(onError.mock.calls[0][0].message).toBe('The arm model could not be loaded.')
  })

  it('renders only when something changed', () => {
    const { record, engine } = start()
    tick()
    expect(record.renders).toBe(1)
    tick(3)
    expect(record.renders).toBe(1) // idle: nothing drawn
    engine.setPlacement(PLACED, TABLE)
    tick()
    expect(record.renders).toBe(2)
  })

  it('places the design with four numbers, never new geometry', () => {
    const { engine, record } = start()
    record.loader.onLoad(gltfWith({ isMesh: true, geometry: armGeometry() }))
    engine.setPlacement({ ...PLACED, arcCm: 3 }, TABLE)
    const material = record.meshes[0].material
    expect(material.uniforms.uPlace.value.v).toEqual([3, 17, 12, 15.2])
    expect(record.meshes).toHaveLength(1)
  })

  it('eases the camera in on the design, and back out for the whole arm', () => {
    const { engine, record } = start()
    const settle = () => { tick(80); return record.camera.position.z }
    engine.setPlacement(PLACED, TABLE, 'arm')
    const wholeArm = settle()
    engine.setPlacement(PLACED, TABLE, 'design')
    tick()
    const partWay = record.camera.position.z
    const closeUp = settle()
    expect(closeUp).toBeLessThan(partWay) // it travels, it doesn't jump
    expect(partWay).toBeLessThan(wholeArm)
    expect(wholeArm / closeUp).toBeCloseTo(54 / 21.28, 1) // the framed heights
  })

  it('never crops the arm in a narrow panel', () => {
    const { engine, record } = start({}, [100, 1000])
    engine.setPlacement({ ...PLACED, widthCm: 3, heightCm: 3.8 }, TABLE)
    tick(80)
    const half = Math.tan((26 / 2) * (Math.PI / 180))
    expect(record.camera.position.z).toBeCloseTo(0.075 / (half * 0.1))
  })

  it('turns the arm with one finger and leaves the size alone', () => {
    const onResize = vi.fn()
    const { canvas, record } = start({ onResize })
    tick()
    pointer(canvas, 'pointerdown', 1, 100, 100)
    pointer(canvas, 'pointermove', 1, 160, 100)
    tick()
    expect(record.renders).toBe(2)
    expect(onResize).not.toHaveBeenCalled()
    pointer(canvas, 'pointerup', 1, 160, 100)
    pointer(canvas, 'pointermove', 1, 300, 100) // a finger that is no longer down
    tick()
    expect(record.renders).toBe(2)
  })

  it('resizes the design with a pinch, in centimetres', () => {
    const onResize = vi.fn()
    const { canvas, engine } = start({ onResize })
    engine.setPlacement(PLACED, TABLE)
    pointer(canvas, 'pointerdown', 1, 100, 100)
    pointer(canvas, 'pointerdown', 2, 200, 100)
    pointer(canvas, 'pointermove', 2, 250, 100)
    expect(onResize).toHaveBeenLastCalledWith(18)
    pointer(canvas, 'pointercancel', 2, 250, 100)
    pointer(canvas, 'pointermove', 1, 50, 100)
    expect(onResize).toHaveBeenCalledTimes(1) // back to one finger: turning again
  })

  it('resizes with the wheel on a desktop, without scrolling the page', () => {
    const onResize = vi.fn()
    const { canvas, engine } = start({ onResize })
    engine.setPlacement(PLACED, TABLE)
    const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    canvas.dispatchEvent(wheel)
    expect(onResize).toHaveBeenCalledWith(13)
    expect(wheel.defaultPrevented).toBe(true)
  })

  it('swaps the design texture and frees the old one', () => {
    const { engine, record } = start()
    record.loader.onLoad(gltfWith({ isMesh: true, geometry: armGeometry() }))
    const first = document.createElement('canvas')
    engine.setDesign(first)
    expect(record.meshes[0].material.uniforms.uDesign.value.image).toBe(first)
    expect(record.textures[0].colorSpace).toBe('srgb')
    expect(record.textures[0].anisotropy).toBe(8)
    engine.setDesign(document.createElement('canvas'))
    expect(record.disposed).toEqual(['texture'])
  })

  it('keeps drawing while spinning', () => {
    const { engine, record } = start()
    engine.setSpin(true)
    tick(5)
    expect(record.renders).toBe(5)
    engine.setSpin(false)
    tick(80)
    const settled = record.renders
    tick(3)
    expect(record.renders).toBe(settled)
  })

  it('follows the panel when it changes size', () => {
    const { record } = start()
    tick()
    observers[0].cb()
    tick()
    expect(record.renders).toBe(2)
  })

  it('tears everything down: no leaked context, listeners or frames', () => {
    const onResize = vi.fn()
    const { engine, record, canvas, mount } = start({ onResize })
    const geometry = armGeometry()
    record.loader.onLoad(gltfWith({ isMesh: true, geometry }))
    engine.setDesign(document.createElement('canvas'))
    engine.dispose()
    expect(record.disposed.sort()).toEqual(['blank', 'material', 'renderer', 'texture'])
    expect(geometry.dispose).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(observers[0].disconnect).toHaveBeenCalled()
    expect(mount.contains(canvas)).toBe(false)
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(onResize).not.toHaveBeenCalled()
  })

  it('drops a model that arrives after teardown, and stays quiet about a late error', () => {
    const onReady = vi.fn()
    const onError = vi.fn()
    const { engine, record } = start({ onReady, onError })
    engine.dispose()
    const geometry = armGeometry()
    record.loader.onLoad(gltfWith({ isMesh: true, geometry }))
    record.loader.onError(new Error('late'))
    expect(geometry.dispose).toHaveBeenCalled()
    expect(record.meshes).toHaveLength(0)
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('snapshot', () => {
  // The first eight bytes of every PNG file.
  const PNG = 'data:image/png;base64,iVBORw0KGgo='
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

  function ready(view = 'design', placement = PLACED) {
    const made = start()
    made.record.loader.onLoad(gltfWith({ isMesh: true, geometry: armGeometry() }))
    made.engine.setPlacement(placement, TABLE, view)
    made.canvas.toDataURL = vi.fn(() => PNG)
    tick(80) // let the opening framing settle
    return made
  }

  it('draws a frame and reads it back as PNG bytes in the same task', () => {
    const { engine, record, canvas } = ready()
    const before = record.renders
    canvas.toDataURL = vi.fn(() => {
      // The drawing buffer is only readable straight after a render.
      expect(record.renders).toBe(before + 1)
      return PNG
    })
    const bytes = engine.snapshot()
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual(SIGNATURE)
    expect(frames.length).toBeLessThanOrEqual(1) // no frame was waited for
  })

  it('frames the picture on the design even while the view shows the whole arm', () => {
    const closeUp = ready('design')
    const closeUpZ = closeUp.record.frame.z
    const { engine, record } = ready('arm')
    const wholeArmZ = record.frame.z
    expect(wholeArmZ).toBeGreaterThan(closeUpZ)
    engine.snapshot()
    expect(record.frame.z).toBeCloseTo(closeUpZ)
    // The view itself goes back to what it was showing.
    tick(2)
    expect(record.frame.z).toBeCloseTo(wholeArmZ)
  })

  it('brings a design that was turned away back to face the camera', () => {
    const { engine, record, canvas } = ready()
    pointer(canvas, 'pointerdown', 1, 100, 100)
    pointer(canvas, 'pointermove', 1, 420, 100) // most of half a turn
    tick()
    const turnedAway = record.frame.yaw
    expect(Math.abs(turnedAway)).toBeGreaterThan(2)
    engine.snapshot()
    expect(Math.abs(record.frame.yaw)).toBeLessThanOrEqual(0.6)
    tick(2)
    expect(record.frame.yaw).toBeCloseTo(turnedAway) // and the view is left as it was
  })

  it('has nothing to give before the arm and a placement are there', () => {
    const { engine, record, canvas } = start()
    canvas.toDataURL = vi.fn(() => PNG)
    expect(engine.snapshot()).toBeNull()
    record.loader.onLoad(gltfWith({ isMesh: true, geometry: armGeometry() }))
    expect(engine.snapshot()).toBeNull() // an arm, but nowhere to put the design yet
    expect(canvas.toDataURL).not.toHaveBeenCalled()
  })

  it('gives nothing when the canvas cannot be read', () => {
    const { engine, canvas } = ready()
    canvas.toDataURL = vi.fn(() => 'data:,') // what a zero-sized canvas returns
    expect(engine.snapshot()).toBeNull()
    canvas.toDataURL = vi.fn(() => { throw new Error('SecurityError') })
    expect(engine.snapshot()).toBeNull()
  })
})

describe('loadDesign', () => {
  // A fake 2D canvas: jsdom has no pixels.
  function fakes(pixels, naturalWidth, naturalHeight) {
    const image = { naturalWidth, naturalHeight }
    const put = vi.fn()
    const canvas = {
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
        putImageData: put,
      }),
    }
    return { image, canvas, put, options: { createImage: () => image, createCanvas: () => canvas } }
  }

  it('turns a dark concept card into ink on paper', async () => {
    const dark = [14, 13, 11, 255]
    const { image, canvas, put, options } = fakes([...dark, ...dark, ...dark, ...dark], 2, 2)
    const loading = loadDesign('/card.svg', options)
    expect(image.src).toBe('/card.svg')
    expect(image.crossOrigin).toBe('anonymous')
    image.onload()
    expect(await loading).toBe(canvas)
    expect([canvas.width, canvas.height]).toEqual([2, 2])
    expect([...put.mock.calls[0][0].data.slice(0, 4)]).toEqual([255, 255, 255, 255])
  })

  it('caps the texture size, keeping the shape', async () => {
    const { image, canvas, options } = fakes([255, 255, 255, 255], 4096, 2048)
    const loading = loadDesign('/big.png', options)
    image.onload()
    await loading
    expect([canvas.width, canvas.height]).toEqual([MAX_TEXTURE_PX, MAX_TEXTURE_PX / 2])
  })

  it('rejects when the image will not load', async () => {
    const { image, options } = fakes([], 1, 1)
    const loading = loadDesign('/missing.png', options)
    image.onerror()
    await expect(loading).rejects.toThrow('The design image could not be loaded.')
  })
})
