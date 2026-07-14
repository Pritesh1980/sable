import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Logo from '../components/Logo'

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname}</output>
}

describe('Logo', () => {
  it('returns to the Home wall when activated', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Logo />
        <LocationProbe />
      </MemoryRouter>
    )

    const homeLink = screen.getByRole('link', { name: 'Sable' })
    expect(homeLink).toHaveAttribute('href', '/')

    fireEvent.click(homeLink)

    expect(screen.getByRole('status', { name: 'Current route' })).toHaveTextContent('/')
  })
})
