import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Top5Hero from '../components/Top5Hero'

const ARTISTS = [
  { id: 'a', rank: 1, handle: 'zoia.ink', status: 'researching', images: ['a.jpg'] },
  { id: 'b', rank: 2, handle: 'keremtattz', status: 'researching', images: ['b.jpg'] },
  { id: 'c', rank: 3, name: 'Carlos Valera', status: 'shortlisted', images: [] },
]
const BENCH = [{ id: 'd', rank: 4, handle: 'gody_tattoo', status: 'researching', images: [] }]

const renderHero = (props) =>
  render(
    <MemoryRouter>
      <Top5Hero artists={ARTISTS} bench={BENCH} {...props} />
    </MemoryRouter>,
  )

describe('Top5Hero (static fallback path)', () => {
  it('shows every top artist with its rank', () => {
    renderHero()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/Focus Carlos Valera \(rank 3\)/)).toBeInTheDocument()
  })

  it('drops the focused artist out via the callback', () => {
    const onDropOut = vi.fn()
    renderHero({ onDropOut })
    fireEvent.click(screen.getByLabelText(/Move @zoia.ink out of your top 5/))
    expect(onDropOut).toHaveBeenCalledWith('a')
  })

  it('drop-out follows the focused card after selecting another', () => {
    const onDropOut = vi.fn()
    renderHero({ onDropOut })
    fireEvent.click(screen.getByLabelText(/Focus Carlos Valera \(rank 3\)/))
    fireEvent.click(screen.getByLabelText(/out of your top 5/))
    expect(onDropOut).toHaveBeenCalledWith('c')
  })

  it('pulls a bench artist in via the callback', () => {
    const onPullIn = vi.fn()
    renderHero({ onPullIn })
    fireEvent.click(screen.getByLabelText(/Move @gody_tattoo into your top 5/))
    expect(onPullIn).toHaveBeenCalledWith('d')
  })

  it('prompts to rank when there are no top artists', () => {
    render(
      <MemoryRouter>
        <Top5Hero artists={[]} bench={[]} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/top five/i)).toBeInTheDocument()
  })
})
