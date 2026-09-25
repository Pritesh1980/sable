// A random id for local records and dirty-state tokens. crypto.randomUUID only
// exists in secure contexts, and the dev server reached from a phone over plain
// http (LAN or Tailscale IP) is not one; getRandomValues works everywhere, so
// the fallback never needs Math.random (SonarQube S2245).
export function randomId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
