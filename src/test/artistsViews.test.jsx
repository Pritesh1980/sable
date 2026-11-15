import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'
import FilmstripView from '../components/FilmstripView'
import CompareView from '../components/CompareView'
import RankRail from '../components/RankRail'

// Group E of #220: the Artists views give photos the room, and the header says
// what its controls do.

const IMG = 'images/demo/mora.blackfern/fern-v4.webp'
const artists = [
  { id: 'a', handle: 'ana_ink', name: 'Ana', tags: ['surrealism'], images: [IMG], rank: 1, status: 'shortlisted', notes: '', studio: null },
  { id: 'b', handle: 'ben_ink', name: 'Ben', tags: ['fine-line'], images: [IMG], rank: 2, status: 'researching', notes: '', studio: null },
  { id: 'c', handle: 'cleo_ink', name: 'Cleo', tags: ['blackwork'], images: [IMG], rank: 3, status: 'researching', notes: '', studio: null },
]

function renderGallery(props = {}) {
  render(
    <MemoryRouter initialEntries={['/gallery']}>
      <Gallery artists={artists} setArtists={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

beforeEach(() => localStorage.clear())

describe('Artists header', () => {
  it('names each view in words', () => {
    renderGallery()
    for (const [name, word] of [['Wall view', 'Wall'], ['Filmstrip view', 'Strip'], ['Compare artists', 'Compare'], ['Grid view', 'Grid']]) {
      expect(screen.getByRole('button', { name })).toHaveTextContent(word)
    }
  })

  it('keeps the tools in one Tools menu, each with a line saying what it does', () => {
    renderGallery()
    expect(screen.queryByRole('menuitem', { name: 'Rank' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Tools' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    for (const name of ['Rank', 'Browse', 'Map', 'Manage']) {
      expect(within(menu).getByRole('menuitem', { name })).toHaveAccessibleDescription(/\w+ \w+/)
    }
  })

  it('closes the menu on Escape and when a tool is picked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage' }))
    expect(screen.queryByRole('menu')).toBeNull()
    // Managing swaps the menu for one obvious way back.
    fireEvent.click(screen.getByRole('button', { name: 'Done managing' }))
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument()
  })

  it('hands focus back to Tools before a tool opens, and closes on Escape from the trigger', () => {
    renderGallery()
    const tools = screen.getByRole('button', { name: 'Tools' })
    fireEvent.click(tools)
    tools.focus()
    fireEvent.keyDown(tools, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(tools)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Manage' }))
    expect(document.activeElement === tools || !document.body.contains(tools)).toBe(true)
  })

  it('leaves + Add outside the menu', () => {
    renderGallery()
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
  })
})

describe('Artists style filter', () => {
  it('is hidden until Filter is tapped', () => {
    renderGallery()
    expect(screen.queryByRole('button', { name: 'blackwork' })).toBeNull()
    const filter = screen.getByRole('button', { name: 'Filter' })
    expect(filter).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(filter)
    expect(screen.getByRole('button', { name: 'blackwork' })).toBeInTheDocument()
  })

  it('shows an active filter as a chip that clears it', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Filmstrip view' }))
    expect(screen.getAllByTestId('filmstrip-row')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'blackwork' }))
    // Picking a style closes the row and leaves the chip.
    expect(screen.queryByRole('button', { name: 'fine-line' })).toBeNull()
    expect(screen.getAllByTestId('filmstrip-row')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter: blackwork' }))
    expect(screen.getAllByTestId('filmstrip-row')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
  })

  it('lets the chip reopen the styles to pick another', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'blackwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change filter: blackwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'fine-line' }))
    expect(screen.getByRole('button', { name: 'Clear filter: fine-line' })).toBeInTheDocument()
  })

  it('names the grid reorder switch in words, with the grid', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }))
    const toggle = screen.getByRole('button', { name: 'Reorder and add photos' })
    expect(toggle).toHaveTextContent('Reorder')
    expect(toggle.parentElement.contains(screen.getByRole('button', { name: 'Grid view' }))).toBe(false)
  })
})

describe('Filmstrip rows', () => {
  function renderStrip() {
    render(<FilmstripView artists={artists} onOpenArtist={() => {}} onSetRank={() => {}} onSetStatus={() => {}} />)
    return screen.getAllByTestId('filmstrip-row')[0]
  }

  it('stack a thin title line over the photos', () => {
    const row = renderStrip()
    expect(row.className).toMatch(/flex-col/)
    expect(within(row).getByRole('heading')).toHaveTextContent('Ana')
    expect(within(row).getByText('Shortlisted')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Move Ana down' })).toBeInTheDocument()
  })

  it('leave the handle and style tags to the artist page', () => {
    const row = renderStrip()
    expect(within(row).queryByText('@ana_ink')).toBeNull()
    expect(within(row).queryByText('surrealism')).toBeNull()
  })

  it('show large photos', () => {
    const row = renderStrip()
    const photo = within(row).getByTestId('filmstrip-photo')
    expect(photo.className).toMatch(/\bw-44\b/)
    expect(photo.className).not.toMatch(/\bw-24\b/)
  })
})

describe('Compare columns', () => {
  function pick(name) {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(name) }).at(-1))
  }

  it('show the name and one column of photos, without handle or tags', () => {
    render(<CompareView artists={artists} onOpenArtist={() => {}} />)
    pick('Ana')
    const column = screen.getByTestId('compare-column')
    expect(within(column).getByRole('heading')).toHaveTextContent('Ana')
    expect(within(column).queryByText('@ana_ink')).toBeNull()
    expect(within(column).queryByText('surrealism')).toBeNull()
    expect(within(column).getByTestId('compare-photos').className).not.toMatch(/grid-cols-2/)
    expect(within(column).getByRole('button', { name: 'Remove Ana from comparison' })).toBeInTheDocument()
    // The name and every photo open the artist.
    expect(within(column).getAllByRole('button', { name: 'Open Ana' })).toHaveLength(2)
  })

  it('compare two on a phone: no third slot once two are picked', () => {
    // jsdom has no matchMedia, so this is the phone case.
    render(<CompareView artists={artists} onOpenArtist={() => {}} />)
    pick('Ana')
    pick('Ben')
    expect(screen.getAllByTestId('compare-column')).toHaveLength(2)
    expect(screen.queryByPlaceholderText(/search|add/i)).toBeNull()
  })
})

describe('Top 5 rail', () => {
  it('names its board button for what it does, not a second "Rank"', () => {
    const onOpenBoard = vi.fn()
    render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={onOpenBoard} />)
    expect(screen.queryByRole('button', { name: /^rank/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /reorder top 5/i }))
    expect(onOpenBoard).toHaveBeenCalled()
  })
})
