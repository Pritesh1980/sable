import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEscapeToClose } from '../hooks/useDialogFocus'
import { activateOnKey } from '../a11y/activate'

function Modal({ onClose, label = 'm' }) {
  const ref = useEscapeToClose(onClose)
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={label} />
}
function Popover({ onClose }) {
  const ref = useEscapeToClose(onClose)
  return <div ref={ref} data-popover />
}

const escape = () => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.dispatchEvent(e)
  return e
}

describe('useEscapeToClose', () => {
  it('closes on Escape and marks the key handled', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    const e = escape()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('peels one layer: only the topmost modal closes', () => {
    const lower = vi.fn()
    const upper = vi.fn()
    render(<><Modal onClose={lower} label="lower" /><Modal onClose={upper} label="upper" /></>)
    escape()
    expect(upper).toHaveBeenCalledTimes(1)
    expect(lower).not.toHaveBeenCalled()
  })

  it('leaves an Escape another layer already handled', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    e.preventDefault()
    document.dispatchEvent(e)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes a non-modal popover, but not while a modal sits above the page', () => {
    const popover = vi.fn()
    const { unmount } = render(<Popover onClose={popover} />)
    escape()
    expect(popover).toHaveBeenCalledTimes(1)
    unmount()

    const popover2 = vi.fn()
    const modal = vi.fn()
    render(<><Popover onClose={popover2} /><Modal onClose={modal} /></>)
    escape()
    expect(modal).toHaveBeenCalledTimes(1)
    expect(popover2).not.toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('activateOnKey', () => {
  function Card({ onOpen }) {
    return (
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={activateOnKey(onOpen)}>
        card <a href="#x">nested link</a>
      </div>
    )
  }

  it('fires on Enter and Space, like a real button', () => {
    const onOpen = vi.fn()
    const { getByRole } = render(<Card onOpen={onOpen} />)
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' })
    fireEvent.keyDown(getByRole('button'), { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('leaves keys pressed on a nested link to that link', () => {
    const onOpen = vi.fn()
    const { getByRole } = render(<Card onOpen={onOpen} />)
    fireEvent.keyDown(getByRole('link'), { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    const onOpen = vi.fn()
    const { getByRole } = render(<Card onOpen={onOpen} />)
    fireEvent.keyDown(getByRole('button'), { key: 'a' })
    expect(onOpen).not.toHaveBeenCalled()
  })
})
