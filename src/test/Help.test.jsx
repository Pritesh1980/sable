import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import HelpPage from '../pages/Help'
import { HELP_GROUPS, GUIDE_BASE } from '../data/helpTopics'

const Help = () => <MemoryRouter><HelpPage /></MemoryRouter>
const topics = HELP_GROUPS.flatMap((group) => group.topics)

describe('Help page (#220 I)', () => {
  it('opens as a list of questions under group headings, all closed', () => {
    render(<Help />)
    for (const group of HELP_GROUPS) {
      expect(screen.getByRole('heading', { name: group.label })).toBeInTheDocument()
    }
    for (const topic of topics) {
      expect(screen.getByRole('button', { name: topic.question })).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.queryByRole('list', { name: /steps/i })).not.toBeInTheDocument()
  })

  it('shows the short answer and a link to its part of the full guide', () => {
    render(<Help />)
    const topic = topics.find((t) => t.id === 'add-artist')
    const button = screen.getByRole('button', { name: topic.question })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const steps = screen.getByRole('list', { name: `Steps: ${topic.question}` })
    expect(steps.querySelectorAll('li')).toHaveLength(topic.steps.length)
    expect(screen.getByRole('img', { name: topic.question })).toHaveAttribute('src', expect.stringContaining(`guide/${topic.image}`))
    const more = screen.getByRole('link', { name: /more in the full guide/i })
    expect(more).toHaveAttribute('href', `${GUIDE_BASE}${topic.guide}`)
    expect(more).toHaveAttribute('target', '_blank')
    expect(more).toHaveAttribute('rel', expect.stringContaining('noopener'))
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('links the whole guide from the top of the page', () => {
    render(<Help />)
    expect(screen.getByRole('link', { name: /full guide/i })).toHaveAttribute('href', `${GUIDE_BASE}README.md`)
  })
})
