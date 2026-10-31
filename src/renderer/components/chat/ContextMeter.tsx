import { useEffect, useRef, useState } from 'react'
import type { ContextUsage } from '@shared/chat'
import { contextPartZh, formatTokens } from '@shared/format'
import { useDismiss } from '../../hooks/useDismiss'

// Anthropic 品牌色系，依次分给各个组成部分
const COLORS = ['#d97757', '#6a9bcc', '#788c5d', '#c6a27a', '#b07ab7', '#5fa8a0', '#a3a093']

const pct = (n: number, max: number): string => {
  const v = max > 0 ? (n / max) * 100 : 0
  return `${v < 10 ? Number(v.toFixed(1)) : Math.round(v)}%`
}

/** 输入框右下角的上下文占用：圆环 + 百分比，悬停或点击展开组成明细 */
export function ContextMeter({ usage }: { usage: ContextUsage }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const open = hover || pinned

  // 点击固定后，点其他地方收起
  useDismiss(box, pinned, () => setPinned(false))

  // 圆环从 0 画到当前值，之后数值变化时平滑过渡
  const [shown, setShown] = useState(0)
  const ratio = usage.max > 0 ? Math.min(usage.used / usage.max, 1) : 0
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(ratio))
    return () => cancelAnimationFrame(id)
  }, [ratio])

  const r = 6.5
  const c = 2 * Math.PI * r
  const tone = ratio >= 0.9 ? 'stroke-danger' : 'stroke-accent'

  return (
    <div ref={box} className="relative mr-1.5" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-label="上下文占用"
        aria-expanded={open}
        onClick={() => setPinned(!pinned)}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[12px] text-fg3 tabular-nums transition-colors hover:bg-hover hover:text-fg2 ${
          pinned ? 'bg-hover text-fg2' : ''
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90">
          <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-line-strong" />
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(shown * c, 0.5)} ${c}`}
            className={`${tone} transition-[stroke-dasharray] duration-300 ease-out`}
          />
        </svg>
        {usage.percent}%
      </button>

      {open && (
        // 用 padding 而不是 margin 留出间隙，鼠标移进面板时不会触发离开
        <div className="absolute right-0 bottom-full z-30 pb-2">
          <div className="animate-pop-in context-meter-pop w-[280px] rounded-xl border border-line bg-card p-3.5 shadow-pop">
            <ContextBreakdown usage={usage} />
          </div>
        </div>
      )}
    </div>
  )
}

/** 上下文占用明细：总量、彩色分段条、各组成部分和剩余空间 */
export function ContextBreakdown({ usage, title = '当前上下文' }: { usage: ContextUsage; title?: string }) {
  const free = usage.free ?? Math.max(usage.max - usage.used - (usage.buffer ?? 0), 0)
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-[12px] text-fg3 tabular-nums">{usage.percent}%</span>
      </div>
      <div className="mt-0.5 text-[12px] text-fg3 tabular-nums">
        当前已用 {formatTokens(usage.used)} tokens
      </div>
      <div className="mt-1 text-[12px] text-fg3">有效统计窗口 {formatTokens(usage.max)} tokens</div>
      <div className="mt-1 text-[12px] text-fg3">
        自动压缩：{usage.autoCompactEnabled === false ? '已关闭' : usage.autoCompactEnabled === true ? '已开启' : '状态未知'}
        {usage.autoCompactEnabled === true && <div>触发阈值：{usage.autoCompactThreshold !== undefined ? `${formatTokens(usage.autoCompactThreshold)} tokens` : '未知'}</div>}
      </div>
      <p className="mt-1 text-[11px] text-fg3">统计窗口可能受压缩设置限制，不代表模型硬上限。当前占用为估算值。</p>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-chip">
        <div className="animate-bar-grow context-meter-bar flex h-full">
          {usage.parts.map((p, i) => (
            <div
              key={p.name}
              style={{ width: pct(p.tokens, usage.max), background: COLORS[i % COLORS.length] }}
              className="h-full min-w-[2px]"
            />
          ))}
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 text-[12.5px]">
        {usage.parts.map((p, i) => (
          <li
            key={p.name}
            className="context-meter-row animate-fade-up flex items-center gap-2"
            style={{ animationDelay: `${12 + i * 18}ms` }}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-fg2">{contextPartZh(p.name)}</span>
            <span className="text-fg3 tabular-nums">{formatTokens(p.tokens)}</span>
            <span className="w-10 text-right text-fg3 tabular-nums">{pct(p.tokens, usage.max)}</span>
          </li>
        ))}
        {(usage.buffer ?? 0) > 0 && <li className="flex justify-between text-fg3"><span>压缩预留空间</span><span>{formatTokens(usage.buffer!)}</span></li>}
        <li
          className="context-meter-row animate-fade-up flex items-center gap-2 border-t border-line pt-1.5"
          style={{ animationDelay: `${12 + usage.parts.length * 18}ms` }}
        >
          <span className="size-2 shrink-0 rounded-full border border-line-strong" />
          <span className="min-w-0 flex-1 text-fg2">可用空间</span>
          <span className="text-fg3 tabular-nums">{formatTokens(free)}</span>
          <span className="w-10 text-right text-fg3 tabular-nums">{pct(free, usage.max)}</span>
        </li>
      </ul>
    </>
  )
}
