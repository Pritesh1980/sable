import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Concepts from '../pages/Concepts'
import { buildPromptPackFromFreeText } from '../data/promptPacks'

const ravenPromptPack = buildPromptPackFromFreeText(
  'Raven chest piece with blackwork botanicals',
  { createdAt: '2026-05-31T10:00:00.000Z' }
)

const mothPromptPack = buildPromptPackFromFreeText(
  'Moth shoulder piece with dark florals',
  { createdAt: '2026-05-31T11:00:00.000Z' }
)

const initialConcepts = [{
  id: 'concept-1',
  prompt: ravenPromptPack.sourceSummary,
  promptPack: ravenPromptPack,
  imageUrl: '',
  response: '',
  tags: [],
  createdAt: ravenPromptPack.createdAt,
}, {
  id: 'concept-2',
  prompt: mothPromptPack.sourceSummary,
  promptPack: mothPromptPack,
  imageUrl: '',
  response: '',
  tags: [],
  createdAt: mothPromptPack.createdAt,
}]

const duplicateVariantConcepts = initialConcepts.map((concept, index) => ({
  ...concept,
  variants: [{
    id: `variant-${index + 1}`,
    provider: 'chatgpt',
    title: 'Image pass',
    imageUrl: '',
    response: 'Keep the shape readable.',
    notes: '',
    rating: 3,
    isBest: false,
    createdAt: '2026-05-31T12:00:00.000Z',
  }],
}))

function ConceptsHarness() {
  const [concepts, setConcepts] = useState(initialConcepts)

  return (
    <Concepts
      concepts={concepts}
      setConcepts={setConcepts}
      artists={[]}
      ideas={[]}
    />
  )
}

function DuplicateVariantHarness() {
  const [concepts, setConcepts] = useState(duplicateVariantConcepts)

  return (
    <Concepts
      concepts={concepts}
      setConcepts={setConcepts}
      artists={[]}
      ideas={[]}
    />
  )
}

describe('Concepts variant integration', () => {
  it('keeps repeated concept actions distinguishable while adding and editing one concept result', () => {
    render(<ConceptsHarness />)

    expect(screen.getAllByText('Saved prompt pack')).toHaveLength(2)
    expect(screen.getAllByRole('heading', { name: 'AI Results' })).toHaveLength(2)
    expect(screen.getAllByText('0 results')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Add Result' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', {
      name: 'Add result to Raven chest piece with blackwork botanicals',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Add result to Moth shoulder piece with dark florals',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Delete concept Raven chest piece with blackwork botanicals',
    })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Add result to Moth shoulder piece with dark florals',
    }))
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Moth silhouette pass' },
    })
    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: 'https://example.com/moth.png' },
    })
    fireEvent.change(screen.getByLabelText('AI text'), {
      target: { value: 'Strong silhouette; simplify the wing texture.' },
    })
    fireEvent.click(screen.getByRole('button', {
      name: 'Rating for Moth shoulder piece with dark florals 4',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Save result for Moth shoulder piece with dark florals',
    }))

    expect(screen.getByText('1 result')).toBeInTheDocument()
    expect(screen.getAllByText('0 results')).toHaveLength(1)
    expect(screen.getByText('Moth silhouette pass')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Moth silhouette pass thumbnail' })).toBeInTheDocument()
    expect(screen.getAllByText('Saved prompt pack')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', {
      name: 'Expand Moth silhouette pass result for Moth shoulder piece with dark florals',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Rate Moth silhouette pass for Moth shoulder piece with dark florals 5',
    }))

    expect(screen.getByText('5/5')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Delete Moth silhouette pass result for Moth shoulder piece with dark florals',
    }))

    expect(screen.queryByText('Moth silhouette pass')).not.toBeInTheDocument()
    expect(screen.getAllByText('0 results')).toHaveLength(2)
  })

  it('scopes duplicate saved result action names by concept', () => {
    render(<DuplicateVariantHarness />)

    expect(screen.getAllByText('Image pass')).toHaveLength(2)
    expect(screen.queryByRole('button', {
      name: 'Expand Image pass result details',
    })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Expand Image pass result for Raven chest piece with blackwork botanicals',
    }))

    expect(screen.getByRole('button', {
      name: 'Rate Image pass for Raven chest piece with blackwork botanicals 5',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Mark Image pass as Best for Raven chest piece with blackwork botanicals',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Delete Image pass result for Raven chest piece with blackwork botanicals',
    })).toBeInTheDocument()
  })

  it('opens the relief STL drawer from an image result variant', () => {
    const concepts = [{
      id: 'concept-1',
      prompt: 'Raven chest tattoo',
      imageUrl: '',
      response: '',
      tags: [],
      createdAt: '2026-05-31T08:00:00.000Z',
      variants: [{
        id: 'variant-image',
        provider: 'chatgpt',
        title: 'Relief candidate',
        imageUrl: 'data:image/png;base64,relief',
        response: '',
        notes: '',
        rating: 4,
        isBest: false,
        createdAt: '2026-05-31T08:00:00.000Z',
      }],
    }]

    render(
      <Concepts
        concepts={concepts}
        setConcepts={() => {}}
        artists={[]}
        ideas={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Expand Relief candidate result for Raven chest tattoo',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Make STL from Relief candidate result for Raven chest tattoo',
    }))

    expect(screen.getByRole('dialog', { name: 'Make Relief STL' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Relief candidate STL source' })).toBeInTheDocument()
  })
})
