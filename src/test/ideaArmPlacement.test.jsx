import { useEffect, useImperativeHandle, useState } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UndoProvider } from '../context/UndoContext'
import Brief from '../pages/Brief'

// #206: a Brief idea's reference photo opens on the 3D arm too, on the limb
// the idea is planned for, and the picture it saves joins the idea's
// references. The panel (and WebGL) is a stub; ArmPlacementDrawer.test.jsx
// covers the drawer itself.
const h = vi.hoisted(() => ({ panel: null, snapshot: null }))
vi.mock('../components/ReliefPreview', () => ({ default: () => null }))
vi.mock('../hooks/useImageBytes', () => ({ default: (ref) => ({ src: `bytes:${ref}`, status: 'ready' }) }))
vi.mock('../data/skinPreview', async (load) => ({
  ...(await load()),
  shrinkImageDataUrl: async (url) => url,
}))
vi.mock('../components/ArmPlacementPanel', () => ({
  default: function Stub(props) {
    h.panel = props
    useImperativeHandle(props.ref, () => ({ snapshot: h.snapshot }), [])
    return <div data-testid="arm-panel" />
  },
}))

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const seed = (placement) => [{
  id: 'i1', title: 'Fern study', description: '', tags: [], placement,
  images: [{ url: 'data:image/png;base64,fern', note: '' }, { url: 'data:image/png;base64,frond', note: '' }],
  linkedArtists: [], status: 'idea',
}]

let latest = null
function Harness({ placement = 'forearm' }) {
  const [ideas, setIdeas] = useState(() => seed(placement))
  useEffect(() => { latest = ideas }, [ideas])
  return (
    <MemoryRouter initialEntries={['/brief']}>
      <UndoProvider>
        <Brief ideas={ideas} setIdeas={setIdeas} artists={[]} />
      </UndoProvider>
    </MemoryRouter>
  )
}

const drawer = () => screen.getByRole('dialog', { name: 'On the arm in 3D' })

beforeEach(() => {
  h.panel = null
  h.snapshot = vi.fn(() => ({
    bytes: PNG, placement: { widthCm: 8, heightCm: 10, centreCm: 12, arcCm: 0 }, limb: 'forearm',
  }))
})
afterEach(() => cleanup())

describe('3D arm from an idea reference photo', () => {
  it('opens the chosen photo on the limb the idea is planned for, named after the idea', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Fern study'))
    fireEvent.click(screen.getByRole('button', { name: 'View reference 2 on the arm in 3D' }))
    expect(within(drawer()).getByRole('heading', { name: 'Fern study reference 2' })).toBeInTheDocument()
    expect(h.panel.imageSrc).toBe('bytes:data:image/png;base64,frond')
    expect(h.panel.limb).toBe('forearm')
    // Reference photos are often of a tattoo already on skin: say so where it shows.
    expect(within(drawer()).getByTestId('arm-hint')).toHaveTextContent(/flat design/)
  })

  it('follows the placement as edited, before the idea is saved', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Fern study'))
    fireEvent.click(screen.getByRole('button', { name: 'upper arm' }))
    fireEvent.click(screen.getByRole('button', { name: 'View reference 1 on the arm in 3D' }))
    expect(h.panel.limb).toBe('upper-arm')
  })

  it('opens the upper arm for anywhere it has no model of', () => {
    render(<Harness placement="back" />)
    fireEvent.click(screen.getByText('Fern study'))
    fireEvent.click(screen.getByRole('button', { name: 'View reference 1 on the arm in 3D' }))
    expect(h.panel.limb).toBe('upper-arm')
  })

  it('adds the picture to the idea\'s references, noted with its size, and keeps the editor open', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Fern study'))
    fireEvent.click(screen.getByRole('button', { name: 'View reference 2 on the arm in 3D' }))
    act(() => h.panel.onReadyChange(true))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Add to references' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'On the arm in 3D' })).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'View reference 3 on the arm in 3D' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(latest[0].images).toHaveLength(3))
    expect(latest[0].images[2]).toMatchObject({ note: 'On the forearm, 8 cm' })
    expect(latest[0].images[2].url ?? latest[0].images[2].key).toBeTruthy()
  })
})
