import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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

// Walking order (#190): the same picks over the floor plan.
describe('ShowPlanView walking order', () => {
  const routeEntries = [
    { name: 'Oscar Akermo', handle: 'oscarakermo', note: 'Own Studio, Booth 2' },
    { name: 'Guide Pick', handle: 'guidepick', note: 'Elsewhere, Booth 1' },
    { name: 'Studio Mate', handle: 'studiomate', note: 'No Regrets Studios, Booth 3' },
    { name: 'Tent Pick', handle: 'tentpick', note: 'Marquee, Booth T9' },
  ]
  const curated = { guidepick: { tier: 'priority', why: 'Seen in person' }, tentpick: { tier: 'priority', why: 'Tent' } }
  const floorplan = { aspect: 1, entrance: [1, 1], booths: { 1: [0.9, 1], 2: [0.1, 1], 3: [0.12, 1] } }
  const walk = (props = {}) => renderView({ entries: routeEntries, curated, floorplan, ...props })

  it('offers no walking order without a floor plan', () => {
    renderView({ entries: routeEntries, curated })
    expect(screen.queryByRole('button', { name: /walking order/i })).toBeNull()
  })

  it('lists the picks from the entrance across the floor, with pickups and the unplaced booths', () => {
    walk()
    fireEvent.click(screen.getByRole('button', { name: /walking order/i }))
    expect(screen.getByText(/ordered across the floor from the entrance/i)).toBeInTheDocument()

    const route = screen.getByRole('list', { name: /route/i })
    const stops = within(route).getAllByTestId('lineup-label').map((el) => el.textContent)
    expect(stops).toEqual(['Guide Pick', 'Oscar Akermo'])
    expect(within(route).getByText(/^Stop 1 · Booth 1 · Seen in person$/)).toBeInTheDocument()
    expect(within(route).getByText(/close by: studio mate, booth 3/i)).toBeInTheDocument()

    const elsewhere = screen.getByRole('heading', { name: /elsewhere in the hall/i }).closest('section')
    expect(within(elsewhere).getByText('Tent Pick')).toBeInTheDocument()
  })

  it('copies the route as text for Notes', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    walk()
    fireEvent.click(screen.getByRole('button', { name: /walking order/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy route/i }))
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
    expect(writeText.mock.calls[0][0]).toMatch(/^Big London Tattoo Show: route\n/)
    expect(writeText.mock.calls[0][0]).toContain('1. Booth 1 · Guide Pick (@guidepick)')
  })

  it('shows the text to select by hand when the clipboard is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    walk()
    fireEvent.click(screen.getByRole('button', { name: /walking order/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy route/i }))
    const box = await screen.findByRole('textbox', { name: /route/i })
    expect(box.value).toContain('Elsewhere in the hall')
  })

  it('goes back to the ranked sections', () => {
    walk()
    fireEvent.click(screen.getByRole('button', { name: /walking order/i }))
    fireEvent.click(screen.getByRole('button', { name: /ranked/i }))
    expect(screen.getByRole('heading', { name: /must see/i })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /route/i })).toBeNull()
  })
})
