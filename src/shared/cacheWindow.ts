// 提示缓存的有效期：每次请求都会续期，所以从最近一次主对话请求开始算。纯函数。
import type { UiMessage } from './chat'

const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const

/** 主对话缓存的过期时间（毫秒时间戳）；还没有请求过时为 undefined。档位取最近一次写入缓存的请求，识别不出时按 1 小时。 */
export function cacheExpiresAt(messages: UiMessage[]): number | undefined {
  let last: number | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'assistant' || m.parentToolUseId || !m.usage || m.time === undefined) continue
    last ??= m.time
    if (m.usage.cacheTtl) return last + TTL_MS[m.usage.cacheTtl]
  }
  return last === undefined ? undefined : last + TTL_MS['1h']
}

/** 剩余整分钟数，向上取整；过期后为 0 */
export function cacheMinutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000))
}
