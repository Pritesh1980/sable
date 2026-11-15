import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindConfig from '../../tailwind.config.js'
import Settings from '../pages/Settings'
import { ThemeProvider } from '../context/ThemeContext'

// #220 G: one font pair, one dark palette, no light theme.
const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const { colors, fontFamily } = tailwindConfig.theme.extend

const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

describe('one font pair', () => {
  it('display is Marcellus and body is Archivo', () => {
    expect(fontFamily.display[0]).toMatch(/Marcellus/)
    expect(fontFamily.body[0]).toMatch(/Archivo/)
    expect(fontFamily.mono[0]).toMatch(/Archivo/)
  })

  it('no font family names Playfair or DM Sans', () => {
    expect(JSON.stringify(fontFamily)).not.toMatch(/Playfair|DM Sans|DM Mono/)
  })

  it('index.html requests neither retired family and has no data-theme', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/Playfair|DM\+Sans|DM\+Mono|DM Sans/)
    expect(html).not.toMatch(/data-theme/)
  })
})

describe('one dark palette', () => {
  const css = read('src/index.css')
  const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1]
  const triplet = (name) => rootBlock.match(new RegExp(`--${name}:\\s*([\\d ]+);`))[1].trim()

  it('has no data-theme selector', () => {
    expect(css).not.toMatch(/data-theme/)
  })

  it.each([
    ['ink-black', 'v2-ink'],
    ['ink-card', 'v2-surface'],
    ['ink-border', 'v2-hairline'],
    ['cream', 'v2-cream'],
    ['cream-muted', 'v2-muted'],
  ])('--%s equals %s', (variable, token) => {
    expect(triplet(variable)).toBe(rgbOf(colors[token]))
  })
})

describe('no theme switch', () => {
  beforeEach(() => localStorage.clear())

  it('Settings renders no theme control', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <Settings artists={[]} setArtists={() => {}} ideas={[]} setIdeas={() => {}} boards={[]} setBoards={() => {}} concepts={[]} setConcepts={() => {}} conventionOverrides={{}} setConventionOverrides={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
    expect(screen.queryByRole('button', { name: 'Light' })).toBeNull()
    expect(screen.queryByText('Theme')).toBeNull()
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument()
  })

  it('clears a stored tattoo_theme at startup and stays dark', () => {
    localStorage.setItem('tattoo_theme', 'light')
    render(<ThemeProvider><p>x</p></ThemeProvider>)
    expect(localStorage.getItem('tattoo_theme')).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
