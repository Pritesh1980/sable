import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Conventions from '../pages/Conventions'
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
})

// The Big London Tattoo Show publishes ~500 artists; the index makes that list
// workable from the page you plan the show on.
const bigLondon = CONVENTIONS.find((c) => c.id === 'big-london')

function bigLondonCard() {
  return screen.getByRole('heading', { name: bigLondon.name }).closest('div.animate-slide-up')
}

describe('Conventions artist index', () => {
  it('imports a pasted line-up and indexes it against the gallery', () => {
    const setConventionLineups = vi.fn()
    renderConventions({ setConventionLineups })

    const card = within(bigLondonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.change(card.getByLabelText(/paste the line-up/i), {
      target: { value: 'Oscar Akermo @oscarakermo\nMartin Kubala @kubalizmus' },
    })
    fireEvent.click(card.getByRole('button', { name: /^import/i }))

    const next = setConventionLineups.mock.calls[0][0]({})
    expect(next['big-london'].entries.map((e) => e.handle)).toEqual(['oscarakermo', 'kubalizmus'])
    expect(next['big-london'].updatedAt).toEqual(expect.any(String))
  })

  it('merges a second import instead of dropping what was already there', () => {
    const setConventionLineups = vi.fn()
    renderConventions({
      setConventionLineups,
      conventionLineups: { 'big-london': { entries: [{ name: '', handle: 'oscarakermo', note: '' }] } },
    })

    const card = within(bigLondonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.click(card.getByRole('button', { name: /update list/i }))
    fireEvent.change(card.getByLabelText(/paste the line-up/i), { target: { value: '@kubalizmus' } })
    fireEvent.click(card.getByRole('button', { name: /^import/i }))

    const prev = { 'big-london': { entries: [{ name: '', handle: 'oscarakermo', note: '' }] } }
    const next = setConventionLineups.mock.calls[0][0](prev)
    expect(next['big-london'].entries.map((e) => e.handle)).toEqual(['oscarakermo', 'kubalizmus'])
  })

  it('adds an artist from the index to the gallery and flags them attending', () => {
    const setArtists = vi.fn()
    const setConventionOverrides = vi.fn()
    renderConventions({
      setArtists,
      setConventionOverrides,
      conventionLineups: { 'big-london': { entries: [{ name: 'Martin Kubala', handle: 'kubalizmus', note: '' }] } },
    })

    const card = within(bigLondonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    fireEvent.click(within(card.getByTestId('lineup-row-kubalizmus')).getByRole('button', { name: /^add$/i }))

    const nextArtists = setArtists.mock.calls[0][0](artists)
    expect(nextArtists).toHaveLength(3)
    expect(nextArtists[2]).toMatchObject({ id: 'kubalizmus', handle: 'kubalizmus', name: 'Martin Kubala', status: 'researching' })
    expect(setConventionOverrides.mock.calls[0][0]({})['big-london']).toEqual(['kubalizmus'])
  })

  it('does not re-add an artist already in the gallery', () => {
    const setArtists = vi.fn()
    renderConventions({
      setArtists,
      conventionLineups: { 'big-london': { entries: [{ name: 'Oscar Akermo', handle: 'oscarakermo', note: '' }] } },
    })

    const card = within(bigLondonCard())
    fireEvent.click(card.getByRole('button', { name: /artist index/i }))
    const row = within(card.getByTestId('lineup-row-oscarakermo'))
    expect(row.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument()
    expect(row.getByText('#2')).toBeInTheDocument()
    expect(setArtists).not.toHaveBeenCalled()
  })
})
