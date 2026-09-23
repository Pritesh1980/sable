import { useState } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UndoProvider } from '../context/UndoContext'
import Brief from '../pages/Brief'

// A reference image in an idea can be turned into a relief STL, not only an
// AI concept result.

vi.mock('../components/ReliefPreview', () => ({ default: () => null }))

const seed = [
  { id: 'i1', title: 'Moth sternum', description: '', tags: [], placement: '', images: [{ url: 'data:image/png;base64,moth', note: '' }, { url: 'data:image/png;base64,wing', note: '' }], linkedArtists: [], status: 'idea' },
]

function Harness() {
  const [ideas, setIdeas] = useState(seed)
  return (
    <MemoryRouter initialEntries={['/brief']}>
      <UndoProvider>
        <Brief ideas={ideas} setIdeas={setIdeas} artists={[]} />
      </UndoProvider>
    </MemoryRouter>
  )
}

afterEach(() => cleanup())

describe('3D print from an idea reference image', () => {
  it('opens the relief drawer on the chosen image, named after the idea', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Moth sternum'))
    fireEvent.click(screen.getByRole('button', { name: '3D print reference 2' }))

    const drawer = screen.getByRole('dialog', { name: 'Make Relief STL' })
    expect(drawer).toBeInTheDocument()
    expect(screen.getByAltText('Moth sternum reference 2 STL source')).toHaveAttribute('src', 'data:image/png;base64,wing')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Make Relief STL' })).not.toBeInTheDocument()
    // Closing the drawer leaves the idea editor open.
    expect(screen.getByRole('button', { name: '3D print reference 1' })).toBeInTheDocument()
  })
})
