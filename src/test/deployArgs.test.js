import { describe, it, expect } from 'vitest'
import { parseDeployArgs } from '../deploy/args'

// #6, from the codex review. `args.includes('--dry-run')` treats any typo as
// "not a dry run", so `--dryrun` looks like a safety flag and is in fact a live
// deploy: a full build, 83MB uploaded, and a CloudFront invalidation. A flag
// whose whole purpose is to prevent an action must fail loudly when misspelled
// rather than silently doing the thing.

describe('deploy argument parsing (#6)', () => {
  it('defaults to a real deploy against infra/', () => {
    expect(parseDeployArgs([])).toEqual({ dryRun: false, infraDir: 'infra' })
  })

  it('recognises the dry-run flag', () => {
    expect(parseDeployArgs(['--dry-run']).dryRun).toBe(true)
  })

  it('takes an alternative infra directory', () => {
    expect(parseDeployArgs(['--infra', 'other']).infraDir).toBe('other')
  })

  it('accepts both flags together, in either order', () => {
    expect(parseDeployArgs(['--infra', 'other', '--dry-run'])).toEqual({
      dryRun: true,
      infraDir: 'other',
    })
    expect(parseDeployArgs(['--dry-run', '--infra', 'other'])).toEqual({
      dryRun: true,
      infraDir: 'other',
    })
  })

  // The finding itself: silently ignoring this is a live deploy the user
  // believed was a rehearsal.
  it('rejects a misspelled dry-run flag rather than deploying for real', () => {
    expect(() => parseDeployArgs(['--dryrun'])).toThrow(/--dryrun/)
    expect(() => parseDeployArgs(['--dry_run'])).toThrow()
    expect(() => parseDeployArgs(['-dry-run'])).toThrow()
  })

  it('rejects any unknown argument', () => {
    expect(() => parseDeployArgs(['--force'])).toThrow(/--force/)
    expect(() => parseDeployArgs(['stray'])).toThrow()
  })

  // `--infra` with nothing after it silently fell back to the default, and
  // `--infra --dry-run` swallowed the next flag as a directory name — which
  // also turned the dry run back into a real deploy.
  it('rejects --infra without a value', () => {
    expect(() => parseDeployArgs(['--infra'])).toThrow(/value/i)
  })

  it('does not swallow the following flag as the infra path', () => {
    expect(() => parseDeployArgs(['--infra', '--dry-run'])).toThrow(/value/i)
  })
})
