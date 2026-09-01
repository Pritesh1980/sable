import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import RankingMode from '../components/RankingMode'

const artist = {
  id: 'zoia.ink',
  handle: 'zoia.ink',
  name: 'Zoia',
  tags: ['dark-illustrative', 'fine-line'],
  images: ['images/artists/zoia.ink/1.jpg', 'images/artists/zoia.ink/2.jpg', 'images/artists/zoia.ink/3.jpg'],
  rank: 1,
  studio: 'no-regrets-worcester',
  status: 'researching',
}

const second = {
  id: 'tolgatemirlenk',
  handle: 'tolgatemirlenk.ink',
  name: '',
  tags: ['surrealism'],
  images: ['images/artists/tolgatemirlenk/1.jpg'],
  rank: 2,
  studio: null,
  status: 'researching',
}

function touch(el, type, clientX, clientY = 0) {
  fireEvent[type](el, { touches: [{ clientX, clientY }], changedTouches: [{ clientX, clientY }] })
}

function renderMode(artists = [artist, second], props = {}) {
  const onClose = vi.fn()
  const onApplyRanking = vi.fn()
  render(<RankingMode artists={artists} onClose={onClose} onApplyRanking={onApplyRanking} {...props} />)
  return { onClose, onApplyRanking }
}

describe('RankingMode — image row', () => {
  it('shows a horizontal row of ALL the current artist images, not just the first', () => {
    renderMode()
    const images = screen.getAllByRole('img', { name: 'Zoia' })
    expect(images).toHaveLength(3)
  })

  it('renders name, handle, studio, and tags for the current artist', () => {
    renderMode()
    expect(screen.getByText('Zoia')).toBeInTheDocument()
    expect(screen.getByText('@zoia.ink')).toBeInTheDocument()
    expect(screen.getByText(/no regrets/i)).toBeInTheDocument()
    expect(screen.getByText('dark-illustrative')).toBeInTheDocument()
    expect(screen.getByText('fine-line')).toBeInTheDocument()
  })
})

describe('RankingMode — touch gesture region split', () => {
  it('a drag starting on an image-row tile scrolls instead of deciding', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      expect(screen.getByText('1 / 2')).toBeInTheDocument()

      const [tile] = screen.getAllByRole('img', { name: 'Zoia' })
      touch(tile, 'touchStart', 200)
      touch(tile, 'touchMove', 320)
      touch(tile, 'touchEnd', 320)
      act(() => { vi.advanceTimersByTime(300) })

      // No decision recorded — still on the first artist, even after the
      // decide() transition's own timeout would have fired.
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a drag starting elsewhere on the card still swipes to decide', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      const card = screen.getByText('Zoia').closest('div')
      touch(card, 'touchStart', 200)
      touch(card, 'touchMove', 320)
      touch(card, 'touchEnd', 320)
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('onTouchCancel clears in-progress drag state so the next gesture starts fresh', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      const card = screen.getByText('Zoia').closest('div')

      // Cancel mid-drag — if the start-position ref weren't reset, the next
      // gesture's delta would be computed from this stale start point.
      touch(card, 'touchStart', 200)
      touch(card, 'touchMove', 320)
      fireEvent.touchCancel(card, { changedTouches: [{ clientX: 320, clientY: 0 }] })
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('1 / 2')).toBeInTheDocument()

      // A fresh, independent gesture right after still decides normally.
      touch(card, 'touchStart', 200)
      touch(card, 'touchMove', 320)
      touch(card, 'touchEnd', 320)
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RankingMode — unchanged behavior', () => {
  it('ArrowRight decides Top via keyboard, unaffected by the layout change', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Undo reverses the last decision', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
      fireEvent.click(screen.getByText(/undo/i))
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
