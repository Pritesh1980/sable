import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import useDialogFocus from '../hooks/useDialogFocus'
import UndoToast from '../components/UndoToast'

// A modal built the way WallViewer and ConceptViewer are.
function Dialog({ children }) {
  const ref = useDialogFocus(true)
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true">
      <button>first</button>
      <button>last</button>
      {children}
    </div>
  )
}

const tab = (shift = false) => fireEvent.keyDown(document.activeElement || document.body, { key: 'Tab', shiftKey: shift })

describe('undo toast inside a modal focus trap (#58)', () => {
  it('lets Tab reach Undo from the last control in the dialog', () => {
    render(
      <>
        <Dialog />
        <UndoToast show message="Photo removed" onUndo={() => {}} />
      </>
    )

    screen.getByText('last').focus()
    tab()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /undo/i }))
  })

  it('wraps from Undo back into the dialog', () => {
    render(
      <>
        <Dialog />
        <UndoToast show message="Photo removed" onUndo={() => {}} />
      </>
    )

    screen.getByRole('button', { name: /undo/i }).focus()
    tab()

    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('shift-tabs from the first control to Undo', () => {
    render(
      <>
        <Dialog />
        <UndoToast show message="Photo removed" onUndo={() => {}} />
      </>
    )

    screen.getByText('first').focus()
    tab(true)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /undo/i }))
  })

  it('still wraps within the dialog when no toast is showing', () => {
    render(<Dialog />)

    screen.getByText('last').focus()
    tab()

    expect(document.activeElement).toBe(screen.getByText('first'))
  })

  it('does not trap into a toast that is only a confirmation', () => {
    // No action button to reach — Tab should wrap inside the dialog as usual.
    render(
      <>
        <Dialog />
        <UndoToast show message="Photo restored" />
      </>
    )

    screen.getByText('last').focus()
    tab()

    expect(document.activeElement).toBe(screen.getByText('first'))
  })
})
