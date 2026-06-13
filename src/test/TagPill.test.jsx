import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TagPill from '../components/TagPill'

describe('TagPill', () => {
  it('is an interactive button when given an onClick', () => {
    const onClick = vi.fn()
    render(<TagPill tag="blackwork" onClick={onClick} />)
    const btn = screen.getByRole('button', { name: 'blackwork' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalled()
  })

  it('renders a non-button element when decorative (no onClick), so it can sit inside clickable cards', () => {
    render(<TagPill tag="fine-line" active small />)
    expect(screen.getByText('fine-line')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
