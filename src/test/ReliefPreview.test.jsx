import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ReliefPreview from '../components/ReliefPreview'

const h = vi.hoisted(() => ({ engine: null, createReliefPreview: vi.fn() }))
vi.mock('../lib/reliefPreview', () => ({ createReliefPreview: h.createReliefPreview }))
vi.mock('three', () => ({ __esModule: true, default: {}, Scene: class {} }))

const heightmap = { width: 3, height: 3, values: [0, 0, 0, 0, 1, 0, 0, 0, 0] }
const settings = { widthMm: 80, maxReliefMm: 3, baseMm: 1.2, detail: 'medium', smoothing: 'off', invert: false, mode: 'relief', threshold: 0.5 }

beforeEach(() => {
  h.engine = { setMesh: vi.fn(), dispose: vi.fn() }
  h.createReliefPreview.mockReset()
  h.createReliefPreview.mockReturnValue(h.engine)
})

describe('ReliefPreview', () => {
  it('builds the same mesh the download uses and hands it to the engine', async () => {
    render(<ReliefPreview heightmap={heightmap} settings={settings} />)
    await waitFor(() => expect(h.engine.setMesh).toHaveBeenCalled())
    const mesh = h.engine.setMesh.mock.calls.at(-1)[0]
    expect(mesh.faces.length).toBeGreaterThan(0)
    // Centre vertex raised by the relief (smoothing off): base + max.
    expect(mesh.vertices[4][2]).toBeCloseTo(4.2)
  })

  it('rebuilds when a setting changes', async () => {
    const { rerender } = render(<ReliefPreview heightmap={heightmap} settings={settings} />)
    await waitFor(() => expect(h.engine.setMesh).toHaveBeenCalledTimes(1))
    rerender(<ReliefPreview heightmap={heightmap} settings={{ ...settings, invert: true }} />)
    await waitFor(() => expect(h.engine.setMesh).toHaveBeenCalledTimes(2))
    expect(h.engine.setMesh.mock.calls[1][0].vertices[4][2]).toBeCloseTo(1.2)
  })

  it('says so, instead of breaking, where WebGL is unavailable', async () => {
    h.createReliefPreview.mockReturnValue(null)
    render(<ReliefPreview heightmap={heightmap} settings={settings} />)
    expect(await screen.findByText(/3d preview isn.t available/i)).toBeInTheDocument()
  })

  it('disposes the engine on unmount', async () => {
    const { unmount } = render(<ReliefPreview heightmap={heightmap} settings={settings} />)
    await waitFor(() => expect(h.createReliefPreview).toHaveBeenCalled())
    unmount()
    expect(h.engine.dispose).toHaveBeenCalled()
  })
})
