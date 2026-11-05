import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArtistDetail from '../components/ArtistDetail'

const baseArtist = {
  id: 'zoia.ink',
  handle: 'zoia.ink',
  name: '',
  tags: ['dark-illustrative'],
  images: [],
  rank: 1,
  studio: null,
  status: 'researching',
  notes: '',
}
const noop = () => {}
const NOTE = 'Surreal dark-illustrative linework dissolving into negative space.'

describe('ArtistDetail styleNote', () => {
  it('shows the styleNote when present', () => {
    render(<ArtistDetail artist={{ ...baseArtist, styleNote: NOTE }} onClose={noop} onSave={noop} />)
    expect(screen.getByText(NOTE)).toBeTruthy()
  })

  it('renders no style line when styleNote is absent', () => {
    render(<ArtistDetail artist={baseArtist} onClose={noop} onSave={noop} />)
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})

// #171: the Radar cards say when an edition has passed; the artist's
// "Attending conventions" list showed the same old dates with no note.
describe('ArtistDetail attending conventions', () => {
  const past = { id: 'old', name: 'Old Show', dates: '1–2 Mar 2020', endDate: '2020-03-02', url: 'https://example.com/old', distanceMiles: 40 }
  const upcoming = { id: 'new', name: 'New Show', dates: '1–2 Mar 2099', endDate: '2099-03-02', url: 'https://example.com/new', distanceMiles: 0 }

  it('marks an edition that has passed, and only that one', () => {
    render(<ArtistDetail artist={baseArtist} onClose={noop} onSave={noop} attendingConventions={[past, upcoming]} />)
    const oldLink = screen.getByRole('link', { name: /Old Show/ })
    const newLink = screen.getByRole('link', { name: /New Show/ })
    expect(oldLink).toHaveTextContent(/edition has passed/i)
    expect(newLink).not.toHaveTextContent(/passed/i)
    expect(newLink).toHaveTextContent('1–2 Mar 2099')
  })
})

// #178: past editions are history, listed apart from the shows ahead.
describe('ArtistDetail convention history', () => {
  const attended = {
    id: 'big-london', editionKey: 'big-london@2026', year: 2026, name: 'Big London Tattoo Show',
    label: 'Big London Tattoo Show 2026', dates: '4–6 September 2026', endDate: '2026-09-06',
    url: 'https://example.com/bl', distanceMiles: 55,
  }

  it('lists editions the artist was at under their own heading, by year', () => {
    render(<ArtistDetail artist={baseArtist} onClose={noop} onSave={noop} attendedConventions={[attended]} />)
    expect(screen.getByText(/^attended$/i)).toBeInTheDocument()
    expect(screen.getByText('Big London Tattoo Show 2026')).toBeInTheDocument()
    expect(screen.queryByText(/attending conventions/i)).toBeNull()
  })

  it('shows nothing when there is no history', () => {
    render(<ArtistDetail artist={baseArtist} onClose={noop} onSave={noop} />)
    expect(screen.queryByText(/^attended$/i)).toBeNull()
  })
})
