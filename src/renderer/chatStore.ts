import { create } from 'zustand'
import { emptySessionSummary, type SessionSummaryData } from '@shared/sessionSummary'
import type { ApprovalRequest, ChatActivity, ChatEvent, ChatState, Decision, SessionOptions, UiMessage } from '@shared/chat'
import type { EffortLevel } from '@shared/types'
import { EFFORT_LEVELS } from '@shared/format'
import { useDesk } from './store'

const EFFORTS: string[] = EFFORT_LEVELS.map((e) => e.value)

export interface ChatEntry {
  live?: boolean
  activity?: ChatActivity
  /** 本地接收顺序，用于保留加载快照期间到达的正文。 */
  messageVersions?: Record<string, number>
  summary?: SessionSummaryData
  projectId: string
  messages: UiMessage[]
  state: ChatState
  approvals: ApprovalRequest[]
  loaded: boolean
  options: SessionOptions
  /** 最近一次出错的说明（如未登录、额度用尽） */
  error: string | null
}

interface ChatStore {
  chats: Record<string, ChatEntry>
  load(sessionId: string, projectId: string): Promise<void>
  reload(sessionId: string): Promise<void>
  start(text: string, title?: string): Promise<void>
  send(sessionId: string, text: string): Promise<void>
  /** 编辑历史上的一条用户消息：从它之前分叉出新会话并发出新内容，原会话不变 */
  edit(sessionId: string, messageId: string, text: string): Promise<void>
  interrupt(sessionId: string): Promise<void>
  setOptions(sessionId: string, patch: Partial<SessionOptions>): Promise<void>
  respond(sessionId: string, requestId: string, decision: Decision): Promise<void>
  handle(sessionId: string, event: ChatEvent): void
}

let messageRevision = 0

const desk = (): Window['desk'] => window.desk

function defaultOptions(): SessionOptions {
  const s = useDesk.getState().settings
  return { model: s?.defaultModel ?? null, mode: s?.defaultPermissionMode ?? 'default', effort: s?.defaultEffort ?? null }
}

function projectPath(projectId: string): string {
  const p = useDesk.getState().projects.find((x) => x.id === projectId)
  if (!p) throw new Error('项目不存在')
  return p.path
}

function blank(projectId: string, options = defaultOptions()): ChatEntry {
  return { summary: emptySessionSummary(), projectId, messages: [], state: 'idle', approvals: [], loaded: false, options, error: null }
}

export const useChat = create<ChatStore>((set, get) => {
  const patch = (sessionId: string, fn: (c: ChatEntry) => Partial<ChatEntry>): void => {
    const current = get().chats[sessionId]
    if (!current) return
    set({ chats: { ...get().chats, [sessionId]: { ...current, ...fn(current) } } })
  }

  return {
    chats: {},

    async load(sessionId, projectId) {
      const existing = get().chats[sessionId]
      if (existing?.loaded) return
      set({ chats: { ...get().chats, [sessionId]: existing ?? blank(projectId) } })
      const requestedAt = messageRevision
      const snap = await desk().chat.open(sessionId, projectPath(projectId))
      patch(sessionId, (current) => {
        const newerActivity = (current.activity?.revision ?? 0) > (snap.activity?.revision ?? 0)
        const updates = current.messages.filter((m) => (current.messageVersions?.[m.id] ?? 0) > requestedAt)
        const updated = new Map(updates.map((m) => [m.id, m]))
        const known = new Set(snap.messages.map((m) => m.id))
        return {
          ...snap,
          messages: [...snap.messages.map((m) => updated.get(m.id) ?? m), ...updates.filter((m) => !known.has(m.id))],
          state: newerActivity ? current.state : snap.state,
          activity: newerActivity ? current.activity : snap.activity,
          summary: (current.summary?.revision ?? 0) > (snap.summary?.revision ?? 0) ? current.summary : snap.summary,
          loaded: true
        }
      })
    },

    async reload(sessionId) {
      const c = get().chats[sessionId]
      if (!c) return
      const snap = await desk().chat.reload(sessionId, projectPath(c.projectId))
      patch(sessionId, () => ({ ...snap, loaded: true, error: null }))
    },

    async start(text, title) {
      const desk$ = useDesk.getState()
      const projectId = desk$.selectedProjectId
      if (!projectId) return
      const options: SessionOptions = { model: desk$.draftModel, mode: desk$.draftMode, effort: desk$.draftEffort }
      const sessionId = await desk().chat.start(projectPath(projectId), text, options)
      const pending = get().chats[sessionId] // 事件可能先于返回值到达
      set({ chats: { ...get().chats, [sessionId]: { ...blank(projectId, options), ...pending, projectId, options, loaded: true } } })
      useDesk.getState().addPendingSession(projectId, sessionId, title?.trim() || text)
      useDesk.getState().setView({ kind: 'session', sessionId, projectId })
    },

    async edit(sessionId, messageId, text) {
      const c = get().chats[sessionId]
      const msg = c?.messages.find((m) => m.id === messageId)
      if (!c || !msg || msg.forkFrom === undefined) return
      const path = projectPath(c.projectId)
      // 第一条消息没有可以分叉的位置，直接开新对话
      const id =
        msg.forkFrom === null ? await desk().chat.start(path, text, c.options) : await desk().chat.fork(path, sessionId, msg.forkFrom, text, c.options)
      const snap = await desk().chat.open(id, path)
      // 快照之前到达的事件（比如启动失败的提示）不能被覆盖掉
      const pending = get().chats[id]
      set({ chats: { ...get().chats, [id]: { ...blank(c.projectId, c.options), ...snap, error: pending?.error ?? null, loaded: true } } })
      useDesk.getState().addPendingSession(c.projectId, id, text)
      useDesk.getState().setView({ kind: 'session', sessionId: id, projectId: c.projectId })
    },

    async send(sessionId, text) {
      const c = get().chats[sessionId]
      if (!c) return
      // /model、/effort 会直接改会话设置，选择器也跟着变
      const cmd = /^\/(model|effort)\s+(\S+)\s*$/.exec(text.trim())
      const value = cmd && (cmd[2] === 'default' || cmd[2] === 'auto' ? null : cmd[2])
      if (cmd?.[1] === 'model') patch(sessionId, (x) => ({ options: { ...x.options, model: value } }))
      if (cmd?.[1] === 'effort' && (value === null || EFFORTS.includes(value as EffortLevel)))
        patch(sessionId, (x) => ({ options: { ...x.options, effort: value as EffortLevel | null } }))
      patch(sessionId, () => ({ error: null }))
      await desk().chat.send(sessionId, projectPath(c.projectId), text, c.options)
    },

    async interrupt(sessionId) {
      await desk().chat.interrupt(sessionId)
    },

    async setOptions(sessionId, next) {
      patch(sessionId, (c) => ({ options: { ...c.options, ...next } }))
      // 会话进程还没启动时，新设置会在下次发消息时生效
      if (next.mode !== undefined) await desk().chat.setMode(sessionId, next.mode)
      if (next.model !== undefined) await desk().chat.setModel(sessionId, next.model)
      if (next.effort !== undefined) await desk().chat.setEffort(sessionId, next.effort)
    },

    async respond(sessionId, requestId, decision) {
      // 批准计划后会话切换到所选权限模式，选择器也要跟着变
      if (decision.type === 'planApprove') patch(sessionId, (c) => ({ options: { ...c.options, mode: decision.mode } }))
      await desk().chat.respond(sessionId, requestId, decision)
    },

    handle(sessionId, event) {
      if (!get().chats[sessionId]) {
        // 新会话的事件可能比 start() 的返回值先到，先占个位
        set({ chats: { ...get().chats, [sessionId]: { ...blank(''), loaded: true } } })
      }
      switch (event.kind) {
        case 'connection': patch(sessionId, () => ({ live: event.live })); break
        case 'activity':
          patch(sessionId, (c) => (c.activity?.revision ?? 0) <= event.activity.revision ? { activity: event.activity } : {})
          break
        case 'summary':
          patch(sessionId, () => ({ summary: event.summary }))
          break
        case 'upsert':
          patch(sessionId, (c) => {
            const messages = [...c.messages]
            const messageVersions = { ...c.messageVersions }
            for (const m of event.messages) {
              messageVersions[m.id] = ++messageRevision
              const i = messages.findIndex((x) => x.id === m.id)
              if (i >= 0) messages[i] = m
              else messages.push(m)
            }
            return { messages, messageVersions }
          })
          break
        case 'state':
          patch(sessionId, () => ({ state: event.state }))
          break
        case 'approval':
          patch(sessionId, (c) => ({ approvals: [...c.approvals.filter(a => a.requestId !== event.request.requestId), event.request] }))
          break
        case 'approvalDone':
          patch(sessionId, (c) => ({ approvals: c.approvals.filter((a) => a.requestId !== event.requestId) }))
          break
        case 'result': {
          patch(sessionId, () => ({ error: event.error }))
          const projectId = get().chats[sessionId]?.projectId
          if (projectId) void useDesk.getState().refreshSessions(projectId)
          break
        }
        case 'notice':
          patch(sessionId, () => ({ error: event.text }))
          break
      }
    }
  }
})
