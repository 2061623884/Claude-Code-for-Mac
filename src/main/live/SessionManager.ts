import { isAbsolute } from 'node:path'
import { open as openFile } from 'node:fs/promises'
import type { TaskOutput } from '../../shared/taskOutput'
import { randomUUID } from 'node:crypto'
import type { CommandInfo } from '../../shared/types'
import type { BtwTurn, ChatEvent, ChatSnapshot, ContextUsage, Decision, McpStatus, SessionOptions } from '../../shared/chat'
import { peekContext } from '../context'
import { loadSdk, withIdleQuery } from '../sdk'
import { Transcript } from '../transcript'
import { LiveSession } from './LiveSession'
import type { ActivityRepository } from '../activityRepository'

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
  private infoRequests = new Map<string, Promise<unknown>>()
  private transcriptLoads = new Map<string, Promise<Transcript>>()
  /** 最近一次和会话文件同步时，文件里的消息条数；用来发现别处（终端、VS Code）续写了这个会话 */
  private seen = new Map<string, number>()
  private sweeper = setInterval(() => this.closeIdle(), 60_000)

  constructor(private emit: Emit, private activityStore?: ActivityRepository, private commandObserver?: CommandObserver) {}

  cachedSnapshot(sessionId: string): { cwd: string; summary: NonNullable<ChatSnapshot['summary']>; messages: ChatSnapshot['messages'] } | undefined {
    const transcript = this.transcripts.get(sessionId)
    if (!transcript) return
    const summary = transcript.activity.snapshot()
    const cwd = this.live.get(sessionId)?.cwd ?? summary.sections.projects.find(p => p.path)?.path
    if (cwd) return { cwd, summary, messages: transcript.messages }
  }
  commandsFor(cwd: string, configuration?: string): Promise<CommandInfo[]> | undefined {
    const session = [...this.live.values()].find((candidate) => candidate.cwd === cwd && (configuration === undefined || this.commandConfigurations.get(candidate) === configuration))
    return session?.commands()
  }

  async open(sessionId: string, projectPath: string): Promise<ChatSnapshot> {
    const transcript = await this.transcript(sessionId, projectPath)
    const session = this.live.get(sessionId)
    return {
      runtime: session?.runtimeInfo,
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
    this.spawn(sessionId, projectPath, false, options, transcript).send(text)
    return sessionId
  }

  /**
   * 编辑历史消息：从源会话的 at（主链条目 uuid）之后分叉出一个新会话，发出改过的消息。原会话不变
   */
  async fork(sourceId: string, projectPath: string, at: string, text: string, options: SessionOptions): Promise<string> {
    const sdk = await loadSdk()
    const sessionId = randomUUID()
    const transcript = new Transcript(projectPath)
    for (const m of await sdk.getSessionMessages(sourceId, { dir: projectPath })) {
      transcript.apply(m)
      if (m.uuid === at) break
    }
    transcript.finish()
    transcript.activity.finishHistory(true)
    transcript.takeChanged()
    this.transcripts.set(sessionId, transcript)
    this.spawn(sessionId, projectPath, false, options, transcript, { from: sourceId, at }).send(text)
    return sessionId
  }

  async send(sessionId: string, projectPath: string, text: string, options: SessionOptions): Promise<void> {
    let session = this.live.get(sessionId)
    if (!session) {
      const transcript = await this.transcript(sessionId, projectPath)
      session = this.live.get(sessionId) ?? this.spawn(sessionId, projectPath, true, options, transcript)
    }
    session.send(text)
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
      session = this.live.get(sessionId) ?? this.spawn(sessionId, projectPath, true, options, transcript)
    }
    return session.sideQuestion(question, history)
  }

  /** /mcp：会话在运行就问它，否则临时起一个进程读取（不发消息） */
  private coalesce<T>(key: string, read: () => Promise<T>): Promise<T> {
    const pending = this.infoRequests.get(key)
    if (pending) return pending as Promise<T>
    const request = read().finally(() => { if (this.infoRequests.get(key) === request) this.infoRequests.delete(key) })
    this.infoRequests.set(key, request); return request
  }
  async mcp(sessionId: string | null, projectPath: string): Promise<McpStatus[]> {
    return this.coalesce(`mcp:${sessionId}:${projectPath}`, async () => {
      const live = sessionId ? this.live.get(sessionId) : undefined
      const list = live ? await live.mcpStatus() : await withIdleQuery({ cwd: projectPath }, (q) => q.mcpServerStatus())
      return list.map((s) => ({ name: s.name, status: s.status, error: s.error, scope: s.scope, tools: s.tools?.length ?? 0 }))
    })
  }

  async stopTask(sessionId: string, recordId: string, runId?: string): Promise<void> {
    const live = this.live.get(sessionId)
    if (!live) throw new Error('历史任务不能停止')
    await live.stopTask(recordId, runId)
  }
  async taskOutput(sessionId: string, projectPath: string, recordId: string, offset = 0): Promise<TaskOutput> {
    const transcript = await this.transcript(sessionId, projectPath)
    const item = transcript.activity.taskRecord(recordId)
    if (!item?.execution) throw new Error('没有可靠的任务输出关联')
    const ref = item.execution
    if (ref.agentId) {
      const sdk = await loadSdk()
      const raw = await sdk.getSubagentMessages(sessionId, ref.agentId, { dir: projectPath, offset, limit: 100 }).catch(() => [])
      if (raw.length) {
        const output = new Transcript(projectPath)
        for (const message of raw) output.apply(message)
        output.finish()
        return { messages: output.messages, truncated: raw.length === 100, nextOffset: raw.length === 100 ? offset + raw.length : undefined }
      }
    }
    const childMessages = transcript.messages.filter(m => ref.toolUseId && m.parentToolUseId === ref.toolUseId)
    if (childMessages.length) return { messages: structuredClone(childMessages.slice(offset, offset + 100)), truncated: childMessages.length > offset + 100, nextOffset: childMessages.length > offset + 100 ? offset + 100 : undefined }
    if (ref.outputFile && isAbsolute(ref.outputFile)) {
      // 路径只能来自该会话的 SDK 记录，不接受渲染层传入路径。
      const file = await openFile(ref.outputFile, 'r').catch(() => null)
      if (file) try {
        const stat = await file.stat()
        if (stat.isFile()) { const size = Math.min(stat.size, 256 * 1024), buffer = Buffer.alloc(size); await file.read(buffer, 0, size, Math.max(0, stat.size - size)); return { messages: [], text: buffer.toString('utf8'), truncated: stat.size > size } }
      } finally { await file.close() }
    }
    return { messages: [], truncated: false, unavailable: '没有保存可读取的完整输出；现有任务摘要仍保留。' }
  }
  interrupt(sessionId: string): Promise<void> | undefined {
    return this.live.get(sessionId)?.interrupt()
  }

  setMode(sessionId: string, mode: SessionOptions['mode']): Promise<void> | undefined {
    return this.live.get(sessionId)?.setMode(mode)
  }

  setModel(sessionId: string, model: string | null): Promise<void> | undefined {
    return this.live.get(sessionId)?.setModel(model)
  }

  setEffort(sessionId: string, effort: SessionOptions['effort']): Promise<void> | undefined {
    return this.live.get(sessionId)?.setEffort(effort)
  }

  respond(sessionId: string, requestId: string, decision: Decision): void {
    this.live.get(sessionId)?.respond(requestId, decision)
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
    return this.coalesce(`context:${sessionId}:${projectPath}:${model}`, () => (live ? live.contextUsage() : peekContext(sessionId, projectPath, model)).catch(() => null))
  }

  reload(sessionId: string, projectPath: string): Promise<ChatSnapshot> {
    this.closeSession(sessionId)
    this.transcripts.delete(sessionId)
    this.transcriptLoads.delete(sessionId)
    return this.open(sessionId, projectPath)
  }

  closeAll(): void {
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
      const transcript = new Transcript(projectPath, saved)
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
      this.emit(sessionId, event)
    }
    const configuration = this.commandObserver?.configuration()
    const session = new LiveSession({
      sessionId, cwd, resume, fork, options, transcript, emit, onCommands: this.commandObserver?.publisher(cwd),
      onClosed: (closed) => {
        // 迟到的旧实例退出事件不能删除已经替换它的新实例。
        if (this.live.get(sessionId) !== closed) return
        this.live.delete(sessionId)
        this.seen.delete(sessionId)
      }
    })
    if (configuration !== undefined) this.commandConfigurations.set(session, configuration)
    this.live.set(sessionId, session)
    void session.start()
    return session
  }

  /** 同时运行的进程太多时，关掉最久没用的空闲会话 */
  private evictIfFull(): void {
    if (this.live.size < MAX_LIVE) return
    const idle = [...this.live].filter(([, s]) => s.state === 'idle' && !s.hasBackgroundWork).sort((a, b) => a[1].lastActive - b[1].lastActive)
    const victim = idle[0]
    if (victim) this.closeSession(victim[0])
  }

  private closeIdle(): void {
    const now = Date.now()
    for (const [id, s] of this.live) if (s.state === 'idle' && !s.hasBackgroundWork && now - s.lastActive > IDLE_MS) this.closeSession(id)
  }

  private closeSession(id: string): void {
    const session = this.live.get(id)
    this.live.delete(id)
    session?.close()
    this.seen.delete(id) // 进程刚写完文件，下次检查时重新记基准
  }
}
