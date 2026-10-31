import { create } from 'zustand'
import type { ChatEvent } from '@shared/chat'
import { toolNameZh } from '@shared/format'
import { useChat } from './chatStore'
import { useDesk } from './store'
import { useLayout } from './layoutStore'
export const useNotice = create<{
  notice: { sessionId: string; title: string; body: string; requestId?: string } | null
}>(() => ({ notice: null }))
const seen = new Set<string>()
const systemApprovals = new Map<string, Notification>()
export function isViewingSession(sessionId: string): boolean {
  const view = useDesk.getState().view,
    layout = useLayout.getState()
  return (
    !document.hidden &&
    document.hasFocus() &&
    view.kind === 'session' &&
    view.sessionId === sessionId &&
    Boolean(useChat.getState().chats[sessionId]?.loaded) &&
    !(layout.rightOpen && layout.expanded)
  )
}
export function openNotice(sessionId: string): void {
  void window.desk.app.focus()
  const state = useDesk.getState()
  const project = state.projects.find((p) => state.sessions[p.id]?.some((s) => s.id === sessionId))
  const projectId = project?.id ?? useChat.getState().chats[sessionId]?.projectId
  if (projectId) state.setView({ kind: 'session', sessionId, projectId })
  if (useLayout.getState().expanded) useLayout.getState().setExpanded(false)
  useNotice.setState({ notice: null })
}
export function notifyIfAway(sessionId: string, event: ChatEvent): void {
  if (event.kind === 'approvalDone') {
    const key = sessionId + ':' + event.requestId
    systemApprovals.get(key)?.close()
    systemApprovals.delete(key)
    const notice = useNotice.getState().notice
    if (notice?.sessionId === sessionId && notice.requestId === event.requestId) useNotice.setState({ notice: null })
    return
  }
  const key =
    event.kind === 'approval'
      ? `approval:${sessionId}:${event.request.requestId}`
      : event.kind === 'result' && event.eventId
        ? `result:${sessionId}:${event.eventId}`
        : null
  const text = message(event)
  if (!text || (key && seen.has(key))) return
  if (key) {
    seen.add(key)
    if (seen.size > 500) seen.delete(seen.values().next().value!)
  }
  if (isViewingSession(sessionId)) return
  const body = sessionTitle(sessionId)
  if (!document.hidden && document.hasFocus()) {
    useNotice.setState({
      notice: {
        sessionId,
        title: text,
        body,
        requestId: event.kind === 'approval' ? event.request.requestId : undefined
      }
    })
    return
  }
  try {
    const n = new Notification(text, { body, silent: false })
    if (event.kind === 'approval') systemApprovals.set(sessionId + ':' + event.request.requestId, n)
    n.onclick = () => { n.close(); openNotice(sessionId) }
  } catch {
    /* 拒绝系统通知时，侧栏未读及待确认仍保留。 */
  }
}
function message(event: ChatEvent): string | null {
  if (event.kind === 'approval') {
    const tool = event.request.toolName
    if (tool === 'AskUserQuestion') return 'Claude 有问题想问你'
    if (tool === 'ExitPlanMode') return '计划已就绪，等你审阅'
    return `Claude 想要${toolNameZh(tool)}，等你确认`
  }
  if (event.kind === 'result' && (event.completed !== false || event.error))
    return event.error ? 'Claude 运行出错' : 'Claude 已完成'
  return null
}
function sessionTitle(sessionId: string): string {
  for (const list of Object.values(useDesk.getState().sessions)) {
    const s = list.find((x) => x.id === sessionId)
    if (s) return s.title
  }
  return '会话 ' + sessionId.slice(0, 8)
}
