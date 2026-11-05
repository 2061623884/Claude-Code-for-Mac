/** Plain text for a short native notification; preserve Unicode code points. */
export function notificationPreview(text: string, limit = 160): string {
  const plain = text
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g, (_match, bold, underline, code) => bold ?? underline ?? code)
    .replace(/\s+/g, ' ').trim()
  const points = Array.from(plain)
  return points.length > limit ? points.slice(0, limit - 1).join('') + '…' : plain
}
