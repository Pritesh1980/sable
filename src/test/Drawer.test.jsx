import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Drawer from '../components/Drawer'

function renderDrawer(props = {}) {
  return render(
    <MemoryRouter>
      <Drawer onClose={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

describe('Drawer', () => {
  it('lists all seven destinations with links', () => {
    renderDrawer()
    const expected = [
      ['Classic gallery', '/gallery'],
      ['Ideas', '/brief'],
      ['Pipeline', '/pipeline'],
      ['Radar', '/conventions'],
      ['Studios', '/studios'],
      ['Settings', '/settings'],
      ['Help', '/help'],
    ]
    expected.forEach(([label, href]) => {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
      expect(link).toHaveAttribute('href', href)
    })
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
