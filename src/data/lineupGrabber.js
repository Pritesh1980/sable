// The line-up grabber: a bookmarklet that reads a show's artist page *for* you.
//
// Why this exists: the shows publish their line-up as a lazy-loading list, so
// "select all → copy" gets you the first screenful and nothing else, and
// scrolling 500 artists into existence by thumb is not a plan. Sable cannot
// fetch the page itself either — a browser blocks cross-origin reads, and there
// is no backend to proxy it.
//
// So the code goes to the page instead of the page coming to the code. Saved
// once as a bookmark, the grabber scrolls the list to the bottom, harvests
// every Instagram link it finds, and hands the result straight back to Sable
// through a URL (with a clipboard copy and a textarea as fallbacks).
//
// It only ever reads the DOM of the page the user deliberately runs it on, and
// only sends anything to Sable's own origin — which the user's own browser
// then imports through the same strict parser as a hand-paste.

// A generous ceiling on a hand-off payload: 500 artists is ~20k characters
// encoded, so anything past this is not a line-up.
export const MAX_HANDOFF_CHARS = 200_000

// Convention ids are slugs (see src/data/conventions.js). Anything else in the
// hash is not one of ours.
const CONVENTION_ID = /^[a-z0-9-]{1,64}$/

/* eslint-disable no-empty */
// Everything below runs on the *show's* page, not in the app: it is stringified
// into the bookmarklet, so it must be entirely self-contained — no imports, no
// references to anything in this module's scope — and ASCII-only, since it is
// base64-encoded with btoa. Style is ES5 on purpose: it is run by whatever
// browser the user has, from a bookmark.
export function grabberBody() {
  var APP = 'SABLE_APP_URL'
  var SHOW = 'SABLE_SHOW_ID'
  var STEP = 250
  var MAX_PASSES = 200
  var QUIET_PASSES = 4
  var doc = document
  var win = window
  var HASH = '#'

  var status = doc.createElement('div')
  status.setAttribute('data-sable-status', '1')
  status.setAttribute(
    'style',
    'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:rgba(10,10,10,0.94);color:rgb(240,235,225);font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:12px 14px;border-radius:2px;border:1px solid rgba(180,40,40,0.6)'
  )
  status.textContent = 'Sable: loading the full line-up...'
  if (doc.body) { doc.body.appendChild(status) }

  var text = function (el) {
    return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim()
  }

  var harvest = function () {
    var seen = {}
    var lines = []
    var anchors = doc.querySelectorAll('a[href*="instagram.com/"]')
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i]
      var match = (a.getAttribute('href') || '').match(/instagram\.com\/([A-Za-z0-9._]{1,30})/)
      if (!match) { continue }
      var handle = match[1].toLowerCase()
      /* Instagram's own routes, not artists. */
      if (handle === 'p' || handle === 'reel' || handle === 'reels' || handle === 'explore' || handle === 'stories' || handle === 'tv') { continue }
      if (seen[handle]) { continue }
      seen[handle] = 1
      var label = text(a)
      var name = ''
      if (label && label.length < 60 && label.replace(/^@/, '').toLowerCase() !== handle && label.toLowerCase().indexOf('instagram') < 0) {
        name = label
      }
      var box = a.parentElement
      for (var depth = 0; !name && box && depth < 4; depth++) {
        var heading = text(box.querySelector('h1,h2,h3,h4,h5,h6'))
        if (heading && heading.length < 60) { name = heading }
        box = box.parentElement
      }
      lines.push(name ? name + ' @' + handle : '@' + handle)
    }
    if (lines.length) { return lines.join('\n') }
    /* No links at all: hand back the page text and let Sable's parser sift it. */
    return ((doc.body && doc.body.innerText) || '').trim()
  }

  var present = function (harvested) {
    var count = harvested ? harvested.split('\n').length : 0
    try { if (win.navigator && win.navigator.clipboard) { win.navigator.clipboard.writeText(harvested) } } catch {}

    var panel = doc.createElement('div')
    panel.setAttribute('data-sable-grabber', '1')
    panel.setAttribute(
      'style',
      'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:rgba(8,8,8,0.96);color:rgb(240,235,225);font:15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:20px;overflow:auto'
    )

    var title = doc.createElement('p')
    title.textContent = 'Sable found ' + count + ' artists'
    title.setAttribute('style', 'margin:0 0 4px;font-size:20px')
    panel.appendChild(title)

    var hint = doc.createElement('p')
    hint.textContent = 'Copied to your clipboard. Tap below to import them, or paste them into the artist index yourself.'
    hint.setAttribute('style', 'margin:0 0 14px;opacity:0.7;font-size:13px')
    panel.appendChild(hint)

    var link = doc.createElement('a')
    link.setAttribute('href', APP + 'conventions' + HASH + 'lineup=' + SHOW + '&data=' + encodeURIComponent(harvested))
    link.textContent = 'Import ' + count + ' artists into Sable'
    link.setAttribute(
      'style',
      'display:block;padding:14px;margin-bottom:14px;text-align:center;background:rgb(150,30,30);color:rgb(255,250,245);text-decoration:none;border-radius:2px;font-weight:600'
    )
    panel.appendChild(link)

    var area = doc.createElement('textarea')
    area.value = harvested
    area.setAttribute('style', 'display:block;width:auto;min-width:0;height:38vh;background:rgb(16,16,16);color:rgb(230,225,215);border:1px solid rgba(255,255,255,0.2);border-radius:2px;padding:10px;font:12px ui-monospace,Menlo,monospace')
    panel.appendChild(area)

    var close = doc.createElement('button')
    close.textContent = 'Close'
    close.setAttribute('style', 'margin-top:12px;padding:12px 18px;background:none;color:rgb(240,235,225);border:1px solid rgba(255,255,255,0.3);border-radius:2px;font-size:14px')
    close.onclick = function () { panel.remove() }
    panel.appendChild(close)

    if (status.parentNode) { status.remove() }
    if (doc.body) { doc.body.appendChild(panel) }
    try { area.focus(); area.select() } catch {}
  }

  var lastHeight = -1
  var quiet = 0
  var passes = 0

  var step = function () {
    var clickables = doc.querySelectorAll('button,a,[role="button"]')
    for (var i = 0; i < clickables.length; i++) {
      var label = text(clickables[i]).toLowerCase()
      if (label === 'load more' || label === 'show more' || label === 'see more' || label === 'view more') {
        try { clickables[i].click() } catch {}
      }
    }

    win.scrollTo(0, (doc.body && doc.body.scrollHeight) || 0)
    var height = (doc.body && doc.body.scrollHeight) || 0
    if (height === lastHeight) { quiet++ } else { quiet = 0; lastHeight = height }
    passes++
    status.textContent = 'Sable: loading the full line-up... (' + passes + ')'

    if (quiet >= QUIET_PASSES || passes >= MAX_PASSES) {
      win.scrollTo(0, 0)
      present(harvest())
      return
    }
    win.setTimeout(step, STEP)
  }

  step()
}
/* eslint-enable no-empty */

// Stringify the body into a bookmarklet, base64-encoded.
//
// The obvious version — collapsing the source onto one line and inlining it —
// is quietly broken by the production minifier, which rewrites `'\n'` as a
// template literal holding a *real* newline. Collapsing whitespace then turns
// every line break in the harvest into a space, and the whole 500-artist list
// arrives as one unparseable line. (Dev builds are unminified, so this only
// ever showed up in a production browser.) Encoding instead of rewriting keeps
// the minifier's output byte-for-byte, and as a bonus the base64 alphabet
// cannot contain the `#` or `%` that would truncate or mangle a saved bookmark
// — whatever the minifier does to the source.
export function buildGrabber({ appUrl, conventionId }) {
  // Interpolated inside the encoded source, so a stray quote would break out
  // of the string literal it lands in.
  const safe = (v) => String(v).replace(/['"\\`]/g, '')
  const source = grabberBody
    .toString()
    .replace('SABLE_APP_URL', safe(appUrl))
    .replace('SABLE_SHOW_ID', safe(conventionId))
  return `javascript:eval(atob('${btoa(`(${source})()`)}'))`
}

// Where the app itself lives, so the grabber can hand a harvest back to it.
// Base-aware (the demo is served under /sable/), and always ends in a slash.
export function appBaseUrl(loc = globalThis.location, base = import.meta.env?.BASE_URL || '/') {
  const origin = loc?.origin || ''
  const path = base.endsWith('/') ? base : `${base}/`
  return `${origin}${path}`
}

// The other end of the hand-off: `#lineup=<conventionId>&data=<pasted text>`.
// Treated as untrusted input — bounded, slug-checked, and then fed through the
// same strict parser a hand-paste goes through.
export function parseLineupHash(hash = '') {
  const raw = String(hash || '').replace(/^#/, '')
  if (!raw || raw.length > MAX_HANDOFF_CHARS) return null
  const params = new URLSearchParams(raw)
  const conventionId = params.get('lineup')
  const text = params.get('data')
  if (!conventionId || !text) return null
  if (!CONVENTION_ID.test(conventionId)) return null
  return { conventionId, text }
}
