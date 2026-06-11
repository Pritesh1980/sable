import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
