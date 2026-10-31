import { create } from 'zustand'
import type { SummarySection } from '@shared/sessionSummary'
interface SummaryUiState {
  opened: Record<string, boolean>
  expanded: Record<string, Partial<Record<SummarySection, boolean>>>
  toggle(id: string): void
  toggleSection(id: string, section: SummarySection): void
}
export const useSummaryUi = create<SummaryUiState>((set) => ({
  opened: {},
  expanded: {},
  toggle: (id) => set((state) => ({ opened: { ...state.opened, [id]: !state.opened[id] } })),
  toggleSection: (id, section) => set((state) => ({ expanded: {
    ...state.expanded, [id]: { ...state.expanded[id], [section]: !state.expanded[id]?.[section] }
  } }))
}))
