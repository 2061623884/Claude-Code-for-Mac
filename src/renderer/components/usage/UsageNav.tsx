import { QuotaCrab } from './QuotaCrab'
import { remaining } from '@shared/usageAnalytics'
import { resetTimeZh } from '@shared/format'
import { useDesk } from '../../store'
import { useUsage } from '../../usageStore'

export function UsageNav() {
  const { overview, error } = useUsage()
  const active = useDesk(s => s.view.kind === 'usage')
  const usage = overview?.usage
  const five = usage?.windows.find(w => w.kind === 'five_hour')
  const week = usage?.windows.find(w => w.kind === 'seven_day')
  const summary = !usage ? (error ? '暂不可用' : '读取中…') : !usage.available ? '额度不适用' : `5h ${five ? remaining(five.percent) + '%' : '—'} · 周 ${week ? remaining(week.percent) + '%' : '—'}`
  const title = [error ? `刷新失败，显示上次读取结果：${error}` : '剩余额度', ...[five, week].flatMap(w => w ? [`${w.label}剩余 ${remaining(w.percent)}%${w.resetsAt ? ' · ' + resetTimeZh(w.resetsAt) : ''}`] : []), overview ? `更新于 ${new Date(overview.updatedAt).toLocaleString()}` : ''].filter(Boolean).join('\n')
  return <button type="button" aria-label="剩余额度" title={title} onClick={() => useDesk.getState().setView({ kind: 'usage' })} className={`flex h-9 w-full items-center gap-1.5 rounded-lg px-2.5 text-[13px] hover:bg-hover ${active ? 'bg-active' : ''}`}>
    <QuotaCrab fiveHour={usage?.available && five ? remaining(five.percent) : null} weekly={usage?.available && week ? remaining(week.percent) : null} /><span className="shrink-0">剩余额度</span>
    <span className={`ml-auto whitespace-nowrap text-[11px] tabular-nums ${error ? 'text-danger' : 'text-fg3'}`}>{summary}{error && overview ? ' *' : ''}</span>
  </button>
}
