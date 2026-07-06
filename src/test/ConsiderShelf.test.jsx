import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConsiderShelf from '../components/ConsiderShelf'

const artists = [
  { id: 'a1', handle: 'a1', tags: ['blackwork', 'dark-illustrative'] },
]
const pool = [
  { handle: 'kamilczapiga', name: 'Kamil Czapiga', tags: ['blackwork', 'dark-illustrative'], note: 'Stark black symbolism' },
  { handle: 'oscar.hove', name: 'Oscar Hove', tags: ['surrealism', 'fine-line'], note: 'Abstract surreal linework' },
]

describe('ConsiderShelf', () => {
  it('shows only style-matched suggestions with name, note and an Instagram verify link', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText('Kamil Czapiga')).toBeInTheDocument()
    expect(screen.queryByText('Oscar Hove')).toBeNull() // zero style overlap
    const link = screen.getByRole('link', { name: /@kamilczapiga/i })
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/kamilczapiga/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('fires onAdd with the suggestion', () => {
    const onAdd = vi.fn()
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ handle: 'kamilczapiga' }))
  })

  it('fires onDismiss with the handle', () => {
    const onDismiss = vi.fn()
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={onDismiss} onAdd={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /not for me/i }))
    expect(onDismiss).toHaveBeenCalledWith('kamilczapiga')
  })

  it('respects the dismissed list', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={['kamilczapiga']} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.queryByText('Kamil Czapiga')).toBeNull()
  })

  it('renders nothing at all when there are no matches', () => {
    const { container } = render(
      <ConsiderShelf artists={[]} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })
})
