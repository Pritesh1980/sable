import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PlacementLab from '../pages/PlacementLab'

// The 3D view is a stub that exposes the props it was given: this file tests
// the page's own job, which is turning gestures and sliders into a placement
// that fits the arm, in centimetres.
const view = vi.hoisted(() => ({ props: null }))
vi.mock('../components/ArmPlacement3D', () => ({
  default: (props) => {
    view.props = props
    return <div data-testid="arm-placement-3d" />
  },
}))

const META = {
  skin_cm: [1.7, 25],
  perimeter_cm: [[1.7, 25], [10, 28], [16, 30], [25, 32]],
}

function mockFetch(response) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))
}

async function open(path = '/lab/placement') {
  render(<MemoryRouter initialEntries={[path]}><PlacementLab /></MemoryRouter>)
  // The meta, then the lazy 3D view.
  await screen.findByTestId('arm-placement-3d')
}

const size = () => screen.getByTestId('placement-size').textContent

beforeEach(() => {
  view.props = null
  mockFetch({ ok: true, json: () => Promise.resolve(META) })
})
afterEach(() => vi.unstubAllGlobals())

describe('PlacementLab', () => {
  it('opens on a demo tattoo, close up, and shows it loading', async () => {
    await open()
    expect(view.props.imageSrc).toBe('/models/designs/hourglass.webp')
    expect(view.props.modelUrl).toBe('/models/arm-upper.glb')
    expect(view.props.view).toBe('design')
    expect(view.props.perimeterCm).toBe(META.perimeter_cm)
    expect(screen.getByText('Loading the arm…')).toHaveAttribute('aria-busy', 'true')
    // No step-back button until there is an arm to step back from.
    expect(screen.queryByRole('button', { name: 'Whole arm' })).toBeNull()
  })

  it('gives the size in centimetres, and how far round the arm it goes', async () => {
    await open()
    act(() => view.props.onDesignSize({ width: 600, height: 760 }))
    expect(size()).toContain('12.0 cm wide × 15.2 cm tall')
    expect(size()).toMatch(/4\d% round the arm/)
    expect(view.props.placement).toMatchObject({ widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 0 })
  })

  it('narrows a tall design to the skin there is', async () => {
    await open()
    act(() => view.props.onDesignSize({ width: 450, height: 1010 }))
    expect(view.props.placement.heightCm).toBeLessThanOrEqual(23.3)
    expect(view.props.placement.widthCm).toBeLessThan(12)
  })

  it('resizes from a pinch and from the slider alike', async () => {
    await open()
    act(() => view.props.onDesignSize({ width: 600, height: 760 }))
    act(() => view.props.onResize(16))
    expect(size()).toContain('16.0 cm wide')
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '9' } })
    expect(size()).toContain('9.0 cm wide')
    expect(screen.getByLabelText('Width')).toHaveAttribute('aria-valuetext', '9.0 cm')
    expect(view.props.placement.widthCm).toBe(9)
  })

  it('moves the design up the arm and round it, saying which way', async () => {
    await open()
    act(() => view.props.onDesignSize({ width: 600, height: 760 }))
    fireEvent.change(screen.getByLabelText('Above the elbow'), { target: { value: '12' } })
    expect(view.props.placement.centreCm).toBe(12)
    const round = screen.getByLabelText('Round the arm')
    expect(round).toHaveAttribute('aria-valuetext', 'outer arm')
    fireEvent.change(round, { target: { value: '4' } })
    expect(round).toHaveAttribute('aria-valuetext', '4.0 cm to the back')
    fireEvent.change(round, { target: { value: '-3' } })
    expect(round).toHaveAttribute('aria-valuetext', '3.0 cm to the front')
    expect(screen.getByText('3.0 cm to the front').tagName).toBe('OUTPUT') // shown, too
    expect(view.props.placement.arcCm).toBe(-3)
  })

  it('steps back to the whole arm and in again, once the arm is there', async () => {
    await open()
    act(() => view.props.onReady())
    expect(screen.queryByText('Loading the arm…')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Whole arm' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(view.props.view).toBe('arm')
    fireEvent.click(screen.getByRole('button', { name: 'Close up' }))
    expect(view.props.view).toBe('design')
  })

  it('switches design', async () => {
    await open()
    fireEvent.change(screen.getByLabelText('Design'), { target: { value: 'models/designs/tiger.webp' } })
    expect(view.props.imageSrc).toBe('/models/designs/tiger.webp')
  })

  it('spins only when asked to in the URL (the frame-rate measurement)', async () => {
    await open('/lab/placement?spin=1')
    expect(view.props.spin).toBe(true)
  })

  it('says so when the view fails, instead of an empty box', async () => {
    await open()
    act(() => view.props.onError(new Error('The design image could not be loaded.')))
    expect(screen.getByRole('alert')).toHaveTextContent('The design image could not be loaded.')
    expect(screen.queryByTestId('arm-placement-3d')).toBeNull()
  })

  it('says so when the arm model is missing', async () => {
    mockFetch({ ok: false })
    render(<MemoryRouter><PlacementLab /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('The arm model could not be loaded.')
    expect(screen.queryByTestId('placement-size')).toBeNull()
  })
})
