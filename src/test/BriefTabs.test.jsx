import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Brief from '../pages/Brief'

const ideas = [
  { id: 'i1', title: 'Koru unfurling', tags: ['fine-line'], images: [], status: 'idea', placement: '', description: '', linkedArtists: [] },
  { id: 'i2', title: 'Wild hunt', tags: ['blackwork'], images: [], status: 'idea', placement: '', description: '', linkedArtists: [] },
]
const boards = [
  { id: 'b1', name: 'Dark folklore', description: 'First arm', ideaIds: ['i1', 'i2'] },
]

function renderBrief({ route = '/brief', setBoards = vi.fn(), props = {} } = {}) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Brief
        ideas={ideas}
        setIdeas={vi.fn()}
        artists={[]}
        boards={boards}
        setBoards={setBoards}
        {...props}
      />
    </MemoryRouter>
  )
  return { setBoards }
}

describe('Brief Ideas | Boards tabs', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to the Ideas tab', () => {
    renderBrief()
    expect(screen.getByText('Koru unfurling')).toBeInTheDocument()
    expect(screen.queryByText('Dark folklore')).not.toBeInTheDocument()
  })

  it('switches to Boards and back', () => {
    renderBrief()
    fireEvent.click(screen.getByRole('button', { name: /boards \(1\)/i }))
    expect(screen.getByText('Dark folklore')).toBeInTheDocument()
    expect(screen.queryByText('Koru unfurling')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ideas \(2\)/i }))
    expect(screen.getByText('Koru unfurling')).toBeInTheDocument()
  })

  it('opens the Boards tab from a ?tab=boards deep link', () => {
    renderBrief({ route: '/brief?tab=boards' })
    expect(screen.getByText('Dark folklore')).toBeInTheDocument()
  })

  it('creates a board with the unchanged synced payload shape', () => {
    const { setBoards } = renderBrief({ route: '/brief?tab=boards' })

    fireEvent.click(screen.getByTitle('New board'))
    fireEvent.change(screen.getByPlaceholderText('Board name…'), { target: { value: 'Second pass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(setBoards).toHaveBeenCalledTimes(1)
    const next = setBoards.mock.calls[0][0](boards)
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ name: 'Second pass', description: '', ideaIds: [] })
    expect(typeof next[1].id).toBe('string')
  })
})
