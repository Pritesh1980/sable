import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RefinementComposer from '../components/RefinementComposer'

const draft = { change: 'More mist / પ્રીતેશ', keep: 'Temple / プリテシュ', palette: 'colour' }
const state = { open: true, draft, source: { previewUrl: '/source.png', blob: new Blob(['png']) },
  phase: 'ready', job: null, pending: null, error: null, recoverableJobs: [] }
const caps = { enabled: true, provider: 'openai', profile: { id: 'openai-refine-v1', model: 'resolved-model',
  size: '1024x1024', quality: 'medium' }, quota: { dailyRemaining: 10, active: 0 } }

it('keeps manual actions when paid capability and persistence are unavailable', () => {
  const copy = vi.fn()
  render(<RefinementComposer state={state} capabilities={{ enabled: false }} persistence="unavailable"
    onCopyPrompt={copy} onClose={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Generate one variation' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Copy refinement prompt' }))
  expect(copy).toHaveBeenCalledOnce()
  expect(copy.mock.calls[0][0]).toContain('Palette: colour is allowed.')
  expect(copy.mock.calls[0][0]).toContain('પ્રીતેશ')
  expect(copy.mock.calls[0][0]).not.toMatch(/monochrome|no text/i)
  expect(screen.getByText(/does not attach the image/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export source image' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Import variation' })).toBeInTheDocument()
})

it('shows the uncropped prepared source, exact prompt, provider profile and explicit upload consent', () => {
  const submit = vi.fn()
  render(<RefinementComposer state={state} capabilities={caps} persistence="granted" onSubmit={submit} onClose={() => {}} />)
  expect(screen.getByRole('img', { name: 'Prepared source image' })).toHaveAttribute('src', '/source.png')
  expect(screen.getByLabelText('Outgoing prompt').textContent).toContain('Preserve:')
  expect(screen.getByText(/resolved-model/)).toBeInTheDocument()
  expect(screen.getByText(/one paid OpenAI image/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'OpenAI privacy policy' })).toHaveAttribute('href', 'https://openai.com/policies/privacy-policy/')
  expect(screen.getByRole('button', { name: 'Generate one variation' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /send this image and prompt to OpenAI/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Generate one variation' }))
  expect(submit).toHaveBeenCalledWith({ storageWarningAccepted: false })
})

it('requires the storage acknowledgement for a paid request but not for manual export', () => {
  const submit = vi.fn(), download = vi.fn()
  render(<RefinementComposer state={state} capabilities={caps} persistence="denied"
    onSubmit={submit} onExportSource={download} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox', { name: /send this image and prompt to OpenAI/i }))
  expect(screen.getByRole('button', { name: 'Generate one variation' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Export source image' }))
  expect(download).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('checkbox', { name: /browser storage may be cleared/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Generate one variation' }))
  expect(submit).toHaveBeenCalledWith({ storageWarningAccepted: true })
})

it('retains draft values on failure and routes changes through the controlled draft callback', () => {
  const change = vi.fn()
  render(<RefinementComposer state={{ ...state, error: { code: 'acceptance_unknown' } }} capabilities={caps}
    persistence="granted" onDraftChange={change} onClose={() => {}} />)
  expect(screen.getByLabelText('Change')).toHaveValue(draft.change)
  expect(screen.getByLabelText('Keep')).toHaveValue(draft.keep)
  expect(screen.getByRole('alert')).toHaveTextContent(/acceptance is unknown/i)
  fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'Edited draft' } })
  expect(change).toHaveBeenCalledWith({ change: 'Edited draft' })
  expect(screen.getByRole('button', { name: 'Generate one variation' })).toHaveClass('focus-visible:outline-2')
})

it('offers explicit raster selection when source reading failed', () => {
  const select = vi.fn()
  render(<RefinementComposer state={{ ...state, source: null, error: { code: 'source_unreadable' } }}
    capabilities={{ enabled: false }} onSelectSource={select} onClose={() => {}} />)
  const file = new File(['photo'], 'photo.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Source image file'), { target: { files: [file] } })
  expect(select).toHaveBeenCalledWith(file)
  expect(screen.getByRole('button', { name: 'Export source image' })).toBeDisabled()
})

it('requires explicit provider attribution and file selection before importing a manual variation', () => {
  const importing = vi.fn()
  render(<RefinementComposer state={state} capabilities={{ enabled: false }}
    onImportVariation={importing} onClose={() => {}} />)
  expect(screen.getByRole('button', { name: 'Import variation' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Variation provider'), { target: { value: 'chatgpt' } })
  const file = new File(['variation'], 'variation.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Variation image'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Import variation' }))
  expect(importing).toHaveBeenCalledWith(file, 'chatgpt')
})
