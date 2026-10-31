// 对话相关的数据结构：主进程把 SDK 消息整理成这些类型后推给界面。
import type { SessionSummaryData } from './sessionSummary'
import type { EffortLevel, PermissionMode } from './types'

export type UiBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      result?: { text: string; isError: boolean }
    }
  /** 本地斜杠命令（/context、/model…）的输出；output 为 null 表示会话记录里没保存输出 */
  | { kind: 'command'; name: string; args: string; output: string | null }

/** 一次模型请求的 token 用量 */
export interface TokenUsage {
  /** 未命中缓存的输入 */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type CommandBlock = Extract<UiBlock, { kind: 'command' }>

export interface UiMessage {
  id: string
  /** notice：系统提示（如「已中断」），以灰色小字显示 */
  role: 'user' | 'assistant' | 'notice'
  blocks: UiBlock[]
  /** 子代理内部的消息，挂在对应工具调用下 */
  parentToolUseId: string | null
  /** 助手消息的 token 用量 */
  usage?: TokenUsage
  /** 消息时间（毫秒时间戳） */
  time?: number
  /** 助手消息在会话链上的位置（最后一条组成它的 SDK 消息的 uuid） */
  uuid?: string
  /** 用户消息：编辑时从哪条链条目之后分叉；null 表示这是第一条消息 */
  forkFrom?: string | null
}

/** 仅用于当前运行状态，不写入历史摘要。revision 在主进程生命周期内递增。 */
export interface ChatActivity {
  revision: number
  phase: 'idle' | 'working' | 'thinking' | 'responding' | 'tool' | 'stopping'
  toolName?: string
  toolId?: string
}

export type ChatState = 'idle' | 'running' | 'awaiting' | 'error'

export interface SessionOptions {
  model: string | null
  mode: PermissionMode
  effort: EffortLevel | null
}

export interface ApprovalRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  /** 是否可以「始终允许」 */
  canAlwaysAllow: boolean
  reason?: string
}

export type Decision =
  | { type: 'allow' }
  | { type: 'allowAlways' }
  | { type: 'deny'; message?: string }
  | { type: 'answers'; answers: Record<string, string> }
  | { type: 'planApprove'; mode: PermissionMode }
  | { type: 'planRevise'; feedback: string }

export type ChatEvent =
  | { kind: 'activity'; activity: ChatActivity }
  | { kind: 'summary'; summary: SessionSummaryData }
  | { kind: 'upsert'; messages: UiMessage[] }
  | { kind: 'state'; state: ChatState }
  | { kind: 'approval'; request: ApprovalRequest }
  | { kind: 'approvalDone'; requestId: string }
  | { kind: 'result'; resultId?: string; durationMs: number; error: string | null }
  | { kind: 'notice'; text: string }

/** 当前上下文窗口的占用情况 */
export interface ContextUsage {
  used: number
  max: number
  percent: number
  /** 按类别拆分（系统提示词、工具、对话消息……），只含占用窗口的部分 */
  parts: { name: string; tokens: number }[]
}

export interface ChatSnapshot {
  activity?: ChatActivity
  summary?: SessionSummaryData
  messages: UiMessage[]
  state: ChatState
  approvals: ApprovalRequest[]
  live: boolean
}

/** MCP 服务器状态（/mcp） */
export interface McpStatus {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
  error?: string
  scope?: string
  tools: number
}

/** /btw 顺便问一下：一问一答，不写入主对话 */
export interface BtwTurn {
  question: string
  response: string
}
