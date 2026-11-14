import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Nav from '../components/Nav'
import { PRIMARY_LINKS, MORE_GROUPS } from '../data/navLinks'

function renderNav(initialEntries = ['/gallery']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Nav />
    </MemoryRouter>
  )
}
const openMore = () => fireEvent.click(screen.getByRole('button', { name: 'More' }))

// #220 (A): one navigation, the same list on every page. It used to be a bottom
// bar everywhere except Home, which had its own top bar and a slide-over menu
// holding a different list.
describe('Nav', () => {
  beforeEach(() => localStorage.clear())

  it('shows the four primary destinations, named in words', () => {
    renderNav()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/gallery', '/brief', '/concepts'])
    ;['Home', 'Artists', 'Ideas', 'AI'].forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    })
  })

  it('is the same on Home as on every other page', () => {
    renderNav(['/'])
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href')))
      .toEqual(['/', '/gallery', '/brief', '/concepts'])
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('groups everything else under More: Plan, then App', () => {
    renderNav()
    openMore()
    const menu = screen.getByRole('dialog', { name: 'More' })
    const plan = within(menu).getByRole('group', { name: 'Plan' })
    const app = within(menu).getByRole('group', { name: 'App' })
    expect(within(plan).getAllByRole('link').map((l) => l.getAttribute('href')))
      .toEqual(['/pipeline', '/conventions', '/studios'])
    expect(within(app).getAllByRole('link').map((l) => l.getAttribute('href')))
      .toEqual(['/settings', '/help'])
    expect(within(plan).getByText('Conventions near you')).toBeInTheDocument()
  })

  it('reaches every page from one list, with no page listed twice', () => {
    const all = [...PRIMARY_LINKS, ...MORE_GROUPS.flatMap((g) => g.links)].map((l) => l.to)
    expect(new Set(all).size).toBe(all.length)
    expect(all.sort()).toEqual(
      ['/', '/brief', '/concepts', '/conventions', '/gallery', '/help', '/pipeline', '/settings', '/studios'],
    )
  })

  it('draws every destination with an icon from the one icon set, hidden from screen readers', () => {
    renderNav()
    openMore()
    const items = [...screen.getAllByRole('link'), screen.getByRole('button', { name: 'More' })]
    items.forEach((item) => {
      const icon = item.querySelector('svg')
      expect(icon, item.textContent).not.toBeNull()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })

  it('marks More as the current place when the page lives inside it', () => {
    renderNav(['/studios'])
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('data-current', 'true')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    openMore()
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /Studios/ })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the current place with more than a colour change', () => {
    renderNav(['/brief'])
    expect(screen.getByRole('link', { name: 'Ideas' }).className).toMatch(/border-accent/)
    expect(screen.getByRole('link', { name: 'Artists' }).className).toMatch(/border-transparent/)
  })

  it('moves focus into More when it opens', () => {
    renderNav()
    openMore()
    expect(screen.getByRole('dialog', { name: 'More' }).contains(document.activeElement)).toBe(true)
  })

  it('closes More after picking a page', () => {
    renderNav()
    openMore()
    fireEvent.click(screen.getByRole('link', { name: /Help/ }))
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull()
  })

  it('has no links to retired routes', () => {
    renderNav()
    openMore()
    expect(screen.queryByText('Manage')).not.toBeInTheDocument()
    expect(screen.queryByText('Boards')).not.toBeInTheDocument()
    expect(screen.queryByText('Classic gallery')).not.toBeInTheDocument()
  })

  // The A+, theme and sign-out chips were three unlabelled circles at the end of
  // the bar. They live in Settings now.
  it('holds only destinations: no text-size, theme or sign-out controls', () => {
    renderNav()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByTitle(/font size|switch to|sign out/i)).toBeNull()
  })
})
