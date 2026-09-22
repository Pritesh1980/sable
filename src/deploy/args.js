// Argument parsing for scripts/deployAws.mjs (#6).
//
// Strict on purpose. The previous `args.includes('--dry-run')` meant any typo
// — `--dryrun`, `--dry_run` — read as "not a dry run", so a flag whose entire
// job is to prevent an action instead performed it: a real build, 83MB
// uploaded, and a CloudFront invalidation. Anything unrecognised is refused
// rather than ignored.

const DEFAULTS = { dryRun: false, infraDir: 'infra' }

export function parseDeployArgs(argv = []) {
  const parsed = { ...DEFAULTS }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    if (arg === '--infra') {
      const value = argv[i + 1]
      // A following flag is the next option, not this one's value — taking it
      // would both mis-set the path and silently drop the flag it consumed.
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--infra needs a directory value, e.g. --infra infra')
      }
      parsed.infraDir = value
      i++
      continue
    }
    throw new Error(`Unknown argument: ${arg}\nSupported: --dry-run, --infra <dir>`)
  }

  return parsed
}
