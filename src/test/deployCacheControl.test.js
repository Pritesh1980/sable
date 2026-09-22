import { describe, it, expect } from 'vitest'
import {
  cacheControlFor,
  IMMUTABLE,
  NO_CACHE,
  SHORT,
  INVALIDATION_PATHS,
} from '../deploy/cacheControl'

// #6. Cache headers for the S3 + CloudFront deploy. These live in a pure module
// (mirroring src/a11y/touchTargets.js behind scripts/auditTouchTargets.mjs) so
// the rules are testable without an AWS account — the deploy script is only the
// thin half that talks to the CLI.

describe('deploy cache-control (#6)', () => {
  // The single most dangerous header in the whole deploy. dist/sw.js changes on
  // every build (the precache manifest is injected into it), but CACHE_NAME in
  // public/sw.js is a hand-bumped constant — so the browser only picks up a new
  // service worker when it sees different *bytes* at /sw.js. Let CloudFront or
  // the browser hold a copy and the deployed app silently stops updating, with
  // no error anywhere to explain why.
  it('never lets the service worker be cached', () => {
    expect(cacheControlFor('sw.js')).toBe(NO_CACHE)
  })

  // index.html names the hashed entry bundles. Cached, it pins the whole app to
  // a dead build whose assets may already have been replaced.
  it('never lets the app shell be cached', () => {
    expect(cacheControlFor('index.html')).toBe(NO_CACHE)
  })

  it('marks content-hashed build assets immutable', () => {
    expect(cacheControlFor('assets/blobUrls-4DMLQ-yb.js')).toBe(IMMUTABLE)
    expect(cacheControlFor('assets/Brief-DGvJzuId.js')).toBe(IMMUTABLE)
    expect(cacheControlFor('assets/index-C_8jLJG7.css')).toBe(IMMUTABLE)
  })

  // `immutable` promises the bytes at this URL will never change. That is only
  // true when the content hash is in the name, so a rename is what publishes a
  // change. On a fixed filename it is unfixable for a year in any browser that
  // already cached it — no invalidation can reach it.
  it('does not mark an unhashed file under assets/ immutable', () => {
    expect(cacheControlFor('assets/vendor.js')).not.toBe(IMMUTABLE)
    expect(cacheControlFor('assets/logo.svg')).not.toBe(IMMUTABLE)
    // An ordinary hyphenated name must not be mistaken for <name>-<hash>: the
    // hash is the final segment and a fixed width, so "component-file" is not
    // one however many hyphens it contains.
    expect(cacheControlFor('assets/my-component-file.js')).not.toBe(IMMUTABLE)
  })

  it('gives verbatim public/ files a short revalidating cache', () => {
    expect(cacheControlFor('manifest.json')).toBe(SHORT)
    expect(cacheControlFor('favicon.svg')).toBe(SHORT)
    expect(cacheControlFor('icons.svg')).toBe(SHORT)
  })

  // Reference images and guide screenshots are replaced in place under a stable
  // filename (images/artists/<handle>/1.jpg), so they can be cached but never
  // pinned.
  it('caches reference images without making them immutable', () => {
    expect(cacheControlFor('images/artists/zoia.ink/1.jpg')).not.toBe(IMMUTABLE)
    expect(cacheControlFor('images/artists/zoia.ink/1.jpg')).not.toBe(NO_CACHE)
    expect(cacheControlFor('guide/wall.png')).not.toBe(IMMUTABLE)
  })

  // The catch-all: a file type nobody thought about must fail safe (revalidate)
  // rather than inherit a long cache by accident.
  it('falls back to a revalidating cache for anything unrecognised', () => {
    expect(cacheControlFor('some/new/thing.bin')).not.toBe(IMMUTABLE)
  })

  it('only ever marks hashed assets immutable', () => {
    const notHashed = [
      'sw.js',
      'index.html',
      'manifest.json',
      'favicon.svg',
      'icons.svg',
      'images/artists/zoia.ink/1.jpg',
      'guide/wall.png',
      'audit.html',
    ]
    for (const path of notHashed) {
      expect(cacheControlFor(path), `${path} must not be immutable`).not.toBe(IMMUTABLE)
    }
  })

  // Hashed assets never need purging (a new build writes new names), so the
  // invalidation list is exactly the handful of stable entry points. Keeping it
  // small also keeps deploys inside CloudFront's 1,000-free-paths-a-month.
  it('invalidates every non-immutable entry point after a deploy', () => {
    expect(INVALIDATION_PATHS).toContain('/sw.js')
    expect(INVALIDATION_PATHS).toContain('/index.html')
    expect(INVALIDATION_PATHS).toContain('/manifest.json')
    expect(INVALIDATION_PATHS.some((p) => p.includes('assets'))).toBe(false)
  })
})
