import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Plan from '../pages/Plan'
import { DEMO_ARTISTS, demoTasteHistory } from '../data/demoSeed'

// Group D of #220: Pipeline was built around a contact workflow the owner does
// not use. Plan answers one question instead: which artist for which idea.

const TODAY = '2027-02-01'

const artists = [
  { id: 'ash', handle: 'ash', name: 'Ash Vane', tags: ['blackwork', 'surrealism'], images: [], rank: 3 },
  { id: 'bone', handle: 'bone', name: '', tags: ['blackwork'], images: [], rank: 1 },
  { id: 'cinder', handle: 'cinder', name: 'Cinder', tags: ['blackwork'], images: [], rank: 2, status: 'pass' },
  { id: 'dusk', handle: 'dusk', name: 'Dusk', tags: ['blackwork'], images: [], rank: 4 },
  { id: 'ember', handle: 'ember', name: 'Ember', tags: ['fine-line'], images: [], rank: 5,
    guestSpots: [{ id: 'g1', city: 'London', startDate: '2027-02-12', endDate: '2027-02-14' }] },
]

const idea = (over) => ({ id: 'i1', title: 'Raven sleeve', status: 'idea', tags: ['blackwork', 'surrealism'], linkedArtists: [], ...over })

function renderPlan(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/plan']}>
      <Plan artists={artists} ideas={[idea()]} setArtists={vi.fn()} today={TODAY} {...props} />
    </MemoryRouter>
  )
}

const card = (title) => screen.getByRole('article', { name: title })

describe('Plan (#220 D)', () => {
  beforeEach(() => localStorage.clear())

  it('says what it is for, with none of the contact workflow', () => {
    renderPlan()
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByText(/which artist for which idea/i)).toBeInTheDocument()
    for (const gone of [/top 5/i, /contact next/i, /how sable works/i, /shortlisted/i, /researching/i, /active ideas/i]) {
      expect(screen.queryByText(gone)).toBeNull()
    }
  })

  it('shows each open idea, linked to the idea, and leaves finished ones out', () => {
    renderPlan({ ideas: [idea(), idea({ id: 'i2', title: 'Moth', status: 'booked', tags: ['fine-line'] }), idea({ id: 'i3', title: 'Old one', status: 'done' })] })
    expect(within(card('Raven sleeve')).getByRole('link', { name: 'Raven sleeve' })).toHaveAttribute('href', '/brief?idea=i1')
    expect(within(card('Moth')).getByText('Booked')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Old one' })).toBeNull()
  })

  it('lists the three best artists: most shared styles, then rank, ignoring an old status', () => {
    renderPlan()
    const links = within(card('Raven sleeve')).getAllByRole('link').filter((a) => a.getAttribute('href').startsWith('/gallery'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/gallery?artist=ash',
      '/gallery?artist=bone',
      '/gallery?artist=cinder',
    ])
    expect(within(links[0]).getByText(/2 shared styles/i)).toBeInTheDocument()
    expect(within(links[1]).getByText(/1 shared style$/i)).toBeInTheDocument()
  })

  it('puts an artist already linked to the idea first, marked, even with no shared style', () => {
    renderPlan({ ideas: [idea({ linkedArtists: ['ember'] })] })
    const links = within(card('Raven sleeve')).getAllByRole('link').filter((a) => a.getAttribute('href').startsWith('/gallery'))
    expect(links[0].getAttribute('href')).toMatch(/^\/gallery\?artist=ember/)
    expect(within(links[0]).getByText(/linked/i)).toBeInTheDocument()
    expect(links).toHaveLength(3)
  })

  it('marks an artist with a guest spot nearby soon', () => {
    renderPlan({ ideas: [idea({ tags: ['fine-line'] })] })
    const link = within(card('Raven sleeve')).getByRole('link', { name: /ember/i })
    expect(within(link).getByText(/london/i)).toBeInTheDocument()
  })

  it('opens a pinned artist at their Guest spots', () => {
    renderPlan({ ideas: [idea({ tags: ['fine-line'] })] })
    expect(within(card('Raven sleeve')).getByRole('link', { name: /ember/i })).toHaveAttribute('href', '/gallery?artist=ember#guest-spots')
  })

  it('does not ask for styles when the idea already has its artist', () => {
    renderPlan({ ideas: [idea({ tags: [], linkedArtists: ['dusk'] })] })
    const c = card('Raven sleeve')
    expect(within(c).getByRole('link', { name: /dusk/i })).toBeInTheDocument()
    expect(within(c).queryByText(/add styles to this idea/i)).toBeNull()
  })

  it('asks for styles when an idea has none', () => {
    renderPlan({ ideas: [idea({ tags: [] })] })
    const c = card('Raven sleeve')
    expect(within(c).getByText(/add styles to this idea/i)).toBeInTheDocument()
  })

  it('says so when no saved artist shares the idea’s styles', () => {
    renderPlan({ ideas: [idea({ tags: ['realism'] })] })
    expect(within(card('Raven sleeve')).getByText(/none of your artists share/i)).toBeInTheDocument()
  })

  it('offers to write an idea when there are artists but no open ideas', () => {
    renderPlan({ ideas: [idea({ status: 'done' })] })
    expect(screen.getByRole('link', { name: /write an idea/i })).toHaveAttribute('href', '/brief?new=1')
  })

  it('keeps Nearby soon below the ideas, and its radius drives the idea chips', () => {
    renderPlan({ ideas: [idea({ tags: ['fine-line'] })] })
    expect(screen.getByRole('heading', { name: /nearby soon/i })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /guest spots nearby soon/i })).toBeInTheDocument()
    expect(within(card('Raven sleeve')).getByRole('link', { name: /ember/i })).toHaveTextContent(/london/i)
    // London is 55 mi from Milton Keynes: narrowing to 50 drops it everywhere.
    fireEvent.change(screen.getByLabelText(/within/i), { target: { value: '50' } })
    expect(within(card('Raven sleeve')).getByRole('link', { name: /ember/i })).not.toHaveTextContent(/london/i)
  })

  it('shows empty note when artists have no rank history yet (#188)', () => {
    renderPlan()
    expect(screen.getByRole('heading', { level: 2, name: /your taste over time/i })).toBeInTheDocument()
    expect(screen.getByText(/no rank history yet/i)).toBeInTheDocument()
  })

  it('renders Taste over time with deterministic months and artist links (#188)', () => {
    const demoHistory = demoTasteHistory(TODAY)
    const demoArtists = DEMO_ARTISTS.map((a) => ({ ...a, history: demoHistory[a.id] }))

    render(
      <MemoryRouter initialEntries={['/plan']}>
        <Plan artists={demoArtists} ideas={[]} setArtists={vi.fn()} today={TODAY} />
      </MemoryRouter>
    )

    const tasteSection = screen.getByRole('region', { name: /your taste over time/i })
    expect(within(tasteSection).getByText('Top five by month')).toBeInTheDocument()
    expect(within(tasteSection).getByText('Biggest risers')).toBeInTheDocument()
    expect(within(tasteSection).getByText('Biggest fallers')).toBeInTheDocument()
    expect(within(tasteSection).getByText('Style share by month')).toBeInTheDocument()
    for (const label of ['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']) {
      expect(within(tasteSection).getAllByText(label)).toHaveLength(2)
    }
    expect(within(tasteSection).getByText('#4 → #1 (+3)')).toBeInTheDocument()

    const vesperLinks = within(tasteSection).getAllByRole('link', { name: /vesper ash/i })
    expect(vesperLinks.length).toBeGreaterThan(0)
    for (const link of vesperLinks) expect(link).toHaveAttribute('href', '/gallery?artist=vesper_noctis')

    const moraLinks = within(tasteSection).getAllByRole('link', { name: /mora vane/i })
    expect(moraLinks.length).toBeGreaterThan(0)
    for (const link of moraLinks) expect(link).toHaveAttribute('href', '/gallery?artist=mora.blackfern')
  })
})
