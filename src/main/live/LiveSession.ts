// 一个常驻的 claude 进程，对应一个打开着的会话（流式输入模式，可随时追加消息、中断、切换模式）。
import type { CanUseTool, McpServerStatus, PermissionResult, PermissionUpdate, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ApprovalRequest, BtwTurn, ChatEvent, ChatState, ContextUsage, Decision, SessionOptions } from '../../shared/chat'
import { toPermissionResult } from '../approval'
import { toContextUsage } from '../context'
import { claudeExecutable, loadSdk } from '../sdk'
import * as store from '../store'
import type { Transcript } from '../transcript'
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
}

const FLUSH_MS = 50
const debug = (...args: unknown[]): void => {
  if (process.env.CLAUDE_DESK_DEBUG) console.log('[live]', ...args)
}

export class LiveSession {
  state: ChatState = 'idle'
  lastActive = Date.now()
  private pending = new Map<string, Pending>()
  private input = new PushQueue<SDKUserMessage>()
  private abort = new AbortController()
  private q: Query | null = null
  private closed = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private onStarted!: (q: Query) => void
  private onStartFailed!: (err: unknown) => void
  private started = new Promise<Query>((resolve, reject) => {
    this.onStarted = resolve
    this.onStartFailed = reject
  })

  constructor(private init: LiveSessionInit) {
    this.started.catch(() => {}) // 启动失败由 SessionManager 提示，这里只防止未处理的 rejection
  }

  get approvals(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.request)
  }

  async start(): Promise<void> {
    const sdk = await loadSdk().catch((err: unknown) => {
      this.onStartFailed(err)
      throw err
    })
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
        canUseTool: this.canUseTool,
        allowDangerouslySkipPermissions: store.read().settings.allowBypass,
        pathToClaudeCodeExecutable: claudeExecutable(),
        abortController: this.abort,
        stderr: (data) => console.error('[claude]', data.trimEnd())
      }
    })
    this.onStarted(this.q)
    void this.pump(this.q)
  }

  async mcpStatus(): Promise<McpServerStatus[]> {
    return (await this.started).mcpServerStatus()
  }

  async sideQuestion(question: string, history: BtwTurn[]): Promise<string | null> {
    this.lastActive = Date.now()
    const q = (await this.started) as Query & SideQuestionApi
    const r = await q.askSideQuestion(question, { history })
    return r?.refusalFallback?.content ?? r?.response ?? null
  }

  send(text: string): void {
    this.lastActive = Date.now()
    this.init.transcript.addUser(text)
    this.flush()
    this.input.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
    this.setState('running')
  }

  async interrupt(): Promise<void> {
    await this.q?.interrupt()
  }

  async setMode(mode: SessionOptions['mode']): Promise<void> {
    await this.q?.setPermissionMode(mode)
  }

  async setModel(model: string | null): Promise<void> {
    await this.q?.setModel(model ?? undefined)
  }

  async setEffort(effort: SessionOptions['effort']): Promise<void> {
    await this.q?.applyFlagSettings({ effortLevel: effort })
  }

  async contextUsage(): Promise<ContextUsage | null> {
    return this.q ? toContextUsage(await this.q.getContextUsage({ detail: 'summary' })) : null
  }

  respond(requestId: string, decision: Decision): void {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    this.init.emit({ kind: 'approvalDone', requestId })
    p.resolve(toPermissionResult(decision, p.request.input, p.suggestions))
    if (decision.type === 'planApprove') void this.setMode(decision.mode)
    this.setState(this.pending.size > 0 ? 'awaiting' : 'running')
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.end()
    this.q?.close()
    this.abort.abort()
  }

  private canUseTool: CanUseTool = (toolName, input, options) =>
    new Promise((resolve) => {
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
        debug('msg', m.type, 'subtype' in m ? m.subtype : '')
        this.handle(m)
      }
      debug('pump end')
    } catch (err) {
      debug('pump error', err)
      // 关闭会话时 SDK 会把上一轮的错误再抛一次，属于预期情况
      if (!this.closed) {
        this.init.emit({ kind: 'notice', text: `会话出错：${err instanceof Error ? err.message : String(err)}` })
        this.setState('error')
      }
    } finally {
      this.flush()
    }
  }

  private handle(m: SDKMessage): void {
    this.lastActive = Date.now()
    this.init.transcript.apply(m)
    this.scheduleFlush()
    if (m.type === 'result') {
      this.flush()
      const error =
        m.subtype === 'success'
          ? m.is_error
            ? m.result
            : null
          : m.subtype === 'error_during_execution'
            ? null // 用户中断
            : `运行结束：${m.subtype}`
      this.init.emit({ kind: 'result', durationMs: m.duration_ms, error })
      this.setState(this.pending.size > 0 ? 'awaiting' : 'idle')
    }
  }

  private setState(state: ChatState): void {
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
    const messages = this.init.transcript.takeChanged()
    // 深拷贝一份再发，避免后续流式修改影响已发出的数据
    if (messages.length) this.init.emit({ kind: 'upsert', messages: structuredClone(messages) })
  }
}
