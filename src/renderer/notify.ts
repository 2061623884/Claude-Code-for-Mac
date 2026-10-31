// 窗口不在前台时，Claude 需要确认或完成回复，就发一条系统通知；点通知回到对应会话。
import type { ChatEvent } from '@shared/chat'
import { toolNameZh } from '@shared/format'
import { useChat } from './chatStore'
import { useDesk } from './store'

export function notifyIfAway(sessionId: string, event: ChatEvent): void {
  if (document.hasFocus()) return
  const text = message(event)
  if (!text) return
  const n = new Notification(text.title, { body: sessionTitle(sessionId), silent: false })
  n.onclick = () => {
    void window.desk.app.focus()
    const projectId = useChat.getState().chats[sessionId]?.projectId
    if (projectId) useDesk.getState().setView({ kind: 'session', sessionId, projectId })
  }
}

function message(event: ChatEvent): { title: string } | null {
  if (event.kind === 'approval') {
    const tool = event.request.toolName
    if (tool === 'AskUserQuestion') return { title: 'Claude 有问题想问你' }
    if (tool === 'ExitPlanMode') return { title: '计划已就绪，等你审阅' }
    return { title: `Claude 想要${toolNameZh(tool)}，等你确认` }
  }
  if (event.kind === 'result') return { title: event.error ? 'Claude 运行出错' : 'Claude 已完成' }
  return null
}

function sessionTitle(sessionId: string): string {
  const { sessions } = useDesk.getState()
  for (const list of Object.values(sessions)) {
    const s = list.find((x) => x.id === sessionId)
    if (s) return s.title
  }
  return ''
}
