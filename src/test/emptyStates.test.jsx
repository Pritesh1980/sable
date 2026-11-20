import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Home from '../pages/Home'
import Brief from '../pages/Brief'
import Concepts from '../pages/Concepts'
import Plan from '../pages/Plan'
import SampleArtistNotice from '../components/SampleArtistNotice'
import { AuthProvider } from '../context/AuthContext'
import { addSampleArtist } from '../data/sampleArtist'

// Group C of #220: an empty page says what the thing is, shows an example of a
// filled one, and gives one way to start.

const wrap = (ui, route = '/') => render(<AuthProvider><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></AuthProvider>)

describe('empty pages (#220, group C)', () => {
  beforeEach(() => localStorage.clear())

  describe('Ideas', () => {
    const renderBrief = (props = {}) => wrap(
      <Brief ideas={[]} setIdeas={vi.fn()} artists={[]} boards={[]} setBoards={vi.fn()} {...props} />, '/brief')

    it('defines an idea and a board, and offers one way to start', () => {
      renderBrief()
      expect(screen.getByText(/an idea is a tattoo you want/i)).toBeInTheDocument()
      expect(screen.getByText(/a board groups ideas/i)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /write your first idea/i }))
      expect(screen.getByRole('button', { name: '← Back' })).toBeInTheDocument()
    })

    it('shows a labelled example that cannot be opened or saved', () => {
      const setIdeas = vi.fn()
      renderBrief({ setIdeas })
      const example = screen.getByRole('figure', { name: /example/i })
      expect(within(example).getByText(/not saved/i)).toBeInTheDocument()
      expect(within(example).queryByRole('button')).toBeNull()
      expect(within(example).queryByRole('link')).toBeNull()
      expect(setIdeas).not.toHaveBeenCalled()
    })

    it('drops the example once there is a real idea', () => {
      renderBrief({ ideas: [{ id: 'i1', title: 'Fern sleeve', status: 'idea', tags: [], images: [], linkedArtists: [] }] })
      expect(screen.queryByRole('figure', { name: /example/i })).toBeNull()
      expect(screen.queryByText(/an idea is a tattoo you want/i)).toBeNull()
    })

    it('defines a board on the empty Boards tab', () => {
      wrap(<Brief ideas={[]} setIdeas={vi.fn()} artists={[]} boards={[]} setBoards={vi.fn()} />, '/brief?tab=boards')
      expect(screen.getByText(/a board groups ideas/i)).toBeInTheDocument()
    })
  })

  describe('AI concepts', () => {
    const renderConcepts = (concepts = []) => wrap(
      <Concepts concepts={concepts} setConcepts={vi.fn()} artists={[]} ideas={[]} />, '/concepts')

    it('defines a concept and opens the composer from its button', () => {
      renderConcepts()
      expect(screen.getByText(/a concept is a picture of an idea/i)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /make your first concept/i }))
      expect(screen.getByLabelText(/your idea/i)).toBeInTheDocument()
    })

    it('shows a labelled example: the words you write and the picture you get', () => {
      renderConcepts()
      const example = screen.getByRole('figure', { name: /example/i })
      expect(within(example).getByText(/you write/i)).toBeInTheDocument()
      expect(within(example).getByRole('img')).toHaveAttribute('src', expect.stringContaining('images/demo/'))
      expect(within(example).queryByRole('button')).toBeNull()
    })

    it('drops the example once a concept exists', () => {
      renderConcepts([{ id: '1', prompt: 'A raven', imageUrl: '/img/raven.png', tags: [] }])
      expect(screen.queryByRole('figure', { name: /example/i })).toBeNull()
    })
  })

  describe('Plan', () => {
    const renderPipeline = (props = {}) => wrap(
      <Plan artists={[]} ideas={[]} setArtists={vi.fn()} {...props} />, '/plan')

    it('replaces the zero panels with a three-step checklist', () => {
      renderPipeline()
      const steps = within(screen.getByRole('list', { name: /getting started/i })).getAllByRole('listitem')
      expect(steps).toHaveLength(3)
      expect(steps[0]).toHaveAttribute('aria-current', 'step')
      expect(within(steps[0]).getByRole('link', { name: /add an artist/i })).toHaveAttribute('href', '/gallery?add=1')
      expect(steps[1]).not.toHaveAttribute('aria-current')
      expect(screen.queryByText('Top 5')).toBeNull()
      expect(screen.queryByText(/contact next/i)).toBeNull()
      expect(screen.queryByText(/active ideas/i)).toBeNull()
    })

    it('ticks the idea step when an idea already exists', () => {
      renderPipeline({ ideas: [{ id: 'i1', title: 'Fern', status: 'idea', tags: [], linkedArtists: [] }] })
      const steps = within(screen.getByRole('list', { name: /getting started/i })).getAllByRole('listitem')
      expect(within(steps[2]).getByText(/done/i)).toBeInTheDocument()
    })

    it('offers the sample artist from step one', () => {
      const setArtists = vi.fn()
      renderPipeline({ setArtists })
      fireEvent.click(screen.getByRole('button', { name: /add a sample artist/i }))
      expect(setArtists.mock.calls[0][0]([])[0].sample).toBe(true)
    })

    it('marks the sample on the plan it fills, with the way out', () => {
      const setArtists = vi.fn()
      const artists = addSampleArtist([])
      renderPipeline({ artists, setArtists })
      fireEvent.click(within(screen.getByRole('note', { name: /sample artist/i })).getByRole('button', { name: /remove sample/i }))
      expect(setArtists.mock.calls[0][0](artists)).toEqual([])
    })

    it('drops the checklist once an artist exists', () => {
      renderPipeline({ artists: [{ id: 'a', handle: 'a', name: '', tags: [], images: [], rank: 1 }] })
      expect(screen.queryByRole('list', { name: /getting started/i })).toBeNull()
      expect(screen.getByRole('link', { name: /write an idea/i })).toBeInTheDocument()
    })
  })

  describe('sample artist', () => {
    it('is offered on empty Home and added through setArtists', () => {
      const setArtists = vi.fn()
      wrap(<Home artists={[]} ideas={[]} concepts={[]} setArtists={setArtists} />)
      fireEvent.click(screen.getByRole('button', { name: /add a sample artist/i }))
      const next = setArtists.mock.calls[0][0]([])
      expect(next).toHaveLength(1)
      expect(next[0]).toMatchObject({ sample: true, name: 'Vesper Ash' })
    })

    it('is marked on Home while it is in the library, and leaves in one tap', () => {
      const setArtists = vi.fn()
      const artists = addSampleArtist([{ id: 'a', handle: 'a_ink', name: '', rank: 1, tags: [], images: [] }])
      wrap(<Home artists={artists} ideas={[]} concepts={[]} setArtists={setArtists} />)
      const notice = screen.getByRole('note', { name: /sample artist/i })
      fireEvent.click(within(notice).getByRole('button', { name: /remove sample/i }))
      expect(setArtists.mock.calls[0][0](artists).map((a) => a.id)).toEqual(['a'])
    })

    it('shows no notice without a sample', () => {
      const { container } = render(<SampleArtistNotice artists={[{ id: 'a', handle: 'a' }]} setArtists={vi.fn()} />)
      expect(container).toBeEmptyDOMElement()
    })
  })
})
