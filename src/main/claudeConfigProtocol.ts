import type { Query } from '@anthropic-ai/claude-agent-sdk'

export type ConfigRecord = Record<string, unknown>
export interface ConfigState {
  effective: ConfigRecord
  sources: { source: string; settings: ConfigRecord }[]
}

export function isConfigRecord(value: unknown): value is ConfigRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** SDK 0.3.301 未公开 getSettings；不稳定的控制协议只允许在此处适配。 */
export async function readConfigState(query: Query): Promise<ConfigState> {
  const bridge = query as unknown as { request?: (request: { subtype: 'get_settings' }) => Promise<unknown> }
  if (typeof bridge.request !== 'function') throw new Error('当前 SDK 不支持读取配置状态')
  const reply = await bridge.request({ subtype: 'get_settings' })
  const state = isConfigRecord(reply) ? reply.response : undefined
  if (!isConfigRecord(state) || !isConfigRecord(state.effective) || !Array.isArray(state.sources)) {
    throw new Error('配置状态返回格式无法识别')
  }
  if (state.errors !== undefined && (!Array.isArray(state.errors) || state.errors.length > 0)) {
    throw new Error('存在未能加载的配置文件，请修复后刷新')
  }
  const sources = state.sources.map(entry => {
    if (!isConfigRecord(entry) || typeof entry.source !== 'string' || !isConfigRecord(entry.settings)) {
      throw new Error('配置来源返回格式无法识别')
    }
    return { source: entry.source, settings: entry.settings }
  })
  return { effective: state.effective, sources }
}
