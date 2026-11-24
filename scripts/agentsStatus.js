// `npm run agents:status` — run this before starting work in Sable, whichever
// agent you are (Claude, codex, antigravity). It shows the issues already
// claimed, the open PRs, and every worktree of this repo (all agents' worktrees
// share one .git, so codex's under ~/.codex/worktrees show up too), with notes
// on work nobody else can see. Rules: CLAUDE.md, "Working alongside other agents".
//
// The judgement lives in src/agents/agentStatus.js and is unit-tested; this file
// only gathers facts from git and gh, and degrades to a warning when either the
// network or GitHub is unreachable (codex's sandbox has no network by default).
//
//   npm run agents:status               fetches origin first
//   npm run agents:status -- --no-fetch
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  parseWorktrees,
  toolFor,
  claimedIssues,
  worktreeNotes,
  formatReport,
  stripPluginBlocks,
  PLUGIN_TOUCHED,
} from '../src/agents/agentStatus.js'

const run = (cmd, args, cwd) =>
  // trimEnd, not trim: porcelain status lines start with a meaningful space.
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }).trimEnd()

const tryRun = (cmd, args, cwd) => {
  try {
    return run(cmd, args, cwd)
  } catch {
    return null
  }
}

const count = (out) => (out === null || out === '' ? 0 : Number(out) || 0)

const mtime = (file) => {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

// `git status --porcelain` lines are "XY path" or "XY old -> new".
const dirtyPaths = (porcelain) =>
  porcelain
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).split(' -> ').pop().replace(/^"|"$/g, ''))

// The IJFW plugin hook rewrites AGENTS.md and CLAUDE.md in every checkout; a
// file whose only change is its blocks is not anyone's work. Untracked ijfw/
// folders (gitignored on main, not on older bases) are the same plugin.
function isPluginNoise(at, file) {
  if (file === 'ijfw/' || file === '.ijfw/') return true
  if (!PLUGIN_TOUCHED.includes(file)) return false
  const committed = tryRun('git', ['show', `HEAD:${file}`], at)
  if (committed === null) return false
  try {
    return stripPluginBlocks(readFileSync(path.join(at, file), 'utf8')) === stripPluginBlocks(committed)
  } catch {
    return false
  }
}

function gather(root, prs, merged) {
  const porcelain = run('git', ['worktree', 'list', '--porcelain'], root)
  return parseWorktrees(porcelain).map((wt) => {
    let missing = false
    try {
      statSync(wt.path)
    } catch {
      missing = true
    }
    if (missing) return { ...wt, tool: toolFor(wt), notes: worktreeNotes({ ...wt, missing }, Date.now()) }

    const at = wt.path
    const status = wt.isRoot ? '' : (tryRun('git', ['status', '--porcelain'], at) ?? '')
    const files = dirtyPaths(status).filter((f) => !isPluginNoise(at, f))
    const ahead = count(tryRun('git', ['rev-list', '--count', 'origin/main..HEAD'], at))
    const behind = wt.isRoot ? count(tryRun('git', ['rev-list', '--count', 'HEAD..origin/main'], at)) : 0
    const remoteRef = wt.branch ? `refs/remotes/origin/${wt.branch}` : null
    const pushed = remoteRef ? tryRun('git', ['rev-parse', '--verify', '--quiet', remoteRef], at) !== null : false
    const unpushed = pushed ? count(tryRun('git', ['rev-list', '--count', `${remoteRef}..HEAD`], at)) : 0
    const committedAt = count(tryRun('git', ['log', '-1', '--format=%ct'], at)) * 1000
    const lastActivity = Math.max(committedAt, ...files.slice(0, 100).map((f) => mtime(path.join(at, f))))

    const facts = {
      ...wt,
      dirty: files.length,
      ahead,
      behind,
      pushed,
      unpushed,
      pr: prs.find((pr) => pr.headRefName === wt.branch)?.number ?? null,
      mergedPr: wt.branch ? (merged.get(wt.branch) ?? null) : null,
      lastActivity: lastActivity || null,
    }
    return { ...facts, tool: toolFor(wt), notes: worktreeNotes(facts, Date.now()) }
  })
}

function main() {
  const fetch = !process.argv.includes('--no-fetch')
  const root = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).replace(/\/\.git$/, '')
  const warnings = []

  if (fetch && tryRun('git', ['fetch', '--quiet', 'origin'], root) === null) {
    warnings.push("couldn't fetch origin (no network?): remote branches may be out of date")
  }

  let prs = []
  let labelled = []
  const merged = new Map()
  try {
    prs = JSON.parse(run('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,isDraft,body,updatedAt'], root))
    labelled = JSON.parse(run('gh', ['issue', 'list', '--state', 'open', '--label', 'in-progress', '--json', 'number,title'], root))
    const recent = JSON.parse(run('gh', ['pr', 'list', '--state', 'merged', '--limit', '100', '--json', 'number,headRefName'], root))
    for (const pr of recent) if (!merged.has(pr.headRefName)) merged.set(pr.headRefName, pr.number)
  } catch {
    warnings.push(
      'GitHub unreachable: PRs and claims not shown. In a sandbox without network gh reports this as a bad token; it is not.',
    )
  }

  const worktrees = gather(root, prs, merged)
  const claims = claimedIssues(prs, labelled)
  console.log(formatReport({ now: Date.now(), home: homedir(), prs, claims, worktrees, warnings }))
}

main()
