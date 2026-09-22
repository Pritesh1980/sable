import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// Contract test for infra/main.tf (#6) — the same pattern used for public/sw.js
// and the README: a file that can't be imported, so read it and assert its
// invariants. `terraform validate` proves the config parses; it cannot say
// whether the bucket is still private.
//
// These are the properties that are expensive to get wrong rather than merely
// wrong: the bucket holds 48MB of third-party reference images that are
// deliberately kept out of the public repo, and the whole "unguessable URL"
// decision rests on the bucket itself never being directly reachable.

const ROOT = process.cwd()
const MAIN_TF = readFileSync(join(ROOT, 'infra/main.tf'), 'utf8')
const GITIGNORE = readFileSync(join(ROOT, 'infra/.gitignore'), 'utf8')

// Comments explain why these settings exist and quote the very strings being
// asserted, so prose must not be able to satisfy a check on its own.
const CODE = MAIN_TF.split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n')

describe('hosting infrastructure (#6)', () => {
  it('blocks every route to making the bucket public', () => {
    for (const setting of [
      'block_public_acls',
      'block_public_policy',
      'ignore_public_acls',
      'restrict_public_buckets',
    ]) {
      expect(CODE, `${setting} must be true`).toMatch(new RegExp(`${setting}\\s*=\\s*true`))
    }
  })

  // Bucket reads go through CloudFront's signed origin requests, and the policy
  // is pinned to this one distribution. Without the SourceArn condition any
  // CloudFront distribution in any AWS account could read the bucket.
  it('serves the bucket only through Origin Access Control, scoped to this distribution', () => {
    expect(CODE).toMatch(/aws_cloudfront_origin_access_control/)
    expect(CODE).toMatch(/signing_behavior\s*=\s*"always"/)
    expect(CODE).toMatch(/origin_access_control_id\s*=/)
    expect(CODE).toMatch(/variable\s*=\s*"AWS:SourceArn"/)
  })

  it('grants CloudFront read access only, never list or write', () => {
    expect(CODE).toMatch(/actions\s*=\s*\["s3:GetObject"\]/)
    expect(CODE).not.toMatch(/s3:PutObject|s3:DeleteObject|s3:ListBucket/)
  })

  // The single most dangerous cache setting in the deploy: an edge-cached
  // sw.js means new builds silently never reach an installed PWA. Guarded in
  // two independent places — here, and in src/deploy/cacheControl.js.
  it('disables caching for the service worker at the edge', () => {
    expect(CODE).toMatch(/path_pattern\s*=\s*"\/sw\.js"/)
    expect(CODE).toMatch(/data\.aws_cloudfront_cache_policy\.disabled\.id/)
  })

  // Deep links (/gallery, /brief) have no object behind them. A private bucket
  // answers a miss with 403, not 404, because the policy grants no ListBucket —
  // so mapping only 404 would leave every refreshed deep link broken.
  it('maps both 403 and 404 back to the app shell for client-side routing', () => {
    for (const code of ['403', '404']) {
      expect(CODE).toMatch(new RegExp(`error_code\\s*=\\s*${code}`))
    }
    const shellFallbacks = CODE.match(/response_page_path\s*=\s*"\/index\.html"/g) || []
    expect(shellFallbacks).toHaveLength(2)
  })

  // Not a cost control so much as a smoke alarm — the expected bill is pennies,
  // so anything that trips this means something is wrong.
  it('can raise a cost alert on forecast spend, not just actual', () => {
    expect(CODE).toMatch(/aws_budgets_budget/)
    expect(CODE).toMatch(/notification_type\s*=\s*"FORECASTED"/)
  })

  // force_destroy = true would let `terraform destroy` empty a bucket full of
  // uploaded content in one step, with no confirmation beyond the plan.
  it('never lets a destroy silently empty the bucket', () => {
    expect(CODE).not.toMatch(/force_destroy\s*=\s*true/)
  })

  // Local state on the Mac is fine for a solo project, but it records real
  // resource ids and this repo is public.
  it('keeps terraform state and tfvars out of the repo', () => {
    expect(GITIGNORE).toMatch(/terraform\.tfstate/)
    expect(GITIGNORE).toMatch(/\.terraform\//)
    expect(GITIGNORE).toMatch(/\*\.tfvars/)
  })
})
