import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const readRepoFile = path =>
  readFileSync(resolve(testDirectory, '../..', path), 'utf8')

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

    expect(workflow).toMatch(/\n {2}workflow_dispatch:\s*\n/)
    expect(workflow).toContain('permissions:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('concurrency:')
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.ref }}')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('timeout-minutes: 20')
    expect(workflow).toContain('name: Run tests')
    expect(workflow).toContain('name: Build production app')
  })
  it('blocks PRs that add vulnerable dependencies', () => {
    const workflow = readRepoFile('.github/workflows/dependency-review.yml')

    expect(workflow).toMatch(/\n {2}pull_request:/)
    expect(workflow).toContain('actions/dependency-review-action@')
    expect(workflow).toContain('fail-on-severity: high')
  })

  it('smoke-tests the live demo after each deploy and weekly', () => {
    const workflow = readRepoFile('.github/workflows/live-smoke.yml')
    const config = readRepoFile('playwright.live.config.js')

    expect(workflow).toContain('workflow_run:')
    expect(workflow).toContain('Deploy demo to GitHub Pages')
    // Only a successful deploy is worth testing; a failed one left the old site up.
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(workflow).toMatch(/\n {2}schedule:/)
    expect(workflow).toContain('playwright.live.config.js')
    // Against the real site: no local build or server.
    expect(config).not.toContain('webServer')
    expect(config).toContain('https://pritesh1980.github.io/sable/')
    // The live spec must not be picked up by the offline suite, and vice versa.
    expect(config).toContain("testMatch: '**/*.live.js'")
    expect(readRepoFile('playwright.config.js')).toContain("testMatch: '**/*.e2e.js'")
  })

  it('groups generated release notes by the labels PR titles map to', () => {
    const release = readRepoFile('.github/release.yml')
    const labeler = readRepoFile('.github/workflows/pr-labels.yml')

    for (const label of ['feature', 'fix', 'docs', 'dependencies']) {
      expect(release).toContain(`- ${label}`)
      expect(labeler).toContain(`'${label}'`)
    }
    expect(release).toContain("- '*'")
    // Reads only the title; never checks out PR code under the write token.
    expect(labeler).toContain('pull_request_target:')
    expect(labeler).not.toContain('actions/checkout')
  })
  it('measures test coverage in CI as lcov, for SonarQube Cloud', () => {
    const pkg = JSON.parse(readRepoFile('package.json'))
    const viteConfig = readRepoFile('vite.config.js')
    const workflow = readRepoFile('.github/workflows/ci.yml')

    expect(pkg.scripts['test:coverage']).toBe('vitest run --coverage')
    // The coverage plugin must match vitest exactly, or it refuses to load.
    expect(pkg.devDependencies['@vitest/coverage-v8']).toBe(pkg.devDependencies.vitest)
    expect(viteConfig).toContain("provider: 'v8'")
    expect(viteConfig).toContain("'lcov'")
    expect(workflow).toContain('run: npm run test:coverage')
    expect(readRepoFile('.gitignore')).toMatch(/^\/?coverage\/?$/m)
  })

  it('runs the SonarQube Cloud scan only once a token is configured', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml')
    const sonar = readRepoFile('sonar-project.properties')

    expect(workflow).toContain('SonarSource/sonarqube-scan-action@')
    expect(workflow).toContain('SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}')
    // Skipped (not failed) on forks, Dependabot and before setup: no secret.
    expect(workflow).toContain("if: env.SONAR_TOKEN != ''")
    // Sonar's new-code and blame data need full history, not a shallow clone.
    expect(workflow).toContain('fetch-depth: 0')
    expect(sonar).toContain('sonar.organization=pritesh1980')
    expect(sonar).toContain('sonar.projectKey=Pritesh1980_sable')
    expect(sonar).toContain('sonar.javascript.lcov.reportPaths=coverage/lcov.info')
    // The shipped line-up seed is data held as text, not code to grade.
    expect(sonar).toContain('src/data/lineups/**')
  })
})
