// 套餐用量：和终端里 /usage 看到的一样。SDK 的这个接口还标着「实验性」，以后版本可能会改名。
import { homedir } from 'node:os'
import type { SDKControlGetUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import type { PlanUsage, UsageWindow } from '../shared/types'
import { withIdleQuery } from './sdk'

type Window = { utilization: number | null; resets_at: string | null } | null | undefined

export function toPlanUsage(r: SDKControlGetUsageResponse): PlanUsage {
  const rl = r.rate_limits
  const windows: UsageWindow[] = []
  const add = (kind: UsageWindow['kind'], label: string, w: Window): void => {
    if (w && typeof w.utilization === 'number' && Number.isFinite(w.utilization)) windows.push({ kind, label, percent: w.utilization, resetsAt: w.resets_at })
  }
  if (rl) {
    add('five_hour', '5 小时内', rl.five_hour)
    add('seven_day', '本周（所有模型）', rl.seven_day)
    add('model_week', '本周（Opus）', rl.seven_day_opus)
    add('model_week', '本周（Sonnet）', rl.seven_day_sonnet)
    for (const m of rl.model_scoped ?? []) add('model_week', `本周（${m.display_name}）`, m)
  }
  return { subscriptionType: r.subscription_type, available: r.rate_limits_available, windows }
}

export function planUsage(): Promise<PlanUsage> {
  return withIdleQuery({ cwd: homedir() }, async (q) =>
    toPlanUsage(await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }))
  )
}
