import { expect, it, vi } from 'vitest'
import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk'
vi.mock('../src/main/sdk', () => ({ withIdleQuery: vi.fn() }))
import { toContextUsage } from '../src/main/context'
it('keeps the effective window, threshold, reserve and free space separate', () => {
  const usage = toContextUsage({ totalTokens: 100_000, maxTokens: 200_000, rawMaxTokens: 200_000, percentage: 50, autoCompactThreshold: 167_000, isAutoCompactEnabled: true, categories: [
    { name: 'Messages', kind: 'used', tokens: 100_000 },
    { name: 'Reserve', kind: 'buffer', tokens: 33_000 },
    { name: 'Free', kind: 'free', tokens: 67_000 },
    { name: 'Deferred', kind: 'deferred', tokens: 50_000 }
  ] } as SDKControlGetContextUsageResponse)
  expect(usage).toEqual({ used: 100_000, max: 200_000, percent: 50, autoCompactThreshold: 167_000, autoCompactEnabled: true, buffer: 33_000, free: 67_000, parts: [{ name: 'Messages', tokens: 100_000 }] })
})
