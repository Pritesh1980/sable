import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractMermaidBlocks,
  validateMermaidSources,
} from './checkMermaidDocs.js'

test('extracts Mermaid fences in order and ignores other code fences', () => {
  const markdown = [
    '# Diagrams',
    '```js',
    'const ignored = true',
    '```',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '```mermaid   ',
    'sequenceDiagram',
    '  A->>B: Hello',
    '```',
  ].join('\n')

  assert.deepEqual(extractMermaidBlocks(markdown), [
    'flowchart LR\n  A --> B\n',
    'sequenceDiagram\n  A->>B: Hello\n',
  ])
})

test('collects parser failures with file and one-based block locations', async () => {
  const sources = [
    {
      path: 'docs/a.md',
      markdown: [
        '```mermaid',
        'valid one',
        '```',
        '```mermaid',
        'invalid two',
        '```',
      ].join('\n'),
    },
    {
      path: 'README.md',
      markdown: ['```mermaid', 'invalid three', '```'].join('\n'),
    },
  ]
  const parse = async (source) => {
    if (source.includes('invalid')) throw new Error(`bad syntax: ${source.trim()}`)
  }

  await assert.rejects(
    validateMermaidSources(sources, parse),
    (error) => {
      assert.match(error.message, /docs\/a\.md:mermaid-block-2/)
      assert.match(error.message, /README\.md:mermaid-block-1/)
      assert.match(error.message, /bad syntax: invalid two/)
      assert.match(error.message, /bad syntax: invalid three/)
      return true
    }
  )
})

test('fails when tracked Markdown contains no Mermaid diagrams', async () => {
  await assert.rejects(
    validateMermaidSources([{ path: 'README.md', markdown: '# No diagrams' }], async () => {}),
    /No Mermaid blocks found/
  )
})
