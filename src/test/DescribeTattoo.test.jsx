import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import DescribeTattoo from '../components/DescribeTattoo'
import { readDescription, saveDescription } from '../data/tattooDescription'

const item = { image: '/images/a.jpg', artistName: 'Zoia', styles: [] }

function renderSheet(props = {}) {
  const onClose = vi.fn()
  const describe = props.describe || vi.fn(async () => ({ text: 'A raven in black.', styles: ['blackwork'] }))
  render(
    <MemoryRouter>
      <DescribeTattoo item={item} onClose={onClose} describe={describe} {...props} />
    </MemoryRouter>
  )
  return { onClose, describe }
}

beforeEach(() => {
  localStorage.clear()
})

describe('DescribeTattoo', () => {
  it('without a Gemini key, points to Settings and sends nothing', () => {
    const { describe } = renderSheet()
    expect(screen.getByText(/needs a gemini key/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /settings/i }).getAttribute('href')).toBe('/settings')
    expect(describe).not.toHaveBeenCalled()
  })

  it('with a key, sends nothing until Describe is tapped', () => {
    localStorage.setItem('gemini_api_key', 'k1')
    const { describe } = renderSheet()
    expect(screen.getByText(/sends this one photo to google/i)).toBeTruthy()
    expect(describe).not.toHaveBeenCalled()
  })

  it('Describe describes the photo, shows the styles and keeps the result', async () => {
    localStorage.setItem('gemini_api_key', 'k1')
    const { describe } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Describe' }))
    expect(await screen.findByText('A raven in black.')).toBeTruthy()
    expect(screen.getByText('blackwork')).toBeTruthy()
    expect(describe).toHaveBeenCalledWith('k1', item.image)
    expect(readDescription(item.image)?.text).toBe('A raven in black.')
  })

  it('shows a kept description without asking again', () => {
    localStorage.setItem('gemini_api_key', 'k1')
    saveDescription(item.image, { text: 'A moth.', styles: [] })
    const { describe } = renderSheet()
    expect(screen.getByText('A moth.')).toBeTruthy()
    expect(describe).not.toHaveBeenCalled()
  })

  it('Describe again asks afresh', async () => {
    localStorage.setItem('gemini_api_key', 'k1')
    saveDescription(item.image, { text: 'A moth.', styles: [] })
    const { describe } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /describe again/i }))
    expect(await screen.findByText('A raven in black.')).toBeTruthy()
    expect(describe).toHaveBeenCalledTimes(1)
  })

  it('an error offers Try again', async () => {
    localStorage.setItem('gemini_api_key', 'k1')
    const describe = vi.fn()
      .mockRejectedValueOnce(new Error('Gemini request failed (500)'))
      .mockResolvedValueOnce({ text: 'A rose.', styles: [] })
    renderSheet({ describe })
    fireEvent.click(screen.getByRole('button', { name: 'Describe' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not describe/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('A rose.')).toBeTruthy()
  })

  it('says so when Gemini finds no tattoo, and keeps nothing', async () => {
    localStorage.setItem('gemini_api_key', 'k1')
    renderSheet({ describe: vi.fn(async () => ({ notTattoo: true })) })
    fireEvent.click(screen.getByRole('button', { name: 'Describe' }))
    expect(await screen.findByText(/didn.t find a tattoo/i)).toBeTruthy()
    expect(readDescription(item.image)).toBeNull()
  })

  it('Escape closes it', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('a late answer for a closed sheet is still kept, and a reopened sheet waits for it', async () => {
    localStorage.setItem('gemini_api_key', 'k1')
    let resolve
    const describe = vi.fn(() => new Promise((r) => { resolve = r }))
    const first = render(
      <MemoryRouter>
        <DescribeTattoo item={item} onClose={() => {}} describe={describe} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Describe' }))
    first.unmount()
    renderSheet({ describe })
    expect(screen.getByRole('status').textContent).toMatch(/describing/i)
    resolve({ text: 'Late.', styles: [] })
    expect(await screen.findByText('Late.')).toBeTruthy()
    expect(describe).toHaveBeenCalledTimes(1)
    expect(readDescription(item.image)?.text).toBe('Late.')
  })
})
