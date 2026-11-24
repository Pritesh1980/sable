import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseWorktrees,
  toolFor,
  claimedIssues,
  worktreeNotes,
  formatReport,
  mergedPrFor,
  parseStatus,
  stripPluginBlocks,
  STALE_DAYS,
} from '../agents/agentStatus'

// `npm run agents:status` is how Claude, codex and antigravity see each other's
// work before starting their own. The judgement lives here; scripts/agentsStatus.mjs
// only runs git and gh. Same split as src/a11y/touchTargets.js.

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 24, 9, 0)

const PORCELAIN = [
  'worktree /Users/me/code/tattoo-app',
  'HEAD bcd80a3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'branch refs/heads/main',
  '',
  'worktree /Users/me/.codex/worktrees/placement-picker-245/tattoo-app',
  'HEAD b5a236fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'detached',
  '',
  'worktree /Users/me/code/tattoo-app/.worktrees/blender-194',
  'HEAD b5a236fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'branch refs/heads/feat/blender-demo-guide-194',
  'locked',
  '',
  'worktree /Users/me/code/tattoo-app/.worktrees/gone',
  'HEAD cccccccccccccccccccccccccccccccccccccccc',
  'branch refs/heads/claude/gone',
  'prunable gitdir file points to non-existent location',
  '',
].join('\n')

describe('parseWorktrees', () => {
  it('reads every worktree, marking the first as the root checkout', () => {
    const list = parseWorktrees(PORCELAIN)
    expect(list).toHaveLength(4)
    expect(list[0]).toMatchObject({ path: '/Users/me/code/tattoo-app', branch: 'main', isRoot: true, detached: false })
    expect(list[1]).toMatchObject({ branch: null, detached: true, isRoot: false })
    expect(list[2]).toMatchObject({ branch: 'feat/blender-demo-guide-194', head: 'b5a236fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', prunable: false })
  })

  // git's own flag, not a stat() of the folder: a sandboxed agent may be unable
  // to stat a sibling worktree that is very much alive.
  it('takes a missing folder from git, which marks it prunable', () => {
    expect(parseWorktrees(PORCELAIN)[3]).toMatchObject({ branch: 'claude/gone', prunable: true })
  })

  it('tolerates a missing trailing blank line and CRLF', () => {
    const list = parseWorktrees('worktree /a\r\nHEAD 111\r\nbranch refs/heads/x')
    expect(list).toEqual([{ path: '/a', head: '111', branch: 'x', detached: false, prunable: false, isRoot: true }])
  })
})

describe('toolFor', () => {
  it('names the tool from the branch prefix first', () => {
    expect(toolFor({ branch: 'codex/calendar-export', path: '/x' })).toBe('codex')
    expect(toolFor({ branch: 'claude/agent-coordination', path: '/x' })).toBe('claude')
    expect(toolFor({ branch: 'agy/brief-copy', path: '/x' })).toBe('antigravity')
  })

  // The Codex app makes detached worktrees under ~/.codex/worktrees, so a
  // branchless one still needs a name.
  it('falls back to where the worktree lives', () => {
    expect(toolFor({ branch: null, path: '/Users/me/.codex/worktrees/p/tattoo-app' })).toBe('codex')
    expect(toolFor({ branch: 'feat/x', path: '/r/.claude/worktrees/x' })).toBe('claude')
    expect(toolFor({ branch: 'feat/x', path: '/r/.worktrees/x' })).toBe(null)
  })
})

describe('claimedIssues', () => {
  it('collects issues from PR closing keywords, titles and branch numbers, and the in-progress label', () => {
    const prs = [
      { number: 251, isDraft: true, headRefName: 'codex/placement-picker-245', title: 'feat(placement): body-ordered dropdown', body: 'Fixes #245' },
      { number: 252, isDraft: false, headRefName: 'claude/agent-coordination', title: 'docs: agent coordination (#260)', body: 'closes #261, resolves #262' },
    ]
    const labelled = [{ number: 194, title: 'Blender: render demo imagery' }]
    const claims = claimedIssues(prs, labelled)
    expect([...claims.keys()].sort((a, b) => a - b)).toEqual([194, 245, 260, 261, 262])
    expect(claims.get(245)).toEqual(['draft PR #251'])
    expect(claims.get(261)).toEqual(['PR #252'])
    expect(claims.get(194)).toEqual(['label in-progress'])
  })

  // codex's sandbox can't push, so for codex a local worktree is often the only
  // claim there is. Only worktrees holding work count, and never a merged one.
  it('counts a local worktree holding work for an issue, by branch or folder name', () => {
    const worktrees = [
      { isRoot: true, branch: 'main', path: '/r', ahead: 0, dirty: 0 },
      { tool: 'codex', branch: null, path: '/h/.codex/worktrees/placement-picker-245/tattoo-app', ahead: 0, dirty: 27 },
      { tool: 'claude', branch: 'claude/text-search-186', path: '/r/.worktrees/search', ahead: 2, dirty: 0 },
      { tool: null, branch: 'feat/blender-relief-prep-193', path: '/r/.worktrees/blender-193', ahead: 0, dirty: 0 },
      { tool: 'codex', branch: 'codex/calendar-export-90', path: '/h/.codex/worktrees/calendar-export/tattoo-app', ahead: 3, dirty: 0, mergedPr: 91 },
    ]
    const claims = claimedIssues([], [], worktrees)
    expect([...claims.keys()].sort((a, b) => a - b)).toEqual([186, 245])
    expect(claims.get(245)).toEqual(['local worktree (codex)'])
    expect(claims.get(186)).toEqual(['local worktree (claude)'])
  })

  it('lists a worktree alongside the PR that claims the same issue', () => {
    const prs = [{ number: 251, isDraft: true, headRefName: 'codex/placement-picker-245', title: 't', body: '' }]
    const worktrees = [{ tool: 'codex', branch: 'codex/placement-picker-245', path: '/h/.codex/worktrees/p/tattoo-app', ahead: 1, dirty: 0 }]
    expect(claimedIssues(prs, [], worktrees).get(245)).toEqual(['draft PR #251', 'local worktree (codex)'])
  })

  // A template's example or a quoted snippet is not a claim.
  it('ignores closing keywords inside HTML comments and fenced code', () => {
    const body = 'Fixes #245\n<!-- Example: Fixes #194 -->\n```\ncloses #12\n```\nresolves #13'
    const prs = [{ number: 9, isDraft: true, headRefName: 'claude/x', title: 'fix: y', body }]
    expect([...claimedIssues(prs, []).keys()].sort((a, b) => a - b)).toEqual([13, 245])
  })

  it('does not count a bare issue mention in the body as a claim', () => {
    const prs = [{ number: 9, isDraft: true, headRefName: 'claude/x', title: 'fix: y', body: 'Related to #100, see #101' }]
    expect(claimedIssues(prs, []).size).toBe(0)
  })

  it('records one entry per source even when a PR names the issue twice', () => {
    const prs = [{ number: 9, isDraft: true, headRefName: 'claude/thing-77', title: 'feat: thing (#77)', body: 'Fixes #77' }]
    expect(claimedIssues(prs, []).get(77)).toEqual(['draft PR #9'])
  })
})

describe('worktreeNotes', () => {
  const base = { isRoot: false, branch: 'codex/x', detached: false, ahead: 1, dirty: 0, pushed: true, unpushed: 0, pr: 12, behind: 0, lastActivity: NOW }

  it('says nothing about a pushed branch with a PR and recent activity', () => {
    expect(worktreeNotes(base, NOW)).toEqual([])
  })

  it('flags work nobody else can see', () => {
    expect(worktreeNotes({ ...base, pushed: false, pr: null }, NOW)).toContain('not pushed: other agents cannot see it')
    expect(worktreeNotes({ ...base, unpushed: 3 }, NOW)).toContain('3 commits not pushed')
    expect(worktreeNotes({ ...base, pr: null }, NOW)).toContain('pushed but no PR: open a draft PR to claim it')
  })

  it('flags a detached worktree holding changes', () => {
    const notes = worktreeNotes({ ...base, branch: null, detached: true, ahead: 0, dirty: 28, pushed: false, pr: null }, NOW)
    expect(notes).toContain('no branch: 28 uncommitted files')
  })

  it('marks a fully merged, clean worktree as removable, without deciding for its owner', () => {
    const notes = worktreeNotes({ ...base, ahead: 0, pr: null, lastActivity: NOW - 13 * DAY }, NOW)
    expect(notes).toContain('everything merged, nothing uncommitted: can be removed (by whoever owns it)')
    expect(notes).toContain('idle 13d')
  })

  it('flags uncommitted work on a branch with nothing committed, and never calls it removable', () => {
    const notes = worktreeNotes({ ...base, ahead: 0, dirty: 2, pr: null }, NOW)
    expect(notes).toContain('2 uncommitted files, nothing committed: other agents cannot see it')
    expect(notes.some((n) => n.includes('can be removed'))).toBe(false)
  })

  // Sable squash-merges, so a merged branch's commits never reach origin/main
  // and "ahead" stays above zero; the merged PR is the real signal. Without it
  // a merged branch whose remote was deleted would read as "not pushed".
  it('treats a branch whose PR was squash-merged as done', () => {
    const merged = { ...base, ahead: 4, pushed: false, pr: null, mergedPr: 243 }
    expect(worktreeNotes(merged, NOW)).toEqual(['PR #243 merged: can be removed (by whoever owns it)'])
    expect(worktreeNotes({ ...merged, dirty: 3 }, NOW)).toEqual(['PR #243 merged, but 3 uncommitted files'])
  })

  it('lets an open PR win over an older merged one on a reused branch', () => {
    expect(worktreeNotes({ ...base, mergedPr: 200 }, NOW)).toEqual([])
  })

  it('says so when a worktree cannot be read, instead of guessing', () => {
    expect(worktreeNotes({ ...base, unreadable: true }, NOW)).toEqual(["couldn't read it from here (sandbox?): ask its owner"])
  })

  // Without GitHub, "no PR" is unknown, not absent: don't send an agent to open a
  // PR that already exists.
  it('drops PR advice when GitHub could not be asked', () => {
    expect(worktreeNotes({ ...base, pr: null, prsKnown: false }, NOW)).toEqual([])
  })

  it('reports a worktree whose folder has gone', () => {
    expect(worktreeNotes({ ...base, missing: true }, NOW)).toEqual(['folder missing: git worktree prune clears it'])
  })

  it(`calls a worktree idle after ${STALE_DAYS} days, not before`, () => {
    expect(worktreeNotes({ ...base, lastActivity: NOW - (STALE_DAYS - 1) * DAY }, NOW)).toEqual([])
    expect(worktreeNotes({ ...base, lastActivity: NOW - STALE_DAYS * DAY }, NOW)).toContain(`idle ${STALE_DAYS}d`)
  })

  it('reports the root checkout falling behind or leaving main', () => {
    const root = { ...base, isRoot: true, branch: 'main', ahead: 0, pr: null }
    expect(worktreeNotes({ ...root, behind: 20 }, NOW)).toEqual(['20 commits behind origin/main'])
    expect(worktreeNotes({ ...root, branch: 'feat/x' }, NOW)).toContain('root checkout is not on main: other agents read it, tell the owner')
    // The root is never "removable", and its own commits are judged by behind, not ahead.
    expect(worktreeNotes({ ...root, lastActivity: NOW - 30 * DAY }, NOW)).toEqual([])
  })

  it('uses singular wording for one', () => {
    expect(worktreeNotes({ ...base, unpushed: 1 }, NOW)).toContain('1 commit not pushed')
    expect(worktreeNotes({ ...base, ahead: 0, dirty: 1, pr: null }, NOW)).toContain('1 uncommitted file, nothing committed: other agents cannot see it')
  })
})

describe('parseStatus', () => {
  it('reads paths, renames and quoted names, and whether anything is staged', () => {
    const porcelain = [' M AGENTS.md', 'MM CLAUDE.md', 'R  old.js -> new.js', '?? "a b.png"', 'A  src/x.js'].join('\n')
    expect(parseStatus(porcelain)).toEqual([
      { path: 'AGENTS.md', staged: false },
      { path: 'CLAUDE.md', staged: true },
      { path: 'new.js', staged: true },
      { path: 'a b.png', staged: false },
      { path: 'src/x.js', staged: true },
    ])
  })

  it('returns nothing for a clean tree', () => {
    expect(parseStatus('')).toEqual([])
  })
})

describe('mergedPrFor', () => {
  const merged = [
    { number: 243, headRefName: 'claude/rank-explained-220', headRefOid: 'aaa' },
    { number: 180, headRefName: 'claude/rank-explained-220', headRefOid: 'old' },
  ]

  it('names the merged PR while the worktree still sits on its head commit', () => {
    expect(mergedPrFor({ branch: 'claude/rank-explained-220', head: 'aaa' }, merged)).toBe(243)
    expect(mergedPrFor({ branch: 'claude/rank-explained-220', head: 'old' }, merged)).toBe(180)
  })

  // A reused branch with new commits must not read as "can be removed".
  it('ignores a merged PR once the branch has moved on', () => {
    expect(mergedPrFor({ branch: 'claude/rank-explained-220', head: 'new' }, merged)).toBe(null)
    expect(mergedPrFor({ branch: null, head: 'aaa' }, merged)).toBe(null)
  })
})

describe('formatReport', () => {
  const report = formatReport({
    now: NOW,
    home: '/Users/me',
    prs: [{ number: 251, isDraft: true, headRefName: 'codex/placement-picker-245', title: 'feat(placement): dropdown', body: 'Fixes #245', updatedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString() }],
    claims: new Map([[245, ['draft PR #251']]]),
    worktrees: [
      { path: '/Users/me/code/tattoo-app', branch: 'main', isRoot: true, notes: ['20 commits behind origin/main'] },
      { path: '/Users/me/.codex/worktrees/placement-picker-245/tattoo-app', branch: null, tool: 'codex', notes: ['no branch: 28 uncommitted files'] },
    ],
    warnings: ['GitHub unreachable: PRs and claims not shown'],
  })

  it('lists claims, PRs and worktrees with home shortened', () => {
    expect(report).toMatch(/#245\s+draft PR #251/)
    expect(report).toMatch(/#251\s+draft\s+codex\/placement-picker-245\s+feat\(placement\): dropdown/)
    expect(report).toContain('~/.codex/worktrees/placement-picker-245/tattoo-app')
    expect(report).toContain('(no branch)')
    expect(report).toContain('codex')
    expect(report).toContain('no branch: 28 uncommitted files')
    expect(report).toContain('20 commits behind origin/main')
  })

  it('puts warnings first so a missing network is not mistaken for no work', () => {
    expect(report.indexOf('GitHub unreachable')).toBeLessThan(report.indexOf('Claimed issues'))
  })

  it('marks PRs unknown and claims partial when GitHub was unreachable', () => {
    const offline = formatReport({ now: NOW, home: '/h', prs: [], claims: new Map([[245, ['local worktree (codex)']]]), worktrees: [], warnings: ['GitHub unreachable'], githubOk: false })
    expect(offline).toContain('Claimed issues (local worktrees only: GitHub unreachable)')
    expect(offline).toMatch(/Open PRs\n\s+unknown: GitHub unreachable/)
  })

  it('says so when nothing is claimed or open', () => {
    const empty = formatReport({ now: NOW, home: '/h', prs: [], claims: new Map(), worktrees: [], warnings: [] })
    expect(empty).toMatch(/Claimed issues\n\s+none/)
    expect(empty).toMatch(/Open PRs\n\s+none/)
  })
})

// The IJFW plugin hook rewrites AGENTS.md and CLAUDE.md in every checkout, so
// without this every old worktree reads as holding uncommitted work.
describe('stripPluginBlocks', () => {
  const ORIGINAL = '# Sable — Agent Context\n\nRead CLAUDE.md first.\n- **Run it:** npm test\n'
  const HOOKED = [
    '---',
    'ijfw_version: 1.3.2',
    'signals:',
    '  - kind: manifest',
    '---',
    '# Sable — Agent Context',
    '',
    'Read CLAUDE.md first.',
    '- **Run it:** npm test',
    '',
    '<!-- IJFW-MEMORY-START (managed -- do not edit manually) -->',
    'Project memory at .ijfw/memory/.',
    '<!-- IJFW-MEMORY-END -->',
    '',
    '<!-- IJFW-AGENTS-START -->',
    'No project agents yet.',
    '<!-- IJFW-AGENTS-END -->',
    '',
  ].join('\n')

  it('reduces a hook-only change to the committed text', () => {
    expect(stripPluginBlocks(HOOKED)).toBe(stripPluginBlocks(ORIGINAL))
  })

  it('still sees a real edit made alongside the hook', () => {
    expect(stripPluginBlocks(HOOKED.replace('npm test', 'npm run lint'))).not.toBe(stripPluginBlocks(ORIGINAL))
  })

  it('leaves ordinary front matter and an unterminated marker alone', () => {
    expect(stripPluginBlocks('---\ntitle: x\n---\nbody')).toContain('title: x')
    expect(stripPluginBlocks('a\n<!-- IJFW-MEMORY-START -->\nb')).toContain('b')
  })
})

// Contract: the command every agent is told to run exists, and each tool's
// instruction file tells it to run it.
describe('agents:status wiring', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const read = (f) => readFileSync(join(root, f), 'utf8')

  it('is an npm script running the CLI half', () => {
    expect(JSON.parse(read('package.json')).scripts['agents:status']).toBe('node scripts/agentsStatus.js')
    expect(read('scripts/agentsStatus.js')).toContain("from '../src/agents/agentStatus.js'")
  })

  it.each(['AGENTS.md', 'GEMINI.md', 'CLAUDE.md'])('%s tells agents to run it', (file) => {
    expect(read(file)).toContain('npm run agents:status')
  })

  it('CLAUDE.md holds the rules the others point to', () => {
    expect(read('CLAUDE.md')).toMatch(/^## Working alongside other agents$/m)
    expect(read('AGENTS.md')).toContain('Working alongside other agents')
    expect(read('GEMINI.md')).toContain('Working alongside other agents')
  })
})
