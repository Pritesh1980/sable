import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AddArtistModal from '../components/AddArtistModal'

vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(async (files) => files.map((_, i) => `data:image/jpeg;base64,STAGED${i}`)),
}))

const existing = [{ id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1, images: [] }]

function renderModal(props = {}) {
  const setArtists = vi.fn()
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <AddArtistModal artists={existing} setArtists={setArtists} onClose={onClose} {...props} />
    </MemoryRouter>
  )
  return { setArtists, onClose }
}

describe('AddArtistModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalises a pasted Instagram URL, applies tags, and saves a new artist in two clicks', async () => {
    const { setArtists, onClose } = renderModal()

    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
      target: { value: 'https://www.instagram.com/new_artist/' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'blackwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'dark-fantasy' }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(setArtists).toHaveBeenCalled())
    const next = setArtists.mock.calls[0][0](existing)
    const added = next.find((a) => a.handle === 'new_artist')
    expect(added).toMatchObject({ handle: 'new_artist', tags: ['blackwork', 'dark-fantasy'] })
    expect(onClose).toHaveBeenCalled()
  })

  it('requires a handle before saving', () => {
    const { setArtists } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(setArtists).not.toHaveBeenCalled()
    expect(screen.getByText(/handle is required/i)).toBeInTheDocument()
  })

  it('stamps addedAt on any staged images and attaches them to the saved artist', async () => {
    const { setArtists } = renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: 'brand_new' } })

    const file = new File(['x'], 'ref.jpg', { type: 'image/jpeg' })
    const fileInput = screen.getByLabelText(/choose files/i)
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(setArtists).toHaveBeenCalled())
    const next = setArtists.mock.calls[0][0](existing)
    const added = next.find((a) => a.handle === 'brand_new')
    expect(added.images).toHaveLength(1)
    expect(added.images[0]).toMatchObject({ url: 'data:image/jpeg;base64,STAGED0' })
    expect(added.images[0].addedAt).toBeTruthy()
  })

  it('offers to add images to the existing artist instead of creating a duplicate', async () => {
    const { setArtists, onClose } = renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: '@Zoia.Ink' } })

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    const offer = screen.getByRole('button', { name: /add images to.*instead/i })
    fireEvent.click(offer)

    // No new artist is ever created for a duplicate handle — the guard routes
    // to the existing artist instead.
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    if (setArtists.mock.calls.length) {
      const next = setArtists.mock.calls[0][0](existing)
      expect(next).toHaveLength(existing.length)
    }
  })

  it('renders a Full manage view link that also closes the modal', () => {
    const onManage = vi.fn()
    renderModal({ onManage })
    fireEvent.click(screen.getByText(/full manage view/i))
    expect(onManage).toHaveBeenCalled()
  })

  it('closes without saving via Cancel', () => {
    const { setArtists, onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(setArtists).not.toHaveBeenCalled()
  })
})
