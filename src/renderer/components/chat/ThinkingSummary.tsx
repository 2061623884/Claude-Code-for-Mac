import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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

const LINE = 21
const MINI_LINES = 4
const THUMB_MIN = 14
const FADE = 16

interface Rail { top: number; size: number }

/** 单个思考块的摘要。迷你窗口固定 4 行，带细拖动条可回看，流式时跟随最新（用户上翻后暂停跟随）；展开后完整显示全部内容。 */
export function ThinkingSummary({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState(false)
  const [rail, setRail] = useState<Rail>()
  const [edges, setEdges] = useState({ top: true, bottom: true })
  const body = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const id = useId()
  const hasText = Boolean(text.trim())
  const mini = !expanded && (streaming || preview)
  useLayoutEffect(() => { if (streaming && hasText) setPreview(true) }, [streaming, hasText])

  const measure = (): void => {
    const element = body.current
    if (!element || !mini) { setRail(undefined); return }
    const { scrollTop, scrollHeight, clientHeight } = element
    setEdges({ top: scrollTop < 1, bottom: scrollHeight - scrollTop - clientHeight < 2 })
    if (scrollHeight <= clientHeight + 1) { setRail(undefined); return }
    const size = Math.max(THUMB_MIN, clientHeight * clientHeight / scrollHeight)
    setRail({ size, top: scrollTop / (scrollHeight - clientHeight) * (clientHeight - size) })
  }
  useLayoutEffect(() => {
    if (body.current && mini && follow.current) body.current.scrollTop = body.current.scrollHeight
    measure()
  }, [text, mini])
  // 窗口宽度变化会重新换行，滑块比例随之更新
  useEffect(() => {
    const element = body.current
    if (!mini || !element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mini])

  // 拖动滑块按比例滚动；点轨道则让滑块中心跳到点击处
  const drag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const element = body.current
    if (!element || !rail || event.button !== 0) return
    event.preventDefault()
    const track = event.currentTarget.getBoundingClientRect()
    const range = element.scrollHeight - element.clientHeight
    const ratio = range / Math.max(1, element.clientHeight - rail.size)
    const onThumb = event.clientY >= track.top + rail.top && event.clientY <= track.top + rail.top + rail.size
    if (!onThumb) element.scrollTop = (event.clientY - track.top - rail.size / 2) * ratio
    const startY = event.clientY, startTop = element.scrollTop
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    const move = (e: PointerEvent): void => { element.scrollTop = startTop + (e.clientY - startY) * ratio }
    const end = (): void => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end) }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

  if (!hasText) return null
  return <section aria-label="思考摘要" className="my-3 text-fg2" data-thinking-summary>
    <button type="button" aria-label={expanded ? '收起思考摘要' : '展开思考摘要'} aria-expanded={expanded} aria-controls={id} onClick={() => { setExpanded(!expanded); follow.current = true }} className="flex items-center gap-1.5 py-1 text-[12.5px] text-fg2 hover:text-fg">
      <ChevronRight size={13} className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
      <span>思考摘要</span>
    </button>
    {(expanded || mini) && <div className="relative ml-5">
      <div id={id} ref={body} tabIndex={mini ? 0 : undefined} aria-label="思考摘要内容"
        onScroll={(event) => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 2; measure() }}
        style={mini ? { maxHeight: LINE * MINI_LINES, maskImage: edges.top && edges.bottom ? undefined : `linear-gradient(to bottom, ${edges.top ? '#000' : 'transparent'} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${edges.bottom ? '#000' : 'transparent'} 100%)` } : undefined}
        className={`whitespace-pre-wrap break-words text-[13px] leading-[21px] select-text outline-none ${mini ? 'overflow-y-auto pr-4 [scrollbar-width:none]' : ''}`}>
        {text}
      </div>
      {rail && <div aria-hidden="true" data-thinking-rail onPointerDown={drag} className="group absolute top-0 right-0 bottom-0 w-3 cursor-default">
        <div className="absolute top-0 right-[5px] bottom-0 w-[2px] rounded-full bg-line" />
        <div style={{ top: rail.top, height: rail.size }} className="absolute right-[4px] w-[4px] rounded-full bg-fg3/70 transition-[width,right,background-color] duration-150 group-hover:right-[3px] group-hover:w-[6px] group-hover:bg-fg2 motion-reduce:transition-none" />
      </div>}
    </div>}
  </section>
}
