// /btw 顺便问一下：每个会话一份问答记录，只保存在内存里，不写入会话
import { create } from 'zustand'
import type { BtwTurn, SessionOptions } from '@shared/chat'
import { errorText } from './ipcError'
import { useLayout } from './layoutStore'

export interface BtwItem {
  id: number
  question: string
  answer?: string
  error?: string
}

interface BtwStore {
  threads: Record<string, BtwItem[]>
  ask(sessionId: string, projectPath: string, question: string, options: SessionOptions): Promise<void>
  clear(sessionId: string): void
}

let nextId = 1

export const useBtw = create<BtwStore>((set, get) => {
  const update = (sessionId: string, id: number, patch: Partial<BtwItem>): void => {
    const thread = get().threads[sessionId] ?? []
    set({ threads: { ...get().threads, [sessionId]: thread.map((x) => (x.id === id ? { ...x, ...patch } : x)) } })
  }

  return {
    threads: {},

    async ask(sessionId, projectPath, question, options) {
      const thread = get().threads[sessionId] ?? []
      // 之前答过的问题一起带上，方便追问
      const history: BtwTurn[] = thread.flatMap((x) => (x.answer ? [{ question: x.question, response: x.answer }] : []))
      const item: BtwItem = { id: nextId++, question }
      set({ threads: { ...get().threads, [sessionId]: [...thread, item] } })
      useLayout.getState().openRight('btw')
      try {
        const answer = await window.desk.chat.btw(sessionId, projectPath, question, history, options)
        update(sessionId, item.id, answer ? { answer } : { error: '没有得到回答' })
      } catch (err) {
        update(sessionId, item.id, { error: errorText(err) })
      }
    },

    clear(sessionId) {
      set({ threads: { ...get().threads, [sessionId]: [] } })
    }
  }
})
