import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'

// #149: every device has run the #118 sweep, so the legacy artist photo cache
// (IndexedDB `tattoo-images-v1`) and the sweep are gone. Only sign-out still
// names the old stores, to clean up a device that never launched since.

const LEGACY_DB = 'tattoo-images-v1'
const STAMP = '2026-09-01T10:00:00.000Z'
const firstId = DEFAULT_ARTISTS[0].id

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

function putLegacy(id, images) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('artist-images')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('artist-images', 'readwrite')
      tx.objectStore('artist-images').put(images, id)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}

function deleteLegacy() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(LEGACY_DB)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  localStorage.clear()
  await deleteLegacy()
})
afterEach(() => vi.restoreAllMocks())

describe('legacy photo cache retired (#149)', () => {
  it('the artists store never opens the legacy cache, and a photo only there never shows', async () => {
    const rows = DEFAULT_ARTISTS.map((a) => ({ ...a, images: [], updatedAt: STAMP }))
    localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
    localStorage.setItem('tattoo_artists_meta', JSON.stringify(rows))
    localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows))
    await putLegacy(firstId, ['data:image/png;base64,TEVHQUNZ'])
    const open = vi.spyOn(indexedDB, 'open')

    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())
    // Let mount, hydration and the first pull all run.
    await new Promise((r) => setTimeout(r, 50))

    expect(open.mock.calls.map(([name]) => name)).not.toContain(LEGACY_DB)
    const artist = result.current[0].find((a) => a.id === firstId)
    expect(JSON.stringify(artist.images)).not.toContain('TEVHQUNZ')
  })

  it('the sweep and cache modules are gone', () => {
    expect(existsSync(join(__dirname, '../data/legacyPhotoSweep.js'))).toBe(false)
    expect(existsSync(join(__dirname, '../data/legacyArtistImages.js'))).toBe(false)
  })

  it('only sign-out still names the legacy stores', () => {
    const src = join(__dirname, '..')
    const files = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { if (name !== 'test') walk(p) }
        else if (/\.(js|jsx)$/.test(name)) files.push(p)
      }
    }
    walk(src)
    const naming = files
      .filter((p) => /tattoo-images-v1|tattoo_legacy_sweep_v1/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(src.length + 1))
    expect(naming).toEqual(['backend/purge.js'])
  })
})
