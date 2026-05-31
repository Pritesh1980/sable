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
