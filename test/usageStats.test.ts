import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../src/shared/chat'
import { cacheHitPercent, sumUsage, totalTokens } from '../src/shared/usageStats'

const u = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({ input, output, cacheRead, cacheWrite })
const msg = (role: UiMessage['role'], usage?: UiMessage['usage'], parentToolUseId: string | null = null): UiMessage => ({
  id: Math.random().toString(36),
  role,
  blocks: [],
  parentToolUseId,
  usage
})

describe('sumUsage', () => {
  it('汇总用量（含子代理消息），计算缓存命中率', () => {
    const total = sumUsage([msg('assistant', u(10, 5, 80, 10)), msg('assistant', u(0, 5, 100, 0), 'tool-1'), msg('user')])
    expect(total).toEqual(u(10, 10, 180, 10))
    expect(totalTokens(total)).toBe(210)
    expect(cacheHitPercent(total)).toBe(90)
    expect(cacheHitPercent(u(0, 0, 0, 0))).toBeNull()
  })
})
