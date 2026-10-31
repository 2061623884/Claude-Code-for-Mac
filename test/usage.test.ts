import { describe, expect, it } from 'vitest'
import type { SDKControlGetUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import { toPlanUsage } from '../src/main/usage'

const win = (utilization: number | null, resets_at: string | null = '2026-11-02T17:00:00Z') => ({ utilization, resets_at })

describe('toPlanUsage', () => {
  it('按 5 小时、每周、各模型每周的顺序列出有数据的窗口', () => {
    const r = {
      subscription_type: 'pro',
      rate_limits_available: true,
      rate_limits: {
        five_hour: win(85, '2026-10-30T16:30:00Z'),
        seven_day: win(14),
        seven_day_opus: null,
        seven_day_sonnet: win(null),
        model_scoped: [{ display_name: 'Fable', utilization: 3, resets_at: null }]
      }
    } as unknown as SDKControlGetUsageResponse
    expect(toPlanUsage(r)).toEqual({
      subscriptionType: 'pro',
      available: true,
      windows: [
        { label: '5 小时内', percent: 85, resetsAt: '2026-10-30T16:30:00Z' },
        { label: '本周（所有模型）', percent: 14, resetsAt: '2026-11-02T17:00:00Z' },
        { label: '本周（Fable）', percent: 3, resetsAt: null }
      ]
    })
  })

  it('API Key 等不受套餐限制的情况', () => {
    const r = { subscription_type: null, rate_limits_available: false, rate_limits: null } as unknown as SDKControlGetUsageResponse
    expect(toPlanUsage(r)).toEqual({ subscriptionType: null, available: false, windows: [] })
  })
})
