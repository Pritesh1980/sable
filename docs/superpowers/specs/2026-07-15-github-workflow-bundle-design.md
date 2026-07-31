# GitHub Workflow Bundle Design

**Date:** 2026-07-15

**Status:** Approved for planning

**Repository:** `Pritesh1980/sable`

## Purpose

Improve Sable's solo-development workflow using GitHub features that are available on the repository's current private GitHub plan. The bundle should catch vulnerable dependencies, collect better issue and pull-request context, reduce wasted CI work, and turn the existing issue backlog into a practical personal execution board.

## Scope

This bundle includes four outcomes:

1. Enable Dependabot vulnerability alerts and automatic security-update pull requests.
2. Add structured issue forms and a pull-request template under `.github/`.
3. Harden the existing CI workflow without adding new quality gates.
4. Create a personal GitHub Project containing the repository's open issues.

The bundle does not include releases, deployment automation, CodeQL, GitHub Environments, branch protection, or rulesets. Those either exceed the immediate need or require a paid plan for this private repository.

## Repository Changes

### Issue intake

Create two YAML issue forms:

- **Bug report:** collects the affected route or feature, browser and device, backend mode, whether demo mode was active, reproduction steps, expected behavior, actual behavior, and optional screenshots or logs.
- **Feature request:** collects the problem, desired outcome, proposed workflow, alternatives, and local-first or deployment implications.

Create an issue-template chooser configuration that exposes only the two structured forms. Repository maintainers can still open blank issues when necessary.

### Pull-request template

Create one concise Markdown template containing:

- a change summary and linked issue;
- verification commands and results;
- checkboxes for tests, production build, documentation, and guide screenshots when relevant;
- checks for local-first behavior, secrets, and device-local data boundaries;
- a note to identify intentionally deferred work.

The template must use conditional wording so documentation and screenshot checks are not falsely required for non-UI changes.

### Continuous integration

Update `.github/workflows/ci.yml` while preserving its current test-and-build behavior.

Add:

- `workflow_dispatch` for manual runs;
- top-level read-only `contents` permission;
- concurrency keyed by workflow and ref, with superseded runs cancelled;
- a job timeout;
- descriptive step names;
- `npm ci`, the full Vitest suite, and the production build as separate steps.

Do not add lint as a CI gate because the repository currently has known lint debt. Do not add test artifacts because Vitest does not currently produce a stable report artifact; adding an unused upload step would create maintenance without diagnostic value.

## GitHub Settings

Enable these repository settings through the authenticated GitHub API:

- Dependabot vulnerability alerts;
- Dependabot automatic security updates.

The existing `.github/dependabot.yml` remains responsible for monthly grouped npm version updates and quarterly GitHub Actions updates. Security updates are additive and should remain eligible to open immediately when GitHub identifies a vulnerable dependency.

If the GitHub plan or API rejects either setting, stop and report the exact limitation rather than substituting a different security product.

## Personal Project

Create a user-owned GitHub Project named **Sable Backlog** and add every issue that is open at execution time.

The planning states are:

- **Now:** the single current focus, or a very small set of actively executing issues;
- **Next:** actionable work that can begin after Now;
- **Blocked:** work waiting for deployment, infrastructure, or another explicit prerequisite;
- **Later:** valid backlog work without a current commitment.

Initial classification follows issue evidence rather than guessing priorities:

- issues carrying the `deployment` label start in **Blocked**;
- issue `#23`, which tracks a known flaky test, starts in **Next** because it affects development confidence;
- all other open issues start in **Later**;
- **Now** starts empty so the board does not invent a current commitment for the owner.

If GitHub's default Status field cannot be configured with these exact options through the available API, create a single-select field named **Horizon** with these options and use it as the project board's column field. Do not silently fall back to GitHub's generic Todo/In Progress/Done workflow.

Creating or editing the Project requires the GitHub CLI token to have project scopes. If authentication lacks those scopes, pause only the Project portion, provide the exact authorization command, and continue the repository and Dependabot portions.

## Validation

Before opening a pull request:

1. Parse every added or modified YAML file locally.
2. Inspect the full diff for accidental secrets, unrelated changes, and invalid GitHub template keys.
3. Run the complete Vitest suite from the isolated worktree.
4. Run the production build.
5. Confirm the worktree branch is clean after committing.
6. Confirm Dependabot settings through read-only API checks.
7. Confirm the Project exists, contains all currently open issues, and exposes the four planning states.
8. Push the branch and open a non-draft pull request; do not merge it automatically.

## Error Handling and Rollback

- Repository-file changes remain isolated in `codex/github-workflow-bundle` until review.
- GitHub setting mutations must be verified immediately after each API call.
- If a setting call fails, no unrelated setting is changed to compensate.
- If Project population partially fails, retain the created project, report which issues were added, and retry only the missing items.
- Dependabot settings can be disabled independently through repository settings if rollback is needed.
- The Project can be archived or deleted independently of the repository branch.

## Success Criteria

The work is ready for review when:

- GitHub offers structured bug and feature forms plus the PR checklist;
- CI supports push, pull-request, and manual runs while cancelling obsolete runs;
- CI still runs the complete tests and production build;
- Dependabot alerts and automatic security updates are enabled;
- Sable Backlog contains every open issue and supports Now, Next, Blocked, and Later;
- the repository branch passes its full test and build verification;
- a pull request presents the complete change without modifying `main` directly.
