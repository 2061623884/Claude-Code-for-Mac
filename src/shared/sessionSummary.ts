export const SUMMARY_SECTIONS = ['changes', 'sources', 'projects', 'tasks', 'agents'] as const
export type SummarySection = typeof SUMMARY_SECTIONS[number]
export type SummaryView = SummarySection | 'all'
export const SUMMARY_LABELS: Record<SummarySection, string> = {
  changes: '变更', sources: '来源', projects: '项目', tasks: '任务', agents: '子 Agent'
}
export type ActivityStatus = 'running' | 'pending' | 'completed' | 'failed' | 'stopped' | 'unknown'
export const ACTIVITY_LABELS: Record<ActivityStatus, string> = {
  running: '进行中', pending: '待办', completed: '已完成', failed: '失败', stopped: '已停止', unknown: '状态未知'
}
export interface SummaryItem {
  id: string
  title: string
  description: string
  details?: string[]
  links?: { title: string; url: string }[]
  path?: string
  url?: string
  status?: ActivityStatus
  added?: number | null
  removed?: number | null
}
export interface SessionSummaryData {
  revision: number
  historyIncomplete: boolean
  sections: Record<SummarySection, SummaryItem[]>
}
export function emptySessionSummary(): SessionSummaryData {
  return { revision: 0, historyIncomplete: false, sections: { changes: [], sources: [], projects: [], tasks: [], agents: [] } }
}
