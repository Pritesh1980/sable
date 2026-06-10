import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddArtistForm from '../components/AddArtistForm'

describe('AddArtistForm', () => {
  it('submits a trimmed handle and name, then clears the form', () => {
    const onAdd = vi.fn()
    render(<AddArtistForm onAdd={onAdd} />)

    const handle = screen.getByPlaceholderText('@handle')
    const name = screen.getByPlaceholderText('Full name (optional)')
    fireEvent.change(handle, { target: { value: '@new_artist ' } })
    fireEvent.change(name, { target: { value: ' New Artist ' } })
    fireEvent.click(screen.getByRole('button', { name: /add artist/i }))

    expect(onAdd).toHaveBeenCalledWith({ handle: 'new_artist', name: 'New Artist' })
    expect(handle.value).toBe('')
    expect(name.value).toBe('')
  })

  it('requires a handle and shows an error instead of submitting', () => {
    const onAdd = vi.fn()
    render(<AddArtistForm onAdd={onAdd} />)

    fireEvent.click(screen.getByRole('button', { name: /add artist/i }))

    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText('Instagram handle is required')).toBeTruthy()
  })
})
