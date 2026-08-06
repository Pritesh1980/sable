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

  // #60: the action is removed from the DOM when Undo is pressed and when the
  // window expires. If it held focus at that moment, focus fell to <body> —
  // outside any dialog the user was working in, until the next Tab pulled it back.
  describe('focus when the action disappears (#60)', () => {
    function Harness({ show, withAction = true }) {
      return (
        <>
          <button>somewhere else</button>
          <UndoToast show={show} message="Photo removed" onUndo={withAction ? () => {} : undefined} />
        </>
      )
    }

    it('hands focus back when the toast is dismissed', () => {
      const { rerender } = render(<Harness show />)
      screen.getByText('somewhere else').focus()
      screen.getByRole('button', { name: /undo/i }).focus()

      rerender(<Harness show={false} />)

      expect(document.activeElement).toBe(screen.getByText('somewhere else'))
    })

    it('hands focus back when the action becomes a confirmation', () => {
      const { rerender } = render(<Harness show />)
      screen.getByText('somewhere else').focus()
      screen.getByRole('button', { name: /undo/i }).focus()

      rerender(<Harness show withAction={false} />)

      expect(document.activeElement).toBe(screen.getByText('somewhere else'))
    })

    // Found by the codex review. Focus on <body> does not prove the Undo button
    // held it — the user may simply have clicked empty space. Refocusing the last
    // remembered control then is the focus-stealing the component promises not
    // to do.
    it('does not grab focus back when the user deliberately blurred', () => {
      const { rerender } = render(<Harness show />)
      const other = screen.getByText('somewhere else')
      other.focus()
      other.blur()                                // user clicks empty space
      expect(document.activeElement).toBe(document.body)

      rerender(<Harness show={false} />)          // the offer expires

      expect(document.activeElement).toBe(document.body)
    })

    it('falls back to the open dialog when the remembered control has gone', () => {
      function WithDialog({ show, keepButton }) {
        return (
          <>
            <div role="dialog" aria-modal="true" tabIndex={-1} data-testid="dialog">
              {keepButton && <button>inside dialog</button>}
            </div>
            <UndoToast show={show} message="Photo removed" onUndo={() => {}} />
          </>
        )
      }
      const { rerender } = render(<WithDialog show keepButton />)
      screen.getByText('inside dialog').focus()
      screen.getByRole('button', { name: /undo/i }).focus()

      // The control it would return to disappears along with the offer.
      rerender(<WithDialog show={false} keepButton={false} />)

      expect(document.activeElement).toBe(screen.getByTestId('dialog'))
    })

    it('leaves focus alone when it was never on the toast', () => {
      const { rerender } = render(<Harness show />)
      screen.getByText('somewhere else').focus()

      rerender(<Harness show={false} />)

      expect(document.activeElement).toBe(screen.getByText('somewhere else'))
    })
  })

  it('clears the bottom nav so it cannot sit under it', () => {
    render(<UndoToast message="Photo removed" show onUndo={() => {}} />)

    // Nav is fixed at z-50 with a safe-area inset; the toast must outrank it.
    const toast = screen.getByRole('status')
    expect(toast.className).toMatch(/z-\[?6\d/)
  })
})
