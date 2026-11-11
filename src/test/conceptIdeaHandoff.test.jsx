import { StrictMode } from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router'
import { createConceptIdeaHandoff, takeConceptIdeaHandoff } from '../data/conceptIdeaHandoff'
import { createOwnerScope } from '../backend/ownerScope'
import { AuthContext } from '../context/auth-context'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'
import Brief from '../pages/Brief'

let scope
let owner
const draft = { id: 'reserved', title: 'Temple concept', description: 'Moon and temple', tags: ['blackwork'],
  placement: '', linkedArtists: [], status: 'idea', images: [{ key: 'user/a/ideas/reserved/p', note: 'AI concept' }] }
beforeEach(() => {
  owner = 'a'
  scope = createOwnerScope({ privateMode: true, getOwnerId: () => owner })
  registerBlobUrl(draft.images[0].key, 'data:image/png;base64,YQ==')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearBlobUrls() })
const ctx = () => ({ userId: owner, ownerScope: scope })

function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  return <><output aria-label="Location">{location.pathname + location.search}</output>
    <output aria-label="Pending draft">{location.state?.conceptIdeaRequest || ''}</output>
    <button onClick={() => navigate('/other')}>Elsewhere</button>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate(1)}>Browser forward</button>
    <button onClick={() => navigate('/brief?idea=other')}>Open other link</button></>
}
function tree(entry, ideas = [], setIdeas = vi.fn(), strict = false) {
  const content = <AuthContext.Provider value={{ user: { id: owner } }}><MemoryRouter initialEntries={[entry]}>
    <Navigation /><Routes><Route path="/brief" element={<Brief ideas={ideas} setIdeas={setIdeas} artists={[]} ownerScope={scope} />} />
      <Route path="/other" element={<p>Other page</p>} /></Routes>
  </MemoryRouter></AuthContext.Provider>
  return strict ? <StrictMode>{content}</StrictMode> : content
}

it('opens a staged draft without saving, then explicitly saves the full reserved-id record in StrictMode', async () => {
  const request = createConceptIdeaHandoff(draft, ctx())
  const setIdeas = vi.fn()
  render(tree({ pathname: '/brief', state: { conceptIdeaRequest: request } }, [], setIdeas, true))
  expect(await screen.findByPlaceholderText('Idea title…')).toHaveValue('Temple concept')
  expect(screen.getByPlaceholderText('Describe the concept, mood, imagery…')).toHaveValue('Moon and temple')
  expect(screen.getByPlaceholderText('What to borrow from this image…')).toHaveValue('AI concept')
  expect(document.querySelector('img[src="data:image/png;base64,YQ=="]')).toBeInTheDocument()
  expect(setIdeas).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  expect(setIdeas.mock.calls.at(-1)[0]([])).toEqual([draft])
})

it('discard and browser history cannot reopen a consumed unsaved draft', async () => {
  const request = createConceptIdeaHandoff(draft, ctx())
  const setIdeas = vi.fn()
  render(tree({ pathname: '/brief', state: { conceptIdeaRequest: request } }, [], setIdeas))
  await screen.findByPlaceholderText('Idea title…')
  fireEvent.click(screen.getByRole('button', { name: '← Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
  await screen.findByText('Other page')
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))
  await screen.findByRole('heading', { name: 'Ideas', exact: true })
  expect(screen.queryByPlaceholderText('Idea title…')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Browser forward' }))
  await screen.findByText('Other page')
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))
  await screen.findByRole('heading', { name: 'Ideas', exact: true })
  expect(screen.queryByPlaceholderText('Idea title…')).not.toBeInTheDocument()
  expect(setIdeas).not.toHaveBeenCalled()
  expect(takeConceptIdeaHandoff(request, ctx())).toBeNull()
})

it('waits for a saved target to hydrate, opens once and never resurrects a deleted record', async () => {
  const setIdeas = vi.fn()
  const view = render(tree('/brief?idea=reserved', [], setIdeas))
  expect(screen.queryByPlaceholderText('Idea title…')).not.toBeInTheDocument()
  view.rerender(tree('/brief?idea=reserved', [draft], setIdeas))
  await waitFor(() => expect(screen.getByPlaceholderText('Idea title…')).toHaveValue('Temple concept'))
  view.rerender(tree('/brief?idea=reserved', [], setIdeas))
  fireEvent.change(screen.getByPlaceholderText('Idea title…'), { target: { value: 'Changed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
  expect(setIdeas.mock.calls.at(-1)[0]([])).toEqual([])
  expect(screen.queryByPlaceholderText('Idea title…')).not.toBeInTheDocument()
})

it('does not replace an open editor when another saved-id link arrives', async () => {
  render(tree('/brief?idea=reserved', [draft, { ...draft, id: 'other', title: 'Other idea' }]))
  await screen.findByPlaceholderText('Idea title…')
  fireEvent.change(screen.getByPlaceholderText('Idea title…'), { target: { value: 'Unsaved work' } })
  fireEvent.click(screen.getByRole('button', { name: 'Open other link' }))
  expect(screen.getByPlaceholderText('Idea title…')).toHaveValue('Unsaved work')
})

it.each(['b', 'a'])('rejects a handoff after an owner transition ending at %s', async nextOwner => {
  const request = createConceptIdeaHandoff(draft, ctx())
  owner = 'b'
  scope.invalidate()
  owner = nextOwner
  render(tree({ pathname: '/brief', state: { conceptIdeaRequest: request } }))
  await waitFor(() => expect(screen.getByLabelText('Pending draft')).toBeEmptyDOMElement())
  expect(takeConceptIdeaHandoff(request, ctx())).toBeNull()
  expect(screen.queryByPlaceholderText('Idea title…')).not.toBeInTheDocument()
})

it('binds to the exact owner scope, consumes only once and bounds pending drafts', () => {
  const old = createConceptIdeaHandoff(draft, ctx())
  const latest = createConceptIdeaHandoff({ ...draft, title: 'Latest' }, ctx())
  expect(takeConceptIdeaHandoff(old, ctx())).toBeNull()
  expect(takeConceptIdeaHandoff(latest, ctx()).title).toBe('Latest')
  expect(takeConceptIdeaHandoff(latest, ctx())).toBeNull()
  const differentScope = createConceptIdeaHandoff(draft, ctx())
  expect(takeConceptIdeaHandoff(differentScope, { ...ctx(), ownerScope: createOwnerScope({ privateMode: true, getOwnerId: () => owner }) })).toBeNull()
  expect(takeConceptIdeaHandoff('unknown-after-reload', ctx())).toBeNull()
})
