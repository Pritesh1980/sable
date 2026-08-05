import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useUndoableRemoval } from '../hooks/useUndoableRemoval'

// The dangerous shape: the list changes underneath (a sync landing), then the user
// taps remove. If the hook wrote back a list computed from the pre-sync copy, the
// synced item would be silently dropped.
//
// Since #53 the hook hands `onChange` an updater rather than a finished array, so
// the removal composes against whatever the owner currently holds. This asserts
// the resulting list, which is what actually matters.
function Harness() {
  const [list, setList] = useState(['a', 'b'])
  const apply = (updater) => setList((cur) => updater(cur))
  const { remove } = useUndoableRemoval(list, apply)
  return (
    <div>
      <button onClick={() => setList(['a', 'b', 'synced'])}>sync</button>
      <button onClick={() => remove(0)}>remove first</button>
      <span data-testid="list">{list.join(',')}</span>
    </div>
  )
}

describe('useUndoableRemoval against a list that changes underneath it', () => {
  it('removes from the latest list, not the one captured at mount', () => {
    render(<Harness />)

    fireEvent.click(screen.getByText('sync'))          // list grows
    fireEvent.click(screen.getByText('remove first'))  // then remove

    // Must keep the synced item: ['a','b','synced'] minus 'a' => ['b','synced']
    expect(screen.getByTestId('list').textContent).toBe('b,synced')
  })
})
