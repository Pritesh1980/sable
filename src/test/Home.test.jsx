import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Home from '../pages/Home'
import { AuthProvider } from '../context/AuthContext'
import { DEMO_SESSION } from '../data/demoSeed'

const ARTISTS = [
  { id: 'b', handle: 'b_ink', name: 'Bea Two', rank: 2, tags: ['blackwork'], images: ['images/b/1.webp'] },
  { id: 'a', handle: 'a_ink', name: '', rank: 1, tags: ['realism'], images: ['images/a/1.webp'] },
]
const IDEAS = [{ id: 'i1', title: 'Fern sleeve', status: 'idea', images: [], linkedArtists: [] }]
const CONCEPTS = [{ id: 'c1', prompt: 'Moth over a crescent moon', imageUrl: '', variants: [] }]

function renderHome(props = {}) {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Home artists={ARTISTS} ideas={IDEAS} concepts={CONCEPTS} {...props} />
      </MemoryRouter>
    </AuthProvider>
  )
}

describe('Home start page (#220)', () => {
  beforeEach(() => localStorage.clear())

  it('names the app and says what it is for', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1, name: 'Sable' })).toBeInTheDocument()
    expect(screen.getByText(/every tattoo artist you love/i)).toBeInTheDocument()
  })

  it('shows top artists in rank order, each named and linked to its page', () => {
    renderHome()
    const section = screen.getByRole('region', { name: /top artists/i })
    const links = within(section).getAllByRole('link').filter((l) => l.getAttribute('href').includes('artist='))
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/gallery?artist=a', '/gallery?artist=b'])
    expect(within(section).getByText('@a_ink')).toBeInTheDocument()
    expect(within(section).getByText('Bea Two')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /see all 2/i })).toHaveAttribute('href', '/gallery')
  })

  it('lists ideas and concepts with a way to make another', () => {
    renderHome()
    const ideas = screen.getByRole('region', { name: /ideas/i })
    expect(within(ideas).getByRole('link', { name: /fern sleeve/i })).toHaveAttribute('href', '/brief?idea=i1')
    expect(within(ideas).getByRole('link', { name: /new idea/i })).toHaveAttribute('href', '/brief?new=1')
    const concepts = screen.getByRole('region', { name: /concepts/i })
    expect(within(concepts).getByRole('link', { name: /moth over a crescent moon/i })).toHaveAttribute('href', '/concepts?concept=c1')
    expect(within(concepts).getByRole('link', { name: /new concept/i })).toHaveAttribute('href', '/concepts?new=1')
  })

  it('gives one next step', () => {
    renderHome()
    const next = screen.getByRole('link', { name: /next.*pick an artist for “fern sleeve”/i })
    expect(next).toHaveAttribute('href', '/brief?idea=i1')
  })

  it('defines an artist, an idea and a concept when each is empty', () => {
    renderHome({ artists: [], ideas: [], concepts: [] })
    expect(screen.getByText(/save the tattooists whose work you would wear/i)).toBeInTheDocument()
    expect(screen.getByText(/an idea is a tattoo you want/i)).toBeInTheDocument()
    expect(screen.getByText(/a concept is a picture of an idea/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add an artist/i })).toHaveAttribute('href', '/gallery?add=1')
    expect(screen.getByRole('link', { name: /write your first idea/i })).toHaveAttribute('href', '/brief?new=1')
    expect(screen.getByRole('link', { name: /make your first concept/i })).toHaveAttribute('href', '/concepts?new=1')
  })

  // The demo offer moved here with the empty state. The suite runs with owner
  // seeding on (not the demo build), so it stays hidden: see demoSeed.test.js.
  it('keeps the demo offer hidden on a build that ships the curated seed', () => {
    renderHome({ artists: [] })
    expect(screen.queryByRole('button', { name: /view the full demo/i })).toBeNull()
  })

  it('introduces the demo on a demo session only', () => {
    renderHome()
    expect(screen.queryByText(/six invented artists/i)).toBeNull()
    localStorage.setItem('tattoo_local_session', JSON.stringify(DEMO_SESSION))
    renderHome()
    expect(screen.getByText(/six invented artists/i)).toBeInTheDocument()
  })
})
