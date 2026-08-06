import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { UndoProvider } from '../context/UndoContext'
import { useUndo } from '../context/useUndo'

// A publisher that can be unmounted independently, so we can prove the offer
// outlives the surface that made it.
function Publisher({ label = 'remove', message = 'Photo removed', onUndo, durable = true }) {
  const { offer } = useUndo()
  return (
    <button onClick={() => offer({ message, onUndo, durable, ownerId: label })}>{label}</button>
  )
}

describe('UndoProvider', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows nothing until something is offered', () => {
    render(<UndoProvider><Publisher /></UndoProvider>)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows one toast when a removal is offered', () => {
    render(<UndoProvider><Publisher /></UndoProvider>)

    fireEvent.click(screen.getByText('remove'))

    expect(screen.getByRole('status')).toHaveTextContent('Photo removed')
  })

  it('runs the offered callback when undo is pressed, then clears', () => {
    const onUndo = vi.fn()
    render(<UndoProvider><Publisher onUndo={onUndo} /></UndoProvider>)

    fireEvent.click(screen.getByText('remove'))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // The reason this issue exists: two rows each rendered their own fixed toast at
  // identical coordinates, so the second covered the first's Undo.
  it('never shows two toasts at once', () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <UndoProvider>
        <Publisher label="remove-a" message="A removed" onUndo={first} />
        <Publisher label="remove-b" message="B removed" onUndo={second} />
      </UndoProvider>
    )

    fireEvent.click(screen.getByText('remove-a'))
    fireEvent.click(screen.getByText('remove-b'))

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('B removed')

    // The visible offer is the newest one; the older is committed, not restorable.
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  // Found by the codex review. A promoted offer can outlive the record it would
  // restore into — save a removal, then delete the idea. The restore silently
  // does nothing, so claiming "Photo restored" would be a lie.
  it('does not confirm a restore that reported failure', () => {
    function Failing() {
      const { offer } = useUndo()
      return (
        <button onClick={() => offer({ message: 'Photo removed', confirmMessage: 'Photo restored', onUndo: () => false, durable: true })}>
          remove
        </button>
      )
    }
    render(<UndoProvider><Failing /></UndoProvider>)

    fireEvent.click(screen.getByText('remove'))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('confirms when the restore did not report failure', () => {
    render(<UndoProvider><Publisher onUndo={() => {}} /></UndoProvider>)

    fireEvent.click(screen.getByText('remove'))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    // Publisher offers no confirmMessage, so nothing lingers — but the absence
    // must come from that, not from a failure signal.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('withdraws the offer when the window passes', () => {
    const onUndo = vi.fn()
    render(<UndoProvider undoWindowMs={5000}><Publisher onUndo={onUndo} /></UndoProvider>)

    fireEvent.click(screen.getByText('remove'))
    act(() => vi.advanceTimersByTime(5000))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(onUndo).not.toHaveBeenCalled()
  })

  // The acceptance criterion for #53.
  it('keeps a durable offer alive after the publisher unmounts', () => {
    const onUndo = vi.fn()
    function Host({ show }) {
      return (
        <UndoProvider>
          {show && <Publisher onUndo={onUndo} durable />}
        </UndoProvider>
      )
    }
    const { rerender } = render(<Host show />)

    fireEvent.click(screen.getByText('remove'))
    rerender(<Host show={false} />)   // the row collapses / modal closes

    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  // Withdrawal must be scoped to the offer the unmounting owner actually made.
  // Otherwise closing one surface silently cancels an unrelated, newer offer.
  it('does not withdraw a newer offer made by someone else', () => {
    const second = vi.fn()
    function Host({ showFirst }) {
      return (
        <UndoProvider>
          {showFirst && <Publisher label="remove-a" message="A removed" durable={false} />}
          <Publisher label="remove-b" message="B removed" onUndo={second} durable={false} />
        </UndoProvider>
      )
    }
    const { rerender } = render(<Host showFirst />)

    fireEvent.click(screen.getByText('remove-a'))
    fireEvent.click(screen.getByText('remove-b'))   // B's offer replaces A's
    rerender(<Host showFirst={false} />)            // A unmounts

    expect(screen.getByRole('status')).toHaveTextContent('B removed')
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(second).toHaveBeenCalledTimes(1)
  })

  // Brief's composer edits a local draft that is discarded on close, so an Undo
  // button left behind would do nothing — withdraw it instead of lying.
  it('withdraws a non-durable offer when the publisher unmounts', () => {
    function Host({ show }) {
      return (
        <UndoProvider>
          {show && <Publisher durable={false} />}
        </UndoProvider>
      )
    }
    const { rerender } = render(<Host show />)

    fireEvent.click(screen.getByText('remove'))
    expect(screen.getByRole('status')).toBeInTheDocument()

    rerender(<Host show={false} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
