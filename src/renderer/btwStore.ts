// 每个侧栏聊天页独立保存问答；仅在内存中，不写入主会话。
import { create } from 'zustand'
import type { BtwTurn, SessionOptions } from '@shared/chat'
import { errorText } from './ipcError'

export interface BtwItem {
  id: number
  question: string
  answer?: string
  error?: string
}

interface BtwStore {
  threads: Record<string, BtwItem[]>
  drafts: Record<string, string>
  setDraft(pageId: string, text: string): void
  remove(pageId: string): void
  ask(pageId: string, sessionId: string, projectPath: string, question: string, options: SessionOptions): Promise<void>
  clear(pageId: string): void
}

let nextId = 1

export const useBtw = create<BtwStore>((set, get) => {
  const update = (pageId: string, id: number, patch: Partial<BtwItem>): void => {
    const thread = get().threads[pageId]
    if (!thread?.some((item) => item.id === id)) return
    set({ threads: { ...get().threads, [pageId]: thread.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })
  }

  return {
    threads: {},
    drafts: {},
    setDraft(pageId, text) { set({ drafts: { ...get().drafts, [pageId]: text } }) },
    remove(pageId) {
      const threads = { ...get().threads }, drafts = { ...get().drafts }
      delete threads[pageId]; delete drafts[pageId]
      set({ threads, drafts })
    },

    async ask(pageId, sessionId, projectPath, question, options) {
      const thread = get().threads[pageId] ?? []
      // 之前答过的问题一起带上，方便追问
      const history: BtwTurn[] = thread.flatMap((x) => (x.answer ? [{ question: x.question, response: x.answer }] : []))
      const item: BtwItem = { id: nextId++, question }
      set({ threads: { ...get().threads, [pageId]: [...thread, item] } })
      try {
        const answer = await window.desk.chat.btw(sessionId, projectPath, question, history, options)
        update(pageId, item.id, answer ? { answer } : { error: '没有得到回答' })
      } catch (err) {
        update(pageId, item.id, { error: errorText(err) })
      }
    },

    clear(pageId) {
      set({ threads: { ...get().threads, [pageId]: [] } })
    }
  }
})
