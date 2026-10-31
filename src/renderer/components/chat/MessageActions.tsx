// 消息下方的操作栏：回复的复制 / 朗读 / 更多 / 用量 / 时间，用户消息的时间 / 复制 / 编辑
import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Ellipsis, Pencil, Volume2, VolumeX } from 'lucide-react'
import type { UiMessage } from '@shared/chat'
import { formatClock, markdownToPlain } from '@shared/format'
import { sumUsage, totalTokens } from '@shared/usageStats'
import { Menu } from '../ui/Menu'
import { UsagePill } from './UsageStats'

/** 一轮回复的最终回答：最后一条带文字的助手消息（不含子代理） */
export function finalAnswer(turn: UiMessage[]): string {
  for (let i = turn.length - 1; i >= 0; i--) {
    const m = turn[i]!
    if (m.role !== 'assistant' || m.parentToolUseId) continue
    const text = m.blocks
      .filter((b) => b?.kind === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n\n')
      .trim()
    if (text) return text
  }
  return ''
}

function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])
  return [copied, (text) => void navigator.clipboard.writeText(text).then(() => setCopied(true))]
}

// 同一时间只朗读一条：记下正在朗读的是哪条，换一条或再点一次就停
let speakingKey: string | null = null
const speechListeners = new Set<() => void>()
function setSpeaking(key: string | null): void {
  speakingKey = key
  speechListeners.forEach((l) => l())
}

function useSpeech(key: string): [boolean, (text: string) => void] {
  const [, rerender] = useState(0)
  useEffect(() => {
    const l = (): void => rerender((n) => n + 1)
    speechListeners.add(l)
    return () => void speechListeners.delete(l)
  }, [])
  const speaking = speakingKey === key
  const toggle = (text: string): void => {
    speechSynthesis.cancel()
    if (speaking) return setSpeaking(null)
    const u = new SpeechSynthesisUtterance(text)
    u.lang = /[一-鿿]/.test(text) ? 'zh-CN' : 'en-US'
    u.onend = u.onerror = () => speakingKey === key && setSpeaking(null)
    setSpeaking(key)
    speechSynthesis.speak(u)
  }
  return [speaking, toggle]
}

export function ActionButton({ label, onClick, children, active }: { label: string; onClick(): void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-md transition-colors hover:bg-hover hover:text-fg ${active ? 'text-accent' : 'text-fg3'}`}
    >
      {children}
    </button>
  )
}

function Time({ ms }: { ms?: number }) {
  if (!ms) return null
  return (
    <time dateTime={new Date(ms).toISOString()} title={new Date(ms).toLocaleString('zh-CN')} className="px-1 text-[12px] text-fg3 tabular-nums">
      {formatClock(ms)}
    </time>
  )
}

/** 一轮回复结束后的操作栏 */
export function AssistantActions({ turn }: { turn: UiMessage[] }) {
  const answer = finalAnswer(turn)
  const usage = sumUsage(turn)
  const last = [...turn].reverse().find((m) => m.role === 'assistant' && !m.parentToolUseId)
  const [copied, copy] = useCopied()
  const [speaking, speak] = useSpeech(last?.id ?? '')
  if (!last) return null
  return (
    <div className="-mt-1 mb-3 flex items-center gap-0.5 text-fg3">
      {answer && (
        <>
          <ActionButton label={copied ? '已复制' : '复制'} onClick={() => copy(answer)}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </ActionButton>
          <ActionButton label={speaking ? '停止朗读' : '朗读'} active={speaking} onClick={() => speak(markdownToPlain(answer))}>
            {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </ActionButton>
          <Menu
            placement="top"
            width={180}
            trigger={({ toggle }) => (
              <ActionButton label="更多" onClick={toggle}>
                <Ellipsis size={14} />
              </ActionButton>
            )}
            items={[
              { key: 'md', label: '复制为 Markdown', onSelect: () => copy(answer) },
              { key: 'plain', label: '复制为纯文本', onSelect: () => copy(markdownToPlain(answer)) }
            ]}
          />
        </>
      )}
      {totalTokens(usage) > 0 && <UsagePill usage={usage} title="本轮用量" align="left" />}
      <Time ms={last.time} />
    </div>
  )
}

/** 用户消息下方：时间、复制、编辑（悬停时显示） */
export function UserActions({ message, text, onEdit }: { message: UiMessage; text: string; onEdit?(): void }) {
  const [copied, copy] = useCopied()
  return (
    <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
      <Time ms={message.time} />
      <ActionButton label={copied ? '已复制' : '复制'} onClick={() => copy(text)}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionButton>
      {onEdit && (
        <ActionButton label="编辑" onClick={onEdit}>
          <Pencil size={13} />
        </ActionButton>
      )}
    </div>
  )
}
