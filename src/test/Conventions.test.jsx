import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
