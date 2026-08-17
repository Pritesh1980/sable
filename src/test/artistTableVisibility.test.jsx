import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { UndoProvider } from '../context/UndoContext'
import ArtistTable from '../components/ArtistTable'

// #64. "Visible" for undo used to mean `expanded` — rendered, not on screen. A
// row expanded near the top of a long Manage list, then scrolled well past the
// fold, still reported visible, so a restore into it stayed silent: the case
// #61 added the confirmation for. Fixed by measuring the expanded row's real
// position against the viewport at the moment Undo is pressed, rather than
// trusting the boolean that only says the row is mounted.
afterEach(cleanup)
// A spy on Element.prototype is global, not scoped to the test that made it —
// restoring inline only runs if the test reaches that line, so a failure
// before it would leak the mock into whichever file the runner happens to
// execute next. afterEach always fires, failure or not.
afterEach(() => vi.restoreAllMocks())

const artist = {
  id: 'a1', handle: 'zoia.ink', name: 'Zoia', rank: 1,
  images: ['a.jpg', 'b.jpg'], tags: [], status: 'researching', notes: '', studio: null,
}

function renderTable() {
  render(
    <UndoProvider undoWindowMs={5000}>
      <table>
        <tbody>
          <ArtistTable artists={[artist]} onSaveImages={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} />
        </tbody>
      </table>
    </UndoProvider>
  )
}

// jsdom lays nothing out — every element's real getBoundingClientRect is a
// zero rect regardless of where it "is". Stubbing it is the only way to
// exercise the geometry branch at all, the same shape as the pure test for
// intersectsViewport itself, but here proving the wiring reads the DOM.
function stubRowRect(rect) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect,
  })
}

describe('undo confirmation reflects real on-screen position, not just expanded (#64)', () => {
  // agy review: this and the collapsed case below return the same result under
  // the old `() => expanded` and the new geometry check — neither branch
  // changed, so neither discriminates the bug on its own. They exist as
  // regression coverage for the two cases the fix must not disturb. Only
  // "scrolled below the fold" exercises the branch that actually changed;
  // mutation-tested — reverting to `() => expanded` fails only that one.
  it('stays silent when the expanded row is actually on screen', () => {
    stubRowRect({ top: 100, bottom: 300, left: 0, right: 400, width: 400, height: 200 })
    renderTable()
    fireEvent.click(screen.getByText('Zoia'))

    fireEvent.click(screen.getAllByLabelText('Remove photo')[0])
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('confirms when the expanded row has scrolled below the fold', () => {
    // window.innerHeight in the jsdom default environment; the row sits well
    // past it either way, which is the point.
    stubRowRect({ top: 5000, bottom: 5200, left: 0, right: 400, width: 400, height: 200 })
    renderTable()
    fireEvent.click(screen.getByText('Zoia'))

    fireEvent.click(screen.getAllByLabelText('Remove photo')[0])
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/restored/i)
  })

  it('confirms when the row is collapsed (never mounted, not just off screen)', () => {
    renderTable()
    fireEvent.click(screen.getByText('Zoia')) // expand
    fireEvent.click(screen.getAllByLabelText('Remove photo')[0])
    fireEvent.click(screen.getByText('Zoia')) // collapse — offer outlives this

    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/restored/i)
  })
})
