import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'
import WallView from '../components/WallView'
import { loadVectors } from '../data/styleIndex'
import { refIdentity } from '../data/imageRef'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  buildStyleIndex: vi.fn(async () => {}),
}))

const artists = [
  { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: ['/z1.jpg', '/z2.jpg'], tags: [] },
  { id: 'kerem', name: 'Kerem', handle: 'keremtattz', images: ['/k1.jpg'], tags: [] },
  { id: 'victor', name: 'Victor', handle: 'victorportugal', images: ['/v1.jpg'], tags: [] },
]
const SAVED_REF = { key: 'user/u1/saved/s1/a.jpg' }
const saved = [{ id: 's1', image: SAVED_REF, addedAt: '2026-11-01T00:00:00Z' }]

const built = new Map([
  [refIdentity('/z1.jpg'), [1, 0]],
  [refIdentity('/z2.jpg'), [0.99, 0.01]],
  [refIdentity('/k1.jpg'), [0.9, 0.1]],
  [refIdentity('/v1.jpg'), [0, 1]],
  [refIdentity(SAVED_REF), [0.95, 0.05]],
])

beforeEach(() => {
  vi.clearAllMocks()
  loadVectors.mockResolvedValue(built)
})

function Where() {
  return <p data-testid="where">{useLocation().search}</p>
}

function Nav() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate(-1)}>history back</button>
      <button onClick={() => navigate(1)}>history forward</button>
    </>
  )
}

// A wall like Gallery's: while `filtered`, only `visible` artists show (and no
// saved photos); onClearFilters lifts it.
function Wall({ visible, favouritesOnly = false, initialFavourites = [] }) {
  const [filtered, setFiltered] = useState(Boolean(visible || favouritesOnly))
  const [favourites, setFavourites] = useState(initialFavourites)
  const narrow = filtered && visible
  return (
    <WallView
      artists={artists}
      wallArtists={narrow ? artists.filter((a) => visible.includes(a.id)) : artists}
      saved={narrow ? [] : saved}
      allSaved={saved}
      favourites={favourites}
      setFavourites={setFavourites}
      favouritesOnly={filtered && favouritesOnly}
      onClearFilters={() => setFiltered(false)}
    />
  )
}

function renderWall(ui, entries = ['/gallery?photo=zoia.1']) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/gallery" element={<>{ui}<Where /><Nav /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openSheet() {
  fireEvent.click(screen.getAllByRole('button', { name: /^More like this/ })[0])
  return screen.findByRole('dialog', { name: 'More like this' })
}

async function pick(nameRe) {
  const sheet = await openSheet()
  const buttons = await within(sheet).findAllByRole('button', { name: nameRe })
  fireEvent.click(buttons[0])
}

describe('More like this in the wall viewer', () => {
  it('a tapped photo becomes the open photo', async () => {
    renderWall(<WallView artists={artists} saved={saved} />)
    await pick(/similar photo.*by kerem/i)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('photo=kerem.1'))
    expect(screen.queryByRole('dialog', { name: 'More like this' })).toBeNull()
    expect(screen.getByRole('dialog', { name: /kerem/i })).toBeInTheDocument()
  })

  it('opens from the M key, but not while typing', async () => {
    renderWall(<><input aria-label="field" /><WallView artists={artists} saved={saved} /></>)
    const field = screen.getByLabelText('field')
    field.focus()
    fireEvent.keyDown(field, { key: 'm' })
    expect(screen.queryByRole('dialog', { name: 'More like this' })).toBeNull()
    field.blur()
    fireEvent.keyDown(window, { key: 'm' })
    expect(await screen.findByRole('dialog', { name: 'More like this' })).toBeInTheDocument()
  })

  it('a photo a filter hides clears the filter; the viewer is the real wall (grouping and arrows)', async () => {
    renderWall(<Wall visible={['kerem']} />, ['/gallery?photo=kerem.1'])
    await pick(/similar photo.*by zoia/i)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/photo=zoia\.\d/))
    const dialog = await screen.findByRole('dialog', { name: /zoia/i })
    const label = dialog.getAttribute('aria-label')
    expect(label).toMatch(/image \d of 2$/) // not "1 of 1"
    fireEvent.click(screen.getAllByRole('button', { name: 'Next photo' })[0])
    expect(screen.getByRole('dialog', { name: /zoia/i }).getAttribute('aria-label')).not.toBe(label)
  })

  it('a photo reached from More like this shows its live favourite state', async () => {
    const fav = [{ id: 'f1', image: '/k1.jpg', addedAt: '2026-11-01T00:00:00Z' }]
    renderWall(<Wall favouritesOnly initialFavourites={fav} />, ['/gallery?photo=kerem.1'])
    await pick(/similar photo.*by zoia/i)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/photo=zoia/))
    const heart = await screen.findByRole('button', { name: 'Favourite' })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heart)
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('history Back then Forward to a photo a filter had hidden still opens it', async () => {
    renderWall(<Wall visible={['kerem']} />, ['/gallery', '/gallery?photo=kerem.1'])
    await pick(/similar photo.*by zoia/i)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/photo=zoia/))
    const search = screen.getByTestId('where').textContent
    fireEvent.click(screen.getByText('history back'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByText('history forward'))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(search))
    expect(await screen.findByRole('dialog', { name: /zoia/i })).toBeInTheDocument()
  })

  it('a stale jump never leaks into the next open (A, More like this, B, close, tap A)', async () => {
    renderWall(<WallView artists={artists} saved={saved} />, ['/gallery'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Zoia' })[0])
    await pick(/similar photo.*by kerem/i)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('photo=kerem.1'))
    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Zoia' })[0])
    expect(await screen.findByRole('dialog', { name: /zoia/i })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('where')).toHaveTextContent('photo=zoia.1')
    expect(screen.getByRole('dialog', { name: /zoia/i })).toBeInTheDocument()
  })

  it('compares with saved photos even while a style filter hides them from the wall', async () => {
    renderWall(<Wall visible={['zoia']} />, ['/gallery?photo=zoia.1'])
    const sheet = await openSheet()
    expect(await within(sheet).findByRole('button', { name: /saved photo with no artist/i })).toBeInTheDocument()
  })
})
