// Loop-based stand-ins for `.replace(/[set]+$/, '')` and friends. The regex
// form backtracks quadratically on a long run of set characters followed by
// one that isn't (SonarQube S8786); a scan from the end is linear. The parsers
// that call these also cap line length, so this is about staying linear by
// construction rather than a live hazard.

const WHITESPACE = /\s/

function trimmable(chars, whitespace) {
  const set = new Set(chars)
  return (ch) => set.has(ch) || (whitespace && WHITESPACE.test(ch))
}

export function trimEndChars(value, chars, { whitespace = false } = {}) {
  const s = String(value ?? '')
  const drop = trimmable(chars, whitespace)
  let end = s.length
  while (end > 0 && drop(s[end - 1])) end -= 1
  return s.slice(0, end)
}

export function trimChars(value, chars, { whitespace = false } = {}) {
  const s = trimEndChars(value, chars, { whitespace })
  const drop = trimmable(chars, whitespace)
  let start = 0
  while (start < s.length && drop(s[start])) start += 1
  return s.slice(start)
}
