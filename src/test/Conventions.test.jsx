import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Conventions from '../pages/Conventions'
import Studios from '../pages/Studios'
import { CONVENTIONS } from '../data/conventions'

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1 },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 2 },
]

// The local (distanceMiles === 0) show renders as the hero card.
const localConv = CONVENTIONS.find((c) => c.distanceMiles === 0)

function heroCard() {
  return screen.getByRole('heading', { name: localConv.name }).closest('div.animate-slide-up')
}

function renderConventions(props = {}) {
  return render(
    <MemoryRouter>
      <Conventions
        artists={artists}
        conventionOverrides={{}}
        setConventionOverrides={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('Conventions attendance editor', () => {
  it('records an artist as attending via the per-convention editor', () => {
    const setConventionOverrides = vi.fn()
    renderConventions({ setConventionOverrides })

    const card = within(heroCard())
    fireEvent.click(card.getByRole('button', { name: 'Edit' }))
    fireEvent.click(card.getByRole('button', { name: 'Oscar Akermo' }))

    expect(setConventionOverrides).toHaveBeenCalledTimes(1)
    const next = setConventionOverrides.mock.calls[0][0]({})
    expect(next[localConv.id]).toEqual(['oscarakermo'])
  })

  it('summarises currently-attending artists without entering edit mode', () => {
    renderConventions({ conventionOverrides: { [localConv.id]: ['zoia.ink'] } })
    const card = within(heroCard())
    expect(card.getByText(/1 of your artists attending/i)).toBeInTheDocument()
    expect(card.getByText('@zoia.ink')).toBeInTheDocument()
  })

  it('still links out to the convention website', () => {
    renderConventions()
    const card = within(heroCard())
    expect(card.getByRole('link', { name: /more info/i })).toHaveAttribute('href', localConv.url)
  })

  // A convention's own domain can lapse and get repurposed after this list was
  // curated (it happened to london-international, Sept 2026) — the app must
  // not keep pointing users at whatever that domain now serves.
  it('has no More-info link for a convention with no url', () => {
    renderConventions({
      artists: [],
      conventionOverrides: {},
    })
    const noUrl = CONVENTIONS.find((c) => !c.url)
    expect(noUrl, 'fixture expects at least one convention with no url').toBeTruthy()
    const heading = screen.getByRole('heading', { name: noUrl.name })
    const card = within(heading.closest('div.animate-slide-up'))
    expect(card.queryByRole('link', { name: /more info/i })).toBeNull()
  })
})

// #160: the data holds the latest edition of shows that recur, so once that
// edition is over the card says so instead of presenting it as upcoming.
describe('Conventions past editions', () => {
  const bigLondonShow = CONVENTIONS.find((c) => c.id === 'big-london')
  const cardFor = (c) => within(screen.getByRole('heading', { name: c.name }).closest('div.animate-slide-up'))

  it('marks an edition whose last day has gone, keeping its dates', () => {
    renderConventions({ now: new Date(2026, 9, 29) })
    const card = cardFor(bigLondonShow)
    expect(card.getByText(bigLondonShow.dates)).toBeInTheDocument()
    expect(card.getByText(/this edition has passed/i)).toHaveTextContent(/next year/i)
    // The hero card too.
    expect(cardFor(localConv).getByText(/this edition has passed/i)).toBeInTheDocument()
  })

  it('does not mark an edition that is still to come', () => {
    renderConventions({ now: new Date(2026, 0, 1) })
    expect(cardFor(bigLondonShow).queryByText(/this edition has passed/i)).toBeNull()
  })

  it('keeps the distance ordering whether or not a show has passed', () => {
    const order = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    const { unmount } = renderConventions({ now: new Date(2026, 0, 1) })
    const before = order()
    unmount()
    renderConventions({ now: new Date(2026, 9, 29) })
    expect(order()).toEqual(before)
  })
})

// The Big London Tattoo Show publishes ~500 artists; the index makes that list
// workable from the page you plan the show on.
const bigLondon = CONVENTIONS.find((c) => c.id === 'big-london')

function bigLondonCard() {
  return screen.getByRole('heading', { name: bigLondon.name }).closest('div.animate-slide-up')
}

// Brighton ships no line-up, so it is where the from-empty import flow is
// exercised; Big London now arrives with its list already in place.
const brighton = CONVENTIONS.find((c) => c.id === 'brighton')

function brightonCard() {
  return screen.getByRole('heading', { name: brighton.name }).closest('div.animate-slide-up')
}

describe('Conventions artist index', () => {
  it('ships the Big London line-up, so there is nothing to import', () => {
    renderConventions()
    const card = within(bigLondonCard())
    expect(card.getByRole('button', { name: /artist index/i })).toHaveTextContent(/466 artists/)
  })

  it('imports a pasted line-up and indexes it against the gallery', () => {
    const setConventionLineups = vi.fn()
    renderConventions({ setConventionLineups })

    const card = within(brightonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.change(card.getByLabelText(/paste the line-up/i), {
      target: { value: 'Oscar Akermo @oscarakermo\nMartin Kubala @kubalizmus' },
    })
    fireEvent.click(card.getByRole('button', { name: /^import/i }))

    const next = setConventionLineups.mock.calls[0][0]({})
    expect(next.brighton.entries.map((e) => e.handle)).toEqual(['oscarakermo', 'kubalizmus'])
    expect(next.brighton.updatedAt).toEqual(expect.any(String))
  })

  it('merges a second import instead of dropping what was already there', () => {
    const setConventionLineups = vi.fn()
    renderConventions({
      setConventionLineups,
      conventionLineups: { brighton: { entries: [{ name: '', handle: 'oscarakermo', note: '' }] } },
    })

    const card = within(brightonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.click(card.getByRole('button', { name: /update list/i }))
    fireEvent.change(card.getByLabelText(/paste the line-up/i), { target: { value: '@kubalizmus' } })
    fireEvent.click(card.getByRole('button', { name: /^import/i }))

    const prev = { brighton: { entries: [{ name: '', handle: 'oscarakermo', note: '' }] } }
    const next = setConventionLineups.mock.calls[0][0](prev)
    expect(next.brighton.entries.map((e) => e.handle)).toEqual(['oscarakermo', 'kubalizmus'])
  })

  it('adds an artist from the index to the gallery and flags them attending', () => {
    const setArtists = vi.fn()
    const setConventionOverrides = vi.fn()
    renderConventions({
      setArtists,
      setConventionOverrides,
      conventionLineups: { brighton: { entries: [{ name: 'Martin Kubala', handle: 'kubalizmus', note: '' }] } },
    })

    const card = within(brightonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.click(within(card.getByTestId('lineup-row-kubalizmus')).getByRole('button', { name: /^add$/i }))

    const nextArtists = setArtists.mock.calls[0][0](artists)
    expect(nextArtists).toHaveLength(3)
    expect(nextArtists[2]).toMatchObject({ id: 'kubalizmus', handle: 'kubalizmus', name: 'Martin Kubala', status: 'researching' })
    expect(setConventionOverrides.mock.calls[0][0]({}).brighton).toEqual(['kubalizmus'])
  })

  it('imports a hand-off from the grabber and says what landed', () => {
    const setConventionLineups = vi.fn()
    window.location.hash = `#lineup=big-london&data=${encodeURIComponent('Ate Wamz @atewamz\n@kubalizmus')}`

    renderConventions({ setConventionLineups })

    const next = setConventionLineups.mock.calls[0][0]({})
    expect(next['big-london'].entries.map((e) => e.handle)).toEqual(['atewamz', 'kubalizmus'])
    expect(screen.getByRole('status')).toHaveTextContent(/imported 2 artists into big london/i)
    // …and a way straight to the card it landed in, which is well down the page.
    const jump = within(screen.getByRole('status')).getByRole('button', { name: /take me to it/i })
    const scrollIntoView = vi.fn()
    bigLondonCard().scrollIntoView = scrollIntoView
    fireEvent.click(jump)
    expect(scrollIntoView).toHaveBeenCalled()
    // The index for that show opens on arrival rather than making you hunt for it.
    // (The stored entries come back through props in the real app; here the
    // setter is a spy, so what this proves is that the card is expanded.)
    expect(within(bigLondonCard()).getByRole('button', { name: /artist index/i }))
      .toHaveAttribute('aria-expanded', 'true')
    // Cleared, so a reload does not import it a second time.
    expect(window.location.hash).toBe('')
  })

  it('ignores a hand-off for a convention it does not have', () => {
    const setConventionLineups = vi.fn()
    window.location.hash = `#lineup=not-a-show&data=${encodeURIComponent('@atewamz')}`

    renderConventions({ setConventionLineups })

    expect(setConventionLineups).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not re-add an artist already in the gallery', () => {
    const setArtists = vi.fn()
    renderConventions({
      setArtists,
      conventionLineups: { brighton: { entries: [{ name: 'Oscar Akermo', handle: 'oscarakermo', note: '' }] } },
    })

    const card = within(brightonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    const row = within(card.getByTestId('lineup-row-oscarakermo'))
    expect(row.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument()
    expect(row.getByText('#2')).toBeInTheDocument()
    expect(setArtists).not.toHaveBeenCalled()
  })
})

// Studios has no spec of its own; it shares this guide section (docs/05) and
// this page-test pattern, so it lives here. #161.
describe('Studios page', () => {
  function renderStudios(studioArtists) {
    return render(
      <MemoryRouter>
        <Studios artists={studioArtists} />
      </MemoryRouter>
    )
  }

  function studioCard(name) {
    return within(screen.getByRole('heading', { name }).closest('div.animate-slide-up'))
  }

  it('counts one artist as "1 of your artists here"', () => {
    renderStudios([{ id: 'berkbosveren', handle: 'berkbosveren', name: '', studio: 'london-glitch', rank: 9 }])
    const card = studioCard('London Glitch')
    expect(card.getByText('1 of your artists here')).toBeInTheDocument()
    expect(card.queryByText(/of your artist here/)).toBeNull()
  })

  it('counts several artists the same way', () => {
    renderStudios([
      { id: 'a', handle: 'a.ink', name: '', studio: 'london-glitch', rank: 1 },
      { id: 'b', handle: 'b.ink', name: '', studio: 'london-glitch', rank: 2 },
    ])
    expect(studioCard('London Glitch').getByText('2 of your artists here')).toBeInTheDocument()
  })

  it('shows an artist’s name on the chip when there is one, keeping the handle on the link', () => {
    renderStudios([
      { id: 'carlosvalera', handle: 'carl245tattoo', name: 'Carlos Valera', studio: 'london-glitch', rank: 5 },
      { id: 'berkbosveren', handle: 'berkbosveren', name: '', studio: 'london-glitch', rank: 9 },
    ])
    const card = studioCard('London Glitch')
    const named = card.getByRole('link', { name: /carlos valera/i })
    expect(named).toHaveAttribute('href', 'https://instagram.com/carl245tattoo')
    // Secondary text, not just a title: iPhone never shows a title tooltip.
    expect(within(named).getByText('Carlos Valera')).toBeInTheDocument()
    expect(within(named).getByText('@carl245tattoo')).toBeInTheDocument()
    // No name saved: the handle is all there is to show.
    expect(card.getByRole('link', { name: /@berkbosveren/ })).toHaveAttribute('href', 'https://instagram.com/berkbosveren')
  })
})
