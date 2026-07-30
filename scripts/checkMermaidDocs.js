import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const MERMAID_FENCE = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm

export function extractMermaidBlocks(markdown) {
  return [...String(markdown).matchAll(MERMAID_FENCE)].map((match) => match[1])
}

export async function validateMermaidSources(sources, parse) {
  const diagrams = sources.flatMap(({ path, markdown }) =>
    extractMermaidBlocks(markdown).map((source, index) => ({
      path,
      block: index + 1,
      source,
    }))
  )

  if (diagrams.length === 0) {
    throw new Error('No Mermaid blocks found in tracked Markdown.')
  }

  const failures = []
  for (const diagram of diagrams) {
    try {
      await parse(diagram.source)
    } catch (error) {
      failures.push(
        `${diagram.path}:mermaid-block-${diagram.block}\n${error?.message || String(error)}`
      )
    }
  }

  if (failures.length) {
    throw new Error(failures.join('\n\n'))
  }

  return {
    diagramCount: diagrams.length,
    fileCount: new Set(diagrams.map(({ path }) => path)).size,
  }
}

export function trackedMarkdownFiles(cwd = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd })
    .toString()
    .split('\0')
    .filter(Boolean)
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://docs.sable.test/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  })
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: dom.window.CSS,
  })
}

export async function checkTrackedMermaid({ cwd = process.cwd() } = {}) {
  const files = trackedMarkdownFiles(cwd)
  const sources = files.map((path) => ({
    path,
    markdown: readFileSync(new URL(path, pathToFileURL(`${cwd}/`)), 'utf8'),
  }))

  installDom()
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false })
  return validateMermaidSources(sources, (source) => mermaid.parse(source))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkTrackedMermaid()
    .then(({ diagramCount, fileCount }) => {
      console.log(`Parsed ${diagramCount} Mermaid diagrams across ${fileCount} Markdown files.`)
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
