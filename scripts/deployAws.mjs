// Deploy the built app to the S3 + CloudFront stack (#6) — `npm run deploy:aws`.
//
// Runs from the Mac, not CI, and that is deliberate: the curated reference
// images under public/images/artists/ are gitignored third-party work, so they
// exist only on this machine. A local `vite build` copies them into dist/;
// a CI build never could.
//
// The cache rules live in src/deploy/cacheControl.js and are unit-tested there
// (src/test/deployCacheControl.test.js). This file only groups files and shells
// out to the AWS CLI.
//
//   npm run deploy:aws -- --dry-run     # print what would happen, touch nothing
//   npm run deploy:aws                  # build, upload, invalidate
//
// Prerequisites: a working `aws` CLI with credentials, and the Terraform stack
// applied (infra/main.tf):
//   cd infra && terraform init && terraform apply -var 'alert_email=you@example.com'
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import {
  cacheControlFor,
  IMMUTABLE,
  NO_CACHE,
  MEDIA,
  SHORT,
  INVALIDATION_PATHS,
} from '../src/deploy/cacheControl.js'
import { parseDeployArgs } from '../src/deploy/args.js'

let dryRun
let INFRA_DIR
try {
  ;({ dryRun, infraDir: INFRA_DIR } = parseDeployArgs(process.argv.slice(2)))
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

const DIST = 'dist'

// Local-only build artefacts that should not be on a public origin. audit.html
// is the curation grid viewer — a dev tool, not part of the app.
const NEVER_UPLOAD = ['audit.html']

function run(cmd, cmdArgs) {
  console.log(`  $ ${cmd} ${cmdArgs.join(' ')}`)
  if (dryRun) return
  execFileSync(cmd, cmdArgs, { stdio: 'inherit' })
}

function walk(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full, root) : [relative(root, full).split('\\').join('/')]
  })
}

// Terraform is the source of truth for what exists; nothing here guesses a
// bucket name. `output -json` gives {name: {value, ...}}.
function stackOutputs() {
  let raw
  try {
    raw = execFileSync('terraform', ['-chdir=' + INFRA_DIR, 'output', '-json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    console.error(
      `Could not read Terraform outputs from ${INFRA_DIR}/.\n` +
        `Has the stack been applied?  cd ${INFRA_DIR} && terraform init && terraform apply`
    )
    process.exit(1)
  }
  const parsed = JSON.parse(raw)
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, v.value]))
}

// A wholesale `s3 sync` of assets/ as immutable is only safe while every file
// in there really is content-hashed — `immutable` on a stable filename is a
// year-long mistake no invalidation can undo. Rather than let the script and
// the tested rules drift apart, check the claim against the module and refuse
// to upload if it no longer holds.
function assertAssetsAreHashed(files) {
  const unhashed = files.filter((f) => f.startsWith('assets/') && cacheControlFor(f) !== IMMUTABLE)
  if (unhashed.length) {
    console.error('\nRefusing to deploy: unhashed file(s) under dist/assets/:')
    for (const f of unhashed) console.error(`  ${f}`)
    console.error(
      '\nThese would be uploaded with an immutable year-long cache under a filename\n' +
        'that never changes. Fix the build, or extend src/deploy/cacheControl.js.'
    )
    process.exit(1)
  }
}

function syncPass({ label, include, cacheControl, extraArgs = [] }) {
  console.log(`\n${label}  (${cacheControl})`)
  run('aws', [
    's3',
    'sync',
    DIST,
    `s3://${bucket}`,
    '--cache-control',
    cacheControl,
    '--only-show-errors',
    ...include,
    ...extraArgs,
  ])
}

// --- go ------------------------------------------------------------------

// Resolve the target BEFORE building. A production build takes minutes, and
// there is no point spending them only to discover there is nowhere to put the
// result.
const outputs = stackOutputs()
const bucket = outputs.bucket_name
const distributionId = outputs.distribution_id
if (!bucket || !distributionId) {
  // `terraform output` on an unapplied stack succeeds with `{}`, so this is the
  // ordinary "not set up yet" path rather than a broken one.
  console.error(
    `No infrastructure yet — ${INFRA_DIR}/ has no bucket_name/distribution_id output.\n\n` +
      `  cd ${INFRA_DIR}\n` +
      `  terraform init\n` +
      `  terraform apply -var 'alert_email=you@example.com'\n`
  )
  process.exit(1)
}

if (!dryRun) {
  console.log('Building at base "/"…')
  // VITE_BASE is pinned rather than merely left unset (codex review). Vite gives
  // an existing environment variable priority, and vite.config.js reads
  // `process.env.VITE_BASE`, so an exported `VITE_BASE=/sable/` left over from
  // testing the Pages build would silently produce a bundle referencing
  // /sable/assets/* — uploaded to the bucket root, where every one of those
  // requests hits the SPA 403 fallback and returns index.html instead of
  // JavaScript. The result is a blank app with no failed request to explain it.
  execFileSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: '/' },
  })
}

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ — run a build first.`)
  process.exit(1)
}

const files = walk(DIST).filter((f) => !NEVER_UPLOAD.includes(f))
assertAssetsAreHashed(files)

console.log(`\nBucket:       ${bucket}`)
console.log(`Distribution: ${distributionId}`)
console.log(`URL:          ${outputs.app_url}`)
console.log(`Files:        ${files.length}${dryRun ? '   (dry run — nothing will be uploaded)' : ''}`)

// Longest-lived first, so a half-finished deploy leaves the shell pointing at
// assets that already exist rather than the other way round.
syncPass({
  label: '1/4  hashed assets',
  cacheControl: IMMUTABLE,
  include: ['--exclude', '*', '--include', 'assets/*'],
})

syncPass({
  label: '2/4  images, guide, icons',
  cacheControl: MEDIA,
  include: [
    '--exclude',
    '*',
    '--include',
    'images/*',
    '--include',
    'guide/*',
    '--include',
    'icons/*',
  ],
})

syncPass({
  label: '3/4  everything else',
  cacheControl: SHORT,
  include: [
    '--exclude',
    'assets/*',
    '--exclude',
    'images/*',
    '--exclude',
    'guide/*',
    '--exclude',
    'icons/*',
    '--exclude',
    'sw.js',
    '--exclude',
    'index.html',
    ...NEVER_UPLOAD.flatMap((f) => ['--exclude', f]),
  ],
})

// Last, and separately: these two are what publish the new build. Uploading
// them before the assets they reference would briefly serve a shell pointing at
// files that are not there yet.
console.log(`\n4/4  entry points  (${NO_CACHE})`)
for (const file of ['index.html', 'sw.js']) {
  run('aws', [
    's3',
    'cp',
    `${DIST}/${file}`,
    `s3://${bucket}/${file}`,
    '--cache-control',
    NO_CACHE,
    '--only-show-errors',
  ])
}

console.log('\nInvalidating:', INVALIDATION_PATHS.join(' '))
run('aws', [
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  distributionId,
  '--paths',
  ...INVALIDATION_PATHS,
])

console.log(`\n${dryRun ? 'Dry run complete.' : `Deployed → ${outputs.app_url}`}`)
