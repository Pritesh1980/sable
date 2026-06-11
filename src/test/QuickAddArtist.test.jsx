import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickAddArtist from '../components/QuickAddArtist'

const existing = [{ id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1 }]

function renderModal({ onAdd = vi.fn(), onClose = vi.fn() } = {}) {
  render(<QuickAddArtist artists={existing} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

describe('QuickAddArtist', () => {
  it('adds an artist from a pasted Instagram URL with tags and status in one step', () => {
    const { onAdd, onClose } = renderModal()

    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
      target: { value: 'https://www.instagram.com/new_artist/' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'blackwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'dark-fantasy' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'shortlisted' } })
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))

    expect(onAdd).toHaveBeenCalledWith({
      handle: 'new_artist',
      name: '',
      tags: ['blackwork', 'dark-fantasy'],
      status: 'shortlisted',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('rejects an empty handle with an error', () => {
    const { onAdd } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/handle is required/i)).toBeInTheDocument()
  })

  it('rejects a duplicate handle with an error', () => {
    const { onAdd } = renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
      target: { value: '@Zoia.Ink' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/already in your collection/i)).toBeInTheDocument()
  })

  it('closes without adding via Cancel', () => {
    const { onAdd, onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
