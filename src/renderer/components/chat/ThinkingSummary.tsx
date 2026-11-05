import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ChatActivity, ChatState } from '@shared/chat'
import { toolNameZh } from '@shared/format'

export function activityLabel(state: ChatState, activity?: ChatActivity): string {
  if (state === 'awaiting') return '等待你确认'
  if (activity?.phase === 'stopping') return '正在停止…'
  if (activity?.phase === 'thinking') return '正在思考…'
  if (activity?.phase === 'responding') return '正在生成回复…'
  if (activity?.phase === 'tool' && activity.toolName) {
    if (activity.toolName === 'Agent' || activity.toolName === 'Task') return '正在调用子 Agent…'
    return `正在${activity.toolName.startsWith('mcp__') ? '调用 ' : ''}${toolNameZh(activity.toolName)}…`
  }
  return 'Claude 正在工作…'
}

/** 单个思考块的摘要。折叠预览跟随最新三行，展开后由用户控制滚动。 */
export function ThinkingSummary({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const id = useId()
  const hasText = Boolean(text.trim())
  const visible = hasText && (streaming || expanded || preview)
  useLayoutEffect(() => { if (streaming && hasText) setPreview(true) }, [streaming, hasText])
  useLayoutEffect(() => {
    if (body.current && (!expanded || follow.current)) body.current.scrollTop = body.current.scrollHeight
  }, [text, expanded, visible])
  if (!hasText) return null
  return <section aria-label="思考摘要" className="my-3 text-fg2" data-thinking-summary>
    <button type="button" aria-label={expanded ? '收起思考摘要' : '展开思考摘要'} aria-expanded={expanded} aria-controls={id} onClick={() => { setExpanded(!expanded); setPreview(false); follow.current = true }} className="flex items-center gap-1.5 py-1 text-[12.5px] text-fg2 hover:text-fg">
      <ChevronRight size={13} className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
      <span>思考摘要</span>
    </button>
    {visible && <div id={id} ref={body} tabIndex={expanded ? 0 : undefined} aria-label="思考摘要内容"
      onScroll={(event) => { if (expanded) { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 2 } }}
      className={`ml-5 whitespace-pre-wrap break-words text-[13px] leading-[21px] select-text ${expanded ? 'max-h-[252px] overflow-y-auto' : 'max-h-[63px] overflow-hidden'}`}>
      {text}
    </div>}
  </section>
}
