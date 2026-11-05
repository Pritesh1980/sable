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

// A fixed clock: which edition a card opens on depends on the date (#178).
// 5 Nov 2026 — every 2026 edition is over, every 2027 one is still to come.
const NOV_2026 = new Date(2026, 10, 5)

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
        now={NOV_2026}
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
    expect(next[`${localConv.id}@2027`]).toEqual(['oscarakermo'])
  })

  it('summarises currently-attending artists without entering edit mode', () => {
    renderConventions({ conventionOverrides: { [`${localConv.id}@2027`]: ['zoia.ink'] } })
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

// #160: once the latest edition in the data is over, the card says so instead
// of presenting it as upcoming.
describe('Conventions past editions', () => {
  const bigLondonShow = CONVENTIONS.find((c) => c.id === 'big-london')
  const latest = (c) => c.editions[c.editions.length - 1]
  const cardFor = (c) => within(screen.getByRole('heading', { name: c.name }).closest('div.animate-slide-up'))

  it('marks an edition whose last day has gone, keeping its dates', () => {
    renderConventions({ now: new Date(2027, 9, 29) })
    const card = cardFor(bigLondonShow)
    expect(card.getByText(latest(bigLondonShow).dates)).toBeInTheDocument()
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
    renderConventions({ now: new Date(2027, 9, 29) })
    expect(order()).toEqual(before)
  })
})

// #178: a card opens on the next edition; the one before is a tap away, as a
// record of who was there rather than a claim about who is coming.
describe('Conventions editions', () => {
  const bigLondonShow = CONVENTIONS.find((c) => c.id === 'big-london')
  const edition = (c, year) => c.editions.find((e) => e.year === year)
  const cardFor = (c) => within(screen.getByRole('heading', { name: c.name }).closest('div.animate-slide-up'))

  it('opens on the 2027 edition once 2026 is over', () => {
    renderConventions()
    const card = cardFor(bigLondonShow)
    expect(card.getByText(edition(bigLondonShow, 2027).dates)).toBeInTheDocument()
    expect(card.queryByText(edition(bigLondonShow, 2026).dates)).toBeNull()
    expect(card.getByRole('button', { name: /2027/ })).toHaveAttribute('aria-pressed', 'true')
    expect(card.queryByText(/this edition has passed/i)).toBeNull()
  })

  it('does not show 2026 attendees as coming in 2027', () => {
    const merged = { 'big-london': ['zoia.ink'] }
    renderConventions({ conventionOverrides: merged })
    expect(cardFor(bigLondonShow).queryByText(/of your artists attend/i)).toBeNull()
  })

  it('switches to the 2026 edition, worded as a record of who was there', () => {
    renderConventions({ conventionOverrides: { 'big-london': ['zoia.ink'] } })
    const card = cardFor(bigLondonShow)
    fireEvent.click(card.getByRole('button', { name: /2026/ }))
    expect(card.getByRole('button', { name: /2026/ })).toHaveAttribute('aria-pressed', 'true')
    expect(card.getByText(edition(bigLondonShow, 2026).dates)).toBeInTheDocument()
    expect(card.getByText(/1 of your artists attended/i)).toBeInTheDocument()
    expect(card.getByText(/past edition/i)).toBeInTheDocument()
  })

  it('writes attendance to the edition on screen', () => {
    const setConventionOverrides = vi.fn()
    renderConventions({ setConventionOverrides })
    const card = cardFor(bigLondonShow)
    fireEvent.click(card.getByRole('button', { name: /2026/ }))
    fireEvent.click(card.getByRole('button', { name: 'Edit' }))
    fireEvent.click(card.getByRole('button', { name: 'Oscar Akermo' }))
    const next = setConventionOverrides.mock.calls[0][0]({})
    expect(Object.keys(next)).toEqual(['big-london@2026'])
    expect(next['big-london@2026']).toContain('oscarakermo')
  })

  it('says when dates come from a listing rather than the show itself', () => {
    const freeze = CONVENTIONS.find((c) => c.id === 'tattoo-freeze')
    expect(edition(freeze, 2027).unconfirmed).toBe(true)
    renderConventions()
    expect(cardFor(freeze).getByText(/not yet confirmed/i)).toBeInTheDocument()
    expect(cardFor(bigLondonShow).queryByText(/not yet confirmed/i)).toBeNull()
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
  it('ships the Big London 2026 line-up, so there is nothing to import', () => {
    renderConventions()
    const card = within(bigLondonCard())
    fireEvent.click(card.getByRole('button', { name: /2026/ }))
    expect(card.getByRole('button', { name: /artist index/i })).toHaveTextContent(/466 artists/)
  })

  it('does not offer the 2026 exhibitors as the 2027 line-up', () => {
    renderConventions()
    const card = within(bigLondonCard())
    expect(card.getByRole('button', { name: /artist index/i })).not.toHaveTextContent(/466 artists/)
  })

  it('keeps a line-up imported before editions existed on the 2026 edition', () => {
    renderConventions({ conventionLineups: { brighton: { entries: [{ name: 'Martin Kubala', handle: 'kubalizmus', note: '' }] } } })
    const card = within(brightonCard())
    expect(card.getByRole('button', { name: /artist index/i })).not.toHaveTextContent(/1 artist/)
    fireEvent.click(card.getByRole('button', { name: /2026/ }))
    expect(card.getByRole('button', { name: /artist index/i })).toHaveTextContent(/1 artist/)
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
    expect(next['brighton@2027'].entries.map((e) => e.handle)).toEqual(['oscarakermo', 'kubalizmus'])
    expect(next['brighton@2027'].updatedAt).toEqual(expect.any(String))
  })

  it('merges a second import instead of dropping what was already there', () => {
    const setConventionLineups = vi.fn()
    renderConventions({
      setConventionLineups,
      conventionLineups: { 'brighton@2027': { entries: [{ name: '', handle: 'oscarakermo', note: '' }] } },
    })

    const card = within(brightonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.click(card.getByRole('button', { name: /update list/i }))
    fireEvent.change(card.getByLabelText(/paste the line-up/i), { target: { value: '@kubalizmus' } })
    fireEvent.click(card.getByRole('button', { name: /^import/i }))

    const prev = { 'brighton@2027': { entries: [{ name: '', handle: 'oscarakermo', note: '' }] } }
    const next = setConventionLineups.mock.calls[0][0](prev)
    expect(next['brighton@2027'].entries.map((e) => e.handle)).toEqual(['oscarakermo', 'kubalizmus'])
  })

  it('adds an artist from the index to the gallery and flags them attending', () => {
    const setArtists = vi.fn()
    const setConventionOverrides = vi.fn()
    renderConventions({
      setArtists,
      setConventionOverrides,
      conventionLineups: { 'brighton@2027': { entries: [{ name: 'Martin Kubala', handle: 'kubalizmus', note: '' }] } },
    })

    const card = within(brightonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.click(within(card.getByTestId('lineup-row-kubalizmus')).getByRole('button', { name: /^add$/i }))

    const nextArtists = setArtists.mock.calls[0][0](artists)
    expect(nextArtists).toHaveLength(3)
    expect(nextArtists[2]).toMatchObject({ id: 'kubalizmus', handle: 'kubalizmus', name: 'Martin Kubala', status: 'researching' })
    expect(setConventionOverrides.mock.calls[0][0]({})['brighton@2027']).toEqual(['kubalizmus'])
  })

  it('imports a hand-off from the grabber and says what landed', () => {
    const setConventionLineups = vi.fn()
    window.location.hash = `#lineup=big-london&data=${encodeURIComponent('Ate Wamz @atewamz\n@kubalizmus')}`

    renderConventions({ setConventionLineups })

    // The show's page publishes the coming line-up, so that is where it lands.
    const next = setConventionLineups.mock.calls[0][0]({})
    expect(next['big-london@2027'].entries.map((e) => e.handle)).toEqual(['atewamz', 'kubalizmus'])
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
      conventionLineups: { 'brighton@2027': { entries: [{ name: 'Oscar Akermo', handle: 'oscarakermo', note: '' }] } },
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
