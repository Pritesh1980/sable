import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import UndoToast from '../components/UndoToast'

describe('UndoToast', () => {
  it('shows nothing when there is nothing to undo', () => {
    const { container } = render(<UndoToast message="Photo removed" show={false} onUndo={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('announces the removal and offers undo', () => {
    render(<UndoToast message="Photo removed" show onUndo={() => {}} />)

    expect(screen.getByText('Photo removed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('is announced to assistive tech without stealing focus', () => {
    render(<UndoToast message="Photo removed" show onUndo={() => {}} />)

    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(document.activeElement).toBe(document.body)
  })

  it('calls back when undo is pressed', () => {
    const onUndo = vi.fn()
    render(<UndoToast message="Photo removed" show onUndo={onUndo} />)

    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('gives undo a touch-sized target', () => {
    render(<UndoToast message="Photo removed" show onUndo={() => {}} />)

    // 44pt minimum — this is the one control the whole toast exists to offer.
    expect(screen.getByRole('button', { name: /undo/i }).className).toMatch(/min-h-11/)
  })

  it('clears the bottom nav so it cannot sit under it', () => {
    render(<UndoToast message="Photo removed" show onUndo={() => {}} />)

    // Nav is fixed at z-50 with a safe-area inset; the toast must outrank it.
    const toast = screen.getByRole('status')
    expect(toast.className).toMatch(/z-\[?6\d/)
  })
})
