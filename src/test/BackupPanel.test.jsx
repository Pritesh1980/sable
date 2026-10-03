import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import BackupPanel from '../components/BackupPanel'

const rows = { artists: [], ideas: [], boards: [], concepts: [], conventionOverrides: {} }

it('shows request wording only after the portable export action completes', async () => {
  let complete
  const onExport = vi.fn(() => new Promise((resolve) => { complete = resolve }))
  render(<BackupPanel {...rows} onExport={onExport} />)
  fireEvent.click(screen.getByRole('button', { name: /export backup/i }))
  expect(screen.getByText(/preparing portable backup/i)).toBeInTheDocument()
  expect(screen.queryByText(/download requested/i)).not.toBeInTheDocument()
  complete()
  await waitFor(() => expect(screen.getByText(/download requested—check the file was saved/i)).toBeInTheDocument())
})

it('reports failed materialization without claiming a download request', async () => {
  render(<BackupPanel {...rows} onExport={async () => { throw Error('A local image is missing.') }} />)
  fireEvent.click(screen.getByRole('button', { name: /export backup/i }))
  await waitFor(() => expect(screen.getByText('A local image is missing.')).toBeInTheDocument())
  expect(screen.queryByText(/download requested/i)).not.toBeInTheDocument()
})
