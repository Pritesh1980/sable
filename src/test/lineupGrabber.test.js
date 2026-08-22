import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildGrabber, grabberBody, parseLineupHash, MAX_HANDOFF_CHARS } from '../data/lineupGrabber'
import { parseLineup } from '../data/lineup'

const APP_URL = 'https://pritesh1980.github.io/sable/'

function grabber(conventionId = 'big-london') {
  return buildGrabber({ appUrl: APP_URL, conventionId })
}

// The bookmarklet is shipped as source text, so the only honest test is to run
// the artifact itself against a page that behaves like a lazy-loading line-up.
function runGrabber(url = grabber()) {
  // Exactly what a browser does with the bookmarklet: strip the scheme, run it.
  const code = url.replace(/^javascript:/, '')
  new Function(code)()
  vi.advanceTimersByTime(60_000)
}

// A browser runs the bookmarklet as-is; this is just how a test reads what is
// inside the base64 the browser would eval.
function decode(url) {
  return atob(url.replace(/^javascript:eval\(atob\('/, '').replace(/'\)\)$/, ''))
}

let clipboard

beforeEach(() => {
  vi.useFakeTimers()
  clipboard = vi.fn(() => Promise.resolve())
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboard },
    configurable: true,
  })
  window.scrollTo = vi.fn()
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
})

function copied() {
  expect(clipboard).toHaveBeenCalled()
  return clipboard.mock.calls.at(-1)[0]
}

describe('buildGrabber', () => {
  it('is a single-line javascript: URL', () => {
    const url = grabber()
    expect(url.startsWith('javascript:')).toBe(true)
    expect(url).not.toMatch(/\r|\n/)
  })

  it('contains no character that would truncate or mangle it in a bookmark', () => {
    // A literal # ends the URL and a bare % starts a percent-escape — either
    // silently corrupts the saved bookmarklet.
    const url = grabber()
    expect(url).not.toContain('#')
    expect(url).not.toContain('%')
  })

  it('embeds the source verbatim rather than rewriting it', () => {
    // The regression this exists for: an earlier build collapsed the source's
    // whitespace onto one line. That is invisible in dev but destructive in
    // production, where the minifier rewrites '\n' as a template literal
    // holding a real newline — collapsing it turned every line break in the
    // harvest into a space, and the whole line-up arrived as one unparseable
    // line. Encoding keeps whatever the minifier emitted intact.
    const decoded = decode(grabber())
    expect(decoded).toContain(grabberBody.toString().replace('SABLE_APP_URL', APP_URL).replace('SABLE_SHOW_ID', 'big-london'))
  })

  it('is ASCII-only, because btoa cannot encode anything else', () => {
    // eslint-disable-next-line no-control-regex
    expect(grabberBody.toString()).toMatch(/^[\x00-\x7F]*$/)
  })

  it('cannot be broken out of by what gets substituted into it', () => {
    const decoded = decode(buildGrabber({ appUrl: "https://evil'+alert(1)+'", conventionId: "x'" }))
    // Stripped of quotes and backslashes, so it cannot close the string literal
    // it lands in: the injected text survives as inert text, and the whole
    // bookmarklet still parses.
    const appValue = decoded.match(/var APP = ['"]([^\n]*?)['"];?\n/)[1]
    expect(appValue).not.toMatch(/['"`\\]/)
    expect(() => new Function(decoded)).not.toThrow()
    // Quote style is whatever the transform emits — the point is the value.
    expect(decoded).toMatch(/var SHOW = ['"]x['"]/)
  })

  it('embeds the app it should hand off to and the show it is grabbing', () => {
    const decoded = decode(grabber('brighton'))
    expect(decoded).toContain(APP_URL)
    expect(decoded).toMatch(/var SHOW = ['"]brighton['"]/)
  })
})

describe('the grabber, run on a line-up page', () => {
  it('harvests instagram links as "Name @handle" lines', () => {
    document.body.innerHTML = `
      <a href="https://www.instagram.com/oscarakermo/">Oscar Akermo</a>
      <a href="https://instagram.com/kubalizmus">Martin Kubala</a>
    `
    runGrabber()
    expect(copied()).toBe('Oscar Akermo @oscarakermo\nMartin Kubala @kubalizmus')
  })

  it('takes the name from a nearby heading when the link is just the handle', () => {
    document.body.innerHTML = `
      <article><h3>Ate Wamz</h3><a href="https://instagram.com/atewamz">@atewamz</a></article>
    `
    runGrabber()
    expect(copied()).toBe('Ate Wamz @atewamz')
  })

  it('dedupes repeated links and ignores post/profile-chrome URLs', () => {
    document.body.innerHTML = `
      <a href="https://instagram.com/kubalizmus">Martin Kubala</a>
      <a href="https://instagram.com/kubalizmus">Martin Kubala</a>
      <a href="https://www.instagram.com/p/Cabc123/">A post</a>
      <a href="https://www.instagram.com/explore/tags/tattoo/">Explore</a>
    `
    runGrabber()
    expect(copied()).toBe('Martin Kubala @kubalizmus')
  })

  it('falls back to the page text when the line-up links nobody', () => {
    document.body.innerHTML = '<div>ignored</div>'
    Object.defineProperty(document.body, 'innerText', {
      value: 'Artist List\nAte Wamz\nMartin Kubala',
      configurable: true,
    })
    runGrabber()
    expect(copied()).toContain('Ate Wamz')
  })

  it('scrolls the page to force the lazy list to load, then returns to the top', () => {
    document.body.innerHTML = '<a href="https://instagram.com/atewamz">Ate Wamz</a>'
    runGrabber()
    expect(window.scrollTo).toHaveBeenCalled()
    expect(window.scrollTo.mock.calls.at(-1)).toEqual([0, 0])
  })

  it('clicks a "load more" control if the page has one', () => {
    document.body.innerHTML = `
      <button id="more">Load more</button>
      <a href="https://instagram.com/atewamz">Ate Wamz</a>
    `
    const click = vi.fn()
    document.getElementById('more').addEventListener('click', click)
    runGrabber()
    expect(click).toHaveBeenCalled()
  })

  it('shows the count and a one-tap hand-off back into Sable', () => {
    document.body.innerHTML = `
      <a href="https://instagram.com/oscarakermo">Oscar Akermo</a>
      <a href="https://instagram.com/kubalizmus">Martin Kubala</a>
    `
    runGrabber()
    const overlay = document.querySelector('[data-sable-grabber]')
    expect(overlay).not.toBeNull()
    expect(overlay.textContent).toMatch(/2 artists/)

    const link = overlay.querySelector('a')
    expect(link.getAttribute('href')).toContain(`${APP_URL}conventions#lineup=big-london&data=`)
    const handed = parseLineupHash(new URL(link.getAttribute('href')).hash)
    expect(handed.conventionId).toBe('big-london')
    expect(handed.text).toBe('Oscar Akermo @oscarakermo\nMartin Kubala @kubalizmus')
  })

  it('leaves the harvest in a textarea too, for when the clipboard is refused', () => {
    clipboard.mockImplementation(() => { throw new Error('denied') })
    document.body.innerHTML = '<a href="https://instagram.com/atewamz">Ate Wamz</a>'
    runGrabber()
    expect(document.querySelector('[data-sable-grabber] textarea').value).toBe('Ate Wamz @atewamz')
  })

  it('produces exactly what the importer parses — the whole point of it', () => {
    document.body.innerHTML = `
      <a href="https://instagram.com/oscarakermo/">Oscar Akermo</a>
      <article><h3>Ate Wamz</h3><a href="https://instagram.com/atewamz">@atewamz</a></article>
    `
    runGrabber()
    expect(parseLineup(copied())).toEqual([
      { name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
      { name: 'Ate Wamz', handle: 'atewamz', note: '' },
    ])
  })
})

describe('parseLineupHash', () => {
  it('reads a hand-off back out of the URL', () => {
    const hash = `#lineup=big-london&data=${encodeURIComponent('Ate Wamz @atewamz\n@kubalizmus')}`
    expect(parseLineupHash(hash)).toEqual({
      conventionId: 'big-london',
      text: 'Ate Wamz @atewamz\n@kubalizmus',
    })
  })

  it('ignores anything that is not a hand-off', () => {
    expect(parseLineupHash('')).toBeNull()
    expect(parseLineupHash('#tab=boards')).toBeNull()
    expect(parseLineupHash('#lineup=big-london')).toBeNull()
    expect(parseLineupHash('#data=whatever')).toBeNull()
  })

  it('refuses a payload far larger than any real line-up', () => {
    const huge = `#lineup=big-london&data=${'a'.repeat(MAX_HANDOFF_CHARS + 1)}`
    expect(parseLineupHash(huge)).toBeNull()
  })

  it('rejects a convention id that is not a plain slug', () => {
    expect(parseLineupHash('#lineup=../../etc&data=x')).toBeNull()
  })
})
