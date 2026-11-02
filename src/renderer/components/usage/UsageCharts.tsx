import { useState, type ReactNode } from 'react'
import { UsageIcon } from './UsageIcon'
import { chartDays, chartWeeks, dateKey, parseDay, shiftDay, type DailyUsage, formatUsageTokens, usageInRange } from '@shared/usageAnalytics'

const COLORS = ['var(--chip)', '#ffd0b7', '#ffab80', '#ee7845', '#bd471b']
type Selection = { start: string; end: string }
export function UsageCharts({ days }: { days: DailyUsage[] }) {
  const [mode, setMode] = useState<'daily' | 'weekly' | 'total'>('daily')
  const [selection, setSelection] = useState<Selection | null>(null)
  const today = dateKey(new Date()), start = shiftDay(today, -364)
  const points = chartDays(days, start, today), weeks = chartWeeks(points)
  const cumulative = new Map(points.map(p => [p.date, p.cumulative]))
  const offset = (parseDay(start).getDay() + 6) % 7
  const columns = weeks.length
  const maxDay = Math.max(1, ...points.map(p => p.total))
  const values = weeks.map(w => mode === 'total' ? cumulative.get(w.end) ?? 0 : w.total)
  const max = Math.max(1, ...values)
  const firstDate = days[0]?.date ?? today
  const range = selection ?? (mode === 'daily' ? { start: today, end: today } : { start: mode === 'total' ? firstDate : weeks.at(-1)!.start, end: today })
  const detail = usageInRange(days, range.start, range.end)
  const dateLabel = (date: string): string => { const d = parseDay(date); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` }
  const heading = mode === 'daily' ? dateLabel(range.end) : `${dateLabel(range.start)} 至 ${dateLabel(range.end)}`
  const activate = (start: string, end: string) => ({ onMouseEnter: () => setSelection({ start, end }), onFocus: () => setSelection({ start, end }) })
  return <section className="mt-9" aria-label="Token 活动">
    <div className="mb-5 flex items-center gap-3">
      <h2 className="mr-auto font-serif text-[20px] font-normal">Token 活动</h2>
      <div className="flex gap-1" role="group" aria-label="统计视图">
        {([['daily', '每天'], ['weekly', '每周'], ['total', '累计']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setSelection(null) }} className={`rounded-md px-2 py-1 text-[12px] ${mode === value ? 'bg-chip text-fg' : 'text-fg3 hover:text-fg'}`}>{label}</button>)}
      </div>
    </div>
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[710px]">
        <div role="group" aria-label={mode === 'daily' ? '每日 Token 热力图' : mode === 'weekly' ? '每周 Token 方格图' : '累计 Token 方格图'} className="grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...(mode === 'daily' ? { gridTemplateRows: 'repeat(7, 12px)' } : {}) }}>
          {mode === 'daily' ? points.map((p, i) => {
            const level = p.total ? Math.max(1, Math.ceil(p.total / maxDay * 4)) : 0
            return <button key={p.date} type="button" aria-label={`${p.date} · ${p.total.toLocaleString()} Token`} {...activate(p.date, p.date)} className="rounded-[3px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" style={{ gridColumn: Math.floor((i + offset) / 7) + 1, gridRow: (i + offset) % 7 + 1, background: COLORS[level] }} />
          }) : weeks.map((w, i) => {
            const value = values[i], filled = value ? Math.max(1, Math.ceil(value / max * 7)) : 0
            const heading = mode === 'total' ? `累计至 ${w.end}` : `${w.start} 至 ${w.end}`
            return <button key={w.start} type="button" aria-label={`${heading} · ${value.toLocaleString()} Token`} {...activate(mode === 'total' ? firstDate : w.start, w.end)} className="grid gap-[4px] rounded-[3px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent" style={{ gridTemplateRows: 'repeat(7, 12px)' }}>
              {Array.from({ length: 7 }, (_, row) => <span key={row} className="rounded-[3px]" style={{ background: row >= 7 - filled ? '#ee7845' : 'var(--chip)' }} />)}
            </button>
          })}
        </div>
        <div className="mt-2 grid text-[11px] text-fg3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {points.filter((p, i) => i === 0 || p.date.endsWith('-01') && i > 10).map(p => { const index = points.findIndex(d => d.date === p.date); return <span key={p.date} className="whitespace-nowrap" style={{ gridColumn: Math.floor((index + offset) / 7) + 1, justifySelf: index > points.length - 14 ? 'end' : 'start' }}>{Number(p.date.slice(5, 7))}月</span> })}
        </div>
      </div>
    </div>
    <div aria-label="用量明细" className="mt-5 rounded-2xl border border-line bg-bg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <span className="font-serif text-[17px] leading-relaxed" data-usage-range>{heading}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6">
        <Metric label="累计 Token" value={formatUsageTokens(detail.total)} icon={<UsageIcon kind="total" />} />
        <Metric label="缓存命中率" value={rate(detail.hitRate)} icon={<UsageIcon kind="cacheHit" />} />
        <Metric label="输入" value={formatUsageTokens(detail.input)} icon={<UsageIcon kind="input" />} />
        <Metric label="输出" value={formatUsageTokens(detail.output)} icon={<UsageIcon kind="output" />} />
        <Metric label="缓存读取" value={formatUsageTokens(detail.cacheRead)} icon={<UsageIcon kind="cacheRead" />} />
        <Metric label="缓存写入" value={formatUsageTokens(detail.cacheWrite)} icon={<UsageIcon kind="cacheWrite" />} />
      </div>
    </div>
  </section>
}
function rate(value: number | null): string { return value === null ? '—' : `${value}%` }
function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div data-usage-metric={label}><div className="flex items-center gap-2 text-[13px] text-fg2"><span className="flex size-[26px] shrink-0 items-center justify-center">{icon}</span><span>{label}</span></div><div className="mt-2 font-serif text-[25px] font-normal leading-tight tabular-nums">{value}</div></div>
}
