import type { UiMessage } from './chat'

/** Presentation only: never infer who sent a message from its text. */
export function internalNoticeKind(message: UiMessage): UiMessage['internalKind'] {
  if (message.role !== 'notice' || message.source !== 'internal') return undefined
  if (message.internalKind === 'compact' || message.internalKind === 'command') return message.internalKind
  const text = message.blocks.filter(b => b.kind === 'text').map(b => b.text).join('\n')
  // Conservatively surface recognizable diagnostics even when stored as metadata.
  // Image resize hints accompany Read results; live streams flag them synthetic, history flags them meta.
  if (/^\s*\[Image: original \d+x\d+, displayed at \d+x\d+\.[^\]]*\]\s*$/.test(text)) return 'technical'
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

/** Normalize SDK interruption notices for display without changing stored provenance. */
export function isInterruptionNotice(message: UiMessage): boolean {
  if (message.role !== 'notice' || message.source === 'human' || message.source === 'external' || message.startsTurn) return false
  return message.blocks.length === 1 && message.blocks[0].kind === 'text'
    && /^\[Request interrupted by user(?: for tool use)?\]$/.test(message.blocks[0].text.trim())
}

export type TaskNotification = { status?: string; summary?: string; taskId?: string; outputFile?: string }
/** Parse a CLI task notification body. Only call for messages whose provenance is task-notification. */
export function parseTaskNotification(text: string): TaskNotification | null {
  const body = /<task-notification>([\s\S]*?)<\/task-notification>/.exec(text)?.[1]
  if (body == null) return null
  const field = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1].trim() || undefined
  return { status: field('status'), summary: field('summary'), taskId: field('task-id'), outputFile: field('output-file') }
}
