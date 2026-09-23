import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import ConceptViewer from '../components/ConceptViewer'
import ReliefStlDrawer from '../components/ReliefStlDrawer'
import SkinPreviewDrawer from '../components/SkinPreviewDrawer'

// Make STL and Try on skin open from inside the full-screen concept viewer's
// info panel. Both drawers must stack above that viewer, or they open hidden
// underneath it — which is exactly what Make STL did before.

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))
vi.mock('../components/ReliefPreview', () => ({ default: () => null }))

function zIndexOf(element) {
  for (let el = element; el; el = el.parentElement) {
    const match = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(el.className || '')
    if (match && /\bfixed\b/.test(el.className)) return Number(match[1] || match[2])
  }
  return 0
}

describe('drawers opened from the concept viewer', () => {
  const items = [{ id: 'c1', title: 'Moth', imageUrl: '/m.png', tags: [], concept: { id: 'c1', prompt: 'moth', tags: [] } }]
  const source = { conceptId: 'c1', conceptLabel: 'Moth', variantLabel: 'Pass', imageUrl: '/m.png', label: 'Moth' }

  it('stack above the viewer', () => {
    const viewer = render(<ConceptViewer items={items} onClose={() => {}} />)
    const viewerZ = zIndexOf(viewer.getByRole('dialog'))
    viewer.unmount()

    const stl = render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    expect(zIndexOf(stl.getByRole('dialog', { name: 'Make Relief STL' }))).toBeGreaterThan(viewerZ)
    stl.unmount()

    const skin = render(<SkinPreviewDrawer source={source} apiKey="" onSave={() => {}} onClose={() => {}} />)
    expect(zIndexOf(skin.getByRole('dialog', { name: 'Try on skin' }))).toBeGreaterThan(viewerZ)
  })
})
