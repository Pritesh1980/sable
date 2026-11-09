import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import NearbySoon from '../components/NearbySoon'
import Dashboard from '../pages/Dashboard'
import { todayIso } from '../data/guestSpots'

const TODAY = '2027-01-15'
const ARTISTS = [
  { id: 'a1', handle: 'vesper_noctis', name: 'Vesper Ash', status: 'shortlisted', rank: 1, tags: [], guestSpots: [
    { id: 's1', city: 'London', studio: 'Black Iris', startDate: '2027-02-12', endDate: '2027-02-14', notes: 'DM to book' },
    { id: 's2', city: 'Manchester', studio: '', startDate: '2027-02-20', endDate: '2027-02-21' },
  ] },
  { id: 'a2', handle: 'mora.blackfern', status: 'researching', rank: 2, tags: [], guestSpots: [
    { id: 's3', city: 'Lisbon', studio: '', startDate: '2027-01-20', endDate: '2027-01-21' },
  ] },
]

const renderPanel = (props = {}) => render(
  <MemoryRouter><NearbySoon artists={ARTISTS} today={TODAY} {...props} /></MemoryRouter>,
)

beforeEach(() => localStorage.removeItem('tattoo_nearby_radius'))

describe('NearbySoon', () => {
  it('lists spots within 100 miles in the next 90 days, linking to the artist', () => {
    renderPanel()
    const list = screen.getByRole('list', { name: 'Guest spots nearby soon' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Vesper Ash')
    expect(rows[0]).toHaveTextContent('London')
    expect(rows[0]).toHaveTextContent('12–14 Feb 2027')
    expect(rows[0]).toHaveTextContent('55 mi')
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/gallery?artist=a1#guest-spots')
    expect(rows[0]).toHaveTextContent('DM to book')
  })

  it('widens to the chosen radius and remembers it on this device', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('Within'), { target: { value: '200' } })
    expect(within(screen.getByRole('list', { name: 'Guest spots nearby soon' })).getAllByRole('listitem')).toHaveLength(2)
    expect(localStorage.getItem('tattoo_nearby_radius')).toBe('200')
  })

  it('shows a short empty state', () => {
    renderPanel({ artists: [] })
    expect(screen.getByText(/No guest spots within 100 mi/i)).toBeInTheDocument()
  })

  it('compact mode is one line: the soonest spot, then a count linking to Pipeline', () => {
    localStorage.setItem('tattoo_nearby_radius', '200')
    renderPanel({ compact: true })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveTextContent('Vesper Ash')
    expect(links[0]).toHaveTextContent('London')
    expect(links[0]).toHaveAttribute('href', '/gallery?artist=a1#guest-spots')
    expect(links[1]).toHaveTextContent('+1 more')
    expect(links[1]).toHaveAttribute('href', '/pipeline')
    expect(screen.getAllByText(/Nearby soon/i)).toHaveLength(1)
  })

  it('renders nothing in compact mode when there is nothing nearby', () => {
    const { container } = renderPanel({ artists: [], compact: true })
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Pipeline shows Nearby soon', () => {
  it('renders the panel from real dates', () => {
    const today = todayIso()
    const [y, m, d] = today.split('-').map(Number)
    const inAWeek = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
    const artists = [{ ...ARTISTS[0], guestSpots: [{ id: 's9', city: 'Oxford', studio: '', startDate: inAWeek, endDate: inAWeek }] }]
    render(<MemoryRouter><Dashboard artists={artists} ideas={[]} boards={[]} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Nearby soon' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Guest spots nearby soon' })).getByText('Oxford')).toBeInTheDocument()
  })
})
