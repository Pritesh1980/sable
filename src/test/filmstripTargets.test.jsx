import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FilmstripView from '../components/FilmstripView'

// #76: the audit (npm run audit:targets) measured the @handle link at 79-106
// wide but only 17 tall — a real browser measurement; jsdom has no layout, so
// this only asserts the declared min-height that produces it.
function declaresMinHeight44(className) {
  return /(?:^|\s)min-h-11(?![\w-])/.test(className)
}

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: [], images: [], rank: 1, status: 'researching', notes: '', studio: null },
]

describe('FilmstripView touch targets (#76)', () => {
  it('gives the @handle link a 44pt-tall hit area', () => {
    render(<FilmstripView artists={artists} onOpenArtist={vi.fn()} onSetRank={vi.fn()} onSetStatus={vi.fn()} />)
    const link = screen.getByRole('link', { name: /@zoia\.ink/i })
    expect(declaresMinHeight44(link.className)).toBe(true)
  })

  it('still opens Instagram in a new tab, unchanged by the larger hit area', () => {
    render(<FilmstripView artists={artists} onOpenArtist={vi.fn()} onSetRank={vi.fn()} onSetStatus={vi.fn()} />)
    const link = screen.getByRole('link', { name: /@zoia\.ink/i })
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/zoia.ink/')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
