import type { ChatActivity } from '../../shared/chat'
type Json = Record<string, unknown>
// 同一进程中的实例替换也继续递增，旧快照不能覆盖恢复后的新状态。
let revision = 0
export class TurnActivity {
  private value: ChatActivity = { revision: ++revision, phase: 'idle' }
  private dirty = false
  private pending = new Map<string, string>()
  snapshot(): ChatActivity { return { ...this.value } }
  takeChanged(): ChatActivity | undefined {
    if (!this.dirty) return
    this.dirty = false
    return this.snapshot()
  }
  private set(phase: ChatActivity['phase'], toolId?: string, toolName?: string): void {
    if (this.value.phase === phase && this.value.toolId === toolId && this.value.toolName === toolName) return
    this.value = { revision: ++revision, phase, ...(toolId ? { toolId, toolName } : {}) }
    this.dirty = true
  }
  start(): void { this.pending.clear(); this.set('working') }
  finish(): void { this.pending.clear(); this.set('idle') }
  stop(): void { this.set('stopping') }
  resume(): void { this.afterTool() }
  private afterTool(): void {
    const entry = [...this.pending].at(-1)
    if (entry) this.set('tool', entry[0], entry[1])
    else this.set('working')
  }
  apply(raw: unknown): void {
    const m = raw as Json
    if (m.parent_tool_use_id || this.value.phase === 'idle' || this.value.phase === 'stopping') return
    if (m.type === 'result') { this.finish(); return }
    if (m.type === 'system' && m.subtype === 'thinking_tokens') { this.set('thinking'); return }
    if (m.type === 'stream_event') {
      const e = m.event as Json
      if (e.type === 'message_start') this.set('working')
      const block = (e.content_block ?? e.delta) as Json | undefined
      if (block?.type === 'thinking' || block?.type === 'thinking_delta') this.set('thinking')
      else if (block?.type === 'text' || block?.type === 'text_delta') this.set('responding')
      else if (block?.type === 'tool_use' || block?.type === 'input_json_delta') this.set('working')
    } else if (m.type === 'assistant') {
      const content = (m.message as Json)?.content
      if (!Array.isArray(content)) return
      for (const block of content as Json[]) {
        if (block.type === 'tool_use') {
          const id = String(block.id), name = String(block.name)
          this.pending.set(id, name); this.set('tool', id, name)
        } else if (block.type === 'text') this.set('responding')
        else if (block.type === 'thinking') this.set('thinking')
      }
    } else if (m.type === 'tool_progress') {
      const id = String(m.tool_use_id), name = String(m.tool_name)
      this.pending.set(id, name); this.set('tool', id, name)
    } else if (m.type === 'user') {
      const content = (m.message as Json)?.content
      if (!Array.isArray(content)) return
      let changed = false
      for (const block of content as Json[]) if (block.type === 'tool_result') changed = this.pending.delete(String(block.tool_use_id)) || changed
      if (changed) this.afterTool()
    }
  }
}
