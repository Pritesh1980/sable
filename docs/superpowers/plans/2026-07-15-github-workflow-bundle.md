# GitHub Workflow Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sable structured GitHub intake, safer CI execution, vulnerability-driven Dependabot updates, and a personal execution board for every open issue.

**Architecture:** Version-controlled behavior lives under `.github/` and is protected by a Vitest contract test that reads the files as text. GitHub-only state is changed separately through authenticated API and Projects CLI calls, verified immediately, and left independently reversible. The existing application, deployment workflow, and Dependabot version-update schedule remain unchanged.

**Tech Stack:** GitHub Actions YAML, GitHub Issue Forms, Markdown pull-request templates, Vitest, GitHub CLI (`gh`), GitHub REST API, GitHub Projects v2.

## Global Constraints

- Work only in `/Users/pritesh/code/tattoo-app/.worktrees/github-workflow-bundle` on `codex/github-workflow-bundle`.
- Do not modify `main` directly and do not merge the final pull request automatically.
- Preserve `.github/dependabot.yml` and `.github/workflows/deploy-pages.yml` unchanged.
- Preserve CI's Node 26, `npm ci`, full Vitest suite, and production build.
- Do not add lint, CodeQL, deployment automation, release automation, test-report artifacts, branch protection, rulesets, or GitHub Environments.
- Keep GitHub Actions permissions read-only with `contents: read`.
- The Project must expose exactly `Now`, `Next`, `Blocked`, and `Later` through a `Horizon` single-select field.
- Issues labelled `deployment` start in `Blocked`; open issue `#23` starts in `Next`; all other open issues start in `Later`; `Now` starts empty.
- Stop and report any GitHub plan or authentication limitation instead of substituting another service.

---

### Task 1: Add a failing GitHub configuration contract

**Files:**
- Create: `src/test/githubConfig.test.js`

**Interfaces:**
- Consumes: repository files resolved relative to `import.meta.url`.
- Produces: a Vitest contract covering the required issue forms, pull-request template, and CI invariants.

- [ ] **Step 1: Create the failing contract test**

```js
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readRepoFile = path =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('GitHub repository configuration', () => {
  it('collects Sable-specific bug context', () => {
    const form = readRepoFile('.github/ISSUE_TEMPLATE/bug-report.yml')

    expect(form).toContain('name: Bug report')
    expect(form).toContain('id: affected-area')
    expect(form).toContain('id: device')
    expect(form).toContain('id: browser')
    expect(form).toContain('id: backend')
    expect(form).toContain('id: demo-mode')
    expect(form).toContain('id: reproduction')
    expect(form).toContain('id: expected')
    expect(form).toContain('id: actual')
  })

  it('collects outcome and architecture context for feature requests', () => {
    const form = readRepoFile('.github/ISSUE_TEMPLATE/feature-request.yml')

    expect(form).toContain('name: Feature request')
    expect(form).toContain('id: problem')
    expect(form).toContain('id: outcome')
    expect(form).toContain('id: workflow')
    expect(form).toContain('id: alternatives')
    expect(form).toContain('id: architecture-impact')
  })

  it('uses structured issue intake', () => {
    const config = readRepoFile('.github/ISSUE_TEMPLATE/config.yml')

    expect(config).toContain('blank_issues_enabled: false')
  })

  it('provides the Sable pull-request checks', () => {
    const template = readRepoFile('.github/pull_request_template.md')

    expect(template).toContain('## Summary')
    expect(template).toContain('## Verification')
    expect(template).toContain('## Change impact')
    expect(template).toContain('npm test')
    expect(template).toContain('npm run build')
    expect(template).toContain('local-first')
    expect(template).toContain('guide screenshots')
    expect(template).toContain('No secrets or device-local values')
  })

  it('runs CI manually and cancels obsolete branch runs', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml')

    expect(workflow).toMatch(/\n  workflow_dispatch:\s*\n/)
    expect(workflow).toContain('permissions:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('concurrency:')
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.ref }}')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('timeout-minutes: 20')
    expect(workflow).toContain('name: Run tests')
    expect(workflow).toContain('name: Build production app')
  })
})
```

- [ ] **Step 2: Run the contract test and verify the intended failure**

Run:

```bash
npm test -- src/test/githubConfig.test.js
```

Expected: FAIL because `.github/ISSUE_TEMPLATE/bug-report.yml` does not exist.

- [ ] **Step 3: Confirm the failure is scoped to missing GitHub configuration**

Run:

```bash
git status --short
```

Expected: only `src/test/githubConfig.test.js` is untracked; no application file or dependency lockfile changed.

---

### Task 2: Add issue forms and the pull-request template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature-request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Test: `src/test/githubConfig.test.js`

**Interfaces:**
- Consumes: GitHub Issue Form schema and GitHub's conventional pull-request template location.
- Produces: two structured issue entry points and one shared PR checklist.

- [ ] **Step 1: Create the bug report form**

```yaml
name: Bug report
description: Report something in Sable that is broken or behaving unexpectedly.
title: "[Bug]: "
body:
  - type: markdown
    attributes:
      value: Thanks for helping make Sable more reliable. Do not include API keys, login details, or private tattoo data.
  - type: input
    id: affected-area
    attributes:
      label: Affected route or feature
      description: Include the route when possible, for example /gallery or /brief.
      placeholder: /gallery — swipe ranking
    validations:
      required: true
  - type: dropdown
    id: device
    attributes:
      label: Device
      options:
        - iPhone or iPad
        - Mac
        - Other mobile device
        - Other desktop device
    validations:
      required: true
  - type: input
    id: browser
    attributes:
      label: Browser and version
      placeholder: Safari 20
    validations:
      required: true
  - type: dropdown
    id: backend
    attributes:
      label: Backend mode
      options:
        - Local
        - Supabase
        - AWS
        - Not sure
    validations:
      required: true
  - type: dropdown
    id: demo-mode
    attributes:
      label: Demo mode
      options:
        - "No"
        - "Yes"
        - Not sure
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Open …
        2. Tap …
        3. Observe …
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
  - type: textarea
    id: evidence
    attributes:
      label: Screenshots or logs
      description: Drag in relevant files after removing private data and secrets.
```

- [ ] **Step 2: Create the feature request form**

```yaml
name: Feature request
description: Suggest an improvement to Sable's tattoo-planning workflow.
title: "[Feature]: "
body:
  - type: markdown
    attributes:
      value: Describe the planning problem first so the smallest useful solution stays visible.
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What is difficult or impossible in the current workflow?
    validations:
      required: true
  - type: textarea
    id: outcome
    attributes:
      label: Desired outcome
      description: What should be easier when this is complete?
    validations:
      required: true
  - type: textarea
    id: workflow
    attributes:
      label: Proposed workflow
      description: Describe the smallest useful interaction from the user's perspective.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Include any workaround already available in Sable.
  - type: dropdown
    id: architecture-impact
    attributes:
      label: Likely architecture impact
      options:
        - Local-only behavior
        - Synced account data
        - Deployment or public sharing
        - Not sure
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Add sketches or screenshots only after removing private data.
```

- [ ] **Step 3: Disable public blank issue intake**

```yaml
blank_issues_enabled: false
contact_links: []
```

- [ ] **Step 4: Create the pull-request template**

```markdown
## Summary

- What changed:
- Why:
- Related issue:

## Verification

Check each completed command; explain any command that does not apply.

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Focused or manual verification is described below

Verification notes:

## Change impact

- [ ] Tests cover new behavior, or this change has no behavioral surface
- [ ] User documentation is updated, or no documented workflow changed
- [ ] Guide screenshots are updated, or no captured UI changed
- [ ] Local-first and sync behavior remain correct, or storage is unaffected
- [ ] No secrets or device-local values are committed or synced

## Deferred work

List intentionally deferred work, or write “None”.
```

- [ ] **Step 5: Parse the YAML files locally**

Run:

```bash
ruby -e 'require "yaml"; ARGV.each { |path| YAML.parse_file(path); puts "OK #{path}" }' .github/ISSUE_TEMPLATE/bug-report.yml .github/ISSUE_TEMPLATE/feature-request.yml .github/ISSUE_TEMPLATE/config.yml
```

Expected: three `OK` lines and exit code 0.

- [ ] **Step 6: Run the intake contract tests**

Run:

```bash
npm test -- src/test/githubConfig.test.js
```

Expected: the four intake/template tests pass; the CI test still fails because the workflow has not been hardened.

---

### Task 3: Harden CI without adding a new quality gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Test: `src/test/githubConfig.test.js`

**Interfaces:**
- Consumes: the existing Node 26 npm workflow and offline-local Vitest configuration.
- Produces: push, pull-request, and manual CI runs with read-only permissions, cancellation, named steps, and a 20-minute timeout.

- [ ] **Step 1: Replace the CI workflow with the hardened configuration**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 26
          cache: npm
      - name: Install dependencies
        run: npm ci
      # Suite is pinned to the offline local backend via vite.config.js test.env,
      # so no secrets or external services are needed here.
      - name: Run tests
        run: npm test
      - name: Build production app
        run: npm run build
```

- [ ] **Step 2: Parse all repository-owned YAML**

Run:

```bash
ruby -e 'require "yaml"; ARGV.each { |path| YAML.parse_file(path); puts "OK #{path}" }' .github/dependabot.yml .github/workflows/ci.yml .github/workflows/deploy-pages.yml .github/ISSUE_TEMPLATE/bug-report.yml .github/ISSUE_TEMPLATE/feature-request.yml .github/ISSUE_TEMPLATE/config.yml
```

Expected: six `OK` lines and exit code 0.

- [ ] **Step 3: Run the complete GitHub configuration contract**

Run:

```bash
npm test -- src/test/githubConfig.test.js
```

Expected: 5 tests pass.

- [ ] **Step 4: Run the full application suite**

Run:

```bash
npm test
```

Expected: all test files pass. If `useArtistStorage` or `ConceptsVariants` flakes, rerun only the failed file and follow `CLAUDE.md`; do not hide a reproducible failure.

- [ ] **Step 5: Run the production build**

Run:

```bash
npm run build
```

Expected: exit code 0 and a generated `dist/` build.

- [ ] **Step 6: Review and commit the version-controlled bundle**

Run:

```bash
git diff --check
git diff -- .github src/test/githubConfig.test.js
git status --short
git add .github/ISSUE_TEMPLATE .github/pull_request_template.md .github/workflows/ci.yml src/test/githubConfig.test.js
git commit -m "ci(github): strengthen repository workflow"
```

Expected: one commit containing only the two forms, chooser configuration, PR template, CI workflow, and contract test. Do not stage `.github/dependabot.yml` or `.github/workflows/deploy-pages.yml` because they must remain unchanged.

---

### Task 4: Enable Dependabot vulnerability remediation

**Files:**
- No repository files change.

**Interfaces:**
- Consumes: authenticated admin access to `Pritesh1980/sable`.
- Produces: enabled vulnerability alerts and automatic Dependabot security fixes.

- [ ] **Step 1: Record the current settings**

Run both commands and retain their status codes:

```bash
gh api repos/Pritesh1980/sable/vulnerability-alerts
gh api repos/Pritesh1980/sable/automated-security-fixes
```

Expected before mutation: vulnerability alerts return disabled/404; automated security fixes may also return disabled/404.

- [ ] **Step 2: Enable vulnerability alerts**

Run:

```bash
gh api --method PUT repos/Pritesh1980/sable/vulnerability-alerts
```

Expected: HTTP 204 and exit code 0.

- [ ] **Step 3: Verify vulnerability alerts immediately**

Run:

```bash
gh api repos/Pritesh1980/sable/vulnerability-alerts
```

Expected: HTTP 204 and exit code 0.

- [ ] **Step 4: Enable automatic security fixes**

Run:

```bash
gh api --method PUT repos/Pritesh1980/sable/automated-security-fixes
```

Expected: HTTP 204 and exit code 0.

- [ ] **Step 5: Verify automatic security fixes immediately**

Run:

```bash
gh api repos/Pritesh1980/sable/automated-security-fixes
```

Expected: HTTP 204 and exit code 0.

- [ ] **Step 6: Inspect resulting alerts without applying package changes**

Run:

```bash
gh api repos/Pritesh1980/sable/dependabot/alerts --jq '.[] | {number, state, severity: .security_advisory.severity, package: .dependency.package.name}'
```

Expected: a JSON stream of any newly detected alerts, or no output when there are none. Do not run `npm audit fix` or merge a generated Dependabot PR as part of this bundle.

---

### Task 5: Create and populate the personal Sable Backlog Project

**Files:**
- No repository files change.

**Interfaces:**
- Consumes: authenticated GitHub CLI with `project` scope and the repository's open issues.
- Produces: a user-owned `Sable Backlog` Project with a `Horizon` field and classified issue items.

- [ ] **Step 1: Check project authentication**

Run:

```bash
gh project list --owner Pritesh1980 --format json
```

Expected: JSON project data. If GitHub reports missing `read:project`, run `gh auth refresh -s project`, complete GitHub's authorization flow, and rerun the check. Do not continue until the check succeeds.

- [ ] **Step 2: Resolve or create the project idempotently**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
if [[ -z "$PROJECT_NUMBER" ]]; then
  gh project create --owner Pritesh1980 --title "Sable Backlog" --format json
  PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
fi
test -n "$PROJECT_NUMBER"
echo "Sable Backlog project number: $PROJECT_NUMBER"
```

Expected: one project named `Sable Backlog` and a non-empty numeric project number.

- [ ] **Step 3: Create the Horizon field**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
HORIZON_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .id')
if [[ -z "$HORIZON_FIELD_ID" ]]; then
  gh project field-create "$PROJECT_NUMBER" --owner Pritesh1980 --name Horizon --data-type SINGLE_SELECT --single-select-options "Now,Next,Blocked,Later" --format json
fi
gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon")'
```

Expected: a single-select field named `Horizon` whose JSON includes the four options. If the field already exists, do not create a duplicate; use the existing field after verifying its option names.

- [ ] **Step 4: Add every currently open repository issue**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
gh issue list --repo Pritesh1980/sable --state open --limit 100 --json url --jq '.[].url' | xargs -n 1 gh project item-add "$PROJECT_NUMBER" --owner Pritesh1980 --url
```

Expected: every open issue is present exactly once. `gh project item-add` is idempotent for items already in the project.

- [ ] **Step 5: Verify the project, field, and option identifiers**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
gh project view "$PROJECT_NUMBER" --owner Pritesh1980 --format json
gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json
```

Expected: the project JSON contains a non-empty `id`; the `Horizon` field contains non-empty ids for the field and for `Now`, `Next`, `Blocked`, and `Later`. `Now` intentionally receives no initial item.

- [ ] **Step 6: Set every project item to Later**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.id')
HORIZON_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .id')
LATER_OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .options[] | select(.name == "Later") | .id')
test -n "$PROJECT_ID" && test -n "$HORIZON_FIELD_ID" && test -n "$LATER_OPTION_ID"
gh project item-list "$PROJECT_NUMBER" --owner Pritesh1980 --limit 100 --format json --jq '.items[].id' | while read -r ITEM_ID; do gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$HORIZON_FIELD_ID" --single-select-option-id "$LATER_OPTION_ID"; done
```

Expected: every project item has `Horizon: Later` before evidence-based overrides.

- [ ] **Step 7: Move deployment-labelled issues to Blocked**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.id')
HORIZON_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .id')
BLOCKED_OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .options[] | select(.name == "Blocked") | .id')
test -n "$PROJECT_ID" && test -n "$HORIZON_FIELD_ID" && test -n "$BLOCKED_OPTION_ID"
for ISSUE_NUMBER in $(gh issue list --repo Pritesh1980/sable --state open --label deployment --limit 100 --json number --jq '.[].number'); do ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner Pritesh1980 --limit 100 --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .id"); gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$HORIZON_FIELD_ID" --single-select-option-id "$BLOCKED_OPTION_ID"; done
```

Expected: every open issue labelled `deployment` has `Horizon: Blocked`.

- [ ] **Step 8: Move open issue #23 to Next**

First verify it remains open:

```bash
gh issue view 23 --repo Pritesh1980/sable --json state --jq '.state'
```

If it prints `OPEN`, resolve its project item ID and update it:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.id')
HORIZON_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .id')
NEXT_OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json --jq '.fields[] | select(.name == "Horizon") | .options[] | select(.name == "Next") | .id')
test -n "$PROJECT_ID" && test -n "$HORIZON_FIELD_ID" && test -n "$NEXT_OPTION_ID"
ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner Pritesh1980 --limit 100 --format json --jq '.items[] | select(.content.number == 23) | .id')
test -n "$ITEM_ID"
gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$HORIZON_FIELD_ID" --single-select-option-id "$NEXT_OPTION_ID"
```

Expected: issue `#23` has `Horizon: Next`. If it is closed by execution time, leave `Next` empty rather than assigning a different issue without owner input.

- [ ] **Step 9: Configure the project as a board grouped by Horizon**

Open the project in GitHub using the authenticated in-app browser. Change the primary view layout to **Board**, set **Group by** to **Horizon**, and retain all four visible options. Do not add automation rules or change issue labels.

- [ ] **Step 10: Verify project completeness and classification**

Run:

```bash
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
gh issue list --repo Pritesh1980/sable --state open --limit 100 --json number --jq 'length'
gh project item-list "$PROJECT_NUMBER" --owner Pritesh1980 --limit 100 --format json --jq '[.items[] | select(.content.repository == "Pritesh1980/sable" and .content.state == "OPEN")] | length'
gh project field-list "$PROJECT_NUMBER" --owner Pritesh1980 --format json
gh project item-list "$PROJECT_NUMBER" --owner Pritesh1980 --limit 100 --format json
```

Expected: the two counts match; the `Horizon` field exposes exactly Now, Next, Blocked, Later; deployment-labelled issues are Blocked; open issue #23 is Next; remaining issues are Later; Now is empty.

---

### Task 6: Final verification, push, and pull request

**Files:**
- Verify: all branch changes and external GitHub state.

**Interfaces:**
- Consumes: completed repository commits, enabled Dependabot settings, and populated Project.
- Produces: a reviewable non-draft pull request from `codex/github-workflow-bundle` to `main`.

- [ ] **Step 1: Re-run YAML and Git diff checks**

Run:

```bash
ruby -e 'require "yaml"; ARGV.each { |path| YAML.parse_file(path); puts "OK #{path}" }' .github/dependabot.yml .github/workflows/ci.yml .github/workflows/deploy-pages.yml .github/ISSUE_TEMPLATE/bug-report.yml .github/ISSUE_TEMPLATE/feature-request.yml .github/ISSUE_TEMPLATE/config.yml
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short --branch
```

Expected: all YAML parses, diff check exits 0, only intended files appear, and the worktree is clean.

- [ ] **Step 2: Run fresh full verification**

Run:

```bash
npm test
npm run build
```

Expected: the full test suite and production build both exit 0 in this execution.

- [ ] **Step 3: Verify GitHub-only state again**

Run:

```bash
gh api repos/Pritesh1980/sable/vulnerability-alerts
gh api repos/Pritesh1980/sable/automated-security-fixes
PROJECT_NUMBER=$(gh project list --owner Pritesh1980 --format json --jq '.projects[] | select(.title == "Sable Backlog") | .number')
gh project item-list "$PROJECT_NUMBER" --owner Pritesh1980 --limit 100 --format json
```

Expected: both settings return HTTP 204 and the project output contains every open issue with its Horizon classification.

- [ ] **Step 4: Push the isolated branch**

Run:

```bash
git push -u origin codex/github-workflow-bundle
```

Expected: branch push succeeds and establishes the upstream.

- [ ] **Step 5: Open the pull request**

Run:

```bash
gh pr create --repo Pritesh1980/sable --base main --head codex/github-workflow-bundle --title "ci(github): strengthen repository workflow" --body "## Summary
- add structured bug and feature issue forms
- add a Sable-specific pull-request checklist
- harden CI with manual runs, read-only permissions, cancellation, and a timeout
- enable Dependabot vulnerability remediation
- create and populate the personal Sable Backlog Project

## Verification
- npm test
- npm run build
- all repository YAML parsed locally
- Dependabot settings verified through the GitHub API
- project issue count and Horizon classifications verified"
```

Expected: a non-draft pull request URL targeting `main`. Do not merge it.

- [ ] **Step 6: Confirm the pull request CI result**

Run:

```bash
gh pr checks --repo Pritesh1980/sable --watch
```

Expected: the `test-and-build` check completes successfully. If it fails, inspect the run, fix the branch in the worktree, repeat fresh local verification, push, and wait for the replacement check.

## Plan Self-Review

- Every approved design requirement maps to Tasks 1–6.
- Repository changes, security settings, and Project state have independent verification and rollback boundaries.
- No paid-plan feature or deployment/release work is included.
- The Project classification is deterministic and does not invent a current `Now` priority.
- All implementation files and commands are explicit; no application behavior or dependency change is required.
