import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'

// #73. The Artists view switcher (☰ ⊟ ⊞ ▦, plus ⇅ Reorder from #70) was
// 24x28 per button — every other control grew to 44pt in #51, this row was
// never revisited.
//
// jsdom has no layout, so these assert the *declaration* of a 44pt box. The
// measurement that proves it is a browser one; `npm run audit:targets` does it
// for real, and the numbers are recorded on the issue.

const baseArtists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: [], rank: 1, status: 'contact-next', notes: '', studio: null },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tags: ['fine-line'], images: [], rank: 2, status: 'shortlisted', notes: '', studio: null },
]

function renderGallery() {
  render(
    <MemoryRouter initialEntries={['/gallery']}>
      <Gallery artists={baseArtists} setArtists={vi.fn()} />
    </MemoryRouter>
  )
}

// The same reading the a11y spec uses: Tailwind's unit is 0.25rem, so 11 => 44px.
function declares44pt(className) {
  const axis = (prop) => {
    const re = new RegExp(`(?:^|\\s)(?:min-)?${prop}-(\\d+)(?![\\w-])`, 'g')
    let m
    while ((m = re.exec(className)) !== null) if (Number(m[1]) >= 11) return true
    return false
  }
  return axis('w') && axis('h')
}

const VIEW_TITLES = ['Filmstrip view', 'Compare artists', 'Grid view', 'Style wall']

describe('view switcher touch targets (#73)', () => {
  beforeEach(() => localStorage.clear())

  it.each(VIEW_TITLES)('gives %s a 44pt hit area', (title) => {
    renderGallery()
    expect(declares44pt(screen.getByTitle(title).className)).toBe(true)
  })

  // codex review: accessible-name computation prefers element *content* over
  // `title`, so these announced as "⊞ button". Queried by role + name, which is
  // what a screen reader actually resolves — getByTitle would pass either way.
  it.each(VIEW_TITLES)('announces %s by name, not by glyph', (title) => {
    renderGallery()
    expect(screen.getByRole('button', { name: title })).toBeInTheDocument()
  })

  it('gives the Reorder toggle a 44pt hit area too', () => {
    renderGallery()
    fireEvent.click(screen.getByTitle('Grid view'))
    expect(declares44pt(screen.getByRole('button', { name: /reorder/i }).className)).toBe(true)
  })

  // #51's pattern: grow the hit area, not the chip. A 44x44 block of accent
  // behind a 13px glyph would change the look of the bar, which is not what
  // this issue asks for.
  it('keeps the visible chip small inside the larger target', () => {
    renderGallery()
    const button = screen.getByTitle('Grid view')
    const chip = button.querySelector('span')
    expect(chip).not.toBeNull()
    expect(declares44pt(chip.className)).toBe(false)
  })

  // #76: audited at 43-161 wide (already fine) but only 26 tall. The row is
  // already 44pt tall because of the view switcher beside it (#77), so this
  // height is absorbed invisibly rather than growing the bar.
  it('gives each style filter pill a 44pt hit area', () => {
    renderGallery()
    const pill = screen.getByRole('button', { name: 'All' })
    expect(declares44pt(pill.className)).toBe(true)
  })

  it('still switches view when clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByTitle('Grid view'))
    // The Reorder toggle only exists in grid view, so its presence proves the switch.
    expect(screen.getByRole('button', { name: /reorder/i })).toBeInTheDocument()
  })

  // #77: five 44pt buttons plus gaps is ~236px. Sharing one flex line with the
  // style filters used to squeeze them into single-file rows on a phone (the
  // same failure #70's re-captured screenshot caught), which #73 solved by
  // forcing the switcher onto its own full-width line — but that made the bar
  // 171px tall (three wrapped pill rows + a switcher row). The fix now is a
  // horizontally-scrolling pill row instead: the switcher can share the line
  // without crushing anything, because the pills scroll rather than wrap.
  it('lets the filters scroll horizontally instead of wrapping or crushing the switcher', () => {
    renderGallery()
    const group = screen.getByTitle('Grid view').parentElement
    expect(group.className).not.toMatch(/w-full/)
    const pillsRow = group.previousElementSibling
    expect(pillsRow.className).toMatch(/overflow-x-auto/)
    expect(pillsRow.className).not.toMatch(/flex-wrap/)
  })
})
