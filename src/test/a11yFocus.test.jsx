import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Brief from '../pages/Brief'
import FilmstripView from '../components/FilmstripView'

// #104 (SonarQube S9379): no autoFocus attribute. Focus moves when the user
// opens something (the WAI-ARIA dialog pattern), and only where typing is the
// next step: a *new* idea or board gets its title focused; opening an existing
// one to read it doesn't, since on iPhone that pops the keyboard over it.

const ideas = [
  { id: 'i1', title: 'Koru unfurling', tags: [], images: [], status: 'idea', placement: '', description: '', linkedArtists: [] },
]
const boards = [{ id: 'b1', name: 'Dark folklore', description: '', ideaIds: ['i1'] }]

function renderBrief(route = '/brief') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Brief ideas={ideas} setIdeas={vi.fn()} artists={[]} boards={boards} setBoards={vi.fn()} />
    </MemoryRouter>
  )
}

beforeEach(() => localStorage.clear())

describe('focus on open', () => {
  it('a new idea focuses its title', () => {
    renderBrief()
    fireEvent.click(screen.getByTitle('New idea'))
    expect(screen.getByPlaceholderText('Idea title…')).toHaveFocus()
  })

  it('opening an existing idea does not focus the title', () => {
    renderBrief()
    fireEvent.click(screen.getByRole('button', { name: /koru unfurling/i }))
    expect(screen.getByPlaceholderText('Idea title…')).not.toHaveFocus()
  })

  it('a new board focuses its name; an existing one does not', () => {
    renderBrief('/brief?tab=boards')
    fireEvent.click(screen.getByTitle('New board'))
    expect(screen.getByPlaceholderText('Board name…')).toHaveFocus()
  })

  it('opening an existing board does not focus its name', () => {
    renderBrief('/brief?tab=boards')
    fireEvent.click(screen.getByRole('button', { name: /dark folklore/i }))
    expect(screen.getByPlaceholderText('Board name…')).not.toHaveFocus()
  })

  it('tapping the filmstrip rank focuses the rank input it opens', () => {
    const artist = { id: 'zoia.ink', handle: 'zoia.ink', name: 'Zoia', tags: [], images: [], rank: 3, status: 'researching', notes: '', studio: null }
    render(<FilmstripView artists={[artist]} onOpenArtist={vi.fn()} onSetRank={vi.fn()} onSetStatus={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^#?3$/ }))
    expect(screen.getByRole('spinbutton')).toHaveFocus()
  })
})
