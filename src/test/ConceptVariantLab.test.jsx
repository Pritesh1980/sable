import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ConceptVariantLab from '../components/ConceptVariantLab'

const baseConcept = {
  id: 'concept-1',
  prompt: 'Raven chest tattoo',
  variants: [],
}

const noop = () => {}

function renderLab(props = {}) {
  return render(
    <ConceptVariantLab
      concept={baseConcept}
      onAddVariant={noop}
      onMarkBest={noop}
      onDeleteVariant={noop}
      onRateVariant={noop}
      {...props}
    />
  )
}

function ControlledLab() {
  const [concept, setConcept] = useState(baseConcept)

  function addVariant(conceptId, input) {
    setConcept((current) => ({
      ...current,
      variants: [
        {
          id: `${conceptId}-saved`,
          ...input,
          isBest: false,
          createdAt: '2026-05-31T09:00:00.000Z',
        },
      ],
    }))
  }

  return (
    <ConceptVariantLab
      concept={concept}
      onAddVariant={addVariant}
      onMarkBest={noop}
      onDeleteVariant={noop}
      onRateVariant={noop}
    />
  )
}

describe('ConceptVariantLab', () => {
  it('renders AI Results and Add Result when there are no variants', () => {
    renderLab()

    expect(screen.getByRole('heading', { name: 'AI Results' })).toBeTruthy()
    expect(screen.getByText('0 results')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Result' })).toBeTruthy()
  })

  it('saving a variant with image URL and AI text calls onAddVariant with the payload', () => {
    const onAddVariant = vi.fn()
    renderLab({ onAddVariant })

    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'chatgpt' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Raven silhouette' } })
    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: 'https://example.com/raven.png' },
    })
    fireEvent.change(screen.getByLabelText('AI text'), {
      target: { value: 'Strong shape but simplify feathers.' },
    })
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Best candidate so far.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rating 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    expect(onAddVariant).toHaveBeenCalledWith('concept-1', {
      provider: 'chatgpt',
      title: 'Raven silhouette',
      imageUrl: 'https://example.com/raven.png',
      response: 'Strong shape but simplify feathers.',
      notes: 'Best candidate so far.',
      rating: 4,
    })
  })

  it('reads a dropped image file into the image URL field', async () => {
    renderLab()

    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))
    fireEvent.drop(screen.getByLabelText('Image drop zone'), {
      dataTransfer: {
        files: [new File(['raven'], 'raven.png', { type: 'image/png' })],
        getData: () => '',
      },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Image URL').value).toMatch(/^data:image\/png;base64,/)
    })
  })

  it('reads a dropped http URL into the image URL field', () => {
    renderLab()

    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))
    fireEvent.drop(screen.getByLabelText('Image drop zone'), {
      dataTransfer: {
        files: [],
        getData: (type) => (type === 'text/uri-list' ? 'https://example.com/dropped.png' : ''),
      },
    })

    expect(screen.getByLabelText('Image URL')).toHaveValue('https://example.com/dropped.png')
  })

  it('renders a saved image and text result after the parent updates concept variants', () => {
    render(<ControlledLab />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Raven silhouette' } })
    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: 'https://example.com/raven.png' },
    })
    fireEvent.change(screen.getByLabelText('AI text'), {
      target: { value: 'Strong shape but simplify feathers.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    expect(screen.getByText('1 result')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Raven silhouette thumbnail' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Raven silhouette result details' }))

    expect(screen.getByRole('img', { name: 'Raven silhouette result' })).toBeTruthy()
    expect(screen.getByText('Strong shape but simplify feathers.')).toBeTruthy()
  })

  it('renders the best badge and can mark another variant best from expanded details', () => {
    const onMarkBest = vi.fn()
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-old',
            provider: 'gemini',
            title: 'Critique',
            imageUrl: '',
            response: 'Simplify it.',
            notes: '',
            rating: 3,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
          {
            id: 'variant-best',
            provider: 'chatgpt',
            title: 'Image pass',
            imageUrl: 'data:image/png;base64,best',
            response: '',
            notes: 'Strong silhouette.',
            rating: 5,
            isBest: true,
            createdAt: '2026-05-31T07:00:00.000Z',
          },
        ],
      },
      onMarkBest,
    })

    expect(screen.getByText('Best')).toBeTruthy()
    expect(screen.getByText('2 results')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Result' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Critique result details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark Critique as Best' }))

    expect(onMarkBest).toHaveBeenCalledWith('concept-1', 'variant-old')
  })

  it('shows provider and created date metadata in expanded details', () => {
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-claude',
            provider: 'claude',
            title: 'Claude pass',
            imageUrl: '',
            response: 'Use this as artist-facing language.',
            notes: '',
            rating: 4,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand Claude pass result details' }))

    expect(screen.getByText('Provider')).toBeTruthy()
    expect(screen.getAllByText('Claude').length).toBeGreaterThan(0)
    expect(screen.getByText('Created')).toBeTruthy()
    expect(screen.getByText('31 May 2026')).toBeTruthy()
  })

  it('clamps malformed high stored ratings in summaries', () => {
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-overrated',
            provider: 'chatgpt',
            title: 'Overrated',
            imageUrl: '',
            response: 'Too much detail.',
            notes: '',
            rating: 99,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
        ],
      },
    })

    expect(screen.getByText('5/5')).toBeTruthy()
    expect(screen.queryByText('99/5')).toBeNull()
  })

  it('calls onRateVariant and onDeleteVariant from expanded details', () => {
    const onRateVariant = vi.fn()
    const onDeleteVariant = vi.fn()
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-actions',
            provider: 'gemini',
            title: 'Action check',
            imageUrl: '',
            response: 'Simplify it.',
            notes: '',
            rating: 2,
            isBest: false,
            createdAt: '2026-05-31T08:00:00.000Z',
          },
        ],
      },
      onRateVariant,
      onDeleteVariant,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand Action check result details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rate Action check 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onRateVariant).toHaveBeenCalledWith('concept-1', 'variant-actions', 5)
    expect(onDeleteVariant).toHaveBeenCalledWith('concept-1', 'variant-actions')
  })

  it('renders malformed variant display fields without crashing', () => {
    renderLab({
      concept: {
        ...baseConcept,
        variants: [
          {
            id: 'variant-malformed',
            provider: { id: 'chatgpt' },
            title: { text: 'Object title' },
            imageUrl: { src: 'https://example.com/object.png' },
            response: { text: 'Object response' },
            notes: ['array note'],
            rating: { value: 5 },
            isBest: false,
            createdAt: 'not-a-date',
          },
        ],
      },
    })

    expect(screen.getByText('Untitled result')).toBeTruthy()
    expect(screen.getByText('Other')).toBeTruthy()
    expect(screen.getByText('Unrated')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Expand Untitled result result details' }))

    expect(screen.getByText('No AI text saved.')).toBeTruthy()
    expect(screen.getByText('No notes saved.')).toBeTruthy()
    expect(screen.getByText('Date unknown')).toBeTruthy()
  })

  it('keeps Save Result disabled until image URL, AI text, or notes exists', () => {
    renderLab()

    fireEvent.click(screen.getByRole('button', { name: 'Add Result' }))

    const save = screen.getByRole('button', { name: 'Save Result' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Promising direction.' } })

    expect(save).toBeEnabled()
  })
})
