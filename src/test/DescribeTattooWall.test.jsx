import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import WallView from '../components/WallView'
import { saveDescription } from '../data/tattooDescription'
import { purgeLocalUserData } from '../backend/purge'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  buildStyleIndex: vi.fn(async () => {}),
}))

const artists = [
  { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: ['/z1.jpg', '/z2.jpg'], tags: [] },
  { id: 'kerem', name: 'Kerem', handle: 'keremtattz', images: ['/k1.jpg'], tags: [] },
]

function renderWall(entry = '/gallery?photo=zoia.1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/gallery" element={<WallView artists={artists} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  saveDescription('/z1.jpg', { text: 'A raven.', styles: [] })
  saveDescription('/z2.jpg', { text: 'A moth.', styles: [] })
})

describe('Describe this tattoo in the wall viewer', () => {
  it('opens for the photo on screen from its button', async () => {
    renderWall()
    fireEvent.click(screen.getAllByRole('button', { name: /^Describe/ })[0])
    expect(await screen.findByRole('dialog', { name: 'Describe tattoo' })).toBeInTheDocument()
    expect(screen.getByText('A raven.')).toBeInTheDocument()
  })

  it('opens from the D key, but not while typing', async () => {
    render(
      <MemoryRouter initialEntries={['/gallery?photo=zoia.2']}>
        <Routes>
          <Route path="/gallery" element={<><input aria-label="field" /><WallView artists={artists} /></>} />
        </Routes>
      </MemoryRouter>,
    )
    const field = screen.getByLabelText('field')
    field.focus()
    fireEvent.keyDown(field, { key: 'd' })
    expect(screen.queryByRole('dialog', { name: 'Describe tattoo' })).toBeNull()
    field.blur()
    fireEvent.keyDown(window, { key: 'd' })
    expect(await screen.findByText('A moth.')).toBeInTheDocument()
  })

  it('D does nothing while More like this is on top', async () => {
    renderWall()
    fireEvent.click(screen.getAllByRole('button', { name: /^More like this/ })[0])
    await screen.findByRole('dialog', { name: 'More like this' })
    fireEvent.keyDown(window, { key: 'd' })
    expect(screen.queryByRole('dialog', { name: 'Describe tattoo' })).toBeNull()
  })

  it('closes when the viewer moves to another photo', async () => {
    renderWall()
    fireEvent.click(screen.getAllByRole('button', { name: /^Describe/ })[0])
    await screen.findByRole('dialog', { name: 'Describe tattoo' })
    fireEvent.click(screen.getAllByRole('button', { name: /next photo/i })[0])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Describe tattoo' })).toBeNull())
  })

  it('closes with the viewer', async () => {
    renderWall()
    fireEvent.click(screen.getAllByRole('button', { name: /^Describe/ })[0])
    await screen.findByRole('dialog', { name: 'Describe tattoo' })
    fireEvent.click(screen.getByRole('button', { name: 'Close describe tattoo' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Describe tattoo' })).toBeNull())
    expect(screen.getByRole('dialog', { name: /zoia/i })).toBeInTheDocument()
  })
})

describe('descriptions on sign-out', () => {
  it('are purged', async () => {
    await purgeLocalUserData()
    expect(localStorage.getItem('tattoo_photo_descriptions')).toBeNull()
  })
})
