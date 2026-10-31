// 模型列表、订阅类型、斜杠命令等元信息：启动一个不发消息的会话读取初始化结果，不消耗额度。
import { homedir } from 'node:os'
import type { MetaInfo } from '../shared/types'
import { readMetadata } from './metadataQuery'

/** 失败时清掉缓存，下次重试 */
function cached<T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let p = map.get(key)
  if (!p) {
    p = load().catch((err) => {
      map.delete(key)
      throw err
    })
    map.set(key, p)
  }
  return p
}

const metaCache = new Map<string, Promise<MetaInfo>>()

export function get(): Promise<MetaInfo> {
  return cached(metaCache, '', async () => {
    const init = await readMetadata(homedir())
    return {
      // 只列出别名（opus / sonnet / haiku …），不列"默认"和具体版本号
      models: init.models
        .filter((m) => m.value !== 'default' && !m.value.startsWith('claude-'))
        .map((m) => ({
          value: m.value,
          label: m.displayName,
          efforts: m.supportsEffort ? (m.supportedEffortLevels ?? []) : []
        })),
      subscriptionType: init.account?.subscriptionType ?? null,
      claudeVersion: init.claude_code_version ?? null
    }
  })
}
