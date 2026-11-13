import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setupServiceWorker } from '../sw/register'

function fakeEnv({ controller = null, registrations = [], cacheKeys = [] } = {}) {
  const listeners = {}
  const winListeners = {}
  const serviceWorker = {
    controller,
    register: vi.fn(() => Promise.resolve()),
    getRegistrations: vi.fn(() => Promise.resolve(registrations)),
    addEventListener: vi.fn((type, fn) => { listeners[type] = fn }),
  }
  const caches = {
    keys: vi.fn(() => Promise.resolve(cacheKeys)),
    delete: vi.fn(() => Promise.resolve(true)),
  }
  const win = {
    location: { reload: vi.fn() },
    addEventListener: vi.fn((type, fn) => { winListeners[type] = fn }),
  }
  return { serviceWorker, caches, win, listeners, winListeners }
}

describe('setupServiceWorker', () => {
  it('registers under the deploy base on load in a production build', () => {
    const env = fakeEnv()
    setupServiceWorker({ ...env, dev: false, base: '/sable/' })
    expect(env.serviceWorker.register).not.toHaveBeenCalled()
    env.winListeners.load()
    expect(env.serviceWorker.register).toHaveBeenCalledWith('/sable/sw.js')
  })

  it('reloads once when a new worker takes over an already-controlled page', () => {
    const env = fakeEnv({ controller: {} })
    setupServiceWorker({ ...env, dev: false, base: '/' })
    env.listeners.controllerchange()
    env.listeners.controllerchange()
    expect(env.win.location.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on the first-ever visit', () => {
    const env = fakeEnv({ controller: null })
    setupServiceWorker({ ...env, dev: false, base: '/' })
    env.listeners.controllerchange()
    expect(env.win.location.reload).not.toHaveBeenCalled()
  })

  // The SW serves same-origin GETs cache-first. Under `vite dev` module URLs
  // like /src/backend/index.js never change, so a cached copy outlives every
  // edit and env change (a stale VITE_PRIVATE_OWNER_ID locked the owner out).
  it('never registers under the dev server', () => {
    const env = fakeEnv()
    setupServiceWorker({ ...env, dev: true, base: '/' })
    env.winListeners.load?.()
    expect(env.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('removes a worker and caches left over from an earlier dev session, then reloads', async () => {
    const reg = { unregister: vi.fn(() => Promise.resolve(true)) }
    const env = fakeEnv({ controller: {}, registrations: [reg], cacheKeys: ['sable-v1', 'sable-share'] })
    await setupServiceWorker({ ...env, dev: true, base: '/' })
    expect(reg.unregister).toHaveBeenCalled()
    expect(env.caches.delete).toHaveBeenCalledWith('sable-v1')
    expect(env.caches.delete).toHaveBeenCalledWith('sable-share')
    // The page was served by the stale worker, so reload onto fresh modules.
    expect(env.win.location.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload in dev when nothing was registered', async () => {
    const env = fakeEnv({ controller: null, registrations: [] })
    await setupServiceWorker({ ...env, dev: true, base: '/' })
    expect(env.win.location.reload).not.toHaveBeenCalled()
  })

  it('is a no-op without service worker support', () => {
    expect(() => setupServiceWorker({ serviceWorker: undefined, dev: false, base: '/' })).not.toThrow()
  })
})

describe('main.jsx contract', () => {
  it('delegates registration to setupServiceWorker with the dev flag', () => {
    const src = readFileSync(resolve(__dirname, '../main.jsx'), 'utf8')
    expect(src).toMatch(/setupServiceWorker\(/)
    expect(src).toMatch(/import\.meta\.env\.DEV/)
    expect(src).not.toMatch(/serviceWorker\.register\(/)
  })
})
