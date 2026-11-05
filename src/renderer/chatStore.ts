import { parseDesktopCommand, sessionCommand } from '@shared/sessionCommand'
import { openAppPanel } from './panelStore'
import { create } from 'zustand'
import { applyChatEvent, mergeChatSnapshot, staleChatEvent, type ChatProjection } from './chatSync'
import { emptySessionSummary } from '@shared/sessionSummary'
import type { ChatEvent, ChatSnapshot, Decision, QueueAction, SessionOptions } from '@shared/chat'
import type { EffortLevel } from '@shared/types'
import { EFFORT_LEVELS } from '@shared/format'
import { useSessionMarks } from './sessionMarks'
import { useDesk } from './store'
import { defaultSessionOptions, draftSessionOptions } from './sessionOptions'
import { onProjectRemoved } from './projectLifecycle'
import { errorText } from './ipcError'
import { useShallow } from 'zustand/react/shallow'

const EFFORTS: string[] = EFFORT_LEVELS.map((e) => e.value)

export interface ChatEntry extends ChatProjection {
  firstSendUltracode?: boolean
  optionsUpdating?: boolean
  projectId: string
  loaded: boolean
}

interface ChatStore {
  chats: Record<string, ChatEntry>
  load(sessionId: string, projectId: string): Promise<void>
  reload(sessionId: string): Promise<void>
  start(text: string, title?: string, onCreated?: (sessionId: string) => void): Promise<void>
  send(sessionId: string, text: string, attachments?: string[]): Promise<void>
  queueAction(sessionId: string, action: QueueAction): Promise<void>
  edit(sessionId: string, messageId: string, text: string): Promise<void>
  interrupt(sessionId: string): Promise<void>
  setOptions(sessionId: string, patch: Partial<SessionOptions>): Promise<void>
  respond(sessionId: string, requestId: string, decision: Decision): Promise<void>
  handle(sessionId: string, event: ChatEvent): void
}

let eventRevision = 0
const completed = new Set<string>()

const desk = (): Window['desk'] => window.desk

function projectPath(projectId: string): string {
  const p = useDesk.getState().projects.find((x) => x.id === projectId)
  if (!p) throw new Error('项目不存在')
  return p.path
}

function blank(projectId: string, options = defaultSessionOptions(useDesk.getState().settings)): ChatEntry {
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

    async start(text, title, onCreated) {
      const desk$ = useDesk.getState()
      const projectId = desk$.selectedProjectId
      if (!projectId) return
      const options = draftSessionOptions(desk$)
      const sessionId = await desk().chat.start(projectPath(projectId), text, options)
      const pending = get().chats[sessionId] // 事件可能先于返回值到达
      // 状态/正文事件建立的占位记录不代表后端确认过配置。
      const confirmedOptions = pending?.sync?.fields.options ? pending.options : options
      set({ chats: { ...get().chats, [sessionId]: { ...blank(projectId, options), ...pending, firstSendUltracode: options.ultracode === true, options: confirmedOptions, projectId, loaded: true } } })
      useDesk.getState().addPendingSession(projectId, sessionId, title?.trim() || text)
      onCreated?.(sessionId)
      useDesk.getState().setView({ kind: 'session', sessionId, projectId })
    },

    async edit(sessionId, messageId, text) {
      await optionChanges.get(sessionId)
      const c = get().chats[sessionId]
      if (!c) throw new Error('找不到当前会话')
      await desk().chat.edit(sessionId, projectPath(c.projectId), messageId, text)
    },

    async queueAction(sessionId, action) {
      const c = get().chats[sessionId]
      if (c) await desk().chat.queue(sessionId, projectPath(c.projectId), action)
    },

    async send(sessionId, text, attachments) {
      await optionChanges.get(sessionId)
      const c = get().chats[sessionId]
      if (!c) return
      const parsed = parseDesktopCommand(text)
      if (parsed && attachments?.length) throw new Error('设置指令不能附带文件，请先移除附件。')
      if (parsed?.kind === 'panel') { const match = /^\/(\S+)/.exec(text.trim()); if (match) openAppPanel(match[1], ''); return }
      const control = sessionCommand(text)
      if (control) { await get().setOptions(sessionId, control); return }
      patch(sessionId, () => ({ error: null }))
      await desk().chat.send(sessionId, projectPath(c.projectId), text, c.options, ...(attachments ? [attachments] : []))
    },

    async interrupt(sessionId) {
      await desk().chat.interrupt(sessionId)
    },

    async setOptions(sessionId, next) {
      const { mode, model, effort, ultracode, workflows, fastMode } = next
      return enqueueOptions(sessionId, async () => {
        patch(sessionId, () => ({ error: null, optionsUpdating: true }))
        try {
          // IPC 只确认命令完成；实际配置统一由主进程的版本化 options 事件更新。
          if (mode !== undefined) {
            await desk().chat.setMode(sessionId, mode)
          }
          if (model !== undefined) {
            await desk().chat.setModel(sessionId, model)
          }
          if (workflows !== undefined || fastMode !== undefined || ultracode !== undefined) {
            await desk().chat.prepareControls(sessionId, projectPath(get().chats[sessionId].projectId))
          }
          if (workflows !== undefined) await desk().chat.setWorkflows(sessionId, workflows)
          if (fastMode !== undefined) await desk().chat.setFastMode(sessionId, fastMode)
          if (ultracode !== undefined) await desk().chat.setUltracode(sessionId, ultracode)
          if (effort !== undefined) {
            await desk().chat.setEffort(sessionId, effort)
          }
        } catch (error) {
          patch(sessionId, () => ({ error: `会话设置更新失败：${errorText(error)}` }))
          throw error
        } finally { patch(sessionId, () => ({ optionsUpdating: false })) }
      })
    },

    async respond(sessionId, requestId, decision) {
      return enqueueOptions(sessionId, async () => {
        try {
          await desk().chat.respond(sessionId, requestId, decision)
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
