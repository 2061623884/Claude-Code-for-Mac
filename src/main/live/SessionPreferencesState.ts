import type { ChatEvent, SessionOptions } from '../../shared/chat'
import type { SessionPreferences, SessionPreferencesRepository } from '../sessionPreferences'

interface Entry {
  value: SessionPreferences
  savedOptions?: SessionOptions
  saveError: string | null
}

/** 区分可拒绝的持久化命令和已经发生、不能因写盘失败而回滚的运行状态。 */
export class SessionPreferencesState {
  private entries = new Map<string, Entry>()

  constructor(
    private repository: SessionPreferencesRepository | undefined,
    private publish: (id: string, event: ChatEvent) => void
  ) {}

  private entry(id: string): Entry {
    let entry = this.entries.get(id)
    if (!entry) {
      const saved = this.repository?.load(id)
      const value = saved ? structuredClone(saved) : { queue: { items: [], paused: false } }
      if (saved) {
        value.queue.paused = value.queue.items.length > 0
        for (const item of value.queue.items) {
          delete item.editing
          if (['submitting', 'submitted', 'received'].includes(item.status)) item.status = 'unknown'
        }
      }
      entry = { value, savedOptions: saved?.options, saveError: null }
      this.entries.set(id, entry)
    }
    return entry
  }

  get(id: string): SessionPreferences { return this.entry(id).value }

  persistence(id: string): { optionsSaved: boolean; optionsSaveError: string | null } {
    const entry = this.entry(id)
    const current = entry.value.options, saved = entry.savedOptions
    return {
      optionsSaved: Boolean(current && saved && current.model === saved.model && current.mode === saved.mode && current.effort === saved.effort),
      optionsSaveError: entry.saveError
    }
  }

  update(id: string, change: (value: SessionPreferences) => void, commit: 'durable' | 'applied' = 'durable'): void {
    const entry = this.entry(id)
    const next = structuredClone(entry.value)
    change(next)
    if (!next.queue.items.length) next.queue.paused = false
    let failure: Error | undefined
    try {
      this.repository?.save(id, next)
      entry.savedOptions = next.options ? { ...next.options } : undefined
      entry.saveError = null
    } catch (error) {
      if (commit === 'durable') throw error
      failure = new Error(`会话状态已生效，但保存失败：${error instanceof Error ? error.message : String(error)}。重启后可能恢复旧配置。`)
      entry.saveError = failure.message
    }
    entry.value = next
    if (next.options) this.publish(id, { kind: 'options', options: structuredClone(next.options), ...this.persistence(id) })
    this.publish(id, { kind: 'queue', queue: structuredClone(next.queue) })
    if (failure) throw failure
  }

  /** SDK 回调与关闭清理不能被存储异常打断。 */
  observe(id: string, change: (value: SessionPreferences) => void): void {
    try { this.update(id, change, 'applied') }
    catch (error) { this.publish(id, { kind: 'notice', text: error instanceof Error ? error.message : String(error) }) }
  }
}
