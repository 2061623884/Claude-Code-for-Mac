// 汇总 Claude 通过文件工具（Edit / MultiEdit / Write / NotebookEdit）改过的文件。纯函数。
// 只统计成功的工具调用；用终端命令（sed 等）改的文件统计不到。
import { diffLines } from 'diff'
import type { UiBlock, UiMessage } from './chat'

type ToolBlock = Extract<UiBlock, { kind: 'tool' }>

export interface FileEdit {
  toolId: string
  before: string
  after: string
}

export interface FileChange {
  path: string
  added: number
  removed: number
  /** Write 新建的文件 */
  created: boolean
  edits: FileEdit[]
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '')

/** 读写文件类工具操作的文件路径；其他工具返回 null */
export function toolFilePath(name: string, input: Record<string, unknown>): string | null {
  if (!['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)) return null
  return s(input.file_path) || s(input.notebook_path) || null
}

function editsOf(block: ToolBlock): { path: string; edits: FileEdit[]; created: boolean } | null {
  const path = toolFilePath(block.name, block.input)
  if (!path) return null
  const input = block.input
  const one = (before: string, after: string): FileEdit => ({ toolId: block.id, before, after })
  switch (block.name) {
    case 'Edit':
      return { path, edits: [one(s(input.old_string), s(input.new_string))], created: false }
    case 'MultiEdit': {
      const list = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : []
      return { path, edits: list.map((e) => one(s(e.old_string), s(e.new_string))), created: false }
    }
    case 'Write':
      return { path, edits: [one('', s(input.content))], created: /created/i.test(block.result?.text ?? '') }
    case 'NotebookEdit':
      return { path, edits: [one('', s(input.new_source))], created: false }
    default:
      return null // Read 只读不改
  }
}

function count(before: string, after: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const part of diffLines(before, after)) {
    if (part.added) added += part.count ?? 0
    else if (part.removed) removed += part.count ?? 0
  }
  return { added, removed }
}

// 每条消息的改动只算一次 diff：流式输出时没变的消息对象保持不变，直接用缓存
const perMessage = new WeakMap<UiMessage, FileChange[]>()

function changesIn(m: UiMessage): FileChange[] {
  let list = perMessage.get(m)
  if (!list) {
    list = []
    for (const b of m.blocks) {
      if (b?.kind !== 'tool' || !b.result || b.result.isError) continue
      const found = editsOf(b)
      if (!found?.path) continue
      let added = 0
      let removed = 0
      for (const e of found.edits) {
        const n = count(e.before, e.after)
        added += n.added
        removed += n.removed
      }
      list.push({ path: found.path, added, removed, created: found.created, edits: found.edits })
    }
    perMessage.set(m, list)
  }
  return list
}

/** 按最近改动排在前面 */
export function collectFileChanges(messages: UiMessage[]): FileChange[] {
  const byPath = new Map<string, FileChange>()
  for (const m of messages) {
    for (const c of changesIn(m)) {
      const change = byPath.get(c.path) ?? { path: c.path, added: 0, removed: 0, created: false, edits: [] }
      byPath.delete(c.path) // 重新插入，保持「最近改动」在后
      change.added += c.added
      change.removed += c.removed
      change.edits = [...change.edits, ...c.edits]
      change.created ||= c.created
      byPath.set(c.path, change)
    }
  }
  return [...byPath.values()].reverse()
}

/** 显式边界优先；只为没有该字段的旧 UI 快照保留 role 回退。 */
export function turnsOf(messages: UiMessage[]): UiMessage[][] {
  const turns: UiMessage[][] = []
  for (const m of messages) {
    if ((m.startsTurn ?? m.role === 'user') && !m.parentToolUseId) turns.push([])
    if (!turns.length) turns.push([])
    turns[turns.length - 1].push(m)
  }
  return turns
}
