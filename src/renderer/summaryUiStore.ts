import { create } from 'zustand'
import type { SummarySection } from '@shared/sessionSummary'
interface SummaryUiState {
  opened: Record<string, boolean>
  expanded: Record<string, Partial<Record<SummarySection, boolean>>>
  /** 已经为之自动弹出过摘要面板的后台任务，同一个任务只弹一次 */
  announced: Record<string, string[]>
  toggle(id: string): void
  toggleSection(id: string, section: SummarySection): void
  /** 有新的后台任务时自动打开摘要面板；返回是否有新任务 */
  announce(id: string, taskIds: string[]): boolean
}
export const useSummaryUi = create<SummaryUiState>((set, get) => ({
  opened: {},
  expanded: {},
  announced: {},
  toggle: (id) => set((state) => ({ opened: { ...state.opened, [id]: !state.opened[id] } })),
  toggleSection: (id, section) => set((state) => ({ expanded: {
    ...state.expanded, [id]: { ...state.expanded[id], [section]: !state.expanded[id]?.[section] }
  } })),
  announce: (id, taskIds) => {
    const seen = get().announced[id] ?? []
    const fresh = taskIds.filter((taskId) => !seen.includes(taskId))
    if (!fresh.length) return false
    set((state) => ({ announced: { ...state.announced, [id]: [...seen, ...fresh] }, opened: { ...state.opened, [id]: true } }))
    return true
  }
}))
