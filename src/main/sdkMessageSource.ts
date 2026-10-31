import type { UiMessage } from '../shared/chat'

type Json = Record<string, unknown>
const object = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}

/** SDK 0.3.301 的实时字段和历史字段在这里统一；不能用正文推断身份。 */
export function sdkMessageSource(raw: unknown): NonNullable<UiMessage['source']> {
  const m = object(raw)
  const origin = object(m.origin)
  // CLI 的压缩摘要可能沿用 human origin；没有本应用提交记录时，元数据优先。
  if (m.isCompactSummary === true) return 'internal'
  if (typeof origin.kind === 'string' && origin.kind !== 'human' && origin.kind !== 'unclassified') return 'external'
  if (['isSynthetic', 'isMeta', 'is_meta', 'isVisibleInTranscriptOnly', 'isCompletedLocalCommand'].some(key => m[key] === true)) return 'internal'
  if (origin.kind === 'human') return 'human'
  const content = object(m.message).content
  if (Array.isArray(content) && content.some(c => object(c).type === 'tool_result')) return 'internal'
  return 'unknown'
}

export function sdkOriginKind(raw: unknown): string | undefined {
  const kind = object(object(raw).origin).kind
  return typeof kind === 'string' ? kind : undefined
}
