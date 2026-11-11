import { createRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import ArmPlacement3D from '../components/ArmPlacement3D'

// The engine is mocked: this checks the component drives it correctly on
// mount, prop changes and unmount, without touching WebGL.
const h = vi.hoisted(() => ({ engine: null, createArmEngine: vi.fn(), loadDesign: vi.fn() }))

vi.mock('../lib/armPlacement', () => ({ createArmEngine: h.createArmEngine, loadDesign: h.loadDesign }))
vi.mock('three', () => ({ __esModule: true, Scene: class {} }))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {} }))

const TABLE = [[0, 30], [31, 30]]
const PLACED = { widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 0 }
const INK = { width: 600, height: 760 }
const props = (extra = {}) => ({
  modelUrl: '/models/arm.glb', imageSrc: '/a.webp', placement: PLACED, perimeterCm: TABLE, ...extra,
})

beforeEach(() => {
  h.engine = { setPlacement: vi.fn(), setDesign: vi.fn(), setSpin: vi.fn(), dispose: vi.fn(), snapshot: vi.fn() }
  h.createArmEngine.mockReset().mockReturnValue(h.engine)
  h.loadDesign.mockReset().mockResolvedValue(INK)
})

describe('ArmPlacement3D', () => {
  it('builds the scene once, on its own mount, and places the design', () => {
    const { getByTestId } = render(<ArmPlacement3D {...props()} />)
    expect(h.createArmEngine).toHaveBeenCalledTimes(1)
    const [, , mount, options] = h.createArmEngine.mock.calls[0]
    expect(mount).toBe(getByTestId('arm-placement-3d'))
    expect(options.modelUrl).toBe('/models/arm.glb')
    expect(h.engine.setPlacement).toHaveBeenCalledWith(PLACED, TABLE, 'design')
    expect(h.engine.setSpin).toHaveBeenCalledWith(false)
  })

  it('loads the design, hands it to the engine and reports its size', async () => {
    const onDesignSize = vi.fn()
    render(<ArmPlacement3D {...props({ onDesignSize })} />)
    await waitFor(() => expect(h.engine.setDesign).toHaveBeenCalledWith(INK))
    expect(h.loadDesign).toHaveBeenCalledWith('/a.webp')
    expect(onDesignSize).toHaveBeenCalledWith({ width: 600, height: 760 })
  })

  it('moves the design without rebuilding the scene', () => {
    const { rerender } = render(<ArmPlacement3D {...props()} />)
    const moved = { ...PLACED, widthCm: 18 }
    rerender(<ArmPlacement3D {...props({ placement: moved, view: 'arm', spin: true })} />)
    expect(h.createArmEngine).toHaveBeenCalledTimes(1)
    expect(h.engine.setPlacement).toHaveBeenLastCalledWith(moved, TABLE, 'arm')
    expect(h.engine.setSpin).toHaveBeenLastCalledWith(true)
  })

  it('passes the engine handlers that stay current across renders', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<ArmPlacement3D {...props({ onResize: first })} />)
    rerender(<ArmPlacement3D {...props({ onResize: second })} />)
    h.createArmEngine.mock.calls[0][3].callbacks.onResize(14)
    expect(second).toHaveBeenCalledWith(14)
    expect(first).not.toHaveBeenCalled()
    expect(h.createArmEngine).toHaveBeenCalledTimes(1)
  })

  it('reports a design that will not load', async () => {
    const onError = vi.fn()
    h.loadDesign.mockRejectedValue(new Error('The design image could not be loaded.'))
    render(<ArmPlacement3D {...props({ onError })} />)
    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(h.engine.setDesign).not.toHaveBeenCalled()
  })

  it('ignores a design that finishes loading after another was chosen', async () => {
    let finishFirst
    h.loadDesign.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
    const { rerender } = render(<ArmPlacement3D {...props()} />)
    rerender(<ArmPlacement3D {...props({ imageSrc: '/b.webp' })} />)
    await waitFor(() => expect(h.engine.setDesign).toHaveBeenCalledTimes(1))
    finishFirst({ width: 1, height: 1 })
    await Promise.resolve()
    expect(h.engine.setDesign).toHaveBeenCalledTimes(1)
    expect(h.engine.setDesign).toHaveBeenCalledWith(INK)
  })

  it('hands its owner a way to take the picture', () => {
    const bytes = new Uint8Array([1, 2, 3])
    h.engine.snapshot.mockReturnValue(bytes)
    const ref = createRef()
    const { unmount } = render(<ArmPlacement3D {...props({ ref })} />)
    expect(ref.current.snapshot()).toBe(bytes)
    // Once the scene is gone there is nothing to photograph, and no crash.
    const { snapshot } = ref.current
    unmount()
    expect(snapshot()).toBeNull()
  })

  it('does nothing without a design, and disposes the scene on unmount', () => {
    const { unmount } = render(<ArmPlacement3D {...props({ imageSrc: '' })} />)
    expect(h.loadDesign).not.toHaveBeenCalled()
    unmount()
    expect(h.engine.dispose).toHaveBeenCalledTimes(1)
  })
})
