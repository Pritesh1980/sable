import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
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

// Opens past the intro (#220 F) unless `{ start: false }`.
function renderMode(artists = [artist, second], props = {}, { start = true } = {}) {
  const onClose = vi.fn()
  const onApplyRanking = vi.fn()
  render(<RankingMode artists={artists} onClose={onClose} onApplyRanking={onApplyRanking} {...props} />)
  if (start) fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  return { onClose, onApplyRanking }
}

function decideAll(keys) {
  for (const key of keys) {
    fireEvent.keyDown(window, { key })
    act(() => { vi.advanceTimersByTime(300) })
  }
}

// #220 F: "Not quite sure what I'm ranking here and what it affects."
describe('RankingMode — intro', () => {
  it('opens on an intro that says what the order is for, before any card', () => {
    renderMode(undefined, undefined, { start: false })
    const dialog = screen.getByRole('dialog', { name: 'Rank artists' })
    expect(dialog).toHaveTextContent(/order you.d most like to be tattooed by them/i)
    expect(dialog).toHaveTextContent(/top 5/i)
    expect(dialog).toHaveTextContent(/plan/i)
    expect(dialog).toHaveTextContent(/taste/i)
    expect(dialog).toHaveTextContent(/pass doesn.t remove anyone/i)
    expect(dialog).toHaveTextContent(/2 artists with photos/i)
    expect(screen.queryByText('1 / 2')).not.toBeInTheDocument()
  })

  it('says the other ways to reorder change the same list', () => {
    renderMode(undefined, undefined, { start: false })
    expect(screen.getByRole('dialog')).toHaveTextContent(/same list/i)
  })

  it('ignores decision keys until Start', () => {
    vi.useFakeTimers()
    try {
      renderMode(undefined, undefined, { start: false })
      decideAll(['ArrowRight'])
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Cancel on the intro closes without changing anything', () => {
    const { onClose, onApplyRanking } = renderMode(undefined, undefined, { start: false })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApplyRanking).not.toHaveBeenCalled()
  })

  it('keeps focus on the dialog after Start', () => {
    renderMode()
    expect(screen.getByRole('dialog', { name: 'Rank artists' })).toHaveFocus()
  })
})

describe('RankingMode — summary', () => {
  it('names what each group does and saves with "Save this order"', () => {
    vi.useFakeTimers()
    try {
      const { onApplyRanking, onClose } = renderMode()
      decideAll(['ArrowLeft', 'ArrowRight'])
      const dialog = screen.getByRole('dialog', { name: 'Ranking complete' })
      expect(dialog).toHaveTextContent(/top · moved up/i)
      expect(dialog).toHaveTextContent(/pass · moved down/i)
      expect(dialog).not.toHaveTextContent(/tier/i)
      expect(dialog).toHaveTextContent(/nothing changes until you save/i)
      fireEvent.click(screen.getByRole('button', { name: 'Save this order' }))
      expect(onApplyRanking).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('previews the new top 5 with each artist\'s old and new place', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      decideAll(['ArrowLeft', 'ArrowRight'])
      const preview = screen.getByRole('list', { name: 'Your new top 5' })
      const rows = within(preview).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent('@tolgatemirlenk.ink')
      expect(rows[0]).toHaveTextContent(/was #2/)
      expect(rows[1]).toHaveTextContent('Zoia')
      expect(rows[1]).toHaveTextContent(/was #1/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('marks a row whose place did not change', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      decideAll(['ArrowRight', 'ArrowLeft'])
      const rows = within(screen.getByRole('list', { name: 'Your new top 5' })).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent(/no change/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Discard closes without saving', () => {
    vi.useFakeTimers()
    try {
      const { onApplyRanking, onClose } = renderMode()
      decideAll(['ArrowLeft', 'ArrowRight'])
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(onApplyRanking).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

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

// #171: the swipe-compare screen hadn't had the dialog pass RankBoard got in
// #169 — no dialog role, focus left on the gallery, and every key heard by it
// even with another dialog stacked on top.
describe('RankingMode — dialog semantics', () => {
  it('is a modal dialog named "Rank artists", and takes focus', () => {
    renderMode()
    const dialog = screen.getByRole('dialog', { name: 'Rank artists' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
  })

  it('closes on Escape and marks it handled', () => {
    const { onClose } = renderMode()
    const unhandled = fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(unhandled).toBe(false)
  })

  it('ignores an Escape another layer already handled', () => {
    const { onClose } = renderMode()
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    document.dispatchEvent(event)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves every key to a dialog stacked above it', () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      render(
        <>
          <RankingMode artists={[artist, second]} onClose={onClose} onApplyRanking={vi.fn()} />
          <div role="dialog" aria-modal="true" aria-label="Above" />
        </>
      )
      fireEvent.click(screen.getByRole('button', { name: 'Start' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      fireEvent.keyDown(document, { key: 'ArrowRight' })
      act(() => { vi.advanceTimersByTime(500) })
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays one focused dialog on the summary, where undo keys do nothing', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      for (const key of ['ArrowRight', 'ArrowLeft']) {
        fireEvent.keyDown(document, { key })
        act(() => { vi.advanceTimersByTime(300) })
      }
      const dialog = screen.getByRole('dialog', { name: 'Ranking complete' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveFocus()
      fireEvent.keyDown(document, { key: 'z' })
      expect(screen.getByText(/2 artists/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives Cancel and Undo a 44px touch target', () => {
    vi.useFakeTimers()
    try {
      renderMode()
      fireEvent.keyDown(document, { key: 'ArrowRight' })
      act(() => { vi.advanceTimersByTime(300) })
      for (const name of [/^cancel$/i, /undo/i]) {
        expect(screen.getByRole('button', { name }).className).toMatch(/\bmin-h-11\b/)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('sits above the bottom nav (z-50), which covered its buttons on a phone', () => {
    renderMode()
    expect(screen.getByRole('dialog', { name: 'Rank artists' }).className).toMatch(/(^|\s)z-\[60\](\s|$)/)
  })
})
