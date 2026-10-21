import { expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RefinementCompare from '../components/RefinementCompare'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'

afterEach(() => clearBlobUrls())

it('resolves stored source and variation keys without changing the saved references', () => {
  const source = 'user/A/concepts/c/source.png'
  const child = 'user/A/concepts/c/child.png'
  registerBlobUrl(source, '/source-preview.png')
  registerBlobUrl(child, '/child-preview.png')
  const tryOn = vi.fn()
  render(<RefinementCompare original={{ imageUrl: source }} parentAvailable
    variant={{ id: 'child', imageUrl: child, title: 'Saved child' }} onTryOn={tryOn} />)
  expect(screen.getByRole('img', { name: 'Original source' })).toHaveAttribute('src', '/source-preview.png')
  expect(screen.getByRole('img', { name: 'Saved child' })).toHaveAttribute('src', '/child-preview.png')
  fireEvent.click(screen.getByRole('button', { name: 'Try variation on skin' }))
  expect(tryOn).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: child }))
})

it('labels a missing source without hiding its saved variation', () => {
  render(<RefinementCompare original={null} parentAvailable={false}
    variant={{ id: 'child', imageUrl: '/child.png', title: 'Mist variation', parentVariantId: 'deleted' }}
    onMarkBest={() => {}} onRate={() => {}} onTryOn={() => {}} />)
  expect(screen.getByText('Source image unavailable')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Mist variation' })).toHaveAttribute('src', '/child.png')
})

it('routes Best, numeric rating and try-on actions to the saved variation', () => {
  const best = vi.fn(), rate = vi.fn(), tryOn = vi.fn()
  render(<RefinementCompare original={{ imageUrl: '/original.png' }} parentAvailable
    variant={{ id: 'child', imageUrl: '/child.png', title: 'Mist variation', rating: 3 }}
    onMarkBest={best} onRate={rate} onTryOn={tryOn} />)
  expect(screen.getByRole('img', { name: 'Original source' })).toHaveAttribute('src', '/original.png')
  fireEvent.click(screen.getByRole('button', { name: 'Mark variation as Best' }))
  expect(best).toHaveBeenCalledWith('child')
  fireEvent.change(screen.getByLabelText('Variation rating'), { target: { value: '5' } })
  expect(rate).toHaveBeenCalledWith('child', 5)
  fireEvent.click(screen.getByRole('button', { name: 'Try variation on skin' }))
  expect(tryOn).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'child', imageUrl: '/child.png' }))
})
