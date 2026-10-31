import { create } from 'zustand'
import { applyChatEvent, mergeChatSnapshot, staleChatEvent, type ChatProjection } from './chatSync'
import { emptySessionSummary } from '@shared/sessionSummary'
import type { ChatEvent, ChatSnapshot, Decision, QueueAction, SessionOptions } from '@shared/chat'
import type { EffortLevel } from '@shared/types'
import { EFFORT_LEVELS } from '@shared/format'
import { useSessionMarks } from './sessionMarks'
import { useDesk } from './store'
import { onProjectRemoved } from './projectLifecycle'
import { errorText } from './ipcError'
import { useShallow } from 'zustand/react/shallow'

const EFFORTS: string[] = EFFORT_LEVELS.map((e) => e.value)

export interface ChatEntry extends ChatProjection {
  projectId: string
  loaded: boolean
}

interface ChatStore {
  chats: Record<string, ChatEntry>
  load(sessionId: string, projectId: string): Promise<void>
  reload(sessionId: string): Promise<void>
  start(text: string, title?: string): Promise<void>
  send(sessionId: string, text: string, attachments?: string[]): Promise<void>
  queueAction(sessionId: string, action: QueueAction): Promise<void>
  /** 编辑历史上的一条用户消息：从它之前分叉出新会话并发出新内容，原会话不变 */
  edit(sessionId: string, messageId: string, text: string): Promise<void>
  interrupt(sessionId: string): Promise<void>
  setOptions(sessionId: string, patch: Partial<SessionOptions>): Promise<void>
  respond(sessionId: string, requestId: string, decision: Decision): Promise<void>
  handle(sessionId: string, event: ChatEvent): void
}

let eventRevision = 0
const completed = new Set<string>()

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

  // 新请求替代旧请求，防止较早的加载覆盖后发的重载。
  const snapshotRequests = new Map<string, object>()
  const readSnapshot = async (id: string, read: () => Promise<ChatSnapshot>, clearError = false): Promise<void> => {
    const request = {}
    snapshotRequests.set(id, request)
    const requestedAt = eventRevision
    try {
      const snapshot = await read()
      if (snapshotRequests.get(id) !== request) return
      patch(id, current => ({ ...mergeChatSnapshot(current, snapshot, requestedAt, clearError), loaded: true }))
    } finally {
      if (snapshotRequests.get(id) === request) snapshotRequests.delete(id)
    }
  }

  // 同一会话的设置按请求顺序提交；一次失败不阻塞后续修改。
  const optionChanges = new Map<string, Promise<void>>()
  const enqueueOptions = (id: string, apply: () => Promise<void>): Promise<void> => {
    const task = (optionChanges.get(id) ?? Promise.resolve()).catch(() => {}).then(apply)
    optionChanges.set(id, task)
    void task.finally(() => { if (optionChanges.get(id) === task) optionChanges.delete(id) }).catch(() => {})
    return task
  }

  return {
    chats: {},

    async load(sessionId, projectId) {
      const existing = get().chats[sessionId]
      if (existing?.loaded) {
        if (existing.projectId !== projectId) patch(sessionId, () => ({ projectId }))
        return
      }
      set({ chats: { ...get().chats, [sessionId]: { ...(existing ?? blank(projectId)), projectId } } })
      await readSnapshot(sessionId, () => desk().chat.open(sessionId, projectPath(projectId)))
    },

    async reload(sessionId) {
      const c = get().chats[sessionId]
      if (!c) return
      await readSnapshot(sessionId, () => desk().chat.reload(sessionId, projectPath(c.projectId)), true)
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
      const pending = get().chats[id]
      set({ chats: { ...get().chats, [id]: { ...blank(c.projectId, c.options), ...pending, projectId: c.projectId } } })
      await readSnapshot(id, () => desk().chat.open(id, path))
      useDesk.getState().addPendingSession(c.projectId, id, text)
      useDesk.getState().setView({ kind: 'session', sessionId: id, projectId: c.projectId })
    },

    async queueAction(sessionId, action) {
      const c = get().chats[sessionId]
      if (c) await desk().chat.queue(sessionId, projectPath(c.projectId), action)
    },

    async send(sessionId, text, attachments) {
      await optionChanges.get(sessionId)
      const c = get().chats[sessionId]
      if (!c) return
      // /model、/effort 会直接改会话设置，选择器也跟着变
      const cmd = /^\/(model|effort)\s+(\S+)\s*$/.exec(text.trim())
      const value = cmd && (cmd[2] === 'default' || cmd[2] === 'auto' ? null : cmd[2])
      if (cmd?.[1] === 'model') { await get().setOptions(sessionId, { model: value }); return }
      if (cmd?.[1] === 'effort' && (value === null || EFFORTS.includes(value as EffortLevel))) {
        await get().setOptions(sessionId, { effort: value as EffortLevel | null }); return
      }
      patch(sessionId, () => ({ error: null }))
      await desk().chat.send(sessionId, projectPath(c.projectId), text, c.options, ...(attachments ? [attachments] : []))
    },

    async interrupt(sessionId) {
      await desk().chat.interrupt(sessionId)
    },

    async setOptions(sessionId, next) {
      const { mode, model, effort } = next
      return enqueueOptions(sessionId, async () => {
        patch(sessionId, () => ({ error: null }))
        try {
          // 每个字段确认后再提交，部分失败时保留已经生效的字段。
          if (mode !== undefined) {
            await desk().chat.setMode(sessionId, mode)
            patch(sessionId, (c) => ({ options: { ...c.options, mode } }))
          }
          if (model !== undefined) {
            await desk().chat.setModel(sessionId, model)
            patch(sessionId, (c) => ({ options: { ...c.options, model } }))
          }
          if (effort !== undefined) {
            await desk().chat.setEffort(sessionId, effort)
            patch(sessionId, (c) => ({ options: { ...c.options, effort } }))
          }
        } catch (error) {
          patch(sessionId, () => ({ error: `会话设置更新失败：${errorText(error)}` }))
          throw error
        }
      })
    },

    async respond(sessionId, requestId, decision) {
      return enqueueOptions(sessionId, async () => {
        try {
          await desk().chat.respond(sessionId, requestId, decision)
          if (decision.type === 'planApprove') patch(sessionId, (c) => ({ options: { ...c.options, mode: decision.mode } }))
        } catch (error) {
          patch(sessionId, () => ({ error: `权限确认失败：${errorText(error)}` }))
          throw error
        }
      })
    },

    handle(sessionId, event) {
      if (!get().chats[sessionId]) {
        // 新会话的事件可能比 start() 的返回值先到，先占个位
        set({ chats: { ...get().chats, [sessionId]: blank('') } })
      }
      const current = get().chats[sessionId]
      if (staleChatEvent(current, event)) return
      patch(sessionId, c => applyChatEvent(c, event, ++eventRevision))
      if (event.kind === 'result') {
        const lastMessage = current.messages.at(-1)
        const completionKey = `${sessionId}:${event.resultId ?? `${lastMessage?.id ?? ''}:${current.activity?.revision ?? 0}`}`
        if (!completed.has(completionKey)) {
          completed.add(completionKey)
          useSessionMarks.getState().complete(sessionId)
        }
        if (current.projectId) void useDesk.getState().refreshSessions(current.projectId)
      }
    }
  }
})

// 移除的是项目列表项。运行中的会话仍可接收事件，重新添加目录时重新绑定。
onProjectRemoved((projectId) => useChat.setState((state) => ({
  chats: Object.fromEntries(Object.entries(state.chats).map(([id, chat]) => [id, chat.projectId === projectId ? { ...chat, projectId: '' } : chat]))
})))

export function useChatActions() {
  return useChat(useShallow(({ load, reload, send, edit, interrupt, setOptions, respond, queueAction }) => ({ load, reload, send, edit, interrupt, setOptions, respond, queueAction })))
}
