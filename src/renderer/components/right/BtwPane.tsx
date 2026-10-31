import { useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowUp, MessageCircleQuestion, Trash2 } from 'lucide-react'
import type { SessionOptions } from '@shared/chat'
import { useBtw, type BtwItem } from '../../btwStore'
import { IconButton } from '../sidebar/SessionRow'
import { ActivityIndicator } from '../ui/ActivityIndicator'
import { Markdown } from '../chat/Markdown'

const EMPTY: BtwItem[] = []

/** 右栏「顺便问一下」（/btw）：基于当前对话的上下文回答，不写入对话、不调用工具 */
export function BtwPane({ pageId, sessionId, cwd, options, active }: { pageId: string; sessionId: string; cwd?: string; options: SessionOptions; active: boolean }) {
  const thread = useBtw((s) => s.threads[pageId] ?? EMPTY)
  const { ask, clear } = useBtw()
  const text = useBtw((s) => s.drafts[pageId] ?? '')
  const setText = (text: string): void => useBtw.getState().setDraft(pageId, text)
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pending = thread.some((x) => !x.answer && !x.error)

  // 切到这个标签时把焦点放进输入框（等展开动画开始后）
  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => input.current?.focus(), 120)
    return () => clearTimeout(id)
  }, [active, sessionId])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread])

  const submit = (): void => {
    const q = text.trim()
    if (!q || !cwd || pending) return
    setText('')
    void ask(pageId, sessionId, cwd, q, options)
  }

  return (
    <div className="flex h-full flex-col">
      {thread.length > 0 && (
        <div className="flex items-center justify-end gap-2 px-4 pb-1">
          <IconButton label="清空" onClick={() => clear(pageId)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      )}

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {active && thread.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8">
            <button
              type="button"
              aria-label="向我提问"
              onClick={() => input.current?.focus()}
              className="pointer-events-auto group flex flex-col items-center btw-intro-in"
            >
              <MessageCircleQuestion
                size={42}
                strokeWidth={1.45}
                className="text-accent transition-opacity duration-150 group-hover:opacity-70 group-focus-visible:opacity-70"
              />
              <span className="mt-3 font-serif text-[18px] leading-7 text-fg2 transition-colors group-hover:text-fg group-focus-visible:text-fg">
                向我提问
              </span>
            </button>
          </div>
        )}
        {thread.map((item) => (
          <div key={item.id} className="animate-fade-up mt-3">
            <div className="ml-auto w-fit max-w-[90%] rounded-2xl bg-chip px-3 py-2 text-[13px] whitespace-pre-wrap break-words select-text">
              {item.question}
            </div>
            <div className="mt-2 text-[13.5px]">
              {item.answer ? (
                <div className="[&_.md]:text-[13.5px]">
                  <Markdown text={item.answer} />
                </div>
              ) : item.error ? (
                <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12.5px] text-danger select-text">{item.error}</div>
              ) : (
                <ActivityIndicator label="正在回答…" active={active} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 pb-5">
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-card p-2 focus-within:border-accent/45">
          <textarea
            ref={input}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={thread.length ? '继续追问…' : '顺便问一下…'}
            className="min-h-0 flex-1 resize-none bg-transparent px-1.5 py-1 font-sans text-[14px] leading-[22px] outline-none placeholder:text-fg3"
          />
          <button
            type="button"
            aria-label="提问"
            onClick={submit}
            disabled={!text.trim() || pending}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
