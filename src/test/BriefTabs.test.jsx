import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

  it('opens a blank idea from ?new=1 (Home links here, #220)', async () => {
    renderBrief({ route: '/brief?new=1' })
    expect(await screen.findByRole('button', { name: '← Back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('defaults to the Ideas tab', () => {
    renderBrief()
    expect(screen.getByText('Koru unfurling')).toBeInTheDocument()
    expect(screen.queryByText('Dark folklore')).not.toBeInTheDocument()
  })

  it('shows and clears a saved placement without overwriting other idea edits', () => {
    const idea = { ...ideas[0], placement: 'wrist' }
    const setIdeas = vi.fn()
    renderBrief({ props: { ideas: [idea], setIdeas } })
    fireEvent.click(screen.getByText('Koru unfurling'))
    const picker = screen.getByRole('combobox', { name: 'Placement (optional)' })
    expect(picker).toHaveDisplayValue('Wrist')
    fireEvent.change(picker, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(setIdeas).toHaveBeenCalledOnce()
    const latest = { ...idea, title: 'Updated in another session' }
    expect(setIdeas.mock.calls[0][0]([latest])).toEqual([{ ...latest, placement: '' }])
  })

  it('shows a single option for a saved placement with different casing and preserves its stored value', () => {
    const idea = { ...ideas[0], placement: 'Forearm' }
    const setIdeas = vi.fn()
    renderBrief({ props: { ideas: [idea], setIdeas } })
    fireEvent.click(screen.getByText('Koru unfurling'))
    const picker = screen.getByRole('combobox', { name: 'Placement (optional)' })
    expect(within(picker).getAllByRole('option', { name: 'Forearm', exact: true })).toHaveLength(1)
    expect(picker).toHaveValue('forearm')

    fireEvent.change(screen.getByPlaceholderText('Idea title…'), { target: { value: 'Fern study' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(setIdeas.mock.calls[0][0]([idea])).toEqual([{ ...idea, title: 'Fern study' }])
  })

  it('shows selected styles and saves multiple changes made in the style picker', () => {
    const setIdeas = vi.fn()
    renderBrief({ props: { setIdeas } })
    fireEvent.click(screen.getByText('Koru unfurling'))
    const editor = within(screen.getByRole('button', { name: 'Save', exact: true }).closest('.fixed'))
    expect(editor.getByText('fine-line', { exact: true })).toBeVisible()
    expect(editor.queryByRole('button', { name: 'blackwork', exact: true })).not.toBeInTheDocument()
    const edit = screen.getByRole('button', { name: 'Edit styles' })
    expect(edit).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(edit)
    const picker = screen.getByRole('group', { name: 'Style tags' })
    expect(within(picker).getByRole('button', { name: 'fine-line' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(picker).getByRole('button', { name: 'fine-line' }))
    fireEvent.click(within(picker).getByRole('button', { name: 'blackwork' }))
    fireEvent.click(within(picker).getByRole('button', { name: 'realism' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done editing styles' }))
    expect(screen.queryByRole('group', { name: 'Style tags' })).not.toBeInTheDocument()
    expect(editor.getByText('blackwork', { exact: true })).toBeVisible()
    expect(editor.getByText('realism', { exact: true })).toBeVisible()
    expect(setIdeas).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(setIdeas.mock.calls[0][0](ideas)[0].tags).toEqual(['blackwork', 'realism'])
  })

  it('lets a restored custom tag be removed and keeps the choice until editing ends', () => {
    const idea = { ...ideas[0], tags: ['fine-line', 'dotwork'] }
    const setIdeas = vi.fn()
    renderBrief({ props: { ideas: [idea], setIdeas } })
    fireEvent.click(screen.getByText('Koru unfurling'))
    const save = screen.getByRole('button', { name: 'Save', exact: true })
    const editor = within(save.closest('.fixed'))
    expect(editor.getByText('dotwork', { exact: true })).toBeVisible()

    fireEvent.click(editor.getByRole('button', { name: 'Edit styles' }))
    const picker = within(editor.getByRole('group', { name: 'Style tags' }))
    const customTag = picker.getByRole('button', { name: 'dotwork' })
    expect(customTag).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(customTag)
    expect(picker.getByRole('button', { name: 'dotwork' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(editor.getByRole('button', { name: 'Done editing styles' }))
    expect(editor.queryByText('dotwork', { exact: true })).not.toBeInTheDocument()

    fireEvent.click(save)
    expect(setIdeas.mock.calls[0][0]([idea])[0].tags).toEqual(['fine-line'])
  })

  it('discloses generated demo references on Ideas and Boards', () => {
    renderBrief({ props: { ideas: [{ ...ideas[0], images: [{ url: 'images/demo/mora.blackfern/fern-v4.webp' }] }] } })
    expect(screen.getByText(/AI-generated imagery/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /boards/i }))
    expect(screen.getAllByText(/AI-generated imagery/)).not.toHaveLength(0)
  })

  it('shows the generated-art notice inside an idea editor with a demo reference', () => {
    renderBrief({ props: { ideas: [{ ...ideas[0], images: [{ url: 'images/demo/mora.blackfern/fern-v4.webp' }] }] } })
    fireEvent.click(screen.getByText('Koru unfurling'))
    expect(within(screen.getByRole('button', { name: '← Back' }).closest('.fixed')).getByText(/AI-generated imagery/)).toBeInTheDocument()
  })

  it('discloses an explicit demo Board cover without relying on idea images', () => {
    renderBrief({
      route: '/brief?tab=boards',
      props: { boards: [{ ...boards[0], cover: 'images/demo/mora.blackfern/fern-v4.webp' }] },
    })
    const board = screen.getByRole('button', { name: /Dark folklore/i })
    expect(within(board).getByText(/AI-generated imagery/)).toBeInTheDocument()
    fireEvent.click(board)
    expect(within(screen.getByRole('button', { name: '← Back' }).closest('.fixed')).getByText(/AI-generated imagery/)).toBeInTheDocument()
  })

  it('shows the generated-art notice inside a Board editor with a demo idea', () => {
    renderBrief({
      route: '/brief?tab=boards',
      props: { ideas: [{ ...ideas[0], images: [{ url: 'images/demo/mora.blackfern/fern-v4.webp' }] }] },
    })
    fireEvent.click(screen.getByRole('button', { name: /Dark folklore/i }))
    expect(within(screen.getByRole('button', { name: '← Back' }).closest('.fixed')).getByText(/AI-generated imagery/)).toBeInTheDocument()
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
