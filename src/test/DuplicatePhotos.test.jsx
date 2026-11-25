import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import DuplicatePhotos from '../components/DuplicatePhotos'
import { backend } from '../backend'

// #210: the Settings card. Review first; any removal is one record, one copy,
// confirmed, and undoable. Bytes are never deleted.

const A = 'user/u1/artists/zoia/a.jpg'
const B = 'user/u1/artists/zoia/b.jpg'
const C = 'user/u1/ideas/moth/c.jpg'
const D = 'user/u1/ideas/moth/d.jpg'
const SAME = { [A]: 'skull', [B]: 'skull', [C]: 'skull', [D]: 'moth' }

const reader = (table = SAME) => vi.fn(async (ref) => {
  const key = typeof ref === 'string' ? ref : ref.key
  return key in table ? new Blob([table[key]]) : null
})

const start = () => ({
  artists: [{ id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: [{ key: A }, { key: B }] }],
  ideas: [{ id: 'moth', title: 'Moth sleeve', images: [{ key: C, note: 'this shading' }, { key: D }] }],
})

function Harness({ initial = start(), readBlob = reader(), favourites = [] }) {
  const [artists, setArtists] = useState(initial.artists)
  const [ideas, setIdeas] = useState(initial.ideas)
  return (
    <>
      <DuplicatePhotos
        artists={artists} setArtists={setArtists}
        ideas={ideas} setIdeas={setIdeas}
        concepts={[]} saved={[]} favourites={favourites}
        readBlob={readBlob}
      />
      <pre data-testid="artists">{JSON.stringify(artists.map((a) => a.images))}</pre>
      <pre data-testid="ideas">{JSON.stringify(ideas.map((i) => i.images))}</pre>
    </>
  )
}

const check = () => fireEvent.click(screen.getByRole('button', { name: 'Check for duplicates' }))
const groupList = () => screen.findByRole('list', { name: 'Duplicate photos found' })

afterEach(() => vi.restoreAllMocks())

describe('DuplicatePhotos', () => {
  it('reports what it checked and the copies it found, with where each is used', async () => {
    render(<Harness />)
    check()
    const list = await groupList()
    expect(screen.getByText('Checked 4 of 4 photos.')).toBeInTheDocument()
    expect(screen.getByText('1 photo appears more than once.')).toBeInTheDocument()
    const groups = within(list).getAllByRole('listitem', { name: /^Same photo/ })
    expect(groups).toHaveLength(1)
    expect(within(groups[0]).getByText('Artist · Zoia, photo 1 of 2')).toBeInTheDocument()
    expect(within(groups[0]).getByText('Artist · Zoia, photo 2 of 2')).toBeInTheDocument()
    expect(within(groups[0]).getByText('Idea · Moth sleeve, photo 1 of 2')).toBeInTheDocument()
    expect(within(groups[0]).getByText('“this shading”')).toBeInTheDocument()
  })

  it('says so when nothing is duplicated, and counts photos it could not read', async () => {
    render(<Harness readBlob={reader({ [A]: 'one', [C]: 'two' })} />)
    check()
    expect(await screen.findByText('No duplicates among the photos checked.')).toBeInTheDocument()
    expect(screen.getByText('Checked 2 of 4 photos.')).toBeInTheDocument()
    expect(screen.getByText(/2 couldn’t be read right now, so they weren’t compared/)).toBeInTheDocument()
  })

  it('removes a copy only after confirming, and Undo puts it back', async () => {
    const remove = vi.spyOn(backend.blobs, 'remove')
    render(<Harness />)
    check()
    await groupList()
    // Only Zoia's copies can come out: she keeps the other one.
    const buttons = screen.getAllByRole('button', { name: /Remove this copy/ })
    expect(buttons).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove this copy from Zoia (copy 2)' }))
    expect(screen.getByText('Remove copy 2 from Zoia? Copy 1 stays there, and nothing else changes.')).toBeInTheDocument()
    expect(screen.getByTestId('artists').textContent).toContain(B) // not yet

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByTestId('artists').textContent).not.toContain(B)
    expect(screen.getByTestId('ideas').textContent).toContain(C) // other records untouched
    expect(screen.getByRole('status')).toHaveTextContent('Removed copy 2 from Zoia.')
    expect(remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(JSON.parse(screen.getByTestId('artists').textContent)).toEqual([[{ key: A }, { key: B }]])
    expect(screen.getByRole('status')).toHaveTextContent('Put back copy 2 in Zoia.')
  })

  it('Cancel leaves the photos as they were', async () => {
    render(<Harness />)
    check()
    await groupList()
    fireEvent.click(screen.getByRole('button', { name: 'Remove this copy from Zoia (copy 1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(JSON.parse(screen.getByTestId('artists').textContent)).toEqual([[{ key: A }, { key: B }]])
    expect(screen.getAllByRole('button', { name: /Remove this copy/ })).toHaveLength(2)
  })

  it('keeps a favourited copy and says why', async () => {
    render(<Harness favourites={[{ id: 'f', image: { key: B }, addedAt: '2026-11-01' }]} />)
    check()
    await groupList()
    expect(screen.getAllByRole('button', { name: /Remove this copy/ })).toHaveLength(1)
    expect(screen.getByText('Favourited, so it stays. Remove the other copy instead.')).toBeInTheDocument()
  })

  it('only reviews repeats across records, and says they may be on purpose', async () => {
    const initial = { artists: [{ id: 'zoia', name: 'Zoia', images: [{ key: A }] }], ideas: [{ id: 'moth', title: 'Moth', images: [{ key: C }] }] }
    render(<Harness initial={initial} />)
    check()
    await groupList()
    expect(screen.queryByRole('button', { name: /Remove this copy/ })).toBeNull()
    expect(screen.getByText(/in different places\. That can be on purpose/)).toBeInTheDocument()
  })

  it('stops when asked, and changes nothing', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const readBlob = vi.fn(async (ref) => { await gate; return new Blob([SAME[ref.key]]) })
    render(<Harness readBlob={readBlob} />)
    check()
    expect(await screen.findByRole('progressbar', { name: 'Checking photos' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    release()
    expect(await screen.findByText('Stopped. Nothing was changed.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Duplicate photos found' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Check for duplicates' })).toBeInTheDocument()
  })
})
