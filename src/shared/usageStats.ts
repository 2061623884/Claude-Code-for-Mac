// 会话和每轮的 token 用量汇总。纯函数。
import type { TokenUsage, UiMessage } from './chat'

export const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** 汇总一组消息（含子代理）的用量 */
export function sumUsage(messages: UiMessage[]): TokenUsage {
  const total = { ...ZERO_USAGE }
  for (const m of messages) {
    if (!m.usage) continue
    total.input += m.usage.input
    total.output += m.usage.output
    total.cacheRead += m.usage.cacheRead
    total.cacheWrite += m.usage.cacheWrite
  }
  return total
}

export function totalTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite
}

/** 缓存命中率（读缓存占全部输入的比例），没有输入时为 null */
export function cacheHitPercent(u: TokenUsage): number | null {
  const input = u.input + u.cacheRead + u.cacheWrite
  return input > 0 ? Math.round((u.cacheRead / input) * 100) : null
}
