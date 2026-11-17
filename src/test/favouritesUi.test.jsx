import { describe, it, expect, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import Gallery from '../pages/Gallery'

const ARTISTS = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: 'Zoia', rank: 1, tags: [], images: [{ key: 'user/u1/artists/zoia/a.jpg' }, { key: 'user/u1/artists/zoia/b.jpg' }] },
  { id: 'carl', handle: 'carl245tattoo', name: 'Carlos', rank: 2, tags: [], images: [{ key: 'user/u1/artists/carl/c.jpg' }] },
]
const SAVED = [{ id: 's1', image: { key: 'user/u1/saved/s1/a.jpg' }, addedAt: '2026-07-03T00:00:00.000Z' }]
const FAV = (key, id = key) => ({ id, image: { key }, addedAt: '2026-07-04T00:00:00.000Z' })

const spy = {}
function Harness({ initialFavs = [] }) {
  const [artists, setArtists] = useState(ARTISTS)
  const [saved, setSaved] = useState(SAVED)
  const [favourites, setFavourites] = useState(initialFavs)
  useEffect(() => { spy.favourites = favourites })
  return <Gallery artists={artists} setArtists={setArtists} saved={saved} setSaved={setSaved} favourites={favourites} setFavourites={setFavourites} ideas={[]} />
}
function renderWall(entry = '/gallery', initialFavs = []) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path="/gallery" element={<Harness initialFavs={initialFavs} />} /></Routes>
    </MemoryRouter>,
  )
}

describe('favourite heart in the viewer', () => {
  it('toggles with aria-pressed and the right label, on an artist photo', () => {
    renderWall('/gallery?photo=zoia.ink.1')
    const heart = screen.getByRole('button', { name: 'Favourite' })
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heart)
    expect(spy.favourites).toHaveLength(1)
    expect(spy.favourites[0].image).toEqual({ key: 'user/u1/artists/zoia/a.jpg' })
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favourites' }))
    expect(spy.favourites).toEqual([])
  })

  it('works on a saved photo too', () => {
    renderWall('/gallery?photo=s:s1')
    fireEvent.click(screen.getByRole('button', { name: 'Favourite' }))
    expect(spy.favourites[0].image).toEqual({ key: 'user/u1/saved/s1/a.jpg' })
  })

  it('F toggles it, and is in the legend', () => {
    renderWall('/gallery?photo=zoia.ink.1')
    expect(screen.getByText('favourite')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'f' })
    expect(spy.favourites).toHaveLength(1)
    fireEvent.keyDown(window, { key: 'F' })
    expect(spy.favourites).toEqual([])
  })

  it('is disabled when the photo is not stored yet', () => {
    render(
      <MemoryRouter initialEntries={['/gallery?photo=s:s1']}>
        <Gallery artists={[]} setArtists={vi.fn()} saved={[{ id: 's1', image: 'data:image/png;base64,AAA', addedAt: 'z' }]} setSaved={vi.fn()} favourites={[]} setFavourites={vi.fn()} ideas={[]} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Favourite' })).toBeDisabled()
  })
})

describe('favourite marker on tiles', () => {
  it('marks only favourited tiles, with screen-reader text', () => {
    renderWall('/gallery', [FAV('user/u1/artists/carl/c.jpg', 'f1')])
    const marked = screen.getAllByText('Favourite', { selector: '.sr-only' })
    expect(marked).toHaveLength(1)
    expect(marked[0].closest('figure')).toHaveAttribute('data-artist-id', 'carl')
  })
})

describe('Favourites filter', () => {
  function turnOn() {
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }))
  }
  it('shows only favourited photos (artists and saved), keeping order, and ignores orphans', () => {
    renderWall('/gallery', [FAV('user/u1/artists/zoia/b.jpg'), FAV('user/u1/saved/s1/a.jpg'), FAV('user/u1/gone.jpg')])
    turnOn()
    const names = [...document.querySelectorAll('figure')].map((f) => within(f).getByRole('button').getAttribute('aria-label'))
    expect(names).toEqual(['Open No artist yet', 'Open Zoia'])
    expect(screen.getByRole('button', { name: /Clear filter: Favourites/ })).toBeInTheDocument()
  })
  it('says so when there are none', () => {
    renderWall('/gallery', [FAV('user/u1/gone.jpg')])
    turnOn()
    expect(screen.getByText('No favourites yet. Tap the heart on a photo to add it.')).toBeInTheDocument()
  })
  it('keeps deep links working and navigates only within the filtered items', () => {
    renderWall('/gallery?photo=zoia.ink.2', [FAV('user/u1/artists/zoia/b.jpg'), FAV('user/u1/artists/carl/c.jpg')])
    // the viewer opens on a photo that is not favourited until the filter is on
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    turnOn()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open Zoia' })[0])
    expect(screen.getByRole('dialog', { name: /Zoia/ })).toHaveAccessibleName(/image 1 of 1/)
  })
  it('keeps the viewer open when you un-favourite the photo you are looking at', () => {
    renderWall('/gallery', [FAV('user/u1/artists/carl/c.jpg')])
    turnOn()
    fireEvent.click(screen.getByRole('button', { name: 'Open Carlos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favourites' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
