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

  it('is titled Home and shows the four pipeline stages in order', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    const labels = ['Researching', 'Shortlisted', 'Contact next', 'Contacted']
    const found = labels.map((l) => screen.getAllByText(l)[0])
    found.forEach((el) => expect(el).toBeInTheDocument())
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
