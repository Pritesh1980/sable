import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Conventions from '../pages/Conventions'
import { CONVENTIONS } from '../data/conventions'
import { clearWinnerPhotos, putPhoto } from '../data/winnerPhotos'

const ROOT = process.cwd()

const artists = [
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 2 },
]

const localConv = CONVENTIONS.find((c) => c.distanceMiles === 0)

function heroCard() {
  return screen.getByRole('heading', { name: localConv.name }).closest('div.animate-slide-up')
}

function renderConventions(props = {}) {
  return render(
    <MemoryRouter>
      <Conventions
        artists={artists}
        setArtists={vi.fn()}
        conventionOverrides={{}}
        setConventionOverrides={vi.fn()}
        conventionWinners={{}}
        setConventionWinners={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

const winners = {
  [localConv.id]: {
    entries: [
      { category: 'Best of Show', placing: 1, name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
      { category: 'Best Colour', placing: 1, name: 'Martin Kubala', handle: 'kubalizmus', note: '' },
    ],
    updatedAt: '2026-03-15T18:00:00.000Z',
  },
}

describe('Conventions page — winners section', () => {
  it('puts a winners section on every convention card', () => {
    renderConventions()
    expect(screen.getAllByRole('button', { name: /competition winners/i })).toHaveLength(CONVENTIONS.length)
  })

  it('shows the winners stored for that convention', () => {
    renderConventions({ conventionWinners: winners })
    const card = within(heroCard())
    expect(card.getByRole('button', { name: /competition winners/i })).toHaveTextContent(/2 winners/i)
  })

  it('keeps one convention’s results out of another’s', () => {
    renderConventions({ conventionWinners: winners })
    const others = screen
      .getAllByRole('button', { name: /competition winners/i })
      .filter((b) => !b.textContent.match(/2 winners/i))
    expect(others).toHaveLength(CONVENTIONS.length - 1)
    others.forEach((b) => expect(b).toHaveTextContent(/not imported/i))
  })

  it('merges an import into the stored results for that convention', () => {
    const setConventionWinners = vi.fn()
    renderConventions({ setConventionWinners })
    const card = within(heroCard())
    fireEvent.click(card.getByRole('button', { name: /competition winners/i }))
    fireEvent.change(card.getByLabelText(/paste the results/i), {
      target: { value: 'Best of Show\n1st - Oscar Akermo @oscarakermo' },
    })
    fireEvent.click(card.getByRole('button', { name: /^import$/i }))

    expect(setConventionWinners).toHaveBeenCalledTimes(1)
    const next = setConventionWinners.mock.calls[0][0]({})
    expect(next[localConv.id].entries).toHaveLength(1)
    expect(next[localConv.id].entries[0]).toMatchObject({ handle: 'oscarakermo', placing: 1 })
    expect(next[localConv.id].cleared).toBe(false)
  })

  it('records a clear rather than deleting, so “Clear results” stays honest', () => {
    const setConventionWinners = vi.fn()
    renderConventions({ conventionWinners: winners, setConventionWinners })
    const card = within(heroCard())
    fireEvent.click(card.getByRole('button', { name: /competition winners/i }))
    fireEvent.click(card.getByRole('button', { name: /clear results/i }))

    const next = setConventionWinners.mock.calls[0][0](winners)
    expect(next[localConv.id]).toMatchObject({ entries: [], cleared: true })
  })

  it('adds a winner to the gallery and flags them as attending in one tap', () => {
    const setArtists = vi.fn()
    const setConventionOverrides = vi.fn()
    renderConventions({
      conventionWinners: winners,
      setArtists,
      setConventionOverrides,
    })
    const card = within(heroCard())
    fireEvent.click(card.getByRole('button', { name: /competition winners/i }))
    const row = card.getByTestId('winner-row-kubalizmus')
    fireEvent.click(within(row).getByRole('button', { name: /^add$/i }))

    expect(setArtists).toHaveBeenCalled()
    expect(setConventionOverrides).toHaveBeenCalled()
  })

  // The component hands the page a winner key and a photo id; the page is what
  // has to land it on the right row of the right convention. Removing an
  // existing photo drives that same handler without needing a file input.
  it('drops a removed photo id from the right winner of the right convention', async () => {
    await clearWinnerPhotos()
    await putPhoto('p1', 'data:image/jpeg;base64,AAA')
    const setConventionWinners = vi.fn()
    const withPhoto = {
      [localConv.id]: {
        ...winners[localConv.id],
        entries: [
          { ...winners[localConv.id].entries[0], photoIds: ['p1'] },
          winners[localConv.id].entries[1],
        ],
      },
    }
    renderConventions({ conventionWinners: withPhoto, setConventionWinners })
    const card = within(heroCard())
    fireEvent.click(card.getByRole('button', { name: /competition winners/i }))
    fireEvent.click(await card.findByRole('button', { name: /remove photo of oscar akermo/i }))

    const next = setConventionWinners.mock.calls[0][0](withPhoto)
    expect(next[localConv.id].entries[0].photoIds).toEqual([])
    // The other winner, and every other convention, are untouched.
    expect(next[localConv.id].entries[1].photoIds).toBeUndefined()
    expect(Object.keys(next)).toEqual([localConv.id])
  })

  // The whole point of the store: image bytes must not share the ~5MB origin
  // quota with the gallery's offline cache. Comments may discuss localStorage;
  // the code must never call it.
  it('keeps the winner photo bytes out of localStorage entirely', () => {
    const source = readFileSync(join(ROOT, 'src/data/winnerPhotos.js'), 'utf8')
      .replace(/\/\/[^\n]*/g, '')
    expect(source).not.toMatch(/localStorage\s*[.[]/)
    expect(source).toContain('indexedDB.open')
  })
})

describe('convention winners stay device-local', () => {
  it('is not registered as a sync collection', () => {
    const sync = readFileSync(join(ROOT, 'src/backend/sync.js'), 'utf8')
    expect(sync).not.toContain('tattoo_convention_winners')
  })

  it('is wired into the app under its own storage key', () => {
    const app = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8')
    expect(app).toContain("useStorage('tattoo_convention_winners'")
  })

  it('is purged with the rest of the local data on sign-out', () => {
    const purge = readFileSync(join(ROOT, 'src/backend/purge.js'), 'utf8')
    expect(purge).toContain('tattoo_convention_winners')
  })
})
