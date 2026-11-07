import type { Query } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { PermissionRules, TaskOutput } from '../shared/sessionControl'
import { isConfigRecord } from './claudeConfigProtocol'
import { plainTerminalText } from './backgroundTasks'

/** Undocumented SDK requests and response envelopes stay inside this adapter. */
async function request(query: Query, payload: { subtype: 'list_permission_rules' } | { subtype: 'get_task_output'; task_id: string }): Promise<unknown> {
  const bridge = query as unknown as { request?: (payload: unknown) => Promise<unknown> }
  if (typeof bridge.request !== 'function') throw new Error('当前 SDK 不支持此会话操作')
  const reply = await bridge.request(payload)
  return isConfigRecord(reply) && isConfigRecord(reply.response) ? reply.response : reply
}

const rules = z.object({
  state: z.object({
    managedOnly: z.boolean(),
    rules: z.array(z.object({ rule: z.string(), behavior: z.enum(['allow', 'ask', 'deny']), source: z.string(), editability: z.enum(['persistent', 'session', 'readonly']) })),
    errors: z.array(z.unknown()).optional()
  })
})
export async function readPermissionRules(query: Query): Promise<PermissionRules> {
  const result = rules.safeParse(await request(query, { subtype: 'list_permission_rules' }))
  if (!result.success) throw new Error('权限规则返回格式无法识别')
  if (result.data.state.errors?.length) throw new Error('存在未能加载的权限配置，请修复后刷新')
  const { managedOnly, rules: entries } = result.data.state
  return { managedOnly, rules: entries }
}

const output = z.object({ output: z.string(), truncated: z.boolean().optional() })
export async function readTaskOutput(query: Query, taskId: string): Promise<TaskOutput> {
  const result = output.safeParse(await request(query, { subtype: 'get_task_output', task_id: taskId }))
  if (!result.success) throw new Error('任务输出返回格式无法识别')
  return { output: plainTerminalText(result.data.output), truncated: result.data.truncated ?? false }
}
