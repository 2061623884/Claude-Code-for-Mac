import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// 只保存列表标记，不改变项目归属、会话内容或原列表顺序。
interface SessionMarks {
  pinned: string[]
  unread: Record<string, true>
  togglePin(id: string): void
  complete(id: string): void
  markRead(id: string): void
}

export const useSessionMarks = create<SessionMarks>()(persist((set) => ({
  pinned: [],
  unread: {},
  togglePin: (id) => set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [id, ...s.pinned] })),
  complete: (id) => set((s) => s.unread[id] ? s : { unread: { ...s.unread, [id]: true } }),
  markRead: (id) => set((s) => {
    if (!s.unread[id]) return s
    const unread = { ...s.unread }
    delete unread[id]
    return { unread }
  })
}), { name: 'claude-desk-session-marks', storage: createJSONStorage(() => window.localStorage), partialize: ({ pinned, unread }) => ({ pinned, unread }) }))
