import type { Transcript } from '../transcript'
import type { LiveSession } from './LiveSession'

/** 唯一持有运行实例及创建中的 Promise；关闭时使尚未完成的恢复失效。 */
export class SessionRuntimes {
  private sessions = new Map<string, LiveSession>()
  private pending = new Map<string, Promise<LiveSession>>()
  private closed = false

  get size(): number { return this.sessions.size }
  get(id: string): LiveSession | undefined { return this.sessions.get(id) }
  has(id: string): boolean { return this.sessions.has(id) }
  values(): MapIterator<LiveSession> { return this.sessions.values() }
  [Symbol.iterator](): MapIterator<[string, LiveSession]> { return this.sessions.entries() }

  add(id: string, session: LiveSession): void {
    if (this.closed) throw new Error('应用已关闭')
    if (this.sessions.has(id)) throw new Error('会话已经在运行')
    this.sessions.set(id, session)
  }

  remove(id: string, expected: LiveSession): boolean {
    if (this.sessions.get(id) !== expected) return false
    return this.sessions.delete(id)
  }

  getOrCreate(id: string, load: () => Promise<Transcript>, create: (transcript: Transcript) => LiveSession): Promise<LiveSession> {
    if (this.closed) return Promise.reject(new Error('应用已关闭'))
    const existing = this.sessions.get(id)
    if (existing) return Promise.resolve(existing)
    const pending = this.pending.get(id)
    if (pending) return pending
    const task = load().then(transcript => {
      if (this.closed || this.pending.get(id) !== task) throw new Error('会话恢复已取消，请重试')
      return this.sessions.get(id) ?? create(transcript)
    })
    this.pending.set(id, task)
    void task.finally(() => { if (this.pending.get(id) === task) this.pending.delete(id) }).catch(() => {})
    return task
  }

  close(id: string): void {
    this.pending.delete(id)
    const session = this.sessions.get(id)
    this.sessions.delete(id)
    session?.close()
  }

  closeAll(): void {
    this.closed = true
    this.pending.clear()
    for (const session of this.sessions.values()) session.close()
    this.sessions.clear()
  }
}
