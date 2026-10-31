// 模型列表、订阅类型、斜杠命令等元信息：启动一个不发消息的会话读取初始化结果，不消耗额度。
import { homedir } from 'node:os'
import type { SDKControlInitializeResponse } from '@anthropic-ai/claude-agent-sdk'
import type { CommandInfo, MetaInfo } from '../shared/types'
import { withIdleQuery } from './sdk'

function readInit(cwd: string): Promise<SDKControlInitializeResponse> {
  return withIdleQuery({ cwd }, (q) => q.initializationResult())
}

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
const commandCache = new Map<string, Promise<CommandInfo[]>>()

export function get(): Promise<MetaInfo> {
  return cached(metaCache, '', async () => {
    const init = await readInit(homedir())
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

/** 斜杠命令和项目有关（项目里可以有自己的命令和技能），按项目文件夹分别缓存 */
export function commands(cwd: string): Promise<CommandInfo[]> {
  return cached(commandCache, cwd, async () =>
    (await readInit(cwd)).commands.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint }))
  )
}
