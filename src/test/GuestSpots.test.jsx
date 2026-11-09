import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import GuestSpots from '../components/GuestSpots'

const TODAY = '2027-01-15'
const SPOTS = [
  { id: 's1', city: 'London', studio: 'Black Iris', startDate: '2027-02-12', endDate: '2027-02-14', source: '', notes: 'DM to book' },
  { id: 's2', city: 'Lisbon', studio: '', startDate: '2027-03-01', endDate: '2027-03-03', source: '', notes: '' },
  { id: 's3', city: 'Leeds', studio: '', startDate: '2026-11-01', endDate: '2026-11-02', source: '', notes: '' },
]

function setup(props = {}) {
  let current = props.spots ?? SPOTS
  const onChange = vi.fn((updater) => { current = updater(current) })
  const utils = render(<GuestSpots spots={current} onChange={onChange} today={TODAY} {...props} />)
  return { ...utils, onChange, latest: () => current }
}

beforeEach(() => localStorage.removeItem('gemini_api_key'))
afterEach(() => vi.restoreAllMocks())

describe('GuestSpots', () => {
  it('lists upcoming spots with distance, says when it is unknown, and keeps past ones apart', () => {
    setup()
    const upcoming = screen.getByRole('list', { name: 'Upcoming guest spots' })
    expect(within(upcoming).getByText('London')).toBeInTheDocument()
    expect(within(upcoming).getByText('55 mi')).toBeInTheDocument()
    expect(within(upcoming).getByText('distance unknown')).toBeInTheDocument()
    expect(within(upcoming).queryByText('Leeds')).toBeNull()
    expect(screen.getByText(/Past \(1\)/)).toBeInTheDocument()
  })

  it('adds a spot from the form', () => {
    const { onChange, latest } = setup({ spots: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ Add guest spot' }))
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Manchester' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-03-03' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-03-05' } })
    expect(screen.getByText('130 mi from Milton Keynes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save guest spot' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(latest()).toEqual([expect.objectContaining({ city: 'Manchester', startDate: '2027-03-03', endDate: '2027-03-05' })])
  })

  it('refuses a spot without valid dates', () => {
    const { onChange } = setup({ spots: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ Add guest spot' }))
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Leeds' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save guest spot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/city and a start date/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('edits a spot in place, keeping its id', () => {
    const { latest } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit London guest spot' }))
    fireEvent.change(screen.getByLabelText('Studio'), { target: { value: 'Night Office' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save guest spot' }))
    expect(latest()).toHaveLength(3)
    expect(latest().find((s) => s.id === 's1').studio).toBe('Night Office')
  })

  it('removes a spot after confirming', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { latest } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Remove London guest spot' }))
    expect(latest().map((s) => s.id)).toEqual(['s2', 's3'])
  })

  it('without a Gemini key, points to AI setup instead of offering screenshot reading', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Read dates' })).toBeNull()
    expect(screen.getByText(/Concepts → AI setup/)).toBeInTheDocument()
  })

  it('reads a screenshot only on an explicit tap, then each suggestion is reviewed before saving', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    const analyze = vi.fn(async () => [
      { city: 'London', studio: 'Black Iris', startDate: '2027-04-02', endDate: '2027-04-04' },
      { city: 'Bristol', studio: '', startDate: '2027-05-10', endDate: '2027-05-11' },
    ])
    const toDataUrl = vi.fn(async () => 'data:image/png;base64,AAAA')
    const { onChange, latest } = setup({ spots: [], analyze, toDataUrl })

    const file = new File(['x'], 'announce.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Guest spot screenshot'), { target: { files: [file] } })
    await screen.findByRole('button', { name: 'Read dates' })
    expect(analyze).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Read dates' }))
    await waitFor(() => expect(analyze).toHaveBeenCalledWith('test-key', 'data:image/png;base64,AAAA', TODAY))
    const suggestions = await screen.findByRole('list', { name: 'Suggested guest spots' })
    expect(within(suggestions).getAllByRole('listitem')).toHaveLength(2)
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(within(suggestions).getByRole('button', { name: 'Review London' }))
    expect(screen.getByLabelText('City')).toHaveValue('London')
    expect(screen.getByLabelText('From')).toHaveValue('2027-04-02')
    fireEvent.click(screen.getByRole('button', { name: 'Save guest spot' }))
    expect(latest()).toEqual([expect.objectContaining({ city: 'London', studio: 'Black Iris' })])
    expect(within(screen.getByRole('list', { name: 'Suggested guest spots' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('says so when nothing could be read', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    setup({ spots: [], analyze: vi.fn(async () => []), toDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA') })
    fireEvent.change(screen.getByLabelText('Guest spot screenshot'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Read dates' }))
    expect(await screen.findByText(/couldn't find any dates/i)).toBeInTheDocument()
  })
})

describe('GuestSpots review fixes (codex + agy)', () => {
  const pick = () => fireEvent.change(screen.getByLabelText('Guest spot screenshot'), {
    target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
  })
  const THREE = [
    { city: 'London', studio: '', startDate: '2027-04-02', endDate: '2027-04-04', notes: '' },
    { city: 'Bristol', studio: '', startDate: '2027-05-10', endDate: '2027-05-11', notes: 'Books open 1 Mar, DM' },
    { city: 'Oxford', studio: '', startDate: '2027-06-01', endDate: '2027-06-02', notes: '' },
  ]

  async function readThree(extra = {}) {
    localStorage.setItem('gemini_api_key', 'test-key')
    const utils = setup({ spots: [], analyze: vi.fn(async () => THREE), toDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA'), ...extra })
    pick()
    fireEvent.click(await screen.findByRole('button', { name: 'Read dates' }))
    await screen.findByRole('list', { name: 'Suggested guest spots' })
    return utils
  }
  const suggestionCities = () => within(screen.getByRole('list', { name: 'Suggested guest spots' }))
    .getAllByRole('listitem').map((li) => li.textContent)

  it('saving a reviewed suggestion removes that one, even after dismissing an earlier one', async () => {
    const { latest } = await readThree()
    fireEvent.click(screen.getByRole('button', { name: 'Review Bristol' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss London' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save guest spot' }))
    expect(latest().map((s) => s.city)).toEqual(['Bristol'])
    const left = suggestionCities()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatch(/Oxford/)
  })

  it('keeps the screenshot picker disabled while a read is in flight', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    let finish
    const analyze = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    setup({ spots: [], analyze, toDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA') })
    pick()
    fireEvent.click(await screen.findByRole('button', { name: 'Read dates' }))
    expect(screen.getByLabelText('Guest spot screenshot')).toBeDisabled()
    finish([])
    await waitFor(() => expect(screen.getByLabelText('Guest spot screenshot')).not.toBeDisabled())
  })

  it('keeps the screenshot in view while suggestions are reviewed, and carries the booking note', async () => {
    await readThree()
    expect(screen.getByAltText('Announcement screenshot')).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    fireEvent.click(screen.getByRole('button', { name: 'Review Bristol' }))
    expect(screen.getByLabelText('Notes')).toHaveValue('Books open 1 Mar, DM')
    const list = screen.getByRole('list', { name: 'Suggested guest spots' })
    const city = screen.getByLabelText('City')
    // The form opens with the suggestions, not up above them.
    expect(list.compareDocumentPosition(city) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('fills an empty To from From, and keeps To from going before it', () => {
    setup({ spots: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ Add guest spot' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-08-14' } })
    expect(screen.getByLabelText('To')).toHaveValue('2027-08-14')
    expect(screen.getByLabelText('To')).toHaveAttribute('min', '2027-08-14')
  })

  it('warns when a city has no known distance, so it will not show as nearby', () => {
    setup({ spots: [] })
    fireEvent.click(screen.getByRole('button', { name: '+ Add guest spot' }))
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Atlantis' } })
    expect(screen.getByText(/won’t appear in Nearby soon/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Hackney' } })
    expect(screen.getByText('55 mi from Milton Keynes')).toBeInTheDocument()
  })
})
