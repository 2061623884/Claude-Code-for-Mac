import { access } from 'node:fs/promises'
import * as store from '../store'
import type { SessionPreferences, SessionPreferencesRepository } from '../sessionPreferences'
import { randomUUID } from 'node:crypto'
import type { CommandInfo } from '../../shared/types'
import type { BtwTurn, ChatEvent, ChatSnapshot, ContextUsage, Decision, QueueAction, QueuedMessage, McpStatus, SessionOptions } from '../../shared/chat'
import { peekContext } from '../context'
import { loadSdk, withIdleQuery } from '../sdk'
import { Transcript } from '../transcript'
import { LiveSession } from './LiveSession'
import type { ActivityRepository } from '../activityRepository'
import type { HumanSubmissionRepository } from '../humanSubmissionRepository'

const MAX_LIVE = 4
const IDLE_MS = 15 * 60_000

interface CommandObserver {
  configuration(): string
  publisher(cwd: string): (commands: CommandInfo[]) => void
}

type Emit = (sessionId: string, event: ChatEvent) => void

export class SessionManager {
  private live = new Map<string, LiveSession>()
  private commandConfigurations = new WeakMap<LiveSession, string>()
  private transcripts = new Map<string, Transcript>()
  private transcriptLoads = new Map<string, Promise<Transcript>>()
  /** 最近一次和会话文件同步时，文件里的消息条数；用来发现别处（终端、VS Code）续写了这个会话 */
  private seen = new Map<string, number>()
  private sweeper = setInterval(() => this.closeIdle(), 60_000)

  private preferences = new Map<string, SessionPreferences>()
  private locks = new Map<string, Promise<unknown>>()
  private shuttingDown = false

  constructor(private emit: Emit, private activityStore?: ActivityRepository, private commandObserver?: CommandObserver, private submissionStore?: HumanSubmissionRepository, private preferencesStore?: SessionPreferencesRepository) {}

  commandsFor(cwd: string, configuration?: string): Promise<CommandInfo[]> | undefined {
    const session = [...this.live.values()].find((candidate) => candidate.cwd === cwd && (configuration === undefined || this.commandConfigurations.get(candidate) === configuration))
    return session?.commands()
  }

  async open(sessionId: string, projectPath: string): Promise<ChatSnapshot> {
    const transcript = await this.transcript(sessionId, projectPath)
    const session = this.live.get(sessionId)
    const prefs = this.prefs(sessionId)
    return {
      ...(prefs.options ? { options: structuredClone(prefs.options) } : {}),
      queue: structuredClone(prefs.queue),
      optionsSaved: Boolean(prefs.options),
      activity: session?.activity.snapshot(),
      summary: transcript.activity.snapshot(),
      messages: structuredClone(transcript.messages),
      state: session?.state ?? 'idle',
      approvals: session?.approvals ?? [],
      live: Boolean(session)
    }
  }

  start(projectPath: string, text: string, options: SessionOptions): string {
    const sessionId = randomUUID()
    const transcript = new Transcript(projectPath)
    this.transcripts.set(sessionId, transcript)
    this.updatePrefs(sessionId, p => { p.options = options })
    this.spawn(sessionId, projectPath, false, options, transcript).send(text)
    return sessionId
  }

  /**
   * 编辑历史消息：从源会话的 at（主链条目 uuid）之后分叉出一个新会话，发出改过的消息。原会话不变
   */
  async fork(sourceId: string, projectPath: string, at: string, text: string, options: SessionOptions): Promise<string> {
    const sdk = await loadSdk()
    const sessionId = randomUUID()
    const transcript = new Transcript(projectPath, undefined, this.submissionStore?.load(sourceId))
    for (const m of await sdk.getSessionMessages(sourceId, { dir: projectPath })) {
      transcript.apply(m)
      if (m.uuid === at) break
    }
    transcript.finish()
    transcript.activity.finishHistory(true)
    transcript.takeChanged()
    this.submissionStore?.save(sessionId, transcript.humanSubmissions())
    this.transcripts.set(sessionId, transcript)
    this.updatePrefs(sessionId, p => { p.options = options })
    this.spawn(sessionId, projectPath, false, options, transcript, { from: sourceId, at }).send(text)
    return sessionId
  }

  async send(sessionId: string, projectPath: string, text: string, options: SessionOptions, attachments: string[] = []): Promise<void> {
    return this.lock(sessionId, async () => {
      for (const path of attachments) await access(path)
      const prefs = this.prefs(sessionId)
      const session = this.live.get(sessionId)
      const busy = session?.state === 'running' || session?.state === 'awaiting'
      const hasWaiting = prefs.queue.items.some(item => item.editing || ['queued', 'failed'].includes(item.status))
      // 提交历史/未知交付记录不是待发消息，也不能把新的手动输入锁进旧队列。
      if (busy || hasWaiting) {
        this.updatePrefs(sessionId, p => { p.queue.items.push({ id: randomUUID(), text, options: { ...options }, attachments, status: 'queued' }) })
        if (!busy) await this.dispatch(sessionId, projectPath)
        return
      }
      if (prefs.queue.paused || prefs.queue.items.some(i => ['submitting', 'submitted', 'received'].includes(i.status))) {
        this.updatePrefs(sessionId, p => {
          p.queue.paused = false
          for (const item of p.queue.items) if (['submitting', 'submitted', 'received'].includes(item.status)) { item.status = 'unknown'; item.error = '前次执行已结束，交付记录待核对；不会自动重发' }
        })
      }
      await this.applyOptions(sessionId, options)
      const live = session ?? this.spawn(sessionId, projectPath, true, options, await this.transcript(sessionId, projectPath))
      live.send(text)
    })
  }

  async queueAction(sessionId: string, projectPath: string, action: QueueAction): Promise<void> {
    return this.lock(sessionId, async () => {
      const prefs = this.prefs(sessionId)
      if (action.type === 'pause') { this.updatePrefs(sessionId, p => { p.queue.paused = true }); return }
      if (action.type === 'resume') {
        this.updatePrefs(sessionId, p => { p.queue.paused = false; for (const item of p.queue.items) if (item.status === 'failed') item.status = 'queued' })
        await this.dispatch(sessionId, projectPath); return
      }
      if (action.type === 'clear') { this.updatePrefs(sessionId, p => { p.queue.items = p.queue.items.filter(i => !['queued', 'failed'].includes(i.status) || i.editing) }); return }
      if (!('id' in action)) throw new Error('无效队列操作')
      const item = prefs.queue.items.find(i => i.id === action.id)
      if (!item) {
        if (['beginEdit', 'edit', 'cancelEdit', 'move'].includes(action.type)) throw new Error('这条消息已不在队列中，无法编辑')
        return
      }
      if (action.type === 'forget' && item.status === 'unknown') { this.updatePrefs(sessionId, p => { p.queue.items = p.queue.items.filter(i => i.id !== item.id) }); return }
      if (!['queued', 'failed'].includes(item.status)) throw new Error('消息已经提交，不能再次发送或修改')
      if (action.type === 'beginEdit') {
        if (item.editing) throw new Error('这条消息正在编辑中')
        this.updatePrefs(sessionId, p => { p.queue.items.find(i => i.id === item.id)!.editing = true }); return
      }
      if (action.type === 'cancelEdit') {
        this.updatePrefs(sessionId, p => {
          delete p.queue.items.find(i => i.id === item.id)!.editing
          if (!this.live.get(sessionId) || this.live.get(sessionId)?.state === 'idle') p.queue.paused = true
        }); return
      }
      if (item.editing && action.type !== 'edit') throw new Error('请先保存或取消编辑')
      if (action.type === 'move') {
        if (!['before', 'after'].includes(action.position)) throw new Error('无效排序位置')
        const movable = (entry: QueuedMessage): boolean => !entry.editing && ['queued', 'failed'].includes(entry.status)
        const target = prefs.queue.items.find(i => i.id === action.targetId)
        if (!target || !movable(target)) throw new Error('目标消息已提交或正在编辑，请重新调整顺序')
        if (item.id === target.id) return
        this.updatePrefs(sessionId, p => {
          const ordered = p.queue.items.filter(movable)
          const [moving] = ordered.splice(ordered.findIndex(i => i.id === item.id), 1)
          const index = ordered.findIndex(i => i.id === target.id) + (action.position === 'after' ? 1 : 0)
          ordered.splice(index, 0, moving)
          let cursor = 0
          // 已提交和编辑中的记录留在原槽位，只调整可派发消息的顺序。
          p.queue.items = p.queue.items.map(i => movable(i) ? ordered[cursor++] : i)
        }); return
      }
      if (action.type === 'delete') { this.updatePrefs(sessionId, p => { p.queue.items = p.queue.items.filter(i => i.id !== item.id) }); return }
      if (action.type === 'edit') {
        if (!item.editing) throw new Error('请先进入编辑模式')
        if (!action.text.trim()) throw new Error('消息不能为空')
        const paths = action.attachments ?? item.attachments ?? []
        for (const path of paths) await access(path)
        this.updatePrefs(sessionId, p => {
          const target = p.queue.items.find(i => i.id === item.id)!
          target.text = action.text; target.attachments = paths; target.status = 'queued'; delete target.error; delete target.editing
          if (!this.live.get(sessionId) || this.live.get(sessionId)?.state === 'idle') p.queue.paused = true
        }); return
      }
      if (action.type !== 'insert') throw new Error('无效队列操作')
      const live = this.live.get(sessionId)
      if (!live || live.state !== 'running' || live.activity.snapshot().phase === 'stopping') throw new Error('当前会话不可插入，请等待执行恢复或使用继续队列')
      await this.submitQueued(sessionId, projectPath, item, true)
    })
  }

  /** /btw：在会话旁边问个小问题，不写入会话。会话进程没在运行时先恢复它（不发消息） */
  async sideQuestion(
    sessionId: string,
    projectPath: string,
    question: string,
    history: BtwTurn[],
    options: SessionOptions
  ): Promise<string | null> {
    let session = this.live.get(sessionId)
    if (!session) {
      const transcript = await this.transcript(sessionId, projectPath)
      session = this.live.get(sessionId) ?? this.spawn(sessionId, projectPath, true, this.prefs(sessionId).options ?? options, transcript)
    }
    return session.sideQuestion(question, history)
  }

  /** /mcp：会话在运行就问它，否则临时起一个进程读取（不发消息） */
  async mcp(sessionId: string | null, projectPath: string): Promise<McpStatus[]> {
    const live = sessionId ? this.live.get(sessionId) : undefined
    const list = live ? await live.mcpStatus() : await withIdleQuery({ cwd: projectPath }, (q) => q.mcpServerStatus())
    return list.map((s) => ({ name: s.name, status: s.status, error: s.error, scope: s.scope, tools: s.tools?.length ?? 0 }))
  }

  async interrupt(sessionId: string): Promise<void> {
    this.updatePrefs(sessionId, p => { p.queue.paused = true })
    await this.live.get(sessionId)?.interrupt()
  }

  setMode(sessionId: string, mode: SessionOptions['mode']): Promise<void> { return this.lock(sessionId, () => this.applyOptions(sessionId, { mode })) }
  setModel(sessionId: string, model: string | null): Promise<void> { return this.lock(sessionId, () => this.applyOptions(sessionId, { model })) }
  setEffort(sessionId: string, effort: SessionOptions['effort']): Promise<void> { return this.lock(sessionId, () => this.applyOptions(sessionId, { effort })) }

  async respond(sessionId: string, requestId: string, decision: Decision): Promise<void> {
    return this.lock(sessionId, async () => {
      await this.live.get(sessionId)?.respond(requestId, decision)
      if (decision.type === 'planApprove') this.updatePrefs(sessionId, p => { p.options = { ...this.options(sessionId), mode: decision.mode } })
    })
  }

  async checkExternal(sessionId: string, projectPath: string): Promise<boolean> {
    if (this.live.has(sessionId)) return false // 正在本应用里运行的会话以本应用为准
    const sdk = await loadSdk()
    const count = (await sdk.getSessionMessages(sessionId, { dir: projectPath })).length
    const before = this.seen.get(sessionId)
    if (before === undefined) this.seen.set(sessionId, count)
    return before !== undefined && count > before
  }

  async context(sessionId: string, projectPath: string, model: string | null): Promise<ContextUsage | null> {
    const live = this.live.get(sessionId)
    // 新会话还没写出会话文件时读不到，返回 null 即可
    return (live ? live.contextUsage() : peekContext(sessionId, projectPath, model)).catch(() => null)
  }

  reload(sessionId: string, projectPath: string): Promise<ChatSnapshot> {
    this.closeSession(sessionId)
    this.transcripts.delete(sessionId)
    this.transcriptLoads.delete(sessionId)
    return this.open(sessionId, projectPath)
  }

  closeAll(): void {
    this.shuttingDown = true
    clearInterval(this.sweeper)
    for (const s of this.live.values()) s.close()
    this.live.clear()
  }

  private async transcript(sessionId: string, projectPath: string): Promise<Transcript> {
    const existing = this.transcripts.get(sessionId)
    if (existing) return existing
    const pending = this.transcriptLoads.get(sessionId)
    if (pending) return pending
    // 并发恢复共享同一份记录，避免缓存和 LiveSession 持有不同实例。
    const loading = loadSdk().then(async (sdk) => {
      const saved = this.activityStore?.load(sessionId)
      const transcript = new Transcript(projectPath, saved, this.submissionStore?.load(sessionId))
      const messages = await sdk.getSessionMessages(sessionId, { dir: projectPath })
      for (const m of messages) transcript.apply(m)
      transcript.finish()
      transcript.activity.finishHistory(!saved)
      transcript.takeChanged()
      if (this.transcriptLoads.get(sessionId) === loading) {
        this.seen.set(sessionId, messages.length)
        this.transcripts.set(sessionId, transcript)
      }
      return transcript
    })
    this.transcriptLoads.set(sessionId, loading)
    try {
      return await loading
    } finally {
      if (this.transcriptLoads.get(sessionId) === loading) this.transcriptLoads.delete(sessionId)
    }
  }

  private spawn(
    sessionId: string,
    cwd: string,
    resume: boolean,
    options: SessionOptions,
    transcript: Transcript,
    fork?: { from: string; at: string }
  ): LiveSession {
    this.evictIfFull()
    const emit = (event: ChatEvent): void => {
      if (event.kind === 'summary') this.activityStore?.save(sessionId, transcript.activity.export())
      if (event.kind === 'result') {
        const ids = event.diagnostic?.userMessageIds ?? []
        this.updatePrefs(sessionId, p => {
          p.queue.items = p.queue.items.filter(i => !ids.includes(i.id))
          if (!ids.length) for (const item of p.queue.items) {
            if (['submitting', 'submitted', 'received'].includes(item.status)) { item.status = 'unknown'; item.error = '执行已结束，但引擎未提供消息关联信息，请核对会话'; p.queue.paused = true }
          }
          if (event.error) p.queue.paused = true
        })
      }
      if (event.kind === 'state' && event.state === 'error') this.updatePrefs(sessionId, p => { p.queue.paused = true })
      this.emit(sessionId, event)
      if (event.kind === 'state' && event.state === 'idle' && !this.shuttingDown) {
        void this.lock(sessionId, () => this.dispatch(sessionId, cwd)).catch(error => this.emit(sessionId, { kind: 'notice', text: String(error) }))
      }
    }
    const configuration = this.commandObserver?.configuration()
    const session = new LiveSession({
      sessionId, cwd, resume, fork, options, transcript, emit, onCommands: this.commandObserver?.publisher(cwd),
      onConsumed: (ids) => {
        this.updatePrefs(sessionId, p => { for (const item of p.queue.items) if (ids.includes(item.id)) item.status = 'received' })
      },
      onSubmit: (submission) => {
        if (!this.submissionStore) return
        const previous = this.submissionStore.load(sessionId)
        this.submissionStore.save(sessionId, [...previous.filter(s => s.uuid !== submission.uuid), submission])
      },
      onClosed: (closed) => {
        // 迟到的旧实例退出事件不能删除已经替换它的新实例。
        if (this.live.get(sessionId) !== closed) return
        this.live.delete(sessionId)
        this.updatePrefs(sessionId, p => {
          if (p.queue.items.length) p.queue.paused = true
          for (const item of p.queue.items) if (['submitting', 'submitted', 'received'].includes(item.status)) item.status = 'unknown'
        })
        this.seen.delete(sessionId)
      }
    })
    if (configuration !== undefined) this.commandConfigurations.set(session, configuration)
    this.live.set(sessionId, session)
    void session.start()
    return session
  }

  private prefs(id: string): SessionPreferences {
    let prefs = this.preferences.get(id)
    if (!prefs) {
      const saved = this.preferencesStore?.load(id)
      prefs = saved ? structuredClone(saved) : { queue: { items: [], paused: false } }
      if (saved) {
        for (const item of prefs.queue.items) delete item.editing
        prefs.queue.paused = prefs.queue.items.length > 0
        for (const item of prefs.queue.items) if (['submitting', 'submitted', 'received'].includes(item.status)) item.status = 'unknown'
      }
      this.preferences.set(id, prefs)
    }
    return prefs
  }

  private options(id: string): SessionOptions {
    const defaults = store.read().settings
    return this.prefs(id).options ?? { model: defaults.defaultModel ?? null, mode: defaults.defaultPermissionMode ?? 'default', effort: defaults.defaultEffort ?? null }
  }

  private updatePrefs(id: string, update: (prefs: SessionPreferences) => void): void {
    const next = structuredClone(this.prefs(id))
    update(next)
    if (!next.queue.items.length) next.queue.paused = false
    this.preferencesStore?.save(id, next)
    this.preferences.set(id, next)
    if (next.options) this.emit(id, { kind: 'options', options: structuredClone(next.options) })
    this.emit(id, { kind: 'queue', queue: structuredClone(next.queue) })
  }

  private lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(id) ?? Promise.resolve()).catch(() => {}).then(fn)
    this.locks.set(id, next)
    void next.finally(() => { if (this.locks.get(id) === next) this.locks.delete(id) }).catch(() => {})
    return next
  }

  private async applyOptions(id: string, patch: Partial<SessionOptions>): Promise<void> {
    for (const key of ['model', 'effort', 'mode'] as const) {
      if (patch[key] === undefined) continue
      const live = this.live.get(id)
      if (live && this.options(id)[key] !== patch[key]) {
        if (key === 'model') await live.setModel(patch.model!)
        if (key === 'effort') await live.setEffort(patch.effort!)
        if (key === 'mode') await live.setMode(patch.mode!)
      }
      this.updatePrefs(id, p => { p.options = { ...this.options(id), [key]: patch[key] } })
    }
  }

  private async dispatch(id: string, cwd: string): Promise<void> {
    if (this.shuttingDown) return
    const prefs = this.prefs(id), live = this.live.get(id)
    if (prefs.queue.paused || (live && live.state !== 'idle') || prefs.queue.items.some(i => ['submitting', 'submitted', 'received'].includes(i.status))) return
    const item = prefs.queue.items.find(i => i.status === 'queued')
    if (item && !item.editing) await this.submitQueued(id, cwd, item, false)
  }

  private async submitQueued(id: string, cwd: string, item: QueuedMessage, insert: boolean): Promise<void> {
    let handedOff = false
    try {
      for (const path of item.attachments ?? []) await access(path)
      if (!insert) await this.applyOptions(id, item.options)
      let live = this.live.get(id)
      if (!live) {
        const transcript = await this.transcript(id, cwd)
        if (this.shuttingDown) throw new Error('应用已关闭，队列保持暂停')
        live = this.live.get(id) ?? this.spawn(id, cwd, true, this.options(id), transcript)
      }
      if (this.shuttingDown) throw new Error('应用已关闭，队列保持暂停')
      this.updatePrefs(id, p => { const target = p.queue.items.find(i => i.id === item.id)!; target.status = 'submitting'; if (insert) target.options = { ...this.options(id) }; delete target.error })
      // 进入发送调用后，异常也不能证明消息未交付；保守标记未知，避免重发。
      handedOff = true
      live.send(item.text, item.id)
      this.updatePrefs(id, p => { const target = p.queue.items.find(i => i.id === item.id); if (target?.status === 'submitting') target.status = 'submitted' })
    } catch (error) {
      this.updatePrefs(id, p => {
        p.queue.paused = true
        const target = p.queue.items.find(i => i.id === item.id)
        if (target) { target.status = handedOff ? 'unknown' : 'failed'; target.error = String(error) }
      })
      throw error
    }
  }

  /** 同时运行的进程太多时，关掉最久没用的空闲会话 */
  private evictIfFull(): void {
    if (this.live.size < MAX_LIVE) return
    const idle = [...this.live].filter(([, s]) => s.state === 'idle').sort((a, b) => a[1].lastActive - b[1].lastActive)
    const victim = idle[0]
    if (victim) this.closeSession(victim[0])
  }

  private closeIdle(): void {
    const now = Date.now()
    for (const [id, s] of this.live) if (s.state === 'idle' && now - s.lastActive > IDLE_MS) this.closeSession(id)
  }

  private closeSession(id: string): void {
    const session = this.live.get(id)
    if (session) this.updatePrefs(id, p => {
      if (p.queue.items.length) p.queue.paused = true
      for (const item of p.queue.items) if (['submitting', 'submitted', 'received'].includes(item.status)) item.status = 'unknown'
    })
    this.live.delete(id)
    session?.close()
    this.seen.delete(id) // 进程刚写完文件，下次检查时重新记基准
  }
}
