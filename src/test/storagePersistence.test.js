import { expect, it, vi } from 'vitest'
import { getStoragePersistence } from '../data/storagePersistence'

it('reports granted persistence already held without requesting it', async () => {
  const persist = vi.fn()
  expect(await getStoragePersistence({ persisted: async () => true, persist })).toBe('granted')
  expect(persist).not.toHaveBeenCalled()
})

it('reports refusal and unavailable APIs honestly', async () => {
  expect(await getStoragePersistence({ persisted: async () => false, persist: async () => false }, { request: true })).toBe('denied')
  expect(await getStoragePersistence({ persisted: async () => { throw Error('blocked') }, persist: async () => true })).toBe('unavailable')
  expect(await getStoragePersistence(null)).toBe('unavailable')
})
