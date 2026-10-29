import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ShowPlanView from '../components/ShowPlanView'

const convention = { id: 'big-london', name: 'Big London Tattoo Show' }

const entries = [
  { name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
  { name: 'Studio Mate', handle: 'studiomate', note: 'No Regrets Studios, Booth 61' },
  { name: 'Nobody Known', handle: 'nobody', note: 'Some Parlour, Booth 900' },
]

const artists = [
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 3, studio: 'no-regrets-london' },
]

const studios = [{ id: 'no-regrets-london', name: 'No Regrets London' }]

function renderView(props = {}) {
  return render(
    <ShowPlanView
      convention={convention}
      entries={entries}
      artists={artists}
      studios={studios}
      attendingIds={[]}
      onAddArtist={vi.fn()}
      onToggleAttending={vi.fn()}
      {...props}
    />
  )
}

describe('ShowPlanView', () => {
  it('sections a saved artist under Must see and a studio stablemate under Worth a look', () => {
    renderView()
    const mustSee = screen.getByRole('heading', { name: /must see/i }).closest('section')
    expect(within(mustSee).getByText('Oscar Akermo')).toBeInTheDocument()

    const worthALook = screen.getByRole('heading', { name: /worth a look/i }).closest('section')
    expect(within(worthALook).getByText('Studio Mate')).toBeInTheDocument()
  })

  it('gives each pick a one-line reason', () => {
    renderView()
    const row = screen.getByTestId('lineup-row-oscarakermo')
    expect(within(row).getByText(/#3 in your ranking/i)).toBeInTheDocument()
  })

  it('leaves a stranger with no gallery or studio connection out of both sections', () => {
    renderView()
    expect(screen.queryByText('Nobody Known')).not.toBeInTheDocument()
  })

  // #160: the curated list ships to everyone; a pick the user never saved must
  // not sit under a heading that says it is already in their gallery.
  it('gives curated priority picks outside the gallery their own section', () => {
    const curated = {
      nobody: { tier: 'priority', why: 'Benchmark booth' },
      ghost: { tier: 'priority', why: 'Never turned up' },
    }
    renderView({ curated })
    const mustSee = screen.getByRole('heading', { name: /must see/i }).closest('section')
    expect(within(mustSee).queryByText('Nobody Known')).not.toBeInTheDocument()

    const guide = screen.getByRole('heading', { name: /from the field guide/i }).closest('section')
    expect(within(guide).getByText('Nobody Known')).toBeInTheDocument()
    expect(within(guide).getByText(/benchmark booth/i)).toBeInTheDocument()
    expect(guide).toHaveTextContent(/not in your gallery yet/i)
    expect(guide).not.toHaveTextContent(/already in your gallery/i)

    // A pick missing from the line-up is not claimed as the user's either.
    const missing = screen.getByRole('heading', { name: /not in the line-up/i }).closest('section')
    expect(missing).not.toHaveTextContent(/your shortlist/i)
  })

  it('shows the field guide even when nothing in the gallery is at the show', () => {
    renderView({ artists: [], curated: { nobody: { tier: 'priority', why: 'Benchmark booth' } } })
    expect(screen.queryByRole('heading', { name: /must see/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /from the field guide/i })).toBeInTheDocument()
  })

  it('says so when there is nothing to pick from yet', () => {
    renderView({ entries: [] })
    expect(screen.getByText(/no picks yet/i)).toBeInTheDocument()
  })
})
