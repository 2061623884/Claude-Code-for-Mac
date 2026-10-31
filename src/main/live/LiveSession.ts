// 一个常驻的 claude 进程，对应一个打开着的会话（流式输入模式，可随时追加消息、中断、切换模式）。
import type { CanUseTool, HookCallback, McpServerStatus, PermissionResult, PermissionUpdate, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import type { HumanSubmission } from '../humanSubmissionRepository'
import type { CommandInfo } from '../../shared/types'
import type { ApprovalRequest, BtwTurn, ChatEvent, ChatState, ContextUsage, Decision, SessionOptions } from '../../shared/chat'
import { toPermissionResult } from '../approval'
import { toContextUsage } from '../context'
import { claudeExecutable, loadSdk } from '../sdk'
import * as store from '../store'
import type { Transcript } from '../transcript'
import { TurnActivity } from './TurnActivity'
import { PushQueue } from './PushQueue'

interface Pending {
  request: ApprovalRequest
  suggestions?: PermissionUpdate[]
  resolve(result: PermissionResult): void
}

/** SDK 里没写进类型定义的接口（VS Code 插件的 /btw 用的就是它）：基于当前上下文回答，不写入会话、不调用工具 */
interface SideQuestionApi {
  askSideQuestion(
    question: string,
    options?: { history?: BtwTurn[] }
  ): Promise<{ response: string; synthetic: boolean; refusalFallback?: { content: string } } | null>
}

interface LiveSessionInit {
  sessionId: string
  cwd: string
  /** true：接着已有的会话继续；false：用 sessionId 新建会话 */
  resume: boolean
  /** 从另一个会话的某个位置分叉出来（编辑历史消息）：新会话用 sessionId */
  fork?: { from: string; at: string }
  options: SessionOptions
  transcript: Transcript
  emit(event: ChatEvent): void
  onClosed(session: LiveSession): void
  onCommands?(commands: CommandInfo[]): void
  onSubmit?(submission: HumanSubmission): void
  onConsumed?(ids: string[]): void
}

const FLUSH_MS = 50
const debug = (...args: unknown[]): void => {
  if (process.env.CLAUDE_DESK_DEBUG) console.log('[live]', ...args)
}

export class LiveSession {
  readonly activity = new TurnActivity()
  state: ChatState = 'idle'
  lastActive = Date.now()
  private pending = new Map<string, Pending>()
  private input = new PushQueue<SDKUserMessage>()
  private abort = new AbortController()
  private q: Query | null = null
  private closed = false
  private commandsChanged = false
  private outstandingInputs = new Set<string>()
  private turnInputIds = new Set<string>()
  private stopTargets: Set<string> | undefined
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private onStarted!: (q: Query) => void
  private onStartFailed!: (err: unknown) => void
  private started = new Promise<Query>((resolve, reject) => {
    this.onStarted = resolve
    this.onStartFailed = reject
  })

  constructor(private init: LiveSessionInit) {
    this.started.catch(() => {}) // 启动失败由 start() 提示，这里只防止未处理的 rejection
  }

  get approvals(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.request)
  }

  async start(): Promise<void> {
    try {
      const sdk = await loadSdk()
      if (this.closed) return
      const { sessionId, cwd, resume, fork, options } = this.init
      this.q = sdk.query({
        prompt: this.input,
        options: {
          cwd,
          ...(fork
            ? { resume: fork.from, resumeSessionAt: fork.at, forkSession: true, sessionId }
            : resume
              ? { resume: sessionId }
              : { sessionId }),
          model: options.model ?? undefined,
          permissionMode: options.mode,
          effort: options.effort ?? undefined,
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          includePartialMessages: true,
          // SDK 会话默认不返回思考文字（只有签名），界面就看不到思考过程；要求返回思考摘要
          extraArgs: { 'thinking-display': 'summarized' },
          hooks: {
            CwdChanged: [{ hooks: [this.observeDirectory] }],
            DirectoryAdded: [{ hooks: [this.observeDirectory] }]
          },
          canUseTool: this.canUseTool,
          allowDangerouslySkipPermissions: store.read().settings.allowBypass,
          pathToClaudeCodeExecutable: claudeExecutable(),
          abortController: this.abort,
          stderr: (data) => console.error('[claude]', data.trimEnd())
        }
      })
      this.onStarted(this.q)
      if (this.init.onCommands) void this.q.initializationResult().then((result) => {
        if (!this.closed && !this.commandsChanged) this.publishCommands(result.commands)
      }).catch(() => {})
      void this.pump(this.q)
    } catch (err) {
      this.onStartFailed(err)
      if (!this.closed) this.fail(err, '无法启动 Claude')
    }
  }

  get cwd(): string { return this.init.cwd }

  async commands(): Promise<CommandInfo[]> { return (await this.query()).supportedCommands() }

  async mcpStatus(): Promise<McpServerStatus[]> {
    return (await this.query()).mcpServerStatus()
  }

  async sideQuestion(question: string, history: BtwTurn[]): Promise<string | null> {
    this.lastActive = Date.now()
    const q = (await this.query()) as Query & SideQuestionApi
    const r = await q.askSideQuestion(question, { history })
    return r?.refusalFallback?.content ?? r?.response ?? null
  }

  send(text: string, uuid: string = randomUUID()): void {
    if (this.closed) throw new Error('会话已结束，请重试')
    this.lastActive = Date.now()
    const submission = { uuid, text, time: Date.now() }
    this.init.onSubmit?.(submission)
    if (this.state !== 'running' && this.state !== 'awaiting') this.activity.start()
    this.init.transcript.addUser(text, submission.uuid, submission.time)
    this.outstandingInputs.add(submission.uuid)
    this.flush()
    this.input.push({ type: 'user', uuid: submission.uuid as SDKUserMessage['uuid'], message: { role: 'user', content: text }, parent_tool_use_id: null, origin: { kind: 'human' } })
    this.setState('running')
  }

  async interrupt(): Promise<void> {
    const targets = new Set(this.outstandingInputs)
    this.stopTargets = targets
    this.activity.stop()
    this.flush()
    try { await (await this.query()).interrupt() }
    catch (error) {
      if (this.stopTargets === targets) this.stopTargets = undefined
      if (!this.closed && this.state === 'running') { this.activity.resume(); this.flush() }
      throw error
    }
  }

  async setMode(mode: SessionOptions['mode']): Promise<void> {
    await (await this.query()).setPermissionMode(mode)
  }

  async setModel(model: string | null): Promise<void> {
    await (await this.query()).setModel(model ?? undefined)
  }

  async setEffort(effort: SessionOptions['effort']): Promise<void> {
    await (await this.query()).applyFlagSettings({ effortLevel: effort })
  }

  async contextUsage(): Promise<ContextUsage | null> {
    return this.q ? toContextUsage(await this.q.getContextUsage({ detail: 'summary' })) : null
  }

  async respond(requestId: string, decision: Decision): Promise<void> {
    const p = this.pending.get(requestId)
    if (!p) return
    if (decision.type === 'planApprove') await this.setMode(decision.mode)
    if (this.closed || this.pending.get(requestId) !== p) return
    this.pending.delete(requestId)
    this.init.emit({ kind: 'approvalDone', requestId })
    p.resolve(toPermissionResult(decision, p.request.input, p.suggestions))
    this.setState(this.pending.size > 0 ? 'awaiting' : 'running')
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.onStartFailed(new Error('会话已关闭'))
    for (const [requestId, pending] of this.pending) {
      this.init.emit({ kind: 'approvalDone', requestId })
      pending.resolve({ behavior: 'deny', message: '会话已结束' })
    }
    this.pending.clear()
    this.input.end()
    this.activity.finish()
    this.init.transcript.activity.markInactive()
    this.flush()
    try {
      this.q?.close()
    } catch (error) {
      debug('close error', error)
    } finally {
      this.abort.abort()
      this.init.onClosed(this)
    }
  }

  private publishCommands(commands: CommandInfo[]): void {
    try { this.init.onCommands?.(commands) }
    catch (error) { console.error('更新命令目录失败', error) }
  }

  private async query(): Promise<Query> {
    const q = await this.started
    if (this.closed) throw new Error('会话已结束，请重试')
    return q
  }

  private fail(error: unknown, prefix = '会话出错'): void {
    this.init.emit({ kind: 'notice', text: `${prefix}：${error instanceof Error ? error.message : String(error)}` })
    this.setState('error')
    this.close()
  }

  private observeDirectory: HookCallback = async (input) => {
    if (this.closed) return {}
    if (input.hook_event_name === 'CwdChanged') this.init.transcript.activity.observeDirectory(input.new_cwd, !input.agent_id, input.agent_id ? '子 Agent 工作目录' : '会话工作目录')
    else if (input.hook_event_name === 'DirectoryAdded') this.init.transcript.activity.observeDirectory(input.directory)
    else return {}
    this.scheduleFlush()
    return {}
  }

  private canUseTool: CanUseTool = (toolName, input, options) =>
    new Promise((resolve) => {
      if (this.closed || options.signal.aborted) {
        resolve({ behavior: 'deny', message: '会话已结束' })
        return
      }
      const requestId = options.requestId ?? options.toolUseID
      const request: ApprovalRequest = {
        requestId,
        toolName,
        input,
        canAlwaysAllow: !options.suppressAlwaysAllowRule && (options.suggestions?.length ?? 0) > 0,
        reason: options.decisionReason
      }
      this.pending.set(requestId, { request, suggestions: options.suggestions, resolve })
      this.flush()
      this.init.emit({ kind: 'approval', request })
      this.setState('awaiting')
      options.signal.addEventListener('abort', () => {
        if (!this.pending.delete(requestId)) return
        this.init.emit({ kind: 'approvalDone', requestId })
        resolve({ behavior: 'deny', message: '已取消' })
      })
    })

  private async pump(q: Query): Promise<void> {
    debug('pump start', this.init.sessionId)
    try {
      for await (const m of q) {
        if (this.closed) break
        debug('msg', m.type, 'subtype' in m ? m.subtype : '')
        this.handle(m)
      }
      debug('pump end')
      if (!this.closed && (this.state === 'running' || this.state === 'awaiting')) {
        this.fail(new Error('Claude 进程已退出，请重试'))
      }
    } catch (err) {
      debug('pump error', err)
      if (!this.closed) this.fail(err)
    } finally {
      // 即便 SDK 正常结束迭代，也不能继续向没有消费者的队列发送消息。
      this.close()
    }
  }

  private handle(m: SDKMessage): void {
    this.lastActive = Date.now()
    if (m.type === 'system' && m.subtype === 'commands_changed') { this.commandsChanged = true; this.publishCommands(m.commands) }
    this.activity.apply(m)
    this.init.transcript.apply(m, 'live')
    this.activity.locate(this.init.transcript.messages, m)
    if (m.type === 'assistant' && !m.parent_tool_use_id) {
      const ids = [...(m.user_message_uuids ?? []), ...(m.user_message_uuid ? [m.user_message_uuid] : [])]
      for (const id of ids) this.turnInputIds.add(id)
      if (ids.length) this.init.onConsumed?.(ids)
    }
    this.scheduleFlush()
    if (m.type === 'result') {
      this.flush()
      const ids = [...new Set([...this.turnInputIds, ...(m.user_message_uuids ?? []), ...(m.user_message_uuid ? [m.user_message_uuid] : [])])]
      this.turnInputIds.clear()
      const userStopped = (m.terminal_reason === 'aborted_streaming' || m.terminal_reason === 'aborted_tools') && ids.some(id => this.stopTargets?.has(id))
      const errors = m.subtype === 'success' ? (m.is_error && m.result ? [m.result] : []) : (m.errors ?? [])
      const failed = m.subtype !== 'success' || m.is_error
      const error = failed
        ? [userStopped ? '已按用户请求停止' : `运行结束：${m.subtype}`, ...errors, ...(m.terminal_reason ? [`结束原因：${m.terminal_reason}`] : [])].join('\n')
        : null
      this.stopTargets = undefined
      for (const id of ids) this.outstandingInputs.delete(id)
      if (m.queued_turn_count === 0) this.outstandingInputs.clear()
      this.init.emit({ kind: 'result', resultId: m.uuid, durationMs: m.duration_ms, error, diagnostic: { subtype: m.subtype, errors, terminalReason: m.terminal_reason, userMessageIds: ids, userStopped } })
      if ((m.queued_turn_count ?? 0) > 0) { this.activity.start(); this.setState('running') }
      else this.setState(this.pending.size > 0 ? 'awaiting' : 'idle')
    }
  }

  private setState(state: ChatState): void {
    if (state === 'idle' || state === 'error') { this.activity.finish(); this.flush() }
    if (state === this.state) return
    this.state = state
    this.init.emit({ kind: 'state', state })
  }

  private scheduleFlush(): void {
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS)
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    const activity = this.activity.takeChanged()
    if (activity) this.init.emit({ kind: 'activity', activity })
    const summary = this.init.transcript.activity.takeChanged()
    if (summary) this.init.emit({ kind: 'summary', summary })
    const messages = this.init.transcript.takeChanged()
    // 深拷贝一份再发，避免后续流式修改影响已发出的数据
    if (messages.length) this.init.emit({ kind: 'upsert', messages: structuredClone(messages) })
  }
}
