import { createRef, useImperativeHandle } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import ArmPlacementPanel from '../components/ArmPlacementPanel'

// The 3D view is a stub that exposes the props it was given and answers
// snapshot() with fixed bytes: this file tests what the panel adds on its own
// (the lab page's tests cover the sliders and the readout through it).
const view = vi.hoisted(() => ({ props: null, snapshot: null }))
vi.mock('../components/ArmPlacement3D', () => ({
  default: function Stub(props) {
    view.props = props
    useImperativeHandle(props.ref, () => ({ snapshot: view.snapshot }), [])
    return <div data-testid="arm-placement-3d" />
  },
}))

const META = {
  skin_cm: [1.7, 25],
  extent_cm: [-15, 35.4],
  perimeter_cm: [[1.7, 25], [10, 28], [16, 30], [25, 32]],
}
const FOREARM_META = {
  skin_cm: [1, 22],
  extent_cm: [-4, 30.9],
  perimeter_cm: [[1, 17], [12, 23], [22, 26]],
}
const metaFor = (url) => (String(url).includes('arm-forearm') ? FOREARM_META : META)
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

async function open(props = {}) {
  const ref = createRef()
  const utils = render(<ArmPlacementPanel ref={ref} imageSrc="blob:design" {...props} />)
  await screen.findByTestId('arm-placement-3d')
  return { ref, ...utils }
}

const drawn = (size = { width: 600, height: 760 }) => act(() => {
  view.props.onReady()
  view.props.onDesignSize(size)
})

beforeEach(() => {
  view.props = null
  view.snapshot = vi.fn(() => BYTES)
  vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve(metaFor(url)) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('ArmPlacementPanel', () => {
  it('puts the image it is given on the arm, close up', async () => {
    await open()
    expect(view.props.imageSrc).toBe('blob:design')
    expect(view.props.modelUrl).toBe('/models/arm-upper.glb')
    expect(view.props.view).toBe('design')
    expect(view.props.spin).toBe(false)
  })

  it('offers the same controls as the lab: size, three sliders, whole arm', async () => {
    await open()
    drawn()
    expect(screen.getByTestId('placement-size')).toHaveTextContent('12.0 cm wide × 15.2 cm tall')
    for (const name of ['Width', 'Above the elbow', 'Round the arm']) {
      expect(screen.getByLabelText(name)).toHaveAttribute('type', 'range')
    }
    expect(screen.getByRole('button', { name: 'Whole arm' })).toBeInTheDocument()
  })

  it('takes the picture together with the placement it shows', async () => {
    const { ref } = await open()
    drawn()
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '9' } })
    expect(ref.current.snapshot()).toEqual({
      bytes: BYTES,
      placement: { widthCm: 9, heightCm: 11.4, centreCm: 17, arcCm: 0 },
      limb: 'upper-arm',
    })
  })

  it('has no picture to take until both the arm and the design are drawn', async () => {
    const { ref } = await open()
    expect(ref.current.snapshot()).toBeNull()
    act(() => view.props.onReady())
    expect(ref.current.snapshot()).toBeNull() // the arm, still bare
    expect(view.snapshot).not.toHaveBeenCalled()
    act(() => view.props.onDesignSize({ width: 600, height: 760 }))
    expect(ref.current.snapshot()).not.toBeNull()
  })

  it('passes on a snapshot the view could not take', async () => {
    const { ref } = await open()
    drawn()
    view.snapshot.mockReturnValue(null)
    expect(ref.current.snapshot()).toBeNull()
  })

  it('says when there is something to save, and when there no longer is', async () => {
    const onReadyChange = vi.fn()
    const { rerender, ref } = await open({ onReadyChange })
    expect(onReadyChange).not.toHaveBeenCalledWith(true)
    drawn()
    expect(onReadyChange).toHaveBeenLastCalledWith(true)
    // Another image: the arm is there but the new design is not on it yet.
    rerender(<ArmPlacementPanel ref={ref} imageSrc="blob:other" onReadyChange={onReadyChange} />)
    expect(onReadyChange).toHaveBeenLastCalledWith(false)
    act(() => view.props.onDesignSize({ width: 600, height: 600 }))
    expect(onReadyChange).toHaveBeenLastCalledWith(true)
    act(() => view.props.onError(new Error('The design image could not be loaded.')))
    expect(onReadyChange).toHaveBeenLastCalledWith(false)
    expect(ref.current.snapshot()).toBeNull()
  })

  it('sizes the design from the shape it is told to expect until the image says otherwise', async () => {
    await open({ initialAspect: 2 })
    expect(screen.getByTestId('placement-size')).toHaveTextContent('wide × 23.3 cm tall')
  })

  it('shows extra controls after its own', async () => {
    await open({ children: <button type="button">Extra</button> })
    const extra = screen.getByRole('button', { name: 'Extra' })
    const round = screen.getByLabelText('Round the arm')
    expect(round.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says so when the arm model is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))
    const ref = createRef()
    render(<ArmPlacementPanel ref={ref} imageSrc="blob:design" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The arm model could not be loaded.')
    expect(ref.current.snapshot()).toBeNull()
  })
})

// #206: the forearm, and a switch between the two.
describe('ArmPlacementPanel limbs', () => {
  it('frames the whole limb from the model it loaded', async () => {
    await open()
    expect(view.props.whole).toEqual({ focusCm: 10.2, frameCm: 54.4 })
  })

  it('opens on the limb it is asked for, with that limb\'s words and default', async () => {
    await open({ limb: 'forearm' })
    expect(view.props.modelUrl).toBe('/models/arm-forearm.glb')
    expect(fetch).toHaveBeenCalledWith('/models/arm-forearm.json')
    drawn()
    expect(screen.getByTestId('placement-size')).toHaveTextContent('8.0 cm wide × 10.1 cm tall')
    expect(screen.getByLabelText('Above the wrist')).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText('Round the arm')).toHaveAttribute('aria-valuetext', 'inner forearm')
    expect(view.props.whole).toEqual({ focusCm: 13.45, frameCm: 38.9 })
  })

  it('switches limb, starting the design afresh on the new one', async () => {
    const onReadyChange = vi.fn()
    const { ref } = await open({ onReadyChange })
    drawn()
    const group = screen.getByRole('group', { name: 'Limb' })
    expect(within(group).getByRole('button', { name: 'Upper arm' })).toHaveAttribute('aria-pressed', 'true')
    const forearm = within(group).getByRole('button', { name: 'Forearm' })
    forearm.focus()
    fireEvent.click(forearm)
    // The limb's view starts afresh, but the switch is the same one: a
    // keyboard user's focus stays where they left it.
    expect(forearm).toHaveAttribute('aria-pressed', 'true')
    expect(document.activeElement).toBe(forearm)
    await waitFor(() => expect(view.props.modelUrl).toBe('/models/arm-forearm.glb'))
    // A new arm: nothing to save until it and the design are drawn again.
    expect(onReadyChange).toHaveBeenLastCalledWith(false)
    expect(ref.current.snapshot()).toBeNull()
    drawn()
    expect(ref.current.snapshot()).toMatchObject({ limb: 'forearm', placement: { widthCm: 8, centreCm: 12 } })
  })

  it('has no switcher for a limb it does not know, and opens the upper arm', async () => {
    await open({ limb: 'thigh' })
    expect(view.props.modelUrl).toBe('/models/arm-upper.glb')
  })
})
