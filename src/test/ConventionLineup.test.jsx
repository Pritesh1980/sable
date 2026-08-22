import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ConventionLineup from '../components/ConventionLineup'

const convention = { id: 'big-london', name: 'Big London Tattoo Show' }

const artists = [
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 6, status: 'shortlisted' },
]

const entries = [
  { name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
  { name: 'Martin Kubala', handle: 'kubalizmus', note: 'Slovakia' },
  { name: 'Ate Wamz', handle: '', note: 'Manila' },
]

function renderLineup(props = {}) {
  return render(
    <ConventionLineup
      convention={convention}
      artists={artists}
      entries={[]}
      attendingIds={[]}
      onImport={vi.fn()}
      onClear={vi.fn()}
      onAddArtist={vi.fn()}
      onToggleAttending={vi.fn()}
      {...props}
    />
  )
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: /artist index/i }))
}

describe('ConventionLineup — import', () => {
  it('offers the import box, and the show’s own list, when nothing is imported yet', () => {
    renderLineup()
    open()
    expect(screen.getByRole('link', { name: /artist list/i })).toHaveAttribute(
      'href',
      'https://www.biglondontattooshow.com/tattoo-artists/artist-list'
    )
    expect(screen.getByLabelText(/paste the line-up/i)).toBeInTheDocument()
  })

  it('parses a pasted list into entries', () => {
    const onImport = vi.fn()
    renderLineup({ onImport })
    open()
    fireEvent.change(screen.getByLabelText(/paste the line-up/i), {
      target: { value: 'A\nOscar Akermo @oscarakermo\nMartin Kubala @kubalizmus — Slovakia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^import/i }))

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0]).toEqual([
      { name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
      { name: 'Martin Kubala', handle: 'kubalizmus', note: 'Slovakia' },
    ])
  })

  it('says so rather than importing nothing when the paste has no artists in it', () => {
    const onImport = vi.fn()
    renderLineup({ onImport })
    open()
    fireEvent.change(screen.getByLabelText(/paste the line-up/i), { target: { value: 'Tickets\nHome' } })
    fireEvent.click(screen.getByRole('button', { name: /^import/i }))

    expect(onImport).not.toHaveBeenCalled()
    expect(screen.getByText(/no artists/i)).toBeInTheDocument()
  })
})

describe('ConventionLineup — index', () => {
  it('summarises the line-up against your gallery without being opened', () => {
    renderLineup({ entries })
    expect(screen.getByText(/3 artists/i)).toBeInTheDocument()
    expect(screen.getByText(/1 in your gallery/i)).toBeInTheDocument()
  })

  it('lists every artist, A–Z, with an Instagram link where there is a handle', () => {
    renderLineup({ entries })
    open()
    expect(screen.getByRole('link', { name: '@kubalizmus' })).toHaveAttribute(
      'href',
      'https://instagram.com/kubalizmus'
    )
    expect(screen.getByText('Ate Wamz')).toBeInTheDocument()
    // A–Z: Ate Wamz before Martin Kubala before Oscar Akermo.
    const labels = screen.getAllByTestId('lineup-label').map((el) => el.textContent)
    expect(labels).toEqual(['Ate Wamz', 'Martin Kubala', 'Oscar Akermo'])
  })

  it('searches by name, handle and detail', () => {
    renderLineup({ entries })
    open()
    fireEvent.change(screen.getByLabelText(/search the line-up/i), { target: { value: 'slovakia' } })
    expect(screen.getAllByTestId('lineup-label').map((el) => el.textContent)).toEqual(['Martin Kubala'])
  })

  it('narrows to the artists you already follow', () => {
    renderLineup({ entries })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'In your gallery' }))
    expect(screen.getAllByTestId('lineup-label').map((el) => el.textContent)).toEqual(['Oscar Akermo'])
  })

  it('marks a saved artist with their rank instead of offering to add them again', () => {
    renderLineup({ entries })
    open()
    const row = screen.getByTestId('lineup-row-oscarakermo')
    expect(within(row).getByText('#6')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument()
  })

  it('adds an artist from the index to the gallery', () => {
    const onAddArtist = vi.fn()
    renderLineup({ entries, onAddArtist })
    open()
    const row = screen.getByTestId('lineup-row-kubalizmus')
    fireEvent.click(within(row).getByRole('button', { name: /^add$/i }))
    expect(onAddArtist).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'kubalizmus', name: 'Martin Kubala' })
    )
  })

  it('cannot add an artist the list gives no handle for', () => {
    renderLineup({ entries })
    open()
    const rows = screen.getAllByTestId(/^lineup-row-/)
    const wamz = rows.find((r) => r.textContent.includes('Ate Wamz'))
    expect(within(wamz).queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument()
  })

  it('flags a saved artist as attending this convention', () => {
    const onToggleAttending = vi.fn()
    renderLineup({ entries, onToggleAttending })
    open()
    const row = screen.getByTestId('lineup-row-oscarakermo')
    const toggle = within(row).getByRole('button', { name: /attending/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(onToggleAttending).toHaveBeenCalledWith('oscarakermo')
  })

  it('shows an already-attending artist as flagged', () => {
    renderLineup({ entries, attendingIds: ['oscarakermo'] })
    open()
    const row = screen.getByTestId('lineup-row-oscarakermo')
    expect(within(row).getByRole('button', { name: /attending/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
