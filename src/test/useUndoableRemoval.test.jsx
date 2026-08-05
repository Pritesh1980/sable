import { StrictMode, useEffect, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { UndoProvider } from '../context/UndoContext'
import { useUndoableRemoval } from '../hooks/useUndoableRemoval'

// Exercises the hook the way a page does: it owns a list, hands the hook an
// onChange, and renders a remove button per item.
function List({ initial = ['a', 'b', 'c'], onChange, durable = true, message = 'Photo removed' }) {
  const [list, setList] = useState(initial)
  const currentRef = useRef(list)
  useEffect(() => { currentRef.current = list })
  // onChange receives an updater, matching how the real pages apply it. The
  // notification happens outside the state updater — a side effect in one would
  // fire twice under StrictMode, which is what the test below guards.
  const apply = (updater) => {
    const next = updater(currentRef.current)
    setList(next)
    onChange?.(next)
  }
  const { remove } = useUndoableRemoval(list, apply, { message, durable })
  return (
    <div>
      <span data-testid="list">{list.join(',')}</span>
      {list.map((item, i) => (
        <button key={item} onClick={() => remove(i)}>{`remove ${item}`}</button>
      ))}
      <button onClick={() => remove(99)}>remove missing</button>
    </div>
  )
}

const list = () => screen.getByTestId('list').textContent
const undoButton = () => screen.getByRole('button', { name: /^undo$/i })

describe('useUndoableRemoval', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('removes the item and offers it back', () => {
    render(<UndoProvider><List /></UndoProvider>)

    fireEvent.click(screen.getByText('remove b'))

    expect(list()).toBe('a,c')
    expect(screen.getByRole('status')).toHaveTextContent('Photo removed')
  })

  it('restores the item to its original position on undo', () => {
    render(<UndoProvider><List /></UndoProvider>)

    fireEvent.click(screen.getByText('remove b'))
    fireEvent.click(undoButton())

    expect(list()).toBe('a,b,c')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('withdraws the offer once the window passes, without restoring', () => {
    render(<UndoProvider undoWindowMs={5000}><List /></UndoProvider>)

    fireEvent.click(screen.getByText('remove a'))
    act(() => vi.advanceTimersByTime(5000))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(list()).toBe('b,c')
  })

  it('offers only the most recent of two quick removals', () => {
    render(<UndoProvider undoWindowMs={5000}><List /></UndoProvider>)

    fireEvent.click(screen.getByText('remove a'))
    fireEvent.click(screen.getByText('remove b'))
    expect(list()).toBe('c')

    fireEvent.click(undoButton())

    // Only b comes back; a is already committed.
    expect(list()).toBe('b,c')
  })

  it('ignores an index that is not in the list', () => {
    render(<UndoProvider><List /></UndoProvider>)

    fireEvent.click(screen.getByText('remove missing'))

    expect(list()).toBe('a,b,c')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('still removes when there is no provider, just without an offer', () => {
    render(<List />)

    fireEvent.click(screen.getByText('remove b'))

    expect(list()).toBe('a,c')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // main.jsx renders the app inside <StrictMode>, which double-invokes state
  // updaters. A side effect in one would restore twice.
  it('restores exactly once under StrictMode', () => {
    const onChange = vi.fn()
    render(
      <StrictMode>
        <UndoProvider><List onChange={onChange} /></UndoProvider>
      </StrictMode>
    )

    fireEvent.click(screen.getByText('remove b'))
    onChange.mockClear()
    fireEvent.click(undoButton())

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  // #53: the removal is already persisted, so the way back must outlive the row
  // or modal that offered it.
  it('keeps a durable offer after the owning surface unmounts', () => {
    function Host({ show }) {
      return <UndoProvider>{show && <List durable />}</UndoProvider>
    }
    const { rerender } = render(<Host show />)

    fireEvent.click(screen.getByText('remove b'))
    rerender(<Host show={false} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(undoButton()).toBeInTheDocument()
  })

  // Found by the codex review of #53. A durable offer outlives its component, so
  // its refs stop updating — restoring from a frozen copy of the list would write
  // back over anything that landed in between (a sync, an import).
  it('does not lose a concurrent change when restoring after unmount', () => {
    function Row({ list, apply }) {
      const { remove } = useUndoableRemoval(list, apply, { message: 'Photo removed', durable: true })
      return <button onClick={() => remove(0)}>remove first</button>
    }
    function Host() {
      const [items, setItems] = useState(['a', 'b'])
      const [showRow, setShowRow] = useState(true)
      const apply = (updater) =>
        setItems((cur) => (typeof updater === 'function' ? updater(cur) : updater))
      return (
        <UndoProvider>
          <span data-testid="list">{items.join(',')}</span>
          {showRow && <Row list={items} apply={apply} />}
          <button onClick={() => setShowRow(false)}>collapse</button>
          <button onClick={() => setItems((l) => [...l, 'synced'])}>sync</button>
        </UndoProvider>
      )
    }
    render(<Host />)

    fireEvent.click(screen.getByText('remove first'))   // ['b']
    fireEvent.click(screen.getByText('collapse'))       // row unmounts, refs freeze
    fireEvent.click(screen.getByText('sync'))           // ['b','synced'] arrives
    fireEvent.click(undoButton())

    expect(list()).toBe('a,b,synced')
  })

  it('withdraws a non-durable offer when the owning surface unmounts', () => {
    function Host({ show }) {
      return <UndoProvider>{show && <List durable={false} />}</UndoProvider>
    }
    const { rerender } = render(<Host show />)

    fireEvent.click(screen.getByText('remove b'))
    rerender(<Host show={false} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
