// 完成通知不受前台状态影响；等待确认只在窗口不聚焦时通知。
import type { ChatEvent } from '@shared/chat'
import { toolNameZh } from '@shared/format'
import { notificationPreview } from '@shared/notificationPreview'
import { useDesk } from './store'

export function notifyIfAway(sessionId: string, event: ChatEvent): void {
  if (event.kind !== 'approval' && event.kind !== 'result') return
  if (event.kind === 'approval' && document.hasFocus()) return
  const settings = useDesk.getState().settings
  if (event.kind === 'approval' && settings?.notifyApproval === false) return
  if (event.kind === 'result' && settings?.notifyCompletion === false) return
  const text = message(sessionId, event)
  if (!text) return
  void window.desk.app.notify(text.title, text.body, settings?.notificationSound === false, sessionId)
    .catch(error => {
      console.error('[notification]', error)
      useDesk.setState({ actionError: `系统通知发送失败：${error instanceof Error ? error.message : String(error)}。请到设置 → 通知中检查。` })
    })
}

function message(sessionId: string, event: ChatEvent): { title: string; body: string } | null {
  const title = sessionTitle(sessionId)
  if (event.kind === 'approval') {
    const tool = event.request.toolName
    if (tool === 'AskUserQuestion') return { title: 'Claude 有问题想问你', body: title }
    if (tool === 'ExitPlanMode') return { title: '计划已就绪，等你审阅', body: title }
    return { title: `Claude 想要${toolNameZh(tool)}，等你确认`, body: title }
  }
  if (event.kind === 'result') {
    if (event.error) return { title: title ? `${title} · 运行出错` : 'Claude 运行出错', body: notificationPreview(event.error) }
    return { title: notificationPreview(title, 60) || '任务已完成', body: notificationPreview(event.replyPreview ?? '') || '任务已完成，点击查看回复。' }
  }
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
