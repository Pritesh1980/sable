import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useUndoableRemoval } from '../hooks/useUndoableRemoval'

// codex was asked whether the refs-in-effect can go stale before an event fires.
// The dangerous shape: the list changes underneath (a sync landing), then the user
// taps remove. If the hook operated on the pre-sync list, the synced item would be
// silently dropped when the shortened list is written back.
function Harness({ onChange }) {
  const [list, setList] = useState(['a', 'b'])
  const { remove } = useUndoableRemoval(list, onChange)
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
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.click(screen.getByText('sync'))          // list grows
    fireEvent.click(screen.getByText('remove first'))  // then remove

    // Must keep the synced item: ['a','b','synced'] minus index 0 => ['b','synced']
    expect(onChange).toHaveBeenLastCalledWith(['b', 'synced'])
  })
})
