// 应用自己的数据：项目列表、归档标记、设置。只由主进程读写，写入用临时文件 + rename 保证原子性。
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { emptyOrganization, type SessionOrganization } from '../shared/sessionOrganization'
import type { Project, Settings } from '../shared/types'

interface StoreData {
  version: 1
  organization: SessionOrganization
  projects: Project[]
  archived: Record<string, true>
  settings: Settings
  seededFromHistory: boolean
}

const DEFAULTS: StoreData = {
  version: 1,
  organization: emptyOrganization(),
  projects: [],
  archived: {},
  settings: { theme: 'system', defaultModel: 'opus', defaultPermissionMode: 'default', defaultEffort: 'medium', claudePath: null, allowBypass: false },
  seededFromHistory: false
}

let data: StoreData | undefined

function file(): string {
  return join(app.getPath('userData'), 'claude-desk.json')
}

export function read(): StoreData {
  if (!data) {
    const loaded = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf-8')) as Partial<StoreData>) : {}
    const settings = { ...DEFAULTS.settings, ...loaded.settings }
    // 早期版本用 null 表示"默认"，现在统一换成明确的模型和思考程度
    settings.defaultModel ??= DEFAULTS.settings.defaultModel
    settings.defaultEffort ??= DEFAULTS.settings.defaultEffort
    data = { ...DEFAULTS, ...loaded, settings, organization: loaded.organization ?? emptyOrganization() }
  }
  return data
}

export function update(fn: (draft: StoreData) => void): StoreData {
  const draft = structuredClone(read())
  fn(draft)
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(draft, null, 2))
  renameSync(tmp, file())
  data = draft
  return draft
}
