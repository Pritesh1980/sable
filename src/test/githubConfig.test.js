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
})
