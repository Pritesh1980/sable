import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConceptIdeaDialog from '../components/ConceptIdeaDialog'

const source = { concept: { id: 'c', prompt: 'Temple' }, variant: { id: 'v', title: '3D arm preview' }, imageUrl: '/chosen.png' }
const mount = (props = {}) => render(<ConceptIdeaDialog source={source} ideas={[]} busy={false} error="" onClose={() => {}} onSubmit={() => {}} {...props} />)

it('offers a new draft, an editable note, and a clear empty existing-ideas state', () => {
  const onSubmit = vi.fn()
  mount({ onSubmit })
  fireEvent.change(screen.getByRole('textbox', { name: 'Reference note' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create idea' }))
  expect(onSubmit).toHaveBeenCalledWith({ note: '' })
  fireEvent.click(screen.getByRole('button', { name: 'Add to existing idea' }))
  expect(screen.getByText(/No saved ideas/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add image to idea' })).toBeDisabled()
})

it('filters destinations by title and appends only after explicit confirmation', () => {
  const onSubmit = vi.fn()
  mount({ ideas: [{ id: 'i', title: 'Forearm study' }, { id: 'j', title: 'Back piece' }], onSubmit })
  fireEvent.click(screen.getByRole('button', { name: 'Add to existing idea' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search ideas' }), { target: { value: 'FOREARM' } })
  expect(screen.queryByRole('button', { name: 'Back piece' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Forearm study' }))
  expect(onSubmit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Add image to idea' }))
  expect(onSubmit).toHaveBeenCalledWith({ ideaId: 'i', note: '3D arm preview' })
})

it('keeps Cancel usable while staging and marks Escape handled', () => {
  const onClose = vi.fn()
  mount({ busy: true, onClose })
  expect(screen.getByRole('button', { name: 'Copying image…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(false)
  expect(onClose).toHaveBeenCalledTimes(1)
})
