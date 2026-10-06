// Clipboard access is deliberately caller-triggered; denial never causes a second read.
export async function readCaptureClipboard(clipboard) {
  if (!clipboard?.read && !clipboard?.readText) return { kind: 'manual', reason: 'unsupported' }
  try {
    if (!clipboard.read) {
      const text = await clipboard.readText()
      return text.trim() ? { kind: 'text', text } : { kind: 'manual', reason: 'empty' }
    }
    const items = await clipboard.read()
    for (const item of items) {
      const type = item.types.find((value) => ['image/png', 'image/jpeg', 'image/webp'].includes(value))
      if (!type) continue
      const blob = await item.getType(type)
      return { kind: 'image', file: new File([blob], 'clipboard-image', { type }) }
    }
    for (const item of items) {
      if (!item.types.includes('text/plain')) continue
      const text = await (await item.getType('text/plain')).text()
      if (text.trim()) return { kind: 'text', text }
    }
    return { kind: 'manual', reason: 'empty' }
  } catch (error) {
    return { kind: 'manual', reason: error?.name === 'NotAllowedError' ? 'denied' : 'unreadable' }
  }
}
