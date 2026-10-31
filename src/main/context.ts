// 上下文窗口占用。会话没在运行时，临时恢复一下读取（不发消息、不写会话文件、不耗额度），读完就关。
import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import type { ContextUsage } from '../shared/chat'
import { withIdleQuery } from './sdk'

export function toContextUsage(r: SDKControlGetContextUsageResponse): ContextUsage {
  return {
    used: r.totalTokens,
    max: r.maxTokens,
    percent: r.percentage,
    autoCompactEnabled: r.isAutoCompactEnabled,
    autoCompactThreshold: r.autoCompactThreshold,
    free: r.categories.filter(c => c.kind === 'free').reduce((sum, c) => sum + c.tokens, 0),
    buffer: r.categories.filter(c => c.kind === 'buffer').reduce((sum, c) => sum + c.tokens, 0),
    parts: r.categories.filter((c) => c.kind === 'used' && c.tokens > 0).map((c) => ({ name: c.name, tokens: c.tokens }))
  }
}

export function peekContext(sessionId: string, cwd: string, model: string | null): Promise<ContextUsage> {
  return withIdleQuery({ cwd, resume: sessionId, model: model ?? undefined }, async (q) =>
    toContextUsage(await q.getContextUsage({ detail: 'summary' }))
  )
}
