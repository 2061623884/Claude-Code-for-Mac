import { useRef, useState } from 'react'
import { Database } from 'lucide-react'
import type { TokenUsage } from '@shared/chat'
import { formatTokens } from '@shared/format'
import { cacheHitPercent, totalTokens } from '@shared/usageStats'
import { useDismiss } from '../../hooks/useDismiss'

/** token 用量明细：输入、缓存读写、输出、缓存命中率 */
export function UsageDetails({ usage, title }: { usage: TokenUsage; title: string }) {
  const hit = cacheHitPercent(usage)
  const rows: [string, string][] = [
    ['输入（未命中缓存）', usage.input.toLocaleString('en-US')],
    ['缓存读取', usage.cacheRead.toLocaleString('en-US')],
    ['缓存写入', usage.cacheWrite.toLocaleString('en-US')],
    ['输出', usage.output.toLocaleString('en-US')]
  ]
  if (hit !== null) rows.push(['缓存命中率', `${hit}%`])
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{title}</span>
        <span className="text-[12px] text-fg3 tabular-nums">{totalTokens(usage).toLocaleString('en-US')} tokens</span>
      </div>
      <dl className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-[12.5px]">
        {rows.map(([label, value], i) => (
          <div key={label} className="animate-fade-up flex justify-between gap-4" style={{ animationDelay: `${i * 25}ms` }}>
            <dt className="text-fg2">{label}</dt>
            <dd className="text-fg3 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-fg3">累计输入、输出及缓存用量。同一段上下文可能被多次计入，不用于判断自动压缩阈值。</p>
    </div>
  )
}

/** 用量小标签，点开在上方弹出明细；Esc 或点外面关闭 */
export function UsagePill({ usage, title, align = 'right' }: { usage: TokenUsage; title: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useDismiss(box, open, () => setOpen(false))

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen(!open)}
        className={`flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-[12px] text-fg3 tabular-nums transition-colors hover:bg-hover hover:text-fg2 ${
          open ? 'bg-hover text-fg2' : ''
        }`}
      >
        <Database size={12} />
        <span>累计</span>
        {formatTokens(totalTokens(usage))}
      </button>
      {open && (
        <div className={`absolute bottom-full z-30 pb-2 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div
            className={`animate-pop-in w-[260px] rounded-xl border border-line bg-card p-3.5 shadow-pop ${
              align === 'right' ? '' : '[transform-origin:bottom_left]'
            }`}
          >
            <UsageDetails usage={usage} title={title} />
          </div>
        </div>
      )}
    </div>
  )
}
