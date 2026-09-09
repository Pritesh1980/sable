import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ConventionWinners from '../components/ConventionWinners'

const convention = { id: 'big-london', name: 'Big London Tattoo Show' }

const artists = [
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 6, status: 'shortlisted' },
]

const entries = [
  { category: 'Best of Show', placing: 1, name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
  { category: 'Best Colour', placing: 1, name: 'Martin Kubala', handle: 'kubalizmus', note: 'Slovakia' },
  { category: 'Best Colour', placing: 2, name: 'Ate Wamz', handle: '', note: 'Manila' },
]

function renderWinners(props = {}) {
  return render(
    <ConventionWinners
      convention={convention}
      artists={artists}
      entries={[]}
      attendingIds={[]}
      onImport={vi.fn()}
      onClear={vi.fn()}
      onAddArtist={vi.fn()}
      onToggleAttending={vi.fn()}
      onSetPhoto={vi.fn()}
      {...props}
    />
  )
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: /competition winners/i }))
}

describe('ConventionWinners — empty', () => {
  it('says nothing is imported yet', () => {
    renderWinners()
    expect(screen.getByRole('button', { name: /competition winners/i })).toHaveTextContent(/not imported/i)
  })

  it('offers the paste box once opened', () => {
    renderWinners()
    open()
    expect(screen.getByLabelText(/paste the results/i)).toBeInTheDocument()
  })

  it('imports what was pasted, parsed into winners', () => {
    const onImport = vi.fn()
    renderWinners({ onImport })
    open()
    fireEvent.change(screen.getByLabelText(/paste the results/i), {
      target: { value: 'Best of Show\n1st - Oscar Akermo @oscarakermo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({ category: 'Best of Show', placing: 1, handle: 'oscarakermo' }),
    ])
  })

  it('explains itself rather than importing nothing when the paste has no winners', () => {
    const onImport = vi.fn()
    renderWinners({ onImport })
    open()
    fireEvent.change(screen.getByLabelText(/paste the results/i), {
      target: { value: 'nothing here that looks remotely like a results board at all' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.getByText(/no winners/i)).toBeInTheDocument()
  })
})

describe('ConventionWinners — the board', () => {
  it('summarises the count and how many you already follow', () => {
    renderWinners({ entries })
    const header = screen.getByRole('button', { name: /competition winners/i })
    expect(header).toHaveTextContent(/3 winners/i)
    expect(header).toHaveTextContent(/1 in your gallery/i)
  })

  it('groups by award category with Best of Show first', () => {
    renderWinners({ entries })
    open()
    const headings = screen.getAllByTestId('winner-category').map((el) => el.textContent)
    expect(headings[0]).toMatch(/best of show/i)
    expect(headings[1]).toMatch(/best colour/i)
  })

  it('shows the placing against each winner', () => {
    renderWinners({ entries })
    open()
    const row = screen.getByTestId('winner-row-kubalizmus')
    expect(row).toHaveTextContent(/1st/)
  })

  it('shows a saved artist’s rank instead of an add button', () => {
    renderWinners({ entries })
    open()
    const row = screen.getByTestId('winner-row-oscarakermo')
    expect(row).toHaveTextContent('#6')
    expect(within(row).queryByRole('button', { name: /^add$/i })).toBeNull()
  })

  it('adds an artist you do not have yet, with the award in the note', () => {
    const onAddArtist = vi.fn()
    renderWinners({ entries, onAddArtist })
    open()
    const row = screen.getByTestId('winner-row-kubalizmus')
    fireEvent.click(within(row).getByRole('button', { name: /^add$/i }))
    expect(onAddArtist).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'kubalizmus', note: expect.stringMatching(/best colour/i) })
    )
  })

  it('cannot add a winner the results board gave no handle for', () => {
    renderWinners({ entries })
    open()
    const row = screen.getByTestId('winner-row-ate-wamz')
    expect(within(row).queryByRole('button', { name: /^add$/i })).toBeNull()
    expect(row).toHaveTextContent(/no handle/i)
  })

  it('toggles attendance for a saved winner', () => {
    const onToggleAttending = vi.fn()
    renderWinners({ entries, onToggleAttending })
    open()
    const row = screen.getByTestId('winner-row-oscarakermo')
    fireEvent.click(within(row).getByRole('button', { name: /attending/i }))
    expect(onToggleAttending).toHaveBeenCalledWith('oscarakermo')
  })

  it('links the handle to instagram', () => {
    renderWinners({ entries })
    open()
    const row = screen.getByTestId('winner-row-kubalizmus')
    expect(within(row).getByRole('link', { name: /@kubalizmus/ })).toHaveAttribute(
      'href',
      'https://instagram.com/kubalizmus'
    )
  })

  it('offers to clear the board once there is one', () => {
    const onClear = vi.fn()
    renderWinners({ entries, onClear })
    open()
    fireEvent.click(screen.getByRole('button', { name: /clear results/i }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('ConventionWinners — the winning tattoo', () => {
  it('renders an attached photo', () => {
    const withPhoto = [{ ...entries[0], photo: 'data:image/jpeg;base64,AAA' }]
    renderWinners({ entries: withPhoto })
    open()
    const img = screen.getByAltText(/winning tattoo — oscar akermo/i)
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,AAA')
  })

  it('offers to add a photo when there is none', () => {
    renderWinners({ entries })
    open()
    const row = screen.getByTestId('winner-row-oscarakermo')
    expect(within(row).getByLabelText(/add a photo of the winning tattoo/i)).toBeInTheDocument()
  })

  it('removes a photo the user no longer wants', () => {
    const onSetPhoto = vi.fn()
    const withPhoto = [{ ...entries[0], photo: 'data:image/jpeg;base64,AAA' }]
    renderWinners({ entries: withPhoto, onSetPhoto })
    open()
    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))
    expect(onSetPhoto).toHaveBeenCalledWith(expect.stringContaining('oscarakermo'), '')
  })

  it('counts the photos on the board in the header', () => {
    const withPhoto = [{ ...entries[0], photo: 'data:image/jpeg;base64,AAA' }, entries[1]]
    renderWinners({ entries: withPhoto })
    expect(screen.getByRole('button', { name: /competition winners/i })).toHaveTextContent(/1 photo/i)
  })
})
