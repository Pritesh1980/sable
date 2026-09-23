import { useEffect, useState } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Concepts from '../pages/Concepts'
import { UndoProvider } from '../context/UndoContext'

// #95 — deleting a concept (image, variants, notes and all) was instant and
// final. It now goes through the app's Undo bar, like removing a photo.

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))

let latest = []

function Harness({ initialConcepts }) {
  const [concepts, setConcepts] = useState(initialConcepts)
  useEffect(() => { latest = concepts }, [concepts])
  return (
    <UndoProvider>
      <MemoryRouter initialEntries={['/concepts']}>
        <Concepts concepts={concepts} setConcepts={setConcepts} artists={[]} ideas={[]} />
      </MemoryRouter>
    </UndoProvider>
  )
}

const raven = { id: 'r', prompt: 'A raven', imageUrl: '/img/raven.png', tags: [], variants: [{ id: 'v1', notes: 'keep' }] }
const wolf = { id: 'w', prompt: 'A wolf', imageUrl: '/img/wolf.png', tags: [] }
const moth = { id: 'm', prompt: 'A moth', imageUrl: '', tags: [] }

describe('Deleting a concept can be undone (#95)', () => {
  beforeEach(() => localStorage.clear())

  it('from the full-screen viewer: removed, then restored intact in place by Undo', () => {
    render(<Harness initialConcepts={[raven, wolf]} />)
    fireEvent.click(screen.getAllByAltText('A raven')[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }))

    expect(latest.map((c) => c.id)).toEqual(['w'])
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))

    expect(latest.map((c) => c.id)).toEqual(['r', 'w'])
    expect(latest[0]).toEqual(raven)
  })

  it('from a draft card on the page', () => {
    render(<Harness initialConcepts={[raven, moth]} />)
    fireEvent.click(screen.getByRole('button', { name: /delete concept a moth/i }))

    expect(latest.map((c) => c.id)).toEqual(['r'])
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(latest.map((c) => c.id)).toEqual(['r', 'm'])
  })
})
