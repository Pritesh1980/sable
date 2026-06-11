import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: [], rank: 1, status: 'contact-next' },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tags: ['fine-line'], images: [], rank: 2, status: 'shortlisted' },
  { id: 'victorportugal', handle: 'victorportugal', name: 'Victor Portugal', tags: ['blackwork'], images: [], rank: 3, status: 'researching' },
  { id: 'johndark', handle: 'johndarktattoo_', name: 'John Dark', tags: ['blackwork'], images: [], rank: 4, status: 'maybe' },
]

function renderHome({ a = artists, ideas = [], boards = [] } = {}) {
  render(
    <MemoryRouter>
      <Dashboard artists={a} ideas={ideas} boards={boards} />
    </MemoryRouter>
  )
}

describe('Home pipeline', () => {
  beforeEach(() => localStorage.clear())

  it('is titled Home and shows the three active pipeline stages', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    const labels = ['Researching', 'Shortlisted', 'Contact next']
    labels.forEach((l) => expect(screen.getAllByText(l)[0]).toBeInTheDocument())
  })

  it('shows contacted artists only as a count, never as a stage card', () => {
    renderHome({
      a: [
        ...artists,
        { id: 'done1', handle: 'done1', name: '', tags: [], images: [], rank: 5, status: 'contacted' },
      ],
    })
    expect(screen.getByText(/contacted: 1/i)).toBeInTheDocument()
    expect(screen.queryByText('@done1')).not.toBeInTheDocument()
  })

  it('shows artists inside their stage cards and a parked count', () => {
    renderHome()
    expect(screen.getAllByText('@zoia.ink').length).toBeGreaterThan(0)
    expect(screen.getByText(/parked.*1/i)).toBeInTheDocument()
  })

  it('shows an add-artists CTA when the pipeline is empty', () => {
    renderHome({ a: [] })
    const cta = screen.getByRole('link', { name: /add artists/i })
    expect(cta).toHaveAttribute('href', '/gallery?mode=manage')
  })
})

describe('Top 5 panel', () => {
  const six = [
    { id: 'a1', handle: 'a1', name: '', tags: [], images: [], rank: 1, status: 'contact-next' },
    { id: 'a2', handle: 'a2', name: '', tags: [], images: [], rank: 2, status: 'shortlisted' },
    { id: 'a3', handle: 'a3', name: '', tags: [], images: [], rank: 3, status: 'researching' },
    { id: 'a4', handle: 'a4', name: '', tags: [], images: [], rank: 4, status: 'researching' },
    { id: 'a5', handle: 'a5', name: '', tags: [], images: [], rank: 5, status: 'researching' },
    { id: 'a6', handle: 'a6', name: '', tags: [], images: [], rank: 6, status: 'researching' },
  ]

  function renderWithSetter() {
    const setArtists = vi.fn()
    render(
      <MemoryRouter>
        <Dashboard artists={six} ideas={[]} boards={[]} setArtists={setArtists} />
      </MemoryRouter>
    )
    return setArtists
  }

  it('shows the top five active artists with a bench below', () => {
    renderWithSetter()
    expect(screen.getByText('Top 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move @a2 out of your top 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move @a6 into your top 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move @a6 out of your top 5' })).not.toBeInTheDocument()
  })

  it('dropping an artist out re-ranks them to 6', () => {
    const setArtists = renderWithSetter()
    fireEvent.click(screen.getByRole('button', { name: 'Move @a2 out of your top 5' }))
    const next = setArtists.mock.calls[0][0]
    expect(next.find((a) => a.id === 'a2').rank).toBe(6)
    expect(next.find((a) => a.id === 'a6').rank).toBe(5)
  })

  it('pulling a bench artist in re-ranks them to 5', () => {
    const setArtists = renderWithSetter()
    fireEvent.click(screen.getByRole('button', { name: 'Move @a6 into your top 5' }))
    const next = setArtists.mock.calls[0][0]
    expect(next.find((a) => a.id === 'a6').rank).toBe(5)
    expect(next.find((a) => a.id === 'a5').rank).toBe(6)
  })
})
