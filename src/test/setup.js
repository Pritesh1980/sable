import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

// jsdom's localStorage doesn't always implement .clear() — provide a full in-memory mock
const _store = {}
const localStorageMock = {
  getItem: (key) => _store[key] ?? null,
  setItem: (key, value) => { _store[key] = String(value) },
  removeItem: (key) => { delete _store[key] },
  clear: () => { Object.keys(_store).forEach((k) => delete _store[k]) },
  get length() { return Object.keys(_store).length },
  key: (i) => Object.keys(_store)[i] ?? null,
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })
