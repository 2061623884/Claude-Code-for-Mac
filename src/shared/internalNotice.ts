import type { UiMessage } from './chat'

/** Presentation only: never infer who sent a message from its text. */
export function internalNoticeKind(message: UiMessage): UiMessage['internalKind'] {
  if (message.role !== 'notice' || message.source !== 'internal') return undefined
  if (message.internalKind === 'compact' || message.internalKind === 'command') return message.internalKind
  const text = message.blocks.filter(b => b.kind === 'text').map(b => b.text).join('\n')
  // Conservatively surface recognizable diagnostics even when stored as metadata.
  if (/(?:^|\n)\s*(?:API Error\b|Error\b|Warning\b|Failed\b|Permission\b|Approval\b|Authentication\b|Rate limit\b|Connection (?:error|failed)|错误|失败|警告|需要授权|等待授权|权限|连接失败|请求失败)/i.test(text)) return 'notification'
  return message.internalKind ?? 'notification'
}

type DisplayEntry = { kind: 'message'; message: UiMessage } | { kind: 'technical'; messages: UiMessage[] }
/** Only merge adjacent records; never move notices across a reply or user turn. */
export function groupTechnicalNotices(messages: UiMessage[]): DisplayEntry[] {
  const entries: DisplayEntry[] = []
  for (const message of messages) {
    const kind = internalNoticeKind(message)
    if (kind === 'command') continue // represented by the command card
    const last = entries.at(-1)
    if (kind === 'technical') {
      if (last?.kind === 'technical') last.messages.push(message)
      else entries.push({ kind: 'technical', messages: [message] })
    } else entries.push({ kind: 'message', message })
  }
  return entries
}
