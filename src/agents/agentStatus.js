// Pure half of `npm run agents:status`: what Claude, codex and antigravity run
// before starting work, to see what the others are doing. scripts/agentsStatus.js
// only gathers facts from git and gh; every judgement about them lives here so
// it can be tested. Same split as src/a11y/touchTargets.js.
//
// The rules it reports against are in CLAUDE.md, "Working alongside other
// agents": claim an issue with a draft PR at the first commit, hand off in issue
// comments.

export const STALE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Parses `git worktree list --porcelain`. The first entry is the root checkout. */
export function parseWorktrees(porcelain) {
  const list = []
  let current = null
  for (const raw of porcelain.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9), head: null, branch: null, detached: false, isRoot: list.length === 0 }
      list.push(current)
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice(5)
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '')
    } else if (current && line === 'detached') {
      current.detached = true
    }
  }
  return list
}

/** Files the IJFW plugin hook rewrites in every checkout. */
export const PLUGIN_TOUCHED = ['AGENTS.md', 'CLAUDE.md']

/**
 * A file's text without the IJFW plugin's YAML header and `<!-- IJFW-*-START -->`
 * … `<!-- IJFW-*-END -->` blocks, with blank lines and trailing spaces dropped,
 * so a hook-only change compares equal to the committed text. Uses indexOf, not
 * a lazy regex across the file, to keep it linear.
 */
export function stripPluginBlocks(text) {
  let s = text.replace(/\r\n/g, '\n')
  if (s.startsWith('---\nijfw_')) {
    const end = s.indexOf('\n---\n', 4)
    if (end !== -1) s = s.slice(end + 5)
  }
  let start = s.indexOf('<!-- IJFW-')
  while (start !== -1) {
    const endMarker = s.indexOf('-END -->', start)
    if (endMarker === -1) break
    s = s.slice(0, start) + s.slice(endMarker + 8)
    start = s.indexOf('<!-- IJFW-', start)
  }
  return s.split('\n').map((line) => line.trimEnd()).filter(Boolean).join('\n')
}

const BRANCH_PREFIXES = [
  ['codex/', 'codex'],
  ['claude/', 'claude'],
  ['worktree-', 'claude'], // Claude Code's EnterWorktree default
  ['agy/', 'antigravity'],
  ['antigravity/', 'antigravity'],
]

/** Which agent a worktree belongs to: branch prefix first, then where it lives. */
export function toolFor({ branch, path }) {
  for (const [prefix, tool] of BRANCH_PREFIXES) {
    if (branch?.startsWith(prefix)) return tool
  }
  // The Codex app creates detached worktrees under ~/.codex/worktrees.
  if (path.includes('/.codex/')) return 'codex'
  if (path.includes('/.claude/worktrees/')) return 'claude'
  return null
}

// GitHub's closing keywords. Whitespace is collapsed before matching, so a
// single literal space is enough and nothing can backtrack.
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):? #(\d+)/gi
const TITLE_REF = /\(#(\d+)\)/g
const BRANCH_NUMBER = /[-/](\d+)$/

/**
 * Issues someone is already working on: named by an open PR (closing keyword in
 * the body, "(#N)" in the title, or a branch ending in -N) or labelled
 * in-progress. A bare "#N" mention in a body is not a claim.
 * Returns Map<issueNumber, string[]> of where each claim came from.
 */
export function claimedIssues(prs, labelledIssues) {
  const claims = new Map()
  const add = (issue, source) => {
    const sources = claims.get(issue) ?? []
    if (!sources.includes(source)) sources.push(source)
    claims.set(issue, sources)
  }
  for (const pr of prs) {
    const source = `${pr.isDraft ? 'draft PR' : 'PR'} #${pr.number}`
    const body = (pr.body ?? '').split(/\s+/).join(' ')
    for (const m of body.matchAll(CLOSING)) add(Number(m[1]), source)
    for (const m of (pr.title ?? '').matchAll(TITLE_REF)) add(Number(m[1]), source)
    const fromBranch = BRANCH_NUMBER.exec(pr.headRefName ?? '')
    if (fromBranch) add(Number(fromBranch[1]), source)
  }
  for (const issue of labelledIssues) add(issue.number, 'label in-progress')
  return claims
}

/**
 * Plain-language notes on one worktree; an empty list means nothing to flag.
 * Fields: isRoot, branch, detached, missing, ahead (commits not on origin/main),
 * behind (root only), dirty (uncommitted files), pushed (origin has the branch),
 * unpushed (commits not on origin/<branch>), pr (open PR number), mergedPr,
 * lastActivity (ms).
 */
export function worktreeNotes(wt, now) {
  if (wt.missing) return ['folder missing: git worktree prune clears it']

  if (wt.isRoot) {
    // The root's own files are left alone: a plugin hook keeps AGENTS.md and
    // CLAUDE.md modified there, which is noise, not someone's work.
    const notes = []
    if (wt.branch !== 'main') notes.push('root checkout is not on main: other agents read it, tell the owner')
    if (wt.behind > 0) notes.push(`${plural(wt.behind, 'commit')} behind origin/main`)
    return notes
  }

  if (wt.mergedPr && !wt.pr) {
    return [
      wt.dirty > 0
        ? `PR #${wt.mergedPr} merged, but ${plural(wt.dirty, 'uncommitted file')}`
        : `PR #${wt.mergedPr} merged: can be removed (by whoever owns it)`,
    ]
  }

  const notes = []
  if (wt.detached && wt.dirty > 0) {
    notes.push(`no branch: ${plural(wt.dirty, 'uncommitted file')}`)
  } else if (wt.detached && wt.ahead > 0) {
    notes.push(`no branch: ${plural(wt.ahead, 'commit')} not on main`)
  }

  if (wt.ahead > 0 && !wt.detached) {
    if (!wt.pushed) {
      notes.push('not pushed: other agents cannot see it')
    } else {
      if (wt.unpushed > 0) notes.push(`${plural(wt.unpushed, 'commit')} not pushed`)
      if (!wt.pr) notes.push('pushed but no PR: open a draft PR to claim it')
    }
  }

  if (wt.ahead === 0) {
    if (wt.dirty === 0) {
      notes.push('everything merged, nothing uncommitted: can be removed (by whoever owns it)')
    } else if (!wt.detached) {
      notes.push(`${plural(wt.dirty, 'uncommitted file')}, nothing committed: other agents cannot see it`)
    }
  }

  if (wt.lastActivity) {
    const days = Math.floor((now - wt.lastActivity) / DAY_MS)
    if (days >= STALE_DAYS) notes.push(`idle ${days}d`)
  }
  return notes
}

const ago = (iso, now) => {
  const ms = now - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) return `${Math.max(0, Math.floor(ms / 60000))}m ago`
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const shorten = (path, home) => (home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path)

const columns = (rows) => {
  const widths = []
  for (const row of rows) row.forEach((cell, i) => { widths[i] = Math.max(widths[i] ?? 0, cell.length) })
  return rows.map((row) => `  ${row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ')}`)
}

/** The whole report as text. `worktrees` entries already carry `tool` and `notes`. */
export function formatReport({ now, home, prs, claims, worktrees, warnings }) {
  const out = [`Agent status  ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`, '']

  for (const w of warnings) out.push(`! ${w}`)
  if (warnings.length) out.push('')

  out.push('Claimed issues')
  if (claims.size === 0) out.push('  none')
  else {
    const sorted = [...claims.entries()].sort(([a], [b]) => a - b)
    out.push(...columns(sorted.map(([issue, sources]) => [`#${issue}`, sources.join(', ')])))
  }
  out.push('')

  out.push('Open PRs')
  if (prs.length === 0) out.push('  none')
  else {
    out.push(...columns(prs.map((pr) => [
      `#${pr.number}`,
      pr.isDraft ? 'draft' : 'ready',
      pr.headRefName,
      `${pr.title}${pr.updatedAt ? `  (${ago(pr.updatedAt, now)})` : ''}`,
    ])))
  }
  out.push('')

  out.push('Worktrees')
  if (worktrees.length === 0) out.push('  none')
  for (const wt of worktrees) {
    const who = wt.isRoot ? 'root' : (wt.tool ?? '?')
    out.push(...columns([[who.padEnd(11), (wt.branch ?? '(no branch)').padEnd(30), shorten(wt.path, home)]]))
    for (const note of wt.notes ?? []) out.push(`               - ${note}`)
  }
  out.push('', 'Skip claimed issues. Claim yours with a draft PR. Rules: CLAUDE.md, "Working alongside other agents".')
  return out.join('\n')
}
