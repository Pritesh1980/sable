import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { HELP_GROUPS, GUIDE_BASE, guideUrl } from '../data/helpTopics.js'

// #220 I: Help is a short How-do-I list. The detail lives in docs/ only, and
// every answer links to the docs heading that holds it.
const topics = HELP_GROUPS.flatMap((group) => group.topics)
const words = (text) => text.split(/\s+/).filter(Boolean).length

// GitHub's heading anchor: lower case, punctuation dropped, each space a hyphen.
function githubSlug(heading) {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function anchorsIn(file) {
  return readFileSync(`docs/${file}`, 'utf8').split('\n')
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) => githubSlug(line.replace(/^#+ /, '').replace(/[*`]/g, '')))
}

describe('Help topics', () => {
  it('asks each topic as a question, with a unique id', () => {
    expect(topics.length).toBeGreaterThanOrEqual(10)
    expect(topics.length).toBeLessThanOrEqual(16)
    for (const topic of topics) expect(topic.question).toMatch(/\?$/)
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length)
  })

  it('answers each in two to four short lines', () => {
    for (const topic of topics) {
      expect(topic.steps.length, topic.id).toBeGreaterThanOrEqual(2)
      expect(topic.steps.length, topic.id).toBeLessThanOrEqual(4)
      for (const step of topic.steps) expect(words(step), step).toBeLessThanOrEqual(32)
    }
  })

  it('keeps the whole page short', () => {
    const total = topics.reduce((sum, t) => sum + words(t.question) + t.steps.reduce((s, step) => s + words(step), 0), 0)
    expect(total).toBeLessThan(1000)
  })

  it('links every topic to a real heading in the full guide', () => {
    for (const topic of topics) {
      const [file, anchor] = topic.guide.split('#')
      expect(existsSync(`docs/${file}`), topic.guide).toBe(true)
      // GitHub suffixes a repeated heading (-1, -2), so the target must be unique.
      expect(anchorsIn(file).filter((a) => a === anchor), topic.guide).toHaveLength(1)
      expect(guideUrl(topic.guide)).toBe(`${GUIDE_BASE}${topic.guide}`)
    }
  })

  it('shows only screenshots that exist', () => {
    for (const topic of topics.filter((t) => t.image)) {
      expect(existsSync(`public/guide/${topic.image}`), topic.image).toBe(true)
    }
  })

  it('points at the public guide on GitHub', () => {
    expect(GUIDE_BASE).toBe('https://github.com/Pritesh1980/sable/blob/main/docs/')
  })
})
