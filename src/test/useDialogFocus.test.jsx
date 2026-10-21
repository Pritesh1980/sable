import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import useDialogFocus from '../hooks/useDialogFocus'

function Dialog() {
  const ref = useDialogFocus(true)
  return <div role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
    <input aria-label="Handle" />
    <details><summary>Details</summary><input aria-label="Name" /><button disabled>Disabled</button></details>
    <div hidden><button>Hidden</button></div>
    <div inert><button>Inert</button></div>
    <button>Save</button>
  </div>
}
function tab() { fireEvent.keyDown(document, { key: 'Tab' }) }
describe('dialog disclosure focus', () => {
  it('skips closed details, hidden and inert controls but includes the summary', () => {
    render(<Dialog />)
    tab(); expect(screen.getByLabelText('Handle')).toHaveFocus()
    tab(); expect(screen.getByText('Details')).toHaveFocus()
    tab(); expect(screen.getByText('Save')).toHaveFocus()
    tab(); expect(screen.getByLabelText('Handle')).toHaveFocus()
  })
  it('includes optional controls once details opens and skips disabled controls', () => {
    render(<Dialog />)
    fireEvent.click(screen.getByText('Details'))
    screen.getByText('Details').focus()
    tab(); expect(screen.getByLabelText('Name')).toHaveFocus()
    tab(); expect(screen.getByText('Save')).toHaveFocus()
  })
  it('restores focus on close', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger); trigger.focus()
    const view = render(<Dialog />)
    view.unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
